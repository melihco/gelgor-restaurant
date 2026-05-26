# AI Agents Office — Müşteri Kılavuzu

Bu doküman, **SmartAgency** içindeki **AI Agents Office** (Yapay Zekâ Ajan Ofisi) kavramını ve ofiste yürüyen iş süreçlerini müşteri perspektifinden açıklar. Teknik kurulum veya API detayları yerine; **ne görürsünüz**, **ne olur**, **sizin rolünüz nedir** sorularına odaklanır.

---

## 1. AI Agents Office nedir?

**AI Agents Office**, markanız veya ajansınız için tanımlanan **sanal bir çalışma alanıdır**. Bu alanda:

- Farklı uzmanlıklara sahip **yapay zekâ ajanları** (içerik, yorum yanıtı, analitik, reklam vb.) bir arada çalışır.
- Ajanlar **görev** alır, **çıktı** üretir ve bu çıktılar **onay süreçlerinize** girer.
- İsteğe bağlı olarak, arayüzde **3 boyutlu ofis görünümü** ile ajanlar “istasyonlarda” temsil edilir; böylece hangi uzmanlığın nerede olduğu sezgisel olarak görülür.

Özetle: Ofis, **işinizi parçalara ayıran ve AI ile hızlandıran kontrol merkezinizdir** — karar ve sorumluluk sizde kalır.

---

## 2. Ofis yapısı: bölgeler ve ajanlar

Ürün tarafında ofis, **bölgeler (zone)** ve **ajan istasyonları** ile modellenir. Bölgeler; içerik stüdyosu, komuta merkezi, analitik katı, tasarım laboratuvarı, iletişim merkezi, reklam alanı gibi **işlevsel alanlara** karşılık gelir. Her bölgede, o işe uygun ajanlar konumlandırılır.

Müşteri açısından anlamı şudur:

| Bölge mantığı | Tipik iş |
|---------------|----------|
| **Komuta / koordinasyon** | Önceliklendirme, özet kararlar, operasyon akışı |
| **İçerik ve tasarım** | Sosyal medya metinleri, görseller, Instagram odaklı üretim |
| **Analitik ve SEO** | Performans yorumu, SEO odaklı öneriler |
| **Reklam** | Kampanya ve bütçe ile ilgili analiz ve öneri metinleri |
| **İletişim / yorum** | Müşteri yorumlarına yanıt taslağı, iletişim tonu |

Arayüzde 3D sahne kullanıldığında, bir bölgeye veya ajana tıklayarak **detay paneline** geçebilirsiniz; iş mantığı değişmez, sadece **görselleştirme** farklıdır.

---

## 3. Temel iş akışı (uçtan uca)

Aşağıdaki sıra, sistemde tipik bir AI işinin yaşam döngüsüdür.

### Adım A — İhtiyaç ve bağlam

- Markanız için **kurulum** (işletme bilgisi, ton, hedef kitle, entegrasyonlar) sistemde tutulur.
- Ajan çalıştırıldığında bu bağlam **otomatik olarak** göreve eklenir; böylece çıktılar markanıza uygun üretilir.

### Adım B — Görev ve çalıştırma

- Bir ajan **çalıştırıldığında** sistem bir **görev** oluşturur ve çalışmayı kayıt altına alır (**ajan çalıştırması**).
- Aboneliğinizde tanımlı **paket ve kota** (ör. aylık çalıştırma limiti, pakete dahil ajan türleri) bu aşamada kontrol edilir. Paketinizde olmayan bir ajan türü için çalıştırma istenirse sistem bunu reddeder; yükseltme veya eklenti gerekir.

### Adım C — Üretim (çıktı = artifact)

- Ajan tamamlandığında sonuç bir **çıktı dosyası (artifact)** olarak kaydedilir: örneğin yorum yanıtı metni, strateji özeti, içerik taslağı, görsel/video ile ilişkili kayıtlar vb.
- Bu çıktılar **İçerik Stüdyosu**, **Çıktılar**, **Yorum yönetimi** gibi ekranlarda listelenir.

