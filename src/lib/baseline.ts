/**
 * Behavioural baselining — client for the Modal job, plus an identical local
 * fallback.
 *
 * Called at SEED TIME (from POST /api/reset, after seeding), never in the
 * request path. See docs/plan.md ground rule 3: a Modal cold start inside a
 * live access decision is the single most likely way the demo dies.
 *
 * What it buys: scenario C's "Alice does not normally access finance
 * resources" and "first-ever Nova access" fall out of the seeded history as
 * computed facts — `category_mix` has no `financial` key and
 * `projects_never_touched` contains `nova` — rather than being seeded strings.
 *
 * Data transfer: we POST the events to Modal rather than letting Modal read
 * Supabase. No Modal secret to create, no service-role key leaves this
 * process, and the fallback below consumes the exact same payload, so both
 * paths produce the same numbers. See modal/baseline.py.
 *
 * Server-only — uses the service-role client.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { BehaviourProfile } from "@/lib/types";

// ------------------------------------------------------------------ payload

interface BaselineEvent {
  identity_id: string;
  resource_id: string;
  action: string;
  occurred_at: string;
}

interface BaselineResource {
  id: string;
  project_id: string | null;
  category: string | null;
}

export interface BaselinePayload {
  events: BaselineEvent[];
  resources: BaselineResource[];
  employees: string[];
  projects: string[];
  /** Frame the hour-of-day is measured in — the frame the seed wrote in. */
  tz_offset_minutes: number;
  computed_at: string;
}

export interface BaselineRunResult {
  profiles: BehaviourProfile[];
  /** Which path produced them. Shown in the reset response, logged either way. */
  source: "modal" | "local";
  /** Populated when Modal was tried and failed. */
  error?: string;
}

/** Bucket keys for rows whose resource carries no project / no category. */
const NO_PROJECT = "company-wide";
const NO_CATEGORY = "uncategorised";
const WINDOW_MS = 3_600_000;
const MODAL_TIMEOUT_MS = 20_000;

// ------------------------------------------------------------------ entry

/**
 * Read the seeded history, compute one profile per employee (Modal if
 * reachable, locally otherwise), and write them to `behaviour_profile`.
 */
export async function computeAndStoreBaselines(): Promise<BaselineRunResult> {
  const payload = await loadPayload();
  const result = await runBaselines(payload);

  const db = createAdminClient();
  await db.from("behaviour_profile").delete().neq("employee_id", "");
  if (result.profiles.length > 0) {
    const { error } = await db
      .from("behaviour_profile")
      .insert(result.profiles as unknown as Record<string, unknown>[]);
    if (error) {
      throw new Error(`behaviour_profile insert failed: ${error.message}`);
    }
  }

  console.log(
    `[baseline] wrote ${result.profiles.length} profiles via ${result.source}` +
      (result.error ? ` (modal failed: ${result.error})` : ""),
  );
  return result;
}

