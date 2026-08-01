/**
 * Rung 3b — the access graph. Tier 2 (blast radius) + Tier 3 (divergence).
 *
 * THE GRAPH EXPLAINS; IT DOES NOT DETECT. Everything here is either a fact the
 * engine already computed (`resolvePermission`) or a deterministic count read
 * out of the database. Nothing in this file may reach a scorer, and nothing
 * imports it into the decision path — it is served from its own read-only
 * endpoint (`GET /api/graph?event=<id>`) precisely so it cannot move a score.
 * Delete this file and every decision is byte-identical. That is the test.
 *
 * The load-bearing edge is `absent`: the human to the project they are NOT a
 * member of. A chain can only draw the path that exists; the product's whole
 * argument is about the one that doesn't.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePermission, walkResourceChain } from "@/lib/engine/policy";
import type {
  AccessGraph,
  Action,
  Employee,
  GraphEdge,
  GraphNode,
  Permission,
  Project,
  Resource,
} from "@/lib/types";

/** Matches policy.ts. A folder tree deeper than this is a cycle, not a tree. */
const MAX_DEPTH = 12;

interface AccessEventRow {
  id: string;
  identity_id: string;
  resource_id: string;
  action: Action;
  occurred_at: string;
}

/**
 * Assembles the graph for one recorded access event. Returns `null` when the
 * event id is unknown — the route turns that into a 404 rather than a throw.
 *
 * Resilience is deliberate: `blast_radius` and `divergence` each degrade to
 * `null` on their own rather than failing the request, because the canvas is
 * still worth drawing without them.
 */
