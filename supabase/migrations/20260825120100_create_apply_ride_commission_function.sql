-- apply_ride_commission — the write half of complete-ride, as one server-side transaction.
--
-- WHY THIS EXISTS AT ALL. reserve_driver_month's header states the requirement plainly: its
-- lock, the @rido/pricing calculation, and the UPDATE rides "must all run inside ONE held-open
-- transaction/connection. Three independent auto-committing client calls would release this
-- lock before the commission is even computed, and the protection evaporates."
--
-- Every supabase-js call auto-commits. Holding a transaction open across all three would mean a
-- raw Postgres driver and a connection string inside an Edge Function — a second data path with
-- its own pooling story, for one function. So the transaction moves here instead, and the
-- commission arrives as an argument rather than being computed inside it.
--
-- That inverts the ordering problem: the commission is now computed against an MTD figure read
-- BEFORE any lock was held, so it may be stale by the time we get here. Hence compare-and-swap.
-- The caller tells us what it rated against; under the lock we check that's still true, and
-- refuse if it isn't. (ADR-0008.)
--
-- WHY THE LOCK IS STILL REQUIRED. Compare-and-swap alone is not enough. Two concurrent
-- completions for the same driver update two DIFFERENT rides rows — there is no write conflict
-- to serialize them — so both would find their expectation satisfied and both would commit a
-- commission rated from the same stale position. reserve_driver_month is what makes the second
-- caller block; its INSERT ... ON CONFLICT DO UPDATE ... RETURNING then re-reads the row
-- version the first transaction committed, and the check below sees the new figure and refuses.
-- (That re-read-after-blocking behaviour is exactly why it was written as an upsert rather than
-- SELECT ... FOR UPDATE — see its own header.)
--
-- WHAT MAY GO BETWEEN THE LOCK AND COMMIT. The MTD re-read, the comparison, and the one UPDATE.
-- Nothing else, ever — the lock is held on that driver's whole month, so anything slow in here
-- serializes that driver's completions behind it. This isn't enforced by a comment: it's
-- enforced by location. There is no way to make a network call or run an optimizer from inside
-- a SQL function, which is the point of putting the critical section here rather than in Deno.
--
-- SECURITY INVOKER, deliberately, unlike bump_monthly_stats. Only service_role can execute this,
-- and service_role already bypasses RLS, so DEFINER buys nothing today. What it would cost is
-- tomorrow: if some later migration grants execute to `authenticated`, a DEFINER function would
-- silently hand that role a full RLS bypass on rides. As INVOKER, the same mistake fails loudly.

create type public.ride_commission_application as (
  outcome             text,
  ride_id             uuid,
  ride_status         text,
  fare_cents          bigint,
  year_month          text,
  mtd_gross_cents     bigint,
  commission_rate_bps integer,
  commission_cents    bigint,
  driver_payout_cents bigint,
  completed_at        timestamptz
);

comment on type public.ride_commission_application is
  'Result of apply_ride_commission. `outcome` is one of: applied, conflict, already_completed, '
  'not_found, not_completable. On conflict, year_month and mtd_gross_cents carry the CURRENT '
  'values so the caller can re-rate without another round trip.';

create or replace function public.apply_ride_commission(
  p_ride_id                  uuid,
  p_expected_year_month      text,
  p_expected_mtd_gross_cents bigint,
  p_commission_rate_bps      integer,
  p_commission_cents         bigint,
  p_driver_payout_cents      bigint
)
returns public.ride_commission_application
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ride   rides;
  v_stats  driver_monthly_stats;
  v_result ride_commission_application;
  -- One timestamp for the month bucket, the lock, and the row. now() is transaction-start time
  -- and so already constant here, but binding it makes that a property of this code rather than
  -- something a reader has to know: reserve_driver_month buckets on it, bump_monthly_stats
  -- buckets on completed_at, and those two must not be able to land in different months.
  v_now    timestamptz := now();
