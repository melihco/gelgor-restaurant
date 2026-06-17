#!/usr/bin/env bash
# Smart Agency Design MCP server — port 8010 (Anthropic remote MCP connector).
# Usage: ./scripts/start-design-mcp.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/backend"

# shellcheck disable=SC1091
source .venv/bin/activate

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

# shellcheck disable=SC1091
set -a && source .env && set +a

export MCP_DESIGN_HOST="${MCP_DESIGN_HOST:-0.0.0.0}"
export MCP_DESIGN_PORT="${MCP_DESIGN_PORT:-8010}"
export MCP_DESIGN_PATH="${MCP_DESIGN_PATH:-/mcp}"
# Use MCP_AUTH_TOKEN if set; else INTERNAL_API_KEY (must match design_mcp_client.py)
export MCP_AUTH_TOKEN="${MCP_AUTH_TOKEN:-${INTERNAL_API_KEY:-smartagency-mcp-dev}}"

echo "→ Design MCP http://${MCP_DESIGN_HOST}:${MCP_DESIGN_PORT}${MCP_DESIGN_PATH}"
echo "→ Token: MCP_AUTH_TOKEN (or INTERNAL_API_KEY fallback)"
echo "→ Wire in backend/.env:"
echo "   MCP_SERVERS_JSON=[{\"name\":\"smartagency-design\",\"url\":\"http://127.0.0.1:${MCP_DESIGN_PORT}${MCP_DESIGN_PATH}\",\"authorization_token_env\":\"MCP_AUTH_TOKEN\"}]"

exec python -m app.mcp.design_server
