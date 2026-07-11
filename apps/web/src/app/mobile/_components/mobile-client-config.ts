/**
 * Mobile app surface for end clients (venue owners) vs agency operators.
 * Default: client mode — internal tooling hidden from menus and deep links redirect.
 *
 * Agency staff: set NEXT_PUBLIC_MOBILE_OPERATOR_MODE=true in .env.local
 */
import type { MobileScreen } from './mobile-store';

export function isMobileOperatorMode(): boolean {
  return process.env.NEXT_PUBLIC_MOBILE_OPERATOR_MODE === 'true';
}

/** Story/modal portalları — masaüstünde .sa-mobile-frame içinde kalır (tam tarayıcı değil). */
export function getMobilePortalRoot(): HTMLElement {
  if (typeof document === 'undefined') {
    throw new Error('getMobilePortalRoot requires document');
  }
  return document.querySelector<HTMLElement>('.sa-mobile-frame') ?? document.body;
}

/** Maliyet, API dökümü ve operasyon araçları — ajans / geliştirme. */
export function isDebugUiMode(): boolean {
  return (
    isMobileOperatorMode()
    || process.env.NEXT_PUBLIC_DEBUG_UI === 'true'
  );
}

/** Not listed in tab / More menu; still reachable when linked from a mission flow. */
export const FLOW_MOBILE_SCREENS = new Set<MobileScreen>([
  'creative-preview',
  'approval',
  'new-brief',
  'platform-preview',
  'mission-factory',
  'campaign-detail',
  'review-detail',
]);

/** Hidden from clients — redirect to a safe screen. */
export const INTERNAL_MOBILE_SCREENS = new Set<MobileScreen>([
  'agents',
  'ai-activity',
  'brand-rules',
  'campaigns',
  'outputs',
  'templates',
]);

const REDIRECT_MAP: Partial<Record<MobileScreen, MobileScreen>> = {
  outputs: 'feed',
  templates: 'brand',
  campaigns: 'missions',
  'campaign-detail': 'missions',
  agents: 'feed',
  'ai-activity': 'feed',
  'brand-rules': 'brand',
};

export function resolveClientScreen(screen: MobileScreen): MobileScreen {
  if (isMobileOperatorMode()) return screen;
  return REDIRECT_MAP[screen] ?? (INTERNAL_MOBILE_SCREENS.has(screen) ? 'feed' : screen);
}

/** Keep bottom tab highlight in sync when opening screens from deep links. */
export function tabForMobileScreen(screen: MobileScreen): ClientNavTab | null {
  if (screen === 'feed' || screen === 'outputs' || screen === 'creative-preview' || screen === 'approval' || screen === 'platform-preview') {
    return 'feed';
  }
  if (screen === 'missions' || screen === 'mission-factory' || screen === 'campaigns' || screen === 'campaign-detail') {
    return 'missions';
  }
  if (screen === 'brand' || screen === 'brand-rules' || screen === 'templates') {
    return 'brand';
  }
  if (screen === 'more' || screen === 'settings' || screen === 'billing' || screen === 'notifications' || screen === 'insights' || screen === 'ads' || screen === 'visitors' || screen === 'new-brief' || screen === 'reviews' || screen === 'review-detail') {
    return null;
  }
  return null;
}

/** Bottom bar tabs — Feed · Marka (center) · Plan */
export type ClientNavTab = 'feed' | 'missions' | 'brand';

/**
 * Side tabs + center brand star (see BrandNavStar).
 */
