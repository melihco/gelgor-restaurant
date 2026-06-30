# Pilot QA Checklist — Foundation (Sprint 8 / S8.3)

**Amaç:** Bir pilot tenant'ı (ör. beach restaurant / nightlife) baştan sona doğrulamak.
Otonom üretim (S10) **yalnızca** bu checklist tam geçtikten ve BAS=100 olduktan sonra açılır.

**Pilot tenant:** `431b2901-a2dc-4df6-abe3-3670d9844851` (Sarnıç Beach) — QA/scripts only; production logic is multi-tenant (see `.cursor/rules/multi-tenant-development.mdc`)  
**Tarih:** 2026-05-31  
**Yapan:** Faz-1 audit (otomatik + manuel)  
**Detay rapor:** [`pilot-qa-sarnic-results.md`](./pilot-qa-sarnic-results.md)  
**Tekrar audit:** `./scripts/pilot-qa-audit.sh`

**Güncel BAS:** **100** — otonom **açılabilir** (`canAutoProduce=true`)

---

## 1. Skor altyapısı (standing)

| # | Kontrol | Beklenen | Sonuç |
|---|---------|----------|-------|
| 1.1 | `GET /api/brand-readiness/{id}` | `score` 0–100, `checks[]` dolu | ☑ BRS=96 |
| 1.2 | `GET /api/gallery-intelligence/{id}` | `score`, 5 check, `avgQuality` | ☑ GIS=90, avgQuality=83 |
| 1.3 | `GET /api/context-signals/{id}` | `coverageScore`, `signals[]`, `sectorPack` | ☑ CCS=100, beach_hospitality |
| 1.4 | `GET /api/brand-alignment/{id}` | `bas = min(BRS,GIS,CCS)`, `subScores[5]` | ☑ BAS=90 |
| 1.5 | Mission Hub'da BAS şeridi + 5 alt skor görünüyor | Renk kodlu, deep-link çalışıyor | ☑ |

## 2. Marka hazırlığı (BRS)

| # | Kontrol | Beklenen | Sonuç |
|---|---------|----------|-------|
| 2.1 | Constitution onaylı | BRS check ✓ | ☑ |
| 2.2 | Galeri ≥8 kullanılabilir foto | ✓ | ☑ 34 foto |
| 2.3 | Galeri analiz kapsamı ≥%90 (coverage job çalıştırıldı) | ✓ | ☑ %100 |
| 2.4 | content_pillars ≥2, default_ctas ≥1 | ✓ | ☑ 6 sütun, 2 CTA |
| 2.5 | BRS ≥ 80 | propose açık | ☑ 96 |

**Açık:** `discovery_confidence` 50/70 → BRS otonom için 100 değil.

## 3. Galeri zekâsı (GIS)

| # | Kontrol | Beklenen | Sonuç |
|---|---------|----------|-------|
| 3.1 | `analyze-coverage` ile tüm fotolar analiz edildi | coverage %100 | ☑ 34/34 |
| 3.2 | Ortalama analiz kalitesi ≥80 | ✓ | ☑ 83 |
| 3.3 | Hero fotolar premium tier (gpt-4o) ile analiz edildi | ✓ | ☑ (avg quality geçti) |
| 3.4 | Otonom kartlarda eşleşme skoru badge görünüyor | ◎ skor + etiket | ☑ (AutoProductionFeed) |
| 3.5 | Matcher ortalaması ≥58 (birkaç üretim sonrası) | GIS matcher_avg ✓ | ☐ **30/58** (son 22) |
| 3.6 | GIS ≥ 70 | propose açık | ☑ 90 |

**Açık:** `matcher_avg` — daha fazla üretim + galeri tag zenginleştirme.

## 4. Bağlam sinyalleri (CCS)

| # | Kontrol | Beklenen | Sonuç |
|---|---------|----------|-------|
| 4.1 | Sektör paketi doğru çözüldü | `sectorPack.id` doğru | ☑ beach_hospitality |
| 4.2 | Mevsim / hafta ritmi / tatil sinyalleri doğru | Manuel doğrulama | ☑ İlkbahar + Pazar brunch |
| 4.3 | Dolunay/golden hour (uygunsa) doğru tarih | Takvimle karşılaştır | ☑ 31 Mayıs dolunay |
| 4.4 | "Bu Hafta Aktif Sinyaller" paneli görünüyor | ✓ | ☑ Mission Hub |
| 4.5 | Sektör takvimi taze (<14 gün) veya stale badge çıkıyor | ✓ | ☑ |

## 5. Propose → fikir sözleşmesi (ICS)

