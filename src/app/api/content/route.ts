/**
 * The enforcement point. This is where the decision stops being advisory.
 *
 * `POST /api/access` decides. Nothing consumed that decision — the bytes were
 * never in the request path, so an "access paused" overlay was a UI state and a
 * judge with a network tab open could say so. This route is the file server: it
 * holds the contents in server-only memory (src/lib/content.ts) and will not
 * put them on the wire unless the access is permitted or an approver has
 * released it.
 *
 * Two rules govern the shape of this file.
 *
 * 1. THE RELEASE LOOKUP RUNS BEFORE `scoreRisk()`. `src/lib/engine/approval.ts`
 *    already writes `evt-rel-${approval_request_id}` on approve — a scoped,
 *    single-identity/single-resource/single-action capability sitting in
 *    Postgres with no consumer. Redeeming it is one indexed select. Scoring is
 *    a ~1.5s Runware call. The preview dialog polls while suspended, so putting
 *    the model first would mean ~30 inference calls a minute on conference wifi
 *    during the demo. Cheap lookup first; the model only on a cold request, and
 *    `poll: true` skips the model entirely.
 *
 * 2. WITHHOLDING MEANS NO `content` FIELD, AT HTTP 200. Not a content field the
 *    client hides. The response body for a withheld access contains no file
 *    text of any kind.
 *
 * The withhold set is STEP_UP, REQUIRE_APPROVAL and DENY. `ALLOW_AND_FLAG`
 * PERMITS — that is the meaning of the band on the published threshold table,
 * and the release row approval writes is itself stamped `ALLOW_AND_FLAG`.
 * Withholding it would contradict our own semantics live on stage and would
 * withhold a redeemed release.
 *
 * Single use falls out of the primary key: redemption inserts
 * `evt-redeem-${releaseId}` into `access_event`, whose `id` is `text primary
 * key`, so a second redemption fails on duplicate key (23505). That is an
 * expected outcome, not a server error. No `consumed_at` column, no schema
 * change — see AGENTS.md ground rule 7.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePermission, walkResourceChain } from "@/lib/engine/policy";
import { gatherContext } from "@/lib/engine/context";
import { scoreRisk } from "@/lib/engine/score";
import { clampScore, decide, requiresApproval } from "@/lib/engine/decide";
import { fileContent } from "@/lib/content";
import { APPROVAL_EXPIRY_MINUTES, type Action, type Decision } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Postgres unique_violation. A second redemption, not a failure. */
const DUPLICATE_KEY = "23505";

const Schema = z.object({
  /**
   * Optional only because the preview dialog is mounted from the decision card,
   * which is handed an `AccessDecision` and no raw triple. When they are absent
   * the triple is read back off `access_event_id` — the same row the engine
   * wrote. Nothing is inferred and nothing is defaulted.
   */
  identity_id: z.string().min(1).optional(),
  resource_id: z.string().min(1).optional(),
  action: z.enum(["view", "download", "edit", "delete"]).optional(),
  access_event_id: z.string().min(1).optional(),
  /**
   * Echoed byte-for-byte into the audit row, exactly as `/api/access` does.
   * AGENTS.md rule 1 — the wall clock never enters this path.
   */
  occurred_at: z.string().min(1),
  /**
   * Set by the polling overlay. Checks for a release and returns; never scores.
   * This is what keeps a suspended dialog from firing the model every 2s.
   */
  poll: z.boolean().optional(),
});

type Body = z.infer<typeof Schema>;

