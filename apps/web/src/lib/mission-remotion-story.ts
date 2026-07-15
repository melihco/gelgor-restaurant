/**
 * Mission-level story slot assignments — Fal.ai grounded poster (9:16) for campaign stories.
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
