# Proposal — repo architecture for AI-assisted development

**Status:** proposed, 2026-08-05. Nothing here is merged. Run `migrate.sh` to adopt it.

## Takeaway

The repo is well-stocked with thinking and has no structure to keep it true. The always-loaded
`CLAUDE.md` currently describes six files that **have never existed in this repository** —
`index.html`, `about.html`, `styles.css`, `script.js`, `vercel.json`, and a CI workflow
(`git log --all --name-only` confirms it). Every Claude Code session has been starting from a
description of a different codebase. That's the drift you were worried about, already happened,
in the highest-leverage file.

This proposal fixes it structurally rather than by editing the file once: scoped context that
loads by directory, one home per fact, ADRs for anything that changes, and a check script that
fails when a reference dies.

## What's actually here today

| File | Size | Note |
|---|---|---|
| `CLAUDE.md` | 126 ln | Loaded every session. Its "current state" section is fiction. `@brand/brand-guide.md` doesn't resolve — the real file is `rido-brand-guide.md`. |
| `README.md` | 81 ln | Describes a folder layout that doesn't match the repo. Same broken brand link. |
| `RIDO Landing.html` | **171 KB** | A Claude Design export — a self-extracting bundle, ~95% base64 woff2. Not a page you can edit. |
| `brand/DESIGN.md` | 177 ln | Near-duplicate of `design-system.md`, and they **disagree** (52px vs 44px inputs). |
| `brand/design-system.md` | 104 ln | The real design system. Missing the Motion section that only `DESIGN.md` has. |
| `docs/technical-architecture.md` | 55 ln | Schema + completion flow + a decision, in one file. Will become the monolith. |
| `docs/reconciliation.md` | 46 ln | Describes the same non-existent files. Also: "reconciliation" already means the month-end commission job — the name misleads. |
| `models/rido-pilot-model.jsx` | 342 ln | Carries its **own** `gradComm()` in floating-point dollars — a second implementation of the commission rule. |

Three doc cross-references are broken right now. The check script in this proposal finds all
three in under a second.

## The mechanism this is designed around

Verified against the Claude Code docs, because the whole layout depends on it:

| Behaviour | Consequence for layout |
|---|---|
| Root `CLAUDE.md` loads **in full, every session** | It's the scarcest real estate in the repo. Invariants only. |
| Subdirectory `CLAUDE.md` loads **on demand**, when Claude reads a file in that directory | This is the lever. Domain rules go next to the domain. |
| A bare `@path` import is **eagerly inlined at launch** (max 4 hops) | `@`-referencing all of `docs/` would load all of `docs/` into every session. Splitting into imports **does not** save context. |
| Import parsing **skips backticked spans and code fences** | Backticked paths are pointers followed on demand. This is what you want almost everywhere. |
| After `/compact`, root `CLAUDE.md` is re-injected; **nested files are not** | Anything catastrophic-if-forgotten belongs at the root, not only in a nested file. |
| Target **under 200 lines** per `CLAUDE.md` | Enforced by `scripts/check-context.mjs`. |

That fifth row is why the money invariants stay at the root even though `packages/pricing/` has
its own file: in a long session, a nested file can silently fall out of context, and "integer
cents, never floats" has to be true before the first line of a new file is written.

## Target tree

