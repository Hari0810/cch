/**
 * Synthetic file contents, keyed by resource id.
 *
 * SEED DATA, NOT DECISIONS. AGENTS.md ground rule 5 — "seed rows are hardcoded;
 * decisions never are" — is untouched by this file: nothing here influences a
 * score, a band or an outcome. It is the payload the gateway either releases or
 * withholds, and the gateway decides that from the engine and the database.
 *
 * It lives in `src/lib/` and is imported only by a route handler, so it is
 * never bundled into client JS. That matters: the whole point of
 * `POST /api/content` is that the bytes do not leave the server until an access
 * is permitted or an approver releases it. Importing this from a component
 * would ship every file in the map to the browser and quietly undo the feature.
 *
 * A TS map rather than a `resource.content` column, deliberately: a column
 * means re-pasting supabase/schema.sql into the SQL editor by hand (ground rule
 * 7), which is a manual step this build is not paying for. Contents are seed
 * data, so the map is the honest home for them.
 *
 * Every id below is a real seeded resource — see `R` in src/lib/seed.ts.
 * Contents are short, plausible and obviously fabricated: no real company, no
 * real person, no real number.
 */

export interface FileContent {
  /** Matches `resource.name` in the seed, so the dialog header agrees with the card. */
  name: string;
  /** Rendered in a monospace block. Kept to a screenful — a judge reads this on stage. */
  body: string;
}

