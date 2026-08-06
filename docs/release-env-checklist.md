# Release öncesi ortam değişkenleri (Smart Agency)

**Durum:** Kontrollü pilot go-live — prod değerleri Render Dashboard’da doğrulanmalı.

## Zorunlu (multi-tenant güvenlik)

| Değişken | Dev (mevcut) | Prod (hedef) | Not |
|----------|--------------|--------------|-----|
| `NEXT_PUBLIC_USE_DEMO_CONTEXT` | `true` | **`false`** | Demo tenant injection kapatılır; gerçek JWT zorunlu |
| `INTERNAL_API_KEY` | dev default | **güçlü secret** | Python ↔ Next ↔ Nexus; commit etme; Dashboard’da sync:false |
| `Auth__JwtSecret` | dev | **güçlü secret** | Nexus JWT |
| `Auth__EnsureSeedAdminLogin` | opsiyonel | **`false`** | Seed admin hash onarımı kapalı |
| `EnableSwagger` | `true` | **`false`** | Prod API yüzeyini daralt |
| `CREW_BACKEND_URL` | `http://localhost:8000` | internal URL | Tarayıcıya açık olmamalı |
| `NEXT_PUBLIC_API_URL` / `BACKEND_ORIGIN` | `127.0.0.1:5050` | prod Nexus URL | |
| `NEXTJS_INTERNAL_URL` | `http://localhost:3000` | prod Next internal | task_graph → auto-produce |
| `ActionExecution__Mode` | `dry-run` | **`dry-run`** | Live provider adapter’lar henüz gerçek API değil |

## Deploy (tüm servisler)

```bash
export RENDER_API_KEY=rnd_...
./scripts/render-trigger-deploy.sh
```

Sıra: **web → api → crew → worker**. Sadece web/crew deploy etmek Nexus’u geride bırakır.

Smoke:

```bash
curl -sS https://smartagency-web.onrender.com/api/health/live
curl -sS https://smartagency-api.onrender.com/health/live
```

Slot catalog sync-seed (prod `INTERNAL_API_KEY` ile):

```bash
curl -sS -X POST https://smartagency-web.onrender.com/api/internal/slot-catalog/sync-seed \
  -H "X-Internal-Api-Key: ${INTERNAL_API_KEY}" \
  -H 'Content-Type: application/json' -d '{}'
```

## Otonom üretim (bilinçli açma)

| Değişken | Dev | Prod öneri | Not |
|----------|-----|--------------|-----|
| `NEXT_PUBLIC_AUTO_MISSION_TRIGGER` | opsiyonel | `false` → pilot sonrası `true` | Feed mount auto-trigger |
| `AUTO_PRODUCE_RUNWAY` | `true` (pilot) | tenant tier / maliyet politikası | Runway maliyeti |
| `RUNWAY_API_SECRET` | set | set | Reel üretimi |
| `SMART_AGENCY_IMAGE_PROVIDER` | `flux` / `openai` | aynı + key rotation | |

## Ödeme (PayTR)

| Değişken | Prod öneri | Not |
|----------|------------|-----|
| `PAYTR_ENABLED` | unset / `false` | Merchant yokken kapalı |
| Redis (`REDIS_URL` / BullMQ) | **zorunlu** worker + PayTR açılınca | PayTR enabled iken Redis yoksa checkout 503 |

## Veritabanı lifecycle (bu sprint)

- Python: `schema_gate` factory kolonları genişletildi (`brand_theme`, `customization`, `canonical_sectors.is_active`, …). Startup `SCHEMA_GATE_MODE=fail` (prod).
- Doğrula: `cd backend && python scripts/verify_schema.py` (`SCHEMA_GATE_APPLY=1` additive DDL).
- Full Alembic + EF Core migrations **ayrı epic** — bu checklist’te zorunlu değil; EnsureCreated + patches + schema gate ile pilot.

## Kalite kapıları (Foundation)

- BAS=100 (`canAutoProduce`): BRS + GIS + CCS hepsi 100 — prod’da tenant onboarding tamamlanmadan otonom üretim açılmamalı.
- `brand-readiness` / `brand-alignment` route’ları prod’da JWT + `X-Tenant-Id` ile çalışır (`middleware.ts`).

## Doğrulama (release smoke)

1. İki farklı tenant login → Feed içerikleri karışmıyor.
2. `X-Tenant-Id` olmadan `/api/auto-produce` → 401/403 (prod).
3. Python stack `X-Internal-Api-Key` ile auto-produce bypass (mission pipeline).
4. `NEXT_PUBLIC_USE_DEMO_CONTEXT=false` iken demo tenant header’ı yok.
5. Provider live actions (`/instagram/posts/schedule`, Google reply) → `not_implemented` / fail-loud (sahte success yok).
6. Swagger UI prod’da kapalı; seed admin login kapalı.

## İlgili dokümanlar

- `docs/sprint-plan-multi-tenant-production.md`
- `docs/foundation-sprint-program.md`
- `CLAUDE.md` (portlar, DB)
