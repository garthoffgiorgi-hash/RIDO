# Architecture Decision Records

One decision per file. Numbered, dated, permanent.

**Never edit a decided ADR to change its decision.** Write a new one and mark the old
`Superseded by ADR-NNNN`. The trail is the value — it's what stops a rule quietly reverting six
months from now because nobody remembers why it was chosen.

Format:

```markdown
# ADR-NNNN — <short title>

**Status:** Accepted | Superseded by ADR-NNNN | Proposed
**Date:** YYYY-MM-DD

## Context
What forced a choice. The constraints that were real at the time.

## Decision
What we do. Stated so it can be checked against code.

## Consequences
What this costs, what it rules out, what now has to be true.
```

## Index

| # | Decision | Status |
|---|---|---|
| [0001](0001-hybrid-monetization.md) | Hybrid monetization: flat fee + graduated commission | Accepted |
| [0002](0002-bracketed-per-ride-commission.md) | Commission is bracketed and computed per ride | Accepted |
| [0003](0003-pilot-fee-waiver.md) | 6-month fee waiver, traction-gated turn-on | Accepted |
| [0004](0004-repo-is-canonical.md) | The repo is canonical; the vault is upstream thinking | Accepted |
| [0005](0005-monorepo-shaped-layout.md) | Monorepo-shaped layout, no monorepo tooling yet | Accepted |
| [0006](0006-vendor-sdks-behind-app-modules.md) | Vendor SDKs are reached through an app-owned module | Accepted |
| [0007](0007-testing-bar.md) | What must be tested before it ships | Accepted |
| [0008](0008-completion-is-a-bounded-critical-section.md) | Ride completion is a bounded critical section | Accepted |
| [0009](0009-rido-quotes-the-fare.md) | RIDO quotes the fare; the discount is a calibration target | Accepted |
| [0010](0010-client-names-places-server-measures-trip.md) | The client names places; the server measures the trip | Accepted |
| [0011](0011-what-a-completed-ride-records.md) | What a completed ride records | Accepted |
| [0012](0012-rider-books-server-owns-the-write.md) | Rider books, server owns the write | Accepted |
| [0013](0013-driver-accepts-one-row-one-update.md) | Driver accepts: one row, one conditional UPDATE | Accepted |
| [0014](0014-app-calls-complete-ride.md) | The app calls `complete-ride`; it doesn't re-orchestrate it | Accepted |
| [0015](0015-connect-payouts-per-ride.md) | Connect payouts, per ride, against a ledger (RIDO absorbs processing) | Accepted |
| [0016](0016-payout-attempt-claim.md) | A payout retry needs a claim, not just a stable idempotency key | Accepted |
| [0017](0017-rider-charging.md) | Hold at request, capture at completion | Accepted |
| [0018](0018-late-cancellation-fee.md) | A rider may cancel late, for a fee the driver keeps | Accepted |
| [0020](0020-realtime-ride-status.md) | A realtime event is a notification, not a data channel | Accepted |

**0019 is claimed and lands with the driver-queue branch** (online/offline and decline). Numbers are
permanent and assigned when an ADR is written, not when it merges, so the gap here is a branch that
has not landed yet — not a missing decision. Whoever merges that branch adds its row.

This index went un-updated from 0015 through 0018 while those decisions merged, which is why the
rule is worth stating: **the row goes in the same commit as the ADR.** `check-context.mjs` cannot
catch this one — it verifies that references resolve, not that a list is complete.
