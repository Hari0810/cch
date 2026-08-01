/**
 * The approval loop — stage 6, and the only stage where a human is in the path.
 *
 * The enforcement contract is written down in `ApprovalDecisionRequest` in
 * src/lib/types.ts. This file implements it. In short:
 *
 *   - approval releases ONE action on ONE resource for ONE identity, once
 *   - first decision wins; a settled request cannot be re-decided
 *   - rejection is terminal for that request, not a retry
 *   - expiry escalates up the org chart rather than denying
 *
 * The last point is the one people push back on. A hard timeout that denies
 * turns "suspend, don't deny" into "deny, slowly" — the reviewer being at lunch
 * becomes a security decision. So an expired request is closed and a fresh one
 * is opened against the approver's manager. The access stays suspended
 * throughout; what changes is whose desk it is on.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  APPROVAL_EXPIRY_MINUTES,
  type ApprovalDecisionRequest,
  type ApprovalOutcome,
  type Employee,
  type PendingApproval,
  type Resource,
} from "@/lib/types";

type ApprovalRow = {
  id: string;
  access_event_id: string;
  approver_id: string;
  status: PendingApproval["status"];
  summary: string | null;
  created_at: string;
  expires_at: string;
  decided_at: string | null;
  decided_by: string | null;
  justification: string | null;
};

type EventRow = {
  id: string;
  identity_id: string;
  resource_id: string;
  action: PendingApproval["action"];
  occurred_at: string;
  risk_score: number | null;
  policy_reasons: string[] | null;
};

/**
 * Wall-clock is correct here and nowhere else in the engine. Scoring reads
 * `occurred_at` off the request so the demo can replay 23:40 at 16:35; but a
 * reviewer's fifteen minutes are fifteen real minutes.
 */
function nowIso(): string {
  return new Date().toISOString();
}

// ------------------------------------------------------------------ escalation

/**
 * Up the org chart. The approver's manager if they have one; otherwise the
 * person with the most direct reports, which in any real org chart is the
 * fallback you want and in this seed is the CTO. Never the approver themselves —
 * escalating to the person who already sat on it is not escalation.
 */
