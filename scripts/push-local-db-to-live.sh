#!/usr/bin/env bash
# One-shot: replace Render/live Postgres with the current LOCAL nexus_db snapshot.
#
# WARNING: Destroys all data on the target database (tenants, missions, artifacts metadata, etc.).
# Media files are NOT copied — artifact rows assume the same R2 keys already exist in cloud storage.
#
# Usage (recommended — Render external URL via API):
#   export RENDER_API_KEY=rnd_...
#   export RENDER_POSTGRES_ID=dpg-xxxxxxxx   # optional; default from render-bootstrap-python-db.sh
#   CONFIRM_OVERWRITE_LIVE=YES ./scripts/push-local-db-to-live.sh --from-render-api
#
# Or pass the live connection string directly (Dashboard → nexus-db → External URL):
#   export LIVE_DATABASE_URL='postgresql://nexus:...@dpg-....oregon-postgres.render.com/nexus_db'
#   CONFIRM_OVERWRITE_LIVE=YES ./scripts/push-local-db-to-live.sh
#
# Local source (override if needed):
#   LOCAL_DATABASE_URL=postgresql://nexus:nexus_dev_2024@localhost:5432/nexus_db
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "${CONFIRM_OVERWRITE_LIVE:-}" != "YES" ]]; then
  echo "ERROR: Set CONFIRM_OVERWRITE_LIVE=YES to acknowledge live DB will be fully overwritten."
  exit 1
fi

PG_BIN="${PG_BIN:-}"
if [[ -z "$PG_BIN" ]]; then
  for candidate in \
    /opt/homebrew/opt/postgresql@16/bin \
    /opt/homebrew/opt/postgresql@17/bin \
    /usr/local/opt/postgresql@16/bin; do
    if [[ -x "${candidate}/pg_dump" ]]; then
      PG_BIN="$candidate"
      break
    fi
  done
fi
if [[ -z "$PG_BIN" || ! -x "${PG_BIN}/pg_dump" ]]; then
  echo "ERROR: pg_dump not found. Install: brew install postgresql@16"
  exit 1
fi

LOCAL_URL="${LOCAL_DATABASE_URL:-postgresql://nexus:nexus_dev_2024@localhost:5432/nexus_db}"
PY="${ROOT}/backend/.venv/bin/python"
[[ -x "$PY" ]] || PY="$(command -v python3)"

if [[ "${1:-}" == "--from-render-api" ]]; then
  if [[ -z "${RENDER_API_KEY:-}" ]]; then
    echo "ERROR: RENDER_API_KEY required for --from-render-api"
    exit 1
  fi
  PG_ID="${RENDER_POSTGRES_ID:-dpg-d8gkt4f7f7vs73esgf00-a}"
  export PG_ID RENDER_API_KEY
  LIVE_URL="$("$PY" - <<'PY'
import json, os, urllib.request
pg_id = os.environ["PG_ID"]
req = urllib.request.Request(
    f"https://api.render.com/v1/postgres/{pg_id}/connection-info",
    headers={"Authorization": f"Bearer {os.environ['RENDER_API_KEY']}"},
)
with urllib.request.urlopen(req, timeout=60) as resp:
    data = json.load(resp)
print(data["externalConnectionString"])
PY
)"
  shift
else
  LIVE_URL="${LIVE_DATABASE_URL:-${DATABASE_URL_SYNC:-}}"
  LIVE_URL="${LIVE_URL/postgresql+asyncpg:\/\//postgresql://}"
  LIVE_URL="${LIVE_URL/postgresql+psycopg2:\/\//postgresql://}"
fi

if [[ -z "${LIVE_URL:-}" ]]; then
  echo "ERROR: Set LIVE_DATABASE_URL or use --from-render-api with RENDER_API_KEY."
  exit 1
fi

if [[ "$LIVE_URL" == *localhost* || "$LIVE_URL" == *127.0.0.1* ]]; then
  echo "ERROR: LIVE_DATABASE_URL points to localhost — refusing to overwrite local as 'live'."
  exit 1
fi

STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="${ROOT}/backups"
mkdir -p "$BACKUP_DIR"
LOCAL_DUMP="${BACKUP_DIR}/nexus_local_${STAMP}.dump"
LIVE_BACKUP="${BACKUP_DIR}/nexus_live_before_push_${STAMP}.dump"

SSL_MODE="prefer"
if [[ "$LIVE_URL" == *render.com* ]]; then
  SSL_MODE="require"
fi

echo "== Smart Agency: push LOCAL → LIVE Postgres =="
echo "Local:  ${LOCAL_URL/@*/@***}"
echo "Live:   ${LIVE_URL/@*/@***}"
echo "Dump:   $LOCAL_DUMP"
echo
echo "Pausing 5s — Ctrl+C to abort..."
sleep 5

echo "==> Backing up LIVE (safety snapshot before overwrite)..."
PGSSLMODE="$SSL_MODE" "${PG_BIN}/pg_dump" "$LIVE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$LIVE_BACKUP"
echo "    live backup: $LIVE_BACKUP"

echo "==> Dumping LOCAL..."
"${PG_BIN}/pg_dump" "$LOCAL_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$LOCAL_DUMP"
echo "    local dump: $LOCAL_DUMP ($(du -h "$LOCAL_DUMP" | awk '{print $1}'))"

echo "==> Restoring LOCAL dump onto LIVE (clean + if-exists)..."
PGSSLMODE="$SSL_MODE" "${PG_BIN}/pg_restore" \
  --dbname="$LIVE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --single-transaction \
  "$LOCAL_DUMP"

echo "==> Verifying LIVE row counts..."
PGSSLMODE="$SSL_MODE" "${PG_BIN}/psql" "$LIVE_URL" -v ON_ERROR_STOP=1 -c "
SELECT 'OutputArtifacts' AS rel, count(*)::bigint AS n FROM \"OutputArtifacts\"
UNION ALL SELECT 'production_jobs', count(*)::bigint FROM production_jobs
UNION ALL SELECT 'missions', count(*)::bigint FROM missions
UNION ALL SELECT 'brand_contexts', count(*)::bigint FROM brand_contexts
UNION ALL SELECT 'Tenants', count(*)::bigint FROM \"Tenants\";
"

echo
echo "OK: LIVE database now mirrors LOCAL snapshot."
echo "Next: redeploy or restart smartagency-api + smartagency-crew on Render if connections were stale."
echo "Keep backups: $LIVE_BACKUP , $LOCAL_DUMP"
