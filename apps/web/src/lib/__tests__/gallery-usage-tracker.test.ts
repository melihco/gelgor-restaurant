import { describe, expect, it } from 'vitest';
import {
  buildGalleryUsageFromArtifacts,
  buildGlobalGalleryUsageCounts,
  collectMissionGalleryUrls,
  extractGalleryUrlsFromArtifact,
  getMissionWideExcludeUrls,
  isInstagramPublishedArtifact,
  normalizeGalleryUrl,
} from '@/lib/gallery-usage-tracker';

const PHOTO_A = 'https://cdn.example.com/gallery/a.jpg';
const PHOTO_B = 'https://cdn.example.com/gallery/b.jpg';

describe('gallery-usage-tracker', () => {
  it('shop: only Instagram-shipped cards lock a jar; pending approve does not', () => {
    expect(isInstagramPublishedArtifact({
      reviewStatus: 'Approved',
      metadata: { kind: 'instagram_post', selected_gallery_url: PHOTO_A },
    })).toBe(false);
    expect(isInstagramPublishedArtifact({
      reviewStatus: 'Approved',
      metadata: {
        kind: 'instagram_post',
        selected_gallery_url: PHOTO_A,
        ig_media_id: '178900112233',
        permalink: 'https://www.instagram.com/p/abc/',
      },
    })).toBe(true);

    const usage = buildGalleryUsageFromArtifacts([
      {
        reviewStatus: 'Pending',
        metadata: JSON.stringify({
          kind: 'instagram_post',
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
        reviewStatus: 'Approved',
        metadata: JSON.stringify({
          kind: 'instagram_post',
          selected_gallery_url: PHOTO_A,
          ig_media_id: '178900112233',
          permalink: 'https://www.instagram.com/p/abc/',
        }),
      },
      {
        reviewStatus: 'Pending',
        metadata: JSON.stringify({
          kind: 'instagram_reel',
          selected_gallery_url: PHOTO_B,
        }),
      },
    ]);
    const counts = buildGlobalGalleryUsageCounts(usage);
    expect(counts.get(PHOTO_A)).toBe(1);
    expect(counts.get(PHOTO_B)).toBeUndefined();
  });

  it('beach: unpublished story stills stay reusable; shipped feed locks the pier', () => {
    const pier = 'https://cdn.example.com/gallery/pier.jpg';
    const lounge = 'https://cdn.example.com/gallery/daybed.jpg';
    const usage = buildGalleryUsageFromArtifacts([
      {
        reviewStatus: 'Pending',
        metadata: JSON.stringify({
          kind: 'instagram_story',
          selected_gallery_url: pier,
        }),
      },
      {
        reviewStatus: 'Approved',
        metadata: JSON.stringify({
          kind: 'instagram_post',
          selected_gallery_url: lounge,
          published_at: '2026-09-12T18:00:00Z',
        }),
      },
    ]);
    const counts = buildGlobalGalleryUsageCounts(usage);
    expect(counts.get(pier)).toBeUndefined();
    expect(counts.get(lounge)).toBe(1);
  });

  it('tracks the look pack source still, not the enhanced R2 output', () => {
    const extracted = extractGalleryUrlsFromArtifact({
      reviewStatus: 'Approved',
      metadata: JSON.stringify({
        kind: 'instagram_post',
        ig_media_id: '178900112233',
        feed_slot_pack: {
          photoUrl: PHOTO_A,
          caption: 'İncir reçelimiz kavanozda.',
        },
        imageUrl: 'https://pub.example.r2.dev/enhanced/card.jpg',
      }),
    });
    expect(extracted?.urls).toContain(PHOTO_A);
    expect(extracted?.urls.some((u) => u.includes('r2.dev'))).toBe(false);
  });

  it('shop + beach: mission siblings lock only Instagram-shipped stills', () => {
    const mid = '11111111-1111-1111-1111-111111111111';
    const jam = 'https://cdn.example.com/gallery/fig-jam.jpg';
    const pier = 'https://cdn.example.com/gallery/pier.jpg';
    const artifacts = [
      {
        reviewStatus: 'Pending',
        metadata: { mission_id: mid, kind: 'instagram_post', selected_gallery_url: jam },
      },
      {
        reviewStatus: 'Approved',
        metadata: {
          mission_id: mid,
          kind: 'instagram_story',
          selected_gallery_url: pier,
          ig_media_id: '178900199999',
        },
      },
    ];
    expect(collectMissionGalleryUrls(artifacts, mid)).toEqual([pier]);
    const usage = buildGalleryUsageFromArtifacts(artifacts);
    expect(getMissionWideExcludeUrls(usage, {
      feed: [],
      story: [],
      reel: [],
      carousel: [],
    }, [])).toEqual([pier]);
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
      {
        reviewStatus: 'Approved',
        metadata: JSON.stringify({
          kind: 'instagram_post',
          selected_gallery_url: r2a,
          ig_media_id: '178900111111',
        }),
      },
      {
        reviewStatus: 'Approved',
        metadata: JSON.stringify({
          kind: 'instagram_post',
          selected_gallery_url: r2b,
          ig_media_id: '178900122222',
        }),
      },
    ]);
    const counts = buildGlobalGalleryUsageCounts(usage);
    expect([...counts.keys()].length).toBe(2);
  });
});
