# RIDO

A driver-favorable rideshare marketplace. Riders request rides, drivers fulfill them, RIDO takes
a far smaller cut than the incumbents — so drivers keep more and riders pay less at the same time.
First market: San Diego / UCSD.

**Status: pre-launch. Nothing is built yet.** This repo currently holds strategy, brand, and
planning artifacts. See `docs/roadmap.md` for the gap and the build order.

## Where to look

| I want… | Go to |
|---|---|
| The rules Claude Code works under | `CLAUDE.md` (and the `CLAUDE.md` in each subdirectory) |
| Which file governs which fact | `docs/README.md` |
| Why something is the way it is | `docs/decisions/` |
| The design system and voice | `brand/design-system.md`, `brand/brand-guide.md` |
| What to build next | `docs/roadmap.md` |

## Layout

```
CLAUDE.md            root context: invariants + a directory map. Loaded every session.
apps/web/            the Next.js app
packages/pricing/    all money math — pure, dependency-free, shared across runtimes
supabase/            migrations, RLS, Edge Functions
brand/               design system, voice, Claude Design exports
docs/                decisions, business, architecture, compliance
tools/               non-shipping tools (pilot economics model)
scripts/             repo maintenance (context drift guard)
```

Layout rationale, including why `packages/` exists before a second app does:
`docs/decisions/0005-monorepo-shaped-layout.md`.

## Working on it

```bash
npm install
npm run dev              # apps/web
npm test                 # all workspaces
npm run test:pricing:deno # the money math, under the Edge Function's runtime
npm run check:context    # catches broken references and drifted context files
```

## The three tools, and what each is for

- **Claude Code** reads this repo. `CLAUDE.md` files are its operating manual. It writes code.
- **Claude Design** consumes `brand/design-system.md` at the org level and produces `.dc.html`
  exports into `brand/exports/`. It is a workshop — it never commits.
- **The Obsidian vault** is where thinking happens. It is upstream of this repo and never
  authoritative. A decision becomes real when it lands in `docs/` as an ADR (ADR-0004).

## Open questions gating the plan

The commercial TNC insurance quote, the Prop 22 × "drivers set fares" question, and who absorbs
card processing. All tracked with owners in `docs/README.md`.
