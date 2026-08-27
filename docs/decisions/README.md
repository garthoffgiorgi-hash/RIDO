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
