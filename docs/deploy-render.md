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

## Üretim worker'ı (BullMQ) — yatay ölçekleme

`smartagency-production-worker` (type: worker) üretim hattını web'den izole eder:

- Aynı Docker image, farklı entrypoint (`node start-worker.mjs`): container içinde
  **127.0.0.1'e bağlı özel bir Next.js instance'ı** + BullMQ consumer birlikte çalışır.
- Üretim yükü (sharp, satori/Resvg, fal/OpenAI çağrıları) worker container'ında koşar;
  kullanıcıya bakan `smartagency-web` yalnızca UI/API servis eder — 502 riski kalkar.
- Worker'lar Redis üzerinden koordine olur: BullMQ kuyruğu, global inflight cap
  (`PRODUCTION_GLOBAL_MAX_INFLIGHT`), workspace üretim kilitleri. Yüzlerce tenant
  için `numInstances` artırmak yeterli.

**Devreye alma sırası (güvenli):**

1. Blueprint sync → worker servisi oluşur. `PRODUCTION_EXECUTOR=http` kaldığı sürece
   worker boşta bekler, mevcut akış değişmez.
2. Worker'ın `sync: false` env'lerini doldur (web ile aynı liste):
   `python3 scripts/sync-render-env-from-local.py` veya dashboard.
3. Worker loglarında `started. queue=production-slots` görünce:
   `smartagency-crew` → `PRODUCTION_EXECUTOR=bullmq` yap.
4. Geri dönüş: `PRODUCTION_EXECUTOR=http` — Python watchdog kuyruktaki claim'leri
   stale-reclaim ile geri alır, HTTP drain kaldığı yerden devam eder.

## Maliyet notu

- `plan: starter` web/api için (Remotion RAM). Free tier uyku modu + düşük RAM story render’da patlayabilir.
- Prod için web **en az 2 GB RAM** önerilir.

## Railway hâlâ kullanılacaksa

Güncellenmiş rehber: `docs/railway-deploy.md`  
Env şablonu: `railway.env.example`  
API artık `DATABASE_URL` (postgres://) okuyor — `PostgresConnection.cs`.
