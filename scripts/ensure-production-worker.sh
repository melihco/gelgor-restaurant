#!/usr/bin/env bash
# Start the BullMQ production worker if none is already running.
# Usage: ./scripts/ensure-production-worker.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="$ROOT/apps/web"
mkdir -p "$ROOT/.logs"

if pgrep -f 'src/workers/production-worker.ts' >/dev/null 2>&1 \
  || pgrep -f 'production-worker.cjs' >/dev/null 2>&1 \
  || pgrep -f '@smartagency/studio' >/dev/null 2>&1; then
  echo "✓ production worker already running"
  pgrep -fl 'production-worker' | head -5
  exit 0
fi

if [[ -z "${REDIS_URL:-}" ]] && [[ -f "$WEB/.env.local" ]]; then
  REDIS_LINE="$(grep -E '^REDIS_URL=' "$WEB/.env.local" | head -n1 || true)"
  if [[ -n "$REDIS_LINE" ]]; then
    eval "export $REDIS_LINE"
  fi
fi
export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379/0}"

echo "→ starting studio production worker (STUDIO_DIRECT=1)…"
export STUDIO_DIRECT="${STUDIO_DIRECT:-1}"
cd "$ROOT"
nohup npm run studio >>"$ROOT/.logs/production-worker.log" 2>&1 &
echo "  pid=$!  log=$ROOT/.logs/production-worker.log"
echo "  required when backend PRODUCTION_EXECUTOR=bullmq"
