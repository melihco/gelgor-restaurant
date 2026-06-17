#!/usr/bin/env bash
# Bootstrap Python (Crew) tables + SQL migrations on Render Postgres.
#
# Local (external URL + SSL):
#   export RENDER_API_KEY=rnd_...
#   ./scripts/render-bootstrap-python-db.sh --from-render-api
#
# Render Shell → smartagency-crew (internal DATABASE_URL, no SSL):
#   ./scripts/render-bootstrap-python-db.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}/backend"

PY="${ROOT}/backend/.venv/bin/python"
if [[ ! -x "$PY" ]]; then
  PY="$(command -v python3)"
fi

if [[ "${1:-}" == "--from-render-api" ]]; then
  if [[ -z "${RENDER_API_KEY:-}" ]]; then
    echo "ERROR: RENDER_API_KEY required for --from-render-api"
    exit 1
  fi
  PG_ID="${RENDER_POSTGRES_ID:-dpg-d8gkt4f7f7vs73esgf00-a}"
  EXT=$(curl -sS "https://api.render.com/v1/postgres/${PG_ID}/connection-info" \
    -H "Authorization: Bearer ${RENDER_API_KEY}" \
    | "$PY" -c "import sys,json; print(json.load(sys.stdin)['externalConnectionString'])")
  export DATABASE_URL="$("$PY" -c "u='${EXT}'.replace('postgresql://','postgresql+asyncpg://'); print(u+('&ssl=require' if '?' in u else '?ssl=require'))")"
  export DATABASE_URL_SYNC="$EXT"
  shift
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set."
  exit 1
fi

PSQL_URL="${DATABASE_URL_SYNC:-${DATABASE_URL/postgresql+asyncpg/postgresql}}"
PSQL_URL="${PSQL_URL/postgresql+psycopg2/postgresql}"

echo "==> Creating SQLAlchemy base tables (create_all)..."
"$PY" - <<'PY'
import asyncio
import app.models  # noqa: F401 — register all models

from app.database import engine
from app.models.base import Base


async def main() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("create_all OK")


asyncio.run(main())
PY

echo "==> Applying SQL migrations (0001–0021)..."
shopt -s nullglob
files=("${ROOT}/backend/migrations/"[0-9][0-9][0-9][0-9]_*.sql)
IFS=$'\n' sorted=($(sort <<<"${files[*]}"))
unset IFS

SSL_FLAG=""
if [[ "$PSQL_URL" == *oregon-postgres.render.com* ]]; then
  SSL_FLAG="require"
fi

"$PY" - <<PY
import asyncio
import glob
import os
from pathlib import Path

import asyncpg

ssl = "require" if ${SSL_FLAG:+True} else None
migrations = sorted(glob.glob("migrations/[0-9][0-9][0-9][0-9]_*.sql"))
url = os.environ.get("DATABASE_URL_SYNC") or os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")

async def main() -> None:
    conn = await asyncpg.connect(url, ssl=ssl)
    for path in migrations:
        name = Path(path).name
        print(f"    -> {name}")
        sql = Path(path).read_text(encoding="utf-8")
        try:
            await conn.execute(sql)
        except Exception as exc:
            print(f"    WARN {name}: {exc}")
    await conn.close()
    print("migrations OK")

asyncio.run(main())
PY

echo "==> Done."
