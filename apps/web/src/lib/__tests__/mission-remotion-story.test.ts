/**
 * Golden tests — mission story slot assignment (Fal.ai poster track).
 */
import { describe, it, expect } from 'vitest';
import type { ProductionAssignment } from '@/lib/mission-production-manifest';
import {
  applyMissionFalStoryAssignment,
  applyMissionRemotionStoryAssignment,
  isFalStorySlot,
  isRemotionStorySlot,
  missionTemplateIdeaIndex,
  shouldSkipRemotionStoryCandidate,
} from '@/lib/mission-remotion-story';

function baseAssignment(overrides: Partial<ProductionAssignment> = {}): ProductionAssignment {
  return {
    idea_index: 0,
    slot_role: 'organic_story_still',
    pipeline: 'gallery_photo',
    publish_channel: 'instagram_organic',
    rationale: 'seed',
    ...overrides,
  } as ProductionAssignment;
}

describe('isFalStorySlot', () => {
  it('treats every weekly campaign story slot as Fal.ai poster', () => {
    expect(isFalStorySlot(0)).toBe(true);
    expect(isFalStorySlot(4)).toBe(true);
    expect(isFalStorySlot(99)).toBe(true);
  });
});

describe('isRemotionStorySlot', () => {
  it('is deprecated — weekly stories no longer use Remotion by default', () => {
    expect(isRemotionStorySlot(0)).toBe(false);
  });
});

describe('missionTemplateIdeaIndex', () => {
  it('is deterministic and non-negative for the same mission id', () => {
    const a = missionTemplateIdeaIndex('mission-abc-123');
    const b = missionTemplateIdeaIndex('mission-abc-123');
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
  });

  it('returns 0 for empty / whitespace ids', () => {
    expect(missionTemplateIdeaIndex('')).toBe(0);
    expect(missionTemplateIdeaIndex('   ')).toBe(0);
  });

  it('pins the hash for a fixed id', () => {
    expect(missionTemplateIdeaIndex('weekly-2026-06-21')).toMatchInlineSnapshot(`209200039`);
  });
});

describe('applyMissionFalStoryAssignment', () => {
  it('rewrites a story slot to the Fal.ai story pipeline', () => {
    const out = applyMissionFalStoryAssignment(baseAssignment(), 0);
    expect(out.slot_role).toBe('campaign_story_motion');
    expect(out.pipeline).toBe('fal_story');
    expect(out.publish_channel).toBe('instagram_organic');
    expect(out.rationale).toBe('seed+mission_fal_story_0');
  });

  it('preserves a meta_ads publish channel', () => {
    const out = applyMissionFalStoryAssignment(
      baseAssignment({ publish_channel: 'meta_ads' }),
      2,
    );
    expect(out.publish_channel).toBe('meta_ads');
    expect(out.rationale).toBe('seed+mission_fal_story_2');
  });

  it('preserves instagram_campaign publish channel', () => {
    const out = applyMissionFalStoryAssignment(
      baseAssignment({ publish_channel: 'instagram_campaign' }),
      1,
    );
    expect(out.publish_channel).toBe('instagram_campaign');
  });

  it('seeds a rationale when none exists', () => {
    const out = applyMissionFalStoryAssignment(
      baseAssignment({ rationale: '' }),
      3,
    );
    expect(out.rationale).toBe('mission_fal_story_3');
  });

  it('does not mutate the input assignment', () => {
    const input = baseAssignment();
    applyMissionFalStoryAssignment(input, 0);
    expect(input.slot_role).toBe('organic_story_still');
    expect(input.pipeline).toBe('gallery_photo');
  });
});

describe('shouldSkipRemotionStoryCandidate', () => {
  it('skips weekly campaign story slots from Remotion render phase', () => {
    expect(shouldSkipRemotionStoryCandidate('campaign_story_motion')).toBe(true);
    expect(shouldSkipRemotionStoryCandidate('fal_story_motion')).toBe(true);
    expect(shouldSkipRemotionStoryCandidate('paid_ad_creative')).toBe(false);
  });
});

describe('applyMissionRemotionStoryAssignment (legacy paid-ad)', () => {
  it('still targets remotion_story for explicit legacy paths', () => {
    const out = applyMissionRemotionStoryAssignment(
      baseAssignment({ slot_role: 'paid_ad_creative' }),
      0,
    );
    expect(out.pipeline).toBe('remotion_story');
    expect(out.rationale).toBe('seed+mission_remotion_story_0');
  });
});