async function escalationContact(approverId: string): Promise<string | null> {
  const db = createAdminClient();
  const { data: approver } = await db
    .from("employee")
    .select("id, manager_id")
    .eq("id", approverId)
    .maybeSingle();

  if (approver?.manager_id) return approver.manager_id as string;

  const { data: staff } = await db
    .from("employee")
    .select("id, manager_id")
    .eq("identity_type", "human");

  const reports = new Map<string, number>();
  for (const row of (staff ?? []) as Array<{ manager_id: string | null }>) {
    if (row.manager_id) {
      reports.set(row.manager_id, (reports.get(row.manager_id) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [id, count] of reports) {
    if (id !== approverId && count > bestCount) {
      best = id;
      bestCount = count;
    }
  }
  return best;
}

// -------------------------------------------------------------------- sweep

/**
 * Close anything past its window and re-open it one level up. Called on every
 * read of the inbox, so there is no background job to fall over mid-demo.
 * Returns the ids of requests that expired on this pass.
 */
export async function sweepExpired(): Promise<string[]> {
  const db = createAdminClient();
  const now = nowIso();

  const { data } = await db
    .from("approval_request")
    .select("*")
    .eq("status", "pending")
    .lt("expires_at", now);

  const stale = (data ?? []) as ApprovalRow[];
  const expired: string[] = [];

  for (const row of stale) {
    await db
      .from("approval_request")
      .update({ status: "expired", decided_at: now })
      .eq("id", row.id)
      // Belt and braces against a concurrent approve landing between the read
      // above and this write: only expire it if it is still pending.
      .eq("status", "pending");
    expired.push(row.id);

    const next = await escalationContact(row.approver_id);
    if (!next) continue;

    // A fresh request, not a mutation of the old one. The original stays in the
    // audit trail as expired-unanswered, which is itself worth knowing.
    await db.from("approval_request").insert({
      id: `${row.id}-esc`,
      access_event_id: row.access_event_id,
      approver_id: next,
      status: "pending",
      summary: `Escalated after ${APPROVAL_EXPIRY_MINUTES} minutes without a decision. ${row.summary ?? ""}`.trim(),
      expires_at: new Date(
        Date.now() + APPROVAL_EXPIRY_MINUTES * 60_000,
      ).toISOString(),
    });
  }

  return expired;
}

// --------------------------------------------------------------------- list

/** The approver's inbox. Newest first, settled requests included for the trail. */
export async function listApprovals(limit = 12): Promise<PendingApproval[]> {
  await sweepExpired();
  const db = createAdminClient();

  const { data: rows } = await db
    .from("approval_request")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  const approvals = (rows ?? []) as ApprovalRow[];
  if (approvals.length === 0) return [];

  const { data: eventRows } = await db
    .from("access_event")
    .select("id, identity_id, resource_id, action, occurred_at, risk_score, policy_reasons")
    .in("id", approvals.map((a) => a.access_event_id));
  const events = new Map(
    ((eventRows ?? []) as EventRow[]).map((e) => [e.id, e]),
  );

  const { data: resourceRows } = await db
    .from("resource")
    .select("*")
    .in(
      "id",
      [...events.values()].map((e) => e.resource_id),
    );
  const resources = new Map(
    ((resourceRows ?? []) as Resource[]).map((r) => [r.id, r]),
  );

  const projectIds = [...resources.values()]
    .map((r) => r.project_id)
    .filter((id): id is string => Boolean(id));
  const { data: projectRows } = projectIds.length
    ? await db.from("project").select("id, name").in("id", projectIds)
    : { data: [] };
  const projects = new Map(
    ((projectRows ?? []) as Array<{ id: string; name: string }>).map((p) => [
      p.id,
      p.name,
    ]),
  );

  const { data: people } = await db.from("employee").select("*");
  const employees = new Map(
    ((people ?? []) as Employee[]).map((e) => [e.id, e]),
  );

  return approvals.flatMap((row) => {
    const event = events.get(row.access_event_id);
    if (!event) return [];
    const resource = resources.get(event.resource_id);
    if (!resource) return [];

    // The requester is the human, even when an OAuth app made the call. An
    // inbox that says "Provenance AI wants access" hides the only fact the
    // approver needs: whose credentials this is running on.
    const identity = employees.get(event.identity_id);
    const isOauth = identity?.identity_type === "oauth_app";
    const principal = isOauth && identity?.acts_for
      ? employees.get(identity.acts_for)
      : identity;

    return [
      {
        approval_request_id: row.id,
        access_event_id: row.access_event_id,
        requester_name: principal?.name ?? event.identity_id,
        via_oauth_app: isOauth ? (identity?.name ?? null) : null,
        resource_name: resource.name,
        resource_sensitivity: resource.sensitivity,
        project_name: resource.project_id
          ? (projects.get(resource.project_id) ?? null)
          : null,
        action: event.action,
        occurred_at: event.occurred_at,
        risk_score: event.risk_score ?? 0,
        summary: row.summary ?? "",
        policy_reasons: event.policy_reasons ?? [],
        created_at: row.created_at,
        expires_at: row.expires_at,
        status: row.status,
        approver_id: row.approver_id,
        approver_name: employees.get(row.approver_id)?.name ?? row.approver_id,
      } satisfies PendingApproval,
    ];
  });
}

// ------------------------------------------------------------------- decide

export type DecideResult =
  | { ok: true; outcome: ApprovalOutcome }
  | { ok: false; status: number; error: string; current?: string };

export async function decideApproval(
  input: ApprovalDecisionRequest,
): Promise<DecideResult> {
  const db = createAdminClient();

  const { data } = await db
    .from("approval_request")
    .select("*")
    .eq("id", input.approval_request_id)
    .maybeSingle();
  const row = data as ApprovalRow | null;
  if (!row) {
    return { ok: false, status: 404, error: "no such approval request" };
  }

  // First decision wins. Two reviewers clicking at once must not produce two
  // different answers to the same question, and the later one must be told it
  // lost rather than silently overwriting.
  if (row.status !== "pending") {
    return {
      ok: false,
      status: 409,
      error: "this request has already been settled",
      current: row.status,
    };
  }

  const now = nowIso();
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await sweepExpired();
    return {
      ok: false,
      status: 409,
      error: "this request expired and has been escalated",
      current: "expired",
    };
  }

  const { data: approverRow } = await db
    .from("employee")
    .select("id, name")
    .eq("id", input.approver_id)
    .maybeSingle();
  const approver = approverRow as { id: string; name: string } | null;
  if (!approver) {
    return { ok: false, status: 404, error: "no such approver" };
  }

  // The routing check, not an authentication check — see the DEMO ONLY note on
  // ApprovalDecisionRequest. It stops a request being answered by someone it was
  // never addressed to; it does not stop someone claiming to be Eva.
  if (approver.id !== row.approver_id) {
    return {
      ok: false,
      status: 403,
      error: "this request is not addressed to you",
    };
  }

  const status = input.decision === "approve" ? "approved" : "rejected";

  // Conditional on status so a decision that raced past the read above loses
  // here instead of clobbering the winner.
  const { data: updated } = await db
    .from("approval_request")
    .update({
      status,
      decided_at: now,
      decided_by: approver.id,
      justification: input.justification ?? null,
    })
    .eq("id", row.id)
    .eq("status", "pending")
    .select("id");

  if (!updated || updated.length === 0) {
    return {
      ok: false,
      status: 409,
      error: "this request was settled by someone else first",
    };
  }

  const { data: eventRow } = await db
    .from("access_event")
    .select("identity_id, resource_id, action")
    .eq("id", row.access_event_id)
    .maybeSingle();
  const event = eventRow as Pick<
    EventRow,
    "identity_id" | "resource_id" | "action"
  > | null;

  // The release is its own audit event. The original REQUIRE_APPROVAL row is
  // never rewritten — what happened at 23:40 stays what happened at 23:40, and
  // the release is a separate, later fact with a name attached.
  //
  // Nothing is written on a rejection: no access occurred, so there is no access
  // event. The refusal lives on the approval_request row, which carries who
  // refused it and why. Recording a rejection as DENY would also overload a
  // word this codebase reserves for "no permission reaches this resource".
  if (event && status === "approved") {
    await db.from("access_event").insert({
      id: `evt-rel-${row.id}`,
      identity_id: event.identity_id,
      resource_id: event.resource_id,
      action: event.action,
      occurred_at: now,
      session_type: "sso",
      // Allowed, but permanently flagged. An access that needed a human to
      // release it should never look like an ordinary read afterwards.
      decision: "ALLOW_AND_FLAG",
      risk_score: 0,
      policy_reasons: [
        `Released once by ${approver.name} against request ${row.id}`,
      ],
      reasoning: input.justification ?? null,
      is_seeded_history: false,
    });
  }

  return {
    ok: true,
    outcome: {
      approval_request_id: row.id,
      status,
      decided_at: now,
      decided_by: approver,
      justification: input.justification ?? null,
      access_released: status === "approved",
      capability:
        status === "approved" && event
          ? {
              identity_id: event.identity_id,
              resource_id: event.resource_id,
              action: event.action,
              single_use: true,
            }
          : null,
    },
  };
}
