/**
 * Stage 4 — the model scores and explains. It does NOT decide.
 *
 * Provider-agnostic behind the `RiskScorer` type. Runware is the live path
 * (OpenAI-compatible, serving Claude); Anthropic is kept as a five-line
 * adapter to prove the boundary is real; the heuristic runs with no
 * credentials at all so the pipeline is never dark.
 */

import { z } from "zod";
import type { AccessContext, RiskAssessment, RiskScorer } from "@/lib/types";

const RUNWARE_URL = "https://api.runware.ai/v1/chat/completions";
const DEFAULT_RUNWARE_MODEL = "anthropic-claude-sonnet-4-6";

/**
 * The upper bound is generous on purpose. An earlier max(8) rejected a
 * perfectly good nine-reason assessment and silently downgraded the whole
 * request to the heuristic — the model being articulate is not a validation
 * failure. Trim for display instead, at the point of display.
 */
const AssessmentSchema = z.object({
  risk_score: z.number().min(0).max(100),
  reasoning: z.string().min(1),
  policy_reasons: z.array(z.string()).min(1).max(24),
});

/** What the card can show without becoming a wall of text. */
const MAX_DISPLAYED_REASONS = 8;

// ---------------------------------------------------------------- the prompt

const SYSTEM_PROMPT = `You are the risk-assessment stage of a contextual authorisation gateway.

You are given an access request that has ALREADY PASSED the permission check —
the identity is technically permitted. Your job is the second question:
is there any reason for this identity to be opening this resource, right now?

Score 0-100 where:
  0-39   routine, explained by their current work
  40-69  unusual but plausibly explainable
  70-84  poorly explained; a human should confirm intent
  85-100 no business purpose is evident in the context provided

What matters most, in order:
  1. Is the identity assigned to the project that owns this resource?
  2. Does an open task of theirs plausibly require it?
  3. Is this consistent with what they normally touch?
  4. Sensitivity of the resource.
  5. Time, volume and velocity — supporting signals, never the headline.

Being outside working hours is WEAK evidence on its own. Someone working late
on their own project is normal. Someone touching an unrelated restricted
project they have never opened, with no task referencing it, is not — regardless
of the hour.

Judge the CONTEXT, not the person. Never infer intent or motive.

THE "derived" BLOCK IS AUTHORITATIVE. Every quantity in it was computed by the
gateway from the request's own timestamp, before you saw it. Three rules, and
they override anything you think you can work out for yourself:

  1. NEVER do date or time arithmetic. Do not convert a date into "N months
     ago", do not compute a gap between two dates, do not estimate an age or a
     duration. If "derived" does not already state an elapsed duration, refer
     to the calendar date instead and say nothing about how long ago it was.
  2. NEVER contradict derived.working_hours. If it says INSIDE, this access
     happened during normal hours — do not describe it as late, out-of-hours or
     unusual for the time, and do not list the hour as a risk signal at all. If
     it says OUTSIDE, you may cite it, subject to the weak-evidence rule above.
  3. Quote the derived figures verbatim when you cite them. They are what the
     decision card displays alongside your text; a number of your own that
     disagrees with one of theirs is the single most damaging thing you can
     produce here.

Reply with ONLY a JSON object, no prose and no markdown fence:
{"risk_score": <int>, "reasoning": "<two sentences, plain English, addressed to the person affected>", "policy_reasons": ["<short factual clause>", ...]}

Each policy_reason must be a single verifiable fact drawn from the context,
e.g. "Not assigned to Project Nova" or "No open task references this project".

Write plain English throughout. This text is read on screen by the person the
decision affects, so never print a field name, a JSON key or an underscore_case
token — write "has never been reviewed", not "last_reviewed: NEVER REVIEWED".`;

// ------------------------------------------------------- derived quantities

/**
 * Models are poor at date arithmetic, and there is no reason to make one guess
 * a number we have already computed. Everything below turns a raw timestamp
 * into the quantity the model actually needs, so the prose on the decision card
 * cannot disagree with the fields printed beside it.
 *
 * GROUND RULE 1: every duration here is measured against the REQUEST's
 * `occurred_at`. `now()` / `new Date()` with no argument appears nowhere in
 * this file. If the reference instant is unavailable we emit no duration at
 * all — a missing figure is recoverable, a wall-clock one is a silent lie on
 * stage, where we replay a 23:40 event at ~16:35.
 */

