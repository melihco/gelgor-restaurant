/**
 * Mission-level Remotion template stories — rotate layouts; all story slots use motion.
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

/** Weekly mission: every story slot is Remotion MP4 (not static gallery-only). */
export function isRemotionStorySlot(_storyIndex: number): boolean {
  return true;
}

/** @deprecated Use isRemotionStorySlot */
export function isPrimaryRemotionStorySlot(storyIndex: number): boolean {
  return isRemotionStorySlot(storyIndex);
}

export function applyMissionRemotionStoryAssignment(
  assignment: ProductionAssignment,
  storyIndex: number,
): ProductionAssignment {
  if (!isRemotionStorySlot(storyIndex)) return assignment;
  return {
    ...assignment,
    slot_role: 'campaign_story_motion',
    pipeline: 'remotion_story',
    publish_channel: assignment.publish_channel === 'meta_ads'
      ? 'meta_ads'
      : 'instagram_organic',
    rationale: assignment.rationale
      ? `${assignment.rationale}+mission_remotion_story_${storyIndex}`
      : `mission_remotion_story_${storyIndex}`,
  };
}

/** @deprecated Alias for applyMissionRemotionStoryAssignment */
export function applyPrimaryMissionRemotionStoryAssignment(
  assignment: ProductionAssignment,
  storyIndex: number,
): ProductionAssignment {
  return applyMissionRemotionStoryAssignment(assignment, storyIndex);
}
