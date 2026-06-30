/**
 * AI model profiles by commercial tier.
 *
 * Starter (= economy / studio) → lowest cost, acceptable for screen tests.
 * Agency → balanced. Premium → full quality.
 *
 * Override deployment-wide: AI_MODEL_TIER=starter|agency|premium
 * Per-request: pass packageSlug or productionProfile.tier.
 */

import type { ProductionProfileTier } from '@/lib/production-profile';

export type AiModelTier = 'starter' | 'agency' | 'premium';

export type ImageProvider = 'flux' | 'openai';

export interface AiModelProfile {
  /** Bulk tagging, captions, structured JSON. */
  chatStandard: string;
  /** Creative director, ideation-adjacent routes. */
  chatCreative: string;
  /** Hero gallery vision (still cheap on starter). */
  chatHero: string;
  /** Grafiker / visual QA vision model. */
  visionGrafiker: string;
  visionDetail: 'low' | 'high' | 'auto';
  /** OpenAI images.generate / edit when provider=openai. */
  imageOpenAiModel: string;
  imageOpenAiQuality: 'low' | 'medium' | 'high';
  imageProvider: ImageProvider;
  /** fal.ai generic image + typography flux fallback. */
  falImageModel: string;
  falTypographyFallback: string;
  /** Primary fal typography still model. */
  falIdeogramModel: string;
  /** Prefer Fal/Ideogram over GPT-image for designed posts (OpenAI billing guard). */
  preferFalDesignedPosts: boolean;
}

export const AI_MODEL_PROFILES: Record<AiModelTier, AiModelProfile> = {
  starter: {
    chatStandard: 'gpt-4o-mini',
    chatCreative: 'gpt-4o-mini',
    chatHero: 'gpt-4o-mini',
    visionGrafiker: 'gpt-4o-mini',
    visionDetail: 'low',
    imageOpenAiModel: 'gpt-image-1',
    imageOpenAiQuality: 'medium',
    imageProvider: 'flux',
    falImageModel: 'fal-ai/flux/schnell',
    falTypographyFallback: 'fal-ai/flux/schnell',
    falIdeogramModel: 'ideogram/v4',
    preferFalDesignedPosts: true,
  },
  agency: {
    chatStandard: 'gpt-4o-mini',
    chatCreative: 'gpt-4o-mini',
    chatHero: 'gpt-4o',
    visionGrafiker: 'gpt-4o-mini',
    visionDetail: 'low',
    imageOpenAiModel: 'gpt-image-1',
    imageOpenAiQuality: 'high',
    imageProvider: 'flux',
    falImageModel: 'fal-ai/flux/dev',
    falTypographyFallback: 'fal-ai/flux/dev',
    falIdeogramModel: 'ideogram/v4',
    preferFalDesignedPosts: false,
  },
  premium: {
    chatStandard: 'gpt-4o-mini',
    chatCreative: 'gpt-4o',
    chatHero: 'gpt-4o',
    visionGrafiker: 'gpt-4o',
    visionDetail: 'high',
    imageOpenAiModel: 'gpt-image-2',
    imageOpenAiQuality: 'high',
    imageProvider: 'flux',
    falImageModel: 'fal-ai/flux-pro/v1.1-ultra',
    falTypographyFallback: 'fal-ai/flux-pro/v1.1-ultra',
    falIdeogramModel: 'ideogram/v4',
    preferFalDesignedPosts: false,
  },
};

function readTierEnv(): string | undefined {
  const raw = process.env.AI_MODEL_TIER?.trim().toLowerCase();
  if (raw === 'starter' || raw === 'agency' || raw === 'premium') return raw;
  if (raw === 'economy') return 'starter';
  return undefined;
}

export function tierFromPackageSlug(slug: string | null | undefined): AiModelTier {
  const s = (slug ?? '').trim().toLowerCase();
  if (s === 'starter' || s === 'studio') return 'starter';
  if (s === 'growth' || s === 'agency') return 'agency';
  if (
    s === 'performance'
    || s === 'premium'
    || s === 'signature'
    || s === 'executive'
    || s === 'collective'
  ) {
    return 'premium';
  }
  return 'agency';
}

export function tierFromProductionProfile(tier: ProductionProfileTier | null | undefined): AiModelTier {
  if (tier === 'economy') return 'starter';
  if (tier === 'premium') return 'premium';
  return 'agency';
}

/** Resolve tier: env override → production tier → package slug → starter (cost-safe default). */
export function resolveAiModelTier(input?: {
  packageSlug?: string | null;
  productionTier?: ProductionProfileTier | null;
}): AiModelTier {
  const fromEnv = readTierEnv();
  if (fromEnv) return fromEnv;
  if (input?.productionTier) return tierFromProductionProfile(input.productionTier);
  if (input?.packageSlug) return tierFromPackageSlug(input.packageSlug);
  return 'starter';
}

export function getAiModelProfile(tier?: AiModelTier): AiModelProfile {
  return AI_MODEL_PROFILES[tier ?? resolveAiModelTier()];
}

export type ChatModelKind = 'standard' | 'creative' | 'hero';

export function chatModelForTier(tier: AiModelTier, kind: ChatModelKind): string {
  const p = AI_MODEL_PROFILES[tier];
  if (kind === 'creative') return p.chatCreative;
  if (kind === 'hero') return p.chatHero;
  return p.chatStandard;
}
