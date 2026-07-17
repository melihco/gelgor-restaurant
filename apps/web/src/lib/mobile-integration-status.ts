import type { IntegrationConnection, IntegrationProvider, IntegrationStatus } from '@/types';

export function formatIntegrationStatusLabel(status: IntegrationStatus | string | undefined): string {
  switch (status) {
    case 'Connected':
      return 'Bağlı';
    case 'Expired':
      return 'Yenile';
    case 'Error':
      return 'Hata';
    case 'Disconnected':
    default:
      return 'Bağlı değil';
  }
}

export const MOBILE_INTEGRATION_CATALOG: {
  provider: IntegrationProvider;
  label: string;
  shortLabel: string;
  color: string;
  icon: string;
  sub: string;
}[] = [
  { provider: 'GoogleBusiness', label: 'Google İşletme', shortLabel: 'Google', color: '#34D399', icon: '🔍', sub: 'Yorum ve konum' },
  { provider: 'Instagram', label: 'Instagram', shortLabel: 'Instagram', color: '#F472B6', icon: '📷', sub: 'İçerik yayını' },
  { provider: 'GoogleAds', label: 'Google Ads', shortLabel: 'Ads', color: '#60A5FA', icon: '💰', sub: 'Reklam yönetimi' },
  { provider: 'GoogleAnalytics', label: 'Google Analytics', shortLabel: 'Analytics', color: '#FBBF24', icon: '📈', sub: 'Site trafiği' },
];

export function isIntegrationConnected(status: IntegrationStatus | undefined): boolean {
  return status === 'Connected';
}

export function summarizeMobileIntegrations(connections: IntegrationConnection[]) {
  const byProvider = new Map(connections.map(c => [c.provider, c]));
  const items = MOBILE_INTEGRATION_CATALOG.map(cat => {
    const conn = byProvider.get(cat.provider);
    return {
      ...cat,
      connected: isIntegrationConnected(conn?.status),
      status: (conn?.status ?? 'Disconnected') as IntegrationStatus,
      displayName: conn?.displayName,
    };
  });
  return {
    items,
    connectedCount: items.filter(i => i.connected).length,
    total: items.length,
  };
}

/** Optional Mertcafe live flags — Meta IG/Ads may live here instead of Integrations rows. */
export type MobileMertcafeConnectionFlags = {
  instagram_connected?: boolean;
  meta_ads_connected?: boolean;
} | null | undefined;

/**
 * Growth menu gates — only surface channels the tenant can actually use.
 * - Google Yorumları → Google Business connected
 * - Reklamlar → Meta (IG / Facebook / Meta Ads) OR Google Ads connected
 */
export function resolveMobileGrowthGates(
  connections: IntegrationConnection[],
  mertcafe?: MobileMertcafeConnectionFlags,
) {
  const byProvider = new Map(connections.map((c) => [c.provider, c]));
  const connected = (provider: IntegrationProvider) =>
    isIntegrationConnected(byProvider.get(provider)?.status);

  const googleBusiness = connected('GoogleBusiness');
  const googleAds = connected('GoogleAds');
  const meta = connected('Instagram')
    || connected('Facebook')
    || Boolean(mertcafe?.instagram_connected)
    || Boolean(mertcafe?.meta_ads_connected);

  return {
    showGoogleReviews: googleBusiness,
    showAds: meta || googleAds,
    googleBusinessConnected: googleBusiness,
    googleAdsConnected: googleAds,
    metaConnected: meta,
  };
}

/** Compact badge label for menu / nav icons (1…9, then 9+). */
export function formatMobileCountBadge(count: number): string | number | undefined {
  const n = Math.floor(Number(count) || 0);
  if (n <= 0) return undefined;
  return n > 9 ? '9+' : n;
}