export async function buildAccessGraph(
  eventId: string,
): Promise<AccessGraph | null> {
  const db = createAdminClient();

  const { data: eventRow } = await db
    .from("access_event")
    .select("id, identity_id, resource_id, action, occurred_at")
    .eq("id", eventId)
    .maybeSingle();
  const event = (eventRow as AccessEventRow | null) ?? null;
  if (!event) return null;

  const identity = await fetchEmployee(event.identity_id);
  const chain = await walkResourceChain(event.resource_id);
  if (!identity || chain.length === 0) return null;

  const target = chain[0];

  // The delegation edge. An oauth_app reaches only as far as its human does.
  const principal =
    identity.identity_type === "oauth_app" && identity.acts_for
      ? await fetchEmployee(identity.acts_for)
      : null;
  /** The human the permission path actually runs through. */
  const human = principal ?? identity;

  // Re-use the engine's own resolution so the graph can never disagree with
  // the decision about which grant let this through.
  const policy = await resolvePermission(
    event.identity_id,
    event.resource_id,
    event.action,
    event.occurred_at,
  );

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();

  const addNode = (node: GraphNode) => {
    if (nodeIds.has(node.id)) return;
    nodeIds.add(node.id);
    nodes.push(node);
  };
  const addEdge = (edge: Omit<GraphEdge, "id">) => {
    const id = `${edge.kind}:${edge.from}->${edge.to}`;
    if (edges.some((e) => e.id === id)) return;
    edges.push({ id, ...edge });
  };

  // ---- identities ----------------------------------------------------------

  if (principal) {
    addNode({
      id: identity.id,
      kind: "oauth_app",
      label: identity.name,
      sublabel: oauthSublabel(identity),
      sensitivity: null,
      focus: false,
    });
  }

  addNode({
    id: human.id,
    kind: "identity",
    label: human.name,
    sublabel: human.role,
    sensitivity: null,
    focus: false,
  });

  if (principal) {
    addEdge({
      from: identity.id,
      to: human.id,
      kind: "acts_for",
      label: `${identity.name} acts for ${human.name}${
        identity.scope ? ` (${identity.scope})` : ""
      }`,
    });
  }

  // ---- how the human reaches the folder chain ------------------------------

  const chainIds = chain.map((r) => r.id);
  const chainById = new Map(chain.map((r) => [r.id, r]));

  const { data: membershipRows } = await db
    .from("group_membership")
    .select("group_id")
    .eq("employee_id", human.id);
  const humanGroupIds = [
    ...new Set(
      ((membershipRows ?? []) as { group_id: string }[]).map((m) => m.group_id),
    ),
  ];

  // Every permission sitting anywhere on the chain that this human can reach:
  // through one of their groups, or held directly.
  const { data: permissionRows } = await db
    .from("permission")
    .select("*")
    .in("resource_id", chainIds);
  const reachable = ((permissionRows ?? []) as Permission[]).filter((p) =>
    p.subject_type === "group"
      ? humanGroupIds.includes(p.subject_id)
      : p.subject_id === human.id,
  );

  const groupIdsOnPath = [
    ...new Set(
      reachable.filter((p) => p.subject_type === "group").map((p) => p.subject_id),
    ),
  ];
  const groupNames = await fetchGroupNames(groupIdsOnPath);
  const groupMemberNames = await fetchGroupMemberNames(groupIdsOnPath);

  for (const groupId of groupIdsOnPath) {
    const name = groupNames.get(groupId) ?? groupId;
    const members = groupMemberNames.get(groupId) ?? [];
    addNode({
      id: groupId,
      kind: "group",
      label: name,
      sublabel: members.length > 0 ? `members: ${members.join(", ")}` : null,
      sensitivity: null,
      focus: false,
    });
    addEdge({
      from: human.id,
      to: groupId,
      kind: "member_of",
      label: `${human.name} is a member of ${name}`,
    });
  }

  // One grant edge per (subject, resource) pair, actions folded together —
  // "view + download" is one relationship on the picture, not two.
  for (const grant of foldGrants(reachable)) {
    const grantResource = chainById.get(grant.resourceId);
    if (!grantResource) continue;
    addResourceNode(addNode, grantResource, target.id);

    const subjectLabel =
      grant.subjectType === "group"
        ? (groupNames.get(grant.subjectId) ?? grant.subjectId)
        : human.name;

    addEdge({
      from: grant.subjectId,
      to: grantResource.id,
      kind: "grant",
      label: `${subjectLabel} holds ${grant.actions.join(" + ")} on ${
        grantResource.name
      }${grantProvenance(grant, event.occurred_at)}`,
    });
  }

  // ---- containment, walked DOWNWARD from the grant -------------------------

  // The mirror of the engine's upward walk. From the resource the permitting
  // grant sits on, down to everything it reaches — the blast radius, drawn.
  const permitting = policy.permitted ? policy.permission : null;
  const descentRoot = permitting
    ? (chainById.get(permitting.resource_id) ?? target)
    : chain[chain.length - 1];

  const descendants = await descendantsOf(descentRoot.id);
  addResourceNode(addNode, descentRoot, target.id);
  for (const child of descendants) {
    addResourceNode(addNode, child, target.id);
  }
  const containable = [descentRoot, ...descendants];
  for (const child of containable) {
    if (!child.parent_id) continue;
    const parent = containable.find((r) => r.id === child.parent_id);
    if (!parent) continue;
    addEdge({
      from: parent.id,
      to: child.id,
      kind: "contains",
      label: `${parent.name} contains ${child.name}`,
    });
  }

  // The event's own target may sit outside that subtree (a DENY, or a grant
  // held directly on a sibling). Draw it regardless — it is the focus node.
  addResourceNode(addNode, target, target.id);

  // ---- the project boundary ------------------------------------------------

  const project = await fetchProject(
    descentRoot.project_id ?? target.project_id ?? null,
  );
  const projectMembers = project ? await fetchProjectMembers(project.id) : [];

  if (project) {
    addNode({
      id: project.id,
      kind: "project",
      label: project.name,
      sublabel:
        projectMembers.length > 0
          ? `members: ${projectMembers.map((m) => m.name).join(", ")}`
          : project.purpose,
      sensitivity: project.sensitivity,
      focus: false,
    });

    // The project owns the folder the grant sits on where it can; otherwise
    // the resource that was actually asked for.
    const owned =
      descentRoot.project_id === project.id ? descentRoot : target;
    addResourceNode(addNode, owned, target.id);
    addEdge({
      from: project.id,
      to: owned.id,
      kind: "owns",
      label: `${project.name} owns ${owned.name}`,
    });

    // ---- the missing edge. The whole reason this is a graph. ---------------
    const isMember = projectMembers.some((m) => m.id === human.id);
    if (!isMember) {
      addEdge({
        from: human.id,
        to: project.id,
        kind: "absent",
        label: `not a member of ${project.name}`,
      });
    }
  }

  // ---- tier 2: blast radius ------------------------------------------------

  let blast_radius: AccessGraph["blast_radius"] = null;
  try {
    if (permitting) {
      const grantResource =
        chainById.get(permitting.resource_id) ??
        (await fetchResource(permitting.resource_id));
      if (grantResource) {
        const reaches = await descendantsOf(grantResource.id);
        blast_radius = {
          granted_on: grantResource.name,
          granted_reason: permitting.granted_reason,
          last_reviewed_at: permitting.last_reviewed_at,
          reaches: reaches.map((r) => ({
            id: r.id,
            name: r.name,
            sensitivity: r.sensitivity,
          })),
          restricted_count: reaches.filter((r) => r.sensitivity === "restricted")
            .length,
        };
      }
    }
  } catch {
    blast_radius = null;
  }

  // ---- tier 3: membership divergence ---------------------------------------

  let divergence: AccessGraph["divergence"] = null;
  try {
    const grantingGroupId =
      permitting && permitting.subject_type === "group"
        ? permitting.subject_id
        : null;
    if (grantingGroupId && project) {
      const groupName =
        groupNames.get(grantingGroupId) ??
        (await fetchGroupNames([grantingGroupId])).get(grantingGroupId) ??
        null;
      const memberNames =
        groupMemberNames.get(grantingGroupId) ??
        (await fetchGroupMemberNames([grantingGroupId])).get(grantingGroupId) ??
        [];
      if (groupName && memberNames.length > 0 && projectMembers.length > 0) {
        const inGroup = new Set(memberNames);
        const onProject = new Set(projectMembers.map((m) => m.name));
        divergence = {
          group_name: groupName,
          project_name: project.name,
          in_group_not_project: memberNames.filter((n) => !onProject.has(n)),
          in_project_not_group: projectMembers
            .map((m) => m.name)
            .filter((n) => !inGroup.has(n)),
        };
      }
    }
  } catch {
    divergence = null;
  }

  return { nodes, edges, blast_radius, divergence };
}

