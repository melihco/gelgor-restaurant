# Sprint 15: Production E2E & Deployment Hardening

Sprint 15 adds the first production hardening layer: CI, readiness checks, environment separation, deployment runbook, and smoke testing.

## Health Endpoints

- `GET /health`: backward-compatible basic health
- `GET /health/live`: liveness probe for process/container health
- `GET /health/ready`: readiness probe for database, orchestration service, vector memory, and deployment configuration

Readiness can return `503` when critical dependencies fail. Vector memory is treated as degraded only when it is enabled but unreachable.

## CI/CD

GitHub Actions workflow:

```text
.github/workflows/ci.yml
```

CI validates:

- .NET restore/build
- Next.js install/type-check/build
- Python smoke/provider endpoint compile
- Docker image builds for API, web, and backend

## Environment Separation

Use `.env.production.example` as the baseline for staging/prod.

Recommended split:

- `APP_ENV=staging` and `ASPNETCORE_ENVIRONMENT=Staging` for staging
- `APP_ENV=production` and `ASPNETCORE_ENVIRONMENT=Production` for production
- `ACTION_EXECUTION_MODE=dry-run` by default in staging
- `ACTION_EXECUTION_MODE=dry-run` in production until OAuth/provider write credentials are verified
- turn on live provider execution per tenant through RBAC and UI flow, not by changing global defaults first

## Migration Strategy

The current API uses `EnsureCreated` plus idempotent schema patches. Before real production traffic, move to EF Core migrations:

1. Create the initial migration from the current model.
2. Generate SQL migration scripts in CI:

```bash
dotnet ef migrations script --project apps/api/src/Nexus.Infrastructure --startup-project apps/api/src/Nexus.Api --idempotent -o artifacts/migrations.sql
```

3. Apply migrations as a separate deployment step before rolling API containers.
4. Keep seed/demo data disabled or tenant-scoped for production.
5. Keep schema patch code only as temporary compatibility until migrations own schema evolution.

## Backup / Restore

Postgres backup:

```bash
docker compose exec postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backups/nexus_$(date +%Y%m%d_%H%M%S).sql
```

Postgres restore:

```bash
docker compose exec -T postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB" < backups/nexus_restore.sql
```

Qdrant backup:

- snapshot `/qdrant/storage` volume at the infrastructure layer
- keep the `QDRANT_COLLECTION` name in deployment metadata
- after restore, run `POST /api/setup/vector-memory/reindex` if the vector index is missing or stale

## Production Smoke

Run after deployment:

```bash
python3 scripts/production-e2e-smoke.py \
  --api-url https://api.example.com \
  --web-url https://app.example.com \
  --tenant-id <tenant-id> \
  --user-id <user-id> \
  --office-id <office-id> \
  --check-web
```

This verifies liveness, readiness, security context, onboarding status, billing usage, operations telemetry, and agent catalog without mutating provider accounts.

## Release Checklist

- CI is green on the target commit.
- `.env.production` is populated from secret manager, not committed.
- Database backup completed before migration/deploy.
- Readiness endpoint returns `ok` or an understood `degraded` state.
- Production E2E smoke passes.
- Operations panel shows no critical failures after deploy.
- Action execution remains `dry-run` until provider write credentials and RBAC are verified.
