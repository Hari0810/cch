# Cordyceps — extended brief

> The short version lives in [brief.md](brief.md). This is the same product argued
> out in full: what the gap is, why RBAC leaves it open, where we sit next to the
> existing IAM vendors, and what the hackathon build actually has to prove.
>
> **The name is Cordyceps.** The repo carries three (`ContextGate` in the scaffold
> commit, `ContextGuard` in the design thread, `Cordyceps` in `brief.md` and
> `src/app/page.tsx`). Cordyceps wins — it's the distinctive one and it's already
> in the UI. Don't revisit it.

## 1. The gap

Every access-control system in production answers one question:

> **Is this person allowed to open this file?**

Almost none of them answer the second:

> **Is there any reason for this person to be opening this file, right now?**

Alice is a senior engineer. Her role grants her read access to the `finance/`
share — a permission she legitimately needs twice a quarter. Tonight, at 23:40,
she opens the Project Nova acquisition model. She has never touched Project Nova.
She is not on the project. No ticket, no meeting, no task references it.

Every control in the stack says yes. Her credentials are valid. Her MFA passed.
Her role includes the permission. The audit log dutifully records a successful
read. Nobody is paged, because nothing failed.

**The permission was correct. The access was not.** That difference is the product.

The insight is small enough to state as a join:

- `resource_permissions` says Alice **can**.
- `project_memberships` says Alice **isn't working on it**.

Nothing in a conventional stack ever puts those two tables in the same query at
the moment of access. Cordyceps does, in-path, before the bytes move.

## 2. Why this isn't already solved

It looks solved from a distance, which is exactly why it's worth building. Name
the adjacent categories out loud so nobody has to wonder whether you know they exist:

| Category | What it does | What it still misses |
| --- | --- | --- |
| **IAM** (Okta, Entra, Auth0) | Authenticates. Proves you're you. | Says nothing about whether this particular access makes sense. |
| **IGA** (SailPoint, Saviynt) | Governs who *should* hold which entitlements; access reviews. | Operates on a quarterly cadence over entitlements, not on this request. |
| **PAM** (CyberArk, Delinea) | Vaults and brokers privileged credentials. | Scoped to admin/root paths, not everyday data access. |
| **CIEM** | Finds over-permissioned cloud identities. | Posture analysis. Offline. Doesn't intervene. |
| **ITDR / UEBA** (Exabeam, Securonix) | Flags anomalous identity behaviour. | **After the fact.** Detection, not prevention — the file already left. |
| **DLP** | Blocks data by content and destination. | Content-aware, purpose-blind. Legitimate reads and pretexted reads look identical. |
| **ABAC / policy engines** (OPA, Cedar) | Attribute-based rules at request time. | The engine is capable of this; nobody writes or maintains the purpose rules. |

Two categories come genuinely close and deserve a straight answer:

- **JIT access** (Entra PIM, Opal, ConductorOne) makes you *request* elevation with
  a reason. Right instinct, wrong scope: it covers privileged elevation, and once
  granted the window is open for everything in scope. It doesn't evaluate the
  individual read.
- **Purpose-based access control** exists in healthcare — "break-glass" prompts in
  EHRs where a clinician must state why they're opening a chart. It's proven,
  narrow, and manually configured per system.

**Cordyceps is purpose-based access control, generalised, and inferred rather
than declared.** The user doesn't type a justification. The system reads the
context that already exists — project membership, current tasks, calendar,
tickets, behavioural baseline — and decides whether a business reason is present.

The honest summary: the *category* isn't novel. The **synthesis** is — purpose
inference + a synchronous gateway + LLM-explained, deterministically-decided
outcomes, applied to ordinary data access rather than privileged elevation.

## 3. What "context" means concretely

Six signals, all of which already exist in a typical enterprise:

1. **Assignment** — is the user on the project this resource belongs to?
2. **Task** — is there an open ticket or task that plausibly requires it?
3. **Time** — is this within their normal working pattern?
4. **Behavioural baseline** — have they touched resources like this before?
5. **Volume and velocity** — one file, or four hundred in ten minutes?
6. **Sensitivity** — public, internal, confidential, restricted.

None of these individually is enough. A late-night access is not suspicious; a
late-night access to an unrelated confidential project by someone with no task
touching it, at forty files a minute, is a different thing entirely.

## 4. The decision pipeline

Six stages. The ordering matters — the cheap deterministic checks run first, and
the LLM is the *last* thing consulted, not the first.

