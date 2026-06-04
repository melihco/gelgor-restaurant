#!/usr/bin/env bash
# Yerel .env → Render servisleri (publish: Meta, Mertcafe, R2, Runway)
# Kullanım:
#   export RENDER_API_KEY=rnd_...
#   ./scripts/render-push-publish-env.sh
#   ./scripts/render-push-publish-env.sh --dry-run   # sadece dosya üret
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB_ENV="${ROOT}/apps/web/.env.local"
BACKEND_ENV="${ROOT}/backend/.env"
OUT_WEB="${ROOT}/render.env.publish.web.local"
OUT_CREW="${ROOT}/render.env.publish.crew.local"
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

# shellcheck disable=SC1091
load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  set -a
  # shellcheck source=/dev/null
  source "$file"
  set +a
}

load_env_file "$WEB_ENV"
load_env_file "$BACKEND_ENV"

# Runway: tek isim
if [[ -z "${RUNWAY_API_SECRET:-}" && -n "${RUNWAYML_API_SECRET:-}" ]]; then
  RUNWAY_API_SECRET="$RUNWAYML_API_SECRET"
fi

write_kv_file() {
  local out="$1"
  shift
  : >"$out"
  for key in "$@"; do
    local val="${!key-}"
    if [[ -n "$val" ]]; then
      printf '%s=%s\n' "$key" "$val" >>"$out"
    fi
  done
}

WEB_KEYS=(
  META_APP_ID META_APP_SECRET
  MERTCAFE_BASE_URL MERTCAFE_WORKSPACE_API_KEYS MERTCAFE_API_KEY
  CLOUDFLARE_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY
  R2_BUCKET_NAME R2_PUBLIC_URL R2_ENDPOINT
  OPENAI_API_KEY FAL_API_KEY RUNWAY_API_SECRET
  SMART_AGENCY_IMAGE_PROVIDER SMART_AGENCY_IMAGE_MODEL SMART_AGENCY_IMAGE_QUALITY
  RUNWAY_MODEL RUNWAY_API_VERSION RUNWAY_DEFAULT_DURATION RUNWAY_DEFAULT_RATIO RUNWAY_TIMEOUT_MS
  APIFY_API_KEY
)

CREW_KEYS=(
  META_APP_ID META_APP_SECRET META_USD_TRY_RATE
  OPENAI_API_KEY APIFY_API_KEY ANTHROPIC_API_KEY
)

write_kv_file "$OUT_WEB" "${WEB_KEYS[@]}"
write_kv_file "$OUT_CREW" "${CREW_KEYS[@]}"

echo "==> Publish env dosyaları yazıldı (gitignore — commit ETME)"
echo "    $OUT_WEB"
echo "    $OUT_CREW"
echo ""
echo "Dashboard (Blueprint sonrası):"
echo "  smartagency-web  → Environment → Add from .env → render.env.publish.web.local"
echo "  smartagency-crew → Environment → Add from .env → render.env.publish.crew.local"
echo "  smartagency-shared grubunda META_* yoksa crew/web dosyaları yeterli"
echo ""

if [[ -z "${RENDER_API_KEY:-}" ]]; then
  echo "RENDER_API_KEY yok — API push atlandı."
  echo "API ile otomatik: export RENDER_API_KEY=rnd_... && $0"
  exit 0
fi

if $DRY_RUN; then
  exit 0
fi

find_service_id() {
  local name="$1"
  curl -sS "https://api.render.com/v1/services?limit=100" \
    -H "Authorization: Bearer ${RENDER_API_KEY}" \
    -H "Accept: application/json" \
    | python3 -c "
import json,sys
name=sys.argv[1]
data=json.load(sys.stdin)
for item in data:
    s=item.get('service') or item
    if (s.get('name') or '').strip()==name:
        print(s.get('id',''))
        break
" "$name"
}

put_env_from_file() {
  local service_id="$1"
  local file="$2"
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || continue
    local key="${line%%=*}"
    local val="${line#*=}"
    local code
    code="$(curl -sS -o /dev/null -w "%{http_code}" \
      -X PUT "https://api.render.com/v1/services/${service_id}/env-vars/${key}" \
      -H "Authorization: Bearer ${RENDER_API_KEY}" \
      -H "Content-Type: application/json" \
      -d "$(python3 -c 'import json,sys; print(json.dumps({"value": sys.argv[1]}))' "$val")")"
    echo "    ${key} → HTTP ${code}"
  done <"$file"
}

WEB_ID="$(find_service_id smartagency-web)"
CREW_ID="$(find_service_id smartagency-crew)"

if [[ -z "$WEB_ID" || -z "$CREW_ID" ]]; then
  echo "Servis bulunamadı. Dashboard'daki isimler: smartagency-web, smartagency-crew"
  echo "WEB_ID=${WEB_ID:-} CREW_ID=${CREW_ID:-}"
  exit 1
fi

echo "==> smartagency-web (${WEB_ID})"
put_env_from_file "$WEB_ID" "$OUT_WEB"
echo "==> smartagency-crew (${CREW_ID})"
put_env_from_file "$CREW_ID" "$OUT_CREW"
echo "==> Tamam. Her serviste Manual Deploy tetikle."
