import { describe, expect, it } from 'vitest';
import { resolveStandardRemotionLibrarySlotKey } from '@/lib/brand-template-library';

describe('resolveStandardRemotionLibrarySlotKey', () => {
  it('pins the global Remotion story slot order for every brand', () => {
    expect(resolveStandardRemotionLibrarySlotKey({
      slotRole: 'campaign_story_motion',
      pipeline: 'remotion_story',
      storyOrdinal: 0,
    })).toBe('event_story');

    expect(resolveStandardRemotionLibrarySlotKey({
      slotRole: 'campaign_story_motion',
      pipeline: 'remotion_story',
      storyOrdinal: 1,
    })).toBe('editorial_story');

    expect(resolveStandardRemotionLibrarySlotKey({
      slotRole: 'campaign_story_motion',
      pipeline: 'remotion_story',
      storyOrdinal: 2,
    })).toBe('social_proof');
  });

  it('pins the global designed post slot order for every brand', () => {
    expect(resolveStandardRemotionLibrarySlotKey({
      slotRole: 'designed_post',
      pipeline: 'fal_design',
      posterOrdinal: 0,
    })).toBe('campaign_post');

    expect(resolveStandardRemotionLibrarySlotKey({
      slotRole: 'designed_typography',
      pipeline: 'fal_design',
      posterOrdinal: 1,
    })).toBe('social_proof_post');
  });

  it('routes designed ad slots to the ad creative slot', () => {
    expect(resolveStandardRemotionLibrarySlotKey({
      slotRole: 'paid_ad_creative',
      pipeline: 'fal_design',
    })).toBe('ad_creative_post');
  });

  it('does not assign standard template slots to non-remotion pipelines', () => {
    expect(resolveStandardRemotionLibrarySlotKey({
      slotRole: 'organic_post',
      pipeline: 'gallery_photo',
      posterOrdinal: 0,
    })).toBeUndefined();

    expect(resolveStandardRemotionLibrarySlotKey({
      slotRole: 'fal_story_motion',
      pipeline: 'fal_story',
      storyOrdinal: 0,
    })).toBeUndefined();
  });
});
