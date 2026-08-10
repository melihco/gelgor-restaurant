# AI Maliyet Azaltma — Rollout & İzleme Checklist'i

**Durum (2026-07):** Güvenli maliyet flag'leri kodda **varsayılan AÇIK**. `GRAFIKER_LITE` kapalı kalmalı (kalite regresyonu). Opt-out: ilgili env `=false`.

**Temel ilke:** Premium tier kalitesi korunur; lite davranışlar starter/agency path'lerinde ve token/enhance tasarrufunda. Kalite kapısı düşerse tek flag'i `false` yap (kod revert yok).

## 1. Flag envanteri

| Flag | Taraf | Varsayılan | Davranış | Kalite riski |
|------|-------|------------|----------|--------------|
| `CREWAI_CONTENT_ITERATIONS` | python | **1** | Ideation tek geçiş (2 = A/B pick, ~2× maliyet) | Düşük |
| `DEDUP_GALLERY_BACKSTORY` | python | **true** | Ideation backstory'den duplicate gallery inventory düşer | Düşük |
| `LITE_STRUCTURAL_TASKS_ENABLED` | python | **true** | calendar / design cards / feed cohesion → lite model | Düşük |
| `LLM_MAX_TOKENS_CAP` | python | **8192** | Completion token tavanı | Düşük |
| `AD_REUSE_DESIGNED_POST_STILL` | web | **true** | Meta/Google ad: fal redesign **atlanır**, designed_post still reuse | Yok |
| `SKIP_ENHANCE_FOR_DESIGNED_GRADE` | web | **true** | Grade'li slotlarda GPT enhance atla (legacy: `SKIP_ENHANCE_FOR_REMOTION_GRADE`) | Düşük |
| `CAROUSEL_HERO_ENHANCE_ONLY` | web | **true** | Carousel'de sadece kapak enhance | Düşük-orta |
| `VIDEO_TIER_SCOPE` | web | **true** | Non-premium: montage → single + reel I2V retry 1 (premium full) | Orta (hareket) |
| `CD_LITE` | web | env only | Legacy; starter/agency zaten `ai-model-tier` ile mini creative | Düşük |
| `GRAFIKER_LITE` | web | **false** | Açma — false-negative QA | **YÜKSEK** |
| `AI_COST_TELEMETRY` | web | açık | `[ai-cost]` / `[ai-quality]` log | Yok |

> **`GRAFIKER_LITE`:** Canlı testte aynı poster `gpt-4o`'da 9, lite'ta 3 → false-negative. Üretimde kapalı. Starter/agency Grafiker zaten `ai-model-tier.ts` üzerinden mini + `detail:low`.

## 2. Opt-out (kalite için geri alma)

```bash
# backend
CREWAI_CONTENT_ITERATIONS=2
DEDUP_GALLERY_BACKSTORY=false
LITE_STRUCTURAL_TASKS_ENABLED=false
LLM_MAX_TOKENS_CAP=0

# apps/web
AD_REUSE_DESIGNED_POST_STILL=false
SKIP_ENHANCE_FOR_DESIGNED_GRADE=false
CAROUSEL_HERO_ENHANCE_ONLY=false
VIDEO_TIER_SCOPE=false
```

## 3. İzleme

| Metrik | Kaynak | Eşik |
|--------|--------|------|
| Mission başına maliyet | MissionHub AI maliyeti · `[ai-cost]` | Düşüş beklenir |
| Grafiker pass-rate | `[ai-quality] event=grafiker` | Baz −3 puan altına düşmemeli |
| Operatör onay/red | `suggestions` | Baz ±3 puan |
| Fallback oranı | `[ai-quality] event=fallback` | Artmamalı |
| `performance_summary.ai_cost_breakdown` | completed mission | Dolu kalmalı |

## 4. Kod SSOT

- Python: `backend/app/config.py` (`crewai_content_iterations`, `dedup_gallery_backstory`, `lite_structural_tasks_enabled`, `llm_max_tokens_cap`)
- Web: `apps/web/src/lib/server-config.ts` (`autoProduce` / `productionFlags`)
- Tier modeller: `apps/web/src/lib/ai-model-tier.ts`
- Mission cost guards: `apps/web/src/lib/mission-production-cost-guards.ts`
  - Grounded GPT max attempts: cost-scoped ≤2; soft-accept score ≥6; keep readable grounded over Ideogram
  - Content-scoped idea production hard cap: **12**
  - Beat montage photo cap: **2** (was 3)
