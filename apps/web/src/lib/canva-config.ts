/**
 * Canva integration — DISABLED by product policy (enterprise).
 * Production: Remotion (stories) + agency SVG posters (feed).
 * Set CANVA_ENABLED=true only for local experiments.
 */

/** Server-side: opt-in — set CANVA_ENABLED=true to enable. */
export function isCanvaEnabled(): boolean {
  return process.env.CANVA_ENABLED === 'true';
}

/** Client-side: opt-in — set NEXT_PUBLIC_CANVA_ENABLED=true to enable. */
export function isCanvaEnabledClient(): boolean {
  if (typeof window === 'undefined') return isCanvaEnabled();
  return process.env.NEXT_PUBLIC_CANVA_ENABLED === 'true';
}
