import type { ZoneKind } from '@/lib/office-layout';

export interface ZoneCopy {
  name: string;
  subtitle: string;
}

const ZONE_COPY_BY_KIND: Record<ZoneKind, ZoneCopy> = {
  command: {
    name: 'Operasyon Merkezi',
    subtitle: 'Orkestrasyon · onay · görev akışı',
  },
  content: {
    name: 'Icerik Masasi',
    subtitle: 'Blog · yazi · icerik plani',
  },
  design: {
    name: 'Tasarim Masasi',
    subtitle: 'Sosyal medya · kreatif · marka',
  },
  analytics: {
    name: 'Performans Masasi',
    subtitle: 'SEO · analiz · raporlama',
  },
  comms: {
    name: 'Iletisim Masasi',
    subtitle: 'Yorumlar · chatbot · musteri akislar',
  },
  ads: {
    name: 'Buyume Masasi',
    subtitle: 'Reklamlar · deneyler · donusum',
  },
};

const ROLE_LABEL_BY_AGENT_TYPE: Record<string, string> = {
  AiCeo: 'Operasyon Koordinatoru',
  CustomerReviewResponder: 'Yorum Yonetimi',
  BlogWriter: 'Icerik Yazari',
  SocialMediaDesigner: 'Sosyal Tasarim',
  InstagramContentGenerator: 'Instagram Icerik',
  SeoSpecialist: 'SEO Uzmani',
  GoogleAdsAnalyst: 'Reklam Analisti',
  AnalyticsAnalyst: 'Ziyaretçi Analisti',
  ChatbotManager: 'Iletisim Otomasyonu',
  AiStrategist: 'Performans Analisti',
  UiUxDesigner: 'Deneyim Tasarimi',
  VideoEditor: 'Video Produksiyon',
  '0': 'Operasyon Koordinatoru',
  '1': 'Icerik Yazari',
  '2': 'Sosyal Tasarim',
  '3': 'Instagram Icerik',
  '4': 'Deneyim Tasarimi',
  '5': 'Video Produksiyon',
  '6': 'SEO Uzmani',
  '7': 'Reklam Analisti',
  '8': 'Yorum Yonetimi',
  '9': 'Iletisim Otomasyonu',
  '10': 'Performans Analisti',
  '11': 'Ziyaretçi Analisti',
};

export function getZoneCopy(kind: ZoneKind): ZoneCopy {
  return ZONE_COPY_BY_KIND[kind];
}

export function getProductRoleLabel(agentType: string, fallback: string): string {
  return ROLE_LABEL_BY_AGENT_TYPE[agentType] ?? fallback;
}
