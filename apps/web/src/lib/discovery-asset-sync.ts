import type { TenantMediaAsset, UpsertTenantMediaAssetRequest } from '@/types';

function fnv1a32Hex(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16);
}

export function storageKeyForDiscoveryUrl(url: string): string {
  return `discovery-ref:${fnv1a32Hex(url)}`;
}

/**
 * Creates TenantMediaAsset rows for discovery URLs not already present (by URL).
 * Uses venue_reference so Content + Canva flows can prefer real venue photography.
 */
export async function syncDiscoveryReferenceAssets(
  client: {
    getTenantMediaAssets: (params?: {
      officeId?: string;
      assetType?: string;
    }) => Promise<TenantMediaAsset[]>;
    createTenantMediaAsset: (data: UpsertTenantMediaAssetRequest) => Promise<TenantMediaAsset>;
  },
  officeId: string | null | undefined,
  urls: string[],
  opts?: { maxCreate?: number },
): Promise<{ created: number; skipped: number }> {
  const maxCreate = opts?.maxCreate ?? 15;
  const clean = [...new Set(urls.map((u) => u.trim()).filter((u) => u.startsWith('http')))];
  if (clean.length === 0) return { created: 0, skipped: 0 };

  const existing = await client.getTenantMediaAssets(officeId ? { officeId } : undefined).catch(() => []);
  const have = new Set(existing.map((a) => (a.url || '').trim()).filter(Boolean));

  let created = 0;
  let skipped = 0;
  for (const url of clean) {
    if (have.has(url)) {
      skipped++;
      continue;
    }
    if (created >= maxCreate) break;

    const payload: UpsertTenantMediaAssetRequest = {
      officeId: officeId ?? null,
      assetType: 'venue_reference',
      url,
      storageKey: storageKeyForDiscoveryUrl(url),
      displayName: 'Discovery · venue reference',
      description:
        'Imported from website / Instagram discovery. Replace or disable in Brand Hub if incorrect.',
      tags: JSON.stringify(['source:discovery', 'auto_import']),
      usageContext: 'instagram_image_reference',
      isApproved: true,
      priority: Math.max(0, 8 - created),
    };

    try {
      await client.createTenantMediaAsset(payload);
      have.add(url);
      created++;
    } catch {
      skipped++;
    }
  }

  return { created, skipped };
}
