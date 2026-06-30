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
  /** @deprecated Runway kapalı — reel slotları fal_reel kullanır. */
  allowRunwayReels: boolean;
  /** @deprecated Reels never use Remotion — kept for profile shape compatibility. */
  reelRemotionMotionFallback: boolean;
  /** Agency+Premium: Marky kapalı — post/story Remotion + Grafiker zorunlu (reel değil). */
  requireRemotionGrafiker: boolean;
}

const TIER_DEFAULTS: Record<ProductionProfileTier, Omit<ProductionProfile, 'tier' | 'allowRunwayReels' | 'requireRemotionGrafiker'>> = {
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
  const allowRunwayReels = false;

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
    allowRunwayReels,
    reelRemotionMotionFallback: false,
    requireRemotionGrafiker: tier === 'agency' || tier === 'premium',
  };
}

/** Marky / hızlı overlay yolu — economy dışında kapalı. */
export function shouldUseMarkyLayer(profile: ProductionProfile): boolean {
  return !profile.requireRemotionGrafiker;
}

/** Post slotları sync/async Remotion poster + Grafiker. */
export function slotUsesRemotionPost(
  profile: ProductionProfile,
  assignment: { pipeline: string; slot_role: string },
  contentKind: string,
): boolean {
  // fal.ai/GPT-image designed posts run on their own track — never Remotion.
  if (assignment.pipeline === 'fal_design' || assignment.slot_role === 'fal_designed_post') {
    return false;
  }
  if (assignment.pipeline === 'fal_only_post' || assignment.slot_role === 'fal_only_post') {
    return false;
  }
  if (!profile.requireRemotionGrafiker) return false;
  if (contentKind === 'instagram_reel') return false;
  if (assignment.pipeline === 'remotion_poster' || assignment.slot_role === 'designed_post') {
    return true;
  }
  if (contentKind === 'instagram_post' || contentKind === 'instagram_carousel') return true;
  return assignment.slot_role === 'organic_post';
}

/** Story slotları Remotion motion (çoklu galeri / hareketli tipografi). */
export function slotUsesRemotionStory(
  profile: ProductionProfile,
  assignment: { pipeline: string; slot_role: string },
  contentKind: string,
): boolean {
  if (assignment.pipeline === 'fal_story' || assignment.slot_role === 'fal_story_motion') {
    return false;
  }
  if (assignment.pipeline === 'fal_design' || assignment.slot_role === 'fal_designed_post') {
    return false;
  }
  if (
    assignment.pipeline === 'fal_only_story'
    || assignment.pipeline === 'fal_only_reel'
    || assignment.pipeline === 'fal_reel'
    || assignment.pipeline === 'runway_reel'
    || assignment.slot_role === 'fal_only_story'
    || assignment.slot_role === 'fal_only_reel'
    || assignment.slot_role === 'fal_reel_motion'
    || assignment.slot_role === 'organic_reel'
    || assignment.slot_role === 'campaign_reel_motion'
  ) {
    return false;
  }
  if (!profile.requireRemotionGrafiker) return false;
  if (contentKind === 'instagram_reel') return false;
  if (contentKind === 'instagram_story' || contentKind === 'instagram_canvas') return true;
  if (assignment.pipeline === 'remotion_story') return true;
  return assignment.slot_role === 'campaign_story_motion'
    || assignment.slot_role === 'organic_story_still';
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
