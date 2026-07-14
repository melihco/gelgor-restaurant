/**
 * Gallery orchestrator — capacity-aware reroute tests (faz 3.7).
 *
 * A STRICT-subject slot whose subject has ZERO aligned photos in the gallery
 * must be rerouted to the format's fal_only pipeline instead of being enqueued
 * as a guaranteed gallery_theme_mismatch. Sector-agnostic: validated with
 * local_products_shop AND beach_club.
 */
import { describe, it, expect } from 'vitest';
import { resolveQueueGalleryCapacityReroutes, missionGallerySlotKey } from '@/lib/auto-produce/gallery-orchestrator';
import type { ManifestProductionQueueItem } from '@/lib/production-pipeline-router';
import type { GalleryPhotoMeta } from '@/lib/gallery-photo-matcher';

const HONEY = 'https://cdn.example.com/honey.jpg';
const BEACH = 'https://cdn.example.com/beach-sunset.jpg';

function queueItem(
  ideaIndex: number,
  slotRole: string,
  pipeline: string,
  idea: Record<string, unknown>,
): ManifestProductionQueueItem {
  return {
    queueIndex: ideaIndex,
    ideaIndex,
    idea,
    assignment: {
      slot_role: slotRole,
      pipeline,
      publish_channel: 'instagram_feed',
    } as unknown as ManifestProductionQueueItem['assignment'],
  };
}

describe('resolveQueueGalleryCapacityReroutes', () => {
  const shopGallery: Record<string, GalleryPhotoMeta> = {
    [HONEY]: { primarySubject: 'honey', contentTags: ['honey', 'bal'], description: 'Honey jars on shelf.' },
  };

  it('reroutes a strict product slot whose subject is missing from the gallery (local_products_shop)', () => {
    const items = [
      queueItem(0, 'organic_post', 'gallery_photo', {
        caption_draft: 'Taze sıkım nar ekşisi şişelerimiz raflarda',
        headline: 'Nar ekşisi',
        subject_key: 'pomegranate_molasses',
      }),
    ];
    const out = resolveQueueGalleryCapacityReroutes({
      productionLoop: items,
      galleryMeta: shopGallery,
      galleryPhotos: [HONEY],
      hasRealBrandPhotos: true,
      resolvedBrandName: 'Yerel Lezzetler',
    });
    expect(out.get(missionGallerySlotKey(0, 'organic_post'))).toBe('fal_only_post');
  });

  it('does NOT reroute when the gallery has a subject-aligned photo', () => {
    const items = [
      queueItem(0, 'organic_post', 'gallery_photo', {
        caption_draft: 'Süzme bal çeşitlerimiz doğal ve katkısız',
        headline: 'Bal çeşitleri',
        subject_key: 'honey',
      }),
    ];
    const out = resolveQueueGalleryCapacityReroutes({
      productionLoop: items,
      galleryMeta: shopGallery,
      galleryPhotos: [HONEY],
      hasRealBrandPhotos: true,
      resolvedBrandName: 'Yerel Lezzetler',
    });
    expect(out.size).toBe(0);
  });

  it('does NOT reroute non-strict captions — relaxed/diversity fallbacks still apply', () => {
    const items = [
      queueItem(0, 'organic_post', 'gallery_photo', {
        caption_draft: 'Haftaya güzel başlayalım, herkese mutlu haftalar!',
        headline: 'Mutlu haftalar',
      }),
    ];
    const out = resolveQueueGalleryCapacityReroutes({
      productionLoop: items,
      galleryMeta: shopGallery,
      galleryPhotos: [HONEY],
      hasRealBrandPhotos: true,
      resolvedBrandName: 'Yerel Lezzetler',
    });
    expect(out.size).toBe(0);
  });

  it('maps story slots to fal_only_story (beach_club sector)', () => {
    const beachGallery: Record<string, GalleryPhotoMeta> = {
      [BEACH]: { primarySubject: 'beach_sunset', contentTags: ['beach', 'sunset'], description: 'Sunset over the beach.' },
    };
    const items = [
      queueItem(2, 'organic_story_still', 'story_still', {
        caption_draft: 'Şefimizin ızgara ahtapot tabağı bu akşam menüde',
        headline: 'Izgara ahtapot',
        subject_key: 'grilled_octopus',
      }),
    ];
    const out = resolveQueueGalleryCapacityReroutes({
      productionLoop: items,
      galleryMeta: beachGallery,
      galleryPhotos: [BEACH],
      hasRealBrandPhotos: true,
      resolvedBrandName: 'Marina Beach',
    });
    expect(out.get(missionGallerySlotKey(2, 'organic_story_still'))).toBe('fal_only_story');
  });

  it('never reroutes when the brand has no real gallery photos', () => {
    const items = [
      queueItem(0, 'organic_post', 'gallery_photo', {
        caption_draft: 'Taze sıkım nar ekşisi şişelerimiz',
        headline: 'Nar ekşisi',
        subject_key: 'pomegranate_molasses',
      }),
    ];
    const out = resolveQueueGalleryCapacityReroutes({
      productionLoop: items,
      galleryMeta: {},
      galleryPhotos: [],
      hasRealBrandPhotos: false,
      resolvedBrandName: 'Yerel Lezzetler',
    });
    expect(out.size).toBe(0);
  });

  it('skips carousel slots — multi-photo diversity handles them', () => {
    const items = [
      queueItem(1, 'organic_carousel', 'carousel_gallery', {
        caption_draft: 'Taze sıkım nar ekşisi şişelerimiz raflarda',
        headline: 'Nar ekşisi',
        subject_key: 'pomegranate_molasses',
      }),
    ];
    const out = resolveQueueGalleryCapacityReroutes({
      productionLoop: items,
      galleryMeta: shopGallery,
      galleryPhotos: [HONEY],
      hasRealBrandPhotos: true,
      resolvedBrandName: 'Yerel Lezzetler',
    });
    expect(out.size).toBe(0);
  });
});
