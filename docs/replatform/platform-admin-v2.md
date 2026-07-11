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

## v3 roadmap

- Cross-tenant registry + impersonation
- Meta/Google OAuth from admin panel
- Scheduled template "run now"
- AI diff preview before save
- Audit log per admin action
- Desk sidebar link (env-gated)

## Env

```
NEXT_PUBLIC_PLATFORM_ADMIN=true
OPENAI_API_KEY=...
OPENAI_ADMIN_EDIT_MODEL=gpt-4o-mini  # optional
```
