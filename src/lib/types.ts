/**
 * The contract. Three workstreams (schema/seed, engine, UI) build against this
 * file and nothing else, so they can proceed independently.
 *
 * Mirrors supabase/schema.sql. If you change one, change both.
 */

// ------------------------------------------------------------------ scalars

export const SENSITIVITIES = [
  "public",
  "internal",
  "confidential",
  "restricted",
] as const;
export type Sensitivity = (typeof SENSITIVITIES)[number];

export const DECISIONS = [
  "ALLOW",
  "ALLOW_AND_FLAG",
  "STEP_UP",
  "REQUIRE_APPROVAL",
] as const;
export type Decision = (typeof DECISIONS)[number];

/**
 * A conventional RBAC denial. Deliberately OUTSIDE the four contextual bands:
 * those bands govern access the identity already holds. If no permission
 * reaches the resource there is nothing to reason about and nobody to ask —
 * approving it would make Cordyceps a privilege-escalation mechanism rather
 * than a brake on one. Denial is the only outcome no human can override here.
 */
export type PolicyOutcome = Decision | "DENY";

export type Action = "view" | "download" | "edit" | "delete";
export type IdentityType = "human" | "admin" | "service" | "oauth_app";
export type ResourceType =
  | "file"
  | "folder"
  | "db_table"
  | "dashboard"
  | "secret"
  | "repo";

// ------------------------------------------------------------------ rows

export interface Employee {
  id: string;
  name: string;
  role: string;
  department: string | null;
  manager_id: string | null;
  identity_type: IdentityType;
  acts_for: string | null;
  connected_at: string | null;
  scope: string | null;
  last_reviewed_at: string | null;
  last_used_at: string | null;
  work_hours_start: string | null;
  work_hours_end: string | null;
}

export interface Project {
  id: string;
  name: string;
  purpose: string | null;
  owner_id: string | null;
  status: "active" | "paused" | "completed";
  sensitivity: Sensitivity;
  started_at: string | null;
  ended_at: string | null;
}

export interface Resource {
  id: string;
  name: string;
  type: ResourceType;
  project_id: string | null;
  parent_id: string | null;
  owner_id: string | null;
  sensitivity: Sensitivity;
  category: string | null;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  project_id: string | null;
  assignee_id: string | null;
  parent_task_id: string | null;
  status: "open" | "in_progress" | "done" | "cancelled";
  due_at: string | null;
}

export interface Permission {
  id: string;
  subject_type: "employee" | "group";
  subject_id: string;
  resource_id: string;
  action: Action;
  granted_at: string | null;
  granted_reason: string | null;
  last_reviewed_at: string | null;
}

export interface BehaviourProfile {
  employee_id: string;
  typical_start: string | null;
  typical_end: string | null;
  project_mix: Record<string, number> | null;
  category_mix: Record<string, number> | null;
  files_per_hour_p95: number | null;
  download_ratio: number | null;
  projects_never_touched: string[] | null;
  computed_at: string | null;
  computed_by: string | null;
}

// ------------------------------------------------------------------ request

export interface AccessRequest {
  identity_id: string;
  resource_id: string;
  action: Action;
  /**
   * ISO 8601. Supplied by the caller, never defaulted to the wall clock.
   * We demo at ~16:35, inside Alice's baseline — reading now() silently zeroes
   * the off-hours signal on stage. See docs/brief-extended.md §4.
   */
  occurred_at: string;
}

// ------------------------------------------------------------------ stages

/** Stage 1 — deterministic. A `false` short-circuits and never reaches the model. */
export interface PolicyResult {
  permitted: boolean;
  /** How the subject reaches the resource: group hops and folder hops. */
  path: PermissionHop[];
  permission: Permission | null;
}

export interface PermissionHop {
  kind: "group" | "folder" | "direct";
  from: string;
  to: string;
  label: string;
}

/** Stage 2 — everything the model is allowed to see. */
export interface AccessContext {
  identity: Employee;
  /** Set when identity is an oauth_app acting for a human. */
  principal: Employee | null;
  resource: Resource;
  resourceProject: Project | null;
  isProjectMember: boolean;
  relatedTasks: Task[];
  /** Tasks on the resource's project assigned to this identity. Empty is the point. */
  tasksOnResourceProject: Task[];
  baseline: BehaviourProfile | null;
  hasEverAccessedProject: boolean;
  recentAccessCount: number;
  /** Distinct resources on this project touched in the preceding window. */
  velocityWindowCount: number;
  isOutsideWorkingHours: boolean;
}

/** Stage 4 — the model scores and explains. It does not decide. */
export interface RiskAssessment {
  risk_score: number;
  reasoning: string;
  policy_reasons: string[];
}

