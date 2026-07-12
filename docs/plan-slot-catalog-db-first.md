# Slot Catalog — DB-First Uygulama Planı (Revize)

**Tarih:** 2026-07-12  
**Durum:** Faz 1 — tablolar + seed + read API (üretim hattı **dışarıda**)

---

## 1. Doğrulama — mevcut feed ↔ şablon kütüphanesi

Bugünkü çalışan omurga (deploy sonrası matcher fix ile):

```
Mission satırı (ideation / calendar)
  → production_jobs (slot_role, library_slot_key)
  → auto-produce / Fal pipeline
  → bindBrandTemplateForFalProduction()
  → brand_design_templates (onboarding Fal seti: Kampanya, Resmi Duyuru, Marka Kimliği…)
  → artifact (metadata: brand_design_template_type)
  → Feed
```

| Katman | SSOT | Rol |
|--------|------|-----|
| **Fal şablon galerisi (UI)** | `brand_design_templates` | Markanın kilitli layout önizlemesi + `design_spec.prompt` |
| **10 template_type** | `brand-design-template-presets.ts` | Onboarding'de üretilen tipler |
| **7 library_slot_key** | `BRAND_LIBRARY_SLOT_SPECS` | Remotion/story routing (köprü) |
| **Factory slot_role** | `mission-production-manifest.ts` | Pipeline execution (galeri / fal / reel) |

**Sonuç:** Feed'deki tasarımlı çıktılar, matcher eşleştiğinde onboarding Fal şablonunun **aynı layout'u + mission foto/metin** varyantıdır. Üretim hattına dokunmadan önce bu köprü matcher fix ile güçlendirildi; yeni slot catalog üretime **Faz 5**'te bağlanacak.

---

## 2. Hedef mimari (3 katman)

```
┌─────────────────────────────────────────────────────────────┐
│  KATMAN A — Global catalog (DB)                              │
│  canonical_sectors + production_slot_definitions (100 slot)  │
│  Operatör: şirket panelinden sektör/slot tanımı              │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  KATMAN B — Tenant atama (DB)                                │
│  tenant_slot_assignments (auto_default | operator | onboard) │
│  Marka vibe → brand_design_templates (Fal, marka bazlı)      │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  KATMAN C — Üretim (mevcut, Faz 5)                           │
│  SlotMatcher → production_jobs.slot_key → matcher → Feed     │
└─────────────────────────────────────────────────────────────┘
```

**İlke:** Her markanın tasarım standardı **marka vibe + galeri + logo** ile `brand_design_templates`'te üretilir; slot catalog **hangi ihtiyaç tipi** (kampanya, mekan vitrini, etkinlik…) için hangi şablon ailesinin kullanılacağını tanımlar (`design_template_type` köprüsü).

---

## 3. Sektör SSOT

| Kaynak | Kullanım |
|--------|----------|
| **Runtime resolver** | `canonical-sector.ts` → `normalizeSectorId()` (`sector-production-profile.ts`) |
| **Tenant persist** | `brand_contexts.brand_service_profile.category` (authoritative) |
| **Nexus mirror** | `CompanyProfiles.Industry` |
| **DB catalog** | `canonical_sectors.sector_id` — **aynı slug namespace** |

`canonical_sectors.sector_id` = `getSectorProfile().sectorId`. Alias'lar JSONB'de; resolver kodu ile senkron tutulur.

**Tutarsızlık önleme:** Slot seed, tenant bootstrap ve admin UI yalnızca `canonical_sectors` + `normalizeSectorId()` kullanır; ham `business_type` string'ine güvenilmez.

---

## 4. Veritabanı tabloları

### 4.1 `canonical_sectors`

| Kolon | Açıklama |
|-------|----------|
| `sector_id` | PK — `beach_club`, `restaurant_cafe`, … |
| `label_tr`, `label_en` | UI |
| `aliases` | JSONB — `normalizeSectorId` alias listesi |
| `is_active` | Operatör kapat/aç |
| `sort_order` | Panel sırası |

### 4.2 `production_slot_definitions`

| Kolon | Açıklama |
|-------|----------|
| `slot_key` | PK — `beach_club_dj_night_teaser_post` |
| `sector_id` | FK → `canonical_sectors` |
| `label_tr`, `label_en` | UI başlık |
| `format` | post \| story \| reel \| carousel |
| `pipeline` | `fal_design`, `fal_reel`, `gallery_photo`, … |
| `slot_role` | Factory köprüsü (`fal_designed_post`, …) |
| `design_template_type` | Fal galeri köprüsü (`campaign_announcement`, …) |
| `library_slot_key` | 7-key köprü (`event_story`, `campaign_post`, …) |
| `tier` | standard \| premium |
| `match_signals` | JSONB — announcement_type, keywords, intents |
| `prompt_pack` | JSONB — scene_hint_template (Faz 2+) |
| `enabled_by_default` | Sektör onboarding varsayılanı |
| `sort_order`, `status` | active \| archived |

### 4.3 `tenant_slot_assignments`

| Kolon | Açıklama |
|-------|----------|
| `workspace_id` | Marka (tenant UUID) |
| `slot_key` | FK → `production_slot_definitions` |
| `enabled` | Aktif/pasif |
| `priority` | Eşleme önceliği |
| `assignment_source` | `auto_default` \| `operator` \| `onboarding` |
| `notes` | Operatör notu |

UNIQUE `(workspace_id, slot_key)`.

---

## 5. Seed — 5 sektör × 20 slot

