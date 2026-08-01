# Build plan — 1 August, code freeze 15:45

> **Updated 12:00.** The contract is written and three workstreams are running
> in parallel against it. Revised from the 11:25 version: Modal is in, the OAuth
> rung is cut to pay for it, and Runware — not Anthropic — is the model provider.

## Credentials — verified, not assumed

Checked live at 11:50 rather than discovered at 14:00.

| | Status | Note |
| --- | --- | --- |
| **Supabase** | ✅ live | `auth/v1/health` 200, PostgREST 200 on service role, schema 14.15 |
| **Runware** | ✅ working | `RUNWARE_API_KEY`, chat completions verified, ~1.5s round trip |
| **Anthropic** | ❌ empty | No key. Not blocking — Runware serves Claude models |
| **Modal** | ⚠️ unauthenticated | CLI 1.5.3 installed, no `~/.modal.toml`. Needs `modal token new` |

## Time budget

| | |
| --- | --- |
| Now | 12:00 |
| Code freeze | 15:45 |
| Reserved — submission artefact (judging-criteria §4.4) | 15:15–15:45 |
| Reserved — rehearsal ×2 | 14:55–15:15 |
| **Available build time** | **~2h55m** |

## The ladder

Rungs, not options. Each is independently demoable — the property that matters
when the clock might beat us.

| Rung | Build | Lands | Proves |
| --- | --- | --- | --- |
| **Contract** | ✅ done | 11:55 | `supabase/schema.sql` + `src/lib/types.ts` |
| **0 — The join** | ✅ done | 12:55 | Context join is real; AI explains, rules decide |
| **1 — Contrast pair + demo mechanics** | ✅ done | 12:55 | Legitimate access untouched; not a sensitivity classifier |
| **M — Modal baselining** | ✅ deployed | 12:40 | Sponsor depth; baseline as computed fact |
| **3a — OAuth identity** | ✅ free | 12:55 | Came back — the contract already carried it |
| **2 — Approval loop** | ✅ done | 12:55 | Suspend-not-deny, audit, human-in-loop, Supabase depth |
| **3b — Access graph** | 🔄 building | ~13:45 | Reopened 12:52 — see below |

### Verified at 13:20 — `scripts/verify-demo.ts`, all three green

| Scenario | Decision | Score (3 runs) |
| --- | --- | --- |
| A — Alice → Customer Export Schema, 10:15 | `ALLOW` | 4, 4, 4 |
| **N — Daniel → Acquisition Valuation.xlsx, 23:20** | **`ALLOW`** | **18, 22, 18** |
| **C — Provenance AI (Alice) → same file, 23:40** | **`REQUIRE_APPROVAL`** | **92, 92, 92** |

**N and C are the same restricted file twenty minutes apart, and they land 18 vs
92.** That is the product argument, reproducible from a script.

An earlier run of this table recorded 12 / 8 / 92 at 12:55. **That was the
verifier's bug, not a regression here** — it built `occurred_at` with
`toISOString()`, normalising to UTC, so it scored every scenario an hour earlier
than the demo performs. Fixed at 13:20; see [handoff.md](handoff.md) §4. The
bands never moved. N is slightly narrower now and more honest: Daniel's genuine
23:20 access takes a modest off-hours bump instead of none, which demonstrates
the hour is a weak signal that does not dominate the verdict.

Confirmed live, not asserted: `x-risk-provider: runware` (real model, not the
fallback); `occurred_at` echoed as `+01:00` rather than normalised to `Z`;
approval routed to Eva Patel with a 15-minute expiry; `oauth_detail` read from
the database rather than a lookup table; and the permission chain rendering as

> Provenance AI acts for Alice Morgan → Alice is a member of Finance Data
> Readers → holds view on finance/ · granted 6 months ago for "Atlas Q1 cloud
> cost attribution" · never reviewed → finance/ contains Acquisition Valuation.xlsx

Baselines came back `source: "modal"` from the deployed endpoint —
`projects_never_touched: ["beacon","nova"]` for Alice is a computed fact, which
is what the model cites in scenario C.

**Parallelism is what bought rung 0 back.** Contract-first — the DDL and the
TypeScript types written as files before anything else — makes schema/seed,
engine and UI genuinely independent: no shared files, no invented column names.
Without that step, three workstreams pay the difference back at integration with
interest.

