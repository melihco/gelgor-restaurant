#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WEB_URL="${WEB_URL:-http://127.0.0.1:3000}"
CREW_BACKEND_URL="${CREW_BACKEND_URL:-http://127.0.0.1:8000}"
NEXUS_API_URL="${NEXUS_API_URL:-${NEXT_PUBLIC_API_URL:-http://127.0.0.1:5050}}"
SMOKE_WORKSPACE_ID="${SMOKE_WORKSPACE_ID:-fa91b75d-0392-48e9-8cd8-2406a9d2042f}"
INTERNAL_API_KEY="${INTERNAL_API_KEY:-smartagency-internal-dev-key}"

RUN_PRODUCTION_SMOKE="${RUN_PRODUCTION_SMOKE:-1}"
RUN_SCHEDULED_TEMPLATE_SMOKE="${RUN_SCHEDULED_TEMPLATE_SMOKE:-1}"
RUN_MISSION_FEED_SMOKE="${RUN_MISSION_FEED_SMOKE:-0}"
RUN_ONBOARDING_SMOKE="${RUN_ONBOARDING_SMOKE:-0}"

echo "== Smart Agency critical E2E smoke =="
echo "web: $WEB_URL"
echo "crew: $CREW_BACKEND_URL"
echo "api: $NEXUS_API_URL"
echo "workspace: $SMOKE_WORKSPACE_ID"

if [[ "$RUN_PRODUCTION_SMOKE" == "1" ]]; then
  echo
  echo "== Production read-only smoke =="
  python3 scripts/production-e2e-smoke.py \
    --api-url "$NEXUS_API_URL" \
    --web-url "$WEB_URL" \
    --tenant-id "$SMOKE_WORKSPACE_ID" \
    --check-web
fi

if [[ "$RUN_SCHEDULED_TEMPLATE_SMOKE" == "1" ]]; then
  echo
  echo "== Scheduled template smoke =="
  python3 scripts/smoke-scheduled-template.py \
    --web-url "$WEB_URL" \
    --crew-url "$CREW_BACKEND_URL" \
    --workspace-id "$SMOKE_WORKSPACE_ID" \
    --internal-key "$INTERNAL_API_KEY"
fi

if [[ "$RUN_MISSION_FEED_SMOKE" == "1" ]]; then
  echo
  echo "== Mission → Feed smoke (long-running/mutating) =="
  (cd apps/web && npx tsx ../../scripts/e2e-mission-feed-test.mjs "$SMOKE_WORKSPACE_ID")
fi

if [[ "$RUN_ONBOARDING_SMOKE" == "1" ]]; then
  echo
  echo "== Onboarding smoke (long-running/mutating) =="
  node scripts/e2e-datcam-onboarding-smoke.mjs
fi

echo
echo "OK: critical E2E smoke completed"
