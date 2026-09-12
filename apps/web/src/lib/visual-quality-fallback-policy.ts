/**
 * Fail-closed visual engines. A cheaper second motor (Fal Ideogram, Satori
 * overlay after GPT miss, smoke-then-set) drops quality. Quota miss = stop.
 */

export function allowDegradedVisualFallback(): boolean {
  return false;
}

export function isStoryOrReelVisualFormat(format: string | null | undefined): boolean {
  const f = String(format ?? '').toLowerCase();
  return (
    f === 'story'
    || f === 'reel'
    || f === 'reel_cover'
    || f === 'fal_story'
    || f === 'fal_reel'
    || f === 'fal_only_story'
    || f === 'fal_only_reel'
  );
}
