#!/usr/bin/env bash
# Runs the Edge Function tests against the local Supabase stack (supabase start).
set -euo pipefail
cd "$(dirname "$0")"
eval "$(supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY|MAILPIT_URL)=')"
export SUPABASE_URL="$API_URL" SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" MAILPIT_URL="${MAILPIT_URL:-http://127.0.0.1:54324}"
exec deno task test "$@"