/** Calendar-accurate, in the units a person would use. Never negative. */
function elapsedBetween(fromIso: string, toIso: string): string | null {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  const ms = to.getTime() - from.getTime();
  if (ms < 0) return null;

  const hours = Math.floor(ms / 3_600_000);
  if (hours < 48) return `${hours} hours`;

  const days = Math.floor(ms / 86_400_000);
  if (days < 60) return `${days} days`;

  // Calendar months, not 30-day blocks: "14 months" must mean what a reader
  // gets by counting on a calendar, because that is what the card shows.
  let months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months--;
  if (months < 24) return `${months} months`;

  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest === 0 ? `${years} years` : `${years} years ${rest} months`;
}

/** "2025-05-31T…" -> "2025-05-31". Dates are safe to state; datetimes invite arithmetic. */
function dateOnly(iso: string | null): string | null {
  return iso ? (iso.split("T")[0] ?? null) : null;
}

/** "10:04:00" -> "10:04". */
function hhmm(t: string | null | undefined): string | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : t;
}

/**
 * The reference instant for every duration: the request's `occurred_at`.
 *
 * `AccessContext` does not carry it today, so this reads it structurally and
 * degrades to `null` rather than reaching for the wall clock. `scoreRisk` takes
 * it as an optional argument for the same reason — the moment the caller passes
 * it, or the context grows the field, the durations light up with no other
 * change. See the note in `scoreRisk`.
 */
function referenceInstant(ctx: AccessContext, explicit?: string | null): string | null {
  if (explicit) return explicit;
  const loose = ctx as AccessContext & {
    occurred_at?: unknown;
    request?: { occurred_at?: unknown } | null;
  };
  if (typeof loose.occurred_at === "string") return loose.occurred_at;
  if (typeof loose.request?.occurred_at === "string") return loose.request.occurred_at;
  return null;
}

/**
 * The single fact the model kept inverting. `ctx.isOutsideWorkingHours` was
 * already correct — it was buried inside `behaviour` as a bare boolean and got
 * overridden by the model's own reading of the clock. Stated as a sentence with
 * the window in it, there is nothing left to infer.
 */
function workingHoursVerdict(ctx: AccessContext, at: string | null): string {
  const subject = ctx.principal ?? ctx.identity;
  const start = hhmm(ctx.baseline?.typical_start ?? subject.work_hours_start);
  const end = hhmm(ctx.baseline?.typical_end ?? subject.work_hours_end);
  const when = at ? localTime(at) : null;
  const stamp = when ? `this access at ${when} is` : "this access is";

  if (!start || !end) {
    return `${stamp} not assessable against a working-hours window — none is on record for ${subject.name}. Do not characterise the hour.`;
  }
  const verdict = ctx.isOutsideWorkingHours ? "OUTSIDE" : "INSIDE";
  return `${stamp} ${verdict} ${subject.name}'s baseline working window ${start}–${end}.`;
}

