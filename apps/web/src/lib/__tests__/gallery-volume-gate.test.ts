/**
 * Gallery volume gate — withhold overflow slots when unique brand photos
 * cannot cover the week's gallery-consuming demand.
 *
 * Validated on local_products_shop AND beach_club so the floor is
 * sector-agnostic (photo count vs slot count, not a brand name).
 */
import { describe, expect, it } from 'vitest';
import { missionGallerySlotKey } from '@/lib/auto-produce/gallery-orchestrator';
import {
  countUniqueUsableBrandPhotos,
  resolveQueueGalleryVolumeWithholds,
} from '@/lib/auto-produce/gallery-volume-gate';
import type { ManifestProductionQueueItem } from '@/lib/production-pipeline-router';

function item(
  ideaIndex: number,
  slotRole: string,
  pipeline: string,
): ManifestProductionQueueItem {
  return {
    queueIndex: ideaIndex,
    ideaIndex,
    idea: { headline: `Idea ${ideaIndex}` },
    assignment: {
      slot_role: slotRole,
      pipeline,
      publish_channel: 'instagram_feed',
    } as unknown as ManifestProductionQueueItem['assignment'],
  };
}

function photos(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `https://cdn.example.com/brand/p${i}.jpg`);
}

describe('countUniqueUsableBrandPhotos', () => {
  it('dedupes display vs analysis URL variants', () => {
    expect(countUniqueUsableBrandPhotos([
      'https://cdn.example.com/brand/p0.jpg',
      'https://cdn.example.com/brand/p0.jpg?w=1200',
      'https://cdn.example.com/brand/p1.jpg',
    ])).toBe(2);
  });
});

describe('resolveQueueGalleryVolumeWithholds — local_products_shop', () => {
  const loop = [
    item(0, 'organic_post', 'gallery_photo'),
    item(1, 'organic_post', 'gallery_photo'),
    item(2, 'organic_story_still', 'story_still'),
    item(3, 'organic_story_still', 'story_still'),
  ];

  it('withholds overflow when two photos cannot cover four gallery slots', () => {
    const assigned = new Map([
      [missionGallerySlotKey(0, 'organic_post'), { url: photos(2)[0] }],
      [missionGallerySlotKey(1, 'organic_post'), { url: photos(2)[1] }],
    ]);
    const out = resolveQueueGalleryVolumeWithholds({
      productionLoop: loop,
      galleryPhotos: photos(2),
      hasRealBrandPhotos: true,
      assignments: assigned,
    });
    expect([...out]).toEqual([
      missionGallerySlotKey(2, 'organic_story_still'),
      missionGallerySlotKey(3, 'organic_story_still'),
    ]);
  });

  it('withholds a sibling that would republish an already-claimed photo', () => {
    const hero = photos(2)[0]!;
    const assigned = new Map([
      [missionGallerySlotKey(0, 'organic_post'), { url: hero }],
      [missionGallerySlotKey(1, 'organic_post'), { url: hero }],
    ]);
    const out = resolveQueueGalleryVolumeWithholds({
      productionLoop: loop,
      galleryPhotos: photos(2),
      hasRealBrandPhotos: true,
      assignments: assigned,
    });
    expect(out.has(missionGallerySlotKey(1, 'organic_post'))).toBe(true);
    expect(out.has(missionGallerySlotKey(0, 'organic_post'))).toBe(false);
  });
});

describe('resolveQueueGalleryVolumeWithholds — beach_club', () => {
  it('does not withhold when unique photos cover the gallery demand', () => {
    const loop = [
      item(0, 'organic_post', 'gallery_photo'),
      item(1, 'organic_story_still', 'story_still'),
      item(2, 'organic_story_still', 'story_still'),
      item(3, 'campaign_reel_motion', 'fal_reel'),
    ];
    const urls = photos(8);
    const assigned = new Map(loop.map((row, i) => [
      missionGallerySlotKey(row.ideaIndex, String(row.assignment.slot_role)),
      { url: urls[i] },
    ]));
    const out = resolveQueueGalleryVolumeWithholds({
      productionLoop: loop,
      galleryPhotos: urls,
      hasRealBrandPhotos: true,
      assignments: assigned,
    });
    expect(out.size).toBe(0);
  });

  it('does not count fal_only capacity reroutes against photo demand', () => {
    const loop = [
      item(0, 'organic_post', 'gallery_photo'),
      item(1, 'organic_post', 'gallery_photo'),
      item(2, 'organic_story_still', 'story_still'),
      item(3, 'organic_story_still', 'story_still'),
    ];
    const reroutes = new Map([
      [missionGallerySlotKey(2, 'organic_story_still'), 'fal_only_story'],
      [missionGallerySlotKey(3, 'organic_story_still'), 'fal_only_story'],
    ]);
    const out = resolveQueueGalleryVolumeWithholds({
      productionLoop: loop,
      galleryPhotos: photos(2),
      hasRealBrandPhotos: true,
      assignments: new Map([
        [missionGallerySlotKey(0, 'organic_post'), { url: photos(2)[0] }],
        [missionGallerySlotKey(1, 'organic_post'), { url: photos(2)[1] }],
      ]),
      capacityReroutes: reroutes,
    });
    expect(out.size).toBe(0);
  });

  it('does not fire when the brand has no real photos (other gates own that)', () => {
    const out = resolveQueueGalleryVolumeWithholds({
      productionLoop: [item(0, 'organic_post', 'gallery_photo')],
      galleryPhotos: [],
      hasRealBrandPhotos: false,
    });
    expect(out.size).toBe(0);
  });
});
