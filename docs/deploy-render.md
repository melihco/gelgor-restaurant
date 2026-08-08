# Render — otomatik Postgres + deploy (Railway alternatifi)

**Tek tık:** GitHub repo → Render Blueprint → `render.yaml` dosyası DB ve 3 servisi oluşturur.

## Neden Render?

| | Railway | Render Blueprint |
|---|---------|------------------|
| Postgres otomatik | Plugin ekle | `databases:` bloğu |
| Servis wiring | Manuel `${{Service}}` | `fromService` / `fromDatabase` |
| Private crew | Public URL riski | `type: pserv` (internal) |
| Repo dosyası | `railway.toml` × 3 | Tek `render.yaml` |

## Adımlar (≈10 dk)

1. [render.com](https://render.com) → Sign up → **New** → **Blueprint**
2. GitHub’da `smart-agency` reposunu bağla
3. Blueprint path: `render.yaml` (kök)
4. **Apply** — Render oluşturur:
   - `nexus-db` (PostgreSQL)
   - `smartagency-crew` (private)
   - `smartagency-api`
   - `smartagency-web`
5. Publish env'leri yükle (yerel `.env.local` değerlerinden):
   ```bash
   ./scripts/render-push-publish-env.sh --dry-run
   # Dashboard → smartagency-web → Add from .env → render.env.publish.web.local
   # Dashboard → smartagency-crew → Add from .env → render.env.publish.crew.local
   # veya: export RENDER_API_KEY=rnd_... && ./scripts/render-push-publish-env.sh
   ```
   Zorunlu publish alanları: `META_APP_*`, `MERTCAFE_*`, `R2_*`, `OPENAI_API_KEY`, `FAL_API_KEY`, `RUNWAY_API_SECRET`
6. Public URL'ler `RENDER_EXTERNAL_URL` ile otomatik bağlanır (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, CORS).
7. **smartagency-api** → Environment’da `DATABASE_URL` olduğunu doğrula (nexus-db bağlantısı). Yoksa Blueprint Sync veya manuel ekle.
8. İlk deploy bitince:
   ```bash
   curl https://<api-host>/health/ready
   ```
   Log’da `Postgres: Host=dpg-...` görünmeli — `127.0.0.1` ise `DATABASE_URL` eksik/yanlış.

## Python migration (ilk sefer)

Render Shell → `smartagency-crew` → veya lokal:

```bash
psql "$DATABASE_URL" -f backend/migrations/0001_brand_context_discovery_fields.sql
```

.NET API ilk açılışta tabloları `EnsureCreated` ile kurar.

## Üretim worker'ı (BullMQ) — zorunlu ayrı servis

`smartagency-production-worker` (type: worker) üretim hattını web'den izole eder.
Blueprint'te `PRODUCTION_EXECUTOR=bullmq` sabittir — worker yoksa feed üretimi
**stall olmaz**: `/api/queue/enqueue` `503 production_worker_offline` döner ve
Python job'ları `deferred` yapar (60s sonra yeniden dener).

- Aynı Docker image, farklı entrypoint (`node start-worker.mjs`): container içinde
  **127.0.0.1'e bağlı özel bir Next.js instance'ı** + BullMQ consumer birlikte çalışır.
- Üretim yükü (sharp, satori/Resvg, fal/OpenAI çağrıları) worker container'ında koşar;
  kullanıcıya bakan `smartagency-web` yalnızca UI/API servis eder — 502 riski kalkar.
- Worker'lar Redis üzerinden koordine olur: BullMQ kuyruğu, global inflight cap
  (`PRODUCTION_GLOBAL_MAX_INFLIGHT`), workspace üretim kilitleri. Binlerce tenant
  için `numInstances` artırmak yeterli (fair-share drain Crew tarafında açık).
- İzleme: `GET /api/queue/stats` → `workerCount`, `alerts.workerOffline` /
  `alerts.noWorkers` (internal key). Platform Admin → Maliyet → Üretim hattı.

### Kapasite / maliyet (phase-1 → scale)

| Aşama | Instances | Concurrency | Inflight | ≈ Render/ay | Paralel slot |
|-------|-----------|-------------|----------|-------------|--------------|
| **Phase-1 (~5 müşteri)** | **2** | **2** | **8** | **~$50** | ~4 |
| Büyüme (~50) | 4–6 | 2 | 12–20 | ~$100–150 | ~8–12 |
| Peak (~1000 hazırlık) | 10 | 2–3 | provider %50–70 | ~$250 | ~20 |

Scale (Render API):

```bash
# Phase-1 (düşük maliyet)
curl -X POST -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  "https://api.render.com/v1/services/srv-d9b9mjflk1mc73fe5t10/scale" \
  -d '{"numInstances":2}'

# Peak
curl -X POST -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  "https://api.render.com/v1/services/srv-d9b9mjflk1mc73fe5t10/scale" \
  -d '{"numInstances":10}'
```

Sağlık: `workerCount` ≈ instance sayısı; `globalInflight` ≤ `globalInflightMax`;
`alerts.providerBillingCircuit=false`. Billing circuit açılırsa önce kota, sonra
`POST /api/queue/stats` `{action: clear_provider_billing_circuits}`.

**Deploy checklist:**

1. Blueprint sync → `smartagency-production-worker` ayakta (`numInstances` ≥ 2 phase-1).
2. Worker capacity env: `PRODUCTION_WORKER_CONCURRENCY=2`,
   `PRODUCTION_GLOBAL_MAX_INFLIGHT=8`, `PRODUCTION_WORKER_RATE_MAX=20`.
3. Worker `sync: false` env'leri web ile aynı (fal/OpenAI/R2):
   `python3 scripts/sync-render-env-from-local.py` veya dashboard.
4. Worker log: `started. queue=production-slots concurrency=2` + private Next ready.
5. Crew'da `PRODUCTION_EXECUTOR=bullmq` (blueprint default).
6. Acil geri dönüş: crew'da `PRODUCTION_EXECUTOR=http` — senkron drain web'e biner.

## Maliyet notu

- `plan: starter` web/api için (Remotion RAM). Free tier uyku modu + düşük RAM story render’da patlayabilir.
- Prod için web **en az 2 GB RAM** önerilir.

## Railway hâlâ kullanılacaksa

Güncellenmiş rehber: `docs/railway-deploy.md`  
Env şablonu: `railway.env.example`  
API artık `DATABASE_URL` (postgres://) okuyor — `PostgresConnection.cs`.
