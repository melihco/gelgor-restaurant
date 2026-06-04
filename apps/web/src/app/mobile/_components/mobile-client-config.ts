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
  'reels-studio',
  'canva-templates',
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
  agents: 'home',
  'ai-activity': 'home',
  'reels-studio': 'more',
  'canva-templates': 'more',
  'brand-rules': 'brand',
};

export function resolveClientScreen(screen: MobileScreen): MobileScreen {
  if (isMobileOperatorMode()) return screen;
  return REDIRECT_MAP[screen] ?? (INTERNAL_MOBILE_SCREENS.has(screen) ? 'home' : screen);
}

/** Keep bottom tab highlight in sync when opening screens from deep links. */
export function tabForMobileScreen(screen: MobileScreen): ClientNavTab | null {
  if (screen === 'home') return 'home';
  if (screen === 'feed' || screen === 'outputs' || screen === 'creative-preview' || screen === 'approval' || screen === 'platform-preview') {
    return 'content';
  }
  if (screen === 'missions' || screen === 'mission-factory' || screen === 'campaigns' || screen === 'campaign-detail') {
    return 'missions';
  }
  if (screen === 'reviews' || screen === 'review-detail') return 'reviews';
  if (screen === 'more' || screen === 'brand' || screen === 'settings' || screen === 'billing' || screen === 'notifications' || screen === 'insights' || screen === 'ads' || screen === 'visitors' || screen === 'new-brief') {
    return 'more';
  }
  return null;
}

export type ClientNavTab = 'home' | 'content' | 'missions' | 'reviews' | 'more';

/**
 * Floating pill nav — single icon path (no active/idle split, color handled by MobileNav).
 * Icons: distinctive, purposeful. Not generic library icons.
 */
export const CLIENT_NAV_TABS: { id: ClientNavTab; label: string; icon: string; active: string; idle: string }[] = [
  {
    id: 'home',
    label: 'Özet',
    // Abstract command center: 4-segment overview grid
    icon: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
    active: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
    idle:   'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  },
  {
    id: 'content',
    label: 'İçerik',
    // Stacked image cards (post/story/reel stack)
    icon: 'M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 12h16M9 6V4M15 6V4M8 15l3-3 2 2 3-4',
    active: 'M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 12h16M9 6V4M15 6V4M8 15l3-3 2 2 3-4',
    idle:   'M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 12h16M9 6V4M15 6V4M8 15l3-3 2 2 3-4',
  },
  {
    id: 'missions',
    label: 'Plan',
    // Mission flag / direction indicator
    icon: 'M4 22V3M4 4h14l-4 5 4 5H4',
    active: 'M4 22V3M4 4h14l-4 5 4 5H4',
    idle:   'M4 22V3M4 4h14l-4 5 4 5H4',
  },
  {
    id: 'reviews',
    label: 'Yorumlar',
    // Chat bubble with star accent
    icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM12 7v.5M10.5 10l1.5-2.5 1.5 2.5-2 1 2 1-1.5 2.5',
    active: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM8 10h8M8 14h5',
    idle:   'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM8 10h8M8 14h5',
  },
  {
    id: 'more',
    label: 'Menü',
    // 3×2 dot grid — compact menu
    icon: 'M5 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    active: 'M5 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    idle:   'M5 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
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

export function buildMoreMenuGroups(opts: { canvaEnabled: boolean; connectedCount: number; integrationTotal: number }): {
  title: string;
  items: MoreMenuItem[];
}[] {
  const clientGroups: { title: string; items: MoreMenuItem[] }[] = [
    {
      title: 'İçerik',
      items: [
        { label: 'Onay Akışı', sub: 'Üretilen post, story ve reel', iconBg: '#a78bfa', iconText: '▣', screen: 'feed' },
        { label: 'İçerik Planı', sub: 'Haftalık mission ve üretim durumu', iconBg: '#7c3aed', iconText: '✦', screen: 'missions' },
        { label: 'Yeni İstek', sub: 'Ek brief veya kampanya talebi', iconBg: '#f87171', iconText: '+', screen: 'new-brief' },
      ],
    },
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
        { label: 'Kullanım & Plan', sub: 'Kredi ve aylık kullanım', iconBg: '#a78bfa', iconText: '◇', screen: 'billing' },
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
        { label: 'AI Ajanlar', sub: 'Ajan sağlığı ve görevler', iconBg: '#a78bfa', iconText: '◉', screen: 'agents', operatorOnly: true },
        { label: 'Reels Studio', sub: 'Runway ile reel üretimi', iconBg: '#f43f5e', iconText: '▶', screen: 'reels-studio', operatorOnly: true },
        { label: 'Marka Kuralları', sub: 'Öğrenme ve onay önerileri', iconBg: '#10b981', iconText: '◈', screen: 'brand-rules', operatorOnly: true },
        { label: 'Story Şablonları', sub: 'Remotion kütüphanesi', iconBg: '#60a5fa', iconText: '▶', screen: 'templates', operatorOnly: true },
        ...(opts.canvaEnabled
          ? [{ label: 'Canva Şablonları', sub: 'Marka template bağlantısı', iconBg: '#00c4cc', iconText: '◧', screen: 'canva-templates' as MobileScreen, operatorOnly: true }]
          : []),
        { label: 'Çıktılar (ham)', sub: 'Tüm artifact listesi', iconBg: '#64748b', iconText: '▤', screen: 'outputs', operatorOnly: true },
      ],
    },
  ];
}
