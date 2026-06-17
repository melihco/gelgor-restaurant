# Mission → Feed Kalite Fix Planı

**Tarih:** 2026-06-10  
**Bağlam:** Mission Hub’da çok sayıda kalite kapısı var; Feed çıktıları premium hissettirmiyor.  
**Kök neden:** Planlama, üretim ve Feed exit kriterleri kopuk; mission modunda kapılar bypass; fail → ham galeri sızıntısı.

---

## Hedef metrikler (fix sonrası)

| Metrik | Şimdi (tahmini) | Hedef |
|--------|-----------------|-------|
| `produced` vs `publishReady` gap | 7 vs 2–4 | ≤1 |
| Designed post → ham galeri fallback | ~30–50% fail slotları | 0% Feed’de |
| FD error flag ile üretilen fikir | %100 (mission bypass) | 0% |
| Feed’de manifest dışı artifact | Sınırsız | 7 primary max |
| Heuristic FD sessiz degradasyon | Görünmez | Kırmızı banner |

---

## P0 — Feed’e düşük kalite sızmasını kes (1 sprint)

### P0-1 · `produced` = gerçek yayına hazır sayım

**Sorun:** `auto-produce` response `produced` = DB kaydı sayısı; async render / Grafiker öncesi sayılıyor.  
**Etki:** Hub “7 üretildi” derken Feed’de 3 hazır → operatör güveni çöker.

| Dosya | Değişiklik |
|-------|------------|
| `apps/web/src/app/api/auto-produce/route.ts` (~L4229) | Response’a `produced`, `publishReady`, `rendering`, `withheld` ayrı alanlar. `produced` yerine veya yanında `publishReady` = `isArtifactFeedReady` geçenler. |
| `apps/web/src/lib/mission-production-guard.ts` | `countMissionAutoArtifacts` → `countMissionPublishReadyArtifacts` ekle; `filterFeedPublishableArtifacts` + missionId filtresi kullan. |
| `apps/web/src/lib/mission-production-guard.ts` L51 | `MISSION_REPRODUCE_ARTIFACT_THRESHOLD` kararı `publishReady >= 7` üzerinden. |
| `apps/web/src/app/mobile/_components/screens/MissionHub.tsx` (~L2880) | Auto-kick koşulu: `produced < 7` → `publishReady < 7`. Pipeline strip’te `lastProduceRun` yanında `publishReady` göster. |
| `backend/app/services/task_graph_executor.py` | `_ensure_mission_feed_production` tamamlanma: artifact count değil publish-ready count (Nexus poll veya metadata `grafiker_pass`). |

**Kabul kriteri:** Yaz Sezonu misyonu reproduce sonrası Hub “X yayına hazır / 7 hedef” gösterir; `produced > publishReady` ise “render bekliyor” badge.

---

### P0-2 · Mission modunda FD error + PIS fail → üretme veya `publish_blocked`

**Sorun:** `shouldSkipIdeaForProduction(missionProduction: true)` error flag’leri yok sayar. PIS fail sadece log.

| Dosya | Değişiklik |
|-------|------------|
| `apps/web/src/lib/production-stack.ts` L72–81 | `missionProduction` için error flag → **skip** (veya env `MISSION_RESPECT_FD_ERRORS=true`). |
| `apps/web/src/app/api/auto-produce/route.ts` L2010–2067 | PIS fail + missionId → `continue` (non-mission ile aynı). Metadata: `publish_blocked: true`, `block_reason: 'pis' \| 'feed_director'`. |
| `apps/web/src/lib/weekly-publish-package.ts` `isArtifactFeedPublishable` | `meta.publish_blocked === true` → false. |

**Kabul kriteri:** FD `severity: error` fikir artifact üretmez; Hub checklist’te slot `blocked` görünür.

---

### P0-3 · Designed post Grafiker fail → galeri fallback yok

**Sorun:** Remotion poster Grafiker <8 → `imageUrl = referenceUrl` (ham galeri) kaydedilir; Feed’de designed slot markasız görünür.