```
rido/
├── CLAUDE.md                    # invariants + directory map. ~100 lines. Every session.
├── README.md                    # human entry point
├── package.json                 # npm workspaces. No Turbo, no Nx.
├── .gitattributes               # .dc.html marked binary — never diffed, never merged
├── .claude/rules/money.md       # path-scoped: fires when you touch money-adjacent files
│
├── apps/
│   └── web/                     # Next.js. Vercel Root Directory = apps/web
│       ├── CLAUDE.md            # brand tokens, server/client split, money-display rules
│       └── src/{app,components,lib,types}/
│
├── packages/
│   └── pricing/                 # ALL money math. Zero deps. Three runtimes consume it.
│       ├── CLAUDE.md            # the money rules + the test spec
│       └── src/{money,tiers,commission,subscription,index}.ts
│
├── supabase/
│   ├── CLAUDE.md                # schema, RLS, Edge Function rules
│   ├── migrations/              # the only source of truth for schema
│   ├── seed/commission_tiers.sql# the ONE home for rates
│   ├── functions/               # Deno. Imports @rido/pricing, never reimplements it.
│   └── tests/                   # pgTAP: constraints + RLS
│
├── brand/
│   ├── CLAUDE.md                # what governs what; the .dc.html rule; voice
│   ├── design-system.md         # canonical: tokens, type, components, motion
│   ├── brand-guide.md           # canonical: positioning, voice, message hierarchy
│   ├── boards/                  # hand-written reference boards (illustrative)
│   └── exports/                 # Claude Design .dc.html + a .md handoff note each
│
├── docs/
│   ├── CLAUDE.md                # how to write and change docs
│   ├── README.md                # canonical-source map + open questions
│   ├── decisions/               # ADRs — the anti-drift mechanism
│   ├── business/ architecture/ compliance/
│   └── roadmap.md               # (was reconciliation.md)
│
├── tools/pilot-model/           # (was models/) non-shipping economics model
└── scripts/check-context.mjs    # the drift guard
```

### Why each placement

**`packages/pricing/` exists before a second app does — and not because monorepos have a
`packages/`.** The commission math has to run in three runtimes: the bundler (`apps/web`, to show
"you keep $X" before a driver accepts), **Deno** (`supabase/functions/complete-ride`, to compute
the snapshot that becomes the accounting record), and a browser (`tools/pilot-model`). Anything
inside `apps/web/src/lib/` cannot be cleanly imported by a Deno Edge Function, and the moment the
app and the function compute commission differently, the disagreement lands in the books. The
runtime boundary forces the package; it isn't structure for its own sake. (ADR-0005)

**`apps/` split now, monorepo tooling later.** Root `package.json` declares npm workspaces —
built into npm, not a monorepo tool — so `@rido/pricing` resolves as a real dependency instead of
a tsconfig alias each runtime interprets differently. **No Turborepo, no Nx, no pnpm, no
`packages/ui`, no `packages/config`.** Adding `apps/mobile` and a `turbo.json` later is additive:
two files and a script change, no import rewrite. **The cost is one level of path depth, and it
is at its absolute cheapest right now — there is zero application code to move.** Every week of
building at the root raises that price.

**`docs/` split by concern, with `README.md` as the canonical-source map.** The map is the
artifact that removes ambiguity: every class of fact lists the one file that governs it. Note it
deliberately does *not* restate the stack — that lives in root `CLAUDE.md`, and duplicating it
would break the rule the map exists to enforce.

**`tools/` instead of `models/`.** "models" reads as *data models* to an agent navigating the
repo, which is actively misleading in a codebase whose domain model matters this much.

**`brand/exports/` for `.dc.html`.** Reference artifacts, never source. Each gets a sibling `.md`
handoff note, which is the thing Claude reads — the bundle itself is 171 KB of base64 that
teaches you the bundler, not the design. `.gitattributes` marks them `-diff merge=binary`.

## The drift decision: repo canonical

**Recommendation: (a) — the repo is canonical, the vault is upstream and one-way.** Full
reasoning in `files/docs/decisions/0004-repo-is-canonical.md`. Short version:

- **(b) vault canonical, repo generated** needs a generation pipeline you won't build and that
  rots in week two — and Claude Code can't read the vault, so the agent doing the work would be
  reading a derived copy.
- **(c) split by audience** fails on shared facts. "Commission is 20/12/8 bracketed" is needed by
  both audiences, gets written twice, and drifts. That's exactly how `DESIGN.md` came to say 52px
  while `design-system.md` says 44px.
- The better framing is **split by lifecycle, not audience**: the vault is where thinking happens
  (messy, 44 notes); `docs/` is where decisions land (few, dated, reviewed). A vault note may
  never state a rule — it links to the `docs/` path that governs, or gets promoted to an ADR.

