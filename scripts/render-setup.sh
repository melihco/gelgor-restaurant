#!/usr/bin/env bash
# Render Blueprint doğrulama + kurulum yönlendirmesi
# Tam otomatik deploy için: export RENDER_API_KEY=rnd_... (Dashboard → Account → API Keys)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RENDER_YAML="${ROOT}/render.yaml"
REPO_URL="${RENDER_REPO_URL:-https://github.com/melihco/smart-agency}"

echo "==> Smart Agency — Render kurulum"
echo "    Repo: ${REPO_URL}"
echo "    Blueprint: render.yaml"
echo ""

if [[ -n "${RENDER_API_KEY:-}" ]]; then
  echo "==> Blueprint YAML doğrulanıyor (Render API)..."
  if [[ -z "${RENDER_OWNER_ID:-}" ]]; then
    echo "    UYARI: RENDER_OWNER_ID yok. Workspace ID için:"
    echo "    Dashboard → Workspace Settings → ID"
    echo "    Sonra: export RENDER_OWNER_ID=tea-..."
    echo ""
  else
    HTTP_CODE="$(curl -sS -o /tmp/render-validate.json -w "%{http_code}" \
      -X POST "https://api.render.com/v1/blueprints/validate" \
      -H "Authorization: Bearer ${RENDER_API_KEY}" \
      -F "ownerId=${RENDER_OWNER_ID}" \
      -F "file=@${RENDER_YAML}")"
    echo "    HTTP ${HTTP_CODE}"
    if command -v jq >/dev/null 2>&1; then
      jq . /tmp/render-validate.json 2>/dev/null || cat /tmp/render-validate.json
    else
      cat /tmp/render-validate.json
    fi
    echo ""
  fi

  echo "==> Mevcut servisler (ilk 10)..."
  curl -sS "https://api.render.com/v1/services?limit=10" \
    -H "Authorization: Bearer ${RENDER_API_KEY}" \
    -H "Accept: application/json" | head -c 2000
  echo ""
  echo ""
fi

cat <<EOF
Render hesabına bu ortamdan giriş yapılamıyor (OAuth / API key gerekir).

Senin için yapılacaklar (≈5 dk):

1. https://dashboard.render.com → New → Blueprint
2. GitHub repo: melihco/smart-agency
3. Blueprint path: render.yaml → Apply
4. İlk kurulumda sorulan secret'lar:
   - OPENAI_API_KEY (zorunlu)
   - FAL_API_KEY, RUNWAY_API_SECRET (web / üretim)
   - APIFY_API_KEY (opsiyonel)
   Şablon: render.env.example

5. Deploy bitince:
   curl "\$(render dashboard'dan smartagency-api → RENDER_EXTERNAL_URL)/health/ready"

İsteğe bağlı — API ile doğrulama:
  export RENDER_API_KEY=rnd_...
  export RENDER_OWNER_ID=tea_...
  ./scripts/render-setup.sh

EOF
