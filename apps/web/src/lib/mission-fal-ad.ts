/**
 * Mission paid ad slots — Fal.ai designed still on gallery photo (not Remotion MP4).
 */
import type { ProductionAssignment } from './mission-production-manifest';
import {
  isPaidAdProductionSlot,
  resolveAdChannelFromAssignment,
  resolveFalAdDesignHint,
} from './fal-ad-creative-prompt';

export { isPaidAdProductionSlot };

export function shouldApplyMissionFalAd(assignment: ProductionAssignment): boolean {
  return isPaidAdProductionSlot(assignment);
}

export function applyMissionFalAdAssignment(assignment: ProductionAssignment): ProductionAssignment {
  const channel = resolveAdChannelFromAssignment(assignment) ?? 'meta_ads';
  return {
    ...assignment,
    pipeline: 'fal_design',
    publish_channel: channel,
    fal_design_hint: assignment.fal_design_hint || resolveFalAdDesignHint(channel),
    rationale: assignment.rationale
      ? `${assignment.rationale}+mission_fal_ad_${channel}`
      : `mission_fal_ad_${channel}`,
  };
}
