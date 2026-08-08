/**
 * Catalog key format SSOT for fal story/reel/post tracks.
 * Prevents day_pass_story from binding reel_cover (and the reverse).
 */

export type FalIntensityChannel = 'story' | 'reel' | 'post';

/** Infer intensity/format channel from catalog_slot_key suffixes. */
export function falChannelFromCatalogSlotKey(
  catalogSlotKey: string | null | undefined,
): FalIntensityChannel | null {
  const key = String(catalogSlotKey ?? '').trim().toLowerCase();
  if (!key) return null;
  if (key.endsWith('_reel') || key.includes('_reel_')) return 'reel';
  if (key.endsWith('_story') || key.includes('_story_')) return 'story';
  if (key.endsWith('_carousel') || key.includes('_carousel_')) return 'post';
  if (key.endsWith('_post') || key.includes('_post_')) return 'post';
  return null;
}

/**
 * Prefer catalog key format; fall back to pipeline/role heuristics.
 * Used by fal_video + fal_only before template bind.
 */
export function resolveFalIntensityChannel(input: {
  catalogSlotKey?: string | null;
  pipeline?: string | null;
  slotRole?: string | null;
  isFalOnlyPost?: boolean;
}): FalIntensityChannel {
  const fromKey = falChannelFromCatalogSlotKey(input.catalogSlotKey);
  if (fromKey) return fromKey;

  if (input.isFalOnlyPost) return 'post';
  const pipe = String(input.pipeline ?? '').toLowerCase();
  const role = String(input.slotRole ?? '').toLowerCase();
  if (pipe.includes('reel') || role.includes('reel')) return 'reel';
  if (pipe.includes('story') || role.includes('story') || role.includes('canvas')) {
    return 'story';
  }
  return 'post';
}

/** Map intensity channel → fal_story / fal_reel when a video pipeline is required. */
export function resolveFalVideoPipelineFromCatalog(
  catalogSlotKey: string | null | undefined,
  pipelineHint: string | null | undefined,
): 'fal_story' | 'fal_reel' {
  const channel = resolveFalIntensityChannel({
    catalogSlotKey,
    pipeline: pipelineHint,
  });
  return channel === 'reel' ? 'fal_reel' : 'fal_story';
}
