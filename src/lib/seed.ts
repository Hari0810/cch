/**
 * Cordyceps seed — the demo world from docs/demo-scenario.md.
 *
 * Server-only. Uses the service-role client (bypasses RLS).
 *
 * Rule 1 of the seed: ONE anchor. Every timestamp in this file is expressed as
 * an offset from SEED_ANCHOR. There are no calendar dates anywhere, so re-seeding
 * at any hour on any day produces a coherent world.
 *
 * Does NOT seed behaviour_profile — a Modal job computes that from the access_event
 * history written here.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Employee,
  Project,
  Resource,
  Task,
  Permission,
} from "@/lib/types";

// ------------------------------------------------------------------ anchor

/**
 * Today at 00:00 local, computed once. THE reference point for the whole world.
 * Everything below is `SEED_ANCHOR ± offset`.
 */
export const SEED_ANCHOR: Date = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();

function anchorPlusDays(days: number): Date {
  const d = new Date(SEED_ANCHOR);
  d.setDate(d.getDate() + days);
  return d;
}

function anchorPlusMonths(months: number): Date {
  const d = new Date(SEED_ANCHOR);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** ISO string for `anchor + days` at local `hh:mm`. */
function anchorAt(days: number, hour: number, minute: number): string {
  const d = anchorPlusDays(days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

const days = (n: number) => anchorPlusDays(n).toISOString();
const months = (n: number) => anchorPlusMonths(n).toISOString();

function isWeekend(daysAgo: number): boolean {
  const day = anchorPlusDays(-daysAgo).getDay();
  return day === 0 || day === 6;
}

/** Deterministic PRNG so two seeds of the same day produce the same history. */
function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ ids

const E = {
  alice: "alice",
  ben: "ben",
  chloe: "chloe",
  daniel: "daniel",
  eva: "eva",
  farah: "farah",
  george: "george",
  hannah: "hannah",
  isaac: "isaac",
  julia: "julia",
  provenance: "provenance-ai",
} as const;

const P = { atlas: "atlas", nova: "nova", beacon: "beacon" } as const;

const R = {
  atlasFolder: "res-atlas-folder",
  exportSchema: "res-customer-export-schema",
  atlasDashboard: "res-atlas-production-dashboard",
  customersTable: "res-customers-table",
  atlasKey: "res-atlas-export-service-key",
  financeFolder: "res-finance-folder",
  valuation: "res-acquisition-valuation-xlsx",
  contracts: "res-target-company-contracts",
  boardDeck: "res-board-valuation-deck",
  beaconDashboard: "res-beacon-incident-dashboard",
  beaconArchDoc: "res-beacon-architecture-doc",
  handbook: "res-engineering-handbook",
} as const;

const G = {
  engineering: "engineering",
  engineeringLeads: "engineering-leads",
  financeDataReaders: "finance-data-readers",
} as const;

// ------------------------------------------------------------------ cast

// Ordered so manager_id / acts_for FKs always resolve: roots first.
const employees: Employee[] = [
  {
    id: E.julia,
    name: "Julia Evans",
    role: "Engineering Director",
    department: "Engineering",
    manager_id: null,
    identity_type: "admin",
    acts_for: null,
    connected_at: null,
    scope: null,
    last_reviewed_at: null,
    last_used_at: null,
    work_hours_start: "08:00:00",
    work_hours_end: "20:00:00",
  },
  {
    id: E.eva,
    name: "Eva Patel",
    role: "Strategy Lead",
    department: "Strategy",
    manager_id: null,
    identity_type: "human",
    acts_for: null,
    connected_at: null,
    scope: null,
    last_reviewed_at: null,
    last_used_at: null,
    work_hours_start: "08:00:00",
    work_hours_end: "20:00:00",
  },
  {
    id: E.alice,
    name: "Alice Morgan",
    role: "Senior Engineer",
    department: "Engineering",
    manager_id: E.julia,
    identity_type: "human",
    acts_for: null,
    connected_at: null,
    scope: null,
    last_reviewed_at: null,
    last_used_at: null,
    work_hours_start: "08:30:00",
    work_hours_end: "19:00:00",
  },
  {
    id: E.ben,
    name: "Ben Carter",
    role: "Engineer",
    department: "Engineering",
    manager_id: E.julia,
    identity_type: "human",
    acts_for: null,
    connected_at: null,
    scope: null,
    last_reviewed_at: null,
    last_used_at: null,
    work_hours_start: "09:30:00",
    work_hours_end: "18:00:00",
  },
  {
    id: E.chloe,
    name: "Chloe Singh",
    role: "Product Manager",
    department: "Product",
    manager_id: E.julia,
    identity_type: "human",
    acts_for: null,
    connected_at: null,
    scope: null,
    last_reviewed_at: null,
    last_used_at: null,
    work_hours_start: "09:00:00",
    work_hours_end: "17:30:00",
  },
  {
    id: E.daniel,
    name: "Daniel Kim",
    role: "Finance Analyst",
    department: "Finance",
    manager_id: E.eva,
    identity_type: "human",
    acts_for: null,
    connected_at: null,
    scope: null,
    last_reviewed_at: null,
    last_used_at: null,
    work_hours_start: "08:00:00",
    work_hours_end: "18:30:00",
  },
  {
    id: E.farah,
    name: "Farah Ahmed",
    role: "Legal Counsel",
    department: "Legal",
    manager_id: E.eva,
    identity_type: "human",
    acts_for: null,
    connected_at: null,
    scope: null,
    last_reviewed_at: null,
    last_used_at: null,
    work_hours_start: "09:00:00",
    work_hours_end: "17:00:00",
  },
  {
    id: E.george,
    name: "George Wilson",
    role: "Engineer",
    department: "Engineering",
    manager_id: E.julia,
    identity_type: "human",
    acts_for: null,
    connected_at: null,
    scope: null,
    last_reviewed_at: null,
    last_used_at: null,
    work_hours_start: "09:00:00",
    work_hours_end: "18:00:00",
  },
  {
    id: E.hannah,
    name: "Hannah Li",
    role: "Data Scientist",
    department: "Engineering",
    manager_id: E.julia,
    identity_type: "human",
    acts_for: null,
    connected_at: null,
    scope: null,
    last_reviewed_at: null,
    last_used_at: null,
    work_hours_start: "10:00:00",
    work_hours_end: "19:00:00",
  },
  {
    id: E.isaac,
    name: "Isaac Brown",
    role: "Product Manager",
    department: "Product",
    manager_id: E.julia,
    identity_type: "human",
    acts_for: null,
    connected_at: null,
    scope: null,
    last_reviewed_at: null,
    last_used_at: null,
    work_hours_start: "09:00:00",
    work_hours_end: "17:30:00",
  },
  // The non-human identity. Connected 14 months ago by Alice, never reviewed,
  // dormant for 4 months. Scenario C wakes it at 23:40.
  {
    id: E.provenance,
    name: "Provenance AI",
    role: "Third-party document assistant",
    department: null,
    manager_id: null,
    identity_type: "oauth_app",
    acts_for: E.alice,
    connected_at: months(-14),
    scope: "drive.readonly (read all files)",
    last_reviewed_at: null,
    last_used_at: months(-4),
    work_hours_start: null,
    work_hours_end: null,
  },
];

// ------------------------------------------------------------------ projects

const projects: Project[] = [
  {
    id: P.atlas,
    name: "Atlas",
    purpose: "Customer analytics platform",
    owner_id: E.chloe,
    status: "active",
    sensitivity: "internal",
    started_at: months(-9),
    ended_at: null,
  },
  {
    id: P.nova,
    name: "Nova",
    purpose: "Confidential acquisition",
    owner_id: E.eva,
    status: "active",
    sensitivity: "restricted",
    started_at: months(-2),
    ended_at: months(1),
  },
  {
    id: P.beacon,
    name: "Beacon",
    purpose: "Infrastructure monitoring",
    owner_id: E.isaac,
    status: "active",
    sensitivity: "confidential",
    started_at: months(-5),
    ended_at: null,
  },
];

// Alice is on Atlas and NOT on Nova. That absence is the demo.
const projectMemberships = [
  { employee_id: E.alice, project_id: P.atlas, role_on_project: "engineer" },
  { employee_id: E.ben, project_id: P.atlas, role_on_project: "engineer" },
  { employee_id: E.chloe, project_id: P.atlas, role_on_project: "owner" },
  { employee_id: E.julia, project_id: P.atlas, role_on_project: "sponsor" },

  { employee_id: E.daniel, project_id: P.nova, role_on_project: "analyst" },
  { employee_id: E.eva, project_id: P.nova, role_on_project: "owner" },
  { employee_id: E.farah, project_id: P.nova, role_on_project: "counsel" },

  { employee_id: E.george, project_id: P.beacon, role_on_project: "engineer" },
  { employee_id: E.hannah, project_id: P.beacon, role_on_project: "data scientist" },
  { employee_id: E.isaac, project_id: P.beacon, role_on_project: "owner" },
  { employee_id: E.julia, project_id: P.beacon, role_on_project: "sponsor" },
];

// ------------------------------------------------------------------ resources

// Folders first: resource.parent_id is a self-FK.
const resources: Resource[] = [
  {
    id: R.atlasFolder,
    name: "atlas/",
    type: "folder",
    project_id: P.atlas,
    parent_id: null,
    owner_id: E.chloe,
    sensitivity: "internal",
    category: "technical_doc",
  },
  {
    id: R.financeFolder,
    name: "finance/",
    type: "folder",
    project_id: P.nova,
    parent_id: null,
    owner_id: E.eva,
    sensitivity: "restricted",
    category: "financial",
  },
  {
    id: R.exportSchema,
    name: "Customer Export Schema",
    type: "file",
    project_id: P.atlas,
    parent_id: R.atlasFolder,
    owner_id: E.alice,
    sensitivity: "internal",
    category: "technical_doc",
  },
  {
    id: R.atlasDashboard,
    name: "Atlas Production Dashboard",
    type: "dashboard",
    project_id: P.atlas,
    parent_id: null,
    owner_id: E.chloe,
    sensitivity: "confidential",
    category: "ops",
  },
  {
    id: R.customersTable,
    name: "customers table",
    type: "db_table",
    project_id: P.atlas,
    parent_id: null,
    owner_id: E.alice,
    sensitivity: "confidential",
    category: "source",
  },
  {
    id: R.atlasKey,
    name: "Atlas Export Service Key",
    type: "secret",
    project_id: P.atlas,
    parent_id: null,
    owner_id: E.julia,
    sensitivity: "restricted",
    category: "ops",
  },
  // The target of scenarios N and C. Reachable from the finance/ group grant
  // only because of parent_id.
  {
    id: R.valuation,
    name: "Acquisition Valuation.xlsx",
    type: "file",
    project_id: P.nova,
    parent_id: R.financeFolder,
    owner_id: E.daniel,
    sensitivity: "restricted",
    category: "financial",
  },
  {
    id: R.contracts,
    name: "Target Company Contracts",
    type: "file",
    project_id: P.nova,
    parent_id: R.financeFolder,
    owner_id: E.farah,
    sensitivity: "restricted",
    category: "legal",
  },
  {
    id: R.boardDeck,
    name: "Board Valuation Deck",
    type: "file",
    project_id: P.nova,
    parent_id: R.financeFolder,
    owner_id: E.eva,
    sensitivity: "restricted",
    category: "financial",
  },
  {
    id: R.beaconDashboard,
    name: "Beacon Incident Dashboard",
    type: "dashboard",
    project_id: P.beacon,
    parent_id: null,
    owner_id: E.george,
    sensitivity: "confidential",
    category: "ops",
  },
  {
    id: R.beaconArchDoc,
    name: "Beacon Architecture Doc",
    type: "file",
    project_id: P.beacon,
    parent_id: null,
    owner_id: E.isaac,
    sensitivity: "confidential",
    category: "technical_doc",
  },
  {
    id: R.handbook,
    name: "Shared Engineering Handbook",
    type: "file",
    project_id: null,
    parent_id: null,
    owner_id: E.julia,
    sensitivity: "internal",
    category: "technical_doc",
  },
];

// ------------------------------------------------------------------ groups

const userGroups = [
  { id: G.engineering, name: "Engineering" },
  { id: G.engineeringLeads, name: "Engineering Leads" },
  { id: G.financeDataReaders, name: "Finance Data Readers" },
];

const groupMemberships = [
  { group_id: G.engineering, employee_id: E.alice },
  { group_id: G.engineering, employee_id: E.ben },
  { group_id: G.engineering, employee_id: E.george },
  { group_id: G.engineering, employee_id: E.hannah },
  { group_id: G.engineering, employee_id: E.julia },

  { group_id: G.engineeringLeads, employee_id: E.alice },
  { group_id: G.engineeringLeads, employee_id: E.julia },

  // The one that matters. Alice sits in a finance group she no longer needs.
  { group_id: G.financeDataReaders, employee_id: E.daniel },
  { group_id: G.financeDataReaders, employee_id: E.eva },
  { group_id: G.financeDataReaders, employee_id: E.alice },
];

// ------------------------------------------------------------------ permissions

const FINANCE_GRANT_REASON = "Atlas Q1 cloud cost attribution";

const permissions: Permission[] = [
  // ---- group grants
  {
    id: "perm-eng-atlas-folder-view",
    subject_type: "group",
    subject_id: G.engineering,
    resource_id: R.atlasFolder,
    action: "view",
    granted_at: months(-8),
    granted_reason: "Engineering baseline access to the Atlas workspace",
    last_reviewed_at: months(-2),
  },
  {
    id: "perm-eng-atlas-folder-download",
    subject_type: "group",
    subject_id: G.engineering,
    resource_id: R.atlasFolder,
    action: "download",
    granted_at: months(-8),
    granted_reason: "Engineering baseline access to the Atlas workspace",
    last_reviewed_at: months(-2),
  },
  {
    id: "perm-eng-handbook-view",
    subject_type: "group",
    subject_id: G.engineering,
    resource_id: R.handbook,
    action: "view",
    granted_at: months(-12),
    granted_reason: "Company-wide engineering documentation",
    last_reviewed_at: months(-3),
  },
  {
    id: "perm-eng-beacon-arch-view",
    subject_type: "group",
    subject_id: G.engineering,
    resource_id: R.beaconArchDoc,
    action: "view",
    granted_at: months(-4),
    granted_reason: "Cross-team architecture visibility",
    last_reviewed_at: months(-1),
  },
  {
    id: "perm-leads-atlas-key-view",
    subject_type: "group",
    subject_id: G.engineeringLeads,
    resource_id: R.atlasKey,
    action: "view",
    granted_at: months(-7),
    granted_reason: "Credential rotation duty",
    last_reviewed_at: months(-1),
  },

  // ---- THE grant. Correct six months ago; never revoked, never reviewed.
  // Attached to the folder, not the file — Alice reaches Acquisition
  // Valuation.xlsx through resource.parent_id.
  {
    id: "perm-fdr-finance-view",
    subject_type: "group",
    subject_id: G.financeDataReaders,
    resource_id: R.financeFolder,
    action: "view",
    granted_at: months(-6),
    granted_reason: FINANCE_GRANT_REASON,
    last_reviewed_at: null,
  },
  {
    id: "perm-fdr-finance-download",
    subject_type: "group",
    subject_id: G.financeDataReaders,
    resource_id: R.financeFolder,
    action: "download",
    granted_at: months(-6),
    granted_reason: FINANCE_GRANT_REASON,
    last_reviewed_at: null,
  },

  // ---- direct grants (Atlas)
  {
    id: "perm-alice-export-schema-edit",
    subject_type: "employee",
    subject_id: E.alice,
    resource_id: R.exportSchema,
    action: "edit",
    granted_at: months(-9),
    granted_reason: "Owns the Atlas export schema",
    last_reviewed_at: months(-2),
  },
  {
    id: "perm-alice-customers-table-view",
    subject_type: "employee",
    subject_id: E.alice,
    resource_id: R.customersTable,
    action: "view",
    granted_at: months(-9),
    granted_reason: "Owns the customers table",
    last_reviewed_at: months(-2),
  },
  {
    id: "perm-alice-customers-table-edit",
    subject_type: "employee",
    subject_id: E.alice,
    resource_id: R.customersTable,
    action: "edit",
    granted_at: months(-9),
    granted_reason: "Owns the customers table",
    last_reviewed_at: months(-2),
  },
  {
    id: "perm-alice-atlas-dashboard-view",
    subject_type: "employee",
    subject_id: E.alice,
    resource_id: R.atlasDashboard,
    action: "view",
    granted_at: months(-8),
    granted_reason: "Atlas project member",
    last_reviewed_at: months(-2),
  },
  {
    id: "perm-ben-export-schema-edit",
    subject_type: "employee",
    subject_id: E.ben,
    resource_id: R.exportSchema,
    action: "edit",
    granted_at: months(-5),
    granted_reason: "Building the CSV export endpoint",
    last_reviewed_at: months(-1),
  },
  {
    id: "perm-ben-customers-table-view",
    subject_type: "employee",
    subject_id: E.ben,
    resource_id: R.customersTable,
    action: "view",
    granted_at: months(-5),
    granted_reason: "Building the CSV export endpoint",
    last_reviewed_at: months(-1),
  },
  {
    id: "perm-chloe-atlas-folder-edit",
    subject_type: "employee",
    subject_id: E.chloe,
    resource_id: R.atlasFolder,
    action: "edit",
    granted_at: months(-9),
    granted_reason: "Atlas project owner",
    last_reviewed_at: months(-2),
  },
  {
    id: "perm-chloe-atlas-dashboard-edit",
    subject_type: "employee",
    subject_id: E.chloe,
    resource_id: R.atlasDashboard,
    action: "edit",
    granted_at: months(-9),
    granted_reason: "Owns the Atlas production dashboard",
    last_reviewed_at: months(-2),
  },
  {
    id: "perm-julia-atlas-key-edit",
    subject_type: "employee",
    subject_id: E.julia,
    resource_id: R.atlasKey,
    action: "edit",
    granted_at: months(-9),
    granted_reason: "Owns Atlas service credentials",
    last_reviewed_at: months(-1),
  },
  {
    id: "perm-julia-atlas-dashboard-view",
    subject_type: "employee",
    subject_id: E.julia,
    resource_id: R.atlasDashboard,
    action: "view",
    granted_at: months(-9),
    granted_reason: "Engineering director oversight",
    last_reviewed_at: months(-1),
  },

  // ---- direct grants (Nova)
  {
    id: "perm-eva-finance-edit",
    subject_type: "employee",
    subject_id: E.eva,
    resource_id: R.financeFolder,
    action: "edit",
    granted_at: months(-2),
    granted_reason: "Nova project owner",
    last_reviewed_at: months(-1),
  },
  {
    id: "perm-eva-board-deck-edit",
    subject_type: "employee",
    subject_id: E.eva,
    resource_id: R.boardDeck,
    action: "edit",
    granted_at: months(-2),
    granted_reason: "Presents the valuation to the board",
    last_reviewed_at: months(-1),
  },
  {
    id: "perm-daniel-valuation-edit",
    subject_type: "employee",
    subject_id: E.daniel,
    resource_id: R.valuation,
    action: "edit",
    granted_at: months(-2),
    granted_reason: "Owns the acquisition model",
    last_reviewed_at: months(-1),
  },
  {
    id: "perm-farah-finance-view",
    subject_type: "employee",
    subject_id: E.farah,
    resource_id: R.financeFolder,
    action: "view",
    granted_at: months(-2),
    granted_reason: "Nova legal counsel",
    last_reviewed_at: months(-1),
  },
  {
    id: "perm-farah-finance-download",
    subject_type: "employee",
    subject_id: E.farah,
    resource_id: R.financeFolder,
    action: "download",
    granted_at: months(-2),
    granted_reason: "Nova legal counsel",
    last_reviewed_at: months(-1),
  },
  {
    id: "perm-farah-contracts-edit",
    subject_type: "employee",
    subject_id: E.farah,
    resource_id: R.contracts,
    action: "edit",
    granted_at: months(-2),
    granted_reason: "Owns the target-company contract review",
    last_reviewed_at: months(-1),
  },

  // ---- direct grants (Beacon)
  {
    id: "perm-george-beacon-dashboard-edit",
    subject_type: "employee",
    subject_id: E.george,
    resource_id: R.beaconDashboard,
    action: "edit",
    granted_at: months(-5),
    granted_reason: "Owns the Beacon incident dashboard",
    last_reviewed_at: months(-1),
  },
  {
    id: "perm-hannah-beacon-dashboard-view",
    subject_type: "employee",
    subject_id: E.hannah,
    resource_id: R.beaconDashboard,
    action: "view",
    granted_at: months(-5),
    granted_reason: "Beacon project member",
    last_reviewed_at: months(-1),
  },
  {
    id: "perm-isaac-beacon-dashboard-view",
    subject_type: "employee",
    subject_id: E.isaac,
    resource_id: R.beaconDashboard,
    action: "view",
    granted_at: months(-5),
    granted_reason: "Beacon project owner",
    last_reviewed_at: months(-1),
  },
  {
    id: "perm-isaac-beacon-arch-edit",
    subject_type: "employee",
    subject_id: E.isaac,
    resource_id: R.beaconArchDoc,
    action: "edit",
    granted_at: months(-5),
    granted_reason: "Owns the Beacon architecture doc",
    last_reviewed_at: months(-1),
  },

  // ---- handbook, for the people not in the engineering group
  {
    id: "perm-chloe-handbook-view",
    subject_type: "employee",
    subject_id: E.chloe,
    resource_id: R.handbook,
    action: "view",
    granted_at: months(-12),
    granted_reason: "Company-wide engineering documentation",
    last_reviewed_at: months(-3),
  },
  {
    id: "perm-daniel-handbook-view",
    subject_type: "employee",
    subject_id: E.daniel,
    resource_id: R.handbook,
    action: "view",
    granted_at: months(-12),
    granted_reason: "Company-wide engineering documentation",
    last_reviewed_at: months(-3),
  },
  {
    id: "perm-eva-handbook-view",
    subject_type: "employee",
    subject_id: E.eva,
    resource_id: R.handbook,
    action: "view",
    granted_at: months(-12),
    granted_reason: "Company-wide engineering documentation",
    last_reviewed_at: months(-3),
  },
  {
    id: "perm-farah-handbook-view",
    subject_type: "employee",
    subject_id: E.farah,
    resource_id: R.handbook,
    action: "view",
    granted_at: months(-12),
    granted_reason: "Company-wide engineering documentation",
    last_reviewed_at: months(-3),
  },
  {
    id: "perm-isaac-handbook-view",
    subject_type: "employee",
    subject_id: E.isaac,
    resource_id: R.handbook,
    action: "view",
    granted_at: months(-12),
    granted_reason: "Company-wide engineering documentation",
    last_reviewed_at: months(-3),
  },
];

// ------------------------------------------------------------------ tasks

// Parents first: task.parent_task_id is a self-FK.
const tasks: Task[] = [
  {
    id: "task-atlas-export",
    title: "Implement customer export",
    description: "Ship the customer data export feature end to end.",
    project_id: P.atlas,
    assignee_id: E.chloe,
    parent_task_id: null,
    status: "in_progress",
    due_at: days(5),
  },
  {
    // Scenario A's explanation.
    id: "task-atlas-export-schema",
    title: "Review export schema",
    description: "Validate the Customer Export Schema against the customers table.",
    project_id: P.atlas,
    assignee_id: E.alice,
    parent_task_id: "task-atlas-export",
    status: "in_progress",
    due_at: days(2),
  },
  {
    id: "task-atlas-csv-endpoint",
    title: "Add CSV endpoint",
    description: "Expose the export as a streaming CSV endpoint.",
    project_id: P.atlas,
    assignee_id: E.ben,
    parent_task_id: "task-atlas-export",
    status: "in_progress",
    due_at: days(4),
  },
  {
    id: "task-atlas-pipeline",
    title: "Migrate analytics pipeline",
    description: "Move the Atlas analytics pipeline onto the new scheduler.",
    project_id: P.atlas,
    assignee_id: E.alice,
    parent_task_id: null,
    status: "in_progress",
    due_at: days(12),
  },
  {
    id: "task-atlas-dashboard-refresh",
    title: "Q3 dashboard refresh",
    description: "Refresh the Atlas production dashboard for Q3 metrics.",
    project_id: P.atlas,
    assignee_id: E.chloe,
    parent_task_id: null,
    status: "open",
    due_at: days(20),
  },
  {
    // Scenario N's explanation — due tomorrow, which is why Daniel is up at 23:20.
    id: "task-nova-model",
    title: "Prepare acquisition model",
    description: "Finalise the acquisition valuation model ahead of the board review.",
    project_id: P.nova,
    assignee_id: E.daniel,
    parent_task_id: null,
    status: "in_progress",
    due_at: days(1),
  },
  {
    id: "task-nova-contracts",
    title: "Review target-company contracts",
    description: "Legal review of the target company's material contracts.",
    project_id: P.nova,
    assignee_id: E.farah,
    parent_task_id: null,
    status: "in_progress",
    due_at: days(3),
  },
  {
    id: "task-nova-board",
    title: "Present valuation to board",
    description: "Present the Nova valuation and recommendation to the board.",
    project_id: P.nova,
    assignee_id: E.eva,
    parent_task_id: null,
    status: "open",
    due_at: days(6),
  },
  {
    id: "task-beacon-latency",
    title: "Investigate latency incident",
    description: "Root-cause the p99 latency regression seen on the ingest path.",
    project_id: P.beacon,
    assignee_id: E.george,
    parent_task_id: null,
    status: "in_progress",
    due_at: days(1),
  },
  {
    id: "task-beacon-anomaly",
    title: "Train anomaly model",
    description: "Train and evaluate the Beacon infrastructure anomaly model.",
    project_id: P.beacon,
    assignee_id: E.hannah,
    parent_task_id: null,
    status: "in_progress",
    due_at: days(8),
  },
  {
    // Scenario B's explanation. Deliberately no project — cross-cutting work.
    id: "task-arch-review",
    title: "Cross-project architecture review",
    description:
      "Review platform architecture across Atlas and Beacon. Assigned by Julia Evans.",
    project_id: null,
    assignee_id: E.alice,
    parent_task_id: null,
    status: "open",
    due_at: days(7),
  },
  {
    id: "task-atlas-rotate-creds",
    title: "Rotate export service credentials",
    description: "Rotate the Atlas Export Service Key and update consumers.",
    project_id: P.atlas,
    assignee_id: E.julia,
    parent_task_id: null,
    status: "open",
    due_at: days(10),
  },
];

// NOTE: no task anywhere above assigns Alice to a Nova project or a Nova
// resource. "Alice has no task touching Nova" is a query result, not a flag.

// ------------------------------------------------------------------ history

interface AccessEventRow {
  id: string;
  identity_id: string;
  resource_id: string;
  action: "view" | "download" | "edit" | "delete";
  occurred_at: string;
  device: string | null;
  location_risk: "low" | "medium" | "high" | null;
  auth_method: string | null;
  session_type: "password" | "sso" | "oauth_token" | null;
  decision: null;
  risk_score: null;
  policy_reasons: null;
  reasoning: null;
  is_seeded_history: true;
}

const HISTORY_WINDOW_DAYS = 28;

/**
 * Weighted pick from a [value, weight] table.
 */
function pick<T>(rnd: () => number, table: [T, number][]): T {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of table) {
    r -= w;
    if (r <= 0) return v;
  }
  return table[table.length - 1][0];
}

interface HistorySpec {
  identity: string;
  /** Local hours the identity normally works. */
  startHour: number;
  endHour: number;
  /** Resources they touch, weighted. */
  resources: [string, number][];
  actions: [AccessEventRow["action"], number][];
  /** Events per active weekday. */
  perDay: number;
  sessionType: AccessEventRow["session_type"];
  device: string;
  /** Only every Nth weekday is active, to keep volumes plausible. */
  everyNthDay?: number;
}

const HISTORY_SPECS: HistorySpec[] = [
  {
    // Alice — ~40 events, Atlas only, inside 08:30-19:00, low volume, mostly views.
    // This is what makes "Alice has never accessed a Nova resource" true.
    identity: E.alice,
    startHour: 9,
    endHour: 18,
    resources: [
      [R.exportSchema, 10],
      [R.customersTable, 7],
      [R.atlasFolder, 5],
      [R.atlasDashboard, 3],
      [R.handbook, 1],
    ],
    actions: [
      ["view", 33],
      ["edit", 5],
      ["download", 2],
    ],
    perDay: 2,
    sessionType: "sso",
    device: "macbook-pro",
  },
  {
    // Daniel — Nova. Normal-hours volume; the late-night burst is appended below.
    identity: E.daniel,
    startHour: 8,
    endHour: 18,
    resources: [
      [R.valuation, 10],
      [R.financeFolder, 5],
      [R.boardDeck, 4],
      [R.contracts, 2],
    ],
    actions: [
      ["view", 12],
      ["download", 8],
      ["edit", 5],
    ],
    perDay: 2,
    sessionType: "sso",
    device: "thinkpad",
  },
  {
    identity: E.eva,
    startHour: 8,
    endHour: 19,
    resources: [
      [R.boardDeck, 6],
      [R.financeFolder, 4],
      [R.valuation, 3],
      [R.contracts, 2],
    ],
    actions: [
      ["view", 10],
      ["download", 4],
      ["edit", 3],
    ],
    perDay: 1,
    sessionType: "sso",
    device: "macbook-air",
    everyNthDay: 2,
  },
  {
    identity: E.farah,
    startHour: 9,
    endHour: 16,
    resources: [
      [R.contracts, 8],
      [R.financeFolder, 3],
      [R.boardDeck, 1],
    ],
    actions: [
      ["view", 8],
      ["download", 6],
      ["edit", 2],
    ],
    perDay: 1,
    sessionType: "sso",
    device: "macbook-air",
    everyNthDay: 2,
  },
  {
    identity: E.ben,
    startHour: 10,
    endHour: 17,
    resources: [
      [R.exportSchema, 6],
      [R.customersTable, 4],
      [R.atlasFolder, 3],
      [R.handbook, 1],
    ],
    actions: [
      ["view", 10],
      ["edit", 4],
      ["download", 1],
    ],
    perDay: 1,
    sessionType: "sso",
    device: "thinkpad",
    everyNthDay: 2,
  },
  {
    identity: E.chloe,
    startHour: 9,
    endHour: 17,
    resources: [
      [R.atlasDashboard, 7],
      [R.atlasFolder, 3],
      [R.handbook, 1],
    ],
    actions: [
      ["view", 12],
      ["edit", 3],
    ],
    perDay: 1,
    sessionType: "sso",
    device: "macbook-air",
    everyNthDay: 2,
  },
  {
    identity: E.george,
    startHour: 9,
    endHour: 17,
    resources: [
      [R.beaconDashboard, 8],
      [R.beaconArchDoc, 3],
      [R.handbook, 1],
    ],
    actions: [
      ["view", 14],
      ["edit", 2],
      ["download", 1],
    ],
    perDay: 1,
    sessionType: "sso",
    device: "thinkpad",
    everyNthDay: 2,
  },
  {
    identity: E.hannah,
    startHour: 10,
    endHour: 18,
    resources: [
      [R.beaconDashboard, 6],
      [R.beaconArchDoc, 4],
      [R.handbook, 1],
    ],
    actions: [
      ["view", 8],
      ["download", 6],
      ["edit", 2],
    ],
    perDay: 1,
    sessionType: "sso",
    device: "macbook-pro",
    everyNthDay: 2,
  },
  {
    identity: E.isaac,
    startHour: 9,
    endHour: 17,
    resources: [
      [R.beaconArchDoc, 6],
      [R.beaconDashboard, 4],
      [R.handbook, 1],
    ],
    actions: [
      ["view", 12],
      ["edit", 3],
    ],
    perDay: 1,
    sessionType: "sso",
    device: "macbook-air",
    everyNthDay: 3,
  },
  {
    identity: E.julia,
    startHour: 8,
    endHour: 19,
    resources: [
      [R.atlasDashboard, 4],
      [R.atlasFolder, 3],
      [R.beaconDashboard, 3],
      [R.handbook, 2],
      [R.atlasKey, 1],
    ],
    actions: [
      ["view", 14],
      ["edit", 2],
      ["download", 1],
    ],
    perDay: 1,
    sessionType: "sso",
    device: "macbook-pro",
    everyNthDay: 3,
  },
];

/** Alice's cap. The spec says ~40 events over the past few weeks, low volume. */
const ALICE_EVENT_CAP = 40;

/** Daniel's prior late-night Nova sessions — this is what makes scenario N honest. */
const DANIEL_LATE_NIGHT: Array<[number, number, number, string, AccessEventRow["action"]]> = [
  [-3, 22, 40, R.valuation, "view"],
  [-3, 23, 5, R.valuation, "edit"],
  [-6, 23, 15, R.valuation, "download"],
  [-9, 22, 20, R.boardDeck, "view"],
  [-13, 23, 35, R.valuation, "edit"],
  [-17, 22, 55, R.financeFolder, "view"],
  [-21, 23, 10, R.valuation, "download"],
  [-24, 22, 30, R.valuation, "view"],
];

/**
 * Provenance AI's only history: a handful of Atlas reads four months ago,
 * consistent with employee.last_used_at. Nothing on Nova — the token has never
 * touched finance before scenario C.
 */
const PROVENANCE_HISTORY: Array<[number, number, string]> = [
  [-1, 11, R.handbook],
  [-2, 14, R.exportSchema],
  [-3, 15, R.atlasFolder],
];

function buildAccessEvents(): AccessEventRow[] {
  const rows: AccessEventRow[] = [];
  let n = 0;
  const id = () => `ae-seed-${String(++n).padStart(4, "0")}`;

  for (const spec of HISTORY_SPECS) {
    const rnd = mulberry32(
      spec.identity.split("").reduce((a, c) => a + c.charCodeAt(0), 7),
    );
    const nth = spec.everyNthDay ?? 1;
    let weekdayIndex = 0;
    let emitted = 0;

    for (let daysAgo = HISTORY_WINDOW_DAYS; daysAgo >= 1; daysAgo--) {
      if (isWeekend(daysAgo)) continue;
      const active = weekdayIndex++ % nth === 0;
      if (!active) continue;
      if (spec.identity === E.alice && emitted >= ALICE_EVENT_CAP) break;

      for (let k = 0; k < spec.perDay; k++) {
        if (spec.identity === E.alice && emitted >= ALICE_EVENT_CAP) break;
        const span = spec.endHour - spec.startHour;
        const hour = spec.startHour + Math.floor(rnd() * span);
        const minute = Math.floor(rnd() * 60);
        rows.push({
          id: id(),
          identity_id: spec.identity,
          resource_id: pick(rnd, spec.resources),
          action: pick(rnd, spec.actions),
          occurred_at: anchorAt(-daysAgo, hour, minute),
          device: spec.device,
          location_risk: "low",
          auth_method: "sso",
          session_type: spec.sessionType,
          decision: null,
          risk_score: null,
          policy_reasons: null,
          reasoning: null,
          is_seeded_history: true,
        });
        emitted++;
      }
    }
  }

  for (const [daysAgo, hour, minute, resource, action] of DANIEL_LATE_NIGHT) {
    rows.push({
      id: id(),
      identity_id: E.daniel,
      resource_id: resource,
      action,
      occurred_at: anchorAt(daysAgo, hour, minute),
      device: "thinkpad",
      location_risk: "low",
      auth_method: "sso",
      session_type: "sso",
      decision: null,
      risk_score: null,
      policy_reasons: null,
      reasoning: null,
      is_seeded_history: true,
    });
  }

  // Four months dormant, exactly as employee.last_used_at claims.
  const fourMonthsAgo = anchorPlusMonths(-4);
  for (const [dayOffset, hour, resource] of PROVENANCE_HISTORY) {
    const d = new Date(fourMonthsAgo);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, 20, 0, 0);
    rows.push({
      id: id(),
      identity_id: E.provenance,
      resource_id: resource,
      action: "view",
      occurred_at: d.toISOString(),
      device: "provenance-ai-worker",
      location_risk: "low",
      auth_method: "oauth",
      session_type: "oauth_token",
      decision: null,
      risk_score: null,
      policy_reasons: null,
      reasoning: null,
      is_seeded_history: true,
    });
  }

  return rows;
}

// ------------------------------------------------------------------ seed

export interface SeedCounts {
  employee: number;
  project: number;
  project_membership: number;
  user_group: number;
  group_membership: number;
  resource: number;
  task: number;
  permission: number;
  access_event: number;
}

export interface SeedResult {
  anchor: string;
  counts: SeedCounts;
}

type Admin = ReturnType<typeof createAdminClient>;

async function insertAll(
  db: Admin,
  table: string,
  rows: Record<string, unknown>[],
) {
  // One statement per chunk; parents are ordered first in every array above so
  // self-FKs (resource.parent_id, task.parent_task_id, employee.manager_id)
  // resolve regardless of how PostgREST batches.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db.from(table).insert(rows.slice(i, i + CHUNK));
    if (error) {
      throw new Error(`seed: insert into ${table} failed — ${error.message}`);
    }
  }
}