**[DECISION NEEDED — yours]** Whether to keep Obsidian at all, versus a gitignored `docs/notes/`:
same one-way flow, one less tool, drafts next to the decisions they become. Backlinks across 44+
notes are a real advantage, so the ADR assumes the vault stays. Your call.

## Conventions that keep files cheap to load

| Rule | Limit | Enforced by |
|---|---|---|
| `CLAUDE.md` size | 200 lines | `check-context.mjs` |
| Doc size | 250 lines, one topic | `check-context.mjs` |
| Backticked references resolve | always | `check-context.mjs` |
| `ADR-NNNN` citations exist | always | `check-context.mjs` |
| Every `.dc.html` has a `.md` note | always | `check-context.mjs` |
| Rates/boundaries/fees outside the seed | never | `check-context.mjs` |
| Source modules | ~300 lines, one concern | review |
| Tests colocate with source | `x.ts` → `x.test.ts` | review |

The check script is the difference between a structure and an intention. It already earns its
place: run against the repo as-is, it finds all three broken references in about a second.

## Monoliths to split

| File | Verdict |
|---|---|
| `RIDO Landing.html` (171 KB) | Move to `brand/exports/`, mark binary, add a handoff note. Never read in full. |
| `models/rido-pilot-model.jsx` (342 ln) | Move to `tools/`. **In Phase 2, delete its `gradComm()` and import `@rido/pricing`** so the founder's model and the production books are provably the same rule. |
| `brand/DESIGN.md` | Merge its Motion section into `design-system.md`, resolve 44 vs 52px, delete. |
| `docs/technical-architecture.md` | Split: tables → `architecture/data-model.md`, flow → `architecture/ride-completion.md`, decision → ADR-0002. Done by the migration. |
| `CLAUDE.md` | Not oversized — wrong. Rewritten. |

## Migration

`migrate.sh` — tested end to end against a copy of this repo. All 12 moves are `git mv` and land
as R093–R100 renames, so history follows every file. It ends with the context check passing.

Two content tasks are left manual on purpose (both printed by the script): merging `DESIGN.md`'s
Motion section and picking the real input height, and deleting the sections from `data-model.md`
that `ride-completion.md` and ADR-0002 now own. Both move prose and need a human decision.

## Biggest risk

**That `packages/pricing` can't be imported by a Supabase Edge Function as cleanly as this layout
assumes.** Sharing code outside `supabase/functions/` has historically been the rough edge in
monorepo setups; recent CLI versions support it, but it's version-dependent. If it doesn't work
and nobody checks until Phase 2, the tempting fix is a copied file — and a hand-maintained second
copy of the commission math is the single worst outcome available, because it fails silently and
the failure is in the accounting record.

**Spike it before Phase 2**: a throwaway Edge Function importing one function from
`packages/pricing`, deployed for real. Fallbacks in order: per-function `deno.json` import map →
a build step emitting into `functions/_shared/` → a checked-in copy guarded by CI byte-equality.
Either way, run `packages/pricing`'s test suite under **both** Deno and the web runner: that
cross-runtime run, not the import mechanism, is the actual guarantee they agree.

## What I'd do next

1. **Review and run `migrate.sh`** (~30 min including the two manual merges).
2. **Do the Edge Function import spike** (~30 min). It's the one thing that could invalidate the
   layout, and it's cheap now and expensive later.
3. **Fix the landing page's numbers.** `brand/exports/2026-08-05-landing-v1.md` documents it:
   the page states 87% in the hero and 84% below the fold, and the model says 88% — three
   different figures for the core fairness claim, none labelled with what it nets out. During the
   pilot the fee is $0, so the launch-accurate number is 88% and the page is *understating* RIDO.
   Give "what percentage do we publish" one home in `docs/business/monetization.md`.
4. **Then build Phase 2 money spine first**, not the UI — `packages/pricing` with the full
   boundary test suite, then the migrations and `complete-ride`. It's the part where being wrong
   is unrecoverable, and it's the part this structure is built to protect.
