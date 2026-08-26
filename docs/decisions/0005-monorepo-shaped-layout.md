# ADR-0005 — Monorepo-shaped layout, no monorepo tooling

**Status:** Accepted
**Date:** 2026-08-05

## Context

Mobile is a later phase. Standing up Turborepo or Nx today would be tooling for a second app that
doesn't exist. But a flat `src/` at the repo root makes that later migration a rewrite: every
import path, the tsconfig, the Vercel root directory, and every path reference in every CLAUDE.md
and doc has to change at once.

There is also a harder constraint that a flat layout can't express. **The commission math must run
in three runtimes:**

| Runtime | Consumer |
|---|---|
| Bundler / Node | `apps/web` — showing "you keep $X" before a driver accepts |
| **Deno** | `supabase/functions/complete-ride` — computing the snapshot that becomes the accounting record |
| Browser, no build | `tools/pilot-model` — the founder's economics model |

If the app and the Edge Function compute commission from two different implementations, they will
disagree eventually, and the disagreement will be in the accounting record. That already exists
in miniature: the pilot economics model (`tools/pilot-model/src/model.ts`) carried its own
`gradComm()` in floating-point dollars with its own tier variables — a second implementation of
the single most important rule in the business, in the tool the founder uses to decide whether
the business works.

## Decision

**Shape the repo as a monorepo now; defer the tooling.**

```
apps/web/          packages/pricing/          supabase/          tools/
```

- Root `package.json` declares **npm workspaces** (`apps/*`, `packages/*`). That's built into npm
  — not a monorepo tool — and it makes `@rido/pricing` a real resolvable dependency rather than a
  tsconfig path alias that every runtime resolves differently.
- **No Turborepo, no Nx, no pnpm, no shared build pipeline, no `packages/ui`, no `packages/config`.**
  One package, and it exists because a runtime boundary forces it — not because monorepos have
  `packages/`.
- `packages/pricing` is dependency-free and uses `.ts`-extension relative imports so Deno consumes
  the source directly, with no build step.
- Vercel's Root Directory is set to `apps/web`.

## Consequences

- Adding `apps/mobile` and a `turbo.json` later is **additive**: two files and a script change.
  No import rewrite, no doc rewrite, no Vercel reconfiguration.
- Paths get one level deeper today, for an app that doesn't exist yet. That's the whole cost, and
  it is at its cheapest right now — **there is currently zero application code to move.** Every
  week of building at the root raises this price.
- The economics model can import `@rido/pricing` instead of carrying its own math, so the
  founder's financial model and the production books are provably the same rule.
- **Verified (2026-08-05): the import-map alias works.** Spiked with Deno 2.9.4 and Supabase CLI
  2.111.0 — a throwaway Edge Function importing `@rido/pricing` via a `deno.json` import map
  (mapped to `../../packages/pricing/src/index.ts`) type-checked (`deno check`), ran
  (`Deno.serve`), and bundled (`deno bundle`) identically to a raw relative import; both produced
  the same bracketed-commission result across a tier boundary. **Decision: use the import-map
  alias, not a raw relative path.** `supabase/functions/deno.json` maps `@rido/pricing` so
  function code reads the same specifier `apps/web` does, and relocating the package later only
  touches that one file.
  - **Still unverified: a real authenticated `functions deploy` and `functions serve`.** No
    Docker daemon and no linked Supabase project were available to spike against, so module
    *resolution* is proven but the actual upload path is not. Confirm on the first real deploy of
    `complete-ride`, using `--use-api` (documented in 2.111.0, no Docker required).
  - Fallback if a real deploy surfaces something the local spike didn't: a build step emitting
    into `supabase/functions/_shared/`, guarded by CI byte-equality against `packages/pricing` —
    never a hand-maintained copy.
- Regardless of how the import resolves, **`packages/pricing`'s test suite runs under both Deno
  and the web runner.** That cross-runtime run is the actual guarantee that the two agree.
