import type { IntegrationConnection, IntegrationProvider, IntegrationStatus } from '@/types';

export const MOBILE_INTEGRATION_CATALOG: {
  provider: IntegrationProvider;
  label: string;
  shortLabel: string;
  color: string;
  icon: string;
  sub: string;
}[] = [
  { provider: 'GoogleBusiness', label: 'Google Business', shortLabel: 'Google', color: '#34D399', icon: '🔍', sub: 'Yorum ve konum' },
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