**Modal stays off the critical path** for the same reason: different language,
different runtime, no shared files. It runs as a fourth workstream alongside
rung 2 rather than after it. The only serial part is `modal token new`, which is
a browser flow and therefore a human's job, not a build step.

**3a came back for free.** It was cut at 11:50 to pay for Modal, but the
contract already carried `acts_for` and `oauth_detail`, so the parallel
workstreams built it anyway. **Scenario C is canonically Provenance AI
delegating Alice** — in the docs, the seed, the UI and `verify-demo.ts`. Plain
Alice remains available through the free-form builder as a fallback.

**3b was reopened at 12:52**, after the earlier cut conflated two different
things. Building *graph analysis* — traversal that feeds the score — was cut for
good reasons and stays cut. But *drawing* the access graph turned out to be a
re-layout of `permission_path`, an array every response already carries: no
engine change, no contract change, no new query. The tier breakdown, the
feasibility line, and the rule that governs it (**the graph explains; it does not
detect**) are in [attack-graph.md](attack-graph.md).

The reopening was worth it for a reason the earlier analysis missed. Reading the
seed back revealed the picture is stronger than the story we had been telling:
`finance-data-readers` is {Daniel, Eva, Alice} while Nova's members are {Daniel,
Eva, Farah}. Alice is in the group but off the project; Farah is on the project
but outside the group. The one never-reviewed grant reaches **three** restricted
files and the demo only ever opens one. None of that was visible in a horizontal
chain, and all of it was already in the database.

## Ground rules — decided, do not revisit

1. **`occurred_at` is explicit.** The request carries it; `now()` appears
   nowhere in scoring. Approval expiry is the sole carve-out. See
   [brief-extended.md](brief-extended.md) §4.
2. **Runware is the model provider.** OpenAI-compatible endpoint at
   `https://api.runware.ai/v1/chat/completions`, model
   `anthropic-claude-sonnet-4-6`. The scorer sits behind the `RiskScorer`
   interface in `types.ts`, so the provider is a five-line adapter — Anthropic
   and a no-credential heuristic fallback are both kept for that reason.
   **Parsing note:** Sonnet returns bare JSON, Haiku wraps it in a markdown
   fence. Strip fences before parsing, always.
3. **Modal runs at seed time, never in the request path.** A cold start inside a
   live access decision is the single most likely way the demo dies. Precomputing
   is also the honest production design — baselining is batch by nature. If a
   judge asks whether Modal is in the decision path, that is the answer, and it
   is a good one rather than a defensive one.
4. **No Supabase Auth.** Nobody logs in during a three-minute demo. An identity
   dropdown is enough. Auth is a 45-minute trap with zero rubric payoff.
5. **Seed rows are hardcoded; decisions never are.** The outcome must fall out
   of the join or the whole product is theatre.
6. **SQL goes into the Supabase SQL editor**, not `supabase init` + migrations.
   Save the tooling ceremony for a project with a week in it.
7. **No ERP surface.** No employee list, no resource catalogue, no dashboard
   stats. Hours spent, nothing scored — brief-extended §8.
8. **All timestamps derive from one `SEED_ANCHOR`.** Re-seeding at any hour
   must produce a coherent world.

---

## Rung 0 — the walking skeleton (75m)

The entire product argument. If everything after this fails, this still demos.

### Schema — ✅ written, needs pasting

Lives in [../supabase/schema.sql](../supabase/schema.sql). **Eleven tables**, not
the six first quoted or the eight after that — `user_group` and
`group_membership` carry Alice's permission path, `behaviour_profile` is the
Modal output, `access_event` doubles as seeded history and evaluated request,
and `approval_request` is rung 2.

`user_group` and `group_membership` are two columns each; without them Alice's
access to Nova is a *direct grant*, which is the contrived version of the story
and the first thing a judge would pull on.

**Manual step:** paste `schema.sql` into the Supabase SQL editor. It drops and
recreates, so it is safe to re-run.

```
employee(id, name, role, department, manager_id,
         identity_type,            -- human | admin | service | oauth_app
         work_hours_start, work_hours_end)

project(id, name, purpose, owner_id, status, sensitivity, started_at, ended_at)

project_membership(employee_id, project_id, role_on_project)

group(id, name)
group_membership(group_id, employee_id)

resource(id, name, type, project_id,
         parent_id,                -- folder inheritance; permissions resolve upward
         owner_id, sensitivity)

permission(id, subject_type,       -- employee | group
           subject_id, resource_id, action,
           granted_at, granted_reason, last_reviewed_at)

task(id, title, project_id, assignee_id, parent_task_id,
     status, due_at, description)
```

