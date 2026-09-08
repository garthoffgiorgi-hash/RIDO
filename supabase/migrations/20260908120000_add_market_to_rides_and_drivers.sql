-- rides and drivers each gain a market column — the fact `fare_rate_cards` has carried since it
-- was created, and the only two tables that still can't answer "which market is this."
--
-- Rationale: docs/business/monetization.md describes the flat fee as "a state per driver/market,"
-- a sentence the schema couldn't make true until now — nothing but `fare_rate_cards` had a market
-- dimension at all. `commission_tiers` stays global on purpose; ADR-0002 never scoped commission
-- per market, and this migration doesn't change that.
--
-- ── WHY `text`, AND WHY A DEFAULT HERE BUT NOT ON `fare_rate_cards.market` ──────────────────
--
-- `text`, no CHECK, no foreign key: a market is a row-value fact, not a schema fact. Adding one
-- should never be a migration, so nothing here enumerates or references a fixed list.
--
-- `fare_rate_cards.market` has no default because that table is hand-maintained through a seed
-- file, never inserted into by the app — every row already states its market explicitly by
-- construction. `rides` and `drivers` are different: plenty of their own columns already default
-- for convenience (`drivers.status default 'pending'`, every `created_at`), and both are written
-- to by test fixtures and admin tooling that have no reason to care about market during a
-- single-market pilot. `default 'san-diego'` is that same convenience, not a second source of
-- truth for the value ADR-0009's calibration or any commission math would ever read — nothing
-- money-shaped touches this column. `apps/web/src/lib/rides/server.ts`'s `MARKET` constant is
-- still the one place `requestRide()`'s own write is driven from; it writes `market` explicitly
-- rather than leaning on this default, which exists for every writer that isn't it.
--
-- `not null default 'san-diego'` in one statement, not the usual add/backfill/set-not-null dance:
-- Postgres (since 11) stores a constant default for a `not null` column as catalog metadata rather
-- than rewriting the table, so every existing row is satisfied immediately without a separate
-- backfill step. `'san-diego'` is also the only market that has ever existed in this project, so
-- applying it to old rows is a historical fact, not a guess — the same reasoning
-- `driver_availability_log`'s backfill insert already relies on.

alter table rides add column market text not null default 'san-diego';
alter table drivers add column market text not null default 'san-diego';

comment on column rides.market is
  'Which market this ride belongs to — free text, matching fare_rate_cards.market, so a new '
  'market is a row, not a migration. Defaults to ''san-diego'' for convenience (test fixtures, '
  'admin tooling); apps/web/src/lib/rides/server.ts''s MARKET constant is still the one place '
  'that literal lives, and requestRide() writes it explicitly rather than relying on this default.';

comment on column drivers.market is
  'Which market this driver belongs to — same shape and reasoning as rides.market. There is no '
  'self-serve driver signup (apps/web/CLAUDE.md), so this is written by whatever creates the row, '
  'same as every other vetting fact on this table; the default covers admin tooling that omits it.';
