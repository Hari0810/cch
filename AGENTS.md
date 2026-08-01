# AGENTS.md

## What this is

**Cordyceps** — a contextual authorisation agent. Permissions answer *can you
access this*; Cordyceps answers *is there a reason for you to access this, right
now*. It sits in front of the access, decides synchronously, and suspends rather
than denies.

Built for the Cursor Cybersecurity London hackathon, **1 August 2026, code freeze
15:45**. Scope decisions in this repo are deliberately shaped by that deadline —
see [docs/plan.md](docs/plan.md) before assuming anything is an oversight.

**The name is Cordyceps.** The scaffold commit says `ContextGate` and the design
thread says `ContextGuard`. Both are dead. Don't reintroduce them.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui
(`radix-nova`, neutral base) · Supabase · Modal · **Runware** (LLM inference) ·
zod · `@xyflow/react`. The Anthropic SDK is installed and kept as a second
adapter behind the `RiskScorer` interface, but `ANTHROPIC_API_KEY` is empty and
**Runware is the live provider** — see ground rule 8.

**Package manager is pnpm** — `pnpm-lock.yaml` and `pnpm-workspace.yaml` are
committed. Use `pnpm dlx shadcn@latest add <component>`, never `npx`, so the
lockfile stays consistent.

```bash
pnpm dev      # next dev
pnpm build    # next build
pnpm lint     # eslint
```

## Layout

```
src/app/          routes, layout, globals.css (theme tokens)
src/components/ui/  shadcn output — our code, edit it directly
src/lib/          utils.ts (cn), supabase/{client,server,admin}.ts
src/lib/engine/   decision engine (rung 0 — see plan.md)
src/proxy.ts      Supabase session refresh
docs/             everything below
```

## Rules that are decided — do not relitigate

These are load-bearing. Each one has a failure mode behind it that is expensive
to rediscover.

1. **`occurred_at` comes from the request. `now()` appears nowhere in scoring.**
   We demo at ~16:35, inside Alice's 08:30–19:00 baseline — read the real clock
   and the off-hours signal silently evaluates to zero on stage, with no way to
   debug it in a three-minute slot. Approval expiry is the sole carve-out, since
   a human is genuinely waiting. Full reasoning in
   [docs/brief-extended.md](docs/brief-extended.md) §4.

2. **No Supabase Auth in the demo path.** Nobody logs in during three minutes;
   an identity dropdown is enough. `src/proxy.ts` exists from the scaffold and
   refreshes sessions, but nothing authenticates — don't build on it and don't
   delete it either.

3. **Seed rows are hardcoded; decisions never are.** The outcome must fall out
   of the join against real rows. A hardcoded decision scores 2/5 on technical
   execution and the whole product argument collapses with it.

4. **AI explains, rules decide.** The model returns a risk score and reasoning.
   A pure function maps score to action against thresholds in **one exported
   object**. The LLM never has final authority over an access outcome. This
   single decision answers four separate judging criteria — reliability,
   auditability, safety, and "what happens when the model is wrong".

5. **All timestamps derive from one `SEED_ANCHOR`.** No hardcoded dates.
   Re-seeding at any hour must produce a coherent world.

6. **No ERP surface.** No employee list, no resource catalogue, no dashboard
   stats. Hours spent, nothing scored. The task board is the *demo substrate*,
   not the product — in reality this reads from Jira, Linear, GitHub, Slack, SAP.

7. **Schema goes into the Supabase SQL editor**, not `supabase init` +
   migrations. Save the tooling ceremony for a project with a week in it.

## Frontend conventions

- **Semantic tokens only** — `bg-accent`, `text-muted-foreground`,
  `border-border`. Never `bg-zinc-100` / `text-gray-500`. Tokens are what make
  light/dark work and keep the nova preset coherent under composition.
- **Merge classes with `cn`** from `@/lib/utils` so caller overrides win.
- **Providers are wired once** in `src/app/layout.tsx` — `TooltipProvider` and
  `Toaster`. Fire toasts with `toast()` from `sonner`.
- **The app is dark-only.** `<html>` carries a literal `dark` class in
  `layout.tsx` and `color-scheme: dark` is set in `globals.css`; the light `:root`
  tokens are kept as the reference values but never render. There is no toggle —
  `next-themes` is installed but no `ThemeProvider` is mounted, so anything
  calling `useTheme()` sees `"system"` and must be pinned by hand (the `Toaster`
  in `layout.tsx` is the one instance). The `.dark` neutrals carry a faint cool
  tint at hue 265 so the warm severity ramp stays separated from the chrome.
- **Fonts are Geist / Geist Mono**, loaded by `next/font` in `layout.tsx` as
  `--font-geist-sans` / `--font-geist-mono` and mapped onto `--font-sans`,
  `--font-mono` and `--font-heading` in the `@theme inline` block. Those tokens
  must point at the `--font-geist-*` variables — a self-reference is invalid at
  computed-value time and silently drops the whole app to serif.
- **The decision card is the screen that gets judged.** Request, risk score,
  plain-English reasons and the approval action must be legible together,
  without scrolling. Lay it out with room for the approval controls before they
  exist.

## `src/proxy.ts`

Two constraints, both already commented in the file and both easy to break:

- Use `getUser()`, never `getSession()` — `getUser()` revalidates against
  Supabase.
- Put **no logic** between that call and the return.

## Docs

| Doc | Purpose |
| --- | --- |
| [docs/handoff.md](docs/handoff.md) | **Start here if you are picking this up** — timestamped state, what is verified, what remains |
| [docs/attack-graph.md](docs/attack-graph.md) | **Rung 3b scaffold** — the picture, the feasibility tiers, and what must never be implied |
| [docs/workspace-enforcement.md](docs/workspace-enforcement.md) | **Proposal, undecided** — employee file surface and server-side withholding, costed against the 15:45 freeze |
| [docs/plan.md](docs/plan.md) | **The live build plan** — rungs, time budget, cut line at 14:45 |
| [docs/demo-scenario.md](docs/demo-scenario.md) | **Source of truth for the seed** — cast, permissions, resources, tasks, scenarios |
| [docs/brief-extended.md](docs/brief-extended.md) | The product argued out in full — the gap, the pipeline, thresholds |
| [docs/judging-criteria.md](docs/judging-criteria.md) | Seven criteria, the nine judges, the demo beat map |
| [docs/ui.md](docs/ui.md) | shadcn setup and component inventory |
| [docs/cursor-hackathon.md](docs/cursor-hackathon.md) | Schedule, partners, submission mechanics |
| [docs/brief.md](docs/brief.md) | Original transcript. Historical — superseded by brief-extended |

## Housekeeping

- **Never commit `.env.local`.** `.env.example` carries the names. Live keys:
  Supabase ×3, `RUNWARE_API_KEY`, `MODAL_SCORING_ENDPOINT`. `ANTHROPIC_API_KEY`
  is deliberately empty — Runware serves Claude models, so no Anthropic key is
  needed.
- The docs are the thinking. If a decision changes, change the doc in the same
  commit — a stale doc here is worse than none, because the next agent will
  trust it.
- **Commit and push at every working checkpoint** — each rung finished, each
  verified fix, each doc pass. Not at the end. This is a one-day build on a
  laptop against a 15:45 freeze: the failure we are insuring against is losing an
  afternoon of work, and a green `verify-demo.ts` that only exists locally is not
  yet a submission. Push, don't just commit.
- Before pushing, check `git status` for `.env.local` and for anything under a
  path you did not intend to add. Keys leak by accident, not by decision.
