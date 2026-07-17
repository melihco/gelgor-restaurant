/**
 * VIDEO_TIER_SCOPE — collapse expensive multi-clip / multi-retry video paths
 * for non-premium tiers. Premium always keeps full budget.
 */

import { resolveAiModelTier } from '@/lib/ai-model-tier';
import type { ProductionProfileTier } from '@/lib/production-profile';
import { serverConfig } from '@/lib/server-config';

type ReelMontageStrategy = 'single' | 'multi_ref' | 'sequential';

/** True when scoped savings apply (flag on + not premium). */
export function isVideoTierScopeActive(productionTier?: string | null): boolean {
  if (!serverConfig.productionFlags.videoTierScope) return false;
  const explicit = String(productionTier ?? '').toLowerCase();
  if (explicit === 'premium') return false;
  if (explicit === 'economy' || explicit === 'agency' || explicit === 'starter') {
    return true;
  }
  return resolveAiModelTier({
    productionTier: explicit as ProductionProfileTier | null,
  }) !== 'premium';
}

/** sequential / multi_ref → single when scope is active. */
export function applyVideoTierScopeToMontageStrategy(
  strategy: ReelMontageStrategy,
  productionTier?: string | null,
): ReelMontageStrategy {
  if (!isVideoTierScopeActive(productionTier)) return strategy;
  return 'single';
}

/**
 * Reel I2V retry budget. Scoped tiers get 1 attempt (Kling→Luma chain still
 * runs inside that attempt); premium keeps the full FAL_REEL_MOTION_ATTEMPTS.
 */
export function resolveFalReelMotionAttemptBudget(
  pipeline: 'fal_story' | 'fal_reel',
  fullBudget: number,
  productionTier?: string | null,
): number {
  if (pipeline !== 'fal_reel') return 1;
  if (isVideoTierScopeActive(productionTier)) return 1;
  return Math.max(1, fullBudget);
}
