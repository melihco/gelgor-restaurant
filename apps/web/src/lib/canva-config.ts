/**
 * Canva Connect integration — REMOVED from product pipeline.
 * Production: Remotion (stories) + agency poster engine (feed).
 * Legacy imports call isCanvaEnabled() → always false.
 */

export function isCanvaEnabled(): boolean {
  return false;
}

export function isCanvaMcpEnabled(): boolean {
  return false;
}

export function isCanvaEnabledClient(): boolean {
  return false;
}
