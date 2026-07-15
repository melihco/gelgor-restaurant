/**
 * P2-1 — Economy / agency / premium production profile resolver.
 * Drives manifest slots, Grafiker retries, FD fallback policy, and enhance aggressiveness.
 */
import { GIS_PROPOSE_THRESHOLD } from '@/lib/gallery-intelligence';
import { getPlanSpec } from '@/lib/package-plan-config';

export type ProductionProfileTier = 'economy' | 'agency' | 'premium';

export type FdFallbackPolicy = 'block' | 'allow_warn';

export interface ProductionProfile {
  tier: ProductionProfileTier;
  remotionStoryMotionSlots: number;
  remotionStoryStillSlots: number;
  grafikerMaxRetries: number;
  fdFallbackPolicy: FdFallbackPolicy;
  skipAggressiveEnhance: boolean;
  /** @deprecated Reels never use Remotion — kept for profile shape compatibility. */
  reelRemotionMotionFallback: boolean;
  /** Agency+Premium: Marky kapalı — post/story fal designed + Grafiker zorunlu (reel değil). */
  requireDesignedVisuals: boolean;
}

const TIER_DEFAULTS: Record<ProductionProfileTier, Omit<ProductionProfile, 'tier' | 'requireDesignedVisuals'>> = {
  economy: {
    remotionStoryMotionSlots: 2,
    remotionStoryStillSlots: 1,
    grafikerMaxRetries: 0,
    fdFallbackPolicy: 'block',
    skipAggressiveEnhance: true,
    reelRemotionMotionFallback: false,
  },
  agency: {
    remotionStoryMotionSlots: 3,
    remotionStoryStillSlots: 0,
    grafikerMaxRetries: 1,
    fdFallbackPolicy: 'allow_warn',
    skipAggressiveEnhance: false,
    reelRemotionMotionFallback: false,
  },
  premium: {
    remotionStoryMotionSlots: 3,
    remotionStoryStillSlots: 0,
    grafikerMaxRetries: 2,
    fdFallbackPolicy: 'allow_warn',
    skipAggressiveEnhance: false,
    reelRemotionMotionFallback: false,
  },
};

function tierFromPackageSlug(slug: string): ProductionProfileTier {
  if (slug === 'starter' || slug === 'studio') return 'economy';
  if (slug === 'growth' || slug === 'agency') return 'agency';
  if (
    slug === 'performance'
    || slug === 'premium'
    || slug === 'signature'
    || slug === 'executive'
    || slug === 'collective'
  ) {
    return 'premium';
  }
  return 'agency';
}

export function resolveProductionProfile(input: {
  packageSlug?: string | null;
  gisScore?: number | null;
  brandTheme?: Record<string, unknown> | null;
  monthlyReels?: number;
  profileTierOverride?: ProductionProfileTier | null;
}): ProductionProfile {
  const slug = (input.packageSlug ?? '').trim().toLowerCase();
  const plan = getPlanSpec(slug);
  const monthlyReels = input.monthlyReels ?? plan?.outputs.reels ?? -1;

  let tier: ProductionProfileTier = input.profileTierOverride
    ?? tierFromPackageSlug(slug);

  const brandTier = String(
    input.brandTheme?.quality_tier ?? input.brandTheme?.qualityTier ?? '',
  ).toLowerCase();
  if (!input.profileTierOverride) {
    if (brandTier === 'economy') tier = 'economy';
    else if (brandTier === 'premium') tier = 'premium';
    else if (brandTier === 'agency' && tier !== 'economy') tier = 'agency';
  }

  if (input.gisScore != null && input.gisScore < GIS_PROPOSE_THRESHOLD) {
    tier = 'economy';
  }

  const defaults = TIER_DEFAULTS[tier];
  return {
    tier,
    ...defaults,
    reelRemotionMotionFallback: false,
    requireDesignedVisuals: tier === 'agency' || tier === 'premium',
  };
}

/** Marky / hızlı overlay yolu — economy dışında kapalı. */
export function shouldUseMarkyLayer(profile: ProductionProfile): boolean {
  return !profile.requireDesignedVisuals;
}

export function isFeedDirectorFallback(report: Record<string, unknown> | null | undefined): boolean {
  return report?._fallback === true;
}

export function shouldBlockProductionOnFdFallback(profile: ProductionProfile): boolean {
  return profile.fdFallbackPolicy === 'block';
}

export async function fetchGisScoreForWorkspace(
  workspaceId: string,
  baseUrl: string,
): Promise<number | null> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/gallery-intelligence/${workspaceId}`, {
      headers: { 'X-Tenant-Id': workspaceId },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { score?: number };
    return typeof data.score === 'number' ? data.score : null;
  } catch {
    return null;
  }
}