| Dosya | Değişiklik |
|-------|------------|
| `apps/web/src/app/api/auto-produce/route.ts` L3072–3081 | Grafiker fail → `designedPosterSyncUrl = null`; artifact `status: withheld` veya üretim `continue` + `error: grafiker_fail`. **Galeri fallback kaldır.** |
| `apps/web/src/app/api/auto-produce/route.ts` L4117–4177 (async post) | Remotion post response’ta `grafiker_pass` kontrol; fail → `markProductionBundleFailed` **galeri attach etmeden**. |
| `apps/web/src/lib/weekly-publish-package.ts` L248–254 | `designed_post` + `status === 'failed'` → `isArtifactFeedDisplayReady` = **false**. |
| `apps/web/src/lib/mission-slot-checklist.ts` | `designed_post` slot: `grafiker_pass === false` → `withheld`, not `ready`. |

**Kabul kriteri:** Tasarım postu slotu Feed’de yalnızca branded poster URL ile görünür; ham galeri asla `production_role: designed_post` ile publishable olmaz.

---

### P0-4 · Failed bundle’a galeri still attach etme (motion / designed)

**Sorun:** `markProductionBundleFailed` bilerek galeri still ekler (“Feed preview is not broken”).

| Dosya | Değişiklik |
|-------|------------|
| `apps/web/src/app/api/auto-produce/route.ts` `markProductionBundleFailed` (~L1365) | `opts.pipeline` / `slot_role` parametresi ekle. `remotion_story`, `remotion_poster`, `designed_post` → **attach yok**; yalnızca `status: failed` + `error`. |
| `apps/web/src/lib/weekly-publish-package.ts` L153–157 | Failed bundle: `missionProduction` + motion/designed pipeline → publishable false (gallery exception kaldır). |

**Kabul kriteri:** Remotion 400 sonrası Feed’de story için video yoksa kart görünmez (veya “üretim başarısız” operatör-only).

---

### P0-5 · Feed filtresi: misyon başına 7 primary slot

**Sorun:** `filterFeedPublishableArtifacts` tüm publishable artifact’ları gösterir; haftalık paket disiplini yok.

| Dosya | Değişiklik |
|-------|------------|
| `apps/web/src/lib/weekly-publish-package.ts` | Yeni: `filterMissionPrimaryFeedArtifacts(artifacts, missionId)` — `production_role` / `publish_channel` manifest slotlarına map; slot başına en iyi 1 artifact (`grafiker_pass`, `bundle_status: ready` öncelik). |
| `apps/web/src/app/mobile/_components/screens/PlatformFeed.tsx` (~L1769) | Mission filter aktifken `filterMissionPrimaryFeedArtifacts` kullan. |
| `apps/web/src/lib/mission-pipeline-transparency.ts` | `publishReady` sayımı primary filter ile uyumlu. |

**Kabul kriteri:** Mission filtresiyle Feed max 7 kart; duplicate headline/format collapse.

---

## P1 — Planlama ↔ üretim hizala (1 sprint)

### P1-1 · Strategist ideation count = 7 (tek kaynak)

**Sorun:** `strategist_prompts.py` örnek `count: 5`; manifest `total: 7`; seasonal graph `count: 7`.

| Dosya | Değişiklik |
|-------|------------|
| `backend/app/crew/prompts/strategist_prompts.py` L189 | `"count": 7` + manifest slot açıklaması. |
| `backend/app/services/task_recommendation_service.py` L278 | `count: 7`. |
| `packages/contracts` / seed | Dokümantasyon uyumu. |

**Etki:** Boş slot / heuristic backfill azalır.

---

### P1-2 · `reproduce-feed` visual_design_cards gate

**Sorun:** Python executor kartlar bitene kadar bekler; Hub manuel kick beklemez.

