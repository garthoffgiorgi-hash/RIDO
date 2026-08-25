# Changing the commission rates or the flat fee

**You do not need to change any code to reprice.** The rates, the band boundaries, and how many
bands exist are rows in the `commission_tiers` table. The flat fee is a column on each
`subscriptions` row. This page is the whole procedure.

Governs: the *process* of repricing. The rates themselves live in
`supabase/seed/commission_tiers.sql`; why they're bracketed is
`../decisions/0002-bracketed-per-ride-commission.md`.

## The one thing to know first

**Repricing never changes a ride that already happened.** Every completed ride stores what was
taken from it — `commission_rate_bps`, `commission_cents`, `driver_payout_cents` — and nothing
ever recalculates those. A rate change applies to rides completed after it, and to nothing else.
That's deliberate (ADR-0002), and it's what makes changing your mind safe: you cannot accidentally
rewrite history or restate a driver's past earnings.

## Changing a rate or a boundary

Run this against the database (Supabase dashboard → SQL Editor is fine):

```sql
-- Change the top band to 6%. Rates are basis points: 600 = 6.00%.
update commission_tiers set rate_bps = 600 where tier_order = 3;
```

Boundaries are cents, and adjacent bands must still meet exactly — no gaps, no overlaps. Move both
sides together:

```sql
-- Move the first line from $1,000 to $1,500 (150000 cents).
update commission_tiers set upper_bound_cents = 150000 where tier_order = 1;
update commission_tiers set lower_bound_cents = 150000 where tier_order = 2;
```

**Adding or removing a band is also just rows.** The code walks however many bands it finds; there
is nothing anywhere that assumes three. The only structural rules — enforced, with a clear error if
you break them — are that the lowest band starts at `0`, each band's upper bound equals the next
one's lower bound, and the top band's `upper_bound_cents` is `null` (meaning unbounded).

### Doing it without destroying the old values

`commission_tiers` carries `effective_from` and `active` so a change can be additive rather than
overwriting. Insert the new bands with a later `effective_from` and deactivate the old ones — the
previous pricing stays on the record.

> ⚠️ **Not wired up yet.** Nothing currently reads `effective_from` — the query that would select
> "the tiers in effect right now" belongs to the `complete-ride` Edge Function, which isn't built.
> Until it is, treat the `active = true` rows as the live set and change them in place.

## Changing the flat fee

The fee is per-subscription, in cents:

```sql
-- $40/month for everyone currently on the standard plan.
update subscriptions set flat_fee_cents = 4000 where plan = 'standard';
```

Whether a driver is charged at all is `fee_active`, **not** a date. The pilot ends when you flip
that switch, not when six months elapse — so extending or shortening the pilot is a data change
with no code involved (ADR-0003).

One rule the code enforces: a row with `plan = 'pilot'` **and** `fee_active = true` is refused
outright rather than charged. That combination means something is wrong with the row, and billing
a driver during the pilot is exactly what it's there to prevent. Either set `fee_active` false or
move them to `standard`.

## After you change the numbers

Two places in the repo also *quote* the numbers, and they don't update themselves.

**1. The pinned test will fail — on purpose.**
`packages/pricing/src/commission.seed.test.ts` is the only file in the pricing package that knows
today's rates. It exists to make a repricing impossible to do silently. Update `SEED_TIERS` at the
top of it to match your new seed, then recompute the worked examples in that file. Every other test
in the package tests properties that hold for any rates, and should keep passing untouched — if one
of those fails, the change broke the math rather than just the pricing.

**2. The marketing copy quotes the old numbers.** Currently hand-maintained in:

- `monetization.md` — the tier table and the published "drivers keep ~86%" figure
- `../../apps/web/src/lib/mock-data.ts` — `commissionTiers`, `driverKeepsPct`, the worked example
- `../../apps/web/src/app/(marketing)/drivers/page.tsx` — one sentence spelling the rates out
- `../../brand/brand-guide.md` and `../../brand/design-system.md` — voice examples using a percentage

Making these derive from `@rido/pricing` instead of being retyped is tracked in `../roadmap.md`
(Phase 2). Until that lands, they're a manual step and easy to miss — which is the main reason this
page exists.

## Checklist

- [ ] Update the rows in `commission_tiers` (and `subscriptions`, if the fee changed).
- [ ] Update `supabase/seed/commission_tiers.sql` so a fresh database gets the same values.
- [ ] Update `SEED_TIERS` and the worked examples in `commission.seed.test.ts`; run
      `npm test --workspace=packages/pricing`.
- [ ] Update the marketing copy listed above.
- [ ] If the *rule* changed rather than the numbers — bracketed vs. something else — that needs a
      new ADR, not just a row edit. See `../CLAUDE.md`.
