import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchExternalImageBuffer } from '@/lib/external-image-fetch';
import {
  resolveProductionGalleryUrlsForRemotion,
  resolveRemotionLogoUrlForRender,
} from '@/lib/media-url';

vi.mock('@/lib/external-image-fetch', () => ({
  fetchExternalImageBuffer: vi.fn(),
}));

vi.mock('@/lib/r2-storage', () => ({
  isR2Configured: vi.fn(() => true),
  generateStorageKey: vi.fn(
    (_tenant: string, _kind: string, ext: string) => `431b2901-a2dc-4df6-abe3-3670d9844851/image/2026-07-07/test.${ext}`,
  ),
  uploadToR2: vi.fn(async () => undefined),
  listTenantImageStorageUrls: vi.fn(async () => []),
}));

const TENANT = '431b2901-a2dc-4df6-abe3-3670d9844851';
const R2_PRIMARY = `/api/media?key=${TENANT}%2Fimage%2F2026-07-06%2Fprimary.jpg`;
const R2_SECOND = `/api/media?key=${TENANT}%2Fimage%2F2026-07-06%2Fsecond.jpg`;
const BROKEN = 'https://www.sarnicbeach.com/images/galeri/52.jpg';

describe('resolveProductionGalleryUrlsForRemotion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('rewrites unreachable galleryPhotoUrls to tenant R2 media paths', async () => {
    vi.mocked(fetchExternalImageBuffer).mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/media?key=')) {
        return { ok: true, headers: { get: () => 'image/jpeg' } };
      }
      return { ok: false, headers: { get: () => null } };
    }));

    const resolved = await resolveProductionGalleryUrlsForRemotion(
      TENANT,
      [BROKEN, `/api/media-proxy?url=${encodeURIComponent(BROKEN)}`],
      { primaryUrl: R2_PRIMARY, candidateUrls: [R2_SECOND] },
    );

    expect(resolved).toHaveLength(2);
    for (const url of resolved) {
      expect(url).toContain('/api/media?key=');
      expect(url).not.toContain('sarnicbeach.com');
    }
  });
});

describe('resolveRemotionLogoUrlForRender', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns undefined when external logo is unreachable', async () => {
    vi.mocked(fetchExternalImageBuffer).mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, headers: { get: () => null } })));

    const logo = await resolveRemotionLogoUrlForRender(
      TENANT,
      'https://www.sarnicbeach.com/logo.png',
    );
    expect(logo).toBeUndefined();
  });

  it('keeps tenant-stored logo URLs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      headers: { get: () => 'image/png' },
    })));

    const logo = await resolveRemotionLogoUrlForRender(TENANT, R2_PRIMARY);
    expect(logo).toContain('/api/media?key=');
  });
});
