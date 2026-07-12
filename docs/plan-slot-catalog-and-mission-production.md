# Slot Catalog & Mission Production — Uygulama Planı

**Tarih:** 2026-07-12  
**Durum:** Planlama (onay sonrası fazlara bölünerek uygulanacak)  
**İlişkili dokümanlar:**
- `docs/replatform/mission-feed-production-orchestrator.md`
- `docs/sprint-plan-multi-tenant-production.md`
- `docs/mission-feed-quality-fix-plan.md`

---

## 1. Özet

Bu plan üç ana problemi ve bir stratejik yönü bir araya getirir:

| # | Konu | Durum |
|---|------|--------|
| A | Ideation + calendar (25+ satır) üretiminin 16 slot’ta takılması | Kısmen düzeltildi (`d45baf1`, `8a00473`); canlıda doğrulama sürüyor |
| B | Artifact list payload şişmesi (`carousel_urls` base64) | **Tamamlandı** (`0004251`) |
| C | Takvim satırlarının ideation listesinde / Feed’de eksik görünmesi | Kısmen düzeltildi (`8a00473` UI + linking) |
| D | **Slot Catalog** — sektör bazlı, dinamik, prompt-sahipli üretim modeli | **Bu planın ana hedefi** |

**Uzun vadeli vizyon:** Sabit 16 manifest slot yerine, sektör katalogundan tenant’a atanan **N slot**; her içerik satırı (ideation + calendar) bir **slot_key** ile eşleşir; slot kendi prompt’una sahiptir, marka sadece değişken enjekte eder.

---

## 2. Mevcut üretim hattı (bugün)

```
content_ideation ──┐
                   ├──► merge (enrich + orphan) ──► FD report ──► plan ──► production_jobs
content_calendar ──┘                                      │
feed_cohesion_review ─────────────────────────────────────┘
                                                          ▼
                                                    drain (slot slot)
                                                          ▼
                                                    Nexus artifact → Feed
```

### 2.1 Kritik kavramlar

| Kavram | Açıklama |
|--------|----------|
| **Haftalık geometri** | Agency 16 (6 post, 3 story, 1 carousel, 6 reel), Starter 12 |
| **Manifest slot** | `ProductionSlotRole` + `ProductionPipeline` (factory execution) |
| **Library slot** | `library_slot_key` (şablon / prompt / layout) |
| **Merged pool** | Unique ideation + `calendar_orphan` satırları (toplama değil: takvim çoğunlukla enrich) |
| **Factory job** | `(mission_id, idea_index, slot_role)` — `production_jobs` tablosu |

### 2.2 Bilinen sorunlar (Yula örneği)

- UI: 9 ideation kartı + 13 takvim kartı ≠ 22 ayrı üretim.
- Factory: 16 job; 9 ready, 7 failed (galeri–caption < 55, fal slotları).
- Takvim “Eksik”: slot failed veya `calendar_plan_index` linking kopuk.
- `9 + 13 = 22` mental modeli yanlış; merge sonrası pool ~16 satır, takvim overlay.

### 2.3 Kısa vadeli düzeltmeler (uygulandı / deploy bekliyor)

| Commit | İçerik |
|--------|--------|
| `d45baf1` | `factory_total < package_total` → delta enqueue |
| `0004251` | Carousel R2 persist + artifact payload slim + list limit 48 |
| `8a00473` | Calendar galeri gevşetme, linking, `requeue_failed`, Mission Hub merged scope |

**Canlı doğrulama:** `scripts/yula-calendar-production-smoke.mjs` — hedef ≥13 ready veya factory complete.

---

## 3. Hedef mimari — Slot Catalog

### 3.1 Tasarım ilkeleri

1. **Mevcut yapıyı kırmadan** — `ProductionSlotRole` / `production_jobs` / `production-loop` köprü ile başla.
2. **slot_key birincil SSOT** — Prompt, pipeline, matcher sinyalleri slot tanımında.
3. **Sektör paketi** — Onboarding’de sector → varsayılan 20 slot enable.
4. **Tenant profili** — Slot ekle/çıkar, priority, plan limiti.
5. **İçerik satırı merkezli** — 25 ideation+calendar satırı → 25 eşleşme (16 tavan değil).
6. **Prompt slot’ta, marka değişkende** — `{{brand_name}}`, `{{content_brief}}`, `{{gallery_url}}` inject.

