/**
 * Gallery orchestrator — capacity-aware reroute tests (faz 3.7).
 *
 * A STRICT-subject slot whose subject has ZERO aligned photos in the gallery
 * must be rerouted to the format's fal_only pipeline instead of being enqueued
 * as a guaranteed gallery_theme_mismatch. Sector-agnostic: validated with
 * local_products_shop AND beach_club.
 */
import { describe, it, expect } from 'vitest';
import {
  buildMissionGalleryAssignments,
  pickVenueEscalationFallbackPhoto,
  resolveQueueGalleryCapacityReroutes,
  missionGallerySlotKey,
  tryGalleryFailureEscalation,
} from '@/lib/auto-produce/gallery-orchestrator';
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

  it('does not invent a fal post when the shop gallery cannot prove the subject', () => {
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
    expect(out.size).toBe(0);
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

  it('does not invent a fal story when the beach gallery cannot prove the subject', () => {
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
    expect(out.size).toBe(0);
  });

  it('reroutes a reel when the shop gallery cannot prove the subject', () => {
    const items = [
      queueItem(1, 'organic_reel', 'fal_reel', {
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
    expect(out.get(missionGallerySlotKey(1, 'organic_reel'))).toBe('fal_only_reel');
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

describe('buildMissionGalleryAssignments judge rejections', () => {
  it('reports the photo the judge refused so the slot fallback can skip it', async () => {
    const BREAKFAST = 'https://cdn.example.com/gallery/breakfast.jpg';
    const galleryMeta: Record<string, GalleryPhotoMeta> = {
      [BREAKFAST]: {
        primarySubject: 'turkish_breakfast',
        suggestedAssetType: 'food_drink_photo',
        contentTags: [
          'turkish breakfast', 'kahvaltı', 'serpme kahvaltı', 'eggs', 'yumurta',
          'cheese', 'olives', 'tomato', 'tea',
        ],
        description:
          'A generous Turkish serpme breakfast spread with eggs, cheeses, olives, '
          + 'jams, tomatoes and tea on a wooden table.',
      },
    };
    const judgeRejectedBySlot = new Map<string, string[]>();
    const result = await buildMissionGalleryAssignments({
      missionId: 'm-1',
      productionLoop: [
        queueItem(0, 'designed_post', 'fal_design', {
          caption_draft:
            'Serpme köy kahvaltımızla sevdiklerinizi şımartın! Taze ve doğal lezzetlerin tadını çıkarın.',
          headline: 'Serpme Köy Kahvaltısı',
        }),
      ],
      galleryPhotos: [BREAKFAST],
      galleryMeta,
      brandBusinessType: 'restaurant_cafe',
      resolvedBrandName: 'Gel Gör',
      hasGallery: true,
      hasRealBrandPhotos: true,
      judgeRejectedBySlot,
      judgeFn: async () => ({
        pickIndex: null,
        confidence: 0,
        reason: 'no food visible',
        rejectReason: 'no food visible',
        usage: null,
        model: 'test',
      }),
    });

    const slotKey = missionGallerySlotKey(0, 'designed_post');
    expect(result.get(slotKey)?.url).toBeUndefined();
    expect(judgeRejectedBySlot.get(slotKey)).toContain(BREAKFAST);
  });
});

describe('tryGalleryFailureEscalation', () => {
  it('does not invent a fal post when a feed gallery veto fires', () => {
    const out = tryGalleryFailureEscalation({
      assignment: { slot_role: 'designed_post', pipeline: 'fal_design' },
      postType: 'feed',
      missionId: 'm-1',
      stage: 'judge_reject',
    });
    expect(out).toBeNull();
  });

  it('does not invent a fal story when a beach gallery veto fires', () => {
    const out = tryGalleryFailureEscalation({
      assignment: { slot_role: 'campaign_story_motion', pipeline: 'fal_story' },
      postType: 'story',
      missionId: 'm-1',
      stage: 'judge_reject',
      fallbackReferenceUrl: 'https://cdn.example.com/gallery/terrace.jpg',
    });
    expect(out).toBeNull();
  });

  it('keeps reel fal motion as the only gallery-failure fallback', () => {
    const venuePhoto = 'https://cdn.example.com/gallery/gelgor-dining.jpg';
    const out = tryGalleryFailureEscalation({
      assignment: { slot_role: 'fal_reel_motion', pipeline: 'fal_reel' },
      postType: 'reel',
      missionId: 'm-1',
      stage: 'judge_reject',
      fallbackReferenceUrl: venuePhoto,
    });
    expect(out?.assignment.pipeline).toBe('fal_only_reel');
    expect(out?.referenceUrl).toBe(venuePhoto);
    expect(out?.pickedFromBrandGallery).toBe(true);
  });

  it('does not invent a fal post when a carousel gallery veto fires', () => {
    const out = tryGalleryFailureEscalation({
      assignment: { slot_role: 'organic_carousel', pipeline: 'carousel_gallery' },
      postType: 'carousel',
      missionId: 'm-1',
      stage: 'hard_veto',
    });
    expect(out).toBeNull();
  });

  it('returns null when no missionId is provided', () => {
    const out = tryGalleryFailureEscalation({
      assignment: { slot_role: 'organic_carousel', pipeline: 'carousel_gallery' },
      postType: 'carousel',
      missionId: undefined,
      stage: 'hard_veto',
    });
    expect(out).toBeNull();
  });
});

describe('pickVenueEscalationFallbackPhoto', () => {
  it('prefers an alternate gallery photo over the rejected pick', () => {
    expect(pickVenueEscalationFallbackPhoto({
      currentReferenceUrl: 'https://cdn.example.com/gallery/a.jpg',
      galleryPhotos: ['https://cdn.example.com/gallery/b.jpg'],
      sector: 'restaurant_cafe',
      hasRealBrandPhotos: true,
      excludeUrls: ['https://cdn.example.com/gallery/a.jpg'],
    })).toBe('https://cdn.example.com/gallery/b.jpg');
  });

  it('returns null when only the rejected photo remains (never re-ship veto)', () => {
    expect(pickVenueEscalationFallbackPhoto({
      currentReferenceUrl: 'https://cdn.example.com/gallery/a.jpg',
      galleryPhotos: ['https://cdn.example.com/gallery/a.jpg'],
      sector: 'restaurant_cafe',
      hasRealBrandPhotos: true,
      excludeUrls: ['https://cdn.example.com/gallery/a.jpg'],
    })).toBeNull();
  });

  it('returns null for low-reliability / no-venue sectors', () => {
    expect(pickVenueEscalationFallbackPhoto({
      currentReferenceUrl: 'https://cdn.example.com/gallery/a.jpg',
      sector: 'ecommerce_retail',
      hasRealBrandPhotos: true,
    })).toBeNull();
  });

  // Escalation runs once per slot in its own worker invocation. Returning the
  // first usable candidate handed every escalated slot the same photo.
  it('skips photos this mission already shipped (restaurant_cafe)', () => {
    const worn = 'https://cdn.example.com/gallery/terrace-hero.jpg';
    const fresh = 'https://cdn.example.com/gallery/terrace-evening.jpg';
    expect(pickVenueEscalationFallbackPhoto({
      currentReferenceUrl: null,
      galleryPhotos: [worn, fresh],
      sector: 'restaurant_cafe',
      hasRealBrandPhotos: true,
      missionUsedUrls: [worn],
    })).toBe(fresh);
  });

  it('rotates off the most-published photo when no vision tags exist (beach_club)', () => {
    const worn = 'https://cdn.example.com/gallery/sunset-a.jpg';
    const rare = 'https://cdn.example.com/gallery/sunset-b.jpg';
    expect(pickVenueEscalationFallbackPhoto({
      currentReferenceUrl: null,
      galleryPhotos: [worn, rare],
      sector: 'beach_club',
      hasRealBrandPhotos: true,
      globalUsageCounts: new Map([[worn, 192], [rare, 2]]),
    })).toBe(rare);
  });

  it('still returns a real venue photo when the mission used every candidate', () => {
    const only = 'https://cdn.example.com/gallery/only.jpg';
    expect(pickVenueEscalationFallbackPhoto({
      currentReferenceUrl: null,
      galleryPhotos: [only],
      sector: 'restaurant_cafe',
      hasRealBrandPhotos: true,
      missionUsedUrls: [only],
    })).toBe(only);
  });

  it('prefers the caption-aligned photo over a merely less-used one', () => {
    const foodPhoto = 'https://cdn.example.com/gallery/plated-pasta.jpg';
    const gymPhoto = 'https://cdn.example.com/gallery/gym-weights.jpg';
    const analysis: Record<string, GalleryPhotoMeta> = {
      [foodPhoto]: {
        primarySubject: 'food',
        contentTags: ['food', 'pasta', 'plate', 'dish'],
        description: 'Plated gourmet pasta dish on a restaurant table.',
      },
      [gymPhoto]: {
        primarySubject: 'gym',
        contentTags: ['gym', 'weights', 'fitness'],
        description: 'Dumbbells racked in a gym.',
      },
    };
    expect(pickVenueEscalationFallbackPhoto({
      currentReferenceUrl: null,
      galleryPhotos: [foodPhoto, gymPhoto],
      sector: 'restaurant_cafe',
      hasRealBrandPhotos: true,
      galleryAnalysis: analysis,
      matchInput: {
        caption: 'Bugünün özel makarnası sofranızda — el yapımı taze pasta',
        headline: 'El yapımı makarna',
        businessType: 'restaurant_cafe',
        contentType: 'feed',
      },
      globalUsageCounts: new Map([[foodPhoto, 40], [gymPhoto, 0]]),
    })).toBe(foodPhoto);
  });
});
