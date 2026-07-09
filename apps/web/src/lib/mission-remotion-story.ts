/**
 * Mission-level story slot assignments — Fal.ai grounded poster (9:16) for campaign stories.
 * Remotion motion path retained only for explicit legacy remotion_story / paid-ad slots.
 */
import type { ProductionAssignment } from './mission-production-manifest';

/** Stable index for template rotation (different layout per mission). */
export function missionTemplateIdeaIndex(missionId: string): number {
  const id = missionId.trim();
  if (!id) return 0;
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Weekly mission: campaign story slots use Fal.ai poster (not Remotion MP4). */
export function isFalStorySlot(_storyIndex: number): boolean {
  return true;
}

/** @deprecated Use isFalStorySlot — weekly stories are Fal.ai, not Remotion. */
export function isRemotionStorySlot(storyIndex: number): boolean {
  return !isFalStorySlot(storyIndex);
}

/** @deprecated Use isFalStorySlot */
export function isPrimaryRemotionStorySlot(storyIndex: number): boolean {
  return isRemotionStorySlot(storyIndex);
}

export function shouldApplyMissionFalStory(assignment: ProductionAssignment): boolean {
  return assignment.pipeline === 'fal_story'
    || assignment.slot_role === 'fal_story_motion';
}

export function applyMissionFalStoryAssignment(
  assignment: ProductionAssignment,
  storyIndex: number,
): ProductionAssignment {
  if (!isFalStorySlot(storyIndex)) return assignment;
  return {
    ...assignment,
    slot_role: 'campaign_story_motion',
    pipeline: 'fal_story',
    publish_channel: assignment.publish_channel === 'meta_ads'
      ? 'meta_ads'
      : assignment.publish_channel === 'instagram_campaign'
        ? 'instagram_campaign'
        : 'instagram_organic',
    rationale: assignment.rationale
      ? `${assignment.rationale}+mission_fal_story_${storyIndex}`
      : `mission_fal_story_${storyIndex}`,
  };
}

/** Legacy Remotion MP4 — paid-ad / explicit remotion_story only. */
export function applyMissionRemotionStoryAssignment(
  assignment: ProductionAssignment,
  storyIndex: number,
): ProductionAssignment {
  return {
    ...assignment,
    slot_role: assignment.slot_role,
    pipeline: 'remotion_story',
    publish_channel: assignment.publish_channel === 'meta_ads'
      ? 'meta_ads'
      : 'instagram_organic',
    rationale: assignment.rationale
      ? `${assignment.rationale}+mission_remotion_story_${storyIndex}`
      : `mission_remotion_story_${storyIndex}`,
  };
}

/** @deprecated Alias for applyMissionFalStoryAssignment */
export function applyPrimaryMissionRemotionStoryAssignment(
  assignment: ProductionAssignment,
  storyIndex: number,
): ProductionAssignment {
  return applyMissionFalStoryAssignment(assignment, storyIndex);
}
