import { describe, expect, it } from 'vitest';
import { slotUsesRemotionStory } from '@/lib/production-profile';
import type { ProductionProfile } from '@/lib/production-profile';
import {
  missionHasPublishReadyStory,
} from '@/lib/mission-fal-story-guarantee';
import {
  shouldSkipRemotionStoryCandidate,
  shouldApplyMissionFalStory,
} from '@/lib/mission-remotion-story';
import { shouldRenderRemotionStory } from '@/lib/production-pipeline-router';
import type { ProductionAssignment } from '@/lib/mission-production-manifest';

const remotionProfile: ProductionProfile = {
  tier: 'agency',
  requireRemotionGrafiker: true,
  remotionStoryMotionSlots: 3,
  remotionStoryStillSlots: 0,
  grafikerMaxRetries: 1,
  fdFallbackPolicy: 'allow_warn',
  skipAggressiveEnhance: false,
  reelRemotionMotionFallback: false,
  allowRunwayReels: false,
};

function assignment(overrides: Partial<ProductionAssignment> = {}): ProductionAssignment {
  return {
    idea_index: 0,
    slot_role: 'organic_story_still',
    pipeline: 'story_still',
    publish_channel: 'instagram_organic',
    rationale: 'test',
    ...overrides,
  } as ProductionAssignment;
}

describe('slotUsesRemotionStory', () => {
  it('does not route fal_story campaign slots to Remotion', () => {
    expect(
      slotUsesRemotionStory(
        remotionProfile,
        { pipeline: 'fal_story', slot_role: 'campaign_story_motion' },
        'instagram_story',
      ),
    ).toBe(false);
  });

  it('does not route organic story_still gallery slots to Remotion', () => {
    expect(
      slotUsesRemotionStory(
        remotionProfile,
        { pipeline: 'story_still', slot_role: 'organic_story_still' },
        'instagram_story',
      ),
    ).toBe(false);
  });

  it('still allows explicit remotion_story pipeline for paid ads', () => {
    expect(
      slotUsesRemotionStory(
        remotionProfile,
        { pipeline: 'remotion_story', slot_role: 'paid_ad_creative' },
        'instagram_story',
      ),
    ).toBe(true);
  });
});

describe('shouldRenderRemotionStory', () => {
  it('returns false for weekly fal_story manifest slots', () => {
    expect(
      shouldRenderRemotionStory(
        assignment({ slot_role: 'campaign_story_motion', pipeline: 'fal_story' }),
      ),
    ).toBe(false);
  });
});

describe('shouldSkipRemotionStoryCandidate', () => {
  it('skips campaign story motion candidates in Remotion phase', () => {
    expect(shouldSkipRemotionStoryCandidate('campaign_story_motion')).toBe(true);
    expect(shouldSkipRemotionStoryCandidate('paid_ad_creative')).toBe(false);
  });
});

describe('missionHasPublishReadyStory', () => {
  it('detects publish-ready fal story rows', () => {
    expect(
      missionHasPublishReadyStory([
        {
          title: 'Story',
          imageUrl: 'https://cdn.example/story.png',
          publishReady: true,
          metadata: { pipeline: 'fal_story', production_role: 'campaign_story_motion' },
        },
      ]),
    ).toBe(true);
  });

  it('ignores rendering placeholders', () => {
    expect(
      missionHasPublishReadyStory([
        {
          title: 'Story',
          imageUrl: 'https://cdn.example/story.png',
          publishReady: true,
          rendering: true,
          metadata: { pipeline: 'fal_story' },
        },
      ]),
    ).toBe(false);
  });
});

describe('shouldApplyMissionFalStory', () => {
  it('matches fal_story pipeline assignments', () => {
    expect(
      shouldApplyMissionFalStory(
        assignment({ pipeline: 'fal_story', slot_role: 'campaign_story_motion' }),
      ),
    ).toBe(true);
  });
});
