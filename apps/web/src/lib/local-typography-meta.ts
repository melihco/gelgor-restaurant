/**
 * Client-safe Satori typography metadata helpers.
 *
 * Kept separate from local-typography-renderer.ts on purpose: the renderer
 * imports satori/resvg/sharp (native Node binaries), so client-reachable
 * modules (mission-slot-checklist, artifact-production-badge) must import
 * these helpers from here instead — otherwise Next tries to bundle the
 * native modules into the browser build and fails.
 */

/** True when artifact metadata indicates the Satori local renderer produced the still. */
export function isSatoriTypographyMeta(meta: Record<string, unknown> | null | undefined): boolean {
  if (!meta) return false;
  return meta.typography_model === 'satori_local' || meta.fal_design_engine === 'satori_local';
}

/** Slot roles whose text-heavy stills route to local rendering (flag-gated). */
export const LOCAL_TYPOGRAPHY_ROLES: ReadonlySet<string> = new Set([
  'campaign_story_motion',
  'fal_story_motion',
  'designed_typography',
  'fal_designed_post',
  'fal_only_story',
  'fal_only_post',
]);
