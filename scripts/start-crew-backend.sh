#!/usr/bin/env bash
# SmartAgency Python Crew / orkestrasyon servisini :8000'de başlatır (Nexus bunu bekler).
# Kullanım: repo kökünden ./scripts/start-crew-backend.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/backend"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 bulunamadı. Python 3.11+ kurun." >&2
  exit 1
fi

if [[ ! -d .venv ]]; then
  echo "→ .venv oluşturuluyor…"
  python3 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate

if ! python -m pip --version >/dev/null 2>&1; then
  echo "→ pip eksik; ensurepip ile tamamlanıyor…"
  python -m ensurepip --upgrade 2>/dev/null || true
fi
if ! python -m pip --version >/dev/null 2>&1; then
  echo "→ .venv pip içermiyor; yeniden oluşturuluyor…"
  deactivate 2>/dev/null || true
  rm -rf .venv
  python3 -m venv .venv
  # shellcheck disable=SC1091
  source .venv/bin/activate
  python -m ensurepip --upgrade
fi

echo "→ Bağımlılıklar (pip)…"
python -m pip install -q -r requirements.txt

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "→ backend/.env oluşturuldu (.env.example). Gerçek LLM için OPENAI_API_KEY doldurun."
fi

echo "→ http://0.0.0.0:8000 (reload) — Durdurmak için Ctrl+C"
echo "→ Nexus gerçek Crew kullanacaksa: apps/api appsettings.Development.json içinde UseDevMock=false yapın."
exec python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
