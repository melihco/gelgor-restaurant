#!/usr/bin/env bash
# Trigger manual deploy for smartagency-web + smartagency-crew on Render.
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
  "crew:srv-d8gkten7f7vs73esgrkg"
)

for entry in "${SERVICES[@]}"; do
  name="${entry%%:*}"
  sid="${entry##*:}"
  echo "==> Deploying smartagency-${name} (${sid})"
  resp=$(curl -sS -X POST "https://api.render.com/v1/services/${sid}/deploys" \
    -H "Authorization: Bearer ${RENDER_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"clearCache":"clear"}')
  dep_id=$(python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('deploy') or d).get('id','?'))" <<<"$resp")
  echo "    deploy_id=${dep_id}"
done

echo "Done. Poll sync-seed:"
echo "  curl -s -o /dev/null -w '%{http_code}' -X POST https://smartagency-web.onrender.com/api/internal/slot-catalog/sync-seed -H 'X-Internal-Api-Key: smartagency-internal-dev-key' -H 'Content-Type: application/json' -d '{}'"
