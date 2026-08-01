/**
 * Stage 5 — the decision.
 *
 * This file is the reason the project is defensible: the model produced a
 * score, and a pure function turns that score into an action against a fixed
 * table. The LLM never has final authority over an access outcome.
 *
 * Keep this boring. Every line of cleverness added here is a line of the
 * "AI explains, rules decide" argument taken away.
 */

import { THRESHOLDS, type Decision } from "@/lib/types";

export function decide(riskScore: number): Decision {
  const score = clampScore(riskScore);
  const band = THRESHOLDS.find((t) => score >= t.min && score <= t.max);
  // Unreachable while THRESHOLDS covers 0–100, but a miss must fail safe
  // (toward asking a human) rather than fail open.
  return band?.decision ?? "REQUIRE_APPROVAL";
}

export function clampScore(riskScore: number): number {
  if (!Number.isFinite(riskScore)) return 100;
  return Math.max(0, Math.min(100, Math.round(riskScore)));
}

/** Decisions that hold the access pending a human. Suspend, never deny. */
export function requiresApproval(decision: Decision): boolean {
  return decision === "REQUIRE_APPROVAL";
}
