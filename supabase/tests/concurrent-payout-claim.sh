#!/usr/bin/env bash
# The claim 20260901130000_add_payout_attempt_claim.sql rests on, proved rather than asserted:
# two settle() calls racing the SAME driver_payouts row produce exactly one winner — never two
# Stripe transfers for one payout, and never a lost claim where both believe they hold it.
#
# Why this needs two connections, and why 013_payout_attempt_claim.sql cannot cover it: pg_prove
# runs a single connection, so it can exercise claim_driver_payout_attempt's WHERE clause
# sequentially but never prove it actually serializes two simultaneous callers. Same division of
# labour as concurrent-accept-ride.sh: the claim touches exactly one row, so Postgres serializes
# two UPDATEs against it on its own — the second blocks on the first's row lock, then re-checks
# its WHERE predicate (settling = false) against whatever the first committed, and finds no match.
#
# Method: session A claims the row inside a held-open transaction, then sleeps before committing.
# Session B starts once A holds the row lock and attempts to claim the SAME row. B must block
# until A commits, then get null — not a second attempt number.
#
# Two failure modes this distinguishes:
#   B also gets a number  -> the claim did not serialize them; two attempts could both reach
#                             Stripe with different idempotency keys, risking two real transfers.
#                             This is the one outcome that must be structurally impossible.
#   B returns instantly    -> B never blocked; it wasn't actually racing A at the database level.
#
# Usage: PGDATABASE=<db> ./concurrent-payout-claim.sh
# (or pass connection info any other way psql accepts — PGHOST, PGUSER, a connection string as $1)

set -euo pipefail

CONN="${1:-${PGDATABASE:-postgres}}"
SLEEP_SECONDS=2
DRIVER_AUTH_ID="f0000000-0000-0000-0000-000000000030"

psql -d "$CONN" -v ON_ERROR_STOP=1 -q <<SQL
insert into auth.users (id) values ('$DRIVER_AUTH_ID') on conflict do nothing;
insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
values ('$DRIVER_AUTH_ID', 'Claim Race Driver', 'active', 'passed', 'passed')
on conflict (auth_user_id) do nothing;

-- A clean slate: no leftover payouts from a previous run of this script.
delete from driver_payouts
  where driver_id in (select id from drivers where auth_user_id = '$DRIVER_AUTH_ID');

insert into driver_payouts (driver_id, ride_id, amount_cents)
select id, null, 1234 from drivers where auth_user_id = '$DRIVER_AUTH_ID';
SQL

PAYOUT_ID=$(psql -d "$CONN" -tA -c "
  select dp.id from driver_payouts dp
  join drivers d on d.id = dp.driver_id
  where d.auth_user_id = '$DRIVER_AUTH_ID';
")

CLAIM="select claim_driver_payout_attempt('$PAYOUT_ID')"

A_OUT=$(mktemp)

# Clean up on the way out, not only on the way in. This script's fixture is a driver_payouts row,
# and 011_driver_payouts.sql asserts a GLOBAL count of that table — so leaving one behind makes a
# later pgTAP run fail on a row this script created. A test that breaks a different test is worse
# than no test. (Same fix as concurrent-charge-claim.sh, for the same reason.)
cleanup() {
  rm -f "$A_OUT"
  psql -d "$CONN" -q -c "
    delete from driver_payouts
      where driver_id in (select id from drivers where auth_user_id = '$DRIVER_AUTH_ID');
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

FINAL_SETTLING=$(psql -d "$CONN" -tA -c "select settling from driver_payouts where id = '$PAYOUT_ID';")
FINAL_ATTEMPT=$(psql -d "$CONN" -tA -c "select attempt_count from driver_payouts where id = '$PAYOUT_ID';")

echo "session A returned: '${A_RESULT:-<none>}'"
echo "session B returned: '${B_RESULT:-<none>}' (elapsed ${B_ELAPSED}s, threshold >${THRESHOLD}s)"
echo "final payout state: settling=$FINAL_SETTLING attempt_count=$FINAL_ATTEMPT"

FAILED=0
[ "$A_RESULT" = "1" ] || { echo "FAIL: session A should have won attempt 1, got '${A_RESULT:-<none>}'."; FAILED=1; }
[ -z "$B_RESULT" ]    || { echo "FAIL: session B ALSO claimed an attempt (got '${B_RESULT}') — two attempts could reach Stripe with different idempotency keys."; FAILED=1; }
[ "$FINAL_ATTEMPT" = "1" ] || { echo "FAIL: expected attempt_count 1 (one winning claim only), found '$FINAL_ATTEMPT'."; FAILED=1; }

if (( $(echo "$B_ELAPSED > $THRESHOLD" | bc -l) )); then
  echo "session B blocked on session A's row lock, as required."
else
  echo "FAIL: session B returned too quickly — it never blocked, so its refusal was luck rather than the WHERE clause."
  FAILED=1
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: two calls racing the same payout yield exactly one claim; the loser's call returns null."
  exit 0
fi
exit 1
