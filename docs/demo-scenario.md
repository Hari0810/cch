# Demo scenario — the seeded world

> The company simulation behind the demo: identity, work, data and behaviour,
> scoped to answer one question — *"this employee technically has permission, but
> does this access make sense right now?"*
>
> This is the **source of truth for the seed**. The build plan in
> [plan.md](plan.md) says which slice of it rung 0 actually needs (Alice, Eva,
> Daniel, Atlas, Nova, four resources); everything else here is the world we
> fill in as rungs land.

## Seeding rules

1. **One `SEED_ANCHOR`.** Every timestamp is expressed relative to it. No
   hardcoded dates — re-seeding at any hour must produce a coherent world.
2. **`occurred_at` is carried by the request**, never read from the clock. See
   [brief-extended.md](brief-extended.md) §4.
3. **Seed rows are hardcoded; decisions are not.** Scenarios below declare the
   *facts* and the *required decision*. They never declare a risk score — a
   pre-declared score contradicts *AI explains, rules decide*.
4. **Seed depth is uneven on purpose.** Nova and Alice's history get the detail
   because they carry three of the four scenarios. Beacon stays thin.

---

## 1. Cast

Ten humans plus one non-human identity. Managers and hours beyond Alice's are
invented to be plausible — nothing in the demo turns on them.

| Employee | Role | Dept | Manager | Hours | Identity |
| --- | --- | --- | --- | --- | --- |
| Alice Morgan | Senior Engineer | Engineering | Julia | 08:30–19:00 | human |
| Ben Carter | Engineer | Engineering | Julia | 09:30–18:00 | human |
| Chloe Singh | Product Manager | Product | Julia | 09:00–17:30 | human |
| Daniel Kim | Finance Analyst | Finance | Eva | 08:00–18:30 | human |
| Eva Patel | Strategy Lead | Strategy | — | 08:00–20:00 | human |
| Farah Ahmed | Legal Counsel | Legal | Eva | 09:00–17:00 | human |
| George Wilson | Engineer | Engineering | Julia | 09:00–18:00 | human |
| Hannah Li | Data Scientist | Engineering | Julia | 10:00–19:00 | human |
| Isaac Brown | Product Manager | Product | Julia | 09:00–17:30 | human |
| Julia Evans | Engineering Director | Engineering | — | 08:00–20:00 | admin |

**Alice is the compromised identity.** Scenarios A and B are the real Alice
establishing a baseline; scenario C is her credentials without her.

### Non-human identity

**Provenance AI** — `identity_type: oauth_app`, `acts_for: Alice`

| Field | Value |
| --- | --- |
| Connected by | Alice, `anchor − 14 months` |
| Scope | Drive read-all |
| Last reviewed | never |
| Last used | `anchor − 4 months` |
| Project association | none |

A dormant token waking at 23:40 is the cheapest strong signal in the build, and
it is exactly the shape of the April 2026 breach. Backstory if asked: the
vendor leaked the refresh secret. One sentence — do not model it.

---

## 2. Projects

| Project | Purpose | Owner | Status | Sensitivity | Runs |
| --- | --- | --- | --- | --- | --- |
| Atlas | Customer analytics platform | Chloe | active | Internal | `anchor − 9mo` → open |
| Nova | Confidential acquisition | Eva | active | Restricted | `anchor − 2mo` → `anchor + 1mo` |
| Beacon | Infrastructure monitoring | Isaac | active | Confidential | `anchor − 5mo` → open |

**Members**

- **Atlas** — Alice, Ben, Chloe *(owner)*, Julia
- **Nova** — Daniel, Eva *(owner)*, Farah
- **Beacon** — George, Hannah, Isaac *(owner)*, Julia

Alice works on Atlas. The attacker goes after Nova. That contrast is the demo.

---

## 3. Groups and permissions

The load-bearing section. **Membership and permission are separate** — if Alice
simply lacked permission, ordinary RBAC would block her and Cordyceps proves
nothing.

| Group | Members |
| --- | --- |
| `engineering` | Alice, Ben, George, Hannah, Julia |
| `engineering-leads` | Alice, Julia |
| `finance-data-readers` | Daniel, Eva, **Alice** |

### Alice's path to the Nova model

```
Alice → finance-data-readers → read on finance/ (folder)
                                    └── Acquisition Valuation.xlsx   ✔ permitted
Alice ✕ Nova membership
Alice ✕ any task touching Nova
```

The grant carries its own provenance, and this is what makes the story true to
life rather than convenient:

| Field | Value |
| --- | --- |
| `granted_at` | `anchor − 6 months` |
| `granted_reason` | "Atlas Q1 cloud cost attribution" |
| `last_reviewed_at` | `null` |

That work ended in March. The membership was never revoked. It buys the pitch
line *"the permission was correct six months ago"* and the IGA answer: a
quarterly access review catches this within 90 days; we catch it at the read.