| Sektör | `sector_id` | Slot sayısı |
|--------|-------------|-------------|
| Beach club | `beach_club` | 20 |
| Restoran / kafe | `restaurant_cafe` | 20 |
| Güzellik / wellness | `beauty_wellness` | 20 |
| E-ticaret / perakende | `ecommerce_retail` | 20 |
| Fitness / gym | `fitness_gym` | 20 |

**Toplam:** 100 `production_slot_definitions`  
**Format mix (sektör başına):** 10 post · 5 story · 4 reel · 1 carousel

Seed: `backend/scripts/seed_production_slot_catalog.py`  
Migration: `backend/migrations/0037_production_slot_catalog.sql`

---

## 6. Uygulama fazları (revize öncelik)

### Faz 1 — DB + read API ✅ (bu sprint)

- [x] Migration tabloları
- [x] Python models + `slot_catalog_service`
- [x] API: sectors, slots, tenant assignments (read)
- [x] Seed 100 slot
- [x] TS types + BFF proxy (`production-slot-catalog.ts`)
- [ ] Migration'ı dev Postgres'e uygula + seed çalıştır

**Çıkış:** `GET /api/v1/slot-catalog/sectors/beach_club/slots` → 20 satır.

### Faz 2 — Operatör paneli (şirket paneli) ✅

- [x] Platform admin: **Slot Kataloğu** sekmesi
- [x] Sektör → slot listesi + enable/disable
- [x] `PUT` bulk assignment API + BFF
- [x] Tenant bootstrap butonu (`Sektör varsayılanlarını ata`)
- [ ] Render/staging migration + seed deploy

### Faz 3 — Onboarding entegrasyonu ✅

- [x] `bootstrap_tenant_slot_assignments` (generate-design-templates + catalog resolver)
- [x] Fal şablon üretimi: enabled catalog slot → `catalog-design-template-presets.ts`
- [x] `catalog_slot_key` persist (Python schema + bulk upsert + engine output)
- [x] Matcher `catalog_slot_key` öncelik bonusu (Faz 5'te production'dan beslenecek)
- [x] Unit test: `catalog-design-template-presets.test.ts`
- [ ] Yula smoke: regenerate onboarding templates + catalog metadata doğrula

**Çıkış:** Yeni marka onboarding sonrası sektör slot'ları bootstrap + catalog-driven Fal galeri (max 12 preview).

### Faz 4 — Şablon kütüphanesi UI ✅

- [x] `catalog-design-template-gallery.ts` — slot ↔ template eşleme (`catalog_slot_key` + type fallback)
- [x] `BrandFalTemplateGalleryPanel` — katalog başlıkları, önizleme grid, kapsama özeti
- [x] Desktop: BrandHub → Şablonlar sekmesi fal.ai galeri
- [x] Unit test: `catalog-design-template-gallery.test.ts`
- [ ] Yula UI smoke: slot başlıkları + thumbnail eşleşmesi doğrula

**Çıkış:** Şablon Kütüphanesi fal.ai sekmesi DB slot `label_tr` ile hizalı; her kart `catalog_slot_key` köprüsü.

### Faz 5 — Üretim hattı (en son)

- `production_jobs.slot_key` kolonu
- SlotMatcher: content_row → `slot_key` → `design_template_type`
- 16 cap kaldırma (content-scoped mission)
- Mevcut matcher köprüsü korunur (dual-read)

**Çıkış:** Mission üretimi catalog-driven; feed çıktısı marka Fal standardında.

---

## 7. Fal şablon çeşitlendirme modeli

```
production_slot_definitions.design_template_type
        ↓ (tenant enabled slots için unique set)
brand-design-template-presets (genişletilebilir)
        ↓ onboarding generate-design-templates
brand_design_templates (marka vibe + galeri + logo)
        ↓ production matcher (mevcut)
Feed artifact
```

- **Slot catalog** = “hangi içerik ihtiyaçları var” (100 başlık)
- **Fal template** = “markanın o ihtiyaç için kilitli görsel standardı”
- **Vibe** = `brand_theme`, `brand_vibe_profile`, `visual_dna` — prompt inject, slot'ta değil markada

---

## 8. Bilinçli olarak ertelenenler

| Konu | Neden |
|------|--------|
| Üretim hattı slot_key | Önce DB + atama + Fal çeşitlendirme oturmalı |
| 200 slot / 10 sektör | 100 slot pilot yeterli |
| `sectors` ayrı Nexus tablosu | Python `canonical_sectors` yeterli; Industry sync mevcut |
| Prompt_pack versiyonlama | Faz 2+ |

---

## 9. İlgili dosyalar

| Aşama | Path |
|-------|------|
| Migration | `backend/migrations/0037_production_slot_catalog.sql` |
| Seed | `backend/scripts/seed_production_slot_catalog.py` |
| Service | `backend/app/services/slot_catalog_service.py` |
| API | `backend/app/api/v1/slot_catalog.py` |
| TS client | `apps/web/src/lib/production-slot-catalog.ts` |
| BFF | `apps/web/src/app/api/brand-context/[workspaceId]/slot-catalog/route.ts` |
| Sector SSOT | `apps/web/src/lib/sector-production-profile.ts`, `canonical-sector.ts` |
| Fal templates | `brand_design_templates`, `brand-design-template-presets.ts`, `catalog-design-template-presets.ts` |
| Eski plan | `docs/plan-slot-catalog-and-mission-production.md` |

---

*Üretim hattı değişikliği bu dokümandaki Faz 5'e kadar yapılmaz. Önce tablolar, seed, operatör atama ve Fal çeşitlendirme.*
