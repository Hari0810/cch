/**
 * Stage 1 — deterministic policy. Cheap, no model, no wall clock.
 *
 * Resolution walks TWO edges, exactly as docs/demo-scenario.md §3 requires:
 *
 *   a) subject   — employee -> group_membership -> permission (subject_type='group')
 *   b) resource  — resource.parent_id upward, so a grant on finance/ resolves
 *                  down onto Acquisition Valuation.xlsx.
 *
 * A `permitted: false` short-circuits the pipeline and never reaches the model.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Action,
  Employee,
  Permission,
  PermissionHop,
  PolicyResult,
  Resource,
} from "@/lib/types";

/**
 * Read-family: `view` and `download` are both satisfied by a read grant — a
 * seeded "read on finance/" must not deny a download of a file inside it.
 * Write actions require a write grant.
 */
const ACTION_RANK: Record<Action, number> = {
  view: 0,
  download: 0,
  edit: 1,
  delete: 2,
};

function grants(held: Action, requested: Action): boolean {
  return ACTION_RANK[held] >= ACTION_RANK[requested];
}

const MAX_FOLDER_DEPTH = 12;

/** The resource and each ancestor, nearest first: [file, finance/, ...]. */
export async function walkResourceChain(
  resourceId: string,
): Promise<Resource[]> {
  const db = createAdminClient();
  const chain: Resource[] = [];
  let nextId: string | null = resourceId;

  while (nextId && chain.length < MAX_FOLDER_DEPTH) {
    const { data } = await db
      .from("resource")
      .select("*")
      .eq("id", nextId)
      .maybeSingle();
    if (!data) break;
    const row = data as Resource;
    chain.push(row);
    nextId = row.parent_id;
  }
  return chain;
}

interface Candidate {
  permission: Permission;
  /** Index into the resource chain: 0 = the resource itself. */
  depth: number;
  /** Employee the grant reaches through (the identity, or its principal). */
  viaEmployee: Employee;
  /** Set when the grant is held by a group rather than the employee. */
  group: { id: string; name: string } | null;
}

export async function resolvePermission(
  identityId: string,
  resourceId: string,
  action: Action,
  /** Reference point for grant age. Never defaults to the wall clock. */
  occurredAt?: string,
): Promise<PolicyResult> {
  const db = createAdminClient();

  const { data: identityRow } = await db
    .from("employee")
    .select("*")
    .eq("id", identityId)
    .maybeSingle();
  const identity = identityRow as Employee | null;
  if (!identity) return { permitted: false, path: [], permission: null };

  const chain = await walkResourceChain(resourceId);
  if (chain.length === 0) return { permitted: false, path: [], permission: null };

  // An oauth_app inherits the reach of the human it acts for. That is the whole
  // point of scenario C: the token is permitted because Alice is.
  let principal: Employee | null = null;
  if (identity.identity_type === "oauth_app" && identity.acts_for) {
    const { data } = await db
      .from("employee")
      .select("*")
      .eq("id", identity.acts_for)
      .maybeSingle();
    principal = (data as Employee | null) ?? null;
  }

  const subjects: Employee[] = principal ? [identity, principal] : [identity];
  const subjectIds = subjects.map((s) => s.id);

  // ---- edge (a): group membership -----------------------------------------
  const { data: membershipRows } = await db
    .from("group_membership")
    .select("group_id, employee_id")
    .in("employee_id", subjectIds);
  const memberships = (membershipRows ?? []) as {
    group_id: string;
    employee_id: string;
  }[];

  const groupIds = [...new Set(memberships.map((m) => m.group_id))];
  const groupNames = new Map<string, string>();
  if (groupIds.length > 0) {
    const { data: groupRows } = await db
      .from("user_group")
      .select("id, name")
      .in("id", groupIds);
    for (const g of (groupRows ?? []) as { id: string; name: string }[]) {
      groupNames.set(g.id, g.name);
    }
  }

  // ---- edge (b): every permission attached anywhere on the folder chain ----
  const chainIds = chain.map((r) => r.id);
  const { data: permissionRows } = await db
    .from("permission")
    .select("*")
    .in("resource_id", chainIds);
  const permissions = (permissionRows ?? []) as Permission[];

  const candidates: Candidate[] = [];
  for (const permission of permissions) {
    if (!grants(permission.action, action)) continue;
    const depth = chainIds.indexOf(permission.resource_id);
    if (depth < 0) continue;

    if (permission.subject_type === "employee") {
      const viaEmployee = subjects.find((s) => s.id === permission.subject_id);
      if (!viaEmployee) continue;
      candidates.push({ permission, depth, viaEmployee, group: null });
      continue;
    }

    // subject_type === 'group'
    const membership = memberships.find(
      (m) => m.group_id === permission.subject_id,
    );
    if (!membership) continue;
    const viaEmployee = subjects.find((s) => s.id === membership.employee_id);
    if (!viaEmployee) continue;
    candidates.push({
      permission,
      depth,
      viaEmployee,
      group: {
        id: permission.subject_id,
        name: groupNames.get(permission.subject_id) ?? permission.subject_id,
      },
    });
  }

  if (candidates.length === 0) {
    return { permitted: false, path: [], permission: null };
  }

  // Nearest grant wins; a direct employee grant beats a group grant at the
  // same node; then the strongest action, for a stable, explainable choice.
  candidates.sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    const aDirect = a.group ? 1 : 0;
    const bDirect = b.group ? 1 : 0;
    if (aDirect !== bDirect) return aDirect - bDirect;
    return ACTION_RANK[b.permission.action] - ACTION_RANK[a.permission.action];
  });

  const best = candidates[0];
  return {
    permitted: true,
    permission: best.permission,
    path: buildPath(best, chain, identity, principal, action, occurredAt),
  };
}