/** Local wall time straight out of the ISO string's own offset — never shifted to UTC. */
function localTime(iso: string): string | null {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[1]}:${m[2]}` : null;
}

/**
 * The delegated-token facts, as quantities rather than as timestamps to be
 * subtracted. `last_reviewed_at === null` is the loudest signal in scenario C
 * and it is stated in words, not left as a null for the model to interpret.
 */
function tokenFacts(ctx: AccessContext, at: string | null) {
  const id = ctx.identity;
  const connected = dateOnly(id.connected_at);
  const lastUsed = dateOnly(id.last_used_at);

  const connectedAgo =
    at && id.connected_at ? elapsedBetween(id.connected_at, at) : null;
  const lastUsedAgo = at && id.last_used_at ? elapsedBetween(id.last_used_at, at) : null;

  // Independent of the reference instant, so it survives even when durations
  // cannot be computed: a grant that sat live for a long time unreviewed.
  const lifeBeforeLastUse =
    id.connected_at && id.last_used_at
      ? elapsedBetween(id.connected_at, id.last_used_at)
      : null;

  return {
    scope: id.scope,
    connected_on: connected,
    ...(connectedAgo ? { connected_before_this_access: connectedAgo } : {}),
    last_recorded_use_on: lastUsed,
    ...(lastUsedAgo ? { last_used_before_this_access: lastUsedAgo } : {}),
    last_reviewed:
      id.last_reviewed_at === null ? "NEVER REVIEWED" : dateOnly(id.last_reviewed_at),
    standing_grant:
      lifeBeforeLastUse !== null && /months|years/.test(lifeBeforeLastUse)
        ? "long-lived: this token has been live and usable across many months"
        : "recently established",
    ...(connectedAgo || lastUsedAgo
      ? {}
      : {
          how_to_cite:
            "No elapsed durations were computed for this token. State the dates above as dates; do not say how long ago they were.",
        }),
  };
}

export function buildUserPrompt(ctx: AccessContext, occurredAt?: string | null): string {
  const subject = ctx.principal ?? ctx.identity;
  const b = ctx.baseline;
  const at = referenceInstant(ctx, occurredAt);

  return JSON.stringify(
    {
      derived: {
        note: "Already computed by the gateway from this request's own timestamp. Authoritative. Do not recompute, estimate or contradict any of it.",
        ...(at ? { access_occurred_at: at, access_local_time: localTime(at) } : {}),
        working_hours: workingHoursVerdict(ctx, at),
        ...(ctx.principal ? { delegated_token: tokenFacts(ctx, at) } : {}),
      },
      identity: {
        name: ctx.identity.name,
        type: ctx.identity.identity_type,
        role: ctx.identity.role,
        ...(ctx.principal
          ? {
              delegating_for: ctx.principal.name,
              // Raw timestamps deliberately NOT repeated here — see
              // derived.delegated_token. Handing the model both is what
              // produced a months figure that disagreed with the card.
              oauth_scope: ctx.identity.scope,
            }
          : {}),
      },
      resource: {
        name: ctx.resource.name,
        type: ctx.resource.type,
        category: ctx.resource.category,
        sensitivity: ctx.resource.sensitivity,
        project: ctx.resourceProject?.name ?? null,
        project_sensitivity: ctx.resourceProject?.sensitivity ?? null,
      },
      work_context: {
        is_member_of_resource_project: ctx.isProjectMember,
        open_tasks_on_that_project: ctx.tasksOnResourceProject.map((t) => t.title),
        all_open_tasks: ctx.relatedTasks.map((t) => ({
          title: t.title,
          project_id: t.project_id,
          due_at: t.due_at,
        })),
      },
      behaviour: {
        subject: subject.name,
        has_ever_accessed_this_project_before: ctx.hasEverAccessedProject,
        accesses_in_last_30_days: ctx.recentAccessCount,
        distinct_resources_from_this_project_in_last_hour: ctx.velocityWindowCount,
        // Kept for completeness; derived.working_hours is the wording to use.
        outside_normal_working_hours: ctx.isOutsideWorkingHours,
        baseline: b
          ? {
              typical_hours: `${hhmm(b.typical_start)}–${hhmm(b.typical_end)}`,
              project_mix: b.project_mix,
              category_mix: b.category_mix,
              typical_files_per_hour_p95: b.files_per_hour_p95,
              projects_never_touched: b.projects_never_touched,
            }
          : "no baseline computed",
      },
      request: {
        action: "see resource.action",
        // The timing of this request lives in `derived`, already reduced to the
        // quantities that matter. Nothing here for the model to subtract.
        timing: "see derived",
      },
    },
    null,
    1,
  );
}

// ------------------------------------------------------------------ parsing

/**
 * Sonnet returns bare JSON; Haiku wraps it in a ```json fence. Verified both
 * against the live endpoint — strip unconditionally rather than trusting the
 * model to behave on stage.
 */
export function extractJson(raw: string): unknown {
  let text = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text);
  if (fence) text = fence[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) text = text.slice(first, last + 1);
  return JSON.parse(text);
}

// ----------------------------------------------------------------- adapters

/**
 * `RiskScorer` widened by one OPTIONAL argument: the request's `occurred_at`.
 *
 * Every `Scorer` is still a valid `RiskScorer` — the extra parameter is
 * optional, so existing single-argument call sites compile untouched. It exists
 * so the reference instant for every derived duration can arrive from the
 * request rather than from the clock, the day a caller has one to give.
 */
type Scorer = (
  ctx: AccessContext,
  occurredAt?: string | null,
) => Promise<RiskAssessment>;

/**
 * A hung provider must not hang the access request.
 *
 * The error path was always handled — a non-2xx throws and `scoreRisk` falls
 * through to the heuristic. The *hang* path was not: `fetch` with no signal
 * waits indefinitely, so a provider that accepts the connection and then stalls
 * leaves the caller blocked behind a loading skeleton with no fallback and no
 * timeout to rescue it. On conference wifi that is a plausible way to lose a
 * three-minute demo, and it is the one failure mode where doing nothing is
 * strictly worse than degrading loudly.
 *
 * 12s: the observed round trip is ~1.5s, so this is generous enough never to
 * fire on a healthy call and short enough that the heuristic still answers
 * inside a demo's patience. src/lib/baseline.ts already does this for Modal.
 */
const SCORER_TIMEOUT_MS = 12_000;

