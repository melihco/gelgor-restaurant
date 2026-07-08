import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchExternalImageBuffer } from '@/lib/external-image-fetch';
import {
  ensureProductionGalleryPhotoUrlServer,
  pickReachableProductionGalleryUrl,
  prioritizeTenantStoredGalleryUrls,
} from '@/lib/gallery-mirror-server';

vi.mock('@/lib/external-image-fetch', () => ({
  fetchExternalImageBuffer: vi.fn(),
}));

vi.mock('@/lib/r2-storage', () => ({
  isR2Configured: vi.fn(() => true),
  generateStorageKey: vi.fn((_tenant: string, _kind: string, ext: string) => `431b2901-a2dc-4df6-abe3-3670d9844851/image/2026-07-07/test.${ext}`),
  uploadToR2: vi.fn(async () => undefined),
  listTenantImageStorageUrls: vi.fn(async () => []),
}));

const TENANT = '431b2901-a2dc-4df6-abe3-3670d9844851';
const R2_URL = `/api/media?key=${TENANT}%2Fimage%2F2026-07-06%2Fabc.jpg`;
const BROKEN_EXTERNAL = 'https://www.sarnicbeach.com/images/galeri/23.jpg';

describe('prioritizeTenantStoredGalleryUrls', () => {
  it('puts tenant /api/media URLs first', () => {
    const ordered = prioritizeTenantStoredGalleryUrls([BROKEN_EXTERNAL, R2_URL], TENANT);
    expect(ordered[0]).toBe(R2_URL);
  });
});

describe('pickReachableProductionGalleryUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('falls back to tenant R2 when primary external URL is unreachable', async () => {
    vi.mocked(fetchExternalImageBuffer).mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/media?key=')) {
        return { ok: true, headers: { get: () => 'image/jpeg' } };
      }
      return { ok: false, headers: { get: () => null } };
    }));

    const picked = await pickReachableProductionGalleryUrl(
      TENANT,
      BROKEN_EXTERNAL,
      [R2_URL],
    );
    expect(picked?.url).toContain('/api/media?key=');
    expect(picked?.fallbackFrom).toBe(R2_URL);
  });
});

describe('ensureProductionGalleryPhotoUrlServer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns tenant media URL without external fetch', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      headers: { get: () => 'image/jpeg' },
    })));

    const url = await ensureProductionGalleryPhotoUrlServer(TENANT, R2_URL);
    expect(url).toContain('/api/media?key=');
    expect(fetchExternalImageBuffer).not.toHaveBeenCalled();
  });
});
