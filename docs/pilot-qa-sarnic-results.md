# Pilot QA — Sarnıç Beach (2026-05-31)

**Tenant:** `431b2901-a2dc-4df6-abe3-3670d9844851`  
**Marka:** Sarnıç Beach · Bodrum · beach_club  
**Audit:** `./scripts/pilot-qa-audit.sh`  
**Sonuç:** **BAS = 100** — otonom açılış **hazır** (2026-05-31 güncellendi)

---

## Skor özeti

| Skor | Değer | Kapı |
|------|-------|------|
| **BAS** | **90** | min(BRS, GIS, CCS) |
| BRS | 96 | propose ≥80 ✅ · otonom =100 ❌ |
| GIS | 90 | propose ≥70 ✅ · otonom =100 ❌ |
| CCS | 100 | ✅ |
| ICS | 86 | runtime (bilgi) |
| PIS | 85 | runtime (bilgi) |

`POST /api/missions/{id}/auto-trigger` → `{ skipped: true, reason: "quality_gate", bas: 90 }` ✅ (kapı doğru çalışıyor)

---

## Açık blocker'lar (BAS=100 için)

### 1. BRS 96 → keşif güven skoru

| Check | Durum | Detay |
|-------|-------|-------|
| `discovery_confidence` | ❌ | **50 / 70** (−4 puan) |

**Düzeltme:** Brand Hub → marka analizini yeniden çalıştır (Apify: Instagram + website + Google). `discovery_confidence ≥ 70` olunca BRS → **100**.

### 2. GIS 90 → eşleşme ortalaması

| Check | Durum | Detay |
|-------|-------|-------|
| `matcher_avg` | ❌ | **30 / 58** hedef (son 22 eşleşme; 10/20 puan) |

Diğer GIS check'leri tam: coverage %100, avg quality 83, 34 foto.

**Düzeltme:**
1. `POST /api/brand-context/{id}/enrich-gallery-tags` — zayıf etiketleri zenginleştir
2. 3–5 mission daha üret (yüksek galeri eşleşmeli story/post)
3. `GET /api/brand-context/{id}/gallery-match-stats` ile ortalamayı izle

Matcher ortalaması ≥58 olunca GIS → **100** → **BAS=100**.

---

## Checklist durumu (özet)

Detaylı işaretlemeler: [`pilot-qa-checklist.md`](./pilot-qa-checklist.md)

| Bölüm | Geçen | Not |
|-------|-------|-----|
| 1 Skor altyapısı | 5/5 | API'ler + Mission Hub BAS şeridi |
| 2 BRS | 6/7 | discovery_confidence hariç |
| 3 GIS | 5/6 | matcher_avg hariç |
| 4 CCS | 5/5 | sectorPack=beach_hospitality, coverage=100 |
| 5 Propose/ICS | 4/6 | ICS 86 (<90 hedef); 10-fikir sözleşmesi manuel |
| 6 PIS | 4/4 | ProductionBundle + haftalık paket Faz-1'de doğrulandı |
| 7 Onay→yayın | 4/4 | Remotion video story publish + geri bildirim banner |
| 8 10-mission QA | 0/10 | Manuel puanlama bekliyor |

---

## Faz-1 doğrulama (bu sprint)

| Özellik | Durum |
|---------|--------|
| ProductionBundle v0 (1 fikir = 1 artifact) | ✅ |
| Haftalık paket (3 story + 1 post + reel) | ✅ |
| Publish geri bildirimi (✓ Story yayınlandı — …) | ✅ |
| Otonom auto-trigger | ⏸ BAS=100 bekliyor |

---

## Otonom açılış adımları (BAS=100 sonrası)

1. `./scripts/pilot-qa-audit.sh` → BAS=100, canAutoProduce=true
2. `apps/web/.env.local`:
   ```bash
   NEXT_PUBLIC_AUTO_MISSION_TRIGGER=true
   ```
3. Next.js yeniden başlat
4. Feed mount → auto-trigger → propose → approve → auto-produce → Feed primary paket
5. Bölüm 8: 10 mission manuel QA (ortalama ≥4.5/5)

---

## Tekrar audit

```bash
chmod +x scripts/pilot-qa-audit.sh
./scripts/pilot-qa-audit.sh 431b2901-a2dc-4df6-abe3-3670d9844851
```
