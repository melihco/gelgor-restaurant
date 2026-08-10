/**
 * Mission production cost guards — soft caps that cut GPT/fal/I2V spend
 * without disabling premium quality paths.
 *
 * Complements VIDEO_TIER_SCOPE (reel montage) and production profile retries.
 */

import { isVideoTierScopeActive } from '@/lib/video-tier-scope';

/** Hard ceiling for content-scoped missions (1 idea → 1 deliverable). */
export const MISSION_CONTENT_PRODUCTION_IDEA_CAP = 12;

/** Soft Grafiker score: accept mid-retry instead of burning another GPT edit. */
export const GROUNDED_SOFT_ACCEPT_SCORE = 6;

/** Prefer a readable grounded frame over paying Ideogram again. */
export const GROUNDED_KEEP_MIN_SCORE = 5;

/** Max gallery photos animated per beat montage (was 3). */
export const REEL_BEAT_MONTAGE_PHOTO_CAP = 2;

/** True for economy / agency / starter when VIDEO_TIER_SCOPE is on. */
export function isMissionCostScopeActive(productionTier?: string | null): boolean {
  return isVideoTierScopeActive(productionTier);
}

export function clampMissionProductionIdeaCount(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.min(Math.floor(count), MISSION_CONTENT_PRODUCTION_IDEA_CAP);
}

/**
 * Grounded GPT-image attempts before Ideogram / fail-closed.
 * Cost-scoped tiers never spend a 3rd paid edit.
 */
export function resolveGroundedDesignMaxAttempts(input: {
  productionTier?: string | null;
  groundedOnly?: boolean;
  libraryQualityFalFallback?: boolean;
}): number {
  if (input.libraryQualityFalFallback) return 1;
  if (isMissionCostScopeActive(input.productionTier)) return 2;
  return input.groundedOnly ? 3 : 2;
}

/** Mid-loop soft accept threshold; null = no soft accept (premium full retries). */
export function resolveGroundedSoftAcceptScore(
  productionTier?: string | null,
): number | null {
  if (!isMissionCostScopeActive(productionTier)) return null;
  return GROUNDED_SOFT_ACCEPT_SCORE;
}

/**
 * Keep a text-validated grounded compose instead of falling through to Ideogram.
 * Template replica always keeps grounded (caller already enforces).
 */
export function shouldKeepGroundedInsteadOfIdeogram(input: {
  productionTier?: string | null;
  textValidated: boolean;
  grafikerScore?: number | null;
  templateReplica?: boolean;
  libraryQualityFalFallback?: boolean;
}): boolean {
  if (input.libraryQualityFalFallback) return false;
  if (!input.textValidated) return false;
  if (input.templateReplica) return true;
  if (isMissionCostScopeActive(input.productionTier)) return true;
  const score = input.grafikerScore;
  return typeof score === 'number' && score >= GROUNDED_KEEP_MIN_SCORE;
}
