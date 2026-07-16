/**
 * When to call Product Scene Director (Crew LLM) — skip slots that use gallery-only visuals.
 */
import type { AiVisualProductionStandard } from '@/lib/ai-visual-production-standard';
import { shouldAiEnhanceForOutput } from '@/lib/ai-visual-production-standard';
import type { ProductionAssignment } from '@/lib/mission-production-manifest';

export function slotNeedsSceneBrief(input: {
  visualStandard: AiVisualProductionStandard;
  contentKind: string;
  assignment: ProductionAssignment;
  galleryOnlyVisual: boolean;
  isHeroReel: boolean;
  willStoryOverlay: boolean;
  designedPosterSync: boolean;
}): boolean {
  if (input.visualStandard.adaptiveScene && !input.designedPosterSync) {
    const pipeline = input.assignment.pipeline;
    const role = input.assignment.slot_role;
    if (pipeline !== 'fal_design' && role !== 'designed_post' && role !== 'designed_typography') {
      return shouldAiEnhanceForOutput(
        input.visualStandard,
        input.contentKind,
        input.assignment,
      );
    }
  }
  if (input.galleryOnlyVisual && !input.isHeroReel && !input.willStoryOverlay) {
    return false;
  }
  if (input.designedPosterSync) return false;

  const pipeline = input.assignment.pipeline;
  const role = input.assignment.slot_role;
  if (pipeline === 'fal_design' || role === 'designed_post' || role === 'designed_typography' || role === 'fal_designed_post') {
    return false;
  }

  if (input.isHeroReel || input.willStoryOverlay) {
    return true;
  }

  return shouldAiEnhanceForOutput(
    input.visualStandard,
    input.contentKind,
    input.assignment,
  );
}
