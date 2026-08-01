# Employee surface + demo enforcement — proposal for review

**Written 2026-08-01 13:22 BST as an undecided proposal. Resolved 13:35 exactly
as recommended: the enforcement half shipped, the workspace shell did not.**
Code freeze 15:45.

> **What shipped**, in `src/lib/content.ts`, `src/app/api/content/route.ts` and
> `src/components/file-preview.tsx`: a preview trigger on the decision card
> calling `POST /api/content`, which returns **200 with no `content` key** when
> the band is `STEP_UP`, `REQUIRE_APPROVAL` or `DENY`. An approver's release is
> single-use, enforced by the capability row's primary key — no `consumed_at`
> column, no schema change. Two corrections the proposal below did not have:
> `ALLOW_AND_FLAG` **releases** (the release row is itself stamped
> `ALLOW_AND_FLAG`, so withholding on "anything not `ALLOW`" would withhold what
> the approval just granted), and the release lookup takes an explicit
> `poll: true` flag so a 2-second poll cannot fall through to the model. The
> dialog is `modal={false}` — Radix's default overlay swallowed the click on
> Approve. The rest of this file is the original costing, kept as the reasoning.

The proposal on the table: replace the three-button dashboard with an
employee-facing file workspace, where the engine's decision manifests as a file
opening, an authentication challenge, an "access paused" overlay, or a refusal —
and where the server genuinely withholds the bytes until an approver releases
them.

The verdict below splits that into the half that fits and the half that does
not.

---

## 1. The clock this is judged against

| | |
| --- | --- |
| Now | 13:22 |
| Rehearsal ×2 (reserved, [plan.md](plan.md) §8) | 14:55 – 15:15 |
| Submission artefact (reserved) | 15:15 – 15:45 |
| **Build time actually available** | **~95 minutes** |

And the tree is not clean. Rung 3b's graph UI is 1072 untracked lines under
`src/components/attack-graph/`, with `src/app/page.tsx` and
`src/lib/engine/score.ts` modified alongside it. That WIP has to land before
anything new starts on top of it.

## 2. Verdict

**The enforcement is feasible. The workspace-as-main-demo is not.**

The half that raises technical credibility is also the cheap half. The half that
costs the time is the presentation shell — and that shell is what would displace
a rehearsed demo path ninety minutes before freeze.

| Piece | Cost | Call |
| --- | --- | --- |
| `/api/content` — withholds bytes, redeems a one-time release | ~30m | **Build** |
| Preview + paused overlay + live release, inside the rehearsed flow | ~35m | **Build** |
| Separate `/workspace` route, demo-identity selector, file tiles | ~50m | **Cut** |
| Promoting the workspace to the primary demo narrative | — | **Cut** |

The last row is the one that would actually sink the run. The 14:55 rehearsal
slot was sized to rehearse a flow that already works end to end. Spending it
instead on the first run-through of a surface built at 14:40 is the failure mode
[judging-criteria.md](judging-criteria.md) §4.4 names directly.

## 3. Why the enforcement is cheaper than the proposal assumes

The proposal states that approval "returns a description of a single-use
capability; nothing consumes that capability to release bytes." Nearly right —
but there is already a real artefact, not just a description.