| Dosya | Değişiklik |
|-------|------------|
| `apps/web/src/app/api/missions/.../reproduce-feed/route.ts` L108 sonrası | `visualDesignNodesPending()` — Python `task_graph_executor._visual_design_nodes_pending` ile aynı mantık (shared TS helper veya crew progress check). |
| `apps/web/src/lib/mission-production-plan.ts` | `visualDesignNodesPending(nodes)` export. |

**Kabul kriteri:** Kartlar tamamlanmadan reproduce 409 `awaiting_visual_design_cards`.

---

### P1-3 · Hub production package → auto-produce payload

**Sorun:** Package yalnızca propose prompt’a gider; Python fire-and-forget path FD echo etmezse manifest type kaybolur.

| Dosya | Değişiklik |
|-------|------------|
| `apps/web/src/app/api/missions/.../reproduce-feed/route.ts` | Body veya header: `productionPackage` from client; payload’a `productionPackage` + `manifestMissionType`. |
| `backend/app/services/task_graph_executor.py` `_trigger_auto_produce` (~L2159) | `production_package` yoksa tenant brand_theme veya mission metadata’dan oku. |
| `apps/web/src/app/mobile/_components/screens/MissionHub.tsx` reproduce çağrısı | `getMissionProductionPackage(tenantId)` forward et. |

---

### P1-4 · auto-produce loop = manifest slot sayısı (7), not all ideas

**Sorun:** Loop `toProcess.length` (24’e kadar); budget `remaining` ile kısılıyor ama manifest disiplini yok.

| Dosya | Değişiklik |
|-------|------------|
| `apps/web/src/app/api/auto-produce/route.ts` (~L1761, ~L1928) | `toProcess` = FD `production_assignments` ile sıralı **7 slot**; ideas index map. Fazla fikirler üretilmez. |
| `apps/web/src/lib/production-pipeline-router.ts` | `buildManifestOrderedIdeas(assignments, ideas)` helper. |

---

### P1-5 · İdeasyon + calendar → assignment backfill

**Sorun:** 5 fikir + 5 calendar satırı manifest 7 slotu doldurmuyor.

| Dosya | Değişiklik |
|-------|------------|
| `apps/web/src/lib/mission-production-plan.ts` | `buildMissionProductionIdeas` — calendar satırlarından eksik slot role doldur. |
| `backend/app/services/mission_ideation_merge.py` | 7-piece merge parity TS ile. |

---

## P2 — Premium profil ayrımı (1–2 sprint)

### P2-1 · `production_profile` resolver

| Profil | Remotion story | Grafiker retry | FD fallback | GPT enhance |
|--------|----------------|----------------|-------------|-------------|
| `economy` (Starter, GIS<70) | 2 + 1 still | 0 | Block heuristic | Skip aggressive |
| `agency` (Growth, GIS≥70) | 3 | 1 | Warn + heuristic | Policy default |
| `premium` (Performance+) | 3 + reel | 2 | **Block** heuristic | Full when needed |

| Dosya | Değişiklik |
|-------|------------|
| Yeni: `apps/web/src/lib/production-profile.ts` | `resolveProductionProfile(packageSlug, gisScore, brandTheme)` |
| `apps/web/src/app/api/auto-produce/route.ts` | Profile → `maxRunwayReels`, `GRAFIKER_MAX_RETRIES`, enhance policy |
| `apps/web/src/lib/remotion-quality.ts` | Retry cap profile-aware export |
| `backend/app/crew/crews/feed_art_director_crew.py` | `_fallback_report` → profile=premium ise raise / block auto-produce |

---

### P2-2 · FD `_fallback: true` Hub banner

| Dosya | Değişiklik |
|-------|------------|
| `apps/web/src/lib/mission-pipeline-transparency.ts` | FD report parse: `_fallback` / `art_director_verdict` |
| `apps/web/src/app/mobile/_components/screens/MissionHub.tsx` | Kırmızı banner: “Feed Art Director kullanılamadı — heuristik routing” |

---

### P2-3 · Paket reel kotası ↔ manifest reel slotu

