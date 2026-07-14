# UI ince dokunuşlar

SmartAgency mobil uygulamasında **SaChromeShell** (void black + steel ambient + A-mark) diline geçiş sonrası kalan görsel uyumsuzluklar. Akış (Feed) ve onay ekranları bilinçli olarak native/IG stilinde bırakıldı.

**Referans:** `SaChromeShell.tsx`, `sa-chrome.ts`, `OnboardingChrome.tsx`, `page.tsx` (`.sa-chrome-*` / `.onboarding-*`)

---

## Tamamlanan (bu tur)

| Alan | Ne yapıldı |
|------|------------|
| **Login** | `OnboardingChromeBackdrop` — mark watermark + steel hairline |
| **Onboarding (tüm adımlar)** | Yeşil `#34D399` tamamlandı durumları → steel `SA_ONBOARDING`; emoji ikonlar → stroke SVG |
| **Marka analizi adımları** | `OnboardingStepDot` + steel progress ring |
| **Sonuç önizlemesi** | `OnboardingStatusPill`, steel “Tarandı” rozeti, `OnboardingPreviewIcon` |
| **Kurulum overlay** | Faz noktaları `OnboardingStepDot` (✓ metni kaldırıldı) |
| **Hoş geldin / şablon intro** | `OnboardingSuccessMark` (steel check / brand star) |
| **Marka hub hazırlık halkası** | Skor ≥80 yeşil → `SA_CHROME.steel300` glow |

---

## P0 — Kullanıcı yolunda belirgin uyumsuzluk

| # | Ekran / bileşen | Sorun | Öneri |
|---|-----------------|-------|-------|
| 1 | ~~`BrandHubDashboard`~~ | ~~Hazırlık halkası skor ≥80 iken yeşil glow~~ | ✅ Steel glow uygulandı |
| 2 | `BrandConstitution` | Analiz durumu `#10B981`, toggle ve tag’lerde emerald | Onboarding ile aynı `SA_ONBOARDING` / steel success |
| 3 | `mobile-client-config` → `MoreMenu` | Menü satırlarında gökkuşağı `iconBg` + emoji `iconText` | `SA_STUDIO_ACCENTS` + `MenuItemIcon` stroke (Marka hub ile aynı) |

---

## P1 — Studio / operasyon ekranları

| # | Ekran | Sorun | Öneri |
|---|-------|-------|-------|
| 4 | `MissionHub` | Görev tipleri emoji (`📅`, `💬`) + yoğun `#10B981` durum renkleri | Görev tipi için küçük stroke ikon seti; success = steel, semantic yeşil sadece “yayına hazır” |
| 5 | `AgentsScreen` / `AgentTeamBoard` | Ajan kartları `#34D399` / `#10B981` + metin ikon (`↗`) | `SA_STUDIO_ACCENTS` rol paleti |
| 6 | `BrandRulesScreen` | Kural kategorileri emoji + yeşil onay chip’leri | Steel chip + kategori SVG |
| 7 | `SettingsScreen` | Bağlı hesap rozeti `#10B981` | Steel “bağlı” durumu |
| 8 | `Campaigns` | Aktif kampanya `#34d399` | Steel veya warm gold “aktif” |
| 9 | `AdsOverview` | Aktif reklam yeşili | Steel primary; amber duraklatılmış |
| 10 | `BrandCompleteGapsCard` / `MobileBrandAutoFill` | Otomatik düzeltilebilir = yeşil | Steel “hazır” + indigo “manuel” ayrımı korunabilir |

---

## P2 — Tema ve mikro detaylar

| # | Alan | Sorun | Öneri |
|---|------|-------|-------|
| 11 | `theme-context.tsx` | `success` / `live` = `#3CB87A` (emerald) | Chrome ekranlarında `t.chromeSuccess` alias; feed’de mevcut token |
| 12 | `ui-primitives.tsx` | Stack header geri butonu — bazı ekranlar hâlâ kare radius | Tüm stack ekranlarında `sa-chrome-header` |
| 13 | `OnboardingFlow` → tipografi adımı | Vibe seçeneklerinde `opt.emoji` | Opsiyonel: emoji → küçük tipografi önizleme harfi |
| 14 | `onboarding-brand-avatar` | Mor/lila gradient (`#C4B5FD`) | Steel gradient (`SA_CHROME.steel500` ailesi) |
| 15 | `ScheduleSheet` / `BoostPostSheet` | Başarı metni `#10B981` | Steel onay metni (feed aksiyonu değil) |
| 16 | `MertcafeAccountSwitcher` | OK mesajı yeşil | Steel success copy |

---

## Bilinçli istisnalar (dokunma)

| Alan | Neden |
|------|-------|
| **`PlatformFeed.tsx`** | Native Instagram akış deneyimi; swipe onay yeşili, story ring |
| **`CreativePreview` / `ApprovalFeedback` / `PlatformPreviewStudio`** | İçerik onay akışı — IG-yeşil “onayla” CTA beklenen pattern |
| **`MissionContentFactory`** (üretim detay) | Operatör yoğunluklu; aşamalı chrome geçişi ayrı PR |

---

## Veri / içerik (UI değil ama kullanıcı görür)

| # | Konu | Durum |
|---|------|-------|
| D1 | Yula tenant altında Karaman `metadata.brandName` artifact’leri | Prod DB marka profili düzeltildi; feed halkaları temizlenmeli |
| D2 | Cross-tenant `CompanyProfiles` yazımı | `tenant-production-guard` + restore script; izleme devam |

---

## Uygulama sırası (önerilen)

1. **P0** — Marka hub + constitution + MoreMenu (giriş sonrası ilk izlenim)
2. **P1** — MissionHub + Agents (günlük kullanım)
3. **P2** — Tema token ayrımı + kalan mikro renkler
4. **Veri** — Artifact metadata temizliği (ayrı script)

---

## Test kontrol listesi

- [ ] Login → onboarding URL → analiz animasyonu: yeşil yok, steel checkmark
- [ ] Sonuç ekranı: “Tarandı” / “Kayıt Sonrası” steel tonları
- [ ] Hesap kurulum overlay: faz noktaları steel
- [ ] Hoş geldin + şablon intro: success ring SVG
- [ ] Marka hub hazırlık halkası (P0 sonrası): ≥80 steel, <80 amber
- [ ] Akış feed: yeşil onay butonları **değişmedi** (regression yok)
