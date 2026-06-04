# Kaçta — ajans seviyesi üretim kilidi

**Tenant:** `5feb36f7-def7-4b4a-834f-353457de57bf`

## Neden müşteri “eskisi gibi” görüyor?

| Gerçek | Algı |
|--------|------|
| Aynı galeri fotoğrafları | “İçerik değişmedi” |
| Eski artifact’lar Feed’de | Anayasa değişince kartlar güncellenmez |
| `fal.ai` neredeyse hiç çağrılmıyor | “AI yatırımı yok” |
| Story MP4 arka planda render | Önizleme önce ham foto gösterir |
| `ai_photo_enhance` kapalıydı | Post’lar Remotion poster katmanı almıyordu |

## Pipeline haritası (auto-produce)

| Plan (`metadata.pipeline`) | Gerçek renderer (`renderer_executed`) | fal.ai? |
|----------------------------|----------------------------------------|---------|
| `gallery_photo` | `gallery_raw` veya `remotion_poster_marky` | Hayır |
| `remotion_poster` | `remotion_poster_sync` | Hayır |
| `remotion_story` | `remotion_story_async` (+ MP4) | Hayır |
| `runway_reel` | `runway_reel` | Hayır |
| (galeri yok) | `flux` via generate-instagram-image | **Evet** (nadir) |

`gallery_only: true` metadata = env flag, **flux kullanıldığı anlamına gelmez**.

## Prod / Render flag’leri (“eski görünüm”)

| Flag | Render `render.yaml` | Etki |
|------|---------------------|------|
| `AUTO_PRODUCE_GALLERY_ONLY` | `true` | Scratch Flux üretimi nadir; galeri öncelikli |
| `VENUE_PHOTO_PRESERVE` | `true` | Mekan fotoğrafı AI ile değiştirilmez (doğru) |
| `AUTO_PRODUCE_BYPASS_LIMITS` | `false` | Prod bütçe limitleri aktif |
| `ai_photo_enhance` (DB theme) | Dashboard | Kapalıysa organik post Remotion katmanı **atlanırdı** |

## Kod değişiklikleri (2026-06)

1. **`agency-production-defaults.ts`** — Kaçta + kilitli şablon kütüphanesi + berber/ajans sektöründe `ai_photo_enhance` otomatik açılır.
2. **`production-pipeline-router.ts`** — Berber/ajans: tüm postlar `designed_post` / `remotion_poster`; `library_slot_key` ataması.
3. **Artifact metadata** — `renderer_executed`, `flux_used`, `agency_defaults_forced`.

## Denetim komutları

```bash
# Stack ayakta iken
node scripts/kacta-production-audit.mjs

# Belirli mission
node scripts/kacta-production-audit.mjs fa3df9c2-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Yeni 7’li paket smoke
node scripts/test-kacta-package-produce.mjs
```

## Müşteriye yansıması için checklist

1. Deploy sonrası **yeni mission** → auto-produce.
2. Marka Anayasası: headline rengi, script font, 5 şablon **kilitli**.
3. Galeriye **yeni salon foto** ekle.
4. Feed’de eski kartları silme — yeni üretilenlere bak; story’de MP4 bitene kadar poster önizlemesi normal.
5. Meta redirect: `https://<web>.onrender.com/api/meta/oauth/callback`
