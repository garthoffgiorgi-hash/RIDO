# docs — canonical source map

**This table resolves every "which file governs this?" question.** If a fact isn't listed, it
doesn't have a home yet — give it one before writing it down twice.

Rule: the governing file is the **only** place a value is defined. Everywhere else links to it.

## Facts → their one home

| Fact | Governed by |
|---|---|
| Commission rates, tier bands, bracketed-vs-cliff | `decisions/0002-bracketed-per-ride-commission.md`; **runtime values** live in `supabase/seed/commission_tiers.sql` |
| Flat fee amount, pilot waiver, fee turn-on trigger | `decisions/0003-pilot-fee-waiver.md` + `business/monetization.md` |
| Why hybrid (fee + commission) rather than pure subscription | `decisions/0001-hybrid-monetization.md` |
| Database schema, columns, constraints | `architecture/data-model.md` — **superseded by `supabase/migrations/` once they exist** |
| Ride completion flow, snapshotting, the MTD trigger | `architecture/ride-completion.md` |
| Supabase Auth dashboard config (email templates, SMTP, SMS, redirect allowlist) | `architecture/auth-setup.md` |
| Where money math lives and how it's shared across runtimes | `decisions/0005-monorepo-shaped-layout.md` |
| Why vendor SDKs are wrapped rather than called from components | `decisions/0006-vendor-sdks-behind-app-modules.md` |
| What must be tested before it ships, and what's deferred | `decisions/0007-testing-bar.md` |
| Market sizing, take-rate evidence, driver break-even, Empower | `business/market-viability.md` |
| The wedge, the mission, who it's for, the beachhead | `business/overview.md` |
| CPUC permit, insurance periods and amounts, Prop 22 | `compliance/ca-tnc.md` |
| Driver vetting requirements → product fields | `compliance/ca-tnc.md` (schema consequence: `architecture/data-model.md`) |
| Colour, type, spacing, radius, component specs, motion | `../brand/design-system.md` |
| Positioning, voice, message hierarchy, taglines | `../brand/brand-guide.md` |
| What's built vs. what isn't; build order | `roadmap.md` (**dated — check the date**) |
| Repo layout, context-loading strategy, where files go | root `../CLAUDE.md` + `decisions/0004-repo-is-canonical.md` |
| Stack choice (Next/Supabase/Stripe/Mapbox) | root `../CLAUDE.md` — deliberately **not** duplicated here |

## Directory shape

```
docs/
├── README.md          ← you are here: the map
├── CLAUDE.md          ← how to write and change docs
├── business/          ← why this business works
├── architecture/      ← how the system is built
├── compliance/        ← what California requires
├── decisions/         ← ADRs: why it is the way it is
└── roadmap.md         ← what's built, what's next
```

## Open questions (not decisions — these are unresolved)

| # | Question | Blocks | Owner |
|---|---|---|---|
| 1 | Commercial TNC insurance quote — fixed monthly minimum or per-ride rate? | The entire financial model | Broker |
| 2 | Prop 22 earnings floor × "drivers set fares" — who owes what? | Driver classification, payout design | CA attorney |
| 3 | Does RIDO absorb Stripe's ~2.9% + $0.30, or pass it to drivers? | Take-rate math on low fares | Founder |

Answering one of these produces an ADR. Until then it stays here, visible. (Question 4 — Supabase
CLI import bundling — was answered by a real spike and removed; see
`decisions/0005-monorepo-shaped-layout.md`.)
