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
7. İlk deploy bitince:
   ```bash
   curl https://<api-host>/health/ready
   ```

## Python migration (ilk sefer)

Render Shell → `smartagency-crew` → veya lokal:

```bash
psql "$DATABASE_URL" -f backend/migrations/0001_brand_context_discovery_fields.sql
```

.NET API ilk açılışta tabloları `EnsureCreated` ile kurar.

## Maliyet notu

- `plan: starter` web/api için (Remotion RAM). Free tier uyku modu + düşük RAM story render’da patlayabilir.
- Prod için web **en az 2 GB RAM** önerilir.

## Railway hâlâ kullanılacaksa

Güncellenmiş rehber: `docs/railway-deploy.md`  
Env şablonu: `railway.env.example`  
API artık `DATABASE_URL` (postgres://) okuyor — `PostgresConnection.cs`.
