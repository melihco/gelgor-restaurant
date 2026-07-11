# Platform Admin v1 — Analiz & IA

## Amaç

Smart Agency operatörlerinin **tenant / mission / slot** bazında üretim maliyetini, mission durumunu ve marka bağlamını tek yüzeyden izlemesi. Müşteri mobile uygulamasından ayrı; API maliyet detayı yalnızca operator görünümünde.

## Kapsam

### v1 (bu sprint)

| Sekme | İçerik | Veri kaynağı |
|-------|--------|--------------|
| **Genel Bakış** | Health, token kullanımı, tenant özeti | `PlatformAdminOverview` |
| **Müşteri** | Workspace seçici, tenant tablosu, brand snapshot | overview + `production-context/snapshot` |
| **Mission & Üretim** | Mission listesi, durum, seçili mission drill-down | `listMissionsForHub`, progress API |
| **Maliyet** | Workspace 30g seri, scope breakdown, top missions, slot tablosu, event log | `cost-ledger` BFF (yeni) |
| **Operasyonlar** | Agent runs, failed jobs özeti | `operations/summary` (overview içinden) |

### v2 (sonraki sprint)

- Cross-tenant registry (Nexus list endpoint)
- Suspend / package override / rollout flags
- Token wallet admin (markup, grant)
- Desk navigasyonuna `platform-admin` linki

## Yetki modeli (v1)

```
canAccessPlatformAdmin =
  permissions.includes('users.manage')
  OR (
    NEXT_PUBLIC_PLATFORM_ADMIN=true
    AND permissions.includes('operations.view')
  )
```

- BFF route'ları: `assertPlatformAdminAccess(req)` — 401/403
- Client: aynı kontrol, erişim yoksa `AccessDenied` kartı
- Müşteri mobile: maliyet detayı `isDebugUiMode()` ile sınırlı (değişmez)

## API haritası

### Mevcut (kullanılıyor)

| Client | BFF / Nexus | Açıklama |
|--------|-------------|----------|
| `getPlatformAdminOverview()` | `/api/admin/platform/overview` | Tek tenant özet |
| `listMissionsForHub(ws)` | `/api/missions/{ws}?hub=true` | Mission listesi |
| `getWorkspaceUsageCost(ws)` | `/api/usage-cost/{ws}` | Günlük tahmini kullanım |

### Yeni (v1)

| Client | BFF | Python |
|--------|-----|--------|
| `getAdminWorkspaceCostSummary(ws, days)` | `GET /api/admin/cost-ledger/{ws}/summary` | `GET /api/v1/cost-ledger/{ws}/workspace/summary` |
| `getAdminMissionCostProduction(ws, id)` | `GET .../missions/{id}/production` | `GET .../missions/{id}/production` |
| `getAdminMissionCostSlots(ws, id)` | `GET .../missions/{id}/slots` | `GET .../missions/{id}/slots` |
| `getAdminMissionCostEvents(ws, id)` | `GET .../missions/{id}/events` | `GET .../missions/{id}/events` |

## UI bileşen haritası

| Bileşen | Kaynak | Kullanım |
|---------|--------|----------|
| `AdminPageShell`, `AdminHero`, `AdminMetricCard` | `admin-template.tsx` | Panel shell |
| `MetricCard`, `GlassPanel` | `command-center.tsx` | Ops metrikleri |
| `WorkspaceCostDashboard` | **yeni** | Maliyet sekmesi üst özet |
| `MissionCostDetailPanel` | **yeni** | Mission seçildiğinde slot + event |
| `MissionListTable` | **yeni** | Mission sekmesi |
| `MissionAiCostPanel` (mobile) | `MissionHub.tsx` | v1'de desk versiyonu ayrı; ledger API kullanır |

## Slot key konvansiyonu

`{ideaIndex}::{slotRole}` — TS `missionGallerySlotKey`, Python `build_slot_key`.

## Backfill (opsiyonel, v1 sonrası)

Legacy `mission_cost_ledger` + `artifact_cost_ledger` → `cost_events` INSERT … ON CONFLICT DO NOTHING. Rollup refresh script ayrı çalıştırılır.

## Dosya yapısı (v1)

```
apps/web/src/
  lib/platform-admin-auth.ts
  lib/platform-admin-cost-client.ts
  app/api/admin/cost-ledger/[workspaceId]/summary/route.ts
  app/api/admin/cost-ledger/[workspaceId]/missions/[missionId]/production/route.ts
  app/api/admin/cost-ledger/[workspaceId]/missions/[missionId]/slots/route.ts
  app/api/admin/cost-ledger/[workspaceId]/missions/[missionId]/events/route.ts
  components/platform-admin/
    PlatformAdminTabs.tsx
    tabs/OverviewTab.tsx
    tabs/TenantTab.tsx
    tabs/MissionsTab.tsx
    tabs/CostTab.tsx
  app/platform-admin/page.tsx
```

## Başarı kriterleri

1. Operator `/platform-admin` açar; yetkisiz kullanıcı engellenir.
2. Workspace maliyet özeti 30 günlük seri + scope breakdown gösterir.
3. Mission seçildiğinde slot rollup tablosu ve event listesi yüklenir.
4. Yeni üretimler `cost_events` tablosuna düşer; panelde görünür.
5. Müşteri mobile'da API USD detayı görünmez (mevcut davranış korunur).
