#!/usr/bin/env bash
# The claim ADR-0013 rests on, proved rather than asserted: two drivers tapping Accept on the
# SAME ride at the same instant produce exactly one winner — never two drivers holding the same
# ride, and never a lost update where both believe they won.
#
# Why this needs two connections, and why 009_driver_accept.sql cannot cover it: pg_prove runs a
# single connection, so it can exercise the conditional UPDATE's WHERE clause sequentially but
# never prove it actually serializes two simultaneous writers. Same division of labour as
# 004/concurrent-completion.sh and 005/concurrent-apply-ride-commission.sh — except accept needs
# no lock and no compare-and-swap function: the UPDATE's own WHERE clause
# (status = 'requested' AND driver_id IS NULL) is the entire mechanism, because accept touches
# only the one row it's racing over. Postgres serializes two UPDATEs against the same row on its
# own — the second blocks on the first's row lock, then re-checks its WHERE predicate against
# whatever the first committed, and finds no match.
#
# Method: session A accepts the ride inside a held-open transaction, then sleeps before
# committing. Session B starts once A holds the row lock and attempts to accept the SAME ride for
# a DIFFERENT driver. B must block until A commits, then affect zero rows.
#
# Two failure modes this distinguishes:
#   B also succeeds        -> the WHERE clause did not serialize them; two drivers both "won".
#                              This is the one outcome that must be structurally impossible.
#   B returns instantly     -> B never blocked; it wasn't actually racing A at the database level.
#
# Usage: PGDATABASE=<db> ./concurrent-accept-ride.sh
# (or pass connection info any other way psql accepts — PGHOST, PGUSER, a connection string as $1)

set -euo pipefail

CONN="${1:-${PGDATABASE:-postgres}}"
SLEEP_SECONDS=2
DRIVER_A_AUTH_ID="f0000000-0000-0000-0000-000000000020"
DRIVER_B_AUTH_ID="f0000000-0000-0000-0000-000000000021"
RIDER_ID="f0000000-0000-0000-0000-000000000022"
FARE_CENTS=1000

psql -d "$CONN" -v ON_ERROR_STOP=1 -q <<SQL
insert into auth.users (id) values ('$DRIVER_A_AUTH_ID'), ('$DRIVER_B_AUTH_ID'), ('$RIDER_ID')
  on conflict do nothing;
insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
values
  ('$DRIVER_A_AUTH_ID', 'Race Driver A', 'active', 'passed', 'passed'),
  ('$DRIVER_B_AUTH_ID', 'Race Driver B', 'active', 'passed', 'passed')
on conflict (auth_user_id) do nothing;

-- A clean slate: no leftover rides from a previous run of this script.
delete from rides
  where driver_id in (
    select id from drivers where auth_user_id in ('$DRIVER_A_AUTH_ID', '$DRIVER_B_AUTH_ID')
  ) or rider_id = '$RIDER_ID';

insert into rides (rider_id, driver_id, status, fare_cents)
values ('$RIDER_ID', null, 'requested', $FARE_CENTS);
SQL

RIDE_ID=$(psql -d "$CONN" -tA -c "
  select id from rides where rider_id = '$RIDER_ID' and status = 'requested';
")
DRIVER_A_ID=$(psql -d "$CONN" -tA -c "
  select id from drivers where auth_user_id = '$DRIVER_A_AUTH_ID';
")
DRIVER_B_ID=$(psql -d "$CONN" -tA -c "
  select id from drivers where auth_user_id = '$DRIVER_B_AUTH_ID';
")

ACCEPT="update rides set driver_id = '%s', status = 'accepted', accepted_at = now() \
  where id = '$RIDE_ID' and status = 'requested' and driver_id is null returning id"

A_OUT=$(mktemp)
trap 'rm -f "$A_OUT"' EXIT

# Session A: accept, hold the transaction open, then commit. Backgrounded.
psql -d "$CONN" -v ON_ERROR_STOP=1 -tA -q >"$A_OUT" <<SQL &
begin;
$(printf "$ACCEPT" "$DRIVER_A_ID");
select pg_sleep($SLEEP_SECONDS);
commit;
SQL
A_PID=$!

# Let A acquire the row lock before B starts racing it.
sleep 0.5

B_START=$(date +%s.%N)
B_ROWS=$(psql -d "$CONN" -v ON_ERROR_STOP=1 -tAq -c "$(printf "$ACCEPT" "$DRIVER_B_ID");")
B_END=$(date +%s.%N)

wait "$A_PID"
A_ROWS=$(grep -Ev '^\s*$' "$A_OUT" | head -1)

B_ELAPSED=$(echo "$B_END - $B_START" | bc)
# B started 0.5s after A, so a genuinely blocked B takes roughly SLEEP_SECONDS - 0.5. Require
# half of that: generous enough for scheduling jitter, nowhere near what an unblocked call
# (near-instant) would produce. Same threshold reasoning as the other two concurrency scripts.
THRESHOLD=$(echo "($SLEEP_SECONDS - 0.5) / 2" | bc -l)

FINAL_DRIVER_ID=$(psql -d "$CONN" -tA -c "select driver_id from rides where id = '$RIDE_ID';")
FINAL_STATUS=$(psql -d "$CONN" -tA -c "select status from rides where id = '$RIDE_ID';")

echo "session A returned: '${A_ROWS:-<none>}'"
echo "session B returned: '${B_ROWS:-<none>}' (elapsed ${B_ELAPSED}s, threshold >${THRESHOLD}s)"
echo "final ride state: driver_id=$FINAL_DRIVER_ID status=$FINAL_STATUS"

FAILED=0
[ "$A_ROWS" = "$RIDE_ID" ] || { echo "FAIL: session A should have won and returned the ride id, got '${A_ROWS:-<none>}'."; FAILED=1; }
[ -z "$B_ROWS" ]           || { echo "FAIL: session B ALSO updated the ride (got '${B_ROWS}') — two drivers won the same ride."; FAILED=1; }
[ "$FINAL_DRIVER_ID" = "$DRIVER_A_ID" ] || { echo "FAIL: the ride's driver_id is not session A's driver."; FAILED=1; }
[ "$FINAL_STATUS" = "accepted" ]        || { echo "FAIL: expected status 'accepted', found '$FINAL_STATUS'."; FAILED=1; }

if (( $(echo "$B_ELAPSED > $THRESHOLD" | bc -l) )); then
  echo "session B blocked on session A's row lock, as required."
else
  echo "FAIL: session B returned too quickly — it never blocked, so its refusal was luck rather than the WHERE clause."
  FAILED=1
fi

if [ "$FAILED" -eq 0 ]; then
  echo "PASS: two drivers racing the same ride yield exactly one winner; the loser's UPDATE matches zero rows."
  exit 0
fi
exit 1
