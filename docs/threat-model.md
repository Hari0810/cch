# Threat model — Cordyceps

> What this system is for, what it is not for, and how it can be attacked —
> including the attacks against Cordyceps itself. Written against the build as
> it stands on 1 August 2026, not against the product it would like to be.
> Where the code and the pitch disagree, the code wins and it is written down
> here.
>
> Companion documents: [brief-extended.md](brief-extended.md) for the argument,
> [handoff.md](handoff.md) for what is verified, [../README.md](../README.md)
> for the short honest limitations list.

---

## 1. Trust boundaries

| Component | Trusted? | What follows |
| --- | --- | --- |
| The gateway — [`/api/access`](../src/app/api/access/route.ts) and `src/lib/engine/*` | **Yes** | It is the enforcement point. Compromise it and nothing below matters. In production it must also be the thing that stamps time and resolves identity, neither of which it does today. |
| Postgres (Supabase) | **Yes** | Source of the org graph *and* of the audit trail. Reached with the service-role key, which bypasses RLS entirely ([`admin.ts`](../src/lib/supabase/admin.ts)). Anything holding that key can rewrite history. |
| The seed / upstream systems of record | **Yes** | The join is exactly as good as the IdP, Jira and HR feeds behind it. Their integrity is a **dependency we assume**, not something we verify. |
| The caller | **No** | Supplies `identity_id`, `resource_id`, `action` and `occurred_at`. In this build none of those are authenticated — see §4. |
| The model | **No** | Its output reaches the system as one validated number and two prose fields. No code branches on the prose. |
| The third-party app (Provenance AI) | **No** | It is the *subject* of a decision, never a participant in one. |
| The approver | **As a human, yes** | Not authenticated as an identity in this build — see §4, A2. The routing check is not an identity check. |

---

## 2. What Cordyceps defends against

All four have the same shape: **every control in the stack correctly says yes.**
Nothing failed, so nothing was paged.

| Path | What it looks like | What actually fires |
| --- | --- | --- |
| **Valid-credential insider** | An authenticated employee with a genuine permission reads something no current work explains. | The membership and task joins in [`context.ts`](../src/lib/engine/context.ts) return empty. Absence of a business purpose is the signal, and it is evaluated before the bytes move. |
| **Stale entitlement** | A permission that was correct six months ago, for a project that has closed. | The permission still resolves — Cordyceps does not second-guess IAM. The score comes from *current* work being absent. Grant age and `last_reviewed_at` ride along on the permission path as provenance for the human ([`policy.ts`](../src/lib/engine/policy.ts)). |
| **Permission survived the project ending** | Nobody revoked it because no event triggered a review. | Same mechanism, different cause. Worth separating because the remediation differs: the first is a bad grant, this is a missing lifecycle hook. Cordyceps catches both at the same place — the moment of use. |
| **Delegated OAuth** | A third-party app holding a broad scope, acting for a human, months after anyone last looked at it. | The app is scored against **the human's** context, because it has no tasks or working hours of its own. Scope, connection date and review status are read from the row and put in front of the approver. |

The common claim is narrow and worth stating narrowly: **work-purpose context,
evaluated at the individual resource action.** Not anomaly detection, not
sensitivity labelling, not a clock.

---

## 3. What Cordyceps does not defend against

Stated plainly, because a judge or a buyer will find these anyway and it is
cheaper to have named them first.

| Out of reach | Why |
| --- | --- |
| **Anything before authentication** | Credential theft, phishing, infostealers, session hijacking. Cordyceps starts after the identity is established and takes it as given. If the attacker is operating as Alice, Cordyceps sees Alice — and correctly so. This is upstream, and it is the whole first half of the [Vercel chain](vercel.md). |
| **A determined insider with a genuine task** | Context *is* the signal. Get yourself assigned to the project, or open a plausible ticket a week in advance, and the join returns a reason. This is the honest ceiling of purpose inference: it raises the cost of an access from zero to *leaving a written record of intent in advance*. That is a real cost and it is not prevention. |
| **Collusion with the approver** | Suspend-don't-deny puts a named human in the path. If that human is in on it, the approval releases the access and the trail records it as legitimate. The record still names them, which is the only thing this design buys. |
| **Exfiltration by a route that misses the gateway** | Direct database access, a backup, a snapshot, a sync client, a screenshot, a photograph of a screen. Cordyceps is only as complete as the set of paths routed through it. In this build that set is one API. |
| **The model being wrong** | Two directions, deliberately asymmetric costs — a false low allows and flags, a false high costs a colleague a delay with a named approver. But a *systematically* miscalibrated model degrades quietly toward allow-everything, and **nothing in this build measures calibration**. No drift monitoring, no per-band precision, no sampling of `ALLOW` decisions for review. That is the largest unaddressed operational gap. |

