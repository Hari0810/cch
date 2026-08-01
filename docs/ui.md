# UI stack — shadcn/ui

The frontend uses [shadcn/ui](https://ui.shadcn.com) on top of Tailwind v4. shadcn is
not a dependency — the CLI copies component source into the repo, so everything under
`src/components/ui/` is our code and is meant to be edited directly.

## Configuration

`components.json` is the source of truth for the CLI:

| Setting | Value | Meaning |
| --- | --- | --- |
| `style` | `radix-nova` | Radix base with the nova preset |
| `baseColor` | `neutral` | Greyscale ramp behind the semantic tokens |
| `cssVariables` | `true` | Colours resolve through CSS vars, not hard-coded classes |
| `iconLibrary` | `lucide` | `lucide-react` for all icons |
| `rsc` | `true` | Components assume the App Router; `"use client"` where needed |

Theme tokens live in `src/app/globals.css` — `@theme inline` maps CSS vars to Tailwind
utilities, and `:root` / `.dark` hold the oklch values.

## Adding a component

```bash
pnpm dlx shadcn@latest add <component>
```

It writes to `src/components/ui/` and installs any Radix primitive it needs. Prefer this
over hand-rolling: the generated components already carry the correct ARIA roles,
keyboard behaviour, and focus management.

## Installed

`alert`, `avatar`, `badge`, `button`, `card`, `dialog`, `dropdown-menu`, `input`,
`label`, `progress`, `scroll-area`, `select`, `separator`, `sheet`, `skeleton`,
`sonner`, `table`, `tabs`, `tooltip`.

Not installed but likely wanted later: `sidebar` (collapsible left nav with a mobile
sheet), `form`, `command`.

## Conventions

- **Style with semantic tokens**, never raw palette classes — `bg-accent`,
  `text-muted-foreground`, `border-border`, not `bg-zinc-100` / `text-gray-500`.
  Tokens are what make light and dark mode work and what keeps the nova preset
  coherent when components are composed.
- **Merge classes with `cn`** from `@/lib/utils` (clsx + tailwind-merge) so caller
  overrides win over a component's defaults instead of colliding with them.
- **Providers are wired once** in `src/app/layout.tsx`: `TooltipProvider` wraps the
  tree and `Toaster` (sonner) sits alongside it. Fire toasts with
  `toast()` imported from `sonner`.
- **Dark mode is defined but not switchable yet.** `globals.css` carries a full `.dark`
  token set and `next-themes` is installed, but no `ThemeProvider` is mounted — only
  `ui/sonner.tsx` reads `useTheme()`. Add the provider in `layout.tsx` when a theme
  toggle is needed.

## Current state

`src/app/page.tsx` is the shell mockup: a left nav (Dashboard / Employees / Attack)
against a "Coming soon" panel. The nav is hand-rolled `<button>` elements with
`useState` rather than the `Tabs` component — deliberate, to keep the mockup minimal.

If it grows past a mockup, convert it: `Tabs` accepts `orientation="vertical"`, which
gives the rail real `tab` / `tabpanel` semantics and arrow-key navigation for free.
Once the nav needs to be collapsible or work on mobile, install `sidebar` instead.

## Attack-path placeholder

Rung 3b's graph analysis is still cut; [plan.md](plan.md) defines the boundary.
The planned placeholder is a static, presentation-only preview and must remain
isolated from the decision screen until the main demo path is complete.

Suggested ownership:

```text
src/components/attack-graph/
  attack-graph.tsx       # read-only React Flow canvas
  graph-model.ts         # view-layer node and edge types only
  demo-fixture.ts        # explicitly static preview data

src/app/attack-preview/
  layout.tsx             # route-local React Flow stylesheet import
  page.tsx               # unlinked preview surface
```

The component should accept a small view model rather than query Supabase or
call the decision API itself. Keep controls, dragging and connection handles
disabled; `fitView` is sufficient for the four-node permission path. Edge
labels carry provenance, while node styling distinguishes identity, group,
folder and restricted file using semantic tokens.

The fixture is allowed to be hardcoded because it is labelled as a visual
preview. It must never supply or influence a decision. When integration is
approved later, a thin adapter at the caller converts
`AccessDecision.permission_path` to this view model; the graph component stays
unaware of engine and API types.