export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const target = await resolveTarget(parsed.data);
  if (!target) {
    return NextResponse.json(
      {
        error:
          "identity_id, resource_id and action are required, or an access_event_id that carries them",
      },
      { status: 400 },
    );
  }
  const { identity_id, resource_id, action } = target;
  const occurred_at = parsed.data.occurred_at;

  const file = fileContent(resource_id);
  if (!file) {
    return NextResponse.json(
      { error: "no preview is authored for this resource", resource_id },
      { status: 404 },
    );
  }

  // ---- 1. the release, before anything expensive --------------------------

  const redeemed = await redeemRelease({
    identity_id,
    resource_id,
    action,
    occurred_at,
  });

  if (redeemed) {
    return NextResponse.json({
      released: true,
      via: "release",
      decision: "ALLOW_AND_FLAG" as Decision,
      resource_id,
      resource_name: file.name,
      content: file.body,
      redeemed_release_id: redeemed.releaseId,
      released_by: redeemed.note,
      single_use: true,
      occurred_at,
    });
  }

  // A poll asks one question — "has it been released yet?" — and must never
  // reach the scorer. Answering it costs one select.
  if (parsed.data.poll) {
    return NextResponse.json({
      released: false,
      via: "poll",
      awaiting_release: true,
      resource_id,
      resource_name: file.name,
      occurred_at,
    });
  }

  // ---- 2. cold request: the normal engine path ----------------------------
  //
  // Composed exactly as src/app/api/access/route.ts composes it. Nothing here
  // branches on which identity or which resource is involved.

  const chain = await walkResourceChain(resource_id);
  if (chain.length === 0) {
    return NextResponse.json({ error: "unknown resource" }, { status: 404 });
  }

  const policy = await resolvePermission(
    identity_id,
    resource_id,
    action,
    occurred_at,
  );

  // Conventional RBAC denial, short-circuited before the model — and NOT
  // routable to an approver. Cordyceps narrows access; it must never widen it.
  if (!policy.permitted) {
    await writeEvent({
      identity_id,
      resource_id,
      action,
      occurred_at,
      decision: "DENY",
      risk: 0,
      policyReasons: ["No permission grants this access"],
    });
    return NextResponse.json({
      released: false,
      via: "policy",
      decision: "DENY",
      withhold_reason: "denied",
      terminal: true,
      approver: null,
      approval_request_id: null,
      resource_id,
      resource_name: file.name,
      risk_score: 0,
      message:
        "No permission reaches this resource. The file was never assembled for you — this is an ordinary access-control refusal, and there is no approver who can release it.",
      occurred_at,
    });
  }

  const ctx = await gatherContext(
    { identity_id, resource_id, action, occurred_at },
    chain,
  );
  const assessment = await scoreRisk(ctx, occurred_at);
  const risk = clampScore(assessment.risk_score);
  const decision = decide(risk);

  const eventId = await writeEvent({
    identity_id,
    resource_id,
    action,
    occurred_at,
    decision,
    risk,
    policyReasons: assessment.policy_reasons,
    reasoning: assessment.reasoning,
    sessionType: ctx.identity?.identity_type === "oauth_app" ? "oauth_token" : "sso",
  });

  // ---- 3. permitted bands get the bytes -----------------------------------

  if (decision === "ALLOW" || decision === "ALLOW_AND_FLAG") {
    return NextResponse.json({
      released: true,
      via: "decision",
      decision,
      resource_id,
      resource_name: file.name,
      content: file.body,
      risk_score: risk,
      reasoning: assessment.reasoning,
      policy_reasons: assessment.policy_reasons,
      scored_by: assessment.provider,
      access_event_id: eventId,
      flagged: decision === "ALLOW_AND_FLAG",
      single_use: false,
      occurred_at,
    });
  }

  // ---- 4. withheld: no content field exists on this response --------------

  let approver: { id: string; name: string } | null = null;
  let approvalId: string | null = null;

  if (requiresApproval(decision)) {
    // Reuse a request that is already sitting in an inbox rather than stacking
    // a second row for the same access — opening the preview twice must not
    // give an approver two things to decide. Crucially, the name we show comes
    // off THAT row, not off the project owner: expiry escalates a request up
    // the org chart, so the pending row may be addressed to someone above the
    // owner and naming the owner would point the demo at the wrong inbox.
    const pending = await findPendingApproval(identity_id, resource_id, action);
    if (pending) {
      approvalId = pending.id;
      approver = await resolveApprover(pending.approver_id);
    } else {
      approver = await resolveApprover(ctx.resourceProject?.owner_id ?? null);
      if (approver) {
        approvalId = `apr-${eventId}`;
        await createAdminClient().from("approval_request").insert({
          id: approvalId,
          access_event_id: eventId,
          approver_id: approver.id,
          status: "pending",
          summary: assessment.reasoning,
          // Real wall clock here, and only here: a human is genuinely waiting.
          expires_at: new Date(
            Date.now() + APPROVAL_EXPIRY_MINUTES * 60_000,
          ).toISOString(),
        });
      }
    }
  }

  return NextResponse.json({
    released: false,
    via: "decision",
    decision,
    // The two withhold reasons are worded differently on screen, and they are
    // genuinely different facts: a refusal nobody can release, versus a pause
    // with a named human attached to it.
    withhold_reason:
      decision === "REQUIRE_APPROVAL" ? "awaiting_approval" : "step_up",
    terminal: false,
    approver,
    approval_request_id: approvalId,
    expires_in_minutes: approvalId ? APPROVAL_EXPIRY_MINUTES : null,
    resource_id,
    resource_name: file.name,
    risk_score: risk,
    reasoning: assessment.reasoning,
    policy_reasons: assessment.policy_reasons,
    scored_by: assessment.provider,
    access_event_id: eventId,
    message:
      decision === "REQUIRE_APPROVAL"
        ? approver
          ? `Held. The server has the file and is not sending it until ${approver.name} releases it.`
          : "Held. The server has the file and is not sending it."
        : "Held pending a stronger authentication factor. The bytes have not moved.",
    occurred_at,
  });
}

// ---------------------------------------------------------------- helpers