---

## 4. Attacks against Cordyceps itself

### A1 — Caller-supplied `occurred_at`

The request carries its own timestamp and the scoring path never reads `now()`
([`context.ts`](../src/lib/engine/context.ts), [`policy.ts`](../src/lib/engine/policy.ts)).
This is deliberate and load-bearing for a replayable demo, and it is a
**forgeable input**: a caller who can assert their own timestamp can assert
office hours, assert grant recency, and shift the velocity window.

Mitigated today only by **convention** — nothing validates it. In production the
gateway must stamp the time itself, or accept it only when signed by something
that did. Only a simulator may pass arbitrary scenario time.

Blast radius is bounded: time is a supporting signal, and the system prompt says
so explicitly ("being outside working hours is WEAK evidence on its own"). The
load-bearing signals — membership, open tasks, prior access — are joins the
caller cannot influence through this field.

### A2 — The approver is not authenticated

[`decideApproval`](../src/lib/engine/approval.ts) checks that
`input.approver_id` matches `row.approver_id`. **That is routing, not
authentication.** It stops a request being answered by someone it was never
addressed to; it does nothing to stop someone claiming to be Eva. The check is
correct for what it is and useless as a security control, and the code says so
in place.

Consequence: in this build, approvals are spoofable by anyone who can reach the
endpoint, which makes the human-in-the-loop stage a UX demonstration rather than
an enforcement one. Production inherits approver identity from the IdP; there is
no design work outstanding here, only integration.

### A3 — Prompt injection through attacker-influenceable strings

[`buildUserPrompt`](../src/lib/engine/score.ts) serialises real database strings
into the model prompt: employee and app names, roles, resource names, project
names, **open task titles**, and the OAuth scope string. In a real deployment
several of those are writable by the person being scored — anyone can name a
Jira ticket. Today they come only from the seed, so this is a production concern,
not a demo one.

**The structural mitigation is the reason "AI explains, rules decide" is not a
slogan.** The only model output the system acts on is `risk_score`, validated to
0–100 by zod and clamped again by [`clampScore`](../src/lib/engine/decide.ts);
[`decide()`](../src/lib/engine/decide.ts) is a pure function from that number to
an action. A successful injection can **lower a score**. It cannot emit a
decision, cannot release a held access, cannot re-address an approval, and cannot
return a score of 200 to force a band — zod rejects out-of-range scores outright.

Two second-order surfaces are real and worth naming:

- Injected text can land in `policy_reasons` / `reasoning`, which are **shown to
  the affected user and to the approver** and stored on the `access_event` row.
  The realistic payload is not "grant access" — it is prose designed to be read
  by a hurried human on the approval screen. Rendering is via React, so it is
  text and not markup, but it is still attacker-chosen text in front of a
  decision-maker.
- `granted_reason` **does not reach the model at all** — contrary to what one
  might assume from the pipeline description. It flows through
  [`grantProvenance`](../src/lib/engine/policy.ts) into the permission-path
  label, and from there onto the approver's screen. So it is an injection
  surface against *the human*, bypassing the model entirely.

### A4 — `policy_reasons` are model-authored

The audit narrative is model-influenced even though the system-derived facts are
not. `context_summary` (project membership, matching task count, first access to
project, sensitivity, OAuth detail) and `permission_path` are computed by the
engine from rows. `policy_reasons` and `reasoning` are written by the model.

