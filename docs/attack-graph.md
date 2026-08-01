# Rung 3b — the access graph

**Conceptual scaffold, written 2026-08-01 12:50.** Not a commitment to build.
This document exists to separate three things that were being argued as one: the
*picture*, the *query behind it*, and *graph analysis feeding the score*. They
have wildly different costs and only the third one was ever cut for good reason.

Every number and edge below is read from the live seed, not invented. Verified
against the database at 12:48.

---

## 1. Why a graph is the right illustration

The product's claim is a shape, and shapes are hard to argue in prose. Read this
out loud and it takes forty seconds and the listener has to hold five entities in
their head:

> Alice is in a group that holds a download grant on a finance folder, which she
> got six months ago for a project that has since ended, and that folder contains
> the acquisition model for a different project she is not a member of.

Draw it and it takes two seconds, because the wrongness is *visible*: there is a
path from Alice to a restricted file, and there is no path from Alice to the
project that file belongs to. The eye finds the missing edge before the sentence
finishes.

That is the case for building it. It is not a case for building graph *analysis*
— see §5.

---

## 2. The picture, from real data

```
                 Provenance AI
                 drive.readonly (read all files) · never reviewed
                       │
                       │ acts for
                       ▼
                 Alice Morgan  ┄┄┄┄┄┄┄✗┄┄┄┄┄┄┄▶  Project Nova
                       │                          members: Daniel, Eva, Farah
                       │ member of                     ↑
                       ▼                               │ owns
              Finance Data Readers                     │
              members: Daniel, Eva, Alice              │
                       │                               │
                       │ view + download               │
                       │ granted 2026-02-01            │
                       │ "Atlas Q1 cloud cost attribution"
                       │ NEVER REVIEWED                │
                       ▼                               │
                   finance/  ◀────────────────────────┘
                   [restricted]
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
  Acquisition    Target Company   Board Valuation
  Valuation.xlsx    Contracts          Deck
  [restricted]    [restricted]     [restricted]
        ▲
        └── the demo opens this one. The other two are equally reachable.
```

Three things a viewer gets for free from this that they do not get from the
current horizontal chain:

**The missing edge.** `Alice ┄✗┄▶ Project Nova` is the entire product. The
permission path exists; the purpose path does not. A chain can only show the path
that *is* there.

**The blast radius.** The demo touches one file. The grant reaches **three**
restricted documents. "The file you just watched leave was one of three" is a
materially stronger sentence than anything said on stage so far, and it is a
fact, not a projection.

> Say **three**, not four. `blast_radius.reaches` returns descendants of the
> granted folder, so the UI shows 3. The folder itself is also classified
> restricted, which makes "four restricted objects" defensible on paper and
> wrong on stage — narrating a number the screen contradicts is worse than the
> smaller number. An earlier draft of this document said four; it was corrected
> when the endpoint was verified.

**The inversion.** Alice ∈ group, ∉ project. Farah ∈ project, ∉ group. Nova's own
counsel is not in the group that can read Nova's finance folder, while an
engineer who left the project six months ago is. Group membership and project
membership have silently diverged, and that divergence *is* the vulnerability
class. It is in the seed already; nothing has ever displayed it.

---

## 3. Feasibility, honestly tiered

Times are build-and-verify, by someone who already knows this codebase.

### Tier 1 — the permission path as a graph · ~30 min · risk: near zero

**This is not new work. It is a different layout of an array we already return.**
`decision.permission_path` is `PermissionHop[]` with `from`, `to`, `kind` and
`label`, and [decision-card.tsx](../src/components/decision-card.tsx) already
renders it as a horizontal chain with provenance on the connectors. A node-graph
view consumes the identical array.

- No engine change, no contract change, no new query, no new seed data.
- Cannot regress the demo path: if the component throws, the chain still exists.
- `@xyflow/react` is already installed for exactly this.

**This tier alone delivers the missing-edge beat**, because the absent
`Alice → Project Nova` edge can be drawn from `context_summary.is_project_member`
and `project_name`, both already on the response.