```
Request → 1. Deterministic policy  → 2. Context retrieval → 3. Graph analysis
        → 4. LLM risk assessment   → 5. Decision          → 6. Human approval
```

1. **Deterministic policy.** Standard RBAC/ABAC. Does the user hold the
   permission at all? A `no` here short-circuits — never reaches the LLM.
2. **Context retrieval.** Pull memberships, tasks, recent access history,
   sensitivity label.
3. **Graph analysis.** Walk the identity→group→permission→resource graph.
   How does this user reach this resource, and what else does that path open up?
4. **LLM risk assessment.** Claude receives the structured context and returns a
   score plus plain-English reasoning. **It scores; it does not decide.**
5. **Decision.** A pure function maps the score to an action against fixed
   thresholds.
6. **Human approval.** High-risk requests route to the resource owner with the
   full reasoning attached, and expire.

### The rule that makes this defensible

> **AI explains. Deterministic rules decide.**

The LLM never has final authority over an access outcome. It produces a risk
assessment; a threshold table turns that into an action. This is the single most
important design decision in the project and it answers four separate judge
questions at once — reliability, auditability, safety, and "what happens when the
model is wrong."

### Thresholds

| Score | Action | What the user sees |
| --- | --- | --- |
| 0–39 | `ALLOW` | Nothing. Normal access. |
| 40–69 | `ALLOW_AND_FLAG` | Nothing. Logged for review. |
| 70–84 | `STEP_UP` | Re-authenticate, or state a purpose. |
| 85–100 | `REQUIRE_APPROVAL` | "Waiting for approval from the Project Nova owner." |

Thresholds live in **one exported object**, so the demo can show them, and
tuning them is a one-line change rather than an archaeology expedition.

### Request time is explicit, never ambient

**The access request carries its own `occurred_at`. The engine never reads
wall-clock `now()` when scoring.**

This is a two-line implementation detail with a demo-killing failure mode behind
it. We present at ~16:35. Alice's baseline is 08:30–19:00. If the time signal
reads the real clock, then on stage the 23:40 access in Scenario C evaluates as
*perfectly normal working hours* — one of the five stacked signals silently
goes to zero, the score drops, and there is no way to diagnose that inside a
three-minute slot.

Consequences, all of them cheap:

- Every time comparison in scoring — working hours, recency, velocity windows,
  dormancy of an OAuth token — takes `occurred_at` from the request. `now()`
  appears nowhere in the scoring path.
- Seeded history is generated **relative to a single seed-time anchor**, not
  hardcoded dates. Re-seeding at any hour produces a coherent world.
- Scenarios become deterministic and replayable. The same request yields the
  same time signal at 11:00 during a rehearsal and at 16:35 on stage.
- **In production the gateway must stamp the time itself.** Caller-supplied
  time is right for a replayable demo and wrong for a real deployment: an
  attacker who can assert their own timestamp can simply claim 10:15. The
  trusted enforcement point stamps it, or it is signed by something that did.
  Only the demo simulator accepts arbitrary scenario time.

**One carve-out:** approval expiry runs on real wall-clock, because a human is
genuinely waiting fifteen minutes. Expiry is the only place `now()` is correct.

### Sample output

```json
{
  "decision": "REQUIRE_APPROVAL",
  "occurred_at": "2026-08-01T23:40:00Z",
  "risk_score": 88,
  "policy_reasons": [
    "Resource is classified as restricted",
    "User is not assigned to Project Nova",
    "No active task establishes a business purpose",
    "Access differs from the user's normal behaviour"
  ],
  "approver": "project-nova-owner",
  "expires_in_minutes": 15
}
```

## 5. Suspend, don't deny

The failure mode of a system like this is not a breach — it's blocking a person
who had a perfectly good reason you didn't have data for.

So the top action is **pause and request approval**, never hard deny. Consequences:

- A false positive costs a colleague ninety seconds, not a lost afternoon.
- The user always sees the reason, in plain English.
- A decision can be contested to the named approver, and the approval row
  records who decided, when, and with what justification. What survives a
  contest is the **system-derived** half of the record — project membership,
  open tasks, the resolved permission path — because those are joins anyone can
  re-run against the same rows. The model's prose summarises them and is not
  evidence in its own right. Caveat, stated so nobody discovers it later: today
  `access_event` stores the decision, score and prose but *not* the context
  snapshot, so a contest raised weeks later re-runs the join against rows that
  may have moved. See [threat-model.md](threat-model.md) §4.
- The approver is the **project/data owner** — Eva owns Project Nova — not a
  security queue. (Daniel owns the file itself; ownership of the *project* is
  what confers authority to release access to it.)

