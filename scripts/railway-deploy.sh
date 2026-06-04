#!/usr/bin/env bash
# Smart Agency — Railway deploy yardımcısı
# Kullanım: ./scripts/railway-deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=== Smart Agency Railway Deploy ==="
echo ""

if ! command -v railway >/dev/null 2>&1; then
  echo "Railway CLI yok. Kurulum:"
  echo "  npm install -g @railway/cli"
  echo "  railway login"
  echo ""
  echo "Alternatif: docs/railway-deploy.md → Manuel Dashboard adımları"
  exit 1
fi

if ! railway whoami >/dev/null 2>&1; then
  echo "Önce giriş yapın: railway login"
  exit 1
fi

echo "Bağlı proje:"
railway status 2>/dev/null || true
echo ""

echo "Bu repo 3 uygulama servisi gerektirir (Dashboard'da ayrı ayrı oluşturun):"
echo "  1. smartagency-crew   → root: backend"
echo "  2. smartagency-api    → root: . (repo kökü), Dockerfile: apps/api/Dockerfile"
echo "  3. smartagency-web    → root: apps/web"
echo "  + PostgreSQL plugin"
echo ""
echo "Detaylı adımlar: docs/railway-deploy.md"
echo "Env şablonu: railway.env.example"
echo ""

read -r -p "Postgres plugin eklendi mi? (y/N) " HAS_PG
if [[ ! "${HAS_PG,,}" =~ ^y ]]; then
  echo "Dashboard → New → Database → PostgreSQL"
  echo "veya: railway add --database postgres"
  exit 0
fi

echo ""
echo "--- Önerilen deploy komutları (servis dizininde çalıştırın) ---"
echo ""
echo "# Crew (backend dizininde linked service: smartagency-crew)"
echo "cd backend && railway up"
echo ""
echo "# API (repo kökünde linked service: smartagency-api)"
echo "cd $ROOT && railway up --service smartagency-api"
echo ""
echo "# Web (apps/web'de linked service: smartagency-web)"
echo "cd apps/web && railway up"
echo ""
echo "İlk deploy sonrası Variables sekmesinde railway.env.example değerlerini girin."
echo "Servis URL'leri oluşunca \${{Service.RAILWAY_PUBLIC_DOMAIN}} referanslarını güncelleyin."