export const CLIENT_NAV_TABS: { id: ClientNavTab; label: string; icon: string; active: string; idle: string }[] = [
  {
    id: 'feed',
    label: 'Feed',
    icon: 'M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM7 10h10M7 14h6',
    active: 'M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM7 10h10M7 14h6',
    idle:   'M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM7 10h10M7 14h6',
  },
  {
    id: 'brand',
    label: 'Marka',
    icon: 'M12 2.5l2.8 8.6h9.1l-7.4 5.4 2.8 8.6L12 19.6l-7.3 5.5 2.8-8.6-7.4-5.4h9.1z',
    active: 'M12 2.5l2.8 8.6h9.1l-7.4 5.4 2.8 8.6L12 19.6l-7.3 5.5 2.8-8.6-7.4-5.4h9.1z',
    idle:   'M12 2.5l2.8 8.6h9.1l-7.4 5.4 2.8 8.6L12 19.6l-7.3 5.5 2.8-8.6-7.4-5.4h9.1z',
  },
  {
    id: 'missions',
    label: 'Plan',
    icon: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01',
    active: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01',
    idle:   'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01',
  },
];

export type MoreMenuItem = {
  label: string;
  sub: string;
  iconBg: string;
  iconText: string;
  screen: MobileScreen;
  badge?: string | number;
  operatorOnly?: boolean;
};

export function buildMoreMenuGroups(opts: { canvaEnabled?: boolean; connectedCount: number; integrationTotal: number }): {
  title: string;
  items: MoreMenuItem[];
}[] {
  const clientGroups: { title: string; items: MoreMenuItem[] }[] = [
    {
      title: 'Marka & Ayarlar',
      items: [
        { label: 'Marka Ayarları', sub: 'Logo, renkler, galeri, AI tercihleri', iconBg: '#60a5fa', iconText: '◈', screen: 'brand' },
        { label: 'Performans', sub: 'Sosyal medya özet metrikleri', iconBg: '#34d399', iconText: '↗', screen: 'insights' },
        {
          label: 'Entegrasyonlar',
          sub: `${opts.connectedCount}/${opts.integrationTotal} bağlı`,
          iconBg: '#34d399',
          iconText: '⟳',
          screen: 'settings',
          badge: opts.connectedCount < opts.integrationTotal ? '!' : undefined,
        },
        { label: 'Bildirimler', sub: 'Onay ve üretim bildirimleri', iconBg: '#60a5fa', iconText: '◍', screen: 'notifications' },
        { label: 'Kullanım & Plan', sub: 'Kredi ve aylık kullanım', iconBg: '#9DBECE', iconText: '◇', screen: 'billing' },
      ],
    },
    {
      title: 'Büyüme',
      items: [
        { label: 'Google Yorumları', sub: 'Yorum yanıtlama ve itibar', iconBg: '#f59e0b', iconText: '💬', screen: 'reviews' },
        { label: 'Reklamlar', sub: 'Meta ve Google kampanyaları', iconBg: '#f59e0b', iconText: '📣', screen: 'ads' },
        { label: 'Web Trafiği', sub: 'Site ziyaretçi özeti', iconBg: '#60a5fa', iconText: '🌐', screen: 'visitors' },
      ],
    },
  ];

  if (!isMobileOperatorMode()) return clientGroups;

  return [
    ...clientGroups,
    {
      title: 'Ajans Operasyonları',
      items: [
        { label: 'AI Aktivite', sub: 'Ajan logları ve canlı üretim', iconBg: '#10b981', iconText: '◎', screen: 'ai-activity', operatorOnly: true },
        { label: 'AI Ajanlar', sub: 'Ajan sağlığı ve görevler', iconBg: '#9DBECE', iconText: '◉', screen: 'agents', operatorOnly: true },
        { label: 'Marka Kuralları', sub: 'Öğrenme ve onay önerileri', iconBg: '#10b981', iconText: '◈', screen: 'brand-rules', operatorOnly: true },
        { label: 'Story Şablonları', sub: 'Remotion kütüphanesi', iconBg: '#60a5fa', iconText: '▶', screen: 'templates', operatorOnly: true },
        { label: 'Çıktılar (ham)', sub: 'Tüm artifact listesi', iconBg: '#64748b', iconText: '▤', screen: 'outputs', operatorOnly: true },
      ],
    },
  ];
}