/**
 * Provider-agnostic. Anthropic and Runware are both a ~5-line adapter.
 * Swapping providers must never touch the engine.
 */
export type RiskScorer = (ctx: AccessContext) => Promise<RiskAssessment>;

// ------------------------------------------------------------------ response

export interface AccessDecision {
  decision: PolicyOutcome;
  risk_score: number;
  occurred_at: string;
  /** Model-authored prose. Explains; does not establish. */
  reasoning: string;
  /**
   * Model-authored. These are a summary, NOT the audit record — the
   * system-derived facts in `context_summary` are what actually holds up under
   * scrutiny, and they are computed without the model's involvement.
   */
  policy_reasons: string[];
  /** "runware" | "anthropic" | "heuristic" | "<provider>-then-heuristic". */
  scored_by: string;
  /** Rendered as the permission chain in the UI. */
  permission_path: PermissionHop[];
  context_summary: {
    identity_name: string;
    via_oauth_app: string | null;
    /**
     * Populated when via_oauth_app is set. Without this the UI's "via <app>"
     * expansion is seeded copy rather than live data — and a judge who spots
     * that has found exactly the kind of theatre this project argues against.
     */
    oauth_detail: {
      connected_at: string | null;
      scope: string | null;
      last_reviewed_at: string | null;
      last_used_at: string | null;
    } | null;
    resource_name: string;
    resource_sensitivity: Sensitivity;
    project_name: string | null;
    is_project_member: boolean;
    matching_task_count: number;
    outside_working_hours: boolean;
    first_access_to_project: boolean;
  };
  approver: { id: string; name: string } | null;
  expires_in_minutes: number | null;
  access_event_id: string;
  approval_request_id: string | null;
}

// ------------------------------------------------------------------ thresholds

/**
 * The single most important object in the project: the model scores, this
 * decides. Shown on screen during the demo.
 */
export const THRESHOLDS = [
  { min: 0, max: 39, decision: "ALLOW" },
  { min: 40, max: 69, decision: "ALLOW_AND_FLAG" },
  { min: 70, max: 84, decision: "STEP_UP" },
  { min: 85, max: 100, decision: "REQUIRE_APPROVAL" },
] as const satisfies ReadonlyArray<{
  min: number;
  max: number;
  decision: Decision;
}>;

export const APPROVAL_EXPIRY_MINUTES = 15;

// ------------------------------------------------------- approval contract

/**
 * What an approval actually grants — written down because "a human approves it"
 * is not a security design.
 *
 * SCOPE: approval releases exactly ONE action on ONE resource for the identity
 * named in the original access event. It is not a standing grant, not a session
 * elevation, and it does not extend to the folder the resource sits in. A
 * second read requires a second decision.
 *
 * IT CANNOT WIDEN REACH. Only a `REQUIRE_APPROVAL` outcome is routable, and
 * that outcome is only reachable when the permission check already passed.
 * `DENY` is never routable — see `PolicyOutcome`.
 *
 * RACES: first decision wins. A second decision on a settled request is
 * rejected with the current status rather than overwriting it.
 *
 * REJECTION: the access stays suspended permanently for that request. The
 * requester is told, and must make a fresh request — nothing is silently
 * retried on their behalf.
 *
 * EXPIRY: 15 minutes on real wall-clock. At expiry the request escalates to the
 * approver's escalation contact rather than being denied, because "suspend,
 * don't deny" and a hard timeout are otherwise in tension.
 *
 * APPROVER IDENTITY IS SIMULATED. The demo trusts `approver_id` from the client.
 * Production must take it from the IdP session — say this out loud rather than
 * letting a judge find it.
 */
export interface ApprovalDecisionRequest {
  approval_request_id: string;
  decision: "approve" | "reject";
  /** DEMO ONLY. Production reads this from the authenticated session. */
  approver_id: string;
  justification?: string;
}

export interface ApprovalOutcome {
  approval_request_id: string;
  status: "approved" | "rejected" | "expired";
  decided_at: string;
  decided_by: { id: string; name: string };
  justification: string | null;
  /** True only on approve. The one-time release described above. */
  access_released: boolean;
  /** Exactly what was released. Null on reject or expire. */
  capability: {
    identity_id: string;
    resource_id: string;
    action: Action;
    single_use: true;
  } | null;
}

export interface PendingApproval {
  approval_request_id: string;
  access_event_id: string;
  requester_name: string;
  via_oauth_app: string | null;
  resource_name: string;
  resource_sensitivity: Sensitivity;
  project_name: string | null;
  action: Action;
  occurred_at: string;
  risk_score: number;
  summary: string;
  policy_reasons: string[];
  created_at: string;
  expires_at: string;
  status: "pending" | "approved" | "rejected" | "expired";
  /** Whose desk it is on. Changes when an expired request escalates. */
  approver_name: string;
}