[src/lib/engine/approval.ts:352-370](../src/lib/engine/approval.ts#L352-L370)
writes an `access_event` row on approve:

```
id:        evt-rel-${approval_request_id}
decision:  ALLOW_AND_FLAG
scope:     one identity_id, one resource_id, one action
reason:    "Released once by ${approver.name} against request ${row.id}"
```

**That row is the redeemable capability.** It is in Postgres, it is scoped
correctly, and it is already written by the tested approval loop. It simply has
no consumer. So the release check is a lookup against an existing row, not a new
subsystem.

Three consequences, all of which cut the estimate:

- **Single use falls out of the primary key.** `access_event.id` is `text
  primary key`. Redemption inserts `evt-redeem-${releaseId}`; a second attempt
  fails on duplicate key. No `consumed_at` column, therefore **no schema
  change** — which matters, because a schema change means re-pasting
  [supabase/schema.sql](../supabase/schema.sql) into the Supabase SQL editor by
  hand at 14:00 (ground rule 6).
- **File contents go in a server-side TS map keyed by resource id**, not a
  `resource.content` column. Same reason. Contents are seed data, not decisions,
  so ground rule 5 — *seed rows are hardcoded; decisions never are* — is
  untouched.
- **The redemption check must run before `scoreRisk()`.** The overlay polls
  every 2s. If each poll runs the full engine that is ~30 Runware calls a minute
  at ~1.5s each, on conference wifi, during the demo. Cheap lookup first; the
  model only on a cold request. This is the single most likely way the feature
  breaks the run.

## 4. Two corrections to the proposal's framing

**"Paused, not denied" is already true in code.** It is not something to build.
[src/app/api/access/route.ts:68-80](../src/app/api/access/route.ts#L68-L80)
short-circuits `DENY` before the model runs, and `DENY` is deliberately not
routable to an approver — a second party must never grant reach IAM never
granted. Ben → `Acquisition Valuation.xlsx` already returns a genuine denial;
Provenance AI acting for Alice already returns `REQUIRE_APPROVAL`. The
distinction between permission and purpose is enforced at the boundary today.
What is missing is that nothing on screen *shows* it. That is presentation work,
and it should be described as such.

**`STEP_UP` has no implementation.** The proposal's table promises an
authentication challenge behind it. There is nothing there, and building one
costs more than it returns with no seeded scenario that reaches the band. Either
drop the row from the table or render it as a paused state with different copy.
Do not put an unimplemented state on a slide.

## 5. A constraint the proposal does not account for

The preview cannot go inline on the decision card.
[src/components/decision-card.tsx](../src/components/decision-card.tsx) is 585
lines, and AGENTS.md pins it: *request, risk score, plain-English reasons and the
approval action must be legible together, without scrolling.* It is the screen
§3.5 scores.

Put the preview in a shadcn `Dialog` — already installed — triggered from the
card. The paused overlay lives inside the same dialog, so the release happens in
place, driven by the approval inbox that is already on the same screen. No
second window, no alt-tab, and the "avoid window juggling" caution in the
proposal is satisfied structurally rather than by discipline.

## 6. Recommended sequence

| Time | Step | Done when |
| --- | --- | --- |
| 13:25 | **Land the WIP.** Commit or stash the graph UI, `page.tsx`, `score.ts`. | Tree clean; starting new work on 1072 untracked lines is how an afternoon is lost |
| 13:30 – 14:00 | **`/api/content`.** Engine call, withhold on any non-`ALLOW` band, redeem the `evt-rel-*` row, PK-guarded single use, lookup before scoring. | Verified with curl, not by eye |
| 14:00 – 14:40 | **The preview dialog.** Bytes on `ALLOW`; paused overlay on `REQUIRE_APPROVAL`; releases when Eva approves in the existing inbox. | Opens from the decision card, card layout unchanged |
| 14:40 – 14:55 | **Extend `scripts/verify-demo.ts`** — a withhold leg and a redeem-twice leg. Commit and push. | Green, and pushed, not just committed |

If 14:00 arrives and `/api/content` is not verified, **stop and revert**. The
existing three-button flow is the submission. This feature is additive to it and
must never become a dependency of it.

## 7. What this buys, in one demo beat

> *"That overlay is not a UI state. The server has the file and will not send
> it. Watch — Eva approves, and only now does the byte stream exist."*

That is the sentence the proposal was reaching for, and it is worth the hour.
The `/workspace` route is not: it is a wrapper over the same endpoint, and it can
be built after the hackathon without redoing any of the above.

## 8. Open questions for the reviewer

1. **Does this displace rung 3b's graph UI?** Both cannot land in 95 minutes.
   3b is already part-built; this is not. If 3b is close to done, finish it
   first and re-cost this against what remains.
2. **Which resources get synthetic contents?** Minimum is
   `Acquisition Valuation.xlsx` plus one Atlas file, so the contrast pair both
   render. Four is presentation, not proof.
3. **Does the release survive `POST /api/reset`?** It must not — the reset
   re-seeds and the `evt-rel-*`/`evt-redeem-*` rows have to go with it, or the
   second rehearsal opens the file without an approval and the demo silently
   proves nothing.