### Adım D — İnceleme ve onay

- Varsayılan güvenli modda, çıktılar **“onay bekliyor”** durumunda kalır.
- Siz metni düzenleyebilir, **onaylayabilir** veya **geri gönderebilirsiniz**. Onay sırasında nihai metni güncellemeniz mümkündür; böylece müşteriye veya kanala gidecek söz sizin kontrolünüzdedir.

### Adım E — Önerilen aksiyonlar (isteğe bağlı son adım)

- Bazı senaryolarda sistem, harici bir kanala (ör. Google, Instagram, reklam hesabı) yönelik **“önerilen aksiyon”** üretebilir.
- Bu aksiyonlar yine **onay** ister.
- Uygulama sırasında genellikle önce **dry-run (test)** ile gerçek hesaba yazmadan doğrulama yapılır; **canlı (live)** uygulama ise hem yetki hem de **paket kotası** (özellikle canlı işlem limiti) ile sınırlanır. Starter gibi paketlerde canlı işlem kotası sıfır olabilir; bu durumda canlı adım engellenir, test modu kullanılır.

---

## 4. Çok adımlı iş: “Growth Recovery” iş akışı

Ürün içinde, analitikten içeriğe ve yönetici özetine uzanan **dört aşamalı bir iş akışı** tanımlanabilir (ör. analitik → reklam analizi → içerik desteği → yönetici özeti). Bu akış:

- Tek seferde **birden fazla görev** ve **görev bağımlılıkları** oluşturur.
- Paketinizde **bu akıştaki tüm ajan türleri** yoksa akış başlatılamaz; paket yükseltmesi gerekir.

Müşteri mesajı: Bu özellik **“tam ofis orkestrasyonu”** sunar; ancak **paket kapsamınız** ile uyumlu olmalıdır.

---

## 5. Anlık bildirimler

Sistem, görev durumu değişimi veya yeni çıktı hazır olduğunda **anlık bildirim** gönderebilir. Böylece panelde beklemenize gerek kalmadan **“çıktı hazır”** veya **“görev güncellendi”** bilgisini alırsınız.

---

## 6. Roller ve güvenlik (özet)

- Kullanıcılar **roller** ile yönetilir (ör. yönetici, operatör, inceleyici). **Ajan çalıştırma**, **inceleme**, **dry-run / canlı uygulama** gibi yetkiler role göre açılır veya kapanır.
- **Canlı** dış dünyaya yazma işlemleri, hem yetki hem kota ile korunur; böylece yanlışlıkla toplu canlı aksiyon riski azaltılır.

---

## 7. Müşteri olarak sizden beklenenler (en iyi uygulama)

1. **Kurulumu tamamlayın** — marka tonu, hedef, varsa hesap bağlantıları; çıktı kalitesi doğrudan buna bağlıdır.  
2. **Onay kültürü oluşturun** — özellikle olumsuz yorum yanıtları ve reklam metinlerinde insan kontrolü şarttır.  
3. **Önce test, sonra canlı** — entegrasyonlar yeni ise dry-run ile akışı doğrulayın.  
4. **Paketinizi bilin** — hangi ajanların dahil olduğu ve aylık limitler; bütçe ve beklenti yönetimi için önemlidir.

---

## 8. Bu dokümanın sınırları

- Bu metin **ürün davranışını** açıklar; **hukuki / mali taahhüt** oluşturmaz.  
- Harici platformların (Meta, Google vb.) kendi kuralları, API limitleri ve hesap doğrulamaları geçerlidir; SmartAgency bu kuralların dışında değildir.  
- Üç boyutlu ofis görünümü **görsel bir katmandır**; asıl değer **görev, çıktı, onay ve kota** katmanlarındadır.

---

*Son güncelleme: ürün sürümüne göre ekran isimleri veya adım etiketleri değişebilir; iş akışı mantığı aynı kalacak şekilde tasarlanmıştır.*
