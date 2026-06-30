import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isFalAccessibleMediaUrl,
  resolveExternallyAccessibleUrl,
} from '@/lib/media-url';

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