State this explicitly in the pitch. "We suspend, we don't deny" pre-empts the
first question every experienced judge will ask.

### Anti-surveillance posture

This system reads context about employees. That is a real concern and pretending
otherwise is worse than addressing it:

- It evaluates **access events**, not people. No productivity scoring, no ranking.
- Memberships, open tasks and prior accesses are read **at decision time** for
  that decision and not retained. One standing per-person record does exist and
  calling it nothing would be false: `behaviour_profile` holds typical hours,
  project mix, category mix, a files-per-hour percentile and the list of
  projects never touched. It is derived from access history, holds no content —
  no file contents, no message text — and carries no productivity measure. The
  claim we can defend is that what is retained is **small, derived and
  access-shaped**, not that nothing is retained.
- Decisions are shown to the user, not just to security.
- Both sides can read the trail — the employee can see why they were stopped,
  and the reviewer can see who approved what. **Audit rows are ordinary Postgres
  rows**, not cryptographically immutable: no append-only constraint, no hash
  chain, and the engine's service-role key bypasses RLS. What the design does
  buy is that a released access is written as a separate, later row rather than
  as a rewrite of the original. That is a discipline, not a guarantee.

## 6. The OAuth angle (keep it small)

In April 2026, attackers compromised a third-party AI tool's OAuth
integration — an app with reach into many of that vendor's customers — and
pivoted through it into a single Vercel employee account, exposing credentials
for a limited subset of customers. The token was valid. It had been granted
months earlier. Password and MFA were irrelevant — the token bypassed both by
design. (Precise scope in [vercel.md](vercel.md); do not embellish it on stage.)

This is the same shape as the Alice scenario with a non-human identity:
technically permitted, contextually indefensible.

**Scope discipline: this is one seeded node and one sentence of pitch, not a
second product.** Seed a single `oauth_app` row — "Provenance AI, connected 14
months ago, Drive read-all scope" — with an edge to Alice. When the attack path renders,
it shows that Alice's access is reachable through a machine identity nobody has
looked at since it was authorised. One line in the demo:

> "The same check applies to non-human identities — an OAuth token with read-all
> scope granted fourteen months ago has no current business purpose either."

That buys the topicality without doubling the data model. Do **not** build the
full `oauth_grant` / `oauth_scope` / `secret` / `external_vendor` entity set.

## 7. What the hackathon build must prove

Four things, in the order a judge will care:

1. **It's a gateway, not a log reader.** The decision happens *before* access,
   synchronously, in the request path. This is the technical-execution
   differentiator against every UEBA product on the market.
2. **The context join is real.** Traverse actual rows — `resource_permissions`
   vs. `project_memberships` — not a hardcoded scenario.
3. **The AI explains and the rules decide.** Show the reasoning; show the
   threshold table that turned it into an action.
4. **Legitimate access is untouched.** Demo a normal allow *first*, so the block
   lands as discrimination rather than paranoia.

Point 4 is the one most likely to be forgotten under time pressure. A demo that
only ever shows a block looks like a system that blocks everything.

## 8. Explicitly out of scope for today

Named so nobody quietly starts building them:

- Real IdP/SaaS integrations. Seeded Postgres only.
- Full OAuth supply-chain entity model. One node.
- Three graph views. One — the incident attack path.
- Policy authoring UI. Thresholds are a constant.
- Multi-tenancy, RLS hardening, SSO.
- A `features/` layer or any other architecture that pays for itself in month
  three. `app/` + `components/` + `lib/` is correct for a four-hour build.

## 9. Where the pieces live

| Doc | Purpose |
| --- | --- |
| [plan.md](plan.md) | **The live build plan** — rungs, time budget, cut line. |
| [demo-scenario.md](demo-scenario.md) | **Source of truth for the seed** — cast, permissions, scenarios. |
| [brief.md](brief.md) | The original one-page pitch. |
| [threat-model.md](threat-model.md) | **What it defends against, what it does not, and the attacks against Cordyceps itself** — plus failure behaviour and the first-deployment wedge. |
| [judging-criteria.md](judging-criteria.md) | Seven criteria, the judges, the demo beat map. |
| [cursor-hackathon.md](cursor-hackathon.md) | Schedule, partners, submission mechanics. |
| [vercel.md](vercel.md) | The April 2026 incident, with accuracy notes. |
| [../README.md](../README.md) | The submission artefact. |
| [../AGENTS.md](../AGENTS.md) | Conventions and load-bearing rules. |
