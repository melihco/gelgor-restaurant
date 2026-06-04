# Çıktı Kalitesi — Kritik & Eksik İşler
## Vizyon filtresi: Autonomous Brand Creative OS

**Amaç:** Büyük refactor değil — **çıktı kalitesine doğrudan fayda** + **vizyonla uyumlu** işlerin öncelik listesi.  
**Vizyon özeti:** Marka galerisi + şablonlar + mission intent → **tutarlı birincil çıktı** → insan onayı → öğrenme.

---

## Vizyon uyum filtresi

Bir iş listeye girecekse en az **2/4** kriteri karşılamalı:

| Kriter | Soru |
|--------|------|
| **V1 Marka tutarlılığı** | Gerçek galeri / Remotion+announcement / brand kit kullanımını iyileştirir mi? |
| **V2 Otonom güven** | Kullanıcı “hangi çıktı gerçek?” sorusunu sormadan onaylayabilir mi? |
| **V3 Karar katmanı** | Agent brief → doğru renderer/copy yoluna bağlanır mı? |
| **V4 Kapalı döngü** | Onay/red sonraki üretime geri beslenir mi? |

**Çıktı kalitesi boyutları:** görsel · metin · tutarlılık · güven · motion (reel)

---

## Tier A — KRİTİK (yapılmazsa kalite + vizyon zarar görür)

| ID | İş | Kalite etkisi | Vizyon | Efor | Modül |
|----|-----|---------------|--------|------|-------|
| **A1** | **auto-trigger propose JSON fix** — `missions[0].id` ile approve | Otonom pipeline çoğu zaman hiç çalışmıyor → Feed boş / düşük kalite | V2 | ~2s | M01 |
| **A2** | **Publish = export URL gate** — Canva edit/thumbnail ile IG publish engeli | Yanlış veya kırık görsel yayınlanır | V2 | ~0.5g | M10/M11 |
| **A3** | **Feed önizleme = publish URL** — `resolveArtifactImg` → `canvaDownloadUrl` / `permanentPreviewUrl` dahil | Onaylanan ≠ görünen | V2 | ~0.5g | M10 |
| **A4** | **Birincil çıktı netliği (Bundle v0 min)** — aynı fikir → 1 Feed kartı, Canva export primary | Çift kart, kalite lotaryası | V2, V1 | ~3g | M09 |
| **A5** | **Canva autofill öncesi copy trim** — agent `canvaFieldCopy` parse + `artifactIdeaToRecord` taşıması | Şablonda kırpılmış/bozuk metin | V1, V3 | ~1g | M02/M06 |
| **A6** | **Reel Feed = video önizleme** — mp4 / `canvaExportFormat` | Reel “post gibi” görünür, güven düşer | V2 | ~0.5g | M10 |

---

## Tier B — YÜKSEK (doğrudan çıktı kalitesi ↑)

| ID | İş | Kalite etkisi | Vizyon | Efor | Modül |
|----|-----|---------------|--------|------|-------|
| **B1** | **Primary renderer kuralı (hardcode v0)** — story/reel → Canva export varsa primary; yoksa announcement | Otonomda canvas+foto+Canva gürültüsü azalır | V1, V3 | ~1g | M05 |
| **B2** | **auto-produce ↔ otonom feed aynı foto + aynı Canva sinyali** — `canva-mission-signal` server’da da | Aynı fikir farklı görsel | V2, V3 | ~1.5g | M03/M05 |
| **B3** | **Galeri eşleşme görünürlüğü** — düşük skor uyarısı / “daha iyi foto yok” | Yanlış foto = kalite düşüşü | V1 | ~0.5g | M04 |
| **B4** | **Field-limits UI (Gelişmiş brief)** — Canva alan sayaçları | Tasarım metni taşması | V1 | ~1g | M08 |
| **B5** | **Marka kiti / announcement önceliği** — otonom story’de canvas yerine announcement fallback | Düşük kalite canvas azaltılır | V1 | ~1g | M07 |
| **B6** | **Runway beklenti yönetimi** — reel brief “motion” değilse Canva; Runway manuel | Yanlış motion beklentisi | V2 | ~0.5g | M07 |
| **B7** | **Canva 429 kuyruk v0** — otonom burst’te export fail → düşük kalite thumb | Eksik/bozuk Canva çıktı | V1 | ~1g | M06 |
| **B8** | **`visual_production_spec` parse doğrulama** — boş VPS oranı log + Hub uyarı | AI foto seçimi çalışmaz | V1, V3 | ~1g | M02 |

---

## APO Sprint eşlemesi (2026-06)

Konuşma çıkarımları → `docs/sprint-plan-agency-orchestrator.md` (8×2 hafta).

**Durum:** APO-1 ✅ APO-2 ✅ → **sıradaki APO-3 W2** (Canva **iptal** — Remotion/announcement only). Pilot: Bodrum 3/4, Kaçta 3/5 (2026-06-02).

### Canva iptal — backlog yeniden eşleme

