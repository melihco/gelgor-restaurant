import { describe, expect, it } from 'vitest';

import { resolveClientMediaUrl } from '@/lib/media-url';

const SARNIC_GALLERY = 'https://www.sarnicbeach.com/images/galeri/47.jpg';
const R2_MEDIA = '/api/media?key=431b2901-a2dc-4df6-abe3-3670d9844851/image/test.jpg';

describe('resolveClientMediaUrl', () => {
  it('proxies unreachable brand-site gallery URLs', () => {
    const resolved = resolveClientMediaUrl(SARNIC_GALLERY);
    expect(resolved).toContain('/api/media-proxy?url=');
    expect(resolved).toContain(encodeURIComponent('www.sarnicbeach.com'));
  });

  it('proxies protocol-less brand logo URLs', () => {
    const resolved = resolveClientMediaUrl('www.sarnicbeach.com/logo.png');
    expect(resolved).toContain('/api/media-proxy?url=');
    expect(resolved).toContain(encodeURIComponent('www.sarnicbeach.com/logo.png'));
  });

  it('keeps tenant R2 /api/media paths direct', () => {
    expect(resolveClientMediaUrl(R2_MEDIA)).toBe(R2_MEDIA);
  });

  it('keeps fal CDN URLs direct', () => {
    const fal = 'https://v3.fal.media/files/abc/photo.jpg';
    expect(resolveClientMediaUrl(fal)).toBe(fal);
  });
});