| Dosya | Değişiklik |
|-------|------------|
| `apps/web/src/lib/mission-production-manifest.ts` | `buildManifestForPackage(slug)` — Starter: reel slot → `organic_story_still` veya kaldır. |
| `apps/web/src/app/api/auto-produce/route.ts` | `reelRemotionFallback` Starter’da story motion değil still. |

---

## P3 — Tutarlılık & gözlemlenebilirlik

### P3-1 · Tenant learning fail görünürlük

| Dosya | Değişiklik |
|-------|------------|
| `apps/web/src/lib/production-context.ts` `fetchTenantLearningBrief` | `null` vs empty ayrımı; warn metadata |
| Mission Hub / auto-produce metadata | `tenant_learning_applied: boolean` |

### P3-2 · Calendar → Feed schedule metadata

| Dosya | Değişiklik |
|-------|------------|
| `apps/web/src/app/api/auto-produce/route.ts` | `calendarPlans` payload’dan `scheduled_publish_at` metadata |
| `PlatformFeed.tsx` | Kartta yayın günü badge |

### P3-3 · Ölü kod temizliği

| Dosya | Değişiklik |
|-------|------------|
| `backend/app/services/task_graph_executor.py` `_trigger_feed_art_director` | Kaldır veya inline path ile birleştir |
| `feed_cohesion_review` graph node | Dokümante: “görünürlük only”; FD inline |

---

## Uygulama sırası (önerilen)

```
Hafta 1: P0-3, P0-4, P0-1 (Feed sızıntısı durur)
Hafta 2: P0-2, P0-5, P1-2 (kapılar + 7 slot disiplini)
Hafta 3: P1-1, P1-3, P1-4 (planlama hizası)
Hafta 4: P2-1, P2-2 (premium profil)
```

---

## Test planı

1. **Fixture misyon** (mevcut Yaz Sezonu UUID) reproduce öncesi/sonrası: `produced`, `publishReady`, slot checklist.
2. **Grafiker fail inject** — designed post mock score 6 → Feed’de görünmemeli.
3. **FD error flag inject** — fikir üretilmemeli (P0-2 sonrası).
4. **reproduce-feed 409** — visual_design_cards pending.
5. **Starter tenant** — reel slot Feed’de video veya explicit withheld; ham galeri reel yok.
6. **E2E:** `scripts/e2e-mission-feed-test-pure.mjs` genişlet — `publishReady >= 5` assertion.

---

## Risk notları

| Fix | Risk | Mitigasyon |
|-----|------|------------|
| P0-3 designed withhold | Daha az Feed kartı | Retry + operatör “force gallery” flag |
| P0-2 FD strict | Bazı misyonlar 0 üretim | Hub’da “blocked ideas” listesi + manual override |
| P0-5 7 cap | Eski duplicate artifact gizlenir | `?show_all=1` debug modu |
| P1-4 slot-only loop | Regression çeşitlilik | FD assignments integration test |

---

## İlgili dosyalar (hızlı indeks)

| Alan | Dosya |
|------|-------|
| Üretim motoru | `apps/web/src/app/api/auto-produce/route.ts` |
| Feed kapıları | `apps/web/src/lib/weekly-publish-package.ts` |
| Mission bypass | `apps/web/src/lib/production-stack.ts` |
| reproduce | `apps/web/src/app/api/missions/.../reproduce-feed/route.ts` |
| Executor | `backend/app/services/task_graph_executor.py` |
| Manifest | `apps/web/src/lib/mission-production-manifest.ts` |
| Şeffaflık | `apps/web/src/lib/mission-pipeline-transparency.ts` |
| Hub UI | `apps/web/src/app/mobile/_components/screens/MissionHub.tsx` |
| Feed UI | `apps/web/src/app/mobile/_components/screens/PlatformFeed.tsx` |
| Grafiker | `apps/web/src/lib/remotion-quality.ts`, `apps/web/src/app/api/remotion/render/route.ts` |
| Enhance policy | `apps/web/src/lib/gpt-enhance-policy.ts` |
