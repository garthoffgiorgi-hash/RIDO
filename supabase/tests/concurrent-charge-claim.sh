#!/usr/bin/env bash
# The claim 20260902120100_create_ride_charges.sql rests on, proved rather than asserted: two
# settle-shaped calls racing the SAME ride_charges row produce exactly one winner — never two
# captures of one hold, and never a lost claim where both callers believe they hold it.
#
# Why this needs two connections, and why 015_ride_charges.sql cannot cover it: pg_prove runs a
# single connection, so it can exercise claim_ride_charge_attempt's WHERE clause sequentially but
# never prove it actually serializes two simultaneous callers. Same division of labour as
# concurrent-payout-claim.sh, which proves the identical property for the outbound side.
#
# Method: session A claims the charge inside a held-open transaction, then sleeps before
# committing. Session B starts once A holds the row lock and attempts to claim the SAME charge.
# B must block until A commits, then get null — not a second attempt number.
#
# Two failure modes this distinguishes:
#   B also gets a number  -> the claim did not serialize them; two attempts could reach Stripe with
#                             different idempotency keys, and a rider could be captured against
#                             twice. This is the one outcome that must be structurally impossible.
#   B returns instantly    -> B never blocked; it wasn't actually racing A at the database level.
#
# Usage: PGDATABASE=<db> ./concurrent-charge-claim.sh
# (or pass connection info any other way psql accepts — PGHOST, PGUSER, a connection string as $1)

set -euo pipefail

CONN="${1:-${PGDATABASE:-postgres}}"
SLEEP_SECONDS=2
RIDER_ID="f0000000-0000-0000-0000-000000000040"

psql -d "$CONN" -v ON_ERROR_STOP=1 -q <<SQL
insert into auth.users (id) values ('$RIDER_ID') on conflict do nothing;

-- A clean slate: no leftover rides or charges from a previous run of this script.
delete from ride_charges where rider_id = '$RIDER_ID';
delete from rides where rider_id = '$RIDER_ID';

insert into rides (rider_id, driver_id, status, fare_cents, rider_total_cents)
values ('$RIDER_ID', null, 'requested', 1240, 1240);

insert into ride_charges (ride_id, rider_id, authorized_cents, status)
select id, '$RIDER_ID', 1426, 'authorized' from rides where rider_id = '$RIDER_ID';
SQL

CHARGE_ID=$(psql -d "$CONN" -tA -c "
  select id from ride_charges where rider_id = '$RIDER_ID';
")

CLAIM="select claim_ride_charge_attempt('$CHARGE_ID')"

A_OUT=$(mktemp)

# Clean up on the way out, not only on the way in. The other concurrency scripts only clear their
# fixtures at startup, which is fine for them — an 'accepted' ride is invisible to everything else.
# This one creates a 'requested' ride with no driver, which IS the open-request pool
# 009_driver_accept.sql counts, so leaving it behind makes a later pgTAP run fail on a row this
# script created. A test that breaks a different test is worse than no test.
cleanup() {
  rm -f "$A_OUT"
  psql -d "$CONN" -q -c "
    delete from ride_charges where rider_id = '$RIDER_ID';
    delete from rides where rider_id = '$RIDER_ID';
  " 2>/dev/null || true
}
trap cleanup EXIT

# Session A: claim, hold the transaction open, then commit. Backgrounded.
psql -d "$CONN" -v ON_ERROR_STOP=1 -tA -q >"$A_OUT" <<SQL &
begin;
$CLAIM;
select pg_sleep($SLEEP_SECONDS);
commit;
SQL
A_PID=$!

# Let A acquire the row lock before B starts racing it.
sleep 0.5

B_START=$(date +%s.%N)
B_RESULT=$(psql -d "$CONN" -v ON_ERROR_STOP=1 -tAq -c "$CLAIM;")
B_END=$(date +%s.%N)

wait "$A_PID"
A_RESULT=$(grep -Ev '^\s*$' "$A_OUT" | head -1)

B_ELAPSED=$(echo "$B_END - $B_START" | bc)
# B started 0.5s after A, so a genuinely blocked B takes roughly SLEEP_SECONDS - 0.5. Require
# half of that: generous enough for scheduling jitter, nowhere near what an unblocked call
# (near-instant) would produce. Same threshold reasoning as the other concurrency scripts.
THRESHOLD=$(echo "($SLEEP_SECONDS - 0.5) / 2" | bc -l)

FINAL_SETTLING=$(psql -d "$CONN" -tA -c "select settling from ride_charges where id = '$CHARGE_ID';")
FINAL_ATTEMPT=$(psql -d "$CONN" -tA -c "select attempt_count from ride_charges where id = '$CHARGE_ID';")

echo "session A returned: '${A_RESULT:-<none>}'"
echo "session B returned: '${B_RESULT:-<none>}' (elapsed ${B_ELAPSED}s, threshold >${THRESHOLD}s)"
echo "final charge state: settling=$FINAL_SETTLING attempt_count=$FINAL_ATTEMPT"

FAILED=0
[ "$A_RESULT" = "1" ] || { echo "FAIL: session A should have won attempt 1, got '${A_RESULT:-<none>}'."; FAILED=1; }
[ -z "$B_RESULT" ]    || { echo "FAIL: session B ALSO claimed an attempt (got '${B_RESULT}') — two captures of one hold become possible."; FAILED=1; }
[ "$FINAL_ATTEMPT" = "1" ] || { echo "FAIL: expected attempt_count 1 (one winning claim only), found '$FINAL_ATTEMPT'."; FAILED=1; }

if (( $(echo "$B_ELAPSED > $THRESHOLD" | bc -l) )); then
  echo "session B blocked on session A's row lock, as required."
else
  echo "FAIL: session B returned too quickly — it never blocked, so its refusal was luck rather than the WHERE clause."
  FAILED=1
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: two calls racing the same charge yield exactly one claim; the loser's call returns null."
  exit 0
fi
exit 1