// ------------------------------------------------------------------ helpers

function addResourceNode(
  addNode: (n: GraphNode) => void,
  resource: Resource,
  focusId: string,
): void {
  addNode({
    id: resource.id,
    kind: resource.type === "folder" ? "folder" : "resource",
    label: resource.name,
    sublabel: resource.category ?? resource.type,
    sensitivity: resource.sensitivity,
    focus: resource.id === focusId,
  });
}

interface FoldedGrant {
  subjectType: "employee" | "group";
  subjectId: string;
  resourceId: string;
  actions: Action[];
  granted_at: string | null;
  granted_reason: string | null;
  last_reviewed_at: string | null;
}

/**
 * "Finance Data Readers holds view + download on finance/" is one edge in the
 * picture even though it is two rows in `permission`. The oldest grant date
 * wins and an unreviewed row makes the whole edge unreviewed — both the
 * conservative reading, and both true of the seeded pair.
 */
function foldGrants(permissions: Permission[]): FoldedGrant[] {
  const folded = new Map<string, FoldedGrant>();
  for (const p of permissions) {
    const key = `${p.subject_type}:${p.subject_id}:${p.resource_id}`;
    const existing = folded.get(key);
    if (!existing) {
      folded.set(key, {
        subjectType: p.subject_type,
        subjectId: p.subject_id,
        resourceId: p.resource_id,
        actions: [p.action],
        granted_at: p.granted_at,
        granted_reason: p.granted_reason,
        last_reviewed_at: p.last_reviewed_at,
      });
      continue;
    }
    if (!existing.actions.includes(p.action)) existing.actions.push(p.action);
    if (
      p.granted_at &&
      (!existing.granted_at ||
        new Date(p.granted_at).getTime() < new Date(existing.granted_at).getTime())
    ) {
      existing.granted_at = p.granted_at;
    }
    existing.granted_reason ??= p.granted_reason;
    if (p.last_reviewed_at === null) existing.last_reviewed_at = null;
  }
  return [...folded.values()];
}