const CONTENT: Record<string, FileContent> = {
  // The file the demo is about. Provenance AI reaches it at 23:40 and is
  // suspended; Ben is refused outright. When Eva releases it, this is what
  // appears on screen — so it has to read like a real model summary.
  "res-acquisition-valuation-xlsx": {
    name: "Acquisition Valuation.xlsx",
    body: [
      "ACQUISITION VALUATION — PROJECT NOVA            RESTRICTED",
      "Sheet: Summary          Rev 7          Owner: Daniel Okafor",
      "=========================================================",
      "",
      "TARGET                     Meridian Systems Ltd (synthetic)",
      "Deal code                  NOVA-7",
      "Status                     Pre-LOI, exclusivity not signed",
      "",
      "  Metric                        Base      Upside      Down",
      "  ---------------------------------------------------------",
      "  ARR (£m)                      18.4        18.4      18.4",
      "  Growth, next 12m               22%         31%       11%",
      "  Gross margin                   74%         77%       70%",
      "  Net revenue retention         108%        118%       97%",
      "  EV / ARR multiple              6.2x        7.4x      4.8x",
      "  ---------------------------------------------------------",
      "  ENTERPRISE VALUE (£m)         114.1       136.2      88.3",
      "  Less net debt (£m)            (9.6)       (9.6)     (9.6)",
      "  EQUITY VALUE (£m)             104.5       126.6      78.7",
      "",
      "OFFER RANGE                £96m – £112m, cash and paper 70/30",
      "Walk-away                  £118m",
      "Synergies (run-rate, £m)   7.1  — 4.2 cost, 2.9 revenue",
      "Payback                    31 months",
      "",
      "NOTES",
      "  - Two of the top five accounts renew in Q1. Diligence gate.",
      "  - Founder earn-out modelled at 18 months, not the 24 requested.",
      "  - Board deck figures lag this revision by one week.",
      "",
      "SYNTHETIC DEMO DATA — Cordyceps. Not a real company or valuation.",
    ].join("\n"),
  },

  // The benign half of the contrast pair. Alice, in hours, with a matching
  // task: this one just opens.
  "res-customer-export-schema": {
    name: "Customer Export Schema",
    body: [
      "# Customer Export Schema — Atlas            INTERNAL",
      "# v4.2 · owner: Alice Nwosu",
      "",
      "export.customer:",
      "  customer_id      uuid      pk, stable across exports",
      "  account_name     text      trimmed, not normalised",
      "  region           enum      uk | eu | us | apac",
      "  plan_tier        enum      free | team | scale | enterprise",
      "  seats_active     integer   counted at export time, not billed seats",
      "  created_at       timestamptz",
      "  churn_risk       numeric   0.00–1.00, nightly model output",
      "",
      "Rules",
      "  - Never emit email, billing address or card metadata. The export",
      "    feed is read by three downstream teams and is not access-scoped.",
      "  - `churn_risk` is advisory. Do not gate renewals on it.",
      "  - Batches are idempotent by (customer_id, export_run_id).",
      "",
      "Open: add `contract_end` in v4.3 — blocked on the billing migration.",
      "",
      "SYNTHETIC DEMO DATA — Cordyceps.",
    ].join("\n"),
  },

  "res-target-company-contracts": {
    name: "Target Company Contracts",
    body: [
      "TARGET COMPANY CONTRACTS — PROJECT NOVA       RESTRICTED",
      "Diligence bundle 3 of 5 · owner: Farah Haddad (Legal)",
      "",
      "  Ref     Counterparty            Value/yr   Ends      Flag",
      "  -------------------------------------------------------------",
      "  C-101   Northgate Retail          £2.9m   2027-03    CoC",
      "  C-104   Halden Logistics          £1.4m   2026-11    auto-renew",
      "  C-118   Verity Health             £3.6m   2028-01    CoC, exclusive",
      "  C-127   Braemar Energy            £0.8m   2026-09    notice given",
      "",
      "CoC = change-of-control consent required before completion.",
      "",
      "Counsel note: C-118 carries a 90-day consent window. Completion",
      "cannot be scheduled inside it. Braemar's notice is not yet public",
      "and is excluded from the ARR bridge in the valuation model.",
      "",
      "SYNTHETIC DEMO DATA — Cordyceps. No real contract or counterparty.",
    ].join("\n"),
  },

  "res-board-valuation-deck": {
    name: "Board Valuation Deck",
    body: [
      "BOARD VALUATION DECK — PROJECT NOVA           RESTRICTED",
      "For the 14th · owner: Eva Lindqvist · DRAFT, not circulated",
      "",
      "  1  Why now",
      "  2  The target in one slide",
      "  3  Valuation range .......... £96m – £112m",
      "  4  Synergy case ............. £7.1m run-rate",
      "  5  Diligence red flags ...... 2 open (C-118 consent, Q1 renewals)",
      "  6  Financing ................ 70 cash / 30 paper",
      "  7  Ask ...................... approve exclusivity, 60 days",
      "",
      "Speaker note, slide 3: figures trail Acquisition Valuation.xlsx",
      "rev 7 by one week. Reconcile before this leaves the room.",
      "",
      "SYNTHETIC DEMO DATA — Cordyceps.",
    ].join("\n"),
  },

  // Deliberately dull and unrestricted — the baseline a judge can compare the
  // restricted files against.
  "res-engineering-handbook": {
    name: "Shared Engineering Handbook",
    body: [
      "# Shared Engineering Handbook              PUBLIC (internal)",
      "",
      "## On-call",
      "  One primary, one secondary, weekly rotation, handover Monday 10:00.",
      "  Page the secondary after 10 minutes of silence, not before.",
      "",
      "## Deploys",
      "  Trunk-based. Any green commit is deployable. No Friday freeze —",
      "  if you cannot deploy on a Friday you cannot deploy on a Tuesday.",
      "",
      "## Access",
      "  Ask in #eng-access. Grants are scoped to a project and reviewed",
      "  quarterly. A grant that outlives its reason is a finding, not a perk.",
      "",
      "SYNTHETIC DEMO DATA — Cordyceps.",
    ].join("\n"),
  },
};

/** The file body for a resource, or null if nothing synthetic is authored for it. */
export function fileContent(resourceId: string): FileContent | null {
  return CONTENT[resourceId] ?? null;
}

/** True when this resource has previewable contents at all. */
export function hasFileContent(resourceId: string): boolean {
  return resourceId in CONTENT;
}
