# Railway — sık hatalar ve düzeltmeler

## 1. Build: `npm run build` / out of memory (web)

**Belirti:** Build log’da `Killed` veya heap OOM.

**Çözüm (repo’da uygulandı):**
- `apps/web/Dockerfile` → `NODE_OPTIONS=--max-old-space-size=6144`
- Railway web servisi → **Settings → Resources → 4 GB+ RAM** (build sırasında)

## 2. Runtime: Remotion render fails (web)

**Belirti:** Story üretiminde Chromium / puppeteer hatası.

**Çözüm (repo’da uygulandı):**
- Alpine yerine `node:20-bookworm-slim` + `chromium` paketi
- `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`

## 3. API: veritabanı bağlanmıyor / InMemory DB

**Belirti:** `/health/ready` degraded, veri kayboluyor.

**Çözüm:**
```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
```
veya
```env
ConnectionStrings__DefaultConnection=Host=${{Postgres.PGHOST}};Port=${{Postgres.PGPORT}};Database=${{Postgres.PGDATABASE}};Username=${{Postgres.PGUSER}};Password=${{Postgres.PGPASSWORD}};SSL Mode=Require;Trust Server Certificate=true
```

API `PostgresConnection.Resolve()` artık `postgres://` URL’yi otomatik çevirir.

## 4. API root directory yanlış

| Servis | Root Directory | Dockerfile |
|--------|----------------|------------|
| api | **repo kökü** `.` | `apps/api/Dockerfile` |
| web | `apps/web` | `Dockerfile` |
| crew | `backend` | `Dockerfile` |

## 5. CORS / 502 proxy (web → api)

```env
BACKEND_ORIGIN=https://${{smartagency-api.RAILWAY_PUBLIC_DOMAIN}}
NEXT_PUBLIC_API_URL=https://${{smartagency-api.RAILWAY_PUBLIC_DOMAIN}}
Frontend__BaseUrl=https://${{smartagency-web.RAILWAY_PUBLIC_DOMAIN}}
```

## 6. Crew mock yanıtları

```env
OrchestrationService__UseDevMock=false
OrchestrationService__BaseUrl=https://${{smartagency-crew.RAILWAY_PUBLIC_DOMAIN}}
```

## Ben deploy edebilir miyim?

Hayır — Railway/Render hesabına **senin** `railway login` / GitHub OAuth girişin gerekir.  
Alternatif: **Render Blueprint** (`render.yaml`) — en az manuel adım.
