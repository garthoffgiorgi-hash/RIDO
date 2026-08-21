#!/usr/bin/env bash
# The one thing pgTAP structurally can't prove: that reserve_driver_month() actually blocks a
# concurrent completion rather than letting it read a stale month-to-date figure. pg_prove runs
# one connection at a time, so required assertion #4's arithmetic is in 004_bump_monthly_stats.sql
# — this script is the locking proof, run separately against a real (local or CI) Postgres.
#
# Method: session A reserves the month, then sleeps for $SLEEP_SECONDS before committing. Session
# B starts shortly after A has the lock and calls reserve_driver_month for the SAME driver+month.
# If the lock works, B's call blocks until A commits — B's wall-clock time will be close to
# $SLEEP_SECONDS. If the lock is broken, B returns almost instantly instead.
#
# Usage: PGDATABASE=<db> ./concurrent-completion.sh
# (or pass connection info any other way `psql` accepts — PGHOST, PGUSER, a connection string
# as $1, etc. Defaults assume a local `supabase start` instance.)

set -euo pipefail

CONN="${1:-${PGDATABASE:-postgres}}"
SLEEP_SECONDS=2
DRIVER_AUTH_ID="f0000000-0000-0000-0000-000000000001"
TS="2026-06-15T12:00:00Z"

psql -d "$CONN" -v ON_ERROR_STOP=1 -q <<SQL
insert into auth.users (id) values ('$DRIVER_AUTH_ID') on conflict do nothing;
insert into drivers (auth_user_id, full_name, status, background_check_status, vehicle_inspection_status)
values ('$DRIVER_AUTH_ID', 'Concurrency Test Driver', 'active', 'passed', 'passed')
on conflict (auth_user_id) do nothing;
delete from driver_monthly_stats
  where driver_id = (select id from drivers where auth_user_id = '$DRIVER_AUTH_ID');
SQL

DRIVER_ID=$(psql -d "$CONN" -tA -c "select id from drivers where auth_user_id = '$DRIVER_AUTH_ID';")

# Session A: reserve, sleep, commit. Backgrounded.
psql -d "$CONN" -v ON_ERROR_STOP=1 -q <<SQL &
begin;
select reserve_driver_month('$DRIVER_ID', '$TS'::timestamptz);
select pg_sleep($SLEEP_SECONDS);
commit;
SQL
A_PID=$!

# Give A time to acquire the lock before B starts.
sleep 0.5

B_START=$(date +%s.%N)
psql -d "$CONN" -v ON_ERROR_STOP=1 -q -c "
begin;
select reserve_driver_month('$DRIVER_ID', '$TS'::timestamptz);
commit;
"
B_END=$(date +%s.%N)

wait "$A_PID"

B_ELAPSED=$(echo "$B_END - $B_START" | bc)
# B started 0.5s after A, so if B genuinely blocked on A's lock, it should take roughly
# SLEEP_SECONDS - 0.5. Require at least half of that as a conservative pass threshold —
# generous enough to absorb scheduling jitter, but nowhere near what an unblocked call
# (near-instant) would produce.
THRESHOLD=$(echo "($SLEEP_SECONDS - 0.5) / 2" | bc -l)

echo "session B elapsed: ${B_ELAPSED}s (threshold: >${THRESHOLD}s)"

if (( $(echo "$B_ELAPSED > $THRESHOLD" | bc -l) )); then
  echo "PASS: session B blocked on session A's lock, as required."
  exit 0
else
  echo "FAIL: session B returned too quickly — reserve_driver_month is not providing the lock ride-completion.md requires."
  exit 1
fi
