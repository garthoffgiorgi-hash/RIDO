---
paths:
  - "packages/pricing/**"
  - "supabase/migrations/**/*.sql"
  - "supabase/functions/**"
  - "apps/web/src/app/**"
  - "apps/web/src/components/**"
  - "apps/web/src/lib/stripe/**"
---

# You are touching money

This file deliberately contains **no rates, amounts, or thresholds** — those live in the root
`CLAUDE.md` and in `supabase/seed/commission_tiers.sql`, and having one home is the point. This
is the checklist, delivered at the edit site.

Before this change is done:

- [ ] Every currency value is an **integer number of cents**. No float, no dollars in a variable,
      no `numeric`/`money`/`real` column. Rates are basis points.
- [ ] No rate, tier boundary, or fee amount is written as a literal here. It's read from
      `commission_tiers` or the driver's `subscriptions` row.
- [ ] No commission arithmetic is performed in this file. It calls `@rido/pricing`.
- [ ] Nothing recomputes a completed ride's commission. Historical rides read their snapshot.
- [ ] The pilot/steady fee distinction is read from state, never from comparing dates.
- [ ] `commission_cents + driver_payout_cents === fare_cents` still holds exactly.
- [ ] A number shown to a driver comes from a snapshot or from `@rido/pricing` — not from
      arithmetic in a component.
- [ ] If the math changed: the ADR changed, and the tests changed with it.

This is the promise the business is built on. If any box can't be ticked, stop and say so rather
than shipping a number you can't defend to a driver.
