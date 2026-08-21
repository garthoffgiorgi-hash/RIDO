-- bump_monthly_stats — atomically rolls a completed ride into driver_monthly_stats. Fires only
-- on the requested/accepted/in_progress -> completed transition. Pure orchestration (increment,
-- sum) — no commission math here, per root CLAUDE.md invariant 5.
--
-- SECURITY DEFINER is not strictly needed today (every UPDATE rides currently comes from the
-- service role, which already bypasses driver_monthly_stats' RLS) but matters for robustness:
-- once a future migration adds any authenticated write path to rides.status, this trigger
-- would otherwise run as that driver's role, hit driver_monthly_stats' RLS (no INSERT policy
-- for authenticated), and fail — breaking ride completion for everyone the moment that future
-- migration lands. Standard pattern for a trigger-fed table; costs nothing today.

create or replace function public.bump_monthly_stats()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_year_month text := public.rido_year_month(new.completed_at);
begin
  insert into driver_monthly_stats
    (driver_id, year_month, rides_count, gross_fare_cents, commission_cents, payout_cents, updated_at)
  values
    (new.driver_id, v_year_month, 1, new.fare_cents, new.commission_cents, new.driver_payout_cents, now())
  on conflict (driver_id, year_month) do update set
    rides_count = driver_monthly_stats.rides_count + 1,
    gross_fare_cents = driver_monthly_stats.gross_fare_cents + excluded.gross_fare_cents,
    commission_cents = driver_monthly_stats.commission_cents + excluded.commission_cents,
    payout_cents = driver_monthly_stats.payout_cents + excluded.payout_cents,
    updated_at = now();
  return new;
end;
$$;

create trigger rides_bump_monthly_stats
  after update of status on rides
  for each row
  when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function public.bump_monthly_stats();
