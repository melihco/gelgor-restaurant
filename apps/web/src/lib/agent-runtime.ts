export type RuntimeTaskTemplate = {
  id: string;
  group: string;
  label: string;
  description: string;
  estimatedMin: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  taskType: string;
  buildInput: (customNote?: string) => Record<string, unknown>;
};

export type RuntimeAgentProfile = {
  specialty: string;
  whatIDo: string;
  supported: boolean;
  taskTemplates: RuntimeTaskTemplate[];
};

const today = () => new Date().toISOString().slice(0, 10);

function reviewResponseTemplate(
  id: string,
  group: string,
  label: string,
  description: string,
  priority: RuntimeTaskTemplate['priority'],
  defaults: {
    reviewerName: string;
    rating: number;
    reviewText: string;
    language?: string;
  }
): RuntimeTaskTemplate {
  return {
    id,
    group,
    label,
    description,
    estimatedMin: 2,
    priority,
    taskType: 'single_review_response',
    buildInput: (customNote) => ({
      reviewerName: defaults.reviewerName,
      rating: defaults.rating,
      reviewText: customNote || defaults.reviewText,
      reviewDate: today(),
      language: defaults.language ?? 'tr',
    }),
  };
}

function reviewAnalysisTemplate(
  id: string,
  group: string,
  label: string,
  description: string,
  priority: RuntimeTaskTemplate['priority']
): RuntimeTaskTemplate {
  return {
    id,
    group,
    label,
    description,
    estimatedMin: 3,
    priority,
    taskType: 'review_analysis',
    buildInput: () => ({}),
  };
}

function contentIdeaTemplate(
  id: string,
  group: string,
  label: string,
  description: string,
  priority: RuntimeTaskTemplate['priority'],
  count: number,
  timePeriod: string
): RuntimeTaskTemplate {
  return {
    id,
    group,
    label,
    description,
    estimatedMin: 4,
    priority,
    taskType: 'content_ideation',
    buildInput: (customNote) => ({
      count,
      timePeriod: customNote || timePeriod,
    }),
  };
}

function contentCalendarTemplate(
  id: string,
  group: string,
  label: string,
  description: string,
  priority: RuntimeTaskTemplate['priority'],
  durationDays: number,
  frequency: string
): RuntimeTaskTemplate {
  return {
    id,
    group,
    label,
    description,
    estimatedMin: 5,
    priority,
    taskType: 'content_calendar',
    buildInput: (customNote) => ({
      durationDays,
      frequency,
      planningNote: customNote || '',
    }),
  };
}

function adsAnalysisTemplate(
  id: string,
  group: string,
  label: string,
  description: string,
  priority: RuntimeTaskTemplate['priority'],
  campaignData: string
): RuntimeTaskTemplate {
  return {
    id,
    group,
    label,
    description,
    estimatedMin: 4,
    priority,
    taskType: 'campaign_analysis',
    buildInput: (customNote) => ({
      campaignData: customNote || campaignData,
    }),
  };
}

function adsCreativeTemplate(
  id: string,
  group: string,
  label: string,
  description: string,
  priority: RuntimeTaskTemplate['priority'],
  defaults: {
    platform: string;
    objective: string;
    count: number;
    campaignData?: string;
  }
): RuntimeTaskTemplate {
  return {
    id,
    group,
    label,
    description,
    estimatedMin: 4,
    priority,
    taskType: 'ad_creative_generation',
    buildInput: (customNote) => ({
      platform: defaults.platform,
      objective: defaults.objective,
      count: defaults.count,
      campaignData: customNote || defaults.campaignData || '',
    }),
  };
}

function analyticsTemplate(
  id: string,
  group: string,
  label: string,
  description: string,
  priority: RuntimeTaskTemplate['priority'],
  taskType: 'traffic_analysis' | 'conversion_report' | 'weekly_performance',
  defaultDateRange = '30daysAgo'
): RuntimeTaskTemplate {
  return {
    id,
    group,
    label,
    description,
    estimatedMin: 4,
    priority,
    taskType,
    buildInput: (customNote) => ({
      dateRange: defaultDateRange,
      analysisNote: customNote || '',
    }),
  };
}