Two structural notes, both cheap and both load-bearing:

- **`resource.parent_id`.** "Broad finance share read" only means anything if a
  permission on the folder resolves down to the file. Without it, the group
  permission is an explicit grant on `Acquisition Valuation.xlsx`.
- **`permission.granted_reason` / `last_reviewed_at`.** Buys the pitch line
  *"the permission was correct six months ago"* and the IGA answer: a quarterly
  access review catches this in up to 90 days; we catch it at the read.

### Seed — 10m

Minimum world for rung 0 — Alice, Eva, Daniel; Atlas and Nova; four resources.

- Alice → Atlas membership; **no** Nova membership.
- Alice → `finance-data-readers` group, `granted_reason: "Atlas Q1 cloud cost
  attribution"`, `granted_at: anchor − 6 months`, `last_reviewed_at: null`.
- Group → read on the `finance/` **folder**; `Acquisition Valuation.xlsx` sits
  under it via `parent_id`.
- Tasks: Alice on "Review export schema" (Atlas, open); Daniel on "Prepare
  acquisition model" (Nova, due anchor + 1 day).
- Enough of Alice's access history to make "first-ever Nova access" true.

### Route + engine — 20m

```
POST /api/access
  { identity_id, resource_id, action, occurred_at }
→ { decision, risk_score, occurred_at, policy_reasons[], context{},
    approver?, expires_in_minutes? }
```

```
src/lib/engine/
  policy.ts    resolvePermission() — walks group membership and resource.parent_id.
               A `no` short-circuits and never reaches the model.
  context.ts   memberships, open tasks, recent access, sensitivity
  score.ts     Claude call, zod-validated → { risk_score, reasoning[] }
  decide.ts    THRESHOLDS constant → action. One exported object.
```

The staging is the technical-execution argument (judging-criteria §3.1) — cheap
deterministic checks first, model last, threshold table decides.

### UI — 12m

