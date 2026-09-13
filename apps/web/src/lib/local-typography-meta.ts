/**
 * Historical typography metadata helpers.
 *
 * Feed paint no longer uses a local Satori renderer. These helpers only
 * label older artifacts that still carry `satori_local` in metadata.
 * Kept client-safe so Mission Hub / badges do not pull native binaries.
 */

/** True when artifact metadata indicates the retired local renderer produced the still. */
export function isSatoriTypographyMeta(meta: Record<string, unknown> | null | undefined): boolean {
  if (!meta) return false;
  return meta.typography_model === 'satori_local' || meta.fal_design_engine === 'satori_local';
}
