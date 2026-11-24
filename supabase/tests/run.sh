#!/usr/bin/env bash
# Runs the SQL test suite.
#   Plain Postgres (CI, no Docker):  DATABASE_URL=postgres://... STUBS=1 ./supabase/tests/run.sh
#   Local Supabase (supabase start): ./supabase/tests/run.sh   (defaults to the local Supabase DB)
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
PSQL=(psql "$DB" -v ON_ERROR_STOP=1 -q -X)

if [[ "${STUBS:-0}" == "1" ]]; then
  "${PSQL[@]}" -f tests/_stubs.sql
  for m in migrations/*.sql; do "${PSQL[@]}" -f "$m"; done
  "${PSQL[@]}" -f seed.sql
fi

"${PSQL[@]}" -f tests/_helpers.sql
status=0
for t in tests/*.test.sql; do
  echo "▶ $t"
  if out=$("${PSQL[@]}" -f "$t" 2>&1); then
    echo "$out" | grep -oE "ok - .*" | sed 's/ (raised:.*//' | sed 's/^/  /'
  else
    echo "$out" | grep -oE "ok - .*|FAIL: .*|ERROR: .*" | sed 's/^/  /'
    echo "✗ $t failed"; status=1
  fi
done
[[ $status -eq 0 ]] && echo "✅ all SQL tests passed"
exit $status
