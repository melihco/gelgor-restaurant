import { describe, expect, it } from 'vitest';
import {
  buildGalleryUsageFromArtifacts,
  buildGlobalGalleryUsageCounts,
  normalizeGalleryUrl,
} from '@/lib/gallery-usage-tracker';

const PHOTO_A = 'https://cdn.example.com/gallery/a.jpg';
const PHOTO_B = 'https://cdn.example.com/gallery/b.jpg';

describe('gallery-usage-tracker', () => {
  it('counts repeated gallery usage across missions, not just unique post types', () => {
    const usage = buildGalleryUsageFromArtifacts([
      {
        reviewStatus: 'Pending',
        metadata: JSON.stringify({
          kind: 'instagram_reel',
          selected_gallery_url: PHOTO_A,
        }),
      },
      {
        reviewStatus: 'Pending',
        metadata: JSON.stringify({
          kind: 'instagram_reel',
          selected_gallery_url: PHOTO_A,
        }),
      },
      {
        reviewStatus: 'Approved',
        metadata: JSON.stringify({
          kind: 'instagram_post',
          selected_gallery_url: PHOTO_A,
        }),
      },
      {
        reviewStatus: 'Pending',
        metadata: JSON.stringify({
          kind: 'instagram_post',
          selected_gallery_url: PHOTO_B,
        }),
      },
    ]);

    const counts = buildGlobalGalleryUsageCounts(usage);
    expect(counts.get(PHOTO_A)).toBe(3);
    expect(counts.get(PHOTO_B)).toBe(1);
  });
});

describe('normalizeGalleryUrl — R2 /api/media identity', () => {
  it('keeps the R2 object key so distinct tenant photos do not collapse', () => {
    const a = '/api/media?key=beach-tenant%2Fimage%2F2026-07-01%2Fa.jpg';
    const b = '/api/media?key=beach-tenant%2Fimage%2F2026-07-01%2Fb.jpg';
    expect(normalizeGalleryUrl(a)).not.toBe(normalizeGalleryUrl(b));
    expect(normalizeGalleryUrl(a)).toContain('a.jpg');
  });

  it('treats encoded and decoded key variants as the same photo', () => {
    const encoded = '/api/media?key=shop-tenant%2Fimage%2F2026-07-01%2Fjar.webp';
    const decoded = '/api/media?key=shop-tenant/image/2026-07-01/jar.webp';
    expect(normalizeGalleryUrl(encoded)).toBe(normalizeGalleryUrl(decoded));
  });

  it('still strips query params from plain http gallery urls', () => {
    expect(normalizeGalleryUrl('https://site.com/galeri/1.webp?v=2')).toBe(
      'https://site.com/galeri/1.webp',
    );
  });

  it('counts two different R2 photos separately in usage tracking', () => {
    const r2a = '/api/media?key=tenant-x%2Fimage%2F2026-07-02%2Fone.jpg';
    const r2b = '/api/media?key=tenant-x%2Fimage%2F2026-07-02%2Ftwo.jpg';
    const usage = buildGalleryUsageFromArtifacts([
      { reviewStatus: 'Pending', metadata: JSON.stringify({ kind: 'instagram_post', selected_gallery_url: r2a }) },
      { reviewStatus: 'Pending', metadata: JSON.stringify({ kind: 'instagram_post', selected_gallery_url: r2b }) },
    ]);
    const counts = buildGlobalGalleryUsageCounts(usage);
    expect([...counts.keys()].length).toBe(2);
  });
});
