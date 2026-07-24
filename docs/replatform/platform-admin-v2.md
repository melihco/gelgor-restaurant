# Platform Admin v2 — AI destekli operatör platformu

## Yeni sekmeler ve yetenekler

| Sekme | Yetenek |
|-------|---------|
| **Marka Stüdyosu** | 9 metin alanı düzenleme, alan bazında **AI ile düzelt**, PATCH brand_context, gap tamamlama |
| **Operasyonlar** | Marka analizi, gap completion, mission propose, auto-trigger, brand rules scan, reconcile, queue stats |
| **Mission & Üretim** | Liste + approve/reject/kick/reproduce/requeue/reset/cancel |
| **Entegrasyonlar** | Nexus bağlantı listesi (oturum tenant) |
| **Maliyet** | v1 slot/event drill-down (değişmedi) |

## AI düzenleme

- `POST /api/admin/ai/improve-text` — operator auth + OpenAI
- Marka bağlamı Python'dan okunur; operatör talimatı opsiyonel
- UI: `AiAssistField` — her alanda Sparkles butonu

## Manuel tetikleme (Operasyonlar sekmesi)

| Aksiyon | Endpoint |
|---------|----------|
| Marka analizi | `POST /api/brand-context/{ws}/analyze` |
| Gap tamamlama | `POST /api/brand-context/{ws}/complete-gaps` |
| Mission öner | `POST /api/missions/{ws}/propose` |
| Otonom pipeline | `POST /api/missions/{ws}/auto-trigger` |
| Brand rules scan | `POST /api/brand-rules/{ws}/scan` |
| Agent reconcile | `POST /api/operations/reconcile-stale-agent-runs` |
| Kuyruk stats | `GET /api/admin/queue/stats` |

## Mission müdahaleleri

`MissionActionsPanel`: approve, reject, kick-feed-production, reproduce-feed, requeue-factory-jobs, reset-production, restart, cancel.

## Backend P0 (Super Admin) — landed

| Nexus | Next BFF | Purpose |
|-------|----------|---------|
| `GET/POST /api/platform/tenants` | `/api/admin/tenants` | Tenant registry + bootstrap create |
| `POST /api/platform/impersonate` | `/api/admin/impersonate` | Short-lived Bearer for target brand |
| `GET /api/platform/audit-logs` | `/api/admin/audit-logs` | DB audit (not process-memory) |
| `PUT /api/platform/tenants/{id}/subscription` | `/api/admin/tenants/{id}/subscription` | CRM package assign |
| `GET /api/platform/brands` | `/api/admin/brands` (`?source=brands\|nexus`) | Crew brands + Nexus tenants |
| — | `/api/admin/workspace/{tenantId}/nexus/{...path}` | INTERNAL_API_KEY + `X-Platform-Admin` proxy for Users/Agents/Briefs/Tasks/Actions/Packages/Integrations/Setup |

**Tenant-scoped screens:** prefer impersonate Bearer (`Authorization`) **or** BFF workspace proxy (server `INTERNAL_API_KEY` + `X-Platform-Admin: 1` + `X-Tenant-Id`).

## v3 roadmap

- Meta/Google OAuth from admin panel
- Scheduled template "run now"
- AI diff preview before save
- UI wiring: tenant dropdown + workspace BFF on Users/Agents/Briefs tabs
- Desk sidebar link (env-gated)

## Env

```
NEXT_PUBLIC_PLATFORM_ADMIN=true
PLATFORM_ADMIN_EMAILS=ops@example.com   # prod: required allowlist (elevates platform.operate)
INTERNAL_API_KEY=...                    # BFF → Nexus target-tenant reads/writes
NEXUS_API_URL= / NEXT_PUBLIC_API_URL=
CREW_API_URL=
SESSION_SECRET= / Auth:JwtSecret
SEED_ADMIN_ENABLED=false                # prod: off
OPENAI_API_KEY=...
OPENAI_ADMIN_EDIT_MODEL=gpt-4o-mini  # optional
```

Regen OpenAPI after deploy: `cd apps/web && npm run codegen:api`
