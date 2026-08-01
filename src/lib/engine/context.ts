/**
 * Stage 2 — context retrieval.
 *
 * Everything the model is allowed to see. The load-bearing joins are:
 *
 *   project_membership  — is this identity working on the resource's project?
 *   task                — does anything they are assigned require it?
 *   access_event        — have they ever touched this project before?
 *   behaviour_profile   — what does normal look like for them?
 *
 * NOTHING here reads the wall clock. Every temporal comparison is against
 * request.occurred_at. See docs/brief-extended.md §4 — we demo at ~16:35, and
 * a wall-clock read would silently score the 23:40 scenario as office hours.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AccessContext,
  AccessRequest,
  BehaviourProfile,
  Employee,
  Project,
  Resource,
  Task,
} from "@/lib/types";

/** Distinct resources touched within this many minutes counts as one burst. */
const VELOCITY_WINDOW_MINUTES = 60;
/** How far back "recent" reaches when counting prior activity. */
const RECENT_WINDOW_DAYS = 30;

export async function gatherContext(
  request: AccessRequest,
  resourceChain: Resource[],
): Promise<AccessContext> {
  const db = createAdminClient();
  const at = new Date(request.occurred_at);

  const { data: identityRow } = await db
    .from("employee")
    .select("*")
    .eq("id", request.identity_id)
    .maybeSingle();
  const identity = identityRow as Employee;

  // An OAuth app has no working hours and no task list of its own. The human
  // it delegates for supplies both — that is what makes scenario C legible.
  let principal: Employee | null = null;
  if (identity?.identity_type === "oauth_app" && identity.acts_for) {
    const { data } = await db
      .from("employee")
      .select("*")
      .eq("id", identity.acts_for)
      .maybeSingle();
    principal = (data as Employee | null) ?? null;
  }

  /** Whose behaviour is the baseline for this request. */
  const subject = principal ?? identity;

  const resource = resourceChain[0];

  const { data: projectRow } = resource.project_id
    ? await db
        .from("project")
        .select("*")
        .eq("id", resource.project_id)
        .maybeSingle()
    : { data: null };
  const resourceProject = (projectRow as Project | null) ?? null;

  // ---- the join the whole product rests on --------------------------------

  const { data: membershipRows } = await db
    .from("project_membership")
    .select("project_id")
    .eq("employee_id", subject.id);
  const memberProjectIds = new Set(
    ((membershipRows ?? []) as { project_id: string }[]).map((m) => m.project_id),
  );
  const isProjectMember = resourceProject
    ? memberProjectIds.has(resourceProject.id)
    : false;

  const { data: taskRows } = await db
    .from("task")
    .select("*")
    .eq("assignee_id", subject.id)
    .in("status", ["open", "in_progress"]);
  const relatedTasks = (taskRows ?? []) as Task[];

  // Primary join is task -> project <- resource. Resource-level task links are
  // a confirming bonus, never the backbone: nobody tags every file to a ticket.
  const tasksOnResourceProject = resourceProject
    ? relatedTasks.filter((t) => t.project_id === resourceProject.id)
    : [];

  // ---- history -------------------------------------------------------------

  const { data: profileRow } = await db
    .from("behaviour_profile")
    .select("*")
    .eq("employee_id", subject.id)
    .maybeSingle();
  const baseline = (profileRow as BehaviourProfile | null) ?? null;

  // Everything strictly BEFORE this request. Seeded history plus anything
  // already evaluated in this session — so a burst builds as the demo runs.
  const identityIds = principal ? [identity.id, principal.id] : [identity.id];
  const { data: priorRows } = await db
    .from("access_event")
    .select("resource_id, occurred_at")
    .in("identity_id", identityIds)
    .lt("occurred_at", request.occurred_at);
  const prior = (priorRows ?? []) as {
    resource_id: string;
    occurred_at: string;
  }[];

  const projectResourceIds = resourceProject
    ? await resourceIdsForProject(resourceProject.id)
    : new Set<string>();

  const hasEverAccessedProject = prior.some((e) =>
    projectResourceIds.has(e.resource_id),
  );

  const recentCutoff = at.getTime() - RECENT_WINDOW_DAYS * 86_400_000;
  const recentAccessCount = prior.filter(
    (e) => new Date(e.occurred_at).getTime() >= recentCutoff,
  ).length;

  const velocityCutoff = at.getTime() - VELOCITY_WINDOW_MINUTES * 60_000;
  const velocityWindowCount = new Set(
    prior
      .filter((e) => new Date(e.occurred_at).getTime() >= velocityCutoff)
      .filter((e) => projectResourceIds.has(e.resource_id))
      .map((e) => e.resource_id),
  ).size;

  return {
    identity,
    principal,
    resource,
    resourceProject,
    isProjectMember,
    relatedTasks,
    tasksOnResourceProject,
    baseline,
    hasEverAccessedProject,
    recentAccessCount,
    velocityWindowCount,
    isOutsideWorkingHours: outsideWorkingHours(subject, baseline, request.occurred_at),
  };
}

async function resourceIdsForProject(projectId: string): Promise<Set<string>> {
  const db = createAdminClient();
  const { data } = await db
    .from("resource")
    .select("id")
    .eq("project_id", projectId);
  return new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
}

/**
 * Compares against occurred_at, never now(). Prefers the computed baseline
 * over the declared hours: a baseline is evidence, a column is an assertion.
 */
export function outsideWorkingHours(
  subject: Employee,
  baseline: BehaviourProfile | null,
  occurredAt: string,
): boolean {
  const start = baseline?.typical_start ?? subject.work_hours_start;
  const end = baseline?.typical_end ?? subject.work_hours_end;
  if (!start || !end) return false;

  // occurred_at carries the caller's offset; read the hour from the string so
  // we compare local wall time to local working hours rather than shifting
  // into UTC and drifting the answer across midnight.
  const minutes = localMinutes(occurredAt);
  if (minutes === null) return false;

  return minutes < toMinutes(start) || minutes > toMinutes(end);
}

function toMinutes(hhmmss: string): number {
  const [h, m] = hhmmss.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Minutes past local midnight, taken from the ISO string's own offset. */
function localMinutes(iso: string): number | null {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
