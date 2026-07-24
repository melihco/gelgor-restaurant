#!/usr/bin/env bash
# Ops preflight smoke — worker / schema / demo / provider (no tenant UUID).
#
# Usage:
#   ./scripts/smoke-production-ops-preflight.sh
#   WEB_URL=http://localhost:3000 CREW_URL=http://localhost:8000 ./scripts/smoke-production-ops-preflight.sh
#
# Exit 0 when all required checks pass. Suitable for local + CI after stack up.

set -euo pipefail

WEB_URL="${WEB_URL:-http://127.0.0.1:3000}"
CREW_URL="${CREW_URL:-http://127.0.0.1:8000}"
INTERNAL_KEY="${INTERNAL_API_KEY:-${INTERNAL_KEY:-smartagency-internal-dev-key}}"
REQUIRE_WORKER="${REQUIRE_WORKER:-1}"

fail=0
note() { printf '• %s\n' "$*"; }
ok() { printf '✓ %s\n' "$*"; }
bad() { printf '✗ %s\n' "$*"; fail=1; }

note "WEB_URL=$WEB_URL CREW_URL=$CREW_URL"

# 1) Crew health + schema gate
if crew_json="$(curl -fsS --max-time 8 "$CREW_URL/health" 2>/dev/null)"; then
  crew_status="$(printf '%s' "$crew_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null || true)"
  schema_ok="$(printf '%s' "$crew_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(str(d.get('schema',{}).get('ok', False)).lower())" 2>/dev/null || echo false)"
  if [[ "$schema_ok" == "true" ]]; then
    ok "crew schema gate ok (status=$crew_status)"
  else
    missing="$(printf '%s' "$crew_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(','.join(d.get('schema',{}).get('missing') or []))" 2>/dev/null || true)"
    bad "crew schema gate failed missing=${missing:-unknown}"
  fi
else
  bad "crew /health unreachable at $CREW_URL"
fi

# 2) Queue stats — workers + provider preflight
if stats_json="$(curl -fsS --max-time 8 \
  -H "X-Internal-Api-Key: $INTERNAL_KEY" \
  "$WEB_URL/api/queue/stats" 2>/dev/null)"; then
  worker_count="$(printf '%s' "$stats_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(int(d.get('workerCount') or 0))" 2>/dev/null || echo 0)"
  provider_ok="$(printf '%s' "$stats_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(str(d.get('providerPreflight',{}).get('ok', True)).lower())" 2>/dev/null || echo true)"
  offline="$(printf '%s' "$stats_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(str(d.get('alerts',{}).get('workerOffline', False)).lower())" 2>/dev/null || echo false)"

  if [[ "$REQUIRE_WORKER" == "1" ]]; then
    if [[ "$worker_count" -gt 0 && "$offline" != "true" ]]; then
      ok "bullmq workers online (workerCount=$worker_count)"
    else
      bad "bullmq workers offline (workerCount=$worker_count) — run npm run dev:with-worker"
    fi
  else
    ok "bullmq worker check skipped (REQUIRE_WORKER=0)"
  fi

  if [[ "$provider_ok" == "true" ]]; then
    ok "image provider preflight ok"
  else
    code="$(printf '%s' "$stats_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('providerPreflight',{}).get('code',''))" 2>/dev/null || true)"
    bad "image provider preflight failed code=${code:-unknown}"
  fi
else
  bad "web /api/queue/stats unreachable (is Next up? INTERNAL_API_KEY set?)"
fi

# 3) Demo context must not be on in production-like APP_ENV
app_env="${APP_ENV:-${NODE_ENV:-development}}"
demo_flag="${NEXT_PUBLIC_USE_DEMO_CONTEXT:-false}"
if [[ "$app_env" == "production" && "$demo_flag" == "true" ]]; then
  bad "NEXT_PUBLIC_USE_DEMO_CONTEXT=true under APP_ENV=production (MT-5)"
else
  ok "demo context env safe (APP_ENV=$app_env USE_DEMO=$demo_flag)"
fi

if [[ "$fail" -ne 0 ]]; then
  printf '\nops preflight FAILED\n'
  exit 1
fi
printf '\nops preflight OK\n'
exit 0