/**
 * The triple the request is about, either given directly or read off the audit
 * row the engine already wrote.
 */
async function resolveTarget(
  body: Body,
): Promise<{ identity_id: string; resource_id: string; action: Action } | null> {
  if (body.identity_id && body.resource_id && body.action) {
    return {
      identity_id: body.identity_id,
      resource_id: body.resource_id,
      action: body.action,
    };
  }
  if (!body.access_event_id) return null;

  const { data } = await createAdminClient()
    .from("access_event")
    .select("identity_id, resource_id, action")
    .eq("id", body.access_event_id)
    .maybeSingle();
  const row = data as {
    identity_id: string;
    resource_id: string;
    action: Action;
  } | null;
  return row ?? null;
}

/**
 * Find an unredeemed `evt-rel-*` capability for this exact triple and consume
 * it. Returns null when there is none, or when every one of them has already
 * been spent.
 *
 * The consumption is the insert. There is no read-then-write window to lose:
 * whoever's insert lands first owns the release, and everyone else gets 23505.
 */
async function redeemRelease(input: {
  identity_id: string;
  resource_id: string;
  action: Action;
  occurred_at: string;
}): Promise<{ releaseId: string; note: string | null } | null> {
  const db = createAdminClient();

  const { data } = await db
    .from("access_event")
    .select("id, policy_reasons")
    .eq("identity_id", input.identity_id)
    .eq("resource_id", input.resource_id)
    .eq("action", input.action)
    .like("id", "evt-rel-%")
    .order("occurred_at", { ascending: false });

  const releases = (data ?? []) as { id: string; policy_reasons: unknown }[];

  for (const release of releases) {
    const redeemId = `evt-redeem-${release.id}`;
    const note = Array.isArray(release.policy_reasons)
      ? String(release.policy_reasons[0] ?? "")
      : null;

    const { error } = await db.from("access_event").insert({
      id: redeemId,
      identity_id: input.identity_id,
      resource_id: input.resource_id,
      action: input.action,
      // Rule 1: the request's own timestamp, never the wall clock.
      occurred_at: input.occurred_at,
      session_type: "sso",
      // Released, and permanently flagged. An access a human had to release
      // must never read as an ordinary open afterwards.
      decision: "ALLOW_AND_FLAG",
      risk_score: 0,
      policy_reasons: [
        `Redeemed the single-use release ${release.id}; the file was sent once`,
      ],
      reasoning: null,
      is_seeded_history: false,
    });

    if (!error) return { releaseId: release.id, note: note || null };
    // Already spent. Try the next capability, if any; otherwise fall through
    // to the engine, which will withhold again.
    if (error.code !== DUPLICATE_KEY) throw new Error(error.message);
  }

  return null;
}

async function findPendingApproval(
  identityId: string,
  resourceId: string,
  action: Action,
): Promise<{ id: string; approver_id: string } | null> {
  const db = createAdminClient();

  const { data: events } = await db
    .from("access_event")
    .select("id")
    .eq("identity_id", identityId)
    .eq("resource_id", resourceId)
    .eq("action", action)
    .eq("decision", "REQUIRE_APPROVAL");
  const ids = ((events ?? []) as { id: string }[]).map((e) => e.id);
  if (ids.length === 0) return null;

  // Latest deadline first: an escalated successor is written with a fresh
  // expiry, so this lands on the row a human is actually waiting on.
  const { data } = await db
    .from("approval_request")
    .select("id, approver_id")
    .in("access_event_id", ids)
    .eq("status", "pending")
    .order("expires_at", { ascending: false })
    .limit(1);
  const rows = (data ?? []) as { id: string; approver_id: string }[];
  return rows[0] ?? null;
}

async function resolveApprover(
  ownerId: string | null,
): Promise<{ id: string; name: string } | null> {
  if (!ownerId) return null;
  const { data } = await createAdminClient()
    .from("employee")
    .select("id, name")
    .eq("id", ownerId)
    .maybeSingle();
  const row = data as { id: string; name: string } | null;
  return row ?? null;
}

async function writeEvent(input: {
  identity_id: string;
  resource_id: string;
  action: Action;
  occurred_at: string;
  decision: Decision | "DENY";
  risk: number;
  policyReasons: string[];
  reasoning?: string;
  sessionType?: "password" | "sso" | "oauth_token";
}): Promise<string> {
  const id = `evt-${Math.random().toString(36).slice(2, 10)}-${input.policyReasons.length}`;
  await createAdminClient().from("access_event").insert({
    id,
    identity_id: input.identity_id,
    resource_id: input.resource_id,
    action: input.action,
    occurred_at: input.occurred_at,
    session_type: input.sessionType ?? "sso",
    decision: input.decision,
    risk_score: input.risk,
    policy_reasons: input.policyReasons,
    reasoning: input.reasoning ?? null,
    is_seeded_history: false,
  });
  return id;
}
