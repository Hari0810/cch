# Handoff — Cordyceps

**Written 2026-08-01 13:25 BST.** Code freeze 15:45, demo 16:35.
Supersedes the 12:47 version of this file.

State of the world, not a plan. The plan is [plan.md](plan.md); the product
argument is [brief-extended.md](brief-extended.md); the seeded world is
[demo-scenario.md](demo-scenario.md); the threat model is
[threat-model.md](threat-model.md). Read [AGENTS.md](../AGENTS.md) before
touching code.

---

## 1. One line

Every rung has shipped except the access-graph UI, which is mid-build. The
engine, the approval loop and the graph data layer are verified against the live
server. Roughly two hours to freeze with rehearsal and the submission artefact
still to do.

---

## 2. Rung status

| Rung | What | State |
| --- | --- | --- |
| 0 | Schema, seed, contract types | ✅ done |
| 1 | Engine + `/api/access` + dashboard | ✅ done |
| M | Modal behavioural baselining | ✅ done |
| 3a | OAuth delegated identity (`acts_for`) | ✅ done |
| 2 | Approval loop | ✅ done, verified end to end |
| 3b | Access graph — data (`GET /api/graph`) | ✅ done, verified 13:05 |
| 3b | Access graph — UI (`components/attack-graph/`) | 🔄 **in progress, unverified** |
| 3b | Graph analysis feeding the score | ❌ cut, and stays cut |

---

## 3. The numbers, as of 13:25

Three consecutive runs of `node --experimental-strip-types scripts/verify-demo.ts`:

| # | Request | Decision | Score |
| --- | --- | --- | --- |
| A | Alice → Customer Export Schema, 10:15 | `ALLOW` | 4, 4, 4 |
| N | Daniel → Acquisition Valuation.xlsx, 23:20 | `ALLOW` | 18, 22, 18 |
| C | Provenance AI (Alice) → same file, 23:40 | `REQUIRE_APPROVAL` | 92, 92, 92 |

**These are not the numbers the README and older docs quote (A 12 / N 8 / C 92).
They changed at 13:20 and the change is a correction, not a regression** — see §4.
Anything still quoting 8 vs 92 needs updating before submission.

**N versus C remains the argument**: the same restricted file, twenty minutes
apart, 18–22 against 92. Slightly narrower than the old 8-vs-92 and more honest —
Daniel's genuine 23:20 access now takes a modest off-hours bump instead of none,
which demonstrates the hour is a weak signal that does not dominate the verdict.
C is rock-steady at 92 against an 85 threshold.

`verify-demo.ts` asserts **decisions and bands, never exact scores**, and looks
identities up by name, so it survives both score drift and a reseed.

---

## 4. What changed since 12:47, and why it matters

### The acceptance script had been lying to us

`verify-demo.ts` built `occurred_at` with `Date.toISOString()`, which normalises
to UTC. Under BST that sent `09:15Z` where the UI sends `10:15+01:00`. The engine
reads the hour out of the string's own offset, so **the script was evaluating
Alice's access an hour earlier than the demo performs** — outside her 10:04
baseline start.

This is why we spent time on a defect that did not exist. "The model
editorialises about working hours in Scenario A" was **wrong**. The model was
faithfully describing the 09:15 it had been given. Because the script was the
instrument we checked correctness *with*, its own error presented as an error
everywhere else.

Fixed by moving `occurredAt` to [src/lib/occurred-at.ts](../src/lib/occurred-at.ts),
imported by both the UI and the script. The comment in that file explains the
whole trap; read it before touching anything timestamp-shaped.

**The lesson worth keeping:** a verifier that does not send what the demo sends
is not verifying the demo.

### The scorer no longer does date arithmetic

The model was handed raw ISO timestamps and left to subtract. It computed
`connected_at → last_used_at` = 10 months while the card computed
`connected_at → occurred_at` = 14 months — two correct answers to two different
questions, colliding on one screen. The prompt now carries derived quantities and
forbids the model from doing date maths or contradicting them. Scenario N was
inverted the same way ("within normal working hours" at 23:20) and is also fixed.

### The scorer can no longer hang

`AbortSignal.timeout(12s)` on the Runware call. The *error* path always fell
through to the heuristic; the *hang* path did not, and `fetch` with no signal
waits forever behind a loading skeleton with no fallback.

### Three overclaims corrected

"Immutable audit event" was false. "Every decision is contestable" and "not a
dossier" were asserted rather than argued. All three now state the mechanism
that is actually present, with the gaps named. See [threat-model.md](threat-model.md).

---

## 5. Verified end to end

Against the live server, not reasoned about.

**Approval loop:** approve returns a single-use capability scoped to one action
on one resource; re-deciding a settled request **409s**; a mismatched approver
**403s**; rejection returns `access_released: false` and writes **no**
`access_event`; approval writes exactly one `ALLOW_AND_FLAG` release row naming
the approver. Expiry fired unprompted on a stale request and escalated up the org
chart to Julia Evans.

**Graph data** (`GET /api/graph?event=<id>`), Scenario C: 8 nodes, 8 edges,
including the `absent` alice → nova edge labelled "not a member of Nova".
`blast_radius` = 3 restricted descendants. `divergence` = {Alice Morgan} /
{Farah Ahmed}. DENY events still draw a graph with both aggregates null. Unknown
ids 404 rather than throw.

