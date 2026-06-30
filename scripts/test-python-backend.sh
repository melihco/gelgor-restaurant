#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/backend"

if [[ ! -d ".venv" ]]; then
  echo "backend/.venv not found. Create/activate the backend virtualenv first." >&2
  exit 1
fi

source .venv/bin/activate
python -m pytest "$@"
