/**
 * GET /api/org  →  OrgSnapshot
 *
 * The whole organisation in one round trip. This is a reference screen, not a
 * live one: a judge opens it to check that Cordyceps reasons over real rows,
 * reads it, and leaves. Paginating or streaming it would cost more than it
 * saves at this size.
 *
 * Read-only in the strictest sense. Nothing here writes, nothing here scores,
 * and no field returned implies this endpoint evaluated anything. Every value
 * is either a column or a deterministic count/set-difference over rows — see
 * docs/attack-graph.md §5.
 */

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  OrgGroup,
  OrgGroupGrant,
  OrgOAuthApp,
  OrgPerson,
  OrgProject,
  OrgResource,
  OrgSnapshot,
  PersonRef,
} from "@/components/organisation/types";
import type {
  Employee,
  Permission,
  Project,
  Resource,
} from "@/lib/types";

export const dynamic = "force-dynamic";

interface ProjectMembershipRow {
  employee_id: string;
  project_id: string;
  role_on_project: string | null;
}

interface UserGroupRow {
  id: string;
  name: string;
}

interface GroupMembershipRow {
  group_id: string;
  employee_id: string;
}

/** Stable, human-scannable ordering. Never a ranking — names, not merit. */
const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

export async function GET() {
  try {
    const db = createAdminClient();

    const [
      employees,
      projects,
      projectMemberships,
      groups,
      groupMemberships,
      permissions,
      resources,
    ] = await Promise.all([
      db.from("employee").select("*"),
      db.from("project").select("*"),
      db.from("project_membership").select("*"),
      db.from("user_group").select("*"),
      db.from("group_membership").select("*"),
      db.from("permission").select("*"),
      db.from("resource").select("*"),
    ]);

    for (const result of [
      employees,
      projects,
      projectMemberships,
      groups,
      groupMemberships,
      permissions,
      resources,
    ]) {
      if (result.error) throw new Error(result.error.message);
    }

    const employeeRows = (employees.data ?? []) as Employee[];
    const projectRows = (projects.data ?? []) as Project[];
    const projectMembershipRows = (projectMemberships.data ??
      []) as ProjectMembershipRow[];
    const groupRows = (groups.data ?? []) as UserGroupRow[];
    const groupMembershipRows = (groupMemberships.data ??
      []) as GroupMembershipRow[];
    const permissionRows = (permissions.data ?? []) as Permission[];
    const resourceRows = (resources.data ?? []) as Resource[];

    // ---------------------------------------------------------------- indexes

    const employeeById = new Map(employeeRows.map((e) => [e.id, e]));
    const projectById = new Map(projectRows.map((p) => [p.id, p]));
    const resourceById = new Map(resourceRows.map((r) => [r.id, r]));

    const ref = (id: string | null | undefined): PersonRef | null => {
      if (!id) return null;
      const e = employeeById.get(id);
      return e ? { id: e.id, name: e.name } : null;
    };

    const projectRef = (id: string | null | undefined): PersonRef | null => {
      if (!id) return null;
      const p = projectById.get(id);
      return p ? { id: p.id, name: p.name } : null;
    };

    /** project_id → set of employee_ids on it. */
    const membersOfProject = new Map<string, Set<string>>();
    for (const m of projectMembershipRows) {
      let set = membersOfProject.get(m.project_id);
      if (!set) membersOfProject.set(m.project_id, (set = new Set()));
      set.add(m.employee_id);
    }

    // ------------------------------------------- 1. third-party software

    const oauthApps: OrgOAuthApp[] = employeeRows
      .filter((e) => e.identity_type === "oauth_app")
      .map((e) => ({
        id: e.id,
        name: e.name,
        role: e.role,
        acts_for: ref(e.acts_for),
        scope: e.scope ?? null,
        connected_at: e.connected_at ?? null,
        last_reviewed_at: e.last_reviewed_at ?? null,
        last_used_at: e.last_used_at ?? null,
      }))
      .sort(byName);

    // ------------------------------------------------------- 2. projects

    const orgProjects: OrgProject[] = projectRows
      .map((p) => {
        const members = projectMembershipRows
          .filter((m) => m.project_id === p.id)
          .map((m) => ({
            id: m.employee_id,
            name: employeeById.get(m.employee_id)?.name ?? m.employee_id,
            role_on_project: m.role_on_project,
          }))
          .sort(byName);

        return {
          id: p.id,
          name: p.name,
          purpose: p.purpose ?? null,
          status: p.status,
          sensitivity: p.sensitivity,
          started_at: p.started_at ?? null,
          ended_at: p.ended_at ?? null,
          owner: ref(p.owner_id),
          member_count: members.length,
          members,
        };
      })
      .sort(byName);

    // --------------------------------------------------------- 3. people

    const orgPeople: OrgPerson[] = employeeRows
      .filter(
        (e) => e.identity_type === "human" || e.identity_type === "admin",
      )
      .map((e) => ({
        id: e.id,
        name: e.name,
        role: e.role,
        department: e.department ?? null,
        identity_type: e.identity_type,
        manager: ref(e.manager_id),
        work_hours_start: e.work_hours_start ?? null,
        work_hours_end: e.work_hours_end ?? null,
        projects: projectMembershipRows
          .filter((m) => m.employee_id === e.id)
          .map((m) => ({
            id: m.project_id,
            name: projectById.get(m.project_id)?.name ?? m.project_id,
            role_on_project: m.role_on_project,
          }))
          .sort(byName),
        groups: groupMembershipRows
          .filter((g) => g.employee_id === e.id)
          .map((g) => ({
            id: g.group_id,
            name: groupRows.find((r) => r.id === g.group_id)?.name ?? g.group_id,
          }))
          .sort(byName),
      }))
      .sort(byName);

    // --------------------------------------------------------- 4. groups

    const orgGroups: OrgGroup[] = groupRows
      .map((g) => {
        const memberIds = groupMembershipRows
          .filter((m) => m.group_id === g.id)
          .map((m) => m.employee_id);

        const members: PersonRef[] = memberIds
          .map((id) => ref(id))
          .filter((r): r is PersonRef => r !== null)
          .sort(byName);

        const grants: OrgGroupGrant[] = permissionRows
          .filter((p) => p.subject_type === "group" && p.subject_id === g.id)
          .map((p) => {
            const r = resourceById.get(p.resource_id);
            const onProject = r?.project_id
              ? (membersOfProject.get(r.project_id) ?? new Set<string>())
              : null;

            // Set difference over two membership tables. Reported, not judged.
            const outside: PersonRef[] = onProject
              ? memberIds
                  .filter((id) => !onProject.has(id))
                  .map((id) => ref(id))
                  .filter((x): x is PersonRef => x !== null)
                  .sort(byName)
              : [];

            return {
              id: p.id,
              action: p.action,
              granted_at: p.granted_at ?? null,
              granted_reason: p.granted_reason ?? null,
              last_reviewed_at: p.last_reviewed_at ?? null,
              resource: {
                id: p.resource_id,
                name: r?.name ?? p.resource_id,
                type: r?.type ?? "file",
                sensitivity: r?.sensitivity ?? "internal",
              },
              resource_project: projectRef(r?.project_id),
              members_outside_resource_project: outside,
            };
          })
          .sort(
            (a, b) =>
              a.resource.name.localeCompare(b.resource.name) ||
              a.action.localeCompare(b.action),
          );

        return { id: g.id, name: g.name, members, grants };
      })
      .sort(byName);

    // ------------------------------------------------------ 5. resources

    const orgResources: OrgResource[] = resourceRows
      .map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        sensitivity: r.sensitivity,
        category: r.category ?? null,
        project: projectRef(r.project_id),
        parent: r.parent_id
          ? {
              id: r.parent_id,
              name: resourceById.get(r.parent_id)?.name ?? r.parent_id,
            }
          : null,
        owner: ref(r.owner_id),
      }))
      .sort(byName);

    const snapshot: OrgSnapshot = {
      counts: {
        people: orgPeople.length,
        oauth_apps: oauthApps.length,
        projects: orgProjects.length,
        groups: orgGroups.length,
        grants: orgGroups.reduce((n, g) => n + g.grants.length, 0),
        resources: orgResources.length,
      },
      oauth_apps: oauthApps,
      projects: orgProjects,
      people: orgPeople,
      groups: orgGroups,
      resources: orgResources,
    };

    return NextResponse.json(snapshot);
  } catch (error) {
    // This screen is a reference, never a gate. If the read fails, say so
    // plainly and let the tab degrade — no decision anywhere depends on it.
    return NextResponse.json(
      {
        error: "organisation unavailable",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
