# Creative Production Manual QA Checklist

Bu checklist ilk müşteri kurulumlarında Brand Hub, Content Studio ve Output Center akışının uçtan uca doğrulanması için kullanılır.

## 1. Tenant Setup

- Şirket profili dolu: brand name, industry, target audience, tone, colors, logo rules.
- Content needs seçili ve tenant sektörüne uygun.
- Risk rules ve approval policy tenant için anlamlı.
- Brand/template summary müşteri tarafından onaylandı.

## 2. Brand Hub

- Canva OAuth bağlı veya renderer provider durumu açık.
- En az bir approved template var.
- Template dataset boş değil.
- Required fields eksiksiz: headline, caption/body, cta gibi temel alanlar contract ile uyumlu.
- Template risk tier doğru: low/medium/high/blocked.
- Manual approval required alanı orta/yüksek riskli template'lerde doğru.
- Required asset intents tenant asset inventory ile eşleşiyor.
- Health dashboard'da `missing required`, `blocked` veya `needs review` varsa aksiyon sahibi belli.

## 3. Content Studio

- Aynı brief için en az bir eligible AI template match dönüyor.
- Match kartı eligibility, risk tier, policy warnings ve missing asset/field bilgilerini gösteriyor.
- Manual override seçildiğinde kullanıcı uyarısı görünüyor.
- Blocked template ile render denendiğinde Canva job başlamıyor ve hata nedeni okunabilir.
- Missing field varsa tek soru/eksik bilgi akışı tetikleniyor.

## 4. Render / Export

- Render job id ve selected template Output Center'da görünüyor.
- Export preview üretilebiliyor.
- Export retry başarısız olursa failure category okunabilir.
- Renderer provider lineage içinde görünüyor.
- Used asset ids veya asset intents izlenebilir.

## 5. Approval / Publish Readiness

- Low risk output approval gerektirmiyorsa policy buna izin veriyor.
- Medium/high risk output approval required olarak işaretleniyor.
- Approved/rejected kararları Output Center approval history içinde görünüyor.
- Publish öncesi exported preview doğru içerik, doğru tenant ve doğru template ile üretilmiş.

## 6. Failure Triage

- Rate limit hatası `rate_limited` olarak kategorize ediliyor.
- OAuth/token sorunu `auth` olarak kategorize ediliyor.
- Template yok veya contract hatası `missing_template` / `missing_fields` olarak kategorize ediliyor.
- Policy block `policy_blocked` olarak kategorize ediliyor.
- Provider 5xx veya network sorunu `provider_unavailable` / `provider_error` olarak kategorize ediliyor.

## Exit Criteria

- Operasyon ekibi tek tenant için "neden üretim yapamadı?" sorusuna Brand Hub health, Content Studio policy result ve Output Center render panelinden cevap verebiliyor.
- En az bir post/story/reel output'u approved template ile render edilip export preview olarak izlenebiliyor.
