# ADR-0007 — What must be tested before it ships

**Status:** Accepted
**Date:** 2026-08-18

## Context

The repo has zero tests. CI runs two jobs that deliberately no-op until a `*.test.ts` appears,
and `commissionForRide()` — described in this repo's own root context file as the most important
code in it — still throws `not implemented`.

"Add tests" is not an instruction anyone can finish, so it never starts. A coverage percentage
would be worse: it rewards testing the easy surfaces and says nothing about whether the number a
driver is paid is correct. What's needed is a short list of things that must not ship untested,
and an honest statement of what is deliberately left alone for now.

The forcing constraint is specific to this business. A wrong commission figure is snapshotted
onto the `rides` row at completion and never recomputed (root `CLAUDE.md`, invariant 2). There is
no reconciliation job that would later notice. A bug there is not a bug that gets fixed — it is a
permanent error in the accounting record, and one that has to be explained to a driver.

## Decision

Three tiers, by consequence of being wrong.

**Required — merge is blocked without it.**

- `packages/pricing`: every exported function, with the boundary, spanning-ride, monotonicity and
  exactness cases already enumerated in `packages/pricing/CLAUDE.md`. The suite runs under
  **both** Node and Deno; that cross-runtime run is what proves the app and the Edge Function
  compute the same number.
- Pure logic in `apps/web/src/lib/`: phone normalisation, the auth error mapping, the
  `next`-parameter redirect guard. These take arguments and return values — there is no setup
  cost and no excuse.
- Anything enforcing a **money or compliance invariant**, wherever it lives.

**Expected — write it with the feature, not after.**

- Database rules once migrations exist: RLS policies and the driver-activation check constraint,
  tested in `supabase/tests/`. The compliance gate is required to hold in the database and not
  only the app, so it is tested there and not only through the app.

**Deliberately not required yet.**

- React component rendering and end-to-end browser tests. The rider and driver surfaces don't
  exist and the auth screens are still moving; tests written now would be rewritten before they
  ever caught anything. Revisit when the rider flow stabilises — this is a deferral with a
  trigger, not a permanent exemption.

**One standing rule, regardless of tier:** a bug fix ships with the test that would have caught
it. That is how this list grows — from failures that actually happened, rather than from
guessing.

## Consequences

- Phase 2 cannot be "done" until the pricing suite exists. That is the intended effect; it is the
  one place in this codebase where being wrong is unrecoverable.
- CI's two no-op jobs start doing work the moment the first `*.test.ts` lands, with no config
  change — the scripts already look for the files.
- The tiers will read as under-testing to anyone expecting full coverage. The trade is
  deliberate: effort goes where an error is permanent, and away from surfaces still being drawn.
- Test tooling comes from the consuming workspace, never from `packages/pricing` itself, which
  stays dependency-free (ADR-0005).
