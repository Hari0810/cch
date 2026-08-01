/**
 * The gateway. Synchronous, in the request path, before the bytes move.
 *
 *   1 policy  →  2 context  →  4 score  →  5 decide  →  audit
 *
 * (3, graph analysis, is future work — see docs/plan.md.)
 *
 * The model scores; decide() decides. Nothing in this file may branch on the
 * identity or resource involved: every outcome falls out of the data.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePermission, walkResourceChain } from "@/lib/engine/policy";
import { gatherContext } from "@/lib/engine/context";
import { scoreRisk } from "@/lib/engine/score";
import { clampScore, decide, requiresApproval } from "@/lib/engine/decide";
import {
  APPROVAL_EXPIRY_MINUTES,
  type AccessDecision,
  type Employee,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  identity_id: z.string().min(1),
  resource_id: z.string().min(1),
  action: z.enum(["view", "download", "edit", "delete"]),
  /**
   * Echoed back byte-for-byte. The UI reads the hour straight out of this
   * string; re-serialising it through Date would shift 23:40 into another
   * timezone and break the demo's central contrast silently.
   */
  occurred_at: z.string().min(1),
});

export async function POST(req: Request) {
  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const request = parsed.data;
  const db = createAdminClient();

  // ---- 1. deterministic policy. A `no` never reaches the model. -----------

  const policy = await resolvePermission(
    request.identity_id,
    request.resource_id,
    request.action,
    request.occurred_at,
  );

  const chain = await walkResourceChain(request.resource_id);
  if (chain.length === 0) {
    return NextResponse.json({ error: "unknown resource" }, { status: 404 });
  }

  // Conventional RBAC denial. NOT one of the four contextual bands, and
  // deliberately not routable to an approver: a second party must never be
  // able to grant reach that IAM never granted. Cordyceps narrows access; it
  // must never be a way to widen it.
  if (!policy.permitted) {
    const denied = await writeEvent(request, "DENY", 0, [
      "No permission grants this access",
    ]);
    return NextResponse.json(
      {
        ...(await shape(request, chain, null, {
          decision: "DENY",
          risk_score: 0,
          reasoning:
            "You do not hold a permission that reaches this resource. This is an ordinary access-control denial — it was refused before any context was evaluated, and it is not something an approver can release.",
          policy_reasons: ["No permission grants this access"],
        })),
        scored_by: "policy",
        access_event_id: denied,
      },
      { status: 200 },
    );
  }

  // ---- 2. context ---------------------------------------------------------

  const ctx = await gatherContext(request, chain);

  // ---- 4. the model scores ------------------------------------------------

  const assessment = await scoreRisk(ctx);
  const risk = clampScore(assessment.risk_score);

  // ---- 5. the rules decide ------------------------------------------------

  const decision = decide(risk);

  // ---- audit --------------------------------------------------------------

  const eventId = await writeEvent(
    request,
    decision,
    risk,
    assessment.policy_reasons,
    assessment.reasoning,
    ctx.identity.identity_type === "oauth_app" ? "oauth_token" : "sso",
  );

  let approvalId: string | null = null;
  let approver: { id: string; name: string } | null = null;

  if (requiresApproval(decision)) {
    approver = await resolveApprover(ctx.resourceProject?.owner_id ?? null);
    if (approver) {
      approvalId = `apr-${eventId}`;
      // Real wall clock here, and only here: a human is genuinely waiting.
      await db.from("approval_request").insert({
        id: approvalId,
        access_event_id: eventId,
        approver_id: approver.id,
        status: "pending",
        summary: assessment.reasoning,
        expires_at: new Date(
          Date.now() + APPROVAL_EXPIRY_MINUTES * 60_000,
        ).toISOString(),
      });
    }
  }

  const body: AccessDecision = {
    ...(await shape(request, chain, ctx, {
      decision,
      risk_score: risk,
      reasoning: assessment.reasoning,
      policy_reasons: assessment.policy_reasons,
    })),
    // Disclosed in the body, not just a header: an audit record that hides a
    // degraded scorer is worse than no audit record.
    scored_by: assessment.provider,
    permission_path: policy.path,
    approver,
    expires_in_minutes: approvalId ? APPROVAL_EXPIRY_MINUTES : null,
    access_event_id: eventId,
    approval_request_id: approvalId,
  };

  return NextResponse.json(body, {
    headers: { "x-risk-provider": assessment.provider },
  });
}

// ---------------------------------------------------------------- helpers

async function shape(
  request: z.infer<typeof RequestSchema>,
  chain: Awaited<ReturnType<typeof walkResourceChain>>,
  ctx: Awaited<ReturnType<typeof gatherContext>> | null,
  verdict: {
    decision: AccessDecision["decision"];
    risk_score: number;
    reasoning: string;
    policy_reasons: string[];
  },
): Promise<AccessDecision> {
  const resource = chain[0];
  const identity = ctx?.identity ?? (await fetchEmployee(request.identity_id));
  const isOauth = identity?.identity_type === "oauth_app";

  return {
    ...verdict,
    scored_by: "policy",
    // byte-for-byte, exactly as sent
    occurred_at: request.occurred_at,
    permission_path: [],
    context_summary: {
      identity_name: ctx?.principal?.name ?? identity?.name ?? request.identity_id,
      via_oauth_app: isOauth ? (identity?.name ?? null) : null,
      oauth_detail: isOauth
        ? {
            connected_at: identity?.connected_at ?? null,
            scope: identity?.scope ?? null,
            last_reviewed_at: identity?.last_reviewed_at ?? null,
            last_used_at: identity?.last_used_at ?? null,
          }
        : null,
      resource_name: resource.name,
      resource_sensitivity: resource.sensitivity,
      project_name: ctx?.resourceProject?.name ?? null,
      is_project_member: ctx?.isProjectMember ?? false,
      matching_task_count: ctx?.tasksOnResourceProject.length ?? 0,
      outside_working_hours: ctx?.isOutsideWorkingHours ?? false,
      first_access_to_project: ctx ? !ctx.hasEverAccessedProject : false,
    },
    approver: null,
    expires_in_minutes: null,
    access_event_id: "",
    approval_request_id: null,
  };
}

async function fetchEmployee(id: string): Promise<Employee | null> {
  const { data } = await createAdminClient()
    .from("employee")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as Employee | null) ?? null;
}

async function resolveApprover(
  ownerId: string | null,
): Promise<{ id: string; name: string } | null> {
  if (!ownerId) return null;
  const owner = await fetchEmployee(ownerId);
  return owner ? { id: owner.id, name: owner.name } : null;
}

async function writeEvent(
  request: z.infer<typeof RequestSchema>,
  decision: AccessDecision["decision"],
  risk: number,
  policyReasons: string[],
  reasoning?: string,
  sessionType: "password" | "sso" | "oauth_token" = "sso",
): Promise<string> {
  const id = `evt-${Math.random().toString(36).slice(2, 10)}-${policyReasons.length}`;
  await createAdminClient()
    .from("access_event")
    .insert({
      id,
      identity_id: request.identity_id,
      resource_id: request.resource_id,
      action: request.action,
      occurred_at: request.occurred_at,
      session_type: sessionType,
      decision,
      risk_score: risk,
      policy_reasons: policyReasons,
      reasoning: reasoning ?? null,
      is_seeded_history: false,
    });
  return id;
}
