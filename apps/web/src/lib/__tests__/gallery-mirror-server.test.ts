import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('orderGalleryUrlsForVisualSource', () => {
  it('prefers brand-site galeri over tenant /api/media under gallery_only', async () => {
    const { orderGalleryUrlsForVisualSource } = await import('@/lib/gallery-mirror-server');
    const brand = 'https://yulabodrum.com/galeri/49.webp';
    const ordered = orderGalleryUrlsForVisualSource([R2_URL, brand], {
      visualSourceMode: 'gallery_only',
      brandDomain: 'yulabodrum.com',
      workspaceId: TENANT,
    });
    expect(ordered[0]).toBe(brand);
    expect(ordered[ordered.length - 1]).toBe(R2_URL);
  });

  it('keeps tenant-first under ai_generated', async () => {
    const { orderGalleryUrlsForVisualSource } = await import('@/lib/gallery-mirror-server');
    const brand = 'https://yulabodrum.com/galeri/49.webp';
    const ordered = orderGalleryUrlsForVisualSource([brand, R2_URL], {
      visualSourceMode: 'ai_generated',
      brandDomain: 'yulabodrum.com',
      workspaceId: TENANT,
    });
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
  // The mirror branch is gated on serverConfig.r2.configured, which reads env
  // directly — without these the branch is skipped and the mocked call order
  // below no longer describes what the function actually does.
  beforeEach(() => {
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'test-account');
    vi.stubEnv('R2_ACCESS_KEY_ID', 'test-key');
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'test-secret');
    vi.stubEnv('R2_BUCKET_NAME', 'test-bucket');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

  it('falls back to reachable brand-site URL when R2 mirror fails', async () => {
    const brand = 'https://ballidupartievi.com/wp-content/uploads/2026/01/home_01.webp';
    vi.mocked(fetchExternalImageBuffer)
      .mockResolvedValueOnce(null) // mirror fetch fails closed
      .mockResolvedValueOnce(Buffer.alloc(200)); // external still readable
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      headers: { get: () => null },
    })));

    const url = await ensureProductionGalleryPhotoUrlServer(TENANT, brand);
    expect(url).toBe(brand);
  });
});
