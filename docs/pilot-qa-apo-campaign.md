# Pilot QA — Multi-Tenant + APO-3/4/5/6

**Amaç:** Kaçta / Bodrum ve yeni tenant ile regresyon; kampanya misyonu ve haftalık paket ayrımı doğrulanır.

**Prod env:** Release öncesi `docs/release-env-checklist.md` uygulanmadan prod smoke yapılmaz.

---

## Ön koşullar (dev)

| # | Kontrol |
|---|---------|
| 1 | Stack: Postgres, Python 8000, Nexus 5050, Next 3000 |
| 2 | Login → doğru tenant JWT (`workspace-store` = seçilen marka) |
| 3 | `AUTO_PRODUCE_RUNWAY=true`, `RUNWAY_API_SECRET` set |
| 4 | Brand Hub: BRS ≥ 70, GIS ≥ 70 (misyon önerisi); BAS=100 (otonom Feed tetik) |
| 5 | `brand_theme.quality_tier: agency` → `max_runway_reels_per_mission: 2` (opsiyonel test) |

**Pilot tenant (regresyon only):**

- Kaçta: `5feb36f7-def7-4b4a-834f-353457de57bf`
- Bodrum: `d6b187ab-0821-43bf-8381-25f3b17f24e4`

---

## A — Multi-tenant (MT)

| ID | Test | Beklenen |
|----|------|----------|
| MT-A1 | Tenant A login → Feed yalnızca A artifact | B tenant içeriği yok |
| MT-A2 | Tenant B login → aynı kontrol | Karışıklık yok |
| MT-A3 | Feed BAS &lt; 100 banner + “Markayı tamamla” | Otonom tetik skip veya quality_gate |
| MT-A4 | Mission Hub → FD raporu + slot checklist | `feed_cohesion_review` satırı dolu |
| MT-A5 | `X-Tenant-Id` başka UUID ile `/api/brand-readiness/{id}` | 403 `tenant_mismatch` (JWT ile) |

---

## B — APO-3 (üretim sözleşmesi)

| ID | Test | Beklenen |
|----|------|----------|
| B1 | Mission tamamlanır → auto-produce log `ICS parsed=N` | N = ideation fikir sayısı |
| B2 | Bilerek boş VPS’li fikir (mock) | PIS skip, artifact yok, Hub uyarısı |
| B3 | Runway açık mission | Log `buildReelPayload`, reel artifact `videoUrl` |
| B4 | Aynı mission için client Canva/auto-feed çift üretim | Tek server path; duplicate yok |
| B5 | `metadata.production_role` + `pipeline` Nexus/Feed badge | Galeri / Tasarım / Reel / Kampanya |

---

## C — APO-4 (poster kalite)

| ID | Test | Beklenen |
|----|------|----------|
| C1 | `designed_post` sektör agency/SaaS | Editorial/luxury aile, “Türkiye” tek başına lokasyon değil |
| C2 | Promo headline + poster | `promo_split` veya promo ailesi |
| C3 | auto-produce log | `poster QA X/10` — X ≥ 8 veya uyarı listesi |
| C4 | Remotion story Grafiker | render route retry log (varsa) |

---

## D — APO-5 (Feed 1:1)

| ID | Test | Beklenen |
|----|------|----------|
| D1 | Mission chip filtresi | Yalnız o mission artifact’ları |
| D2 | Post → alt filtre Galeri / Tasarım | Doğru `production_role` |
| D3 | Story → Statik / Motion | Motion = MP4 veya `campaign_story_motion` |
| D4 | Hub slot checklist | required/ready/rendering/failed sayıları |
| D5 | FD → Yayın takvimi | Gün hücresinde saat/format ipucu |

---

## E — APO-6 (kampanya kanalı)

| ID | Test | Beklenen |
|----|------|----------|
| E1 | Misyon tipi kampanya / sezon (strategist) | FD’de ≥1 `campaign_story_motion` assignment |
| E2 | Kampanya story üretimi | Remotion `CampaignHeroStory` veya motion MP4 |
| E3 | `publish_channel: instagram_campaign` | Metadata’da kampanya kanalı |
| E4 | Agency tier, 2 reel | 1× `organic_reel` + 1× `campaign_reel_motion` Runway (bütçe izin veriyorsa) |
| E5 | Standard tier | Max 1 Runway; kampanya reel yalnızca hero ise |
| E6 | Hub checklist kampanya mission | `campaign_story_motion` required ✓ |

---

## F — Uçtan uca senaryolar

### F1 — Haftalık organik paket (her tenant)

1. Misyon onayla → ideation bitsin.
2. Mission Hub: 5 slot checklist (organik post, tasarım post, 3 story still, 1 reel).
3. Feed: Tümü → Post/Story/Reel filtreleri; en az 1 galeri post, 1 tasarım post.

**Pass:** ≥4/5 required slot `ready`.

### F2 — Kampanya misyonu

1. Strategist’ten `type: seasonal/opportunity` + promo brief ile misyon.
2. FD raporu: `campaign_story_motion` + isteğe bağlı `campaign_reel_motion`.
3. Feed: Story → **Motion** filtresinde kampanya story; badge **Kampanya**.

**Pass:** ≥1 motion story ready; organik ile karışmıyor.

### F3 — İki tenant ardışık (regresyon)

1. Kaçta login → F1 kısa smoke.
2. Logout / tenant değiştir → Bodrum → F1.
3. Feed’ler birbirinden izole.

---

## Log / API doğrulama (opsiyonel)

```bash
# auto-produce sonrası (internal)
grep -E "ICS parsed|Production Stack|poster QA|CampaignHero|campaign_reel" apps/web/.next/server.log

# Python FD
grep feed_art_director_complete backend logs
```

---

## Bilinen sınırlar (bu sprint)

- Prod env kapıları dev’de gevşek (`USE_DEMO_CONTEXT`).
- Grafiker &lt;8 otomatik retry poster sync path’te sınırlı (log + Remotion route retry).
- Eski misyonlarda FD node yoksa rapor upsert ile oluşur (ilk üretimden sonra).

---

## Sonuç kaydı

| Tenant | F1 | F2 | MT | Not |
|--------|----|----|-----|-----|
| Kaçta | **PASS** (Yaz `fa3df9c2`: 4/4 çekirdek rol ready) | **PARTIAL** (FD’de `campaign_story_motion` yok; `3540f633`’te `campaign_reel_motion` Pending) | API smoke OK; BAS 86 → `canAutoProduce` false | 2026-06-02: internal auto-produce `de6d4245` → 4/5, PIS 100 |
| Bodrum | | | | |
| Yeni tenant | | | | |

Tarih: 2026-06-02  QA: agent (dev stack)
