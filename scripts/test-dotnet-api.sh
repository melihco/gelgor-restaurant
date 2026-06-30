#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/apps/api"

dotnet test Nexus.sln --collect:"XPlat Code Coverage" --verbosity minimal "$@"