Two known defects already demonstrate the gap concretely — the model asserting
"outside normal working hours" when the context chip correctly reads *no*, and
asserting "approximately 10 months" next to a panel that computes 14 from the
same field (see [handoff.md §5](handoff.md#5-known-defects-and-open-items)).
Neither moved a band. Both are the prose disagreeing with the facts on the same
card.

**Additional gap found while writing this document:** `access_event` persists
`decision`, `risk_score`, `policy_reasons` and `reasoning`, but **not**
`context_summary`, **not** `permission_path`, and **not** `scored_by`
([schema.sql](../supabase/schema.sql)). So the stored audit row keeps the
model prose and discards the system-derived facts that are supposed to be the
trustworthy half — they are reconstructible by re-running the joins, but only
against rows that may since have changed. The row also does not record whether
the score came from the model or the heuristic fallback, even though the
response body and the `x-risk-provider` header do.

### A5 — Audit rows are ordinary mutable Postgres rows

`access_event` and `approval_request` are plain tables. No append-only
constraint, no hash chain, no signature, no write-once storage, no RLS (the
engine uses the service-role client, which bypasses it in any case). Anything
holding the service-role key can update or delete any decision after the fact,
and nothing would detect it.

Calling this "an immutable audit event" would be false, and the README does not.
What the design *does* buy is that a released access is written as a **separate,
later row** rather than as a rewrite of the original — what happened at 23:40
stays what happened at 23:40. That is a discipline, not a guarantee.

---

## 5. Failure behaviour

What happens **today**, read out of the code rather than assumed. Marked
**handled** or **known and unhandled** — the second category is not a defect
list, it is the honest edge of a one-day build.

| Failure | What happens today | Status |
| --- | --- | --- |
| Provider returns non-2xx, refuses the connection, or returns no content | [`scoreRisk`](../src/lib/engine/score.ts) catches, runs `heuristicScorer` over the same context, and returns provider `runware-then-heuristic`. Disclosed in the `x-risk-provider` response header **and** in `scored_by` in the body — a degraded scorer that hides itself is worse than no audit record. | **Handled** |
| Provider accepts the connection and hangs | `AbortSignal.timeout(12s)` on the scorer's `fetch` ([`score.ts`](../src/lib/engine/score.ts)). The abort throws, and the throw lands on the same catch as any other provider error — heuristic fallback, disclosed as `runware-then-heuristic`. 12s is generous against a ~1.5s observed round trip and short enough that the fallback still answers inside a demo's patience. | **Handled.** Fixed at 13:20 (`823d24a`) and re-verified. This row previously read "known, unhandled" — the *error* path always fell through, the *hang* path did not, and `fetch` with no signal waits indefinitely behind a loading skeleton. |
| Model returns prose around the JSON, or wraps it in a markdown code fence | `extractJson` strips the fence unconditionally and slices between the first `{` and the last `}`. Sonnet returns bare JSON and Haiku fences it — both verified against the live endpoint, not assumed. | **Handled** |
| Model returns unparseable output | `JSON.parse` throws → caught → heuristic fallback, disclosed. | **Handled** |
| Model returns an out-of-range score or the wrong shape | `AssessmentSchema` (zod) requires `risk_score` 0–100, non-empty reasoning, 1–24 reasons. A violation throws → heuristic fallback. Note the bluntness: a score of 101 discards the **entire** assessment, prose included, rather than clamping the number. Deliberate — an earlier `max(8)` on the reasons array silently downgraded a perfectly good assessment, and the fix was to widen the bound, not to start repairing model output. | **Handled** |
| Score is `NaN`, `Infinity`, or lands outside every band | `clampScore` returns **100** for anything non-finite; `decide()` falls back to `REQUIRE_APPROVAL` if no band matches. | **Handled, fails safe.** The direction is deliberate: an unreadable score becomes *maximum* risk, so a parser bug suspends the access and names a human. Defaulting to 0 would turn the same bug into a silent grant — a failure that produces no signal at all. |
| No behavioural baseline for the subject | [`context.ts`](../src/lib/engine/context.ts) passes `"no baseline computed"` to the model instead of a baseline object; `outsideWorkingHours` falls back to the employee's declared `work_hours_start/end`, and returns `false` if those are also null. | **Handled — but note the direction.** Absent hours read as *inside* working hours, i.e. one risk signal disappears rather than firing. Defensible for a signal the prompt already calls weak, and it is the only fail-open in the engine. The load-bearing signals behave the other way: a missing membership or task row returns an empty set, which reads as absence of purpose and raises the score. |
| Modal unreachable at seed time | `runBaselines` catches, computes locally with the same algorithm, stamps `computed_by: "local"` and surfaces the error in the reset response. Never claims Modal computed something it did not. Seed-time only — never in the request path. | **Handled** |
| Database unreachable | **Unhandled.** Supabase errors are dropped (`{ data }` destructured, `error` ignored). At stage 1, `resolvePermission` sees `data: null` → `!identity` → `permitted: false`, and the request returns **200 `DENY`, "No permission grants this access"**. The outcome is fail-closed, which is the right direction, but the label is a lie: the trail records that the user held no permission when the truth is that we could not tell. | **Known, unhandled** |
| Database fails *after* stage 1 | `gatherContext` casts the identity row `as Employee` with no null check, so `subject.id` throws and the route returns an unhandled 500. Narrow — stage 1 already read the same row successfully — but it is a 500 in the access path rather than a decision. | **Known, unhandled** |
| The audit write itself fails | `writeEvent` ignores the insert error. The decision is returned anyway, carrying an `access_event_id` for a row that was never written. Availability is preserved at the cost of the trail, which is the wrong trade for an audit system and the right one for a demo. | **Known, unhandled** |
| Nobody opens the approval inbox | `sweepExpired()` runs on inbox reads only — there is no background job. Expiry and escalation are therefore **lazy**: an unwatched request sits pending past its window until something reads. Deliberate (no cron to fall over mid-demo) and wrong for production. | **Known, by design** |

The pattern worth naming: **every model failure degrades to a working decision;
every database failure degrades to a wrong label or a 500.** The model was
treated as untrusted from the start and the database as trusted, and the code
reflects exactly that.

---

## 6. Buyer, operator, and the first deployment

### Who buys it

Not the CIO, and not out of the IAM licence line. Cordyceps does not replace
Okta, so it does not get funded by an Okta renewal. It is bought by the person
who owns **insider risk and data-access governance**, from the security budget:

- **Enterprise:** Director of Identity & Access Management, or Head of Insider
  Risk, reporting to the CISO. Budget comes from the insider-risk / data
  protection programme — the same line that funds UEBA and DLP, and the same
  line that has to explain a quarterly access review nobody trusts.
- **Mid-market (500–3,000 people):** the CISO directly, because there is no one
  else, and the trigger is usually an audit finding or a near-miss involving a
  contractor or a third-party integration.

The honest weakness in the sales motion: **nothing gets ripped out to make
room.** That is good for adoption friction and bad for budget — it is a
net-new line item, so it needs an incident, an audit finding, or a regulator to
be paid for.

### Who operates it

Three groups, and only the first is obvious:

1. **A security engineer** owns the integrations (which systems supply work
   context), the thresholds, and the review of what scored high. Fractional —
   this is not a full-time role at first.
2. **Data and project owners** answer approvals. This is the real operating
   cost, and it is **distributed, not centralised**. Cordyceps spends other
   people's attention, one interruption at a time. That is what kills
   deployments of systems like this, not technical failure.
3. **The SOC** consumes flagged events as a feed. It should *not* own the
   approval queue — routing to a security queue turns a 90-second question for
   someone who knows the project into a ticket for someone who does not.

### The realistic first deployment

**Monitor-only, one high-sensitivity data store, one team, six to eight weeks.**

Cordyceps sits in the request path and evaluates every access, but the decision
is written to the trail rather than returned to the gateway. **Nothing is ever
held.** Concretely: the finance share, or the one repository that carries
customer data, for a team of 20–40 people, reading work context from whichever
one of Jira / Linear / GitHub that team actually keeps current.

The success criterion is deliberately not "we caught someone". It is the
**false-positive rate on ordinary work**: of all accesses by people who plainly
had a reason, what fraction scored above 70? If that number is more than a
couple of percent, the finding is not that the model is bad — it is that the
customer's work context lives somewhere we are not reading, in a Slack thread or
an email request or a conversation, and enforcing on it would be enforcing on
partial information.

### Why this ordering is the only credible one

- **The join's accuracy is a property of the customer's data hygiene, not of our
  code.** How well their Jira reflects who is actually working on what cannot be
  known before deploying. It has to be measured in their environment, on their
  data, before it gates anything.
- **The failure mode is social and asymmetric.** A wrong block costs a named
  colleague their afternoon and costs the security team its credibility.
  Credibility spends down once. Every organisation has a story about the control
  that got switched off after two weeks because it was wrong about the wrong
  person.
- **Monitor-only is reversible and needs nobody's permission.** Enforcement in a
  live data path needs a change board, a rollback plan, and an owner willing to
  be paged. Reversibility is what makes the first deployment a small decision
  rather than a programme.
- **Monitor mode generates the evidence that buys enforcement.** After six
  weeks you have a list of accesses that scored high and, on review, genuinely
  had no business purpose. That list is the business case, and it is far more
  persuasive than any demo — including this one.

Only then: enable enforcement for the **top band only** (`REQUIRE_APPROVAL`,
85+), still on the same one data store, with the project owner as approver.
Expand by **data store**, not by headcount — each new store is a bounded,
reversible decision, whereas each new team is a new set of context sources to be
wrong about.

The platform vision — the full permission graph, every store, every identity
including non-human ones — is the third year. Saying so is not modesty; a buyer
who has deployed this kind of system before will stop listening at the point you
claim otherwise.