### Tier 2 — blast radius · ~45 min · risk: low, if it is a separate endpoint

"Given the grant that permitted this access, what else does that grant reach?"

The engine already walks `resource.parent_id` **upward** (`walkResourceChain`, to
find inherited grants). Blast radius is the same walk **downward**: from the
granted resource to its descendants. The mirror of a function that exists.

```
finance/  →  acquisition-valuation.xlsx, target-company-contracts,
             board-valuation-deck        (3 restricted, all Project Nova)
```

Deterministic. No model. Computed from `permission` + `resource`, both seeded.

**Build it as `GET /api/graph?event=<id>`, not as a field on `AccessDecision`.**
Adding to the decision contract means re-verifying every scenario; a separate
read-only endpoint cannot affect a single score. That distinction is the whole
difference between "low risk" and "do not do this before a freeze".

### Tier 3 — the membership divergence overlay · ~30 min · risk: low

Render group membership and project membership as two sets with the symmetric
difference highlighted: Alice on one side, Farah on the other. Pure query over
`group_membership` + `project_membership`. Same separate endpoint.

Strongest *idea* of the three, weakest *demo* of the three — it needs narration
to land, and narration is the scarce resource in a three-minute slot. Build it
third or not at all.

---

## 4. What is not feasible, and must not be implied

**Graph analysis feeding the score — stage 3 proper.** Traversal results as
scorer input. This changes the decision contract, requires re-verification of
every band, and is the thing that was cut at 11:50 for reasons that have only got
stronger as the runway shortened. **Stays cut.**

**Lateral movement across identities.** Alice → service account → production.
There are no credential-to-credential edges in the schema; `acts_for` is the only
one and it has a single instance. This needs new seed data and a new edge type.
Not today, and a fabricated version would be the worst thing in the project.

**Reachability scoring, blast-radius weighting, "attack likelihood".** Any number
attached to a graph that is not a count of things actually in the database.

**Temporal replay.** Animating an attack unfolding over time. No.

---

## 5. The rule this must follow

The codebase already has one: *the AI explains, the rules decide.* The graph gets
the same discipline:

> **The graph explains. It does not detect.**

Everything the graph draws must be a fact already computed by the engine or a
deterministic count queried from the database. The graph must never be the reason
a decision came out the way it did, and no label on it may suggest it was. If the
graph disappeared, every decision would be identical — that is the test.

Concretely: the screen is titled for what it is, the nodes carry no scores, and
nothing on it says "detected", "predicted" or "path found". It says: *this is the
permission that let it through, here is everything else that permission reaches,
and here is the project boundary it crossed.*

---

## 6. Integration seam

The sidebar already has an **Attack** tab rendering "Coming soon" — a live dead
end in a three-minute demo, and the natural mount point.

- Component under `src/components/attack-graph/`, uniquely owned files.
- Feeds off `decision` state already held in [page.tsx](../src/app/page.tsx). No
  prop drilling through the engine.
- Import React Flow's stylesheet inside the feature, never `globals.css`.
- Read-only canvas: no connecting, editing, or user-authored nodes.
- Semantic colour tokens only (`--success`, `--warning`, `--alert`,
  `--destructive`), so it survives dark mode like everything else.
- If `decision` is null, the tab explains what it will show rather than rendering
  an empty canvas.

If none of it gets built, the Attack tab should still stop saying "Coming soon" —
ten minutes to replace it with the sentence the plan already says to deliver out
loud: *the attack path is where this goes next.*

---

## 7. Recommendation

**Tier 1, then reassess.** Thirty minutes, no engine risk, and it delivers the
missing-edge beat — which is the argument. Tier 2 is the strongest *addition* and
the one worth the next forty-five minutes if Tier 1 lands clean, because "one
unreviewed grant, three restricted files" is a fact the demo currently owns and
never says.

The cost is real and should be stated plainly: Tiers 1 + 2 consume roughly the
whole slack before the 14:55 rehearsal, which means the deferred prose — threat
model, failure behaviour, buyer and wedge — does not get written today. That is a
legitimate trade. It is just not a free one.