/** Modal if MODAL_SCORING_ENDPOINT is set and answers; local otherwise. */
export async function runBaselines(
  payload: BaselinePayload,
): Promise<BaselineRunResult> {
  const endpoint = process.env.MODAL_SCORING_ENDPOINT?.trim();
  if (!endpoint) {
    console.log("[baseline] MODAL_SCORING_ENDPOINT unset — computing locally");
    return { profiles: stampLocal(computeBaselinesLocally(payload)), source: "local" };
  }

  try {
    const profiles = await computeBaselinesOnModal(endpoint, payload);
    console.log(`[baseline] computed on Modal (${endpoint})`);
    return { profiles, source: "modal" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[baseline] Modal unreachable (${message}) — falling back`);
    return {
      profiles: stampLocal(computeBaselinesLocally(payload)),
      source: "local",
      error: message,
    };
  }
}

/**
 * The numbers are identical either way; only the provenance differs. Never
 * claim Modal computed something it didn't — that question gets asked.
 */
function stampLocal(profiles: BehaviourProfile[]): BehaviourProfile[] {
  return profiles.map((p) => ({ ...p, computed_by: "local" }));
}

/** Pull everything the computation needs out of Supabase. */
export async function loadPayload(): Promise<BaselinePayload> {
  const db = createAdminClient();

  const [employees, projects, resources, events] = await Promise.all([
    db.from("employee").select("id"),
    db.from("project").select("id"),
    db.from("resource").select("id, project_id, category"),
    db
      .from("access_event")
      .select("identity_id, resource_id, action, occurred_at")
      .eq("is_seeded_history", true)
      .order("occurred_at", { ascending: true }),
  ]);

  for (const r of [employees, projects, resources, events]) {
    if (r.error) throw new Error(`baseline load failed: ${r.error.message}`);
  }

  return {
    events: (events.data ?? []) as BaselineEvent[],
    resources: (resources.data ?? []) as BaselineResource[],
    employees: (employees.data ?? []).map((e) => e.id as string),
    projects: (projects.data ?? []).map((p) => p.id as string),
    tz_offset_minutes: -new Date().getTimezoneOffset(),
    computed_at: new Date().toISOString(),
  };
}

async function computeBaselinesOnModal(
  endpoint: string,
  payload: BaselinePayload,
): Promise<BehaviourProfile[]> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(MODAL_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`modal returned ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { profiles?: BehaviourProfile[] };
  if (!Array.isArray(body.profiles)) {
    throw new Error("modal response had no profiles array");
  }
  return body.profiles;
}

// ------------------------------------------------------------------ fallback

/**
 * Pure-TS twin of modal/baseline.py:compute_profiles. Same inputs, same
 * numbers — so a Modal outage costs the demo nothing but the sentence about
 * where the numbers were computed.
 */
export function computeBaselinesLocally(
  payload: BaselinePayload,
): BehaviourProfile[] {
  const resources = new Map(payload.resources.map((r) => [r.id, r]));
  const tzMs = payload.tz_offset_minutes * 60_000;
  const computedAt = payload.computed_at ?? new Date().toISOString();

  const byIdentity = new Map<string, BaselineEvent[]>();
  for (const id of payload.employees) byIdentity.set(id, []);
  for (const ev of payload.events) {
    const bucket = byIdentity.get(ev.identity_id);
    if (bucket) bucket.push(ev);
    else byIdentity.set(ev.identity_id, [ev]);
  }

  const profiles: BehaviourProfile[] = [];

  for (const [employeeId, unsorted] of byIdentity) {
    const rows = [...unsorted].sort(
      (a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at),
    );

    if (rows.length === 0) {
      profiles.push({
        employee_id: employeeId,
        typical_start: null,
        typical_end: null,
        project_mix: {},
        category_mix: {},
        files_per_hour_p95: 0,
        download_ratio: 0,
        projects_never_touched: [...payload.projects].sort(),
        computed_at: computedAt,
        computed_by: "modal",
      });
      continue;
    }

    const hours: number[] = [];
    const stamps: number[] = [];
    const projectCounts = new Map<string, number>();
    const categoryCounts = new Map<string, number>();
    const touched = new Set<string>();
    let downloads = 0;

    for (const ev of rows) {
      const t = Date.parse(ev.occurred_at);
      stamps.push(t);
      // Hour-of-day in the caller's local frame, matching the frame the seed
      // wrote its work-hours in.
      const local = (((t + tzMs) % 86_400_000) + 86_400_000) % 86_400_000;
      hours.push(local / 3_600_000);

      const res = resources.get(ev.resource_id);
      const project = res?.project_id ?? NO_PROJECT;
      const category = res?.category ?? NO_CATEGORY;
      projectCounts.set(project, (projectCounts.get(project) ?? 0) + 1);
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
      if (res?.project_id) touched.add(res.project_id);
      if (ev.action === "download") downloads += 1;
    }

    // Distinct resources touched in each forward-rolling one-hour window.
    const windowCounts: number[] = [];
    for (let i = 0; i < stamps.length; i++) {
      const seen = new Set<string>();
      for (let j = i; j < stamps.length; j++) {
        if (stamps[j] - stamps[i] >= WINDOW_MS) break;
        seen.add(rows[j].resource_id);
      }
      windowCounts.push(seen.size);
    }

    const n = rows.length;
    profiles.push({
      employee_id: employeeId,
      typical_start: formatTime(percentile(hours, 10)),
      typical_end: formatTime(percentile(hours, 90)),
      project_mix: fractions(projectCounts, n),
      category_mix: fractions(categoryCounts, n),
      files_per_hour_p95: round(percentile(windowCounts, 95), 2),
      download_ratio: round(downloads / n, 4),
      projects_never_touched: payload.projects
        .filter((p) => !touched.has(p))
        .sort(),
      computed_at: computedAt,
      computed_by: "modal",
    });
  }

  profiles.sort((a, b) => a.employee_id.localeCompare(b.employee_id));
  return profiles;
}

// ------------------------------------------------------------------ maths
// Mirrors numpy.percentile's default linear interpolation.

function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * (q / 100);
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, s.length - 1);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

function round(value: number, places: number): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

/** Fractional local hour -> 'HH:MM:SS' for a postgres `time` column. */
function formatTime(hours: number): string {
  const total = Math.min(Math.max(Math.round(hours * 3600), 0), 86_399);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(
    Math.floor((total % 3600) / 60),
  )}:${pad(total % 60)}`;
}

function fractions(
  counts: Map<string, number>,
  total: number,
): Record<string, number> {
  if (total <= 0) return {};
  return Object.fromEntries(
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([k, v]) => [k, round(v / total, 4)]),
  );
}
