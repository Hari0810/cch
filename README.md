# Cordyceps

**Your permissions say what you *can* open. Cordyceps decides whether you *should* — right now.**

Every access-control system in production answers one question: *is this person
allowed to open this file?* Almost none answer the second: *is there any reason
for this person to be opening it, at this moment?*

Alice is a senior engineer. Six months ago she was added to a finance data group
for a cost-attribution project. That project ended. The group membership was
never revoked. Tonight, a third-party integration using her delegated
credentials downloads the Project Nova acquisition model.

Every control in the stack says yes. Her permission is valid. The audit log
records a successful read. Nobody is paged, because nothing failed.

**The permission was correct. The access was not.** That gap is the product.

---

## What it does

Cordyceps sits **in the request path** and evaluates each access *before* the
bytes move. It puts two tables in the same query that nothing in a conventional
stack joins at decision time:

- `permission` says Alice **can**.
- `project_membership` and `task` say Alice **isn't working on it**.

```
Request → 1. Deterministic policy → 2. Context retrieval
        → 3. Risk assessment (LLM) → 4. Threshold mapping → 5. Human approval
```

Cheap deterministic checks run first. **A permission failure short-circuits and
never reaches the model** — returning `DENY`, deliberately outside the risk
bands, because a second party must never be able to grant reach that IAM never
granted. Cordyceps narrows access; it must never become a way to widen it.

| Score | Action |
| --- | --- |
| 0–39 | `ALLOW` |
| 40–69 | `ALLOW_AND_FLAG` |
| 70–84 | `STEP_UP` |
| 85–100 | `REQUIRE_APPROVAL` |

**High risk suspends; it never denies.** Access is held pending the project
owner's approval, with a 15-minute expiry. The failure mode is a delay with a
named human attached, not a lockout.

## The demo, in three clicks

Reproducible via `scripts/verify-demo.ts`:

| # | Request | Decision | Score |
| --- | --- | --- | --- |
| A | Alice → Customer Export Schema, 10:15 | `ALLOW` | 4 |
| **N** | **Daniel → Acquisition Valuation.xlsx, 23:20** | **`ALLOW`** | **18–22** |
| **C** | **Provenance AI (for Alice) → same file, 23:40** | **`REQUIRE_APPROVAL`** | **92** |

Scores are from three consecutive runs at temperature 0.2 — A was 4 every time,
C was 92 every time, N moved between 18 and 22. The script asserts **decisions
and bands, never exact scores**, and looks identities up by name, so it survives
both score drift and a reseed.

**N and C are the same restricted file, twenty minutes apart, and they land 18
versus 92.** That contrast is the whole argument. A late-night read of a
restricted finance document is *fine* when the person owns the task that needs
it. The score comes from work context — not from a sensitivity label and a clock.

Daniel's 23:20 access takes a modest off-hours bump and is allowed anyway. That
is the point rather than a blemish on it: the hour is a **weak signal that does
not dominate the verdict**, which is what stops the system penalising anyone who
does not work nine to five.

For C, the model cites facts the system computed rather than facts we seeded:

```
Not a member of Project Nova
No open tasks reference Project Nova
Alice has never previously accessed Project Nova
Project Nova is in Alice's projects-never-touched baseline
Resource is a restricted financial file on a restricted project
OAuth app has never been reviewed since it was granted
OAuth scope is broad (drive.readonly), not scoped to specific resources
```

And the permission chain carries its own provenance:

> Provenance AI acts for Alice Morgan → Alice is a member of Finance Data
> Readers → holds view on `finance/` · **granted 6 months ago for "Atlas Q1
> cloud cost attribution" · never reviewed** → `finance/` contains
> Acquisition Valuation.xlsx

## Running it

```bash
pnpm install
cp .env.example .env.local          # fill in Supabase + Runware
# paste supabase/schema.sql into the Supabase SQL editor
pnpm dev
curl -X POST localhost:3000/api/reset             # seed + compute baselines
node --experimental-strip-types scripts/verify-demo.ts
```

## Stack

| | |
| --- | --- |
| **Supabase** | Postgres for the org graph, permissions, history and audit trail |
| **Modal** | Behavioural baselining — computes each employee's typical hours, project mix, category mix and never-touched projects from access history |
| **Runware** | LLM inference (`anthropic-claude-sonnet-4-6`) for risk assessment and plain-English reasoning |
| **Next.js 16** | App Router, React 19, Tailwind v4, shadcn/ui |

Baselines are computed **at seed time, never in the request path** — a cold
start inside a live access decision is unacceptable latency, and periodic
baselining is the honest production design anyway.

## Where this sits

Not a replacement for IAM — a layer in front of it.

| Category | What it misses |
| --- | --- |
| IAM (Okta, Entra) | Authenticates. Silent on whether *this* access makes sense. |
| IGA (SailPoint) | Quarterly entitlement reviews, not this request. |
| UEBA (Exabeam) | Detects after the fact. The file already left. |
| DLP | Content-aware, purpose-blind. |
| Conditional Access (Entra, Google CAA) | Real-time signals — device, location, session risk — but **no notion of what you are currently working on**. |

Conditional-access platforms already do runtime enforcement, and do it well. The
distinction is narrower and more honest than "nobody does this": **work-purpose
context evaluated at the individual resource action**. Nothing on the market
joins project membership and open tasks to a specific read at the moment it
happens.

## Honest limitations

Written down rather than discovered in Q&A:

- **The approver is not authenticated.** The approve/reject control is
  simulated. Production would inherit approver identity from the IdP.
- **Request time is caller-supplied** so scenarios stay replayable. In
  production the gateway must stamp it — a caller that can assert its own
  timestamp can assert office hours.
- **`policy_reasons` are model-authored.** The system-derived facts in
  `context_summary` are what hold up under scrutiny; the prose summarises them.
- **The behavioural profile is real data about employees.** It is minimised —
  hours, project mix, category mix, volume — and used only to answer whether a
  specific access fits a pattern. No productivity scoring, no ranking.
- **Audit rows are ordinary database rows**, not cryptographically immutable.
- **This is a seeded simulation.** No live Drive, Okta or Jira integration.

## Docs

| | |
| --- | --- |
| [docs/brief-extended.md](docs/brief-extended.md) | The product argued in full |
| [docs/plan.md](docs/plan.md) | Build plan, decisions, cut lines |
| [docs/demo-scenario.md](docs/demo-scenario.md) | The seeded world |
| [AGENTS.md](AGENTS.md) | Conventions and load-bearing rules |

Built at the Cursor Cybersecurity London hackathon, 1 August 2026.
