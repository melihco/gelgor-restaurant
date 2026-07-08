import { describe, expect, it } from 'vitest';
import {
  buildGalleryUsageFromArtifacts,
  buildGlobalGalleryUsageCounts,
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