export const runwareScorer: Scorer = async (ctx, occurredAt) => {
  const res = await fetch(RUNWARE_URL, {
    method: "POST",
    signal: AbortSignal.timeout(SCORER_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${process.env.RUNWARE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.RUNWARE_MODEL || DEFAULT_RUNWARE_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(ctx, occurredAt) },
      ],
      max_tokens: 700,
      temperature: 0.2,
    }),
  });

  if (!res.ok) throw new Error(`runware ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("runware returned no content");
  return AssessmentSchema.parse(extractJson(content));
};

export const anthropicScorer: Scorer = async (ctx, occurredAt) => {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    max_tokens: 700,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(ctx, occurredAt) }],
  });
  const block = msg.content.find((c) => c.type === "text");
  if (!block || block.type !== "text") throw new Error("anthropic returned no text");
  return AssessmentSchema.parse(extractJson(block.text));
};

/**
 * No-credential fallback. Deliberately crude — it exists so the pipeline is
 * demonstrable without a key, not so it can stand in for the model. It reads
 * the same context and produces the same shape.
 */
export const heuristicScorer: RiskScorer = async (ctx) => {
  const reasons: string[] = [];
  let score = 5;

  const projectName = ctx.resourceProject?.name ?? "this resource's project";

  if (ctx.resourceProject && !ctx.isProjectMember) {
    score += 35;
    reasons.push(`Not assigned to ${projectName}`);
  } else if (ctx.isProjectMember) {
    reasons.push(`Assigned to ${projectName}`);
  }

  if (ctx.resourceProject && ctx.tasksOnResourceProject.length === 0) {
    score += 20;
    reasons.push("No open task establishes a business purpose");
  } else if (ctx.tasksOnResourceProject.length > 0) {
    reasons.push(`Active task: ${ctx.tasksOnResourceProject[0].title}`);
  }

  if (ctx.resource.sensitivity === "restricted") {
    score += 15;
    reasons.push("Resource is classified as restricted");
  } else if (ctx.resource.sensitivity === "confidential") {
    score += 8;
    reasons.push("Resource is classified as confidential");
  }

  if (!ctx.hasEverAccessedProject && ctx.resourceProject) {
    score += 12;
    reasons.push(`First recorded access to ${projectName}`);
  }

  if (ctx.isOutsideWorkingHours) {
    score += 6;
    reasons.push("Outside normal working hours");
  }

  if (ctx.velocityWindowCount >= 2) {
    score += 10;
    reasons.push(
      `${ctx.velocityWindowCount} resources from this project in the past hour`,
    );
  }

  if (ctx.identity.identity_type === "oauth_app") {
    score += 8;
    reasons.push(
      `Third-party application acting with delegated credentials${
        ctx.identity.last_reviewed_at === null ? ", never reviewed" : ""
      }`,
    );
  }

  const capped = Math.min(100, score);
  return {
    risk_score: capped,
    reasoning:
      capped < 40
        ? "This access is consistent with your current assignments and normal working pattern."
        : `This access is permitted by your permissions, but nothing in your current work explains it: ${reasons
            .slice(0, 3)
            .join("; ")
            .toLowerCase()}.`,
    policy_reasons: reasons.length > 0 ? reasons : ["No risk signals detected"],
  };
};

// ------------------------------------------------------------------ selection

export function selectScorer(): { scorer: Scorer; provider: string } {
  const requested = (process.env.RISK_PROVIDER || "runware").toLowerCase();
  if (requested === "runware" && process.env.RUNWARE_API_KEY) {
    return { scorer: runwareScorer, provider: "runware" };
  }
  if (requested === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    return { scorer: anthropicScorer, provider: "anthropic" };
  }
  return { scorer: heuristicScorer, provider: "heuristic" };
}

/**
 * The model failing must never take the gateway down. On error we fall back to
 * the heuristic and say so — a degraded explanation is recoverable, a 500 in
 * the access path is not.
 */
export async function scoreRisk(
  ctx: AccessContext,
  /**
   * The request's `occurred_at`, and the reference instant for every derived
   * duration in the prompt. OPTIONAL only because `AccessContext` does not
   * carry it yet — pass `request.occurred_at` and the token-age figures appear.
   * Never defaulted to the wall clock: ground rule 1.
   */
  occurredAt?: string | null,
): Promise<RiskAssessment & { provider: string }> {
  const { scorer, provider } = selectScorer();
  try {
    const result = await scorer(ctx, occurredAt);
    return {
      ...result,
      policy_reasons: result.policy_reasons.slice(0, MAX_DISPLAYED_REASONS),
      provider,
    };
  } catch (err) {
    console.error(`[score] ${provider} failed, falling back to heuristic:`, err);
    // ASCII only — this goes out as an HTTP header, and a non-Latin-1
    // character here throws a ByteString error that surfaces as a bare 500.
    return { ...(await heuristicScorer(ctx)), provider: `${provider}-then-heuristic` };
  }
}
