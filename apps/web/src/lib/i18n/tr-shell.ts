import type { AppPage } from '@/stores/navigation-store';

/** Türkçe uygulama kabuğu: kenar çubuğu ve sayfa başlıkları (tek kaynak). */
export const TR_BRAND_SUBTITLE = 'Yapay zekâ işletim sistemi';

export const TR_NAV_GROUPS: { label: string; items: { id: AppPage; name: string }[] }[] = [
  {
    label: 'Komuta',
    items: [
      { id: 'dashboard', name: 'Yönetici özeti' },
      { id: 'agents', name: 'AI çalışan ofisi' },
      { id: 'approvals', name: 'Onaylar' },
      { id: 'executions', name: 'Çalışma merkezi' },
    ],
  },
  {
    label: 'Büyüme',
    items: [
      { id: 'content', name: 'İçerik stüdyosu' },
      { id: 'brand', name: 'Marka merkezi' },
      { id: 'reviews', name: 'Yorum yönetimi' },
      { id: 'ads', name: 'Google Ads' },
      { id: 'visitors', name: 'Analitik' },
    ],
  },
  {
    label: 'İstihbarat',
    items: [
      { id: 'outputs', name: 'Çıktı merkezi' },
      { id: 'reports', name: 'Müşteri raporları' },
      { id: 'seo', name: 'SEO istihbaratı' },
    ],
  },
  {
    label: 'Sistem',
    items: [
      { id: 'setup', name: 'Entegrasyon ve kurulum' },
      { id: 'billing', name: 'Faturalama ve kullanım' },
      { id: 'readiness', name: 'Canlıya hazırlık' },
      { id: 'settings', name: 'Ayarlar ve güvenlik' },
    ],
  },
];

export const TR_PAGE_TITLES: Record<AppPage, { title: string; subtitle: string }> = {
  dashboard: {
    title: 'Yönetici özeti',
    subtitle: 'Otonom iş yapay zekâsı sağlığı ve değer üretimi.',
  },
  agents: {
    title: 'AI çalışan ofisi',
    subtitle: 'Dijital çalışanlar, canlı görevler ve iş kuyrukları.',
  },
  reviews: {
    title: 'Yorum yönetimi',
    subtitle: 'Google İşletme itibar kokpiti.',
  },
  content: {
    title: 'İçerik stüdyosu',
    subtitle: 'Instagram ve marka içeriği için komuta odası.',
  },
  brand: {
    title: 'Marka merkezi',
    subtitle: 'Marka kiti, Canva şablonları ve yaratıcı sözleşmeler.',
  },
  ads: {
    title: 'Google Ads',
    subtitle: 'Kampanya performansı, kreatif ve bütçe analizi.',
  },
  visitors: {
    title: 'Analitik istihbaratı',
    subtitle: 'Trafik, dönüşüm ve SEO fırsat sinyalleri.',
  },
  outputs: {
    title: 'Çıktı merkezi',
    subtitle: 'Üretilen raporlar, içerik, görseller ve onay varlıkları.',
  },
  approvals: {
    title: 'Onay kontrol merkezi',
    subtitle: 'Canlı sağlayıcılara geçmeden önce yapay zekâ eylemlerini inceleyin.',
  },
  executions: {
    title: 'Çalışma merkezi',
    subtitle: 'Sağlayıcı eylem geçmişi, hatalar, yeniden denemeler ve sağlık.',
  },
  setup: {
    title: 'Kurulum',
    subtitle: 'Şirket profili, entegrasyonlar ve canlı eylem hazırlığı.',
  },
  billing: {
    title: 'Faturalama ve kullanım',
    subtitle: 'Plan, kota ve ajan çalıştırma tüketimi.',
  },
  seo: {
    title: 'SEO istihbaratı',
    subtitle: 'Arama, içerik ve yerel görünürlük fırsatları.',
  },
  readiness: {
    title: 'Canlı mod hazırlığı',
    subtitle: 'Sağlayıcı, izin ve yürütme güvenlik kontrolleri.',
  },
  reports: {
    title: 'Müşteri raporları',
    subtitle: 'Yapay zekâ çalışmasının müşteriye dönük kanıtı.',
  },
  settings: {
    title: 'Ayarlar ve güvenlik',
    subtitle: 'Roller, izinler ve kurumsal kontroller.',
  },
};

export function trPageTitle(page: AppPage) {
  return TR_PAGE_TITLES[page] ?? TR_PAGE_TITLES.dashboard;
}

export const TR_SIDEBAR_FOOTER = {
  title: 'Sistem izlemede',
  body: 'Ajanlar, onaylar ve sağlayıcı sağlığı bu çalışma alanından izlenir.',
} as const;