**Permission resolution walks two edges** — group membership, and
`resource.parent_id` upward. Without folder inheritance the grant would have to
be an explicit one on `Acquisition Valuation.xlsx`, which is the contrived
version.

---

## 4. Resources

Twelve. The `finance/` folder is not decoration — it is the node the group
permission attaches to.

| # | Resource | Type | Project | Parent | Owner | Sensitivity |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Customer Export Schema | file | Atlas | atlas/ | Alice | Internal |
| 2 | Atlas Production Dashboard | dashboard | Atlas | — | Chloe | Confidential |
| 3 | `customers` table | db_table | Atlas | — | Alice | Confidential |
| 4 | atlas/ | folder | Atlas | — | Chloe | Internal |
| 5 | Atlas Export Service Key | secret | Atlas | — | Julia | Restricted |
| 6 | finance/ | folder | Nova | — | Eva | Restricted |
| 7 | **Acquisition Valuation.xlsx** | file | Nova | finance/ | Daniel | Restricted |
| 8 | Target Company Contracts | file | Nova | finance/ | Farah | Restricted |
| 9 | Board Valuation Deck | file | Nova | finance/ | Eva | Restricted |
| 10 | Beacon Incident Dashboard | dashboard | Beacon | — | George | Confidential |
| 11 | Beacon Architecture Doc | file | Beacon | — | Isaac | Confidential |
| 12 | Shared Engineering Handbook | file | — *(company-wide)* | — | Julia | Internal |

Resource **7** is the target of both scenario N and scenario C. Resources 8 and
9 exist so the velocity signal has something real to count.

---

## 5. Tasks

Twelve, with subtasks only where they earn their place.

| Task | Project | Assignee | Parent | Status | Due |
| --- | --- | --- | --- | --- | --- |
| Implement customer export | Atlas | Chloe | — | in_progress | `anchor + 5d` |
| ├ Review export schema | Atlas | **Alice** | ↑ | in_progress | `anchor + 2d` |
| └ Add CSV endpoint | Atlas | Ben | ↑ | in_progress | `anchor + 4d` |
| Migrate analytics pipeline | Atlas | Alice | — | in_progress | `anchor + 12d` |
| Q3 dashboard refresh | Atlas | Chloe | — | open | `anchor + 20d` |
| Prepare acquisition model | Nova | **Daniel** | — | in_progress | `anchor + 1d` |
| Review target-company contracts | Nova | Farah | — | in_progress | `anchor + 3d` |
| Present valuation to board | Nova | Eva | — | open | `anchor + 6d` |
| Investigate latency incident | Beacon | George | — | in_progress | `anchor + 1d` |
| Train anomaly model | Beacon | Hannah | — | in_progress | `anchor + 8d` |
| Cross-project architecture review | — | Alice *(assigned by Julia)* | — | open | `anchor + 7d` |
| Rotate export service credentials | Atlas | Julia | — | open | `anchor + 10d` |

**Nothing Alice holds touches Nova.** That absence is what the engine reports,
and it is a query result rather than an assertion.

The cross-project architecture review is scenario B's explanation. It is
deliberately assigned to no project — see the open question below.

### How the task join actually works

Absence of a task→resource link is weak evidence; nobody tags every file to a
ticket. The primary join is **task→project ↔ resource→project**. Explicit
task→resource links are a *confirming bonus* signal, not the backbone. Have
that answer ready — it is a predictable Q&A question.

---

## 6. Behavioural baselines

Derived from seeded history at seed time, stored so it can be shown on screen.

| Employee | Active | Projects | Resource types | Files/hr | Downloads? |
| --- | --- | --- | --- | --- | --- |
| **Alice** | **08:30–19:00** | **Atlas ~95%** | **source, technical docs, schemas** | **< 10** | **rarely — views** |
| Daniel | 08:00–18:30 | Nova, Finance | spreadsheets, financial models | < 15 | often |
| Eva | 08:00–20:00 | Nova | decks, models, contracts | < 10 | sometimes |
| Farah | 09:00–17:00 | Nova | contracts, legal docs | < 8 | often |
| George | 09:00–18:00 | Beacon | dashboards, logs | < 20 | rarely |
| Hannah | 10:00–19:00 | Beacon | datasets, notebooks | < 25 | often |
| Julia | 08:00–20:00 | all | docs, dashboards | < 12 | rarely |

Alice has **never** accessed a Nova resource. Seed enough Atlas history to make
that statement a query result rather than a flag on a row.

Daniel's history must include **prior late-night Nova access** — that is what
makes scenario N's allow honest rather than lenient.

---

## 7. Access-event fields

| Field | Note |
| --- | --- |
| identity | employee or oauth_app; oauth carries `acts_for` |
| resource | — |
| `occurred_at` | **from the request, never the clock** |
| action | view · download · edit · delete |
| device | one enum. Supporting signal only |
| location risk | one enum. Supporting signal only |
| auth method | one enum |
| session type | password · sso · **oauth_token** |
| velocity | count in the preceding window |
| declared purpose | only when a step-up fires |