/**
 * "granted 6 months ago" — measured against the request, not the wall clock.
 * This string is a headline demo beat: the presenter points at the chain and
 * says the permission was correct when it was issued and nobody revisited it.
 */
function grantProvenance(permission: Permission, occurredAt?: string): string {
  const parts: string[] = [];

  if (permission.granted_at && occurredAt) {
    const months =
      (new Date(occurredAt).getTime() - new Date(permission.granted_at).getTime()) /
      (30.44 * 86_400_000);
    if (months >= 11) {
      const years = Math.round(months / 12);
      parts.push(`granted ${years} year${years === 1 ? "" : "s"} ago`);
    } else if (months >= 1) {
      parts.push(`granted ${Math.round(months)} months ago`);
    } else {
      parts.push("granted recently");
    }
  }

  if (permission.granted_reason) {
    parts.push(`for "${permission.granted_reason}"`);
  }

  // The grant clause reads as one phrase; the review status is a separate
  // fact and needs its own separator or the sentence runs together.
  const clauses = [parts.join(" ")].filter(Boolean);
  if (permission.last_reviewed_at === null) clauses.push("never reviewed");

  return clauses.length > 0 ? ` · ${clauses.join(" · ")}` : "";
}

function buildPath(
  best: Candidate,
  chain: Resource[],
  identity: Employee,
  principal: Employee | null,
  action: Action,
  occurredAt?: string,
): PermissionHop[] {
  const hops: PermissionHop[] = [];

  // Delegation edge: the OAuth app reaching through its human principal.
  if (principal && best.viaEmployee.id === principal.id) {
    hops.push({
      kind: "direct",
      from: identity.id,
      to: principal.id,
      label: `${identity.name} acts for ${principal.name}${
        identity.scope ? ` (${identity.scope})` : ""
      }`,
    });
  }

  const grantResource = chain[best.depth];
  const reason = grantProvenance(best.permission, occurredAt);

  if (best.group) {
    hops.push({
      kind: "group",
      from: best.viaEmployee.id,
      to: best.group.id,
      label: `${best.viaEmployee.name} is a member of ${best.group.name}`,
    });
    hops.push({
      kind: "direct",
      from: best.group.id,
      to: grantResource.id,
      label: `${best.group.name} holds ${best.permission.action} on ${grantResource.name}${reason}`,
    });
  } else {
    hops.push({
      kind: "direct",
      from: best.viaEmployee.id,
      to: grantResource.id,
      label: `${best.viaEmployee.name} holds ${best.permission.action} on ${grantResource.name}${reason}`,
    });
  }

  // Folder inheritance, walked back down from the granted node to the target.
  for (let i = best.depth; i > 0; i--) {
    hops.push({
      kind: "folder",
      from: chain[i].id,
      to: chain[i - 1].id,
      label: `${chain[i].name} contains ${chain[i - 1].name}`,
    });
  }

  if (best.depth === 0 && hops.length > 0) {
    hops[hops.length - 1].label += ` (${action} requested)`;
  }

  return hops;
}