const PROFILES: Record<string, RuntimeAgentProfile> = {
  /* ── Review Crew ── */
  CustomerReviewResponder: {
    specialty: 'Review Agent · Google yorum analizi',
    whatIDo:
      'Google yorumlarını analiz eder, hassasiyet ve aciliyet çıkarır, markaya uygun yanıt taslakları üretir.',
    supported: true,
    taskTemplates: [
      reviewAnalysisTemplate(
        'exec-review-scan',
        'İzleme',
        'Bekleyen yorumları tara',
        'Yanıtsız yorumları analiz et ve önceliklendir',
        'critical'
      ),
      reviewResponseTemplate(
        'exec-review-response',
        'Yanıt Üretimi',
        'Tek yorum yanıtı hazırla',
        'Bir müşteri yorumu için analiz + yanıt taslağı üret',
        'high',
        {
          reviewerName: 'Misafir',
          rating: 3,
          reviewText: 'Mekan güzeldi ama servis biraz yavaştı. Genel olarak fena değildi.',
        }
      ),
      reviewResponseTemplate(
        'exec-review-negative',
        'Kriz Yönetimi',
        'Olumsuz yoruma profesyonel yanıt üret',
        'Düşük puanlı bir yorum için sakin ve telafi odaklı yanıt oluştur',
        'critical',
        {
          reviewerName: 'Misafir',
          rating: 1,
          reviewText: 'Siparişim geç geldi ve ekip hiç yardımcı olmadı.',
        }
      ),
      reviewResponseTemplate(
        'exec-review-english',
        'Yanıt Üretimi',
        'İngilizce yorum yanıtı hazırla',
        'Yabancı müşteriler için İngilizce ve marka tonuna uygun yanıt yaz',
        'medium',
        {
          reviewerName: 'Guest',
          rating: 4,
          reviewText: 'Great view and warm atmosphere, but service was a bit slow.',
          language: 'en',
        }
      ),
    ],
  },

  ChatbotManager: {
    specialty: 'İletişim Otomasyonu · Müşteri yanıt yönetimi',
    whatIDo:
      'Müşteri iletişimlerini yönetir, yanıt taslakları oluşturur ve iletişim kalitesini artırır.',
    supported: true,
    taskTemplates: [
      reviewAnalysisTemplate(
        'exec-chatbot-scan',
        'Kuyruk Yönetimi',
        'İletişim kuyruğunu tara',
        'Yanıt bekleyen mesajları analiz et ve önceliklendir',
        'high'
      ),
      reviewResponseTemplate(
        'exec-chatbot-response',
        'Müşteri Yanıtları',
        'Müşteri mesajı yanıtla',
        'Gelen bir müşteri mesajı için uygun yanıt oluştur',
        'high',
        {
          reviewerName: 'Müşteri',
          rating: 3,
          reviewText: 'Ürünüm hakkında bilgi almak istiyorum.',
        }
      ),
      reviewResponseTemplate(
        'exec-chatbot-faq',
        'Otomasyon',
        'Sık sorulan soruya yanıt hazırla',
        'Çalışma saatleri, fiyat veya hizmet kapsamı için kısa yanıt oluştur',
        'medium',
        {
          reviewerName: 'Ziyaretçi',
          rating: 4,
          reviewText: 'Hafta sonu açık mısınız ve rezervasyon gerekiyor mu?',
        }
      ),
      reviewResponseTemplate(
        'exec-chatbot-escalation',
        'Kriz Yönetimi',
        'Şikayeti de-escalate et',
        'Gerilimli bir müşteri mesajı için sakinleştirici ilk yanıt oluştur',
        'critical',
        {
          reviewerName: 'Müşteri',
          rating: 1,
          reviewText: 'Ücret iadesi istiyorum, aksi halde şikayet edeceğim.',
        }
      ),
    ],
  },

  /* ── Content Crew ── */
  SocialMediaDesigner: {
    specialty: 'Content Agent · Sosyal medya içerik üretimi',
    whatIDo:
      'Instagram ve sosyal medya için içerik fikirleri, kampanya açısı ve yayın önerileri üretir.',
    supported: true,
    taskTemplates: [
      contentIdeaTemplate(
        'exec-content-ideas',
        'Kampanya Fikirleri',
        'İçerik fikirleri üret',
        'Önümüzdeki dönem için içerik konseptleri hazırla',
        'high',
        5,
        'gelecek hafta'
      ),
      contentIdeaTemplate(
        'exec-social-campaign',
        'Kampanya Fikirleri',
        'Sosyal kampanya konseptleri çıkar',
        'Dönemsel kampanya için yaratıcı sosyal medya açıları oluştur',
        'high',
        6,
        'gelecek kampanya dönemi'
      ),
      contentCalendarTemplate(
        'exec-content-calendar',
        'Planlama',
        'İçerik takvimi oluştur',
        'Kısa dönem paylaşım takvimi üret',
        'medium',
        7,
        'daily'
      ),
      contentCalendarTemplate(
        'exec-social-launch',
        'Planlama',
        'Lansman paylaşım akışı kur',
        'Ürün veya kampanya lansmanı için yayın akışı öner',
        'high',
        10,
        'daily'
      ),
    ],
  },

  InstagramContentGenerator: {
    specialty: 'Content Agent · Instagram içerik akışı',
    whatIDo:
      'Instagram odaklı post/story/reel fikirleri, başlıklar ve yayın akışı oluşturur.',
    supported: true,
    taskTemplates: [
      contentIdeaTemplate(
        'exec-ig-ideas',
        'Instagram Fikirleri',
        'Instagram konseptleri üret',
        'Story, reel ve post fikirleri hazırla',
        'high',
        6,
        'önümüzdeki 10 gün'
      ),
      contentIdeaTemplate(
        'exec-ig-reels',
        'Instagram Fikirleri',
        'Reel serisi öner',
        'Düzenli reel yayını için seri formatları üret',
        'high',
        5,
        'bu ay'
      ),
      contentCalendarTemplate(
        'exec-ig-calendar',
        'Yayın Planı',
        'Instagram yayın planı oluştur',
        '7 günlük paylaşım akışı çıkar',
        'medium',
        7,
        'daily'
      ),
      contentCalendarTemplate(
        'exec-ig-stories',
        'Yayın Planı',
        'Story akışı planla',
        'Günlük story frekansı için hafif bir operasyon planı kur',
        'medium',
        5,
        'twice_daily'
      ),
    ],
  },

  BlogWriter: {
    specialty: 'İçerik Yazarı · Blog ve uzun form içerik',
    whatIDo:
      'Blog yazıları, makaleler ve uzun form içerikler için konu fikirleri ve taslaklar üretir.',
    supported: true,
    taskTemplates: [
      contentIdeaTemplate(
        'exec-blog-ideas',
        'Editoryal Strateji',
        'Blog konu fikirleri üret',
        'SEO uyumlu blog konuları ve başlık önerileri hazırla',
        'high',
        5,
        'bu ay'
      ),
      contentIdeaTemplate(
        'exec-blog-briefs',
        'Editoryal Strateji',
        'Blog brief başlıkları çıkar',
        'Yazar ekibine verilebilecek net blog brief konuları oluştur',
        'high',
        4,
        'önümüzdeki sprint'
      ),
      contentCalendarTemplate(
        'exec-blog-calendar',
        'Yayın Takvimi',
        'Blog yayın takvimi oluştur',
        'Haftalık blog içerik planı çıkar',
        'medium',
        14,
        'every_3_days'
      ),
      contentCalendarTemplate(
        'exec-blog-series',
        'Yayın Takvimi',
        'İçerik serisi planla',
        'Tek tema etrafında seri blog akışı oluştur',
        'medium',
        21,
        'twice_weekly'
      ),
    ],
  },

  SeoSpecialist: {
    specialty: 'SEO Uzmanı · Arama motoru optimizasyonu',
    whatIDo:
      'SEO stratejisi, anahtar kelime analizi ve arama optimizasyonu için içerik önerileri üretir.',
    supported: true,
    taskTemplates: [
      contentIdeaTemplate(
        'exec-seo-keywords',
        'SEO Araştırması',
        'Anahtar kelime fırsatları çıkar',
        'Anahtar kelime odaklı içerik fikirleri ve optimizasyon önerileri üret',
        'critical',
        6,
        'önümüzdeki 2 hafta'
      ),
      contentIdeaTemplate(
        'exec-seo-local',
        'SEO Araştırması',
        'Local SEO önerileri üret',
        'Google Business ve bölgesel görünürlük için fırsat alanları çıkar',
        'high',
        5,
        'bu ay'
      ),
      contentCalendarTemplate(
        'exec-seo-calendar',
        'İçerik Planlama',
        'SEO içerik takvimi oluştur',
        'SEO odaklı yayın planı çıkar',
        'medium',
        14,
        'every_3_days'
      ),
      contentCalendarTemplate(
        'exec-seo-briefs',
        'İçerik Planlama',
        'SEO blog brief planı kur',
        'Blog ekibi için SEO öncelikli içerik dizisi oluştur',
        'high',
        21,
        'twice_weekly'
      ),
    ],
  },

  UiUxDesigner: {
    specialty: 'Deneyim Tasarımı · UI/UX konseptleri',
    whatIDo:
      'Kullanıcı deneyimi ve arayüz tasarımı için konsept fikirleri ve görsel yönlendirmeler üretir.',
    supported: true,
    taskTemplates: [
      contentIdeaTemplate(
        'exec-ux-ideas',
        'Deneyim Keşfi',
        'Tasarım konseptleri üret',
        'UI/UX iyileştirme ve tasarım fikirleri hazırla',
        'medium',
        4,
        'sprint planlama'
      ),
      contentIdeaTemplate(
        'exec-ux-flow',
        'Deneyim Keşfi',
        'Kullanıcı akışı önerileri çıkar',
        'Bir ekran veya funnel için deneyim akışı önerileri üret',
        'high',
        4,
        'mevcut funnel revizyonu'
      ),
      contentCalendarTemplate(
        'exec-ux-sprint',
        'Teslim Planı',
        'Tasarım sprint planı oluştur',
        'Ekran revizyonlarını kısa sprint bloklarına ayır',
        'medium',
        10,
        'every_2_days'
      ),
    ],
  },

  VideoEditor: {
    specialty: 'Video Prodüksiyon · Video içerik planlaması',
    whatIDo:
      'Video içerik fikirleri, senaryo taslakları ve yayın planı oluşturur.',
    supported: true,
    taskTemplates: [
      contentIdeaTemplate(
        'exec-video-ideas',
        'Video Fikirleri',
        'Video konseptleri üret',
        'Reel, story ve video içerik fikirleri hazırla',
        'high',
        5,
        'gelecek hafta'
      ),
      contentIdeaTemplate(
        'exec-video-series',
        'Video Fikirleri',
        'Video serisi formatı öner',
        'Düzenli tekrar edebilecek video formatları çıkar',
        'high',
        4,
        'gelecek ay'
      ),
      contentCalendarTemplate(
        'exec-video-calendar',
        'Prodüksiyon Planı',
        'Video yayın takvimi oluştur',
        'Haftalık video içerik planı çıkar',
        'medium',
        7,
        'daily'
      ),
      contentCalendarTemplate(
        'exec-video-production',
        'Prodüksiyon Planı',
        'Çekim ve yayın akışı kur',
        'Çekim günü ile paylaşım gününü koordine eden plan oluştur',
        'medium',
        10,
        'every_2_days'
      ),
    ],
  },

  /* ── Ads Crew ── */
  GoogleAdsAnalyst: {
    specialty: 'Ads Agent · Kampanya ve büyüme analizi',
    whatIDo:
      'Kampanya performansını analiz eder, bütçe ve kreatif optimizasyon önerileri üretir.',
    supported: true,
    taskTemplates: [
      adsAnalysisTemplate(
        'exec-ads-analysis',
        'Performans Analizi',
        'Kampanya analizi çalıştır',
        'Reklam performansını analiz edip aksiyon önerileri üret',
        'high',
        ''
      ),
      adsAnalysisTemplate(
        'exec-ads-budget',
        'Performans Analizi',
        'Bütçe optimizasyonu öner',
        'Bütçe dağılımı ve verimsiz harcamalar için öneriler üret',
        'critical',
        'budget_focus'
      ),
      adsCreativeTemplate(
        'exec-ads-creative',
        'Kreatif Üretim',
        'Reklam kreatifleri üret',
        'Başlık ve kreatif açı önerileri oluştur',
        'medium',
        {
          platform: 'google_ads',
          objective: 'conversions',
          count: 3,
        }
      ),
      adsCreativeTemplate(
        'exec-ads-copy',
        'Kreatif Üretim',
        'Farklı reklam mesajları oluştur',
        'A/B testi için alternatif mesaj ve vaatler üret',
        'high',
        {
          platform: 'google_ads',
          objective: 'ctr_improvement',
          count: 4,
        }
      ),
    ],
  },

  AiStrategist: {
    specialty: 'Performans Analisti · Strateji ve analitik',
    whatIDo:
      'Kampanya stratejisi, performans analizi ve büyüme önerileri üretir.',
    supported: true,
    taskTemplates: [
      adsAnalysisTemplate(
        'exec-strategy-analysis',
        'Stratejik Analiz',
        'Strateji analizi çalıştır',
        'Mevcut performansı analiz et ve strateji önerileri üret',
        'high',
        ''
      ),
      adsAnalysisTemplate(
        'exec-strategy-funnel',
        'Stratejik Analiz',
        'Funnel darboğazlarını çıkar',
        'Hangi aşamada kayıp yaşandığını ve nedenlerini yorumla',
        'critical',
        'funnel_review'
      ),
      adsCreativeTemplate(
        'exec-strategy-creative',
        'Büyüme Senaryoları',
        'Büyüme senaryoları oluştur',
        'Farklı bütçe ve hedef senaryoları için öneriler oluştur',
        'medium',
        {
          platform: 'multi_channel',
          objective: 'growth',
          count: 3,
        }
      ),
      adsCreativeTemplate(
        'exec-strategy-tests',
        'Büyüme Senaryoları',
        'Deney backlog’u üret',
        'Önceliklendirilebilir growth test önerileri hazırla',
        'high',
        {
          platform: 'multi_channel',
          objective: 'experiments',
          count: 5,
        }
      ),
    ],
  },

  AiCeo: {
    specialty: 'Operasyon Koordinatörü · Genel yönetim ve orkestrasyon',
    whatIDo:
      'Tüm operasyonu koordine eder, performans özetleri ve aksiyon planları oluşturur.',
    supported: true,
    taskTemplates: [
      adsAnalysisTemplate(
        'exec-ceo-overview',
        'Yönetim Özeti',
        'Operasyon özeti çıkar',
        'Tüm kanalların performans özetini ve öncelikli aksiyonları belirle',
        'critical',
        'full_overview'
      ),
      adsAnalysisTemplate(
        'exec-ceo-risk',
        'Yönetim Özeti',
        'Risk ve darboğaz raporu üret',
        'Operasyondaki gecikme ve risk alanlarını görünür hale getir',
        'critical',
        'risk_audit'
      ),
      adsCreativeTemplate(
        'exec-ceo-plan',
        'Operasyon Planı',
        'Haftalık aksiyon planı oluştur',
        'Tüm ekip için koordineli haftalık plan üret',
        'high',
        {
          platform: 'all_channels',
          objective: 'weekly_plan',
          count: 5,
        }
      ),
      adsCreativeTemplate(
        'exec-ceo-priority',
        'Operasyon Planı',
        'Öncelik listesi çıkar',
        'Ekip ve kanal bazında en kritik işleri sıralı biçimde belirle',
        'high',
        {
          platform: 'all_channels',
          objective: 'priority_alignment',
          count: 4,
        }
      ),
    ],
  },

  AnalyticsAnalyst: {
    specialty: 'Analytics Agent · GA4, Search Console ve dönüşüm analizi',
    whatIDo:
      'Ziyaretçi trafiği, arama performansı, sayfa kalitesi ve dönüşüm verilerini yorumlayarak uygulanabilir büyüme raporları üretir.',
    supported: true,
    taskTemplates: [
      analyticsTemplate(
        'exec-analytics-traffic',
        'Trafik Analizi',
        'Trafik analiz raporu üret',
        'GA4 ve kanal verilerinden ziyaretçi performansını analiz et',
        'high',
        'traffic_analysis',
        '30daysAgo'
      ),
      analyticsTemplate(
        'exec-analytics-conversions',
        'Dönüşüm Analizi',
        'Dönüşüm raporu üret',
        'Dönüşüm olayları, kaynaklar ve darboğazlar için aksiyon önerileri çıkar',
        'critical',
        'conversion_report',
        '30daysAgo'
      ),
      analyticsTemplate(
        'exec-analytics-weekly',
        'Haftalık Rapor',
        'Haftalık performans özeti hazırla',
        'Yönetici özeti, kazanç/kayıp ve takip KPI listesini üret',
        'medium',
        'weekly_performance',
        '7daysAgo'
      ),
    ],
  },
};

const UNSUPPORTED_PROFILE: RuntimeAgentProfile = {
  specialty: 'Bu ajan için gerçek execution henüz bağlı değil',
  whatIDo:
    'Bu ajanın görsel ve operasyonel temsili hazır, ancak CrewAI execution mapping henüz bağlanmadı.',
  supported: false,
  taskTemplates: [],
};

export function getRuntimeAgentProfile(agentType: string): RuntimeAgentProfile {
  return PROFILES[agentType] ?? UNSUPPORTED_PROFILE;
}
