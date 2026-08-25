-- The two reads complete-ride does before it computes anything: which bands are in effect, and
-- where this driver stands in the month. Both are here rather than in the client for the same
-- reason — each needs a definition of "now" in RIDO's timezone, and that definition has one home
-- (root CLAUDE.md invariant 9, rido_year_month).
--
-- Comparing against a UTC date instead would activate a scheduled rate change up to eight hours
-- early, and could read a driver's month-to-date from the wrong bucket for eight hours either
-- side of a month boundary. Both are small, and both are exactly the kind of quiet wrongness
-- that costs a driver money and is very hard to explain afterwards.
--
-- Neither is money math — one selects and sorts rows, the other reads a single stored figure.
-- The bracketing arithmetic stays in packages/pricing (root CLAUDE.md invariant 5).

-- commission_tiers has carried `active` and `effective_from` since it was created, so a
-- repricing could be non-destructive and auditable rather than an overwrite
-- (docs/business/changing-rates.md). Nothing had read them until now: complete-ride is the first
-- caller that needs the CURRENT set rather than the whole table.
--
-- normalizeTiers still validates whatever this returns — a gap, an overlap, or a missing
-- unbounded top band is a data problem this query cannot see.
create or replace function public.active_commission_tiers()
returns setof commission_tiers
language sql
stable
set search_path = public, pg_temp
as $$
  select *
  from commission_tiers
  where active
    and effective_from <= (now() at time zone 'America/Los_Angeles')::date
  order by tier_order;
$$;

comment on function public.active_commission_tiers() is
  'The commission bands in effect today, ordered by tier_order. Day boundary is '
  'America/Los_Angeles, matching rido_year_month() — see root CLAUDE.md invariant 9.';

-- Readable by any signed-in user, matching commission_tiers_select_authenticated: a driver has
-- to be able to see the rates to be shown "you keep $X (Y%)" before accepting a ride. STABLE and
-- read-only, so there is nothing here to abuse.
grant execute on function public.active_commission_tiers() to authenticated, service_role;

-- The driver's month-to-date gross, and the bucket it belongs to, as one answer.
--
-- Returns 0 when no rollup row exists yet — a driver's first ride of the month genuinely has a
-- month-to-date position of zero. That is not a papered-over missing row: reserve_driver_month
-- creates it, under the lock, with gross_fare_cents = 0, so the compare-and-swap in
-- apply_ride_commission matches rather than spuriously conflicting on the first ride.
--
-- Deliberately NOT granted to authenticated. A driver can already read their own
-- driver_monthly_stats row through RLS; this exists for the completion path, and as SECURITY
-- INVOKER a driver calling it for someone else's id would silently get 0 rather than an error.
-- Keeping the grant to service_role means that confusion can't arise.
create or replace function public.driver_month_to_date(p_driver_id uuid)
returns table (year_month text, gross_fare_cents bigint)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    public.rido_year_month(now()),
    coalesce(
      (
        select s.gross_fare_cents
        from driver_monthly_stats s
        where s.driver_id = p_driver_id
          and s.year_month = public.rido_year_month(now())
      ),
      0::bigint
    );
$$;

comment on function public.driver_month_to_date(uuid) is
  'A driver''s month-to-date gross fares and the year_month bucket it falls in, 0 when the '
  'month has no rides yet. The figure complete-ride rates against and then re-checks under '
  'lock — see ADR-0008.';

revoke execute on function public.driver_month_to_date(uuid) from public, anon, authenticated;
grant execute on function public.driver_month_to_date(uuid) to service_role;
