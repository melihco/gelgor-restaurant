#!/usr/bin/env bash
# Yerel .env → Render (web + crew + shared group)
# API key'ler local ile aynı olmalı; Render wiring URL'leri (DATABASE_URL, hostport) dokunulmaz.
#
# Kullanım:
#   export RENDER_API_KEY=rnd_...
#   ./scripts/render-push-publish-env.sh
#   ./scripts/render-push-publish-env.sh --dry-run
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB_ENV="${ROOT}/apps/web/.env.local"
BACKEND_ENV="${ROOT}/backend/.env"
OUT_WEB="${ROOT}/render.env.publish.web.local"
OUT_CREW="${ROOT}/render.env.publish.crew.local"
OUT_SHARED="${ROOT}/render.env.publish.shared.local"
OUT_API="${ROOT}/render.env.publish.api.local"
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

load_env_file "$BACKEND_ENV"
load_env_file "$WEB_ENV"

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

# Paylaşılan grup — web + api + crew (INTERNAL_API_KEY eşleşmesi kritik)
SHARED_KEYS=(
  INTERNAL_API_KEY
  OPENAI_API_KEY
  APIFY_API_KEY
  META_APP_ID
  META_APP_SECRET
)

WEB_KEYS=(
  INTERNAL_API_KEY
  META_APP_ID META_APP_SECRET
  MERTCAFE_BASE_URL MERTCAFE_WORKSPACE_API_KEYS MERTCAFE_WORKSPACE_INSTAGRAM_ACCOUNTS MERTCAFE_API_KEY
  CLOUDFLARE_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY
  R2_BUCKET_NAME R2_PUBLIC_URL R2_ENDPOINT
  OPENAI_API_KEY FAL_API_KEY RUNWAY_API_SECRET APIFY_API_KEY
  SMART_AGENCY_IMAGE_PROVIDER SMART_AGENCY_IMAGE_MODEL SMART_AGENCY_IMAGE_QUALITY
  RUNWAY_MODEL RUNWAY_API_VERSION RUNWAY_DEFAULT_DURATION RUNWAY_DEFAULT_RATIO RUNWAY_TIMEOUT_MS
  AUTO_PRODUCE_GALLERY_ONLY AUTO_PRODUCE_BYPASS_LIMITS AUTO_PRODUCE_RUNWAY AUTO_PRODUCE_SUBTLE_ENHANCE
  AUTO_PRODUCE_DAILY_BUDGET_USD AUTO_PRODUCE_MAX_DAILY AUTO_PRODUCE_MAX_REELS_DAILY
  MISSION_AUTO_PRODUCE_MAX_PER_RUN VENUE_PHOTO_PRESERVE
  ANTHROPIC_API_KEY
)

CREW_KEYS=(
  INTERNAL_API_KEY
  META_APP_ID META_APP_SECRET META_USD_TRY_RATE
  OPENAI_API_KEY OPENAI_MODEL OPENAI_CONTENT_MODEL OPENAI_LITE_MODEL
  APIFY_API_KEY APIFY_TIMEOUT_SECONDS ANTHROPIC_API_KEY ANTHROPIC_MODEL
  CREWAI_LLM_PROVIDER TENANT_LEARNING_ENABLED TENANT_LEARNING_MAX_EXAMPLES
  WORKSPACE_DAILY_BUDGET_USD AUTO_CONTENT_MAX_DAILY AUTO_PRODUCE_BYPASS_LIMITS
  BRAVE_SEARCH_API_KEY
)

API_KEYS=(
  Auth__JwtSecret
  Auth__EnsureSeedAdminLogin
)

# Default JWT secret matches local dev fallback when Auth:JwtSecret is unset in .env
if [[ -z "${Auth__JwtSecret:-}" ]]; then
  Auth__JwtSecret="${AUTH_JWT_SECRET:-smartagency-local-dev-jwt-secret-change-before-production}"
