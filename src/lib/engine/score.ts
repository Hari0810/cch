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

Reply with ONLY a JSON object, no prose and no markdown fence:
{"risk_score": <int>, "reasoning": "<two sentences, plain English, addressed to the person affected>", "policy_reasons": ["<short factual clause>", ...]}

Each policy_reason must be a single verifiable fact drawn from the context,
e.g. "Not assigned to Project Nova" or "No open task references this project".`;

export function buildUserPrompt(ctx: AccessContext): string {
  const subject = ctx.principal ?? ctx.identity;
  const b = ctx.baseline;

  return JSON.stringify(
    {
      identity: {
        name: ctx.identity.name,
        type: ctx.identity.identity_type,
        role: ctx.identity.role,
        ...(ctx.principal
          ? {
              delegating_for: ctx.principal.name,
              oauth_connected_at: ctx.identity.connected_at,
              oauth_scope: ctx.identity.scope,
              oauth_last_reviewed_at: ctx.identity.last_reviewed_at,
              oauth_last_used_at: ctx.identity.last_used_at,
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
        outside_normal_working_hours: ctx.isOutsideWorkingHours,
        baseline: b
          ? {
              typical_hours: `${b.typical_start}–${b.typical_end}`,
              project_mix: b.project_mix,
              category_mix: b.category_mix,
              typical_files_per_hour_p95: b.files_per_hour_p95,
              projects_never_touched: b.projects_never_touched,
            }
          : "no baseline computed",
      },
      request: { action: "see resource.action", occurred_at: "see envelope" },
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

export const runwareScorer: RiskScorer = async (ctx) => {
  const res = await fetch(RUNWARE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RUNWARE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.RUNWARE_MODEL || DEFAULT_RUNWARE_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(ctx) },
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

export const anthropicScorer: RiskScorer = async (ctx) => {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    max_tokens: 700,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(ctx) }],
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

export function selectScorer(): { scorer: RiskScorer; provider: string } {
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
): Promise<RiskAssessment & { provider: string }> {
  const { scorer, provider } = selectScorer();
  try {
    const result = await scorer(ctx);
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
