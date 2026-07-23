/**
 * Creative Direction Engine for GPT Image designed-posts.
 *
 * Reuses premium-editorial Brand DNA + variation selection; emits a compact
 * Canva-art-direction JSON block injected at the top of design-card prompts.
 * Multi-tenant: sector + slot look — never brand UUIDs.
 */

import { buildBrandVisualDna } from '@/lib/premium-editorial/brand-visual-dna';
import {
  buildCreativeDirection,
  selectCreativeVariation,
} from '@/lib/premium-editorial/creative-direction';
import type { CreativeVariationKey } from '@/lib/premium-editorial/types';
import {
  resolvePremiumTemplateFamily,
  type PremiumTemplateFamilyId,
} from '@/lib/premium-template-families';
import type { SlotLookKind } from '@/lib/slot-look-directive';

export type DesignedPostCreativeDirection = {
  brandPersonality: string[];
  campaignObjective: string;
  visualMood: string;
  compositionStrategy: string;
  photographyDirection: string;
  typographyDirection: string;
  colorStrategy: string;
  logoUsage: string;
  visualComplexity: 'low' | 'medium' | 'high';
  premiumLevel: 'high';
  negativeSpaceStrategy: string;
  lightingStyle: string;
  textureStyle: string;
  templateFamily: PremiumTemplateFamilyId;
  creativeVariationKey: CreativeVariationKey;
};

export function resolveDesignedPostCreativeDirection(input: {
  workspaceId: string;
  brandName?: string | null;
  businessType?: string | null;
  brandTone?: string | null;
  location?: string | null;
  brandTheme?: Record<string, unknown> | null;
  visualDna?: Record<string, unknown> | null;
  logoUrl?: string | null;
  brandReferenceImageUrls?: string[];
  headline?: string | null;
  subtitle?: string | null;
  caption?: string | null;
  cta?: string | null;
  mood?: string | null;
  slotLook?: SlotLookKind | null;
  announcementType?: string | null;
  catalogSlotKey?: string | null;
  recentVariationKeys?: CreativeVariationKey[];
  brandColors?: { primary: string; accent: string } | null;
}): DesignedPostCreativeDirection {
  const family = resolvePremiumTemplateFamily({
    slotLook: input.slotLook,
    announcementType: input.announcementType,
    catalogSlotKey: input.catalogSlotKey,
    businessType: input.businessType,
    headline: input.headline,
    caption: input.caption,
  });

  const dna = buildBrandVisualDna({
    brandId: input.workspaceId,
    brandContext: {
      brand_name: input.brandName,
      business_type: input.businessType,
      brand_tone: input.brandTone,
      location: input.location,
      visual_dna: input.visualDna,
      logo_url: input.logoUrl,
      reference_image_urls: input.brandReferenceImageUrls,
      brand_theme: input.brandTheme,
    },
    brandTheme: input.brandTheme,
    logoAssetUrl: input.logoUrl,
    galleryUrls: input.brandReferenceImageUrls,
  });

  const variationKey = selectCreativeVariation({
    preferred: family.preferredVariation,
    recent: input.recentVariationKeys,
    forceNew: true,
    seed: `${input.workspaceId}:${input.catalogSlotKey ?? ''}:${input.headline ?? ''}:${family.id}`,
  });

  const topic = String(input.headline ?? input.caption ?? 'brand campaign').trim().slice(0, 80);
  const brief = buildCreativeDirection({
    dna,
    request: {
      brandId: input.workspaceId,
      workspaceId: input.workspaceId,
      contentTopic: topic,
      campaignGoal: input.mood ?? family.campaignObjectiveHint,
      headline: input.headline ?? topic,
      subheadline: input.subtitle ?? '',
      cta: input.cta ?? '',
      caption: input.caption ?? '',
      mood: input.mood ?? null,
      language: 'tr',
      outputType: 'post',
      aspectRatio: '4:5',
      addTextOverlay: true,
      addLogoOverlay: Boolean(input.logoUrl),
      numberOfVariations: 1,
      forceNewComposition: true,
      preferredCreativeVariation: variationKey,
      recentVariationKeys: input.recentVariationKeys,
    },
    variationKey,
  });

  const primary = input.brandColors?.primary ?? dna.primaryColors[0] ?? '#1f2a30';
  const accent = input.brandColors?.accent ?? dna.accentColors[0] ?? '#c9813f';

  return {
    brandPersonality: family.brandPersonality,
    campaignObjective: brief.creativeIdea.slice(0, 160),
    visualMood: brief.backgroundAtmosphere || family.visualMood,
    compositionStrategy: family.compositionStrategy,
    photographyDirection: brief.photographyDirection || family.photographyDirection,
    typographyDirection: family.typographyDirection,
    colorStrategy: family.colorStrategy
      .replace('{primary}', primary)
      .replace('{accent}', accent),
    logoUsage: family.logoUsage,
    visualComplexity: family.visualComplexity,
    premiumLevel: 'high',
    negativeSpaceStrategy: brief.negativeSpaceStrategy || family.negativeSpaceStrategy,
    lightingStyle: brief.lightingMood || family.lightingStyle,
    textureStyle: family.textureStyle,
    templateFamily: family.id,
    creativeVariationKey: variationKey,
  };
}

/** Prompt-ready block for GPT Image design-card / replica prompts. */
export function formatDesignedPostCreativeDirectionBlock(
  cd: DesignedPostCreativeDirection,
): string {
  const json = {
    brandPersonality: cd.brandPersonality,
    campaignObjective: cd.campaignObjective,
    visualMood: cd.visualMood,
    compositionStrategy: cd.compositionStrategy,
    photographyDirection: cd.photographyDirection,
    typographyDirection: cd.typographyDirection,
    colorStrategy: cd.colorStrategy,
    logoUsage: cd.logoUsage,
    visualComplexity: cd.visualComplexity,
    premiumLevel: cd.premiumLevel,
    negativeSpaceStrategy: cd.negativeSpaceStrategy,
    lightingStyle: cd.lightingStyle,
    textureStyle: cd.textureStyle,
    templateFamily: cd.templateFamily,
    creativeVariation: cd.creativeVariationKey,
  };
  return [
    '═══ CREATIVE DIRECTION (MANDATORY ART DIRECTION — Canva premium agency bar) ═══',
    JSON.stringify(json),
    'Execute this brief as a cohesive designed social post — not a photo with random text.',
    'Typography, color craft, photo crop, and logo zone must feel like one boutique-agency template customized for this brand.',
    'FORBIDDEN: amateur color-block slabs, generic caption bars, mid-tier Canva clone energy, invented packaging labels.',
  ].join('\n');
}
