/**
 * Shapes returned by GET /api/org.
 *
 * This surface displays; it never decides. Nothing here carries a score, a
 * verdict or a judgement — every field is a column read from the database or a
 * deterministic count over rows. Same discipline as docs/attack-graph.md §5.
 *
 * These live here rather than in src/lib/types.ts because they are the read
 * contract of one screen, not part of the decision contract.
 */

import type {
  Action,
  IdentityType,
  ResourceType,
  Sensitivity,
} from "@/lib/types";

export interface PersonRef {
  id: string;
  name: string;
}

/** Section 1 — authorised third-party software (employee.identity_type = 'oauth_app'). */
export interface OrgOAuthApp {
  id: string;
  name: string;
  role: string;
  /** The human whose access this software acts with. */
  acts_for: PersonRef | null;
  scope: string | null;
  connected_at: string | null;
  /** null means no access review row has ever been recorded for this grant. */
  last_reviewed_at: string | null;
  last_used_at: string | null;
}

export interface OrgProjectMember extends PersonRef {
  role_on_project: string | null;
}

/** Section 2 — projects. */
export interface OrgProject {
  id: string;
  name: string;
  purpose: string | null;
  status: string;
  sensitivity: Sensitivity;
  started_at: string | null;
  ended_at: string | null;
  owner: PersonRef | null;
  member_count: number;
  members: OrgProjectMember[];
}

export interface OrgPersonProject extends PersonRef {
  role_on_project: string | null;
}

/** Section 3 — people. No metrics, no rankings, no scoring of people. */
export interface OrgPerson {
  id: string;
  name: string;
  role: string;
  department: string | null;
  identity_type: IdentityType;
  manager: PersonRef | null;
  work_hours_start: string | null;
  work_hours_end: string | null;
  projects: OrgPersonProject[];
  groups: PersonRef[];
}

/** One permission row held by a group, with its resource resolved. */
export interface OrgGroupGrant {
  id: string;
  action: Action;
  granted_at: string | null;
  granted_reason: string | null;
  /** null means this grant has never been through an access review. */
  last_reviewed_at: string | null;
  resource: {
    id: string;
    name: string;
    type: ResourceType;
    sensitivity: Sensitivity;
  };
  /** The project the granted resource belongs to. null = company-wide. */
  resource_project: PersonRef | null;
  /**
   * Group members who hold this grant and are not members of the project the
   * resource belongs to. A set difference over two membership tables — a query
   * result, not an assessment. Empty when the resource has no project.
   */
  members_outside_resource_project: PersonRef[];
}

/** Section 4 — groups and what they grant. */
export interface OrgGroup {
  id: string;
  name: string;
  members: PersonRef[];
  grants: OrgGroupGrant[];
}

/** Section 5 — resources. */
export interface OrgResource {
  id: string;
  name: string;
  type: ResourceType;
  sensitivity: Sensitivity;
  category: string | null;
  project: PersonRef | null;
  parent: PersonRef | null;
  owner: PersonRef | null;
}

export interface OrgCounts {
  people: number;
  oauth_apps: number;
  projects: number;
  groups: number;
  grants: number;
  resources: number;
}

export interface OrgSnapshot {
  counts: OrgCounts;
  oauth_apps: OrgOAuthApp[];
  projects: OrgProject[];
  people: OrgPerson[];
  groups: OrgGroup[];
  resources: OrgResource[];
}
