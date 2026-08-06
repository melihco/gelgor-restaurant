#!/usr/bin/env bash
# Trigger manual deploy for smartagency services on Render.
# Order: web → api → crew → worker (API after web so FRONTEND_BASE_URL consumers stay aligned).
#
# Usage:
#   export RENDER_API_KEY=rnd_...
#   ./scripts/render-trigger-deploy.sh
set -euo pipefail

if [[ -z "${RENDER_API_KEY:-}" ]]; then
    echo "ERROR: export RENDER_API_KEY=rnd_... (Render Dashboard → Account → API Keys)"
    exit 1
fi

SERVICES=(
  "web:srv-d8gktfn7f7vs73esgsvg"
  "api:srv-d8gktf77f7vs73esgs80"
  "crew:srv-d8gkten7f7vs73esgrkg"
  "worker:srv-d9b9mjflk1mc73fe5t10"
)

for entry in "${SERVICES[@]}"; do
  name="${entry%%:*}"
  sid="${entry##*:}"
  echo "==> Deploying smartagency-${name} (${sid})"
  http_code=$(curl -sS -o /tmp/render-deploy-"${name}".json -w '%{http_code}' \
    -X POST "https://api.render.com/v1/services/${sid}/deploys" \
    -H "Authorization: Bearer ${RENDER_API_KEY}" \
    -H "Accept: application/json" \
    -H "Content-Type: application/json" \
    -d '{"clearCache":"do_not_clear"}' || true)
  if [[ "${http_code}" != "200" && "${http_code}" != "201" && "${http_code}" != "202" ]]; then
    echo "    WARN: HTTP ${http_code} (empty body is OK for some 202 responses)"
    cat /tmp/render-deploy-"${name}".json 2>/dev/null | head -c 200 || true
    echo
    continue
  fi
  dep_id=$(python3 -c "
import json,sys
raw=open(sys.argv[1]).read().strip()
if not raw:
  print('accepted')
  raise SystemExit(0)
d=json.loads(raw)
print((d.get('deploy') or d).get('id','?'))
" /tmp/render-deploy-"${name}".json)
  echo "    deploy_id=${dep_id}"
done

echo "Done. Health checks:"
echo "  curl -sS https://smartagency-web.onrender.com/api/health/live"
echo "  curl -sS https://smartagency-api.onrender.com/health/live"
echo "Slot catalog sync-seed (use prod INTERNAL_API_KEY from env, never commit it):"
echo "  curl -sS -o /dev/null -w '%{http_code}' -X POST https://smartagency-web.onrender.com/api/internal/slot-catalog/sync-seed \\"
echo "    -H \"X-Internal-Api-Key: \${INTERNAL_API_KEY}\" -H 'Content-Type: application/json' -d '{}'"