fi
if [[ -z "${Auth__EnsureSeedAdminLogin:-}" ]]; then
  Auth__EnsureSeedAdminLogin="true"
fi

write_kv_file "$OUT_SHARED" "${SHARED_KEYS[@]}"
write_kv_file "$OUT_WEB" "${WEB_KEYS[@]}"
write_kv_file "$OUT_CREW" "${CREW_KEYS[@]}"
write_kv_file "$OUT_API" "${API_KEYS[@]}"

echo "==> Publish env dosyaları (gitignore — commit ETME)"
echo "    shared: $(wc -l <"$OUT_SHARED" | tr -d ' ') keys → $OUT_SHARED"
echo "    web:    $(wc -l <"$OUT_WEB" | tr -d ' ') keys → $OUT_WEB"
echo "    crew:   $(wc -l <"$OUT_CREW" | tr -d ' ') keys → $OUT_CREW"
echo "    api:    $(wc -l <"$OUT_API" | tr -d ' ') keys → $OUT_API"
echo ""
echo "Dokunulmayan Render wiring: DATABASE_URL, NEXT_PUBLIC_* URL, BACKEND_ORIGIN, CREW_BACKEND_URL, OrchestrationService__BaseUrl"
echo ""

if [[ -z "${RENDER_API_KEY:-}" ]]; then
  echo "RENDER_API_KEY yok — API push atlandı."
  echo "export RENDER_API_KEY=rnd_... && $0"
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

find_env_group_id() {
  curl -sS "https://api.render.com/v1/env-groups?limit=20" \
    -H "Authorization: Bearer ${RENDER_API_KEY}" \
    | python3 -c "
import json,sys
name=sys.argv[1]
for item in json.load(sys.stdin):
    g=item.get('envGroup') or item
    if (g.get('name') or '').strip()==name:
        print(g.get('id',''))
        break
" "$1"
}

put_env_from_file() {
  local target_kind="$1"
  local target_id="$2"
  local file="$3"
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || continue
    local key="${line%%=*}"
    local val="${line#*=}"
    local url
    if [[ "$target_kind" == "group" ]]; then
      url="https://api.render.com/v1/env-groups/${target_id}/env-vars/${key}"
    else
      url="https://api.render.com/v1/services/${target_id}/env-vars/${key}"
    fi
    local code
    code="$(curl -sS -o /dev/null -w "%{http_code}" \
      -X PUT "$url" \
      -H "Authorization: Bearer ${RENDER_API_KEY}" \
      -H "Content-Type: application/json" \
      -d "$(python3 -c 'import json,sys; print(json.dumps({"value": sys.argv[1]}))' "$val")")"
    echo "    ${key} → HTTP ${code}"
  done <"$file"
}

SHARED_ID="$(find_env_group_id smartagency-shared)"
WEB_ID="$(find_service_id smartagency-web)"
CREW_ID="$(find_service_id smartagency-crew)"
API_ID="$(find_service_id smartagency-api)"

if [[ -z "$SHARED_ID" || -z "$WEB_ID" || -z "$CREW_ID" || -z "$API_ID" ]]; then
  echo "Servis/grup bulunamadı. SHARED=${SHARED_ID:-} WEB=${WEB_ID:-} CREW=${CREW_ID:-} API=${API_ID:-}"
  exit 1
fi

echo "==> smartagency-shared (${SHARED_ID})"
put_env_from_file group "$SHARED_ID" "$OUT_SHARED"
echo "==> smartagency-web (${WEB_ID})"
put_env_from_file service "$WEB_ID" "$OUT_WEB"
echo "==> smartagency-crew (${CREW_ID})"
put_env_from_file service "$CREW_ID" "$OUT_CREW"
echo "==> smartagency-api (${API_ID})"
put_env_from_file service "$API_ID" "$OUT_API"
echo "==> Tamam. API redeploy sonrası login çalışmalı (Auth__JwtSecret)."
