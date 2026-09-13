/**
 * When a brand may restage a still. Hub radios stay the permission;
 * slot job decides the moment. No new theme flag.
 *
 * gallery_only / enhance off → never.
 * Place slots (ambiance, hours, terrace) → never invent a venue.
 * Sell + adaptive on → background restage (packaging-safe path).
 */
import type { AiVisualProductionStandard } from '@/lib/ai-visual-production-standard';
import { captionSceneNeedsRestage } from '@/lib/caption-scene-fit';
import { lookJobKind } from '@/lib/look-job-kind';

export type FeedSceneAction = 'none' | 'restage_background';

export type FeedScenePolicyInput = {
  visualStandard: Pick<
    AiVisualProductionStandard,
    'enabled' | 'adaptiveScene' | 'adaptiveSceneMode' | 'visualSubject'
  >;
  catalogSlotKey?: string | null;
  slotJob?: string | null;
  caption?: string | null;
  evidenceNote?: string | null;
  photoRole?: string | null;
};

/** Brand said yes + this slot is allowed to move pixels outside the hero. */
export function resolveFeedSceneAction(input: FeedScenePolicyInput): FeedSceneAction {
  if (!input.visualStandard.enabled || !input.visualStandard.adaptiveScene) {
    return 'none';
  }

  const kind = lookJobKind({
    catalogSlotKey: input.catalogSlotKey,
    slotJob: input.slotJob,
  });

  if (kind === 'place') return 'none';

  if (kind === 'sell') return 'restage_background';

  if (kind === 'process') {
    return captionSceneNeedsRestage({
      adaptiveScene: true,
      caption: input.caption,
      slotJob: input.slotJob,
      catalogSlotKey: input.catalogSlotKey,
      evidenceNote: input.evidenceNote,
      photoRole: input.photoRole,
    })
      ? 'restage_background'
      : 'none';
  }

  return 'none';
}

export function designedPostAllowsSceneEnhance(input: FeedScenePolicyInput): boolean {
  return resolveFeedSceneAction(input) === 'restage_background';
}
