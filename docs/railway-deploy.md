# Smart Agency — Railway deploy rehberi

Bu rehber monorepo'yu Railway'de **4 servis + Postgres** olarak yayinlar.

## Mimari

| Railway servisi | Kok dizin | Dockerfile | Health |
|-----------------|-----------|------------|--------|
| `smartagency-web` | `apps/web` | `Dockerfile` | `/` |
| `smartagency-api` | **repo koku** | `apps/api/Dockerfile` | `/health/live` |
| `smartagency-crew` | `backend` | `Dockerfile` | `/health` |
| `Postgres` | plugin | — | — |

## Manuel Dashboard (ilk deploy)

### 1. GitHub

Railway Project → Deploy from GitHub → bu repo.

### 2. PostgreSQL

New → Database → PostgreSQL.

Ilk acilista .NET tablolari olusturur. Python icin:

```bash
psql "$DATABASE_URL" -f backend/migrations/0001_brand_context_discovery_fields.sql
```

### 3. Servis `smartagency-crew`

- Root Directory: `backend`
- Variables: `railway.env.example` (crew bolumu)
- `DATABASE_URL=${{Postgres.DATABASE_URL}}`
- `ENABLE_PUBLIC_API=false`

### 4. Servis `smartagency-api`

- Root Directory: `/` (repo koku)
- Dockerfile path: `apps/api/Dockerfile`
- `ConnectionStrings__DefaultConnection=Host=${{Postgres.PGHOST}};Port=${{Postgres.PGPORT}};Database=${{Postgres.PGDATABASE}};Username=${{Postgres.PGUSER}};Password=${{Postgres.PGPASSWORD}};SSL Mode=Require;Trust Server Certificate=true`
- `OrchestrationService__BaseUrl=https://${{smartagency-crew.RAILWAY_PUBLIC_DOMAIN}}`
- `OrchestrationService__UseDevMock=false`

### 5. Servis `smartagency-web`

- Root Directory: `apps/web`
- RAM: **2 GB+** (Remotion)
- `NEXT_PUBLIC_API_URL`, `BACKEND_ORIGIN` → api public URL
- `NEXT_PUBLIC_USE_DEMO_CONTEXT=false`

### 6. Deploy sirasi

Postgres → crew → api → web

### 7. Smoke

```bash
python3 scripts/production-e2e-smoke.py \
  --api-url https://YOUR-API.up.railway.app \
  --web-url https://YOUR-WEB.up.railway.app \
  --tenant-id <uuid> --user-id <uuid> --office-id <uuid> --check-web
```

## CLI

```bash
npm install -g @railway/cli
railway login
./scripts/railway-deploy.sh
```

## Sık hatalar

`docs/railway-troubleshooting.md`

## Render alternatifi

`render.yaml` + `docs/deploy-render.md`

## Dosyalar

- `railway.env.example`
- `backend/railway.toml`, `apps/api/railway.toml`, `apps/web/railway.toml`
