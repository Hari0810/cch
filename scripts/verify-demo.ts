/**
 * Demo acceptance check.
 *
 * Run this after ANY change, and immediately before the 14:55 rehearsal:
 *   pnpm dev                                                  # one terminal
 *   node --experimental-strip-types scripts/verify-demo.ts    # another
 *
 * Node 22.14 strips types natively — deliberately no tsx/ts-node dependency,
 * so this cannot stall on an npx download at 14:50.
 *
 * It resets, fires the three demo scenarios, and asserts the decisions.
 * Deliberately asserts DECISIONS and BANDS, never exact scores — a
 * pre-declared score would contradict "AI explains, rules decide".
 *
 * Identity and resource ids are looked up BY NAME rather than hardcoded, so
 * this stays correct whatever ids the seed chose.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const APP = process.env.APP_URL ?? "http://localhost:3000";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type Decision = "ALLOW" | "ALLOW_AND_FLAG" | "STEP_UP" | "REQUIRE_APPROVAL";

async function lookup(table: string, name: string): Promise<string> {
  const r = await fetch(
    `${SB}/rest/v1/${table}?select=id,name&name=eq.${encodeURIComponent(name)}`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
  );
  const rows = (await r.json()) as { id: string }[];
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`no ${table} named "${name}" — did the seed run?`);
  }
  return rows[0].id;
}

/**
 * The SAME function the UI calls — imported, not reimplemented.
 *
 * This used to be a local copy ending in `.toISOString()`, which normalises to
 * UTC. Under BST that sent `09:15Z` where the UI sends `10:15+01:00`, so the
 * script was checking an access an hour earlier than the demo performs, outside
 * Alice's 10:04 baseline start. A verifier that does not send what the demo
 * sends is not verifying the demo.
 */
import { occurredAt as todayAt } from "../src/lib/occurred-at.ts";

interface Case {
  label: string;
  identity: string;
  resource: string;
  time: string;
  action: "view" | "download";
  expect: Decision[];
  why: string;
}

const CASES: Case[] = [
  {
    label: "A  ordinary legitimate access",
    identity: "Alice Morgan",
    resource: "Customer Export Schema",
    time: "10:15",
    action: "view",
    expect: ["ALLOW"],
    why: "on the project, active task, familiar type, normal hours",
  },
  {
    label: "N  negative control",
    identity: "Daniel Kim",
    resource: "Acquisition Valuation.xlsx",
    time: "23:20",
    action: "view",
    expect: ["ALLOW", "ALLOW_AND_FLAG"],
    why: "restricted file at 23:20 — allowed because he owns the Nova task",
  },
  {
    label: "C  contextually indefensible",
    identity: "Provenance AI",
    resource: "Acquisition Valuation.xlsx",
    time: "23:40",
    action: "download",
    expect: ["REQUIRE_APPROVAL"],
    why: "permitted via group, but no membership, no task, restricted, off-hours",
  },
];

async function main() {
  console.log("resetting…");
  const reset = await fetch(`${APP}/api/reset`, { method: "POST" });
  if (!reset.ok) throw new Error(`reset failed: ${reset.status} ${await reset.text()}`);

  let failures = 0;

  for (const c of CASES) {
    const [identity_id, resource_id] = await Promise.all([
      lookup("employee", c.identity),
      lookup("resource", c.resource),
    ]);

    const res = await fetch(`${APP}/api/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identity_id,
        resource_id,
        action: c.action,
        occurred_at: todayAt(c.time),
      }),
    });

    if (!res.ok) {
      console.log(`✗ ${c.label}\n    HTTP ${res.status} ${await res.text()}`);
      failures++;
      continue;
    }

    const d = await res.json();
    const ok = c.expect.includes(d.decision);
    if (!ok) failures++;

    console.log(
      `${ok ? "✓" : "✗"} ${c.label}\n` +
        `    decision ${d.decision} (score ${d.risk_score}) — expected ${c.expect.join(" | ")}\n` +
        `    ${c.why}\n` +
        `    reasons: ${(d.policy_reasons ?? []).join(" · ")}`,
    );
  }

  // The contrast is the whole argument: N and C hit the same resource at
  // nearly the same hour and must NOT land on the same decision. If they do,
  // the demo proves nothing regardless of what the individual scores say.
  console.log("");
  if (failures === 0) {
    console.log("all scenarios behaved. contrast holds.");
  } else {
    console.log(`${failures} scenario(s) wrong — the demo is NOT safe to run.`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
