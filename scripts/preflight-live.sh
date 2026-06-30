#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SKIP_ENV="${SKIP_ENV:-0}"
SKIP_MIGRATIONS="${SKIP_MIGRATIONS:-0}"
SKIP_TESTS="${SKIP_TESTS:-0}"
SKIP_WEB_TSC="${SKIP_WEB_TSC:-0}"
RUN_E2E_SMOKE="${RUN_E2E_SMOKE:-0}"
REQUIRE_PUBLISH="${REQUIRE_PUBLISH:-0}"

echo "== Smart Agency live preflight =="
echo "root: $ROOT_DIR"

if [[ "$SKIP_ENV" != "1" ]]; then
  echo
  echo "== Env validation =="
  ENV_ARGS=(--strict)
  if [[ "$REQUIRE_PUBLISH" == "1" ]]; then
    ENV_ARGS+=(--require-publish)
  fi
  python3 scripts/validate-live-env.py "${ENV_ARGS[@]}"
else
  echo
  echo "== Env validation skipped (SKIP_ENV=1) =="
fi

if [[ "$SKIP_MIGRATIONS" != "1" ]]; then
  echo
  echo "== Migration/schema health =="
  if [[ -d "backend/.venv" ]]; then
    # Reuse backend virtualenv so sqlalchemy/asyncpg versions match runtime.
    # shellcheck disable=SC1091
    source backend/.venv/bin/activate
  fi
  python3 scripts/check-live-migrations.py
else
  echo
  echo "== Migration/schema health skipped (SKIP_MIGRATIONS=1) =="
fi

if [[ "$SKIP_TESTS" != "1" ]]; then
  echo
  echo "== Python backend tests =="
  scripts/test-python-backend.sh

  echo
  echo "== .NET xUnit tests =="
  scripts/test-dotnet-api.sh --no-restore
else
  echo
  echo "== Backend tests skipped (SKIP_TESTS=1) =="
fi

if [[ "$SKIP_WEB_TSC" != "1" ]]; then
  echo
  echo "== Web TypeScript check =="
  cd "$ROOT_DIR/apps/web"
  npx tsc --noEmit
else
  echo
  echo "== Web TypeScript check skipped (SKIP_WEB_TSC=1) =="
fi

if [[ "$RUN_E2E_SMOKE" == "1" ]]; then
  echo
  echo "== Critical E2E smoke =="
  cd "$ROOT_DIR"
  scripts/smoke-live-e2e.sh
else
  echo
  echo "== Critical E2E smoke skipped (RUN_E2E_SMOKE=0) =="
fi

echo
echo "OK: live preflight completed"
