-- Payout attempts get their own exclusive claim, so a retried transfer actually retries.
--
-- WHY THIS EXISTS. createTransfer's idempotency key was the payout row's id alone
-- (`rido_payout_<id>`) — stable across every call for that row, deliberately, so two concurrent
-- settle() calls would collapse into one Stripe transfer. But Stripe caches the *entire* response
-- for an idempotency key, success or failure, for at least 24 hours, and replays it verbatim on
-- reuse regardless of what changed since. A payout that failed retryable
-- (balance_insufficient — the expected production state until rider charging ships) was
-- therefore poisoned: every later retry, however much the platform balance changed, got the same
-- cached failure replayed back rather than a fresh attempt. Confirmed against a real Stripe test
-- account — funding the platform balance never cleared a stuck row; only a brand-new payout (a
-- fresh id, a fresh key) ever succeeded.
--
-- THE FIX. The idempotency key must change on every genuinely new attempt, while two concurrent
-- callers for the SAME attempt still collapse to one Stripe call — the property the original
-- design was protecting. attempt_count supplies the changing half of the key; settling (plus
-- settling_since, for stale-lock recovery) supplies the exclusivity, using the same
-- conditional-UPDATE-is-the-whole-mechanism pattern supabase/CLAUDE.md already documents for
-- driver accept — the claim touches exactly one row, so Postgres's row lock serializes two
-- simultaneous callers on its own, no compare-and-swap function needed.

alter table driver_payouts
  add column attempt_count integer not null default 0,
  add column settling boolean not null default false,
  add column settling_since timestamptz;

comment on column driver_payouts.attempt_count is
  'How many times settle() has attempted this row. Folded into Stripe''s idempotency key so a '
  'genuinely new retry is not a replay of a stale cached response.';

comment on column driver_payouts.settling is
  'True while an attempt is in flight. The exclusivity half of claim_driver_payout_attempt — set '
  'and cleared only by that function pair, never by application code directly.';

comment on column driver_payouts.settling_since is
  'When the current (or most recent) claim was taken. Lets claim_driver_payout_attempt recover a '
  'claim abandoned by a crashed or timed-out request rather than stranding the row forever.';

-- Claims exclusive right to attempt this payout and hands back the attempt number the caller
-- must fold into Stripe's idempotency key. Returns null if someone else is already mid-attempt
-- (a genuine race) or the row is already paid — either way, the caller must not call Stripe.
--
-- STALE-LOCK RECOVERY: two minutes is not a business rule, it's operational headroom against a
-- crashed or timed-out request that claimed but never released — a Stripe transfer call normally
-- resolves in well under a second. Without this, one abandoned attempt would permanently strand a
-- payout, which is worse than the bug this migration fixes.
create or replace function public.claim_driver_payout_attempt(p_payout_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt integer;
begin
  update driver_payouts
  set settling = true,
      settling_since = now(),
      attempt_count = attempt_count + 1
  where id = p_payout_id
    and status <> 'paid'
    and (settling = false or settling_since < now() - interval '2 minutes')
  returning attempt_count into v_attempt;

  return v_attempt;
end;
$$;

comment on function public.claim_driver_payout_attempt(uuid) is
  'Exclusively claims one payout attempt and returns its attempt number for the Stripe '
  'idempotency key, or null if another attempt is already in flight or the row is already paid.';

revoke execute on function public.claim_driver_payout_attempt(uuid) from public, anon, authenticated;
grant execute on function public.claim_driver_payout_attempt(uuid) to service_role;

-- Releases a claim once an attempt finishes, win or lose, so the next genuine retry can claim
-- fresh. Called from settle()'s finally block, unconditionally — a release that "shouldn't" have
-- happened costs nothing (status <> 'paid' still gates the next claim), but a claim left stuck
-- costs a driver their money until the two-minute staleness window passes.
create or replace function public.release_driver_payout_attempt(p_payout_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update driver_payouts set settling = false where id = p_payout_id;
end;
$$;

comment on function public.release_driver_payout_attempt(uuid) is
  'Clears the in-flight claim claim_driver_payout_attempt set, so a later genuine retry can claim '
  'again. Always called from settle()''s finally block.';

revoke execute on function public.release_driver_payout_attempt(uuid) from public, anon, authenticated;
grant execute on function public.release_driver_payout_attempt(uuid) to service_role;
