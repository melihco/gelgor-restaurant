/**
 * Mission-scale batch assignment performance guard.
 *
 * The plan phase runs assignPhotosToContents synchronously on the web
 * instance. A quadratic re-ranking + per-URL lookup rebuild regression made a
 * 24-slot × 120-photo mission block the event loop for minutes, failing
 * Render health checks and crashing the instance mid-kick. This test locks
 * the mission-scale runtime to a hard upper bound so the regression cannot
 * silently return.
 *
 * Multi-tenant rule: synthetic data spans two sectors
 * (beach_club + local_products_shop).
 */
import { describe, it, expect } from 'vitest';
import {
  assignPhotosToContents,
  type GalleryPhotoMeta,
  type MatchPhotoInput,
} from '@/lib/gallery-photo-matcher';

const SUBJECTS = [
  'honey', 'olive_oil', 'fig_jam', 'cocktail',
  'sunset', 'dj_party', 'breakfast', 'cheese',
];

function buildGallery(count: number): {
  photos: string[];
  meta: Record<string, GalleryPhotoMeta>;
} {
  const photos: string[] = [];
  const meta: Record<string, GalleryPhotoMeta> = {};
  for (let i = 0; i < count; i += 1) {
    const subject = SUBJECTS[i % SUBJECTS.length]!;
    const url = `https://cdn.example.com/api/media?key=tenants/ws/gallery/photo-${i}.jpg`;
    photos.push(url);
    meta[url] = {
      primarySubject: subject,
      subjectFamily: subject.split('_')[0],
      description: `Photo of ${subject.replace('_', ' ')} at the venue, warm light, detail ${i}`,
      contentTags: [subject, 'venue', 'warm', `tag${i % 13}`],
      mood: i % 2 ? 'warm' : 'energetic',
      bestFor: ['instagram_post', 'story'],
    };
  }
  return { photos, meta };
}

function buildItems(count: number): Array<{ key: string; input: MatchPhotoInput }> {
  return Array.from({ length: count }, (_, i) => {
    const subject = SUBJECTS[i % SUBJECTS.length]!;
    return {
      key: `${i}::slot_${i}`,
      input: {
        caption: `Bugün ${subject.replace('_', ' ')} zamanı! Tadına bakmadan geçme.`,
        headline: `${subject.replace('_', ' ')} keyfi`,
        subjectKey: subject,
        businessType: i % 2 ? 'beach_club' : 'local_products_shop',
        contentType: 'instagram_post',
        mood: 'warm',
      },
    };
  });
}

describe('assignPhotosToContents — mission-scale performance', () => {
  it('assigns a 24-slot × 120-photo mission well under the health-check budget', () => {
    const { photos, meta } = buildGallery(120);
    const items = buildItems(24);

    const t0 = performance.now();
    const result = assignPhotosToContents(items, photos, meta, { excludeUrls: [] });
    const elapsedMs = performance.now() - t0;

    const assigned = [...result.values()].filter((v) => v?.url).length;
    expect(assigned).toBe(24);
    // Pre-fix this took ~19 000 ms on an M-series laptop (worse on Render's
    // shared CPU). Generous CI headroom, but orders of magnitude below the
    // regression — Render's health check allows 5 000 ms total.
    expect(elapsedMs).toBeLessThan(3_000);

    // No duplicate photos mission-wide.
    const urls = [...result.values()].filter(Boolean).map((r) => r!.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
