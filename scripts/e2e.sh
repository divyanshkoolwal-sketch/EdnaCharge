#!/usr/bin/env bash
# Run the LIVE e2e + RLS suites against the local stack.
#
# Prereqs (see docs/RUNBOOK.md "E2E"):
#   1. Supabase + Redis running locally (docker).
#   2. `supabase db reset` applied so migrations (incl. RLS policies) are live.
#   3. The API running on E2E_API_URL (default http://localhost:3300).
#   4. `.env` populated with local DATABASE_URL / REDIS_URL / SUPABASE_* creds.
#
# These suites are gated: without E2E_LIVE=1 + Supabase creds they skip with a
# reason (they never mock Stripe/DB), so `pnpm test` stays green on a bare CI box.
set -euo pipefail

set -a
[ -f .env ] && . ./.env
set +a

export E2E_LIVE=1
export E2E_API_URL="${E2E_API_URL:-http://localhost:3300}"

echo "→ API e2e against ${E2E_API_URL}"
pnpm -F @edna/api exec vitest run

echo "→ DB RLS e2e"
pnpm -F @edna/db exec vitest run