**Also confirmed:** `x-risk-provider: runware` on every call (never the
heuristic); `occurred_at` echoed byte-for-byte with its offset; `oauth_detail`
read from the database; baselines `source: "modal"`, 11 profiles; `POST
/api/reset` → 11 employees, 3 projects, 12 resources, 12 tasks, 32 permissions,
165 access events.

---

## 6. Open, in priority order

1. **Finish and verify the graph UI.** In progress. It briefly left
   `components/attack-graph/access-graph.tsx` as a syntax error that broke the
   dev-server compile; `tsc` is clean as of 13:24 but the component has **not
   been visually confirmed by this session**. Do not assume it renders.
2. **Update the quoted scores.** [README.md](../README.md) and any doc saying
   "8 versus 92" is now stale. The bands are unchanged; the numbers are not.
3. **Rehearse.** Out loud, on the real machine, twice.
4. **Submission artefact**, 15:15–15:45.

### Known and unfixed

- **`access_event` discards the trustworthy half.** It stores decision, score,
  `policy_reasons` and prose — but not `context_summary`, not `permission_path`,
  not `scored_by`. "The system-derived facts are what hold up" is true of the API
  response and false of the stored row. Fixing it needs a schema change and a
  re-paste; documented rather than done.
- **A database outage renders as `DENY`.** Supabase errors are dropped, so
  `resolvePermission` sees null and reports "No permission grants this access".
  Fail-closed direction, wrong label. `writeEvent` also ignores its insert error,
  so a response can carry an `access_event_id` for a row that was never written.
- **`granted_reason` never reaches the model** — it renders into the permission
  path instead, making it an injection surface aimed at the human approver rather
  than at the model.
- **Missing baseline fails open**, the only fail-open in an engine that otherwise
  maps a non-finite score to 100 and `REQUIRE_APPROVAL`.
- **`AccessContext` carries no `occurred_at`**, so absolute durations ("14 months
  before this access") cannot be stated by the model. The wiring is one token
  away: `scoreRisk(ctx)` → `scoreRisk(ctx, request.occurred_at)` in
  [src/app/api/access/route.ts](../src/app/api/access/route.ts). Would need a
  re-verification pass; not done.

### Decided, do not reopen

- **Overmind — dropped, 13:08.** Needs live AWS/GCP/Kubernetes APIs and a
  Terraform plan; this is a seeded org simulation with no infrastructure to
  discover. [judging-criteria.md](judging-criteria.md) is explicit that a faked
  integration costs more than the logo earns.
- **`DATABASE_URL` + `pnpm db:push`** to replace pasting SQL by hand.
  Post-hackathon.
- **Graph analysis feeding the score.** Cut. Drawing the graph is not the same
  thing and is already done.

---

## 7. Running it

```bash
pnpm install
cp .env.example .env.local          # Supabase ×3, RUNWARE_API_KEY, MODAL_SCORING_ENDPOINT
# paste supabase/schema.sql into the Supabase SQL editor
pnpm dev
curl -X POST localhost:3000/api/reset             # seed + compute baselines
node --experimental-strip-types scripts/verify-demo.ts
```

`ANTHROPIC_API_KEY` is **deliberately empty** — Runware serves Claude models over
an OpenAI-compatible endpoint. The scorer is provider-agnostic; swapping is a
~5-line adapter that never touches the engine.

A dev server has been running on port 3000 all session (PID 30665, not started by
this session). A second `pnpm dev` exits 1 — that is the port conflict, not a
build failure.

**pnpm, not npm. `pnpm dlx`, not `npx`.**

---

## 8. Load-bearing decisions

Full list in [AGENTS.md](../AGENTS.md). The ones most easily undone by accident:

- **`occurred_at` comes from the request; `now()` appears nowhere in scoring.**
  Sole carve-out is approval expiry, where a human is genuinely waiting. And
  never construct one by hand — use `occurredAt` from
  [src/lib/occurred-at.ts](../src/lib/occurred-at.ts), for the reason in §4.
- **The model scores; a pure function decides.** `decide()` fails safe to
  `REQUIRE_APPROVAL`. Nothing in `/api/access` may branch on which identity or
  resource is involved.
- **A permission failure short-circuits and never reaches the model.** `DENY` is
  outside the four bands by design and is never routable to an approver — a
  second party must never grant reach IAM never granted.
- **The graph explains; it does not detect.** Delete the graph and every decision
  is byte-identical. Nothing on that canvas may feed a score.
- **Baselines run at seed time on Modal, never in the request path.**
- **"Provenance AI" is the in-app name.** Real-world incident write-ups in
  [vercel.md](vercel.md) keep their original names — never rename a citation.
- **Never commit `.env.local`.** Check `git status` before every push.

---

## 9. Time from here

| | |
| --- | --- |
| 13:25 – 14:00 | finish + visually verify the graph UI; update stale scores |
| 14:00 – 14:55 | slack — band stability, or the `access_event` schema gap if it feels worth the re-paste |
| 14:55 – 15:15 | rehearsal ×2, out loud, on the real machine |
| 15:15 – 15:45 | submission artefact, final push |
| 15:45 | **freeze** |
| 16:35 | 3-minute demo |

Commit and push at every checkpoint. Everything through `823d24a` is on the
remote; a green verifier that exists only on this laptop is not a submission.
