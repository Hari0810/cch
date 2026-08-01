# Handoff — Cordyceps

**Written 2026-08-01 12:47 BST.** Code freeze 15:45, demo 16:35.
Author: the session that built rungs 0–2.

This is a state-of-the-world document, not a plan. The plan is
[plan.md](plan.md); the product argument is
[brief-extended.md](brief-extended.md); the seeded world is
[demo-scenario.md](demo-scenario.md). Read [AGENTS.md](../AGENTS.md) before
touching code.

---

## 1. Where we are in one line

The product works end to end and the demo's central contrast is verified. Rung 2
(the approval loop) has a complete, typechecked backend and a written UI
component that is **not yet mounted on the page**. Everything else is done.

---

## 2. Verified working

Reproduce with `node --experimental-strip-types scripts/verify-demo.ts` against a
running dev server. Last green run: 2026-08-01 ~11:40, re-confirmed after the
`DENY` schema change.

| # | Request | Decision | Score |
| --- | --- | --- | --- |
| A | Alice → Customer Export Schema, 10:15 | `ALLOW` | 12 |
| N | Daniel → Acquisition Valuation.xlsx, 23:20 | `ALLOW` | 8 |
| C | Provenance AI (for Alice) → same file, 23:40 | `REQUIRE_APPROVAL` | 92 |
| — | Ben → Acquisition Valuation.xlsx (no permission path) | `DENY` | 0 |

**N versus C is the demo.** Same restricted file, twenty minutes apart, 8 versus
92. The score comes from work context, not from a sensitivity label and a clock.
`verify-demo.ts` asserts decisions and bands, never exact scores, and looks
identities up by *name* so it survives a reseed with different ids.

Also confirmed live, not assumed:

- `x-risk-provider: runware` on the response — the real model ran, not the
  heuristic fallback
- `occurred_at` echoed byte-for-byte including the `+01:00` offset
- approver resolved to Eva Patel with a 15-minute expiry
- `oauth_detail` read from the database rather than seeded UI copy
- baselines reporting `source: "modal"`, 11 profiles
- `POST /api/reset` → 11 employees, 3 projects, 12 resources, 12 tasks,
  32 permissions, 165 access events

---

## 3. Rung status

| Rung | What | State |
| --- | --- | --- |
| 0 | Schema, seed, contract types | ✅ done |
| 1 | Engine (policy → context → score → decide) + `/api/access` + dashboard | ✅ done |
| M | Modal behavioural baselining | ✅ done |
| 3a | OAuth delegated identity (`acts_for`) | ✅ done |
| **2** | **Approval loop** | **backend done, UI written, not mounted** |
| 3b | Graph analysis (stage 3) | cut — documented as future work |

---

## 4. Rung 2 in detail — read this before continuing it

### The contract

Written down in [src/lib/types.ts](../src/lib/types.ts) on
`ApprovalDecisionRequest`, because "a human approves it" is not a security
design. Implemented in [src/lib/engine/approval.ts](../src/lib/engine/approval.ts).

- **Scope.** Approval releases exactly one action on one resource for the
  identity named in the original event. Not a session elevation, not a standing
  grant, does not extend to the parent folder. A second read needs a second
  decision.
- **It cannot widen reach.** Only `REQUIRE_APPROVAL` is routable, and that
  outcome is only reachable when the permission check already passed. `DENY` is
  never routable — a second party must never grant reach IAM never granted.
- **Races.** First decision wins. The update is conditional on
  `status = 'pending'`, so a decision that raced past the read loses at the write
  and is told it lost (409) rather than silently overwriting the winner.
- **Rejection is terminal** for that request. No silent retry. No `access_event`
  is written on a rejection — no access occurred, and recording one as `DENY`
  would overload a word this codebase reserves for "no permission reaches this
  resource". The refusal lives on the `approval_request` row with who and why.
- **Expiry escalates, it does not deny.** A hard timeout would turn "suspend,
  don't deny" into "deny, slowly" — the reviewer being at lunch becomes a
  security decision. On expiry the request is closed as `expired` and a **new**
  row is opened against the approver's manager. The original stays in the trail
  as expired-unanswered, which is itself worth knowing.
- **Escalation target** walks the org chart: the approver's manager, else the
  person with the most direct reports, never the approver themselves. Eva Patel
  has no manager, so hers falls to Julia Evans (six reports). No hardcoded names.
- **The approver is not authenticated.** The client echoes back the `approver_id`
  the row is addressed to and the API checks the match. That is *routing*, not
  authentication. Said out loud in the UI footer and in the README — do not let a
  judge find it first.

### What exists

- `src/lib/engine/approval.ts` — `sweepExpired()`, `listApprovals()`,
  `decideApproval()`
- `src/app/api/approvals/route.ts` — GET, the inbox
- `src/app/api/approvals/decide/route.ts` — POST, approve/reject
- `src/components/approval-inbox.tsx` — polls every 2s, approve/reject controls,
  countdown, settled-state copy, the not-authenticated footer