### 3.2 Katmanlar

```
┌─────────────────────────────────────────────────────────────┐
│  ProductionSlotCatalog (global registry, ~100–200 slot)       │
│  slot_key, sector, format, pipeline, prompt_pack, signals   │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  SectorDefaultBundle (5 sector × 20 slot_key)                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  TenantSlotProfile (onboarding + admin)                       │
│  enabled_slots[], priority, monthly_cap, tier                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  SlotMatcher — content_row → slot_key                         │
│  ideation + calendar merged rows in, assignments out          │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  Factory — production_jobs(content_row_id, slot_key)          │
│  → production-loop renders slot.prompt_pack + brand_context   │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Mevcut kod ile köprü

| Yeni | Mevcut karşılık |
|------|-----------------|
| `slot_key` | `library_slot_key` + yeni catalog key |
| `slot.pipeline` | `ProductionPipeline` |
| `slot.slot_role` | `ProductionSlotRole` (türetilmiş) |
| `SectorDefaultBundle` | `sector-template-vibes.ts` + `BRAND_LIBRARY_SLOT_SPECS` |
| `TenantSlotProfile` | `brand_template_library` + plan tier |
| `SlotMatcher` | `resolveCalendarSlotAssignment` + FD `production_assignments` |
| `prompt_pack` | `fal_design_hint`, `buildCalendarFalSceneHint`, template catalog |

---

## 4. Örnek Slot Catalog — 5 sektör × 20 slot

Toplam **100 slot_key** (global catalog’da tekil). Prefix: `{sector}_{intent}_{format}`.

### 4.1 `beach_club` (20)

`beach_club_sunset_ambiance_post`, `beach_club_cocktail_menu_post`, `beach_club_pool_lifestyle_post`, `beach_club_daybed_offer_post`, `beach_club_dj_night_teaser_post`, `beach_club_guest_social_proof_post`, `beach_club_aerial_venue_post`, `beach_club_summer_opening_post`, `beach_club_live_music_event_post`, `beach_club_private_event_post`, `beach_club_sunset_golden_story`, `beach_club_dj_event_story`, `beach_club_cocktail_promo_story`, `beach_club_pool_party_story`, `beach_club_day_pass_story`, `beach_club_atmosphere_reel`, `beach_club_cocktail_craft_reel`, `beach_club_sunset_timelapse_reel`, `beach_club_event_aftermovie_reel`, `beach_club_guest_moments_carousel`

### 4.2 `restaurant_cafe` (20)

`restaurant_signature_dish_post`, `restaurant_menu_highlight_post`, `restaurant_chef_special_post`, `restaurant_dining_ambiance_post`, `restaurant_reservation_cta_post`, `restaurant_customer_review_post`, `restaurant_seasonal_ingredient_post`, `restaurant_brunch_offer_post`, `restaurant_happy_hour_post`, `restaurant_private_dining_post`, `restaurant_new_menu_story`, `restaurant_kitchen_bts_story`, `restaurant_table_ready_story`, `restaurant_farm_to_table_story`, `restaurant_weekend_booking_story`, `restaurant_chef_plating_reel`, `restaurant_kitchen_process_reel`, `restaurant_dining_experience_reel`, `restaurant_cocktail_bar_reel`, `restaurant_menu_tasting_carousel`

### 4.3 `beauty_wellness` (20)

`beauty_treatment_showcase_post`, `beauty_before_after_post`, `beauty_nail_art_spotlight_post`, `beauty_skincare_routine_post`, `beauty_salon_ambiance_post`, `beauty_stylist_intro_post`, `beauty_bridal_package_post`, `beauty_membership_offer_post`, `beauty_client_testimonial_post`, `beauty_retail_product_post`, `beauty_appointment_reminder_story`, `beauty_new_treatment_story`, `beauty_seasonal_campaign_story`, `beauty_self_care_tip_story`, `beauty_flash_sale_story`, `beauty_transformation_reel`, `beauty_treatment_process_reel`, `beauty_salon_tour_reel`, `beauty_styling_demo_reel`, `beauty_portfolio_gallery_carousel`

### 4.4 `ecommerce_retail` (20)

`retail_product_hero_post`, `retail_new_arrival_post`, `retail_bestseller_spotlight_post`, `retail_outfit_styling_post`, `retail_sale_announcement_post`, `retail_ugc_customer_post`, `retail_limited_drop_post`, `retail_gift_guide_post`, `retail_restock_alert_post`, `retail_brand_story_post`, `retail_flash_sale_story`, `retail_new_collection_story`, `retail_styling_tip_story`, `retail_behind_brand_story`, `retail_customer_review_story`, `retail_product_detail_reel`, `retail_lookbook_reel`, `retail_unboxing_reel`, `retail_warehouse_bts_reel`, `retail_multi_product_carousel`

### 4.5 `fitness_gym` (20)

`fitness_class_schedule_post`, `fitness_trainer_spotlight_post`, `fitness_transformation_post`, `fitness_facility_tour_post`, `fitness_membership_offer_post`, `fitness_nutrition_tip_post`, `fitness_group_class_post`, `fitness_personal_training_post`, `fitness_member_story_post`, `fitness_equipment_highlight_post`, `fitness_class_reminder_story`, `fitness_challenge_launch_story`, `fitness_morning_motivation_story`, `fitness_trial_pass_story`, `fitness_pt_availability_story`, `fitness_workout_highlight_reel`, `fitness_class_energy_reel`, `fitness_trainer_demo_reel`, `fitness_member_testimonial_reel`, `fitness_program_overview_carousel`

### 4.6 Format dağılımı (sektör başına)

| Format | Adet |
|--------|------|
| post | 10 |
| story | 5 |
| reel | 4 |
| carousel | 1 |

**Plan tier örneği:** Starter 15 aktif / Agency 20 aktif / Enterprise 20 + cross-sector slot.

---

## 5. Slot tanım şeması (SSOT)

```typescript
interface ProductionSlotDefinition {
  slot_key: string;
  sector: string;                    // beach_club | restaurant_cafe | ...
  label_tr: string;
  format: 'post' | 'story' | 'reel' | 'carousel';
  pipeline: ProductionPipeline;
  slot_role: ProductionSlotRole;   // factory köprüsü
  tier: 'standard' | 'premium';

