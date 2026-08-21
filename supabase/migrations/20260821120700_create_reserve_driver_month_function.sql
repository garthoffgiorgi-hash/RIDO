-- reserve_driver_month — the fix for a race the naive rollup trigger alone doesn't cover.
--
-- The rollup trigger's INSERT ... ON CONFLICT DO UPDATE (next migration) gets the arithmetic
-- right under concurrency: Postgres serializes concurrent writers to the same
-- (driver_id, year_month) row via the unique index, so the counters always end up correct.
--
-- But that only protects the WRITE. docs/architecture/ride-completion.md's step 1 — reading
-- month-to-date gross before computing THIS ride's commission — is a separate, earlier read.
-- Two truly concurrent completions for the same driver can both read the same pre-update MTD
-- figure, both compute their commission from the same (wrong, for one of them) baseline, and
-- both then write a technically-correct-looking but substantively wrong snapshot. The rollup's
-- correct counters don't fix that — the commission was already miscalculated before the rollup
-- ever ran, and because commission columns are write-once, that error is permanent.
--
-- This function must be the FIRST statement of complete-ride's transaction, before anything
-- else touches driver_monthly_stats. Its DO UPDATE is a no-op self-touch — its only job is to
-- take the row's lock (via the unique index) before the commission gets computed, including
-- handling "first ride of the month" atomically (a plain SELECT ... FOR UPDATE returns zero
-- rows and locks nothing when no row exists yet). A second concurrent completion for the same
-- driver+month blocks on this call until the first transaction commits, so it reads the correct
-- post-commit baseline.
--
-- Consequence for complete-ride (not built in this migration pass, but designed for): this
-- call, the @rido/pricing commission calculation, and the UPDATE rides must all run inside ONE
-- held-open transaction/connection. Three independent auto-committing client calls would
-- release this lock before the commission is even computed, and the protection evaporates.

create or replace function public.reserve_driver_month(p_driver_id uuid, p_completed_at timestamptz)
returns driver_monthly_stats
language sql
set search_path = public, pg_temp
as $$
  insert into driver_monthly_stats (driver_id, year_month)
  values (p_driver_id, public.rido_year_month(p_completed_at))
  on conflict (driver_id, year_month)
  do update set updated_at = driver_monthly_stats.updated_at
  returning *;
$$;

comment on function public.reserve_driver_month(uuid, timestamptz) is
  'MUST be the first statement of complete-ride''s transaction, before reading MTD gross. '
  'Takes the row''s lock so a concurrent completion for the same driver+month blocks until '
  'this transaction commits — see this file''s header for why that''s required.';

revoke execute on function public.reserve_driver_month(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.reserve_driver_month(uuid, timestamptz) to service_role;
