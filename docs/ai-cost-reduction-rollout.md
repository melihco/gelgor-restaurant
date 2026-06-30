# AI Maliyet Azaltma — Rollout & İzleme Checklist'i

**Durum:** Kod hazır, tüm flag'ler **varsayılan KAPALI** (mevcut davranış birebir korunur). Bu döküman flag'lerin staging → production kademeli açılışını ve izleme/geri-alma prosedürünü tanımlar.

**Temel ilke:** Önce ölç, sonra kes. Premium tier'a dokunma. Her adım tek flag, 48s telemetri izle, kalite kapısı düşerse flag'i kapat (kod revert yok).

---

## 1. Flag envanteri

| Flag | Taraf | Faz | Varsayılan | Davranış (açıkken) | Kalite riski |
|------|-------|-----|------------|---------------------|--------------|
| `AI_COST_TELEMETRY` | web | 0 | **açık** | `[ai-cost]` / `[ai-quality]` log satırları (ölçüm) | Yok (gözlem) |
| `LITE_STRUCTURAL_TASKS_ENABLED` | python | 3.2 | false | `content_calendar` / `visual_design_cards` / `feed_cohesion_review` → `gpt-4o-mini`. ideation/strategy `gpt-4o`'da kalır | Düşük |
| `LLM_MAX_TOKENS_CAP` | python | 3.3 | `0` (kapalı) | LLM tamamlama token tavanı (kaçak JSON koruması). Açarken `8192` | Düşük (şema üstü tut) |
| `AD_REUSE_DESIGNED_POST_STILL` | web | 1.3 | false | Reklam türevi `designed_post` still'ini yeniden kullanır (2 CD+2 Grafiker+2 render tasarrufu) | Yok (aynı asset) |
| `SKIP_ENHANCE_FOR_REMOTION_GRADE` | web | 1.4 | false | Remotion-grade'li slotlarda `$0.21` GPT enhance atlanır (grade render'da uygulanıyor) | Düşük |
| `CD_LITE` | web | 2.3 | false | economy/agency Creative Director `gpt-4o-mini` + Grafiker-fail'deki ekstra CD çağrısı atlanır | Düşük (A/B) |
| `CAROUSEL_HERO_ENHANCE_ONLY` | web | 2.4 | false | Carousel'de sadece kapak fotoğrafı enhance; kalan slide'lar ham galeri + render-time grade | Düşük-orta |
| `VIDEO_TIER_SCOPE` | web | 3.4 | false | economy/agency'de çok-klipli Runway montajı (`sequential`/`multi_ref`) → tek klip; premium tam montaj | Orta (hareket) |
| `GRAFIKER_LITE` | web | 2.2 | false | economy/agency Grafiker `gpt-4o-mini` + `detail:low` + 768px | **YÜKSEK — açma** |

> **`GRAFIKER_LITE` uyarısı:** Canlı testte kalite regresyonu üretti (aynı poster `gpt-4o`'da 9, lite'ta 3 → false-negative). Üretimde **kapalı kalmalı**. Yeniden denenecekse önce çözünürlüğü artırıp (768px → 1024px) izole A/B gerekir.

> **Premium koruması:** Tüm lite davranışlar yalnızca tier **açıkça** `economy`/`agency` olduğunda devreye girer. Tier bilgisi ulaşmazsa → tam kalite. Premium asla bozulmaz.

---

## 2. Kademeli rollout

### Ön koşul — telemetri açık
`AI_COST_TELEMETRY` zaten varsayılan açık. Doğrula: bir mission üretiminde loglarda `[ai-cost]` ve `[ai-quality]` satırları görünmeli. MissionHub'da (operatör/debug modu) **"AI maliyeti — bu misyon"** paneli + **Feed üretim kırılımı** (Runway / Remotion / Görsel) görünmeli.

### Adım 1 — Nötr LLM kazanımları (en güvenli, hemen)
```bash
# backend/.env (Python)
LITE_STRUCTURAL_TASKS_ENABLED=true
LLM_MAX_TOKENS_CAP=8192
```
- **Beklenen:** 3 yapısal görevde çağrı başına ~%95 maliyet düşüşü (gpt-4o → gpt-4o-mini). ideation tam kalitede.
- **Not:** Etki yalnızca üretimde `OPENAI_MODEL=gpt-4o` ise görülür. Dev'de `gpt-4o-mini` olduğu için no-op.
- **İzle (48s):** feed_cohesion_review slot atama tutarlılığı, content_calendar JSON geçerliliği, operatör red oranı.

