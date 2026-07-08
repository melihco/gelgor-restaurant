import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchExternalImageBuffer } from '@/lib/external-image-fetch';
import {
  confirmGalleryPhotoReachableForRemotion,
  ensureProductionGalleryPhotoUrl,
  isFalAccessibleMediaUrl,
  mirrorGalleryPhotoToTenantStorage,
  resolveExternallyAccessibleUrl,
  resolveExternalGalleryPhotoTarget,
} from '@/lib/media-url';

vi.mock('@/lib/external-image-fetch', () => ({
  fetchExternalImageBuffer: vi.fn(),
}));

vi.mock('@/lib/gallery-mirror-server', () => ({
  ensureProductionGalleryPhotoUrlServer: vi.fn(async (workspaceId: string, url: string) => {
    if (url.includes('/api/media?key=')) return url;
    if (url.includes('media-proxy')) return `/api/media?key=${workspaceId}%2Fimage%2F2026-07-07%2Ftest.jpg`;
    return null;
  }),
  mirrorGalleryPhotoToTenantStorageServer: vi.fn(async (workspaceId: string) =>
    `/api/media?key=${workspaceId}%2Fimage%2F2026-07-07%2Ftest.jpg`),
  pickReachableProductionGalleryUrl: vi.fn(),
  prioritizeTenantStoredGalleryUrls: vi.fn((urls: string[]) => urls),
}));

vi.mock('@/lib/r2-storage', () => ({
  isR2Configured: vi.fn(() => true),
  getPresignedUrl: vi.fn((key: string) => `https://pub-abc.r2.dev/${key}`),
}));

const SARNIC_HTTPS = 'https://www.sarnicbeach.com/images/galeri/23.jpg';
const LOCALHOST_PROXY =
  `http://localhost:3000/api/media-proxy?url=${encodeURIComponent(SARNIC_HTTPS)}`;
const RELATIVE_PROXY = `/api/media-proxy?url=${encodeURIComponent(SARNIC_HTTPS)}`;

describe('resolveExternallyAccessibleUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('unwraps localhost media-proxy to underlying HTTPS gallery URL', async () => {
    const resolved = await resolveExternallyAccessibleUrl(LOCALHOST_PROXY);
    expect(resolved).toBe(SARNIC_HTTPS);
    expect(isFalAccessibleMediaUrl(resolved)).toBe(true);
  });

  it('unwraps relative media-proxy to underlying HTTPS gallery URL', async () => {
    const resolved = await resolveExternallyAccessibleUrl(RELATIVE_PROXY);
    expect(resolved).toBe(SARNIC_HTTPS);
  });

  it('passes through public HTTPS URLs unchanged', async () => {
    const url = 'https://cdn.example.com/photo.jpg';
    expect(await resolveExternallyAccessibleUrl(url)).toBe(url);
  });

  it('resolves /api/media?key= to R2 public URL when configured', async () => {
    vi.stubEnv('R2_PUBLIC_URL', 'https://pub-abc.r2.dev');
    const key = '431b2901-a2dc-4df6-abe3-3670d9844851/image/2026-06-26/abc.jpg';
    const resolved = await resolveExternallyAccessibleUrl(`/api/media?key=${encodeURIComponent(key)}`);
    expect(resolved).toBe(`https://pub-abc.r2.dev/${key}`);
    expect(isFalAccessibleMediaUrl(resolved)).toBe(true);
  });

  it('rejects localhost absolute URLs without unwrap target', () => {
    expect(isFalAccessibleMediaUrl('http://localhost:3000/api/media?key=foo')).toBe(false);
    expect(isFalAccessibleMediaUrl(LOCALHOST_PROXY)).toBe(false);
  });
});

describe('resolveExternalGalleryPhotoTarget', () => {
  it('unwraps relative media-proxy to HTTPS gallery URL', () => {
    expect(resolveExternalGalleryPhotoTarget(RELATIVE_PROXY)).toBe(SARNIC_HTTPS);
  });

  it('passes through bare HTTPS gallery URLs', () => {
    expect(resolveExternalGalleryPhotoTarget(SARNIC_HTTPS)).toBe(SARNIC_HTTPS);
  });
});

describe('confirmGalleryPhotoReachableForRemotion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts proxy-wrapped gallery when external fetch succeeds', async () => {
    vi.mocked(fetchExternalImageBuffer).mockResolvedValueOnce(Buffer.alloc(120, 0xff));
    const ok = await confirmGalleryPhotoReachableForRemotion(RELATIVE_PROXY, { timeoutMs: 5_000 });
    expect(ok).toBe(true);
    expect(fetchExternalImageBuffer).toHaveBeenCalledWith(SARNIC_HTTPS, 5_000);
  });

  it('falls back to media-proxy GET when external fetch fails', async () => {
    vi.mocked(fetchExternalImageBuffer).mockResolvedValueOnce(null);
    const fetchMock = vi.fn(async () => ({ ok: true, headers: { get: () => 'image/jpeg' } }));
    vi.stubGlobal('fetch', fetchMock);

    const ok = await confirmGalleryPhotoReachableForRemotion(RELATIVE_PROXY, { timeoutMs: 5_000 });
    expect(ok).toBe(true);
    expect(fetchMock.mock.calls.some((call: unknown[]) => String(call[0]).includes('/api/media-proxy'))).toBe(true);
  });
});

const JPEG_BYTES = Buffer.alloc(120, 0xff);

describe('mirrorGalleryPhotoToTenantStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mirrors external gallery URL to tenant /api/media key', async () => {
    vi.mocked(fetchExternalImageBuffer).mockResolvedValue(JPEG_BYTES);
    const fetchMock = vi.fn(async () => ({ ok: true, headers: { get: () => 'image/jpeg' } }));
    vi.stubGlobal('fetch', fetchMock);

    const url = await mirrorGalleryPhotoToTenantStorage(
      '431b2901-a2dc-4df6-abe3-3670d9844851',
      SARNIC_HTTPS,
    );
    expect(url).toContain('/api/media?key=');
    expect(url).toContain('431b2901-a2dc-4df6-abe3-3670d9844851');
  });
});

describe('ensureProductionGalleryPhotoUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mirrors external brand gallery to tenant storage for production', async () => {
    vi.mocked(fetchExternalImageBuffer).mockResolvedValue(JPEG_BYTES);
    const fetchMock = vi.fn(async () => ({ ok: true, headers: { get: () => 'image/jpeg' } }));
    vi.stubGlobal('fetch', fetchMock);

    const url = await ensureProductionGalleryPhotoUrl(
      '431b2901-a2dc-4df6-abe3-3670d9844851',
      RELATIVE_PROXY,
    );
    expect(url).toContain('/api/media?key=');
    expect(url).not.toContain('media-proxy');
  });
});