| Eski ID | Yeni karşılık | Durum |
|---------|---------------|--------|
| A2 Canva publish gate | A2 **export URL gate** — Remotion PNG / MP4 veya galeri URL | APO-5 |
| A3 canvaDownloadUrl önizleme | `contentUrl` + `/api/media` + bundle `poster_url` | APO-5 |
| A4 Canva primary bundle | Tek kart / `production_role` badge (Remotion vs galeri) | APO-5 |
| A5 canvaFieldCopy trim | Tasarım metni → `poster-copy` / PIS (alan adı ICS’te kalır) | APO-3 |
| A6 reel canvaExportFormat | Reel = Runway MP4 veya story motion Remotion | APO-3, APO-6 |
| B1–B2 Canva primary router | APO-2 pipeline router (zaten) | ✅ |
| B4 Canva field-limits UI | **Poster copy** karakter limitleri (`poster-quality`) | APO-4 |
| B7 Canva 429 kuyruk | **Remotion render kuyruk** (concurrency limit) | APO-4/8 |
| B5/B6 Canva fallback | announcement + Runway policy | APO-4, APO-6 |

| Backlog | APO |
|---------|-----|
| A4 Bundle v0 | APO-5 |
| B1 Primary renderer | APO-2 |
| B2 auto-produce ↔ tasarım metni | APO-3 (Remotion/announcement; Canva yok) |
| B8 VPS parse | APO-3 |
| Poster 2/10 / promo_split | APO-4 |
| Mission rasgele üretim | APO-1, APO-2 |
| Feed ≠ Mission | APO-5, APO-7 |

---

## Tier C — ORTA (kaliteyi destekler, tek başına yeterli değil)

| ID | İş | Not |
|----|-----|-----|
| C1 | Content Router modülü (S3–S4) | B1–B2’nin kalıcı hali — **APO-2 ile birleştir** |
| C2 | Unified Publish service | A2’nin kalıcı hali |
| C3 | Learning event bus | V4 — orta vadede kalite öğrenir |
| C4 | Brand Genome read model | Router + agent beslemesi |
| C5 | MissionContentFactory parçalama | Maintainability, kalite dolaylı |
| C6 | Desktop ContentPage parity | Tutarlılık |
| C7 | auto-trigger daily cap | Spam önleme, kalite dolaylı |
| C8 | Agent prompt `canvaFieldCopy` zorunlu alan | B5 ile birlikte |

---

## Tier D — BİLİNÇLİ ERTELENMELİ (vizyon dışı veya erken)

| İş | Neden ertele |
|----|----------------|
| Yeni renderer (Flux-only post) | Mevcut Canva/announcement iyileştirilmeden ROI düşük |
| Multi-channel (TikTok, GBP) | Publish birleşmeden erken |
| Enterprise audit / SLA | Bundle + publish sonrası |
| LayoutEngine geri getirme | announcement ile değiştirildi |
| Full ProductionBundle Nexus schema | v0 metadata yeterli |
| Runway otonom default | Maliyet + beklenti; Canva reel primary |

---

## Önerilen uygulama sırası (adım adım, ~3–4 hafta)

### Hafta 1 — Güven + publish doğruluğu (çıktı “yanlış” gitmesin)
1. A1 auto-trigger fix  
2. A2 + A3 publish/preview URL  
3. A6 reel video kartı  

### Hafta 2 — Copy + Canva kalitesi
4. A5 canvaFieldCopy parse taşıması  
5. B4 field-limits UI (kısmi)  
6. B7 Canva kuyruk v0 (basit stagger artırımı bile olabilir)  

### Hafta 3 — Otonom birincil çıktı
7. A4 Bundle v0 (tek kart)  
8. B1 primary renderer hardcode  
9. B2 auto-produce signal align  

### Hafta 4 — Marka görsel kalitesi
10. B3 galeri skor UX  
11. B5 announcement fallback policy  
12. B8 VPS validation  

**Content Router tam modülü:** Hafta 3–4’te B1/B2 yeterli değilse C1’e geç.

---

## Vizyon ↔ iş eşlemesi

| Vizyon hedefi | İlk 6 iş |
|--------------|----------|
| Otonom üretim güvenilir | A1, A4, B1 |
| Marka tutarlı görsel | A5, B5, B3 |
| Canva = premium renderer | A2, A3, B7 |
| İnsan onayı anlamlı | A4, A6 |
| Agent → üretim bağlantısı | A5, B8 |

---

## Başarı ölçütleri (4 hafta sonu)

| Metrik | Hedef |
|--------|--------|
| Canva edit URL ile publish | 0 |
| Feed preview ≠ publish | 0 vaka |
| Fikir başına Feed kartı | ≤ 1.0 |
| Canva autofill field trim uyarısı (LLM rewrite) | ↓ %30 |
| Otonom mission auto-trigger success | > %80 mount |
| Reel artifact video preview | %100 |

---

## Modül modül eşleme

| Modül | Tier A/B işler |
|-------|----------------|
| M01 | A1, C7 |
| M02 | A5, B8 |
| M03 | B2 |
| M04 | B3 |
| M05 | B1, A4 |
| M06 | A5, B7 |
| M07 | B5, B6 |
| M08 | B4 |
| M09 | A4 |
| M10 | A3, A6 |
| M11 | A2 |

---

*Sonraki adım: Tier A Hafta 1 işlerinden hangisiyle kodlamaya başlanacağına karar ver.*