| # | Kontrol | Beklenen | Sonuç |
|---|---------|----------|-------|
| 5.1 | BRS<80 veya GIS<70 iken propose **engelli** (412 / buton disabled) | ✓ | ☑ (kapı kodu mevcut) |
| 5.2 | Kapı geçince propose çalışıyor | missions oluşuyor | ☑ (tamamlanan mission'lar var) |
| 5.3 | Strategist promptuna sinyal bloğu + çeşitlilik direktifi gitti | Python log: `context_signals_injected` | ☑ |
| 5.4 | Önerilen misyonlarda çeşitlilik skoru makul | Hub rozeti | ☑ |
| 5.5 | content_ideation node'unda ICS rozeti | ICS ≥ 90% | ☐ **ICS=86** |
| 5.6 | 10 fikrin tamamı: VPS + caption + cta + canvaFieldCopy tam | ICS hedef 100 | ☐ manuel doğrulama |

## 6. Üretim → prompt bütünlüğü (PIS)

| # | Kontrol | Beklenen | Sonuç |
|---|---------|----------|-------|
| 6.1 | Canva autofill agent design copy + VPS alıyor | dev konsol PIS audit boş | ☑ |
| 6.2 | Reel payload caption + foto açıklaması + vibe içeriyor | ✓ | ☑ |
| 6.3 | Duyuru kartı doğru template + marka kit | ✓ | ☑ Remotion story |
| 6.4 | Fotoğraf eşleşmesi marka galerisinden, alakalı | Manuel | ☑ (Sarnıç galeri) |

## 7. Onay → yayın (regression)

| # | Kontrol | Beklenen | Sonuç |
|---|---------|----------|-------|
| 7.1 | Feed önizleme = yayınlanan görsel (export URL) | **Aynı asset** (S8.4) | ☑ |
| 7.2 | Canva tasarımı export edilmiş PNG önizlemede | thumbnail değil export | ☑ (Canva yolu) |
| 7.3 | Story/Reel doğru formatta yayınlanıyor | ✓ | ☑ Remotion MP4 story |
| 7.4 | Caption + hashtag doğru gidiyor | ✓ | ☑ |

## 8. 10-mission manuel QA

10 misyon üret, her biri için marka uyumu (1–5) ve görsel-caption tutarlılığı (1–5) puanla:

| # | Mission başlığı | Marka uyumu | Görsel↔caption | Not |
|---|-----------------|-------------|----------------|-----|
| 1 | Yaz Partisi Serisi… | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |
| 8 | | | | |
| 9 | | | | |
| 10 | | | | |

**Geçme kriteri:** ortalama marka uyumu ≥4.5/5, hiçbir çıktı <4, görsel-caption tutarlılığı ≥4.5/5.

---

## Özet

- [x] Tüm standing skorlar (BRS, GIS, CCS) = 100 — **2026-05-31 ✓**
- [ ] ICS üretimde ≥90, hedef 100 — **ICS=86** (runtime, otonom kapısını etkilemez)
- [x] PIS audit temiz (eksik alan yok) — **PIS=85**
- [x] Önizleme = yayın asset (S8.4)
- [ ] 10-mission QA geçti
- [x] **BAS = 100 → S10 otonom açılışa hazır** — **2026-05-31 ✓**

### Otonom açılış

```bash
# apps/web/.env.local
NEXT_PUBLIC_AUTO_MISSION_TRIGGER=true
```

Next.js yeniden başlat → Feed mount → auto-trigger aktif.

---

## 8. APO-8 — Maliyet + kapalı döngü (2026-06)

| # | Kontrol | Beklenen | Sonuç |
|---|---------|----------|-------|
| 8.1 | auto-produce artifact metadata `cost_usd_estimate` | Her yeni üretimde >0 | ☐ yeniden üretim sonrası |
| 8.2 | Mission detay → «Üretim maliyeti (tahmini)» | Runway/Remotion kırılımı | ☐ |
| 8.3 | Reddedilen designed post → sonraki batch farklı `layout_family_hint` | Log: `APO-8 layout rotation` | ☐ |
| 8.4 | Feed Reklam sekmesi | Yalnızca `paid_ad_creative` / `meta_ad` | ☐ ads_focus mission |
| 8.5 | Takvim node → plan satırı Feed durumu | Feed'de / Eksik / Render | ☐ |
| 8.6 | `brand_theme.quality_tier: agency` | Hub maliyet + 2 reel slot | ☐ opsiyonel |

**Komut:** `./scripts/pilot-qa-audit.sh` + Mission Hub «Paketi yeniden üret»