  match_signals: {
    announcement_types?: string[];   // event_teaser, product_reveal, ...
    template_use_cases?: string[];
    intents?: ContentIntent[];
    formats?: string[];
    keywords?: string[];             // headline/brief fallback
  };

  prompt_pack: {
    scene_hint_template: string;
    fal_design_hint_template?: string;
    overlay_policy?: string;
    gallery_match_fields: string[];  // content_brief, photo_mood, headline
    min_gallery_score?: number;      // sector override ile
  };

  estimated_cost_usd?: number;
  enabled_by_default: boolean;     // sector bundle’da varsayılan mı
}
```

**Render zamanı:**

```
final_prompt = renderTemplate(slot.prompt_pack, { brand, content_row, sector_profile })
```

Marka prompt’u değiştirmez; `brand_context`, `tenant_learning`, galeri URL’leri inject edilir.

---

## 6. İçerik eşleme — 25 satır senaryosu

### 6.1 Bugün

```
9 UI ideation + 13 UI takvim  →  merge (~16 satır)  →  FD  →  16 factory job
```

### 6.2 Hedef

```
ideation rows (deduped)
+ calendar rows (enrich veya orphan)
= content_rows[] (ör. 25 satır)

foreach row:
  slot_key = SlotMatcher.match(row, tenant_enabled_slots)
  enqueue production_job(mission_id, content_row_id, slot_key)

