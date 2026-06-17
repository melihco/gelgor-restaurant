#!/usr/bin/env bash
# Bootstrap Python (Crew) tables + SQL migrations on Render Postgres.
# Run inside Render Shell → smartagency-crew, or locally with Render DATABASE_URL:
#   export DATABASE_URL='postgresql://...'
#   ./scripts/render-bootstrap-python-db.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}/backend"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set."
  exit 1
fi

# psql expects postgres:// not postgresql+asyncpg://
PSQL_URL="${DATABASE_URL/postgresql+asyncpg/postgresql}"
PSQL_URL="${PSQL_URL/postgresql+psycopg2/postgresql}"

echo "==> Creating SQLAlchemy base tables (create_all)..."
python3 - <<'PY'
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
for f in "${sorted[@]}"; do
  echo "    -> $(basename "$f")"
  psql "$PSQL_URL" -v ON_ERROR_STOP=1 -f "$f"
done

echo "==> Done. Restart smartagency-crew if migrations were applied for the first time."
