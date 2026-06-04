# Release öncesi ortam değişkenleri (Smart Agency)

**Durum:** Not alındı — release öncesi uygulanacak (şimdi dev ortamında değiştirme).

## Zorunlu (multi-tenant güvenlik)

| Değişken | Dev (mevcut) | Prod (hedef) | Not |
|----------|--------------|--------------|-----|
| `NEXT_PUBLIC_USE_DEMO_CONTEXT` | `true` | **`false`** | Demo tenant injection kapatılır; gerçek JWT zorunlu |
| `INTERNAL_API_KEY` | dev default | **güçlü secret** | Python ↔ Next ↔ Nexus; paylaşılmamalı |
| `CREW_BACKEND_URL` | `http://localhost:8000` | internal URL | Tarayıcıya açık olmamalı |
| `NEXT_PUBLIC_API_URL` / `BACKEND_ORIGIN` | `127.0.0.1:5050` | prod Nexus URL | |
| `NEXTJS_INTERNAL_URL` | `http://localhost:3000` | prod Next internal | task_graph → auto-produce |

## Otonom üretim (bilinçli açma)

| Değişken | Dev | Prod öneri | Not |
|----------|-----|--------------|-----|
| `NEXT_PUBLIC_AUTO_MISSION_TRIGGER` | opsiyonel | `false` → pilot sonrası `true` | Feed mount auto-trigger |
| `AUTO_PRODUCE_RUNWAY` | `true` (pilot) | tenant tier / maliyet politikası | Runway maliyeti |
| `RUNWAY_API_SECRET` | set | set | Reel üretimi |
| `SMART_AGENCY_IMAGE_PROVIDER` | `flux` / `openai` | aynı + key rotation | |

## Kalite kapıları (Foundation)

- BAS=100 (`canAutoProduce`): BRS + GIS + CCS hepsi 100 — prod’da tenant onboarding tamamlanmadan otonom üretim açılmamalı.
- `brand-readiness` / `brand-alignment` route’ları prod’da JWT + `X-Tenant-Id` ile çalışır (`middleware.ts`).

## Doğrulama (release smoke)

1. İki farklı tenant login → Feed içerikleri karışmıyor.
2. `X-Tenant-Id` olmadan `/api/auto-produce` → 401/403 (prod).
3. Python stack `X-Internal-Api-Key` ile auto-produce bypass (mission pipeline).
4. `NEXT_PUBLIC_USE_DEMO_CONTEXT=false` iken demo tenant header’ı yok.

## İlgili dokümanlar

- `docs/sprint-plan-multi-tenant-production.md`
- `docs/foundation-sprint-program.md`
- `CLAUDE.md` (portlar, DB)
