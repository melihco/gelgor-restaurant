#!/usr/bin/env bash
# Next.js + BullMQ production worker together (required when PRODUCTION_EXECUTOR=bullmq).
# Usage (repo root or apps/web): ./scripts/dev-web-with-worker.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="$ROOT/apps/web"
cd "$WEB"

if [[ -z "${REDIS_URL:-}" ]] && [[ -f "$WEB/.env.local" ]]; then
  # shellcheck disable=SC1091
  set -a
  # Export REDIS_URL if present (worker needs it before tsx boots).
  REDIS_LINE="$(grep -E '^REDIS_URL=' "$WEB/.env.local" | head -n1 || true)"
  if [[ -n "$REDIS_LINE" ]]; then
    eval "export $REDIS_LINE"
  fi
  set +a
fi

if [[ -z "${REDIS_URL:-}" ]]; then
  export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379/0}"
fi

echo "→ BullMQ production worker (REDIS_URL=${REDIS_URL%%@*}…)"
npm run worker:production &
WORKER_PID=$!

cleanup() {
  kill "$WORKER_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

# Brief pause so the worker logs "started" before Next compiles.
sleep 1

echo "→ Next.js :3000"
npm run dev