Polling rather than Supabase realtime, deliberately: a websocket that fails to
connect on conference wifi fails *silently* and takes the demo with it. A poll
that misses a tick arrives on the next one.

`pnpm exec tsc --noEmit` is clean as of 12:43.

### What remains (~15 min)

1. Mount `<ApprovalInbox />` in [src/app/page.tsx](../src/app/page.tsx). The grid
   is currently `[21rem_1fr]`; intended layout is `[21rem_1fr_20rem]` so the
   requester's pane and the approver's desk are visible **at the same time** —
   that simultaneity is the point of "suspend, don't deny".
2. Replace `ReservedRow` in
   [src/components/decision-card.tsx](../src/components/decision-card.tsx) with a
   real suspended-state row: approver name and live expiry. The card should show
   the suspension; the inbox owns the buttons. Clean separation, better story.
3. Test the full path: fire Scenario C → row appears in the inbox → approve →
   note reads "released once" → an `ALLOW_AND_FLAG` release event is written with
   Eva's name on it. Then repeat with reject.
4. Extend `verify-demo.ts` with an approve leg and a re-decide leg asserting 409.

**Not started, and fine to cut:** an approval leg in the automated verifier is
nice-to-have; a manual run through the UI before rehearsal is sufficient.

---

## 5. Known defects and open items

**Cosmetic, known, low priority.** In Scenario A the model's prose says "outside
normal working hours" when 10:15 sits inside Alice's computed 10:04–16:52
window. The system-derived chip correctly reads *no*. This is the model
editorialising over a computed fact — which is precisely why the README says the
`context_summary` facts are what hold up and the prose merely summarises them. If
a judge reads both, own it rather than explain it away.

**Deferred from the third-party review, all prose, none blocking:**

- a compact threat model
- documented failure behaviour: model timeout, malformed model output, missing
  baseline, database unreachable
- responsible-AI wording in `brief-extended.md` — "not a dossier", "every
  decision is contestable", and the "immutable audit event" claim, which is not
  true of ordinary Postgres rows and is already corrected in the README
- naming a buyer/operator and a first deployment wedge
- re-running the golden scenarios a few times to check band stability near
  thresholds — 92 is comfortably inside `REQUIRE_APPROVAL`, but 8 and 12 have
  never been observed drifting and that has never been *measured*

**Deferred by explicit decision:** `DATABASE_URL` + a `pnpm db:push` script to
replace pasting `supabase/schema.sql` into the SQL editor by hand. Post-hackathon.

---

## 6. Running it

```bash
pnpm install
cp .env.example .env.local          # Supabase ×3, RUNWARE_API_KEY, MODAL_SCORING_ENDPOINT
# paste supabase/schema.sql into the Supabase SQL editor
pnpm dev
curl -X POST localhost:3000/api/reset             # seed + compute baselines
node --experimental-strip-types scripts/verify-demo.ts
```

`ANTHROPIC_API_KEY` is **deliberately empty**. Runware serves Claude models over
an OpenAI-compatible endpoint, so no Anthropic key is needed. The scorer is
provider-agnostic — swapping providers is a ~5-line adapter and never touches the
engine.

A dev server may already be running on port 3000 (it was, all session, PID 30665,
not started by this session). A second `pnpm dev` will refuse with exit 1. That is
the port conflict, not a build failure.

**pnpm, not npm.** `pnpm dlx`, not `npx`.

---

## 7. Load-bearing decisions not to relitigate

Full list in [AGENTS.md](../AGENTS.md). The ones most likely to be undone by
accident:

- **`occurred_at` comes from the request and is never defaulted to `now()`.** We
  demo at ~16:35, inside Alice's baseline; reading the wall clock silently zeroes
  the off-hours signal on stage. The single carve-out is approval expiry, where a
  human is genuinely waiting — real minutes, real clock.
- **The model scores; a pure function decides.** `decide()` maps score to action
  through `THRESHOLDS` and fails safe to `REQUIRE_APPROVAL`. Nothing in
  `/api/access` may branch on which identity or resource is involved.
- **A permission failure short-circuits and never reaches the model.** Cheap
  deterministic checks first, and `DENY` is outside the four bands by design.
- **Baselines are computed at seed time on Modal, never in the request path.** A
  cold start inside a live access decision is unacceptable latency, and periodic
  baselining is the honest production design anyway.
- **"Provenance AI" is the name used in the app.** Real-world incident write-ups
  in `docs/vercel.md` keep the original names — do not rename citations.
- **Never commit `.env.local`.** Check `git status` before every push.

---

## 8. Time budget from here

| | |
| --- | --- |
| now – 13:05 | finish rung 2, test approve and reject end to end |
| 13:05 – 14:30 | deferred prose: threat model, failure behaviour, buyer/wedge, responsible-AI wording |
| 14:30 – 14:55 | slack — band stability runs, or cut |
| 14:55 – 15:15 | rehearsal, out loud, on the real machine |
| 15:15 – 15:45 | submission artefact, final push |
| 15:45 | **freeze** |
| 16:35 | 3-minute demo |

Commit and push at every checkpoint, not at the end. A green verifier that only
exists on this laptop is not a submission.