begin
  v_result.outcome := null;
  v_result.ride_id := p_ride_id;

  -- Lock the ride first. Cheap, and it means a second caller racing on the SAME ride (rather
  -- than two rides of one driver) serializes here instead of on the month row.
  select * into v_ride from rides where id = p_ride_id for update;

  if not found then
    v_result.outcome := 'not_found';
    return v_result;
  end if;

  v_result.ride_status := v_ride.status;
  v_result.fare_cents  := v_ride.fare_cents;

  -- Idempotency. A ride already carrying a snapshot is returned as-is, never re-rated: the
  -- commission columns are write-once (rides_prevent_commission_rewrite) and a completed ride
  -- reads its snapshot rather than recomputing (root CLAUDE.md invariant 2). A retried request
  -- — a dropped response, a client retry — must be safe, not a second billing event.
  if v_ride.status = 'completed' then
    v_result.outcome             := 'already_completed';
    v_result.year_month          := public.rido_year_month(v_ride.completed_at);
    v_result.commission_rate_bps := v_ride.commission_rate_bps;
    v_result.commission_cents    := v_ride.commission_cents;
    v_result.driver_payout_cents := v_ride.driver_payout_cents;
    v_result.completed_at        := v_ride.completed_at;
    return v_result;
  end if;

  -- A ride nobody accepted, or one already canceled, has no business being completed.
  if v_ride.status not in ('accepted', 'in_progress') then
    v_result.outcome := 'not_completable';
    return v_result;
  end if;

  -- THE CRITICAL SECTION STARTS HERE. First statement to touch driver_monthly_stats, exactly as
  -- reserve_driver_month's contract requires.
  v_stats := public.reserve_driver_month(v_ride.driver_id, v_now);

  -- Compare-and-swap. year_month is part of the tuple, not just the amount, so a completion the
  -- caller rated against one month but which lands in the next — a ride finishing across the
  -- month boundary — conflicts and re-rates instead of being charged against the wrong month's
  -- position. No client-supplied timestamp is trusted anywhere in this function.
  if v_stats.year_month is distinct from p_expected_year_month
     or v_stats.gross_fare_cents is distinct from p_expected_mtd_gross_cents then
    v_result.outcome         := 'conflict';
    v_result.year_month      := v_stats.year_month;
    v_result.mtd_gross_cents := v_stats.gross_fare_cents;
    return v_result;
  end if;

  -- One statement, because rides_commission_present_iff_completed makes status and all three
  -- commission columns move together or not at all. ride-completion.md's "snapshot, then mark
  -- completed" reads as two steps; the constraint makes them one, and there is no ordering of
  -- two UPDATEs that satisfies it.
  update rides set
    status              = 'completed',
    completed_at        = v_now,
    commission_rate_bps = p_commission_rate_bps,
    commission_cents    = p_commission_cents,
    driver_payout_cents = p_driver_payout_cents
  where id = p_ride_id;
  -- rides_bump_monthly_stats fires here, inside this transaction, on the row locked above.
  -- CRITICAL SECTION ENDS AT COMMIT.

  v_result.outcome             := 'applied';
  v_result.ride_status         := 'completed';
  v_result.year_month          := v_stats.year_month;
  v_result.mtd_gross_cents     := v_stats.gross_fare_cents + v_ride.fare_cents;
  v_result.commission_rate_bps := p_commission_rate_bps;
  v_result.commission_cents    := p_commission_cents;
  v_result.driver_payout_cents := p_driver_payout_cents;
  v_result.completed_at        := v_now;
  return v_result;
end;
$$;

comment on function public.apply_ride_commission(uuid, text, bigint, integer, bigint, bigint) is
  'Applies a commission snapshot computed by @rido/pricing, under compare-and-swap on the '
  'driver''s month-to-date position. Never computes commission itself (root CLAUDE.md '
  'invariant 5). See this file''s header and ADR-0008.';

revoke execute on function
  public.apply_ride_commission(uuid, text, bigint, integer, bigint, bigint)
  from public, anon, authenticated;
grant execute on function
  public.apply_ride_commission(uuid, text, bigint, integer, bigint, bigint)
  to service_role;
