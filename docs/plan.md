# Build plan — 1 August, code freeze 15:45

> Written at 11:25 with the repo at scaffold stage: shadcn installed, Supabase
> clients wired, `@xyflow/react` + Anthropic SDK present, all eight keys in
> `.env.local`. No schema, no seed, no engine, no real UI.

## Time budget

| | |
| --- | --- |
| Now | 11:25 |
| Code freeze | 15:45 |
| Reserved — submission artefact (judging-criteria §4.4) | 15:15–15:45 |
| Reserved — rehearsal ×2 | 14:55–15:15 |
| **Available build time** | **~3h30m** |

## The ladder

Rungs, not options. Each is independently demoable — the property that matters
when the clock might beat us.

| Rung | Build | Cum. | Lands | Proves |
| --- | --- | --- | --- | --- |
| **0 — The join** | 75m | 1h15 | ~12:40 | Context join is real; AI explains, rules decide |
| **1 — Contrast pair + demo mechanics** | 45m | 2h00 | ~13:25 | Legitimate access untouched; not a sensitivity classifier |
| **2 — Approval loop** | 75m | 3h15 | ~14:40 | Suspend-not-deny, audit, human-in-loop, Supabase depth |
| **3a — OAuth identity** | 20m | 3h35 | ⚠️ ~15:00 | Vercel-breach topicality |
| **3b — Attack graph** | 45m | 4h20 | ❌ overruns | Overmind / Edwards resonance — *or* gets dismantled |

**3b is off the table.** Demo mechanics (reset, raw-response panel) added 15m to
rung 1, and that pushes 3a into the 14:55 rehearsal window. Building a graph on
top of that means demoing something unrehearsed to the one judge whose company is
built on graphs — the worst possible trade. It stays a sentence: *"the attack
path is where this goes next, and it's the reason the agent intervenes at all"*
(judging-criteria §4.1).

**The live cut line is now 3a**, and the go/no-go is **14:40**. If rung 2 isn't
green and rehearsable by then, drop the OAuth identity and demo scenario C as
Alice directly. The contrast between A, N and C is the product argument; the
OAuth reveal is topicality on top of it. Losing topicality costs less than
losing a rehearsal.

## Ground rules — decided, do not revisit

1. **`occurred_at` is explicit.** The request carries it; `now()` appears
   nowhere in scoring. Approval expiry is the sole carve-out. See
   [brief-extended.md](brief-extended.md) §4.
2. **No Supabase Auth.** Nobody logs in during a three-minute demo. An identity
   dropdown is enough. Auth is a 45-minute trap with zero rubric payoff.
3. **Seed rows are hardcoded; decisions never are.** The outcome must fall out
   of the join or the whole product is theatre.
4. **SQL goes into the Supabase SQL editor**, not `supabase init` + migrations.
   Save the tooling ceremony for a project with a week in it.
5. **No ERP surface.** No employee list, no resource catalogue, no dashboard
   stats. Hours spent, nothing scored — brief-extended §8.
6. **All timestamps derive from one `SEED_ANCHOR`.** Re-seeding at any hour
   must produce a coherent world.

---

## Rung 0 — the walking skeleton (75m)

The entire product argument. If everything after this fails, this still demos.

### Schema — 12m

Eight tables, not the six quoted earlier. `group` and `group_membership` are
two columns each and they carry Alice's permission path; without them her access
to Nova is a *direct grant*, which is the contrived version of the story and the
first thing a judge would pull on.

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
│ ▸ Alice    → Export Schema│  │  ALLOW              risk 8  │
│              10:15        │  │  ✓ Assigned to Atlas        │
│ ▸ Daniel   → Valuation… │  │  ✓ Active task: Review…     │
│              23:20        │  │  ✓ Familiar resource type   │
│ ▸ Provenance AI → Valuation…│  └─────────────────────────────┘
│   (delegating Alice) 23:40│  ┌─ Approval inbox (Eva) ──────┐
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
| 1:10 | **Click 3** — Provenance AI → same file, 23:40 | Reasons stack: no membership, no task, restricted, first-ever Nova, burst |
| 1:35 | Expand the **"via Provenance AI"** chip | 14-month-old token, dormant 4 months, never reviewed |
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

## Rung 3a — OAuth identity (20m)

`identity_type = 'oauth_app'` on employee, plus `acts_for` and `last_used_at`.
Seed **Provenance AI**: connected anchor − 14 months, Drive read-all, never
reviewed, `last_used_at` anchor − 4 months.

The request arrives as `Provenance AI (delegated: Alice)`. The UI leads with
Alice's name because she is the principal; the reveal is expanding a *"via
Provenance AI"* chip. True to the data rather than narrated twice.

"A dormant token woke up at 23:40" is the cheapest strong signal available and
it is exactly the Vercel shape.

## Rung 3b — attack graph (45m, conditional)

`@xyflow/react` is installed. Alice → Engineering Leads → finance/ share → Nova
acquisition model, with the permission provenance on the edge.

Go/no-go 14:45. See the cut line above.

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