### Adım 2 — Çıktı-nötr web kazanımları
```bash
# apps/web/.env.local
AD_REUSE_DESIGNED_POST_STILL=true
SKIP_ENHANCE_FOR_REMOTION_GRADE=true
```
- **İzle:** Reklam türevlerinin görsel kalitesi, Remotion-grade slotlarında görsel zenginlik (Grafiker pass-rate).

### Adım 3 — Tier-aware lite (48s yeşil sonrası)
```bash
# apps/web/.env.local
CD_LITE=true
CAROUSEL_HERO_ENHANCE_ONLY=true
```
- **İzle:** Layout seçim isabeti (CD), carousel görsel tutarlılığı.

### Adım 4 — Video kapsamı (reel-ağırlıklı tenant'ta)
```bash
# apps/web/.env.local
VIDEO_TIER_SCOPE=true
```
- **İzle:** economy/agency reel hareket kalitesi vs maliyet. Premium etkilenmemeli.

---

## 3. İzleme — neye bakılır

| Metrik | Kaynak | Baz çizgisi / eşik |
|--------|--------|---------------------|
| Mission başına maliyet | MissionHub "AI maliyeti" paneli · `[ai-cost]` rollup | Düşüş bekleniyor |
| Feed üretim kırılımı | MissionHub (Runway/Remotion/Görsel) | Renderer bazında trend |
| Grafiker pass-rate (ilk denemede) | `[ai-quality] event=grafiker pass=…` | Baz **−3 puan** altına düşmemeli |
| Operatör onay/red oranı | `suggestions` tablosu | Baz ±3 puan |
| Fallback tetiklenme oranı | `[ai-quality] event=fallback transition=…` | `flux→openai`, `edit→generate`, `ideogram→flux`, `runway→fal` artmamalı |
| Tamamlanan mission'da maliyet kalıcı mı | `performance_summary.ai_cost_breakdown` (Faz 4.3 fix) | Mission `completed` olduktan sonra da dolu olmalı |

**Maliyet görünürlüğü kontrolü:** Faz 4.3 ile `_check_and_complete_mission` artık `performance_summary`'yi merge ediyor — tamamlanan mission'da `ai_cost_breakdown` / `last_feed_produce` / `production_profile_tier` korunur. Eskiden silindiği için panel tahmine düşüyordu.

---

## 4. Kalite kapısı & geri alma

1. Her flag **tek başına** açılır, 48s telemetri izlenir.
2. Grafiker pass-rate veya operatör onay oranı **baz −3 puan** altına düşerse → ilgili flag'i `false` yap (kod revert gerekmez, anında eski davranış).
3. Önce **1 tenant/staging**'de aç → yeşilse economy/agency'ye genişlet.
4. Premium yalnızca nötr adımlar (1 + 2) için; lite adımlar (3 + 4) premium'a uygulanmaz.

---

## 5. Doğrulama (rollout öncesi statik)

```bash
# Python — flag'ler çözülüyor + routing/cap doğru
cd backend && source .venv/bin/activate
python3 -c "from app.config import get_settings; s=get_settings(); print(s.lite_structural_tasks_enabled, s.llm_max_tokens_cap)"
python3 -m pytest tests/services tests/crew -q

# TypeScript
cd apps/web && npx tsc --noEmit   # yalnızca bilinen WIP hataları beklenir
npx vitest run                    # 94/94
```

---

## 6. Referanslar (kod)

| Konu | Dosya |
|------|-------|
| LLM routing + token cap | `backend/app/crew/engine.py` (`get_llm`, `_STRUCTURAL_LITE_TASKS`) |
| Config flag'leri | `backend/app/config.py`, `backend/.env.example` |
| Telemetri | `apps/web/src/lib/ai-cost-telemetry.ts` |
| Video tier scope | `apps/web/src/app/api/auto-produce/production-loop.ts` (`reelStrategy`) |
| CD-lite / Grafiker-lite | `creative-director/route.ts`, `grafiker-review-service.ts` |
| Mission maliyet rollup | `backend/app/services/ai_cost_service.py`, `task_graph_executor.py` (`_check_and_complete_mission`) |
| Maliyet UI | `apps/web/src/app/mobile/_components/screens/MissionHub.tsx` (`MissionAiCostPanel`), `mission-ai-cost.ts`, `mission-production-cost.ts` |
| Web flag dokümanı | `apps/web/.env.local.example` |