Replaces the "Coming soon" panel at [src/app/page.tsx:41-43](../src/app/page.tsx#L41-L43),
Dashboard tab only. Employees and Attack stay dead.

- A request trigger (one button; becomes a picker in rung 1).
- **The decision card** — identity, resource, `occurred_at`, decision badge,
  risk score, policy reasons.

Build the card at demo quality now, laid out with the space rung 2's
approve/reject controls will occupy. It is the screen §3.5 scores, and on a flat
rubric UX clarity is worth exactly as much as security impact. Re-layouting it
at 14:00 is not a thing we will have time for.

---

## Rung 1 — the contrast pair (30m)

**Zero new code. Seed rows and two more buttons.** Best ratio in the build.

| # | Request | Decision | Purpose |
| --- | --- | --- | --- |
| A | Alice → Atlas export schema, 10:15 | `ALLOW` | The system doesn't interfere with normal work |
| **N** | **Daniel → `Acquisition Valuation.xlsx`, 23:20** | **`ALLOW`** | **The negative control** |
| C | Alice → `Acquisition Valuation.xlsx`, 23:40 | `REQUIRE_APPROVAL` | The core scenario |

**N is the one that cannot be cut.** Same restricted file, same hour, opposite
outcome — it is the only construction that proves the score comes from the
context join rather than from `sensitivity × hour_of_day`. Without it the three
data points are indistinguishable from a two-factor heuristic, and Price or
Edwards will say so.

Run order in the demo: A → N → C.

Scenario B (Alice → Beacon architecture doc, 20:30, explained by a Julia-assigned
cross-project review) is **optional colour** — include only if rung 2 finished
early. If included it is a clean `ALLOW`, not a flag: every signal a UEBA would
alert on, allowed because a task explains it. That is the version that teaches
the judge something.

Assert decisions and bands, never exact scores — a pre-declared score
contradicts *AI explains, rules decide* and scores 2/5 as hardcoded.

---

## Demo mechanics

**Three buttons, each firing a real `POST /api/access`.** Not a page tour — that
makes the judge watch us narrate instead of watching the system decide. Not one
"Run demo" button either — a scripted sequence reads as a canned animation and
lands on the §3.1 "trivial / hardcoded / demo-only" anchor.

### Screen — one view, no scrolling, no window switching

```
┌─ Request ─────────────────┐  ┌─ Decision ──────────────────┐
│ ▸ Alice   → Export Schema │  │  ALLOW              risk 8  │
│             10:15         │  │  ✓ Assigned to Atlas        │
│ ▸ Daniel  → Valuation.xlsx│  │  ✓ Active task: Review…     │
│             23:20         │  │  ✓ Familiar resource type   │
│ ▸ Alice   → Valuation.xlsx│  └─────────────────────────────┘
│             23:40         │  ┌─ Approval inbox (Eva) ──────┐
└───────────────────────────┘  │  empty                      │
                               └─────────────────────────────┘
```

Each button carries **identity + resource + time on its face**. Buttons 2 and 3
target the same file at nearly the same hour and differ only in *who is asking* —
so two adjacent controls differing by one field produce opposite outcomes, and
the context join is proven visually before a word is said about it.

**Eva's inbox lives on the same screen.** Never a second window: alt-tabbing live
is one of the most common ways a working demo falls apart, and realtime into an
already-visible panel looks identical from the audience.

### The run

| Time | Action | Screen |
| --- | --- | --- |
| 0:00 | The gap — *"permissions answer whether you can; nothing answers whether you should, right now"* | — |
| 0:25 | **Click 1** — Alice → Export Schema | `ALLOW`, three green reasons |
| 0:45 | **Click 2** — Daniel → Valuation.xlsx, 23:20 | `ALLOW`. *"Restricted file, 11pm, allowed — he owns the task"* |
| 1:10 | **Click 3** — Alice → same file, 23:40 | Reasons stack: no membership, no task, restricted, first-ever Nova, burst |
| 1:35 | Point at the **permission chain** on the card | Alice → Finance Data Readers → finance/ → the file. *"Granted six months ago for cost attribution. Never reviewed. The permission was correct — it just stopped being relevant."* |
| 1:55 | — | `REQUIRE_APPROVAL`; approval lands in Eva's inbox live |
| 2:15 | Approve as Eva | Audit row writes, decision updates |
| 2:35 | Threshold table — *"AI explains, rules decide"* | — |
| 2:50 | Integration line — reads from Jira/Linear/GitHub/SAP | — |

Click 2 does the heaviest lifting in the run and costs 25 seconds. It is what
stops a judge concluding we built a sensitivity-and-clock heuristic.

### Two things that stop it looking canned

- **A free-form request builder** below the buttons — identity, resource, time.
  Never used in the scripted three minutes; used in Q&A: *"pick any combination
  you like."* A judge driving it themselves outweighs anything we can say. ~10m
  on top of rung 1, since the route already exists.
- **A collapsed raw-response panel.** Nobody reads it. Its presence says the card
  renders a real response rather than a state machine.

### Non-negotiable practicalities

- **`POST /api/reset` that re-seeds.** ~5m. We run this at least three times —
  two rehearsals and live — and without a reset the second run has stale approval
  state and a false "first-ever Nova access" signal. Insurance against the worst
  failure mode there is: perfect in rehearsal, wrong on stage.
- **Record the fallback clip after the first clean rehearsal (~14:55).**
  judging-criteria §4.4 calls live-demo failure the most common way a Top 5
  project leaves without a placing.

Cost: ~15m on top of rung 1 (buttons are already in scope; reset and JSON panel
are the extras), ~10m more for the builder.

---

## Rung 2 — approval loop (75m)

- `approval_request(id, access_event_id, approver_id, status, expires_at,
  decided_at, decided_by, justification)`
- `audit_event` — or declare the decision row *is* the audit record. Either is
  fine; silence is not (Ashouri will look).
- Owner screen: Eva sees the request with enough context to decide in ten seconds.
- Approve / reject → outcome written → decision card updates.
- **Poll every 2s rather than Supabase realtime** unless realtime is working
  first try. On stage they look identical and the poll cannot fail live.
- **Expiry semantics:** at minute 16, escalate to Julia. Not deny — "suspend,
  don't deny" and a hard expiry are otherwise in tension, and escalation is the
  defensible answer for the Gelberg/Ashouri bloc.

This rung is where §3.7 says the cheapest 5 on the board sits.

## Rung M — Modal behavioural baselining (35m, parallel)

A deployed Modal function that reads the seeded `access_event` history and writes
one `behaviour_profile` row per employee: typical hours, project mix, resource
category mix, p95 files/hour, download ratio, and the list of projects never
touched.

- **Light image — numpy only.** No model download, so it deploys in about a
  minute rather than five. The heavy-image route is where Modal eats an hour.
- **Runs at seed time**, invoked from `POST /api/reset` after seeding. See ground
  rule 3 for why it is not in the request path.
- **What it buys:** scenario C's *"does not normally access finance resources"*
  and *"first-ever Nova access"* become computed facts rather than seeded
  strings. That is the difference between a baseline and a label.
- **Blocked on** `modal token new` — a browser flow, so a human's job.

One sentence in the demo: *"behavioural baselines are computed on Modal from
access history — that's what makes 'she doesn't normally do this' a number."*

## ~~Rung 3a — OAuth identity~~ — cut

Traded for Modal. The schema and seed still carry `identity_type='oauth_app'`,
`acts_for`, `connected_at`, `scope`, `last_reviewed_at` and `last_used_at`, and
Provenance AI is still seeded — so this is **UI work only** if time reappears.
Restore it before anything else.

Until then, scenario C runs as Alice directly. The A/N/C contrast carries the
product argument; the OAuth reveal was topicality on top of it.

## ~~Rung 3b — attack graph~~ — cut

The real graph-analysis rung remains cut. Do not add graph traversal, change the
decision contract, or put a graph on the rehearsed demo path. `@xyflow/react`
stays installed for the eventual implementation.

### Static attack-path placeholder — planned, isolated work only

A presentation-only scaffold may be built without reopening rung 3b. Its job is
to de-risk the visual language and leave a clean integration seam; it must not
claim that graph analysis is implemented.

To keep this from colliding with the approval-loop and demo work:

- Build it in a **separate Git worktree and feature branch**, based on committed
  `HEAD`. The current working tree contains active, uncommitted work from other
  agents.
- Add only uniquely owned files under `src/components/attack-graph/` and an
  unlinked `src/app/attack-preview/` route. Do not edit `src/app/page.tsx`,
  `decision-card.tsx`, `src/lib/types.ts`, the engine, API routes, seed,
  `globals.css`, or either lockfile while scaffolding.
- Keep the preview fixture local to the feature. Show the intended path — Alice
  → Finance Data Readers → `finance/` → Acquisition Valuation.xlsx — with the
  six-month-old grant reason on the permission edge. An optional dashed
  Provenance AI → Alice delegation edge may be visually secondary.
- Mark the screen **Static attack-path preview**. Use a read-only React Flow
  canvas: no connecting, editing or user-authored nodes. Use semantic colour
  tokens only.
- Import React Flow's base stylesheet inside the preview route/layout rather
  than modifying the shared global stylesheet.

The scaffold is done when `/attack-preview` renders directly, lint/build pass
in its worktree, and no request, score, decision or audit behaviour changes.

Integration is a later, separately reviewed change after the main demo path is
green: mount the component behind the existing Attack tab and adapt the live
`decision.permission_path` into view nodes and edges. Do not enrich the shared
contract merely to make placeholder labels prettier; that can be evaluated with
the real graph-analysis rung after the hackathon.

---

## Open decisions

Flagged in review, not yet ruled on. None block rung 0.

1. **Scenario B in or out**, and if in, `ALLOW` or `STEP_UP`. Recommendation:
   out unless there's slack, and `ALLOW` if in.
2. ~~**`risk_score: 82` → `REQUIRE_APPROVAL`** in brief-extended §4's sample output
   contradicts the threshold table.~~ **Resolved** — sample score moved to 88. The
   thresholds stayed put; they are referenced from three docs, the sample score
   from none.
3. **Velocity mechanism.** Seeding the preceding burst events is the cheap
   version; firing four requests and letting the score climb on screen is the
   better beat but costs demo seconds.
4. **Task→resource join semantics.** Recommendation: project-level join is
   primary, resource-level links are a confirming bonus. Needed as an answer
   before Q&A, not before the build.

## What blows the estimate

Ranked. All three surface in rung 0, which is the argument for doing schema and
seed first.

| Risk | Cost | Signal |
| --- | --- | --- |
| Supabase project not provisioned (keys present ≠ project live) | ~20m | First query fails |
| Seed FK typo → context query returns empty | ~10m | Reads as "engine broken" when it isn't |
| Structured output disagreeing with the zod schema | ~5m | Usually one retry |

Clean run puts rung 0 at ~50m and 12:15. Planned at 75m it lands 12:40. Slip
comes out of 3b.
