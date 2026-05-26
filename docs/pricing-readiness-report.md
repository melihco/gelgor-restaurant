# SmartAgency Fiyat Talep Readiness Raporu

## Kısa Cevap

Bu fiyatlar kontrollü pilot veya founder-led satış modeliyle müşteriden talep edilebilir. Ancak müşteriye “tüm canlı provider aksiyonları sorunsuz ve tam otomatik çalışır” vaadi verilmemelidir.

Doğru vaat:

> SmartAgency AI analiz eder, önerir, içerik üretir, onaya sunar, dry-run ile test eder ve canlı aksiyonları bağlı hesap/izin doğrulaması tamamlandıktan sonra kontrollü uygular.

## Genel Karar

- Starter ve Growth paketleri mevcut ürünle satılabilir.
- Performance paketi pilot müşteriyle, entegrasyon kurulumu ve canlı provider testleri tamamlanarak satılmalıdır.
- Executive paketi yalnızca yüksek temaslı destek, net kapsam ve managed pilot diliyle teklif edilmelidir.
- Tam self-serve production SaaS satışı için ödeme altyapısı, gerçek provider doğrulaması, migration/backup operasyonu ve canlı aksiyon güvence testleri tamamlanmalıdır.

## Satışta Rahat Söylenebilecek Özellikler

- AI Dashboard ve kontrol merkezi: Dashboard, agent durumu, bekleyen onaylar ve öneriler müşteri demosunda gösterilebilir.
- AI agent kataloğu ve execution: 12 agent rolü, agent run kaydı, task/artifact/action hattı ve smoke test doğrulaması mevcut.
- Onay kuyruğu: Action/artifact approve, reject ve revision akışları backend ve UI tarafında var.
- Dry-run execution: Aksiyonlar gerçek provider hesabına yazmadan test modunda çalıştırılabiliyor.
- Billing ve usage metering: Paketler, agent run limiti, provider action limiti, live action limiti ve token metering endpointleri mevcut.
- RBAC ve yetkiler: Admin/Manager/Reviewer/Operator/Viewer rolleri ve canlı execution yetkileri ayrıştırıldı.
- Self-serve onboarding: Kurulum skoru, eksik adım, launch readiness ve live-action readiness bilgisi var.
- Operasyon paneli: Agent run, provider job, hata, audit trail ve 24 saatlik metrikler izlenebiliyor.
- Production health ve smoke: Health/live/ready endpointleri ve production smoke script çalışıyor.

## Koşullu veya Eksik Vaatler

- Live provider execution: Kod yolu ve RBAC var; gerçek provider hesabı, OAuth credential ve tenant bazlı canlı doğrulama tamamlanmadan “sorunsuz canlı otomasyon” denmemeli.
- Google Ads optimizasyonu: Budget ve creative adapter var; canlı kullanım için Google Ads bağlantısı, ad group/final URL ve gerçek hesap testleri gerekiyor.
- Google Business review reply: Provider endpoint ve executor routing var; production credential yoksa canlı yanıt yazma başarısız olur.
- Instagram scheduling: Content plan/schedule adapter var; gerçek Instagram Business token ve yayınlama izinleri doğrulanmalı.
- Brand memory / Qdrant: Relational brand memory çalışıyor; vector memory şu an disabled ve embedding provider configured değil.
- Production database lifecycle: Health ve backup dokümantasyonu var; gerçek production için EF Core migration süreci tamamlanmalı.
- Ödeme tahsilatı: Paket ve usage var; ödeme sağlayıcı, fatura, abonelik tahsilatı ve iptal/iade akışı henüz ürünleşmiş değil.
- Alert/retry operasyonu: Operasyon görünürlüğü var; otomatik retry queue, alert routing ve SLA dashboard henüz yok.

## Paket Bazlı Satılabilirlik

- Starter, 4.900₺ / ay: Satılabilir. AI içerik/yorum asistanı, onay kuyruğu ve dry-run değer önerisiyle güvenli. Canlı execution vaat edilmemeli.
- Growth, 9.900₺ / ay: Satılabilir. Yerel işletme için onboarding, içerik, yorum, brand memory ve operasyon paneliyle mantıklı ana paket.
- Performance, 19.900₺ / ay: Pilot olarak satılabilir. Google Ads/Analytics değer önerisi güçlü; ancak canlı provider bağlantısı müşteri bazında doğrulanmalı.
- Executive, 39.900₺ / ay: Dikkatli satılmalı. Bu rakam ancak yönetilen pilot, yakın destek ve net kapsamla talep edilmeli; self-serve production iddiası için erken.

## Canlı Doğrulama Özeti

- `/health/live`: 200 ok.
- `/health/ready`: 200 ok; database ve orchestration ok, action execution mode dry-run.
- `/api/setup/onboarding-status`: score 83/100, `readyForLaunch=true`, `readyForLiveActions=false`.
- `/api/setup/vector-memory/status`: Qdrant disabled, relational fallback active.
- `/api/packages`: yeni fiyatlar API’den dönüyor.
- `/api/packages/usage`: Performance paketi, usage metering ve limitler çalışıyor.
- `/api/operations/summary`: 22 recent agent run, 6 provider job, 1 failure görünüyor.
- `scripts/production-e2e-smoke.py`: API + web smoke passed, agent count 12.

## Fiyatı Rahat Talep Etmek İçin Kalan İşler

1. Google Ads, Google Business ve Instagram için production OAuth/token ile tenant bazlı canlı test yapılmalı.
2. Satış vaadi “AI önerir ve onaylı aksiyon üretir” şeklinde netleştirilmeli; “tam otomatik hesap yönetir” şimdilik riskli.
3. Paket fiyatı var; tahsilat, fatura, plan iptali, ödeme hatası ve renewal akışı eklenmeli.
4. EnsureCreated/schema patch yerine EF migration ve restore testi zorunlu hale getirilmeli.
5. Vector memory ticari vaadi için Qdrant ve embedding provider prod env’de aktif doğrulanmalı.
6. Executive paket için manuel destek, onboarding ve canlı aksiyon onayı sözleşmede açık yazılmalı.

## Sonuç

Mevcut ürün müşteri demosu ve ücretli pilot için yeterince değerli. Fiyatlar tamamen haksız değil; fakat satış anlatımı kontrollü olmalıdır. Bugün en doğru konumlandırma “insan onaylı AI operasyon platformu”dur. “Tam otomatik, tüm hesapları sorunsuz yöneten ajans alternatifi” iddiası için henüz erken.
