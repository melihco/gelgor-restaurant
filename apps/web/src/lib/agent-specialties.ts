/** Her ajanın işletme odaklı uzmanlığı, canlı iş simülasyonu, çıktılar ve istatistikleri */

export interface TaskTemplate {
  id: string;
  label: string;
  description: string;
  estimatedMin: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface RecentOutput {
  id: string;
  title: string;
  type: 'text' | 'image' | 'report' | 'reply' | 'campaign';
  status: 'approved' | 'pending' | 'rejected';
  preview: string;
  completedAt: string;
}

export interface DomainStat {
  label: string;
  value: string;
  hint?: string;
  trend?: 'up' | 'down' | 'stable';
}

export interface LiveWork {
  headline: string;
  subtask: string;
  progressPct: number;
  elapsedMin: number;
  lines?: string[];
}

export interface AgentSpecialty {
  agentId: string;
  specialty: string;
  whatIDo: string;
  taskTemplates: TaskTemplate[];
  recentOutputs: RecentOutput[];
  domainStats: DomainStat[];
  liveWork: LiveWork | null;
}

const SPECIALTIES: AgentSpecialty[] = [
  {
    agentId: 'agent-ceo',
    specialty: 'Operasyon & Orkestrasyon',
    whatIDo:
      'İşletmenizden gelen brief\'leri inceler, doğru ajanlara dağıtır, bağımlılıkları çözer ve tüm filoyu hizalar.',
    taskTemplates: [
      { id: 'tp-ceo-1', label: 'Yeni brief dağıt', description: 'Yüklenen brief\'i alt görevlere böl ve atama yap', estimatedMin: 5, priority: 'critical' },
      { id: 'tp-ceo-2', label: 'Öncelikleri güncelle', description: 'Mevcut görev sırasını yeniden düzenle', estimatedMin: 3, priority: 'high' },
      { id: 'tp-ceo-3', label: 'Blokaj çöz', description: 'Bekleme durumundaki görevi öne al veya başka ajana aktar', estimatedMin: 2, priority: 'high' },
      { id: 'tp-ceo-4', label: 'Haftalık filo özeti', description: 'Tüm ajanların performans özetini hazırla', estimatedMin: 8, priority: 'medium' },
    ],
    recentOutputs: [
      { id: 'ro-ceo-1', title: 'Nisan Kampanya Brief\'i dağıtıldı', type: 'report', status: 'approved', preview: '8 göreve bölündü · 5 ajana atandı', completedAt: '2026-04-03T09:30:00Z' },
      { id: 'ro-ceo-2', title: 'Blokaj çözüldü: Reklam seti', type: 'report', status: 'approved', preview: 'Spark bekliyordu → Design token iletildi', completedAt: '2026-04-03T09:22:00Z' },
    ],
    domainStats: [
      { label: 'Bu hafta brief', value: '7', trend: 'up' },
      { label: 'Atanan görev', value: '43', trend: 'up' },
      { label: 'Ortalama dağıtım', value: '4.2 dk', trend: 'stable' },
      { label: 'Blokaj çözüm', value: '%94', trend: 'up' },
    ],
    liveWork: {
      headline: 'Nisan Sosyal Medya Brief\'i analiz ediliyor',
      subtask: 'Görev grafiği oluşturuluyor…',
      progressPct: 68,
      elapsedMin: 3,
      lines: [
        '✓ Brief okundu: 1.240 kelime',
        '✓ Öncelikler belirlendi: 3 kritik',
        '▶ Ajan eşleştirmesi yapılıyor (Pixel, Flux, Nova)…',
        '○ Bağımlılık haritası bekleniyor',
      ],
    },
  },
  {
    agentId: 'agent-review',
    specialty: 'Kalite & Onay Kapısı',
    whatIDo:
      'Yayına gitmeden önce her çıktıyı marka sesi, doğruluk ve ton açısından denetler. Onay veya revizyon talebi iletir.',
    taskTemplates: [
      { id: 'tp-rev-1', label: 'İçerik denetle', description: 'Marka sesi ve tona göre metin veya görsel kontrol', estimatedMin: 10, priority: 'high' },
      { id: 'tp-rev-2', label: 'Toplu onay', description: 'Kuyruktaki tüm bekleyen öğeleri gözden geçir', estimatedMin: 20, priority: 'medium' },
      { id: 'tp-rev-3', label: 'Revizyon talebi', description: 'Belirli bir öğe için düzeltme notları oluştur', estimatedMin: 5, priority: 'high' },
    ],
    recentOutputs: [
      { id: 'ro-rev-1', title: 'Blog Taslağı v2 — ONAYLANDI', type: 'text', status: 'approved', preview: '6 not eklendi · Yayına uygun', completedAt: '2026-04-03T09:45:00Z' },
      { id: 'ro-rev-2', title: 'IG Story Serisi — REVİZYON', type: 'image', status: 'rejected', preview: 'CTA metni marka sesine uymuyor', completedAt: '2026-04-03T09:40:00Z' },
    ],
    domainStats: [
      { label: 'Bugün incelenen', value: '12', trend: 'up' },
      { label: 'Onay oranı', value: '%78', trend: 'stable' },
      { label: 'Ortalama süre', value: '8 dk', trend: 'down' },
      { label: 'Bekleyen', value: '4', trend: 'up' },
    ],
    liveWork: {
      headline: 'Blog Taslağı v2 inceleniyor',
      subtask: 'Marka sesi kontrolü — bölüm 2/4',
      progressPct: 52,
      elapsedMin: 8,
      lines: [
        '✓ Giriş paragrafı — marka sesine uygun',
        '✓ CTA kontrol — güçlü',
        '▶ Bölüm 2: ürün iddiaları doğrulanıyor…',
        '○ Bölüm 3-4 sırada',
      ],
    },
  },
  {
    agentId: 'agent-blog',
    specialty: 'Blog & İçerik Yazarlığı',
    whatIDo:
      'İşletmeniz için SEO uyumlu blog yazıları, ürün/menü açıklamaları, bültenler ve marka odaklı metinler üretir.',
    taskTemplates: [
      { id: 'tp-blog-1', label: 'Blog yazısı yaz', description: 'SEO uyumlu uzun içerik (1500–2500 kelime)', estimatedMin: 45, priority: 'high' },
      { id: 'tp-blog-2', label: 'Menü açıklamaları', description: 'Menü kalemleri için iştah açıcı kısa açıklamalar', estimatedMin: 20, priority: 'medium' },
      { id: 'tp-blog-3', label: 'E-bülten hazırla', description: 'Aylık/haftalık bülten metni', estimatedMin: 30, priority: 'medium' },
      { id: 'tp-blog-4', label: 'Ürün/hizmet sayfası', description: 'Web sitesi için ürün veya hizmet açıklama metni', estimatedMin: 25, priority: 'medium' },
      { id: 'tp-blog-5', label: 'Sosyal medya altyazıları', description: '5 platform için uyarlanmış kısa paylaşım metni', estimatedMin: 15, priority: 'low' },
    ],
    recentOutputs: [
      { id: 'ro-blog-1', title: 'Q2 Lansmanı — Hero Blog', type: 'text', status: 'pending', preview: '2.140 kelime · SEO skoru: 92/100', completedAt: '2026-04-03T09:40:00Z' },
      { id: 'ro-blog-2', title: 'Şubat Bülteni', type: 'text', status: 'approved', preview: '820 kelime · 3 bölüm', completedAt: '2026-04-01T11:00:00Z' },
    ],
    domainStats: [
      { label: 'Bu ay yazılan', value: '14 makale', trend: 'up' },
      { label: 'Toplam kelime', value: '28.4k', trend: 'up' },
      { label: 'Ort. SEO skoru', value: '89/100', trend: 'up' },
      { label: 'Teslim oranı', value: '%96', trend: 'stable' },
    ],
    liveWork: {
      headline: '"Q2 Lansmanı — Hero Blog" yazılıyor',
      subtask: 'Bölüm 3/5: Ürün faydaları',
      progressPct: 62,
      elapsedMin: 23,
      lines: [
        '✓ Başlık & giriş tamamlandı',
        '✓ Bölüm 2: Pazar analizi yazıldı',
        '▶ Bölüm 3: Ürün faydaları yazılıyor (642/800 kelime)…',
        '○ Bölüm 4: Müşteri referansları sırada',
        '○ Bölüm 5: Sonuç & CTA sırada',
      ],
    },
  },
  {
    agentId: 'agent-social',
    specialty: 'Sosyal Medya Tasarımı',
    whatIDo:
      'Instagram feed, Facebook görselleri, carousel setleri ve kampanya tasarımları üretir. Marka kimliğine sadık kalır.',
    taskTemplates: [
      { id: 'tp-soc-1', label: 'Carousel tasarla', description: '3–7 slaytlı feed carousel seti', estimatedMin: 60, priority: 'high' },
      { id: 'tp-soc-2', label: 'Tekli feed görseli', description: 'Kampanya veya ürün için tek kare post', estimatedMin: 25, priority: 'medium' },
      { id: 'tp-soc-3', label: 'Kapak görseli', description: 'Facebook veya YouTube kanal kapağı', estimatedMin: 30, priority: 'low' },
      { id: 'tp-soc-4', label: 'Marka şablonu seti', description: 'Haftalık kullanım için yeniden kullanılabilir şablonlar', estimatedMin: 90, priority: 'medium' },
    ],
    recentOutputs: [
      { id: 'ro-soc-1', title: 'Bahar Kampanyası Carousel — 5 slayt', type: 'image', status: 'pending', preview: '1080×1080 · Soft tonlar · Marka uyumlu', completedAt: '2026-04-03T09:50:00Z' },
      { id: 'ro-soc-2', title: 'Haftalık Ürün Şablonu Seti', type: 'image', status: 'approved', preview: '6 şablon · Renk varyantları dahil', completedAt: '2026-04-01T14:00:00Z' },
    ],
    domainStats: [
      { label: 'Bu ay tasarım', value: '38', trend: 'up' },
      { label: 'Onay oranı', value: '%91', trend: 'stable' },
      { label: 'Ort. teslimat', value: '52 dk', trend: 'down' },
      { label: 'Revizyon talebi', value: '3', trend: 'down' },
    ],
    liveWork: {
      headline: '"Bahar Özel Menü" carousel tasarlanıyor',
      subtask: 'Slayt 3/5 — tipografi dengesi',
      progressPct: 54,
      elapsedMin: 32,
      lines: [
        '✓ Slayt 1: Kapak görseli — onaylandı',
        '✓ Slayt 2: Ürün öne çıkarma — bitti',
        '▶ Slayt 3: Tipografi ve renk dengesi ayarlanıyor…',
        '○ Slayt 4: CTA sayfası',
        '○ Slayt 5: Marka bitiş',
      ],
    },
  },
  {
    agentId: 'agent-ig',
    specialty: 'Instagram · Story · Reels',
    whatIDo:
      '3–7 günlük story serisi, reels kapakları, kanca metinleri ve altyazı paketleri üretir. Yayın takvimine göre hazır teslim eder.',
    taskTemplates: [
      { id: 'tp-ig-1', label: '3 günlük story serisi', description: 'Anlatı bütünlüklü hikâye serisi + altyazılar', estimatedMin: 55, priority: 'high' },
      { id: 'tp-ig-2', label: 'Reels kapağı seti', description: '5 farklı reels için kapak görseli', estimatedMin: 30, priority: 'medium' },
      { id: 'tp-ig-3', label: 'Story anket şablonu', description: 'Etkileşim artırıcı anket sticker\'lı story', estimatedMin: 20, priority: 'low' },
      { id: 'tp-ig-4', label: 'Instagram bio güncelleme', description: 'Profil biyografisi ve link sayfası içeriği', estimatedMin: 15, priority: 'low' },
    ],
    recentOutputs: [
      { id: 'ro-ig-1', title: 'IG Story Arc — 3 günlük seri', type: 'image', status: 'pending', preview: '9 kare · Kanca + ürün + CTA akışı', completedAt: '2026-04-03T09:48:00Z' },
      { id: 'ro-ig-2', title: 'Reels Kapak Seti — 5 adet', type: 'image', status: 'approved', preview: 'Marka renkleri · Metin overlay dahil', completedAt: '2026-04-02T16:00:00Z' },
    ],
    domainStats: [
      { label: 'Story üretildi', value: '127', trend: 'up' },
      { label: 'Reels kapak', value: '41', trend: 'up' },
      { label: 'Ort. etkileşim', value: '+18%', trend: 'up' },
      { label: 'Yayın oranı', value: '%88', trend: 'stable' },
    ],
    liveWork: {
      headline: '"3 Günlük Story Arc" B batch\'i render ediliyor',
      subtask: 'Kare 4/9 — ürün close-up',
      progressPct: 44,
      elapsedMin: 18,
      lines: [
        '✓ Kare 1: Kanca — "Bugün bir sürpriz var" bitti',
        '✓ Kare 2: Merak uyandırıcı — bitti',
        '✓ Kare 3: Ürün tanıtımı — bitti',
        '▶ Kare 4: Ürün close-up detayları işleniyor…',
        '○ Kare 5–9: Fiyat, CTA, swipe-up sırada',
      ],
    },
  },
  {
    agentId: 'agent-seo',
    specialty: 'SEO & Arama Stratejisi',
    whatIDo:
      'Anahtar kelime araştırması, teknik SEO denetimi, meta etiketler ve içerik SEO önerileri ile işletmenizin arama görünürlüğünü artırır.',
    taskTemplates: [
      { id: 'tp-seo-1', label: 'Anahtar kelime araştır', description: 'Sektör ve rakip bazlı kelime kümesi haritası', estimatedMin: 40, priority: 'high' },
      { id: 'tp-seo-2', label: 'Teknik SEO denetimi', description: 'Sayfa hızı, schema, dahili bağlantı kontrolü', estimatedMin: 35, priority: 'high' },
      { id: 'tp-seo-3', label: 'Meta etiket paketi', description: 'Title + description + OG tags seti', estimatedMin: 20, priority: 'medium' },
      { id: 'tp-seo-4', label: 'Rakip analizi', description: 'Top 3 rakip içerik ve backlink boşlukları', estimatedMin: 50, priority: 'medium' },
      { id: 'tp-seo-5', label: 'Yerel SEO', description: 'Google My Business optimizasyonu + yerel kelimeler', estimatedMin: 30, priority: 'high' },
    ],
    recentOutputs: [
      { id: 'ro-seo-1', title: 'Q2 Kelime Kümesi Haritası', type: 'report', status: 'approved', preview: '142 kelime · 4 küme · Trafik potansiyeli: 12k/ay', completedAt: '2026-04-03T09:30:00Z' },
      { id: 'ro-seo-2', title: 'Teknik Denetim Raporu', type: 'report', status: 'pending', preview: '23 hata · 7 öneri · Öncelik listesi dahil', completedAt: '2026-04-03T09:49:00Z' },
    ],
    domainStats: [
      { label: 'İzlenen kelime', value: '312', trend: 'up' },
      { label: 'İlk sayfa oranı', value: '%34', trend: 'up' },
      { label: 'Organik trafik', value: '+22%', trend: 'up' },
      { label: 'Teknik hata', value: '7', trend: 'down' },
    ],
    liveWork: {
      headline: 'Teknik SEO sweep tamamlanıyor',
      subtask: 'Schema markup doğrulama',
      progressPct: 78,
      elapsedMin: 31,
      lines: [
        '✓ Sayfa hızı analizi — ortalama 2.1s (iyi)',
        '✓ Dahili bağlantı haritası — 3 kopuk bağlantı bulundu',
        '▶ Schema markup doğrulama devam ediyor…',
        '○ Canonical + redirect kontrolü sırada',
      ],
    },
  },
  {
    agentId: 'agent-analytics',
    specialty: 'Analitik & Raporlama',
    whatIDo:
      'Sosyal medya, web sitesi ve satış verilerini derler; haftalık/aylık performans raporları, kanallar arası karşılaştırmalar ve öneriler üretir.',
    taskTemplates: [
      { id: 'tp-ana-1', label: 'Haftalık performans raporu', description: 'Tüm kanallar özet — sosyal, web, satış', estimatedMin: 35, priority: 'high' },
      { id: 'tp-ana-2', label: 'İçerik performans analizi', description: 'Hangi içerik tipi en çok dönüştürüyor?', estimatedMin: 25, priority: 'medium' },
      { id: 'tp-ana-3', label: 'Rakip benchmark raporu', description: 'Sektördeki diğer markaların metrikleriyle karşılaştırma', estimatedMin: 45, priority: 'medium' },
      { id: 'tp-ana-4', label: 'ROI analizi', description: 'Yapay zeka harcamaları karşısında üretilen değer', estimatedMin: 20, priority: 'low' },
    ],
    recentOutputs: [
      { id: 'ro-ana-1', title: 'Haftalık Operasyon Özeti', type: 'report', status: 'approved', preview: 'Filo verimi %94.8 · 7 teslim · 0 kritik hata', completedAt: '2026-04-03T09:35:00Z' },
      { id: 'ro-ana-2', title: 'Sosyal Medya Mart Raporu', type: 'report', status: 'approved', preview: 'Erişim +31% · En iyi: Carousel serisi', completedAt: '2026-04-01T10:00:00Z' },
    ],
    domainStats: [
      { label: 'Rapor üretildi', value: '52', trend: 'up' },
      { label: 'Veri kaynağı', value: '6 kanal', trend: 'stable' },
      { label: 'Tavsiye uygulandı', value: '%71', trend: 'up' },
      { label: 'Ort. rapor süresi', value: '28 dk', trend: 'down' },
    ],
    liveWork: {
      headline: 'Haftalık Filo Operasyon Özeti hazırlanıyor',
      subtask: '"Hazır yayın" listesi güncelleniyor',
      progressPct: 82,
      elapsedMin: 12,
      lines: [
        '✓ Görev metrikleri çekildi (7 tamamlandı, 8 devam)',
        '✓ Kanal durumu derlendi',
        '▶ "Hazır yayın" içerik listesi derleniyor…',
        '○ Anomali uyarıları kontrol ediliyor',
      ],
    },
  },
  {
    agentId: 'agent-chatbot',
    specialty: 'Google Yorumları & Müşteri İletişimi',
    whatIDo:
      'Google işletme profilinize gelen yorumları otomatik olarak izler, duygu analizi yapar ve markaya uygun yanıtlar hazırlar. Chatbot akışları ve müşteri sorularını da yönetir.',
    taskTemplates: [
      { id: 'tp-chat-1', label: 'Google yorumlarına yanıt ver', description: 'Bekleyen tüm Google yorumlarını tara ve yanıtla', estimatedMin: 15, priority: 'critical' },
      { id: 'tp-chat-2', label: 'Yorum analizi raporu', description: 'Son 30 günün duygu skoru ve trend analizi', estimatedMin: 20, priority: 'high' },
      { id: 'tp-chat-3', label: 'Olumsuz yorum müdahalesi', description: '1–2 yıldızlı yorumlar için özel yanıt + eskalasyon', estimatedMin: 10, priority: 'critical' },
      { id: 'tp-chat-4', label: 'Chatbot senaryosu güncelle', description: 'Yeni SSS ve yanıt akışı ekle', estimatedMin: 25, priority: 'medium' },
      { id: 'tp-chat-5', label: 'Müşteri şikayeti analizi', description: 'Tekrarlayan şikayet temalarını tespit et ve raporla', estimatedMin: 30, priority: 'high' },
    ],
    recentOutputs: [
      { id: 'ro-chat-1', title: 'Google Yorum Yanıtı — "Soğuk geldi" (2⭐)', type: 'reply', status: 'approved', preview: '"Değerli misafirimiz, özür dileriz. Ekibimiz bilgilendirildi…"', completedAt: '2026-04-03T09:48:00Z' },
      { id: 'ro-chat-2', title: 'Yorum Analizi — Son 30 Gün', type: 'report', status: 'approved', preview: '4.2 ★ ort. · 23 yorum · 18 yanıtlandı · +2 olumlu trend', completedAt: '2026-04-03T09:20:00Z' },
      { id: 'ro-chat-3', title: 'Google Yorum Yanıtı — "Harika!" (5⭐)', type: 'reply', status: 'approved', preview: '"Teşekkürler! Sizi tekrar görmek isteriz 🙏"', completedAt: '2026-04-03T09:10:00Z' },
    ],
    domainStats: [
      { label: 'Bu ay yorum', value: '23', trend: 'up' },
      { label: 'Yanıt oranı', value: '%78 → %96', trend: 'up' },
      { label: 'Ortalama yıldız', value: '4.2 ★', trend: 'up' },
      { label: 'Yanıtsız yorum', value: '2', trend: 'down' },
    ],
    liveWork: {
      headline: 'Google yorumu analiz ediliyor',
      subtask: 'Yanıt taslağı hazırlanıyor…',
      progressPct: 55,
      elapsedMin: 3,
      lines: [
        '🔍 Yorum: "Sipariş geç geldi ve soğuktu, personel ilgisiz." (2 ⭐)',
        '📊 Duygu analizi: Olumsuz · Tema: Hizmet kalitesi + sıcaklık',
        '▶ Yanıt taslağı oluşturuluyor…',
        '   "Değerli misafirimiz, yaşadığınız deneyim için içtenlikle özür',
        '    dileriz. Ekibimiz bu konuda bilgilendirildi. Sizi…"',
        '○ Onay için Vellum\'a gönderilecek',
      ],
    },
  },
  {
    agentId: 'agent-ads',
    specialty: 'Reklam & Büyüme Kampanyaları',
    whatIDo:
      'Meta ve Google reklamları için metin varyantları, hedef kitle setleri ve A/B test planları hazırlar. Onaylanan görsellerle reklam setlerini oluşturur.',
    taskTemplates: [
      { id: 'tp-ads-1', label: 'Reklam metni varyantları', description: '5 farklı başlık + açıklama kombinasyonu', estimatedMin: 20, priority: 'high' },
      { id: 'tp-ads-2', label: 'Meta kampanya kur', description: 'Facebook/Instagram reklam seti yapılandırması', estimatedMin: 35, priority: 'high' },
      { id: 'tp-ads-3', label: 'A/B test planı', description: 'Görsel ve metin kombinasyonları için test matrisi', estimatedMin: 25, priority: 'medium' },
      { id: 'tp-ads-4', label: 'Yeniden hedefleme seti', description: 'Ziyaretçi ve sepet terk edenler için reklam', estimatedMin: 30, priority: 'high' },
      { id: 'tp-ads-5', label: 'Reklam performans raporu', description: 'CPC, CTR, ROAS ve dönüşüm analizi', estimatedMin: 15, priority: 'medium' },
    ],
    recentOutputs: [
      { id: 'ro-ads-1', title: 'Bahar Kampanyası — 5 Metin Varyantı', type: 'campaign', status: 'pending', preview: 'Tasarım tokenı bekleniyor · Hazır bekliyor', completedAt: '2026-04-03T09:20:00Z' },
      { id: 'ro-ads-2', title: 'Mart Reklam Performans Raporu', type: 'report', status: 'approved', preview: 'ROAS: 3.2x · CTR: %2.8 · Bütçe verimli', completedAt: '2026-04-01T09:00:00Z' },
    ],
    domainStats: [
      { label: 'Aktif kampanya', value: '4', trend: 'stable' },
      { label: 'Ort. ROAS', value: '3.2x', trend: 'up' },
      { label: 'Bu ay metin', value: '24 varyant', trend: 'up' },
      { label: 'A/B test', value: '6 aktif', trend: 'stable' },
    ],
    liveWork: null,
  },
];

export function getAgentSpecialty(agentId: string): AgentSpecialty | undefined {
  return SPECIALTIES.find((s) => s.agentId === agentId);
}

export const ALL_SPECIALTIES = SPECIALTIES;
