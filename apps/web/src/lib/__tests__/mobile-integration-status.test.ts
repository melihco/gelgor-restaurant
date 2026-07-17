import { describe, expect, it } from 'vitest';
import type { IntegrationConnection } from '@/types';
import {
  formatMobileCountBadge,
  resolveMobileGrowthGates,
} from '@/lib/mobile-integration-status';
import { buildMoreMenuGroups } from '@/app/mobile/_components/mobile-client-config';

function conn(
  provider: IntegrationConnection['provider'],
  status: IntegrationConnection['status'] = 'Connected',
): IntegrationConnection {
  return {
    id: provider,
    provider,
    status,
    displayName: provider,
  } as IntegrationConnection;
}

describe('resolveMobileGrowthGates', () => {
  it('shows Google reviews only when Google Business is connected', () => {
    expect(resolveMobileGrowthGates([]).showGoogleReviews).toBe(false);
    expect(resolveMobileGrowthGates([conn('GoogleBusiness')]).showGoogleReviews).toBe(true);
  });

  it('shows ads when Meta IG/Ads or Google Ads is connected', () => {
    expect(resolveMobileGrowthGates([]).showAds).toBe(false);
    expect(resolveMobileGrowthGates([conn('Instagram')]).showAds).toBe(true);
    expect(resolveMobileGrowthGates([conn('Facebook')]).showAds).toBe(true);
    expect(resolveMobileGrowthGates([conn('GoogleAds')]).showAds).toBe(true);
    expect(
      resolveMobileGrowthGates([], { instagram_connected: true }).showAds,
    ).toBe(true);
    expect(
      resolveMobileGrowthGates([], { meta_ads_connected: true }).showAds,
    ).toBe(true);
  });
});

describe('formatMobileCountBadge', () => {
  it('hides zero and caps at 9+', () => {
    expect(formatMobileCountBadge(0)).toBeUndefined();
    expect(formatMobileCountBadge(3)).toBe(3);
    expect(formatMobileCountBadge(12)).toBe('9+');
  });
});

describe('buildMoreMenuGroups growth + notifications', () => {
  it('omits growth rows when channels are disconnected', () => {
    const groups = buildMoreMenuGroups({
      connectedCount: 0,
      integrationTotal: 4,
      showGoogleReviews: false,
      showAds: false,
      notificationCount: 0,
    });
    expect(groups.some((g) => g.title === 'Büyüme')).toBe(false);
    const notif = groups.flatMap((g) => g.items).find((i) => i.label === 'Bildirimler');
    expect(notif?.badge).toBeUndefined();
  });

  it('includes gated growth rows and notification count badge', () => {
    const groups = buildMoreMenuGroups({
      connectedCount: 2,
      integrationTotal: 4,
      showGoogleReviews: true,
      showAds: true,
      notificationCount: 4,
    });
    const growth = groups.find((g) => g.title === 'Büyüme');
    expect(growth?.items.map((i) => i.label)).toEqual(['Google Yorumları', 'Reklamlar']);
    const notif = groups.flatMap((g) => g.items).find((i) => i.label === 'Bildirimler');
    expect(notif?.badge).toBe(4);
    expect(notif?.badgeKind).toBe('count');
  });
});