Device and location stay **supporting**. Lead with them and the project reads as
another anomaly detector, which is the one framing we cannot afford.

Any field seeded but never read by the engine is wasted build time. Trim on
sight.

---

## 8. Scenarios

Each declares facts and a required decision. **Scores are asserted as bands in
tests, never as fixed numbers.**

### A — ordinary legitimate access → `ALLOW`

Alice opens **Customer Export Schema** at `anchor 10:15`.

Correct project · active assigned task ("Review export schema") · familiar
resource type · normal hours · normal volume.

*Proves Cordyceps does not interfere with normal work.* Demo this **first**, or
the block reads as paranoia rather than discrimination.

### N — the negative control → `ALLOW`

Daniel opens **Acquisition Valuation.xlsx** at `anchor 23:20`.

Nova member · owns "Prepare acquisition model", due tomorrow · **restricted
resource** · **outside baseline hours** · established history on the project.

*The same file, the same hour, the opposite outcome.* This is the only
construction that proves the score comes from the context join rather than from
`sensitivity × hour_of_day`. **It cannot be cut.**

### B — CUT

*Kept for the record, not for the demo.* Its justification is a cross-project
architecture review with **no `project_id`** — so the documented task→project ↔
resource→project join cannot connect it to Beacon, and the scenario would have
to be argued rather than computed. Repairing an optional scenario is not worth
the time, and a scenario the engine cannot actually justify is worse than no
scenario at all.

<details><summary>Original definition</summary>

Alice opens **Beacon Architecture Doc** at `anchor 20:30`.

Not a Beacon member · confidential, not restricted · **Julia's cross-project
architecture review explains it** · off-hours · unfamiliar project.

Every signal a UEBA would alert on, allowed because a task explains it. That is
the version that teaches a judge something. </details>

### C — compromised OAuth token → `REQUIRE_APPROVAL`

**Provenance AI**, delegating Alice, downloads **Acquisition Valuation.xlsx** at
`anchor 23:40`.

RBAC permission exists via `finance-data-readers` · **not a Nova member** · **no
task references Nova** · restricted · outside Alice's hours · unfamiliar
resource type · Nova is in her computed `projects_never_touched` · 14-month-old
third-party token, dormant 4 months, never reviewed.

> **Not claimed on stage:** a rapid multi-file burst. The seed contains no
> same-hour Nova burst, so the velocity signal is genuinely zero here. The
> A/N/C contrast does not need it, and asserting a signal the data does not
> support is the one thing that would undo the whole argument.

The UI leads with Alice's name — she is the principal — and the reveal is
expanding a *"via Provenance AI"* chip. True to the data rather than narrated twice.

Eva receives:

> Alice's credentials requested a restricted Nova document through Provenance AI.
> Alice is not assigned to Nova, has no related task, and does not normally
> access finance resources.

**Access is suspended before the file is returned.** Not denied.

**Demo order: A → N → C.**

---

## 9. Decisions and approval

Four outcomes: `ALLOW` · `ALLOW_AND_FLAG` · `STEP_UP` · `REQUIRE_APPROVAL`.
Thresholds live in one exported object — [brief-extended.md](brief-extended.md) §4.

- **Approver:** Eva, as Nova's **project owner**. Note Daniel owns the file
  itself — authority to release access comes from owning the *project*, not the
  individual row. A named human, not a security queue.
- **The approver is NOT authenticated.** The approve/reject control is
  simulated for the demo. Say so before a judge asks; production inherits
  approver identity from the IdP.
- **Expiry:** 15 minutes, on real wall-clock — the sole place `now()` is correct.
- **At minute 16: escalate to Julia**, not deny. "Suspend, don't deny" and a hard
  expiry are otherwise in tension.
- **Immutable audit event** on every decision: reasons, score, approver, outcome.

---

## 10. Out of scope

Named so nobody quietly starts building them: daily KPI reporting · productivity
scores · chat analysis · calendar integration · real Drive/Okta integration ·
automated remediation · policy-authoring UI · multi-tenancy · device
fingerprinting · a trained anomaly model.

The strongest demo is a small, internally consistent company — not a broad ERP.

## Open questions

1. **Scenario B in or out**, and if in, `ALLOW` or `STEP_UP`. Recommendation:
   out unless there's slack; `ALLOW` if in.
2. **The cross-project architecture review has no project.** If tasks require a
   project FK it needs one, or a nullable column. Decide when the schema lands.
3. **Velocity mechanism** — seed the preceding burst events (cheap), or fire
   four requests live and let the score climb (better beat, costs demo seconds).
4. **Calendar** is listed as a context signal in brief-extended §3 but is out of
   scope here. Drop it from the six signals or mark it explicitly as future work.
