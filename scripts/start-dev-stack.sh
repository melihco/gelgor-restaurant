#!/usr/bin/env bash
# SmartAgency local dev stack — infra + Python + Nexus + Next.js + BullMQ production worker.
# Usage (repo root): ./scripts/start-dev-stack.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "→ Docker (postgres, redis, qdrant)…"
docker compose up -d postgres redis qdrant

echo "→ Python crew backend :8000 (background)…"
"$ROOT/scripts/start-crew-backend.sh" &
PYTHON_PID=$!

echo "→ Nexus API :5050 (background)…"
(cd "$ROOT/apps/api/src/Nexus.Api" && dotnet run --urls http://127.0.0.1:5050) &
DOTNET_PID=$!

echo "→ Next.js :3000 (background)…"
(cd "$ROOT/apps/web" && npm run dev) &
NEXT_PID=$!

echo "→ BullMQ production worker (background)…"
(cd "$ROOT/apps/web" && npm run worker:production) &
WORKER_PID=$!

trap 'kill $PYTHON_PID $DOTNET_PID $NEXT_PID $WORKER_PID 2>/dev/null || true' INT TERM EXIT

echo ""
echo "Stack starting:"
echo "  Postgres  :5432  Redis :6379  Qdrant :6333"
echo "  Python    http://127.0.0.1:8000"
echo "  Nexus     http://127.0.0.1:5050"
echo "  Next.js   http://127.0.0.1:3000"
echo "  Worker    production-slots (BullMQ — required when PRODUCTION_EXECUTOR=bullmq)"
echo ""
echo "Durdurmak için Ctrl+C"
wait