/**
 * The same sentence policy.ts puts on the permission chain, deliberately
 * word-for-word: "granted 6 months ago · for "..." · never reviewed". Measured
 * against the event, never the wall clock — see AGENTS.md rule 1.
 *
 * Duplicated rather than imported because the original is private to policy.ts
 * and that file is not ours to change before a freeze.
 */
function grantProvenance(grant: FoldedGrant, occurredAt: string): string {
  const parts: string[] = [];

  if (grant.granted_at && occurredAt) {
    const months =
      (new Date(occurredAt).getTime() - new Date(grant.granted_at).getTime()) /
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

  if (grant.granted_reason) parts.push(`for "${grant.granted_reason}"`);

  const clauses = [parts.join(" ")].filter(Boolean);
  if (grant.last_reviewed_at === null) clauses.push("never reviewed");

  return clauses.length > 0 ? ` · ${clauses.join(" · ")}` : "";
}

function oauthSublabel(app: Employee): string | null {
  const parts: string[] = [];
  if (app.scope) parts.push(app.scope);
  if (app.last_reviewed_at === null) parts.push("never reviewed");
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** The downward mirror of policy.ts's upward `walkResourceChain`. */
async function descendantsOf(rootId: string): Promise<Resource[]> {
  const db = createAdminClient();
  const out: Resource[] = [];
  const seen = new Set<string>([rootId]);
  let frontier = [rootId];
  let depth = 0;

  while (frontier.length > 0 && depth < MAX_DEPTH) {
    const { data } = await db.from("resource").select("*").in("parent_id", frontier);
    const rows = (data ?? []) as Resource[];
    const next: string[] = [];
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
      next.push(row.id);
    }
    frontier = next;
    depth += 1;
  }
  return out;
}

async function fetchEmployee(id: string): Promise<Employee | null> {
  const { data } = await createAdminClient()
    .from("employee")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as Employee | null) ?? null;
}

async function fetchResource(id: string): Promise<Resource | null> {
  const { data } = await createAdminClient()
    .from("resource")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as Resource | null) ?? null;
}

async function fetchProject(id: string | null): Promise<Project | null> {
  if (!id) return null;
  const { data } = await createAdminClient()
    .from("project")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as Project | null) ?? null;
}

async function fetchGroupNames(ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  const { data } = await createAdminClient()
    .from("user_group")
    .select("id, name")
    .in("id", ids);
  for (const g of (data ?? []) as { id: string; name: string }[]) {
    names.set(g.id, g.name);
  }
  return names;
}

/** Member NAMES, not ids — the divergence is only legible as people. */
async function fetchGroupMemberNames(
  ids: string[],
): Promise<Map<string, string[]>> {
  const byGroup = new Map<string, string[]>();
  if (ids.length === 0) return byGroup;
  const db = createAdminClient();

  const { data: rows } = await db
    .from("group_membership")
    .select("group_id, employee_id")
    .in("group_id", ids);
  const memberships = (rows ?? []) as {
    group_id: string;
    employee_id: string;
  }[];
  if (memberships.length === 0) return byGroup;

  const employeeIds = [...new Set(memberships.map((m) => m.employee_id))];
  const { data: people } = await db
    .from("employee")
    .select("id, name")
    .in("id", employeeIds);
  const nameById = new Map(
    ((people ?? []) as { id: string; name: string }[]).map((e) => [e.id, e.name]),
  );

  for (const m of memberships) {
    const name = nameById.get(m.employee_id);
    if (!name) continue;
    const list = byGroup.get(m.group_id) ?? [];
    list.push(name);
    byGroup.set(m.group_id, list);
  }
  return byGroup;
}

async function fetchProjectMembers(
  projectId: string,
): Promise<Array<{ id: string; name: string }>> {
  const db = createAdminClient();
  const { data: rows } = await db
    .from("project_membership")
    .select("employee_id")
    .eq("project_id", projectId);
  const ids = ((rows ?? []) as { employee_id: string }[]).map(
    (m) => m.employee_id,
  );
  if (ids.length === 0) return [];

  const { data: people } = await db
    .from("employee")
    .select("id, name")
    .in("id", ids);
  return ((people ?? []) as { id: string; name: string }[]).map((e) => ({
    id: e.id,
    name: e.name,
  }));
}
