#!/usr/bin/env bash
# The claim ADR-0008 rests on, proved rather than asserted: two completions for the SAME driver
# landing at the same instant produce one 'applied' and one 'conflict' — never two snapshots
# rated from the same stale month-to-date position.
#
# Why this needs two connections, and why 005_apply_ride_commission.sql cannot cover it: the two
# completions are for DIFFERENT rides rows. There is no write conflict between them. Postgres
# will happily let both commit. The only thing that serializes them is reserve_driver_month's
# lock on the driver's month row, and the only thing that then catches the second one is the
# compare-and-swap. pg_prove runs a single connection, so it can exercise the CAS logic but not
# the race the CAS exists for. Same division of labour as 004 / concurrent-completion.sh.
#
# Method: session A applies ride A inside a held-open transaction, then sleeps before committing.
# Session B starts once A holds the lock and applies ride B, rated — like A — against a
# month-to-date of 0. B must block until A commits, then see the bumped figure and refuse.
#
# Two failure modes this distinguishes:
#   B returns 'applied'            -> the lock is not serializing them; both rides were rated
#                                     from the same stale position. The books are wrong.
#   B returns instantly            -> B never blocked; it read a snapshot from before A's commit.
#
# Usage: PGDATABASE=<db> ./concurrent-apply-ride-commission.sh
# (or pass connection info any other way psql accepts — PGHOST, PGUSER, a connection string as $1)
#
# The commission figures below are arbitrary consistent values, not RIDO's rates:
# apply_ride_commission stores what it is given and never computes a rate.

set -euo pipefail

CONN="${1:-${PGDATABASE:-postgres}}"
SLEEP_SECONDS=2
DRIVER_AUTH_ID="f0000000-0000-0000-0000-000000000002"
FARE_CENTS=1000
COMMISSION_CENTS=300
PAYOUT_CENTS=700
RATE_BPS=3000

psql -d "$CONN" -v ON_ERROR_STOP=1 -q <<SQL
insert into auth.users (id) values ('$DRIVER_AUTH_ID') on conflict do nothing;
insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
values ('$DRIVER_AUTH_ID', 'CAS Test Driver', 'active', 'passed', 'passed')
on conflict (auth_user_id) do nothing;

-- A clean month: no rollup row, no leftover rides from a previous run.
delete from rides
  where driver_id = (select id from drivers where auth_user_id = '$DRIVER_AUTH_ID');
delete from driver_monthly_stats
  where driver_id = (select id from drivers where auth_user_id = '$DRIVER_AUTH_ID');

insert into rides (rider_id, driver_id, status, fare_cents)
select '$DRIVER_AUTH_ID',
       (select id from drivers where auth_user_id = '$DRIVER_AUTH_ID'),
       'accepted', $FARE_CENTS
from generate_series(1, 2);
SQL

read -r RIDE_A RIDE_B <<<"$(psql -d "$CONN" -tA -F' ' -c "
  select string_agg(id::text, ' ' order by id)
  from rides
  where driver_id = (select id from drivers where auth_user_id = '$DRIVER_AUTH_ID');
")"
YEAR_MONTH=$(psql -d "$CONN" -tA -c "select rido_year_month(now());")

APPLY="apply_ride_commission(%s, '$YEAR_MONTH', 0, $RATE_BPS, $COMMISSION_CENTS, $PAYOUT_CENTS)"

A_OUT=$(mktemp)
trap 'rm -f "$A_OUT"' EXIT

# Session A: apply, hold the transaction open, then commit. Backgrounded.
psql -d "$CONN" -v ON_ERROR_STOP=1 -tA -q >"$A_OUT" <<SQL &
begin;
select outcome from $(printf "$APPLY" "'$RIDE_A'");
select pg_sleep($SLEEP_SECONDS);
commit;
SQL
A_PID=$!

# Let A acquire the month lock before B starts racing it.
sleep 0.5

B_START=$(date +%s.%N)
B_OUTCOME=$(psql -d "$CONN" -v ON_ERROR_STOP=1 -tA -c "
  select outcome from $(printf "$APPLY" "'$RIDE_B'");
")
B_END=$(date +%s.%N)

wait "$A_PID"
A_OUTCOME=$(grep -Ev '^\s*$' "$A_OUT" | head -1)

B_ELAPSED=$(echo "$B_END - $B_START" | bc)
# B started 0.5s after A, so a genuinely blocked B takes roughly SLEEP_SECONDS - 0.5. Require
# half of that: generous enough for scheduling jitter, nowhere near what an unblocked call
# (near-instant) would produce. Same threshold reasoning as concurrent-completion.sh.
THRESHOLD=$(echo "($SLEEP_SECONDS - 0.5) / 2" | bc -l)

MTD=$(psql -d "$CONN" -tA -c "
  select gross_fare_cents from driver_monthly_stats
  where driver_id = (select id from drivers where auth_user_id = '$DRIVER_AUTH_ID');
")
COMPLETED=$(psql -d "$CONN" -tA -c "
  select count(*) from rides
  where driver_id = (select id from drivers where auth_user_id = '$DRIVER_AUTH_ID')
    and status = 'completed';
")

echo "session A outcome: $A_OUTCOME"
echo "session B outcome: $B_OUTCOME (elapsed ${B_ELAPSED}s, threshold >${THRESHOLD}s)"
echo "rides completed: $COMPLETED, month-to-date gross: $MTD"

FAILED=0
[ "$A_OUTCOME" = "applied" ]  || { echo "FAIL: session A should have applied, got '$A_OUTCOME'."; FAILED=1; }
[ "$B_OUTCOME" = "conflict" ] || { echo "FAIL: session B rated against a stale month-to-date and was NOT refused (got '$B_OUTCOME'). Two rides would carry commission computed from the same position."; FAILED=1; }
[ "$COMPLETED" = "1" ]        || { echo "FAIL: expected exactly 1 completed ride, found $COMPLETED."; FAILED=1; }
[ "$MTD" = "$FARE_CENTS" ]    || { echo "FAIL: expected month-to-date $FARE_CENTS, found $MTD."; FAILED=1; }

if (( $(echo "$B_ELAPSED > $THRESHOLD" | bc -l) )); then
  echo "session B blocked on session A's lock, as required."
else
  echo "FAIL: session B returned too quickly — it never blocked, so its refusal was luck rather than the lock."
  FAILED=1
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: concurrent completions for one driver yield exactly one snapshot; the loser is refused and must re-rate."
  exit 0
fi
exit 1
