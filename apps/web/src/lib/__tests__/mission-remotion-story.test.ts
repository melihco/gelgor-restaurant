/**
 * Golden tests — Remotion story slot assignment.
 *
 * These pin the *current* behaviour of the mission Remotion-story assignment so
 * that the planned Assignment-SSOT refactor (Faz 2.2) can be verified to be
 * behaviour-identical. If a change here is intentional, update the snapshots
 * deliberately (`npm run test -- -u`) and review the diff.
 */
import { describe, it, expect } from 'vitest';
import type { ProductionAssignment } from '@/lib/mission-production-manifest';
import {
  applyMissionRemotionStoryAssignment,
  isRemotionStorySlot,
  missionTemplateIdeaIndex,
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

describe('isRemotionStorySlot', () => {
  it('treats every weekly story slot as a Remotion MP4 slot', () => {
    expect(isRemotionStorySlot(0)).toBe(true);
    expect(isRemotionStorySlot(4)).toBe(true);
    expect(isRemotionStorySlot(99)).toBe(true);
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

describe('applyMissionRemotionStoryAssignment', () => {
  it('rewrites an organic story slot to the Remotion story pipeline', () => {
    const out = applyMissionRemotionStoryAssignment(baseAssignment(), 0);
    expect(out.slot_role).toBe('campaign_story_motion');
    expect(out.pipeline).toBe('remotion_story');
    expect(out.publish_channel).toBe('instagram_organic');
    expect(out.rationale).toBe('seed+mission_remotion_story_0');
  });

  it('preserves a meta_ads publish channel', () => {
    const out = applyMissionRemotionStoryAssignment(
      baseAssignment({ publish_channel: 'meta_ads' }),
      2,
    );
    expect(out.publish_channel).toBe('meta_ads');
    expect(out.rationale).toBe('seed+mission_remotion_story_2');
  });

  it('coerces any non-meta_ads channel to instagram_organic', () => {
    const out = applyMissionRemotionStoryAssignment(
      baseAssignment({ publish_channel: 'google_ads' }),
      1,
    );
    expect(out.publish_channel).toBe('instagram_organic');
  });

  it('seeds a rationale when none exists', () => {
    const out = applyMissionRemotionStoryAssignment(
      baseAssignment({ rationale: '' }),
      3,
    );
    expect(out.rationale).toBe('mission_remotion_story_3');
  });

  it('does not mutate the input assignment', () => {
    const input = baseAssignment();
    applyMissionRemotionStoryAssignment(input, 0);
    expect(input.slot_role).toBe('organic_story_still');
    expect(input.pipeline).toBe('gallery_photo');
  });
});