package_total = matched_rows.length   // 16 tavan değil
```

### 6.3 SlotMatcher öncelik sırası

1. `format` (reel / story / post / carousel)
2. `announcement_type` / `template_use_case`
3. `calendar_enriched` vs `calendar_orphan`
4. Sektör affinity skoru
5. Tenant slot priority
6. Mission içi çeşitlilik (aynı slot_key tekrarını cezalandır)

Eşleşmeyen → `unmatched_content_pool` (Hub’da operatör aksiyonu).

### 6.4 Boşta kalanlar (mevcut + hedef)

| Durum | Davranış |
|-------|----------|
| Takvim → ideation enrich | Ayrı job yok; o satırın slot’u takvim formatına göre |
| Calendar orphan | Kendi `content_row_id` + slot |
| Fazla ideation (dedupe dışı) | Üretilmez |
| Failed / boş factory slot | `completion-pass` + `calendar-slot-backfill` |
| Unmatched row | UI “slot atanamadı” |

---

## 7. Uygulama fazları

### Faz 0 — Stabilizasyon (1 sprint, devam ediyor)

- [x] Delta enqueue (`d45baf1`)
- [x] Carousel payload (`0004251`)
- [x] Calendar gallery / linking / kick requeue (`8a00473`)
- [ ] Render deploy + Yula smoke PASS (≥13 ready veya 16/16)
- [ ] `package_total` telemetry: merged count vs factory_total log

**Dosyalar:** `mission_feed_production_service.py`, `production-loop.ts`, `content-calendar-artifact-link.ts`

---

### Faz 1 — Slot Catalog registry (1 sprint)

**Amaç:** Kodda SSOT; henüz factory key değişmez.

| Görev | Dosya (öneri) |
|-------|----------------|
| `ProductionSlotDefinition` tipi | `apps/web/src/lib/production-slot-catalog.ts` |
| 5×20 slot seed (JSON veya TS) | `apps/web/src/lib/production-slot-catalog.seed.ts` |
| `getSectorDefaultBundle(sector)` | aynı dosya |
| `resolveSlotDefinition(slot_key)` | aynı dosya |
| Unit test: her sektör 20 slot, format mix | `__tests__/production-slot-catalog.test.ts` |
| Calendar matcher’ı catalog’a bağla (pilot) | `calendar-production-pack.ts` |

**Çıkış kriteri:** `beach_club` calendar reel satırı → `beach_club_cocktail_craft_reel` deterministik.

---

### Faz 2 — Tenant Slot Profile (1 sprint)

**Amaç:** Onboarding’de sector bundle ataması.

| Görev | Dosya / sistem |
|-------|----------------|
| DB: `tenant_slot_profiles` (tenant_id, enabled_slot_keys JSON, priority) | `backend/migrations/` |
| Onboarding: sector → default bundle persist | `onboard-*.mjs`, setup wizard |
| `getTenantEnabledSlots(tenantId)` | Python veya Next BFF |
| Plan tier cap: Starter 15, Agency 20 | `package-plan-config.ts` |
| Hub UI: aktif slot sayısı gösterimi | `MissionHub.tsx` |

**Çıkış kriteri:** Yula onboarding sonrası 18 beach_club slot enabled.

---

### Faz 3 — SlotMatcher + content_row model (1–2 sprint)

**Amaç:** 25 satır → 25 eşleşme; 16 cap kalkar (calendar mission).

| Görev | Dosya |
|-------|-------|
| `ContentProductionRow` tipi (ideation/calendar birleşik) | `mission-production-plan.ts` |
| `matchContentRowToSlot(row, enabled_slots)` | `production-slot-matcher.ts` |
| Plan route: matcher çıktısı → queue | `auto-produce/plan/route.ts` |
| `package_total = rows.length` (has_calendar) | `mission_ideation_merge.py` parity |
| FD: öneri rolü (override değil) | `feed_cohesion_review` prompt |

**Çıkış kriteri:** 25 merged row mission → 25 `production_jobs` (veya eşdeğer queue length).

---

### Faz 4 — Factory job key migrasyonu (1 sprint)

**Amaç:** `(idea_index, slot_role)` → `(content_row_id, slot_key)`.

| Görev | Dosya |
|-------|-------|
| `production_jobs` kolon: `content_row_id`, `slot_key` | migration SQL |
| `upsert_jobs` ON CONFLICT güncelle | `production_job_service.py` |
| Drain / backfillSlotKey uyumu | `production_factory_service.py` |
| Artifact metadata: `slot_key`, `content_row_id` | `production-loop.ts` |
| Eski artifact’lar: `idea_index` fallback read | `artifact-utils.ts` |

**Çıkış kriteri:** Yeni mission’larda matcher + factory + artifact tutarlı.

---

### Faz 5 — Prompt pack & admin (1–2 sprint)

| Görev | Açıklama |
|-------|----------|
| `renderSlotPrompt(slot, brand, row)` | Template engine |
| Sektör `min_gallery_score` override | `sector-production-profile.ts` |
| Platform admin: slot enable/disable, prompt versiyon | Admin v2 |
| Maliyet tier: premium slot plan gate | `package-plan-config.ts` |
| Catalog genişletme: 100 → 200 slot | Ops / content |

---

## 8. Test planı

| Senaryo | Beklenti |
|---------|----------|
| Ideation 9 + calendar 13 (Yula) | merged pool ≥13 publishable; takvim kartları link |
| 25 merged row (sentetik) | 25 job enqueue, drain complete |
| beach_club sector bundle | 20 slot tanımlı, 15 Starter cap |
| SlotMatcher announcement_reel | calendar reel → `*_craft_reel` veya sector reel key |
| Galeri zayıf + calendar slot | brand-solid fallback, skip yok |
| Multi-tenant | Tenant A bundle ≠ Tenant B; pilot UUID yok |

**Scriptler:**
- `scripts/yula-calendar-production-smoke.mjs`
- `scripts/e2e-mission-feed-test.mjs`
- Yeni: `scripts/slot-matcher-fixture-test.mjs` (Faz 3)

---

## 9. Riskler ve kararlar

| Risk | Önlem |
|------|--------|
| İki SSOT (slot_role vs slot_key) | Faz 1’de slot_key birincil; slot_role türet |
| 25 fal_reel maliyet patlaması | `tier: premium` + plan limit + batch drain throttle |
| Eski mission artifact kırılması | Dual-read metadata 2 sprint |
| Matcher çakışması | Priority + mission içi slot çeşitlilik skoru |
| 200 slot operasyon yükü | Sektör bundle ile başla; admin Faz 5 |

**Açık karar (onay gerekir):**

1. İlk pilot sektör: `beach_club` only mı, 5 sektör seed birden mi?
2. `package_total` calendar mission’da: `merged_rows` mı, `calendar_plan_count` mı, `max(ikisi)` mi?
3. Factory key migrasyonu (Faz 4) için zorunlu cutover tarihi?

---

## 10. Öncelik sırası (önerilen)

```
Faz 0 (stabilizasyon)  →  Faz 1 (catalog seed)  →  Faz 3 (matcher, 25 row)
        ↓                        ↓
   deploy + smoke            Faz 2 (tenant profile)
                                    ↓
                              Faz 4 (factory migration)
                                    ↓
                              Faz 5 (admin + 200 slot)
```

**İlk milestone (2 hafta):** Faz 0 PASS + Faz 1 catalog + beach_club matcher pilot.  
**İkinci milestone (4 hafta):** Faz 2–3 ile 25 satır mission end-to-end.

---

## 11. Referans — tamamlanan / bekleyen kod

| Alan | Path |
|------|------|
| Merge SSOT | `apps/web/src/lib/mission-production-plan.ts` |
| Factory orchestrator | `backend/app/services/mission_feed_production_service.py` |
| Slot router (bugün) | `apps/web/src/lib/production-pipeline-router.ts` |
| Calendar backfill | `apps/web/src/lib/calendar-slot-backfill.ts` |
| Library slots (7 key) | `apps/web/src/lib/brand-template-library.ts` |
| Sector profile | `apps/web/src/lib/sector-production-profile.ts` |
| Sector vibes | `apps/web/src/lib/sector-template-vibes.ts` |

---

*Bu doküman konuşma özeti + uygulama yol haritasıdır. Faz başlamadan önce “Açık kararlar” (Bölüm 9) netleştirilmelidir.*