async function wipe(db: Admin, table: string, keyColumn: string) {
  const { error } = await db.from(table).delete().not(keyColumn, "is", null);
  if (error) {
    throw new Error(`seed: delete from ${table} failed — ${error.message}`);
  }
}

/**
 * Wipe and repopulate the demo world. Idempotent — safe to call repeatedly.
 *
 * behaviour_profile is cleared (it references employee) but never written here;
 * the Modal baselining job computes it from the access_event rows we insert.
 */
export async function seed(): Promise<SeedResult> {
  const db = createAdminClient();
  const accessEvents = buildAccessEvents();

  // ---- delete in reverse FK order
  await wipe(db, "approval_request", "id");
  await wipe(db, "access_event", "id");
  await wipe(db, "behaviour_profile", "employee_id");
  await wipe(db, "permission", "id");
  await wipe(db, "task", "id");
  await wipe(db, "resource", "id");
  await wipe(db, "group_membership", "group_id");
  await wipe(db, "user_group", "id");
  await wipe(db, "project_membership", "employee_id");
  await wipe(db, "project", "id");
  await wipe(db, "employee", "id");

  // ---- insert in FK-safe order
  await insertAll(db, "employee", employees as unknown as Record<string, unknown>[]);
  await insertAll(db, "project", projects as unknown as Record<string, unknown>[]);
  await insertAll(db, "project_membership", projectMemberships);
  await insertAll(db, "user_group", userGroups);
  await insertAll(db, "group_membership", groupMemberships);
  await insertAll(db, "resource", resources as unknown as Record<string, unknown>[]);
  await insertAll(db, "task", tasks as unknown as Record<string, unknown>[]);
  await insertAll(db, "permission", permissions as unknown as Record<string, unknown>[]);
  await insertAll(db, "access_event", accessEvents as unknown as Record<string, unknown>[]);

  return {
    anchor: SEED_ANCHOR.toISOString(),
    counts: {
      employee: employees.length,
      project: projects.length,
      project_membership: projectMemberships.length,
      user_group: userGroups.length,
      group_membership: groupMemberships.length,
      resource: resources.length,
      task: tasks.length,
      permission: permissions.length,
      access_event: accessEvents.length,
    },
  };
}
