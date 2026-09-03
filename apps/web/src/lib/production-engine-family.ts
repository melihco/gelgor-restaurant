/**
 * Feed-visible production engines collapse to two families.
 *
 *   gallery_design — still compose on a brand photo (GPT designed, premium
 *                    editorial, Ideogram/Satori only as last-resort fallback)
 *   motion         — video / I2V
 *
 * Provider labels (gpt_image_designed, fal_ideogram, satori_local, kling, …)
 * stay on fal_design_engine for telemetry. This field is the contract the
 * quality report asked for: two engines in the feed, not six peers.
 *
 * MULTI-TENANT: no brand UUID / name branches.
 */

export const PRODUCTION_ENGINE_FAMILIES = ['gallery_design', 'motion'] as const;
export type ProductionEngineFamily = (typeof PRODUCTION_ENGINE_FAMILIES)[number];

const MOTION_ENGINE_RX =
  /kling|luma|fal_video|fal_reel|i2v|motion_plate|locked_graphics|still_fallback/i;
const MOTION_PIPELINE_RX =
  /fal_reel|fal_video|campaign_story_motion|fal_only_video|fal_only_reel/i;

export function resolveProductionEngineFamily(input: {
  engine?: string | null;
  pipeline?: string | null;
  slotRole?: string | null;
  hasVideo?: boolean;
}): ProductionEngineFamily {
  if (input.hasVideo) return 'motion';
  const engine = String(input.engine ?? '');
  const pipeline = String(input.pipeline ?? '');
  const slot = String(input.slotRole ?? '');
  if (MOTION_ENGINE_RX.test(engine) || MOTION_PIPELINE_RX.test(pipeline) || MOTION_PIPELINE_RX.test(slot)) {
    return 'motion';
  }
  return 'gallery_design';
}
