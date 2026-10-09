#!/usr/bin/env bash
# Runs every migration (twice, to prove they are safe to re-run) on a throwaway local PostgreSQL database
# with small stand-ins for the parts Supabase provides, then the row-level security and function tests.
# Needs a local PostgreSQL where you can create databases (psql, createdb). Never point it at a real project.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="support_test_$$"
PSQL="psql -X -q -v ON_ERROR_STOP=1"
createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT
$PSQL -d "$DB" -f supabase/tests/stubs.sql >/dev/null
for pass in 1 2; do
  for f in supabase/migrations/*.sql; do $PSQL -d "$DB" -f "$f" >/dev/null; done
  echo "migrations applied (pass $pass)"
done
$PSQL -d "$DB" -f supabase/tests/helpers.sql >/dev/null
$PSQL -d "$DB" -f supabase/tests/rls.test.sql 2>&1 | sed 's/^psql:[^ ]* //'

# Two people raising at the same moment must never share a number.
$PSQL -d "$DB" -c "select t.as_root(); select support_register_user('x');" >/dev/null 2>&1 || true
$PSQL -d "$DB" -At -c "insert into support_users (auth_user_id, email, name) select ('b0000000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid, 'load' || g || '@dropxlogistics.com', 'Load ' || g from generate_series(1, 20) g;" >/dev/null
for g in $(seq 1 20); do
  ( $PSQL -d "$DB" -At -c "begin; select t.as_user(('b0000000-0000-4000-8000-0000000000' || lpad('$g', 2, '0'))::uuid, 'load$g@dropxlogistics.com'); select number from support_create_ticket('support','people','load $g','x',null,'P3',null,'n',null); commit;" >/dev/null ) &
done
wait
DISTINCT=$($PSQL -d "$DB" -At -c "select count(distinct number) from support_tickets where title like 'load %'")
TOTAL=$($PSQL -d "$DB" -At -c "select count(*) from support_tickets where title like 'load %'")
echo "20 parallel raises: $TOTAL tickets, $DISTINCT distinct numbers"
[ "$TOTAL" = "20" ] && [ "$DISTINCT" = "20" ] || { echo "ASSERTION FAILED: parallel raises shared a number"; exit 1; }
echo "database tests passed"
