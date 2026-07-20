/**
 * Layer 1 — Brand Visual DNA
 * Built from existing brand_context / theme fields. Never invents factual business details.
 */

import {
  PREMIUM_EDITORIAL_PROMPT_VERSION,
  type BrandVisualDNA,
} from './types';

function asString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length ? t : null;
}

function asStringList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof v === 'string' && v.trim()) {
    return v.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function asHexList(v: unknown): string[] {
  return asStringList(v).filter((c) => /^#?[0-9a-fA-F]{3,8}$/.test(c));
}

function normalizeHex(c: string): string {
  return c.startsWith('#') ? c : `#${c}`;
}

function readThemeColors(theme: Record<string, unknown> | null | undefined): {
  primary: string[];
  secondary: string[];
  accent: string[];
} {
  const colors = (theme?.colors ?? theme?.brand_colors ?? theme?.brandColors ?? {}) as Record<string, unknown>;
  const primary = asHexList(colors.primary ?? theme?.primary_color ?? theme?.primaryColor).map(normalizeHex);
  const secondary = asHexList(colors.secondary ?? theme?.secondary_color).map(normalizeHex);
  const accent = asHexList(colors.accent ?? theme?.accent_color ?? theme?.accentColor).map(normalizeHex);
  return { primary, secondary, accent };
}

function seasonFromDate(d = new Date()): string {
  const m = d.getUTCMonth();
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'autumn';
  return 'winter';
}

export interface BuildBrandVisualDnaInput {
  brandId: string;
  brandContext?: Record<string, unknown> | null;
  brandTheme?: Record<string, unknown> | null;
  logoAssetUrl?: string | null;
  galleryUrls?: string[];
}

/**
 * Resolve BrandVisualDNA from saved brand intelligence.
 * Missing fields stay null/empty — only non-critical visual defaults are inferred.
 */
export function buildBrandVisualDna(input: BuildBrandVisualDnaInput): BrandVisualDNA {
  const ctx = input.brandContext ?? {};
  const theme = input.brandTheme
    ?? ((ctx.brand_theme ?? ctx.brandTheme ?? {}) as Record<string, unknown>);
  const palette = readThemeColors(theme);

  const brandName = asString(ctx.brand_name)
    ?? asString(ctx.brandName)
    ?? asString(ctx.name)
    ?? 'Brand';

  const sector = asString(ctx.business_type)
    ?? asString(ctx.businessType)
    ?? asString(ctx.industry)
    ?? asString(ctx.sector);

  const location = asString(ctx.location) ?? asString(ctx.city);
  const visualDnaRaw = asString(ctx.visual_dna) ?? asString(ctx.visualDna);
  const brandDnaRaw = asString(ctx.brand_dna) ?? asString(ctx.brandDna);
  const tone = asString(ctx.brand_tone) ?? asString(ctx.brandTone) ?? asString(ctx.tone);
  const vibe = (ctx.brand_vibe_profile ?? ctx.brandVibeProfile ?? {}) as Record<string, unknown>;

  const logoUrl = asString(input.logoAssetUrl)
    ?? asString(ctx.logo_url)
    ?? asString(ctx.logoUrl)
    ?? asString(theme.logo_url)
    ?? asString(theme.logoUrl);

  const gallery = (input.galleryUrls?.length
    ? input.galleryUrls
    : asStringList(ctx.reference_image_urls ?? ctx.referenceImageUrls)
  ).slice(0, 24);

  const forbiddenFromVibe = asStringList(vibe.anti_patterns ?? vibe.antiPatterns);

  // Infer only soft visual defaults — never invent address, prices, hours, menu items.
  const photographyStyle = asString(vibe.photography_style)
    ?? asString(vibe.photographyStyle)
    ?? (visualDnaRaw ? 'editorial_cinematic' : 'natural_editorial');

  const lightingStyle = asString(vibe.lighting)
    ?? asString(vibe.lighting_style)
    ?? 'golden_hour_natural';

  return {
    brandId: input.brandId,
    brandName,
    sector,
    subSector: asString(ctx.sub_sector) ?? asString(ctx.subSector),
    location,
    city: asString(ctx.city) ?? (location && !location.includes(',') ? location : null),
    country: asString(ctx.country),
    venueType: sector,
    productCategory: asString(ctx.product_category) ?? asString(ctx.productCategory),
    priceSegment: asString(ctx.price_segment) ?? asString(ctx.priceSegment) ?? 'premium',
    luxuryLevel: asString(ctx.luxury_level) ?? 'refined',
    targetAudience: asString(ctx.target_audience) ?? asString(ctx.targetAudience),
    audienceAgeRange: asString(ctx.audience_age_range) ?? asString(ctx.audienceAgeRange),
    customerMotivations: asStringList(ctx.customer_motivations ?? ctx.customerMotivations),
    brandPersonality: asString(ctx.brand_personality)
      ?? asString(ctx.brandPersonality)
      ?? brandDnaRaw?.slice(0, 180)
      ?? null,
    brandArchetype: asString(ctx.brand_archetype) ?? asString(ctx.brandArchetype),
    brandTone: tone,
    visualMood: asString(ctx.visual_mood)
      ?? asString(ctx.visualMood)
      ?? asString(vibe.mood)
      ?? visualDnaRaw?.slice(0, 160)
      ?? 'calm_premium_mediterranean',
    emotionalKeywords: asStringList(ctx.emotional_keywords ?? ctx.emotionalKeywords ?? vibe.emotions),
    primaryColors: palette.primary,
    secondaryColors: palette.secondary,
    accentColors: palette.accent,
    forbiddenColors: asHexList(theme.forbidden_colors).map(normalizeHex),
    preferredMaterials: asStringList(ctx.preferred_materials ?? vibe.materials).length
      ? asStringList(ctx.preferred_materials ?? vibe.materials)
      : ['natural stone', 'linen', 'warm wood', 'handblown glass'],
    preferredTextures: asStringList(ctx.preferred_textures ?? vibe.textures).length
      ? asStringList(ctx.preferred_textures ?? vibe.textures)
      : ['soft fabric', 'matte ceramic', 'sunlit water'],
    interiorStyle: asString(ctx.interior_style) ?? asString(vibe.interior_style),
    architecturalStyle: asString(ctx.architectural_style),
    photographyStyle,
    lightingStyle,
    shadowStyle: asString(ctx.shadow_style) ?? 'soft_natural',
    preferredCameraAngles: asStringList(ctx.preferred_camera_angles).length
      ? asStringList(ctx.preferred_camera_angles)
      : ['three_quarter', 'eye_level', 'slight_overhead'],
    preferredLensStyle: asString(ctx.preferred_lens_style) ?? '35mm_editorial',
    preferredDepthOfField: asString(ctx.preferred_depth_of_field) ?? 'shallow_to_medium',
    productPresentationStyle: asString(ctx.product_presentation_style) ?? 'hero_still_life',
    foodStylingStyle: asString(ctx.food_styling_style) ?? 'natural_plated',
    compositionPreferences: asStringList(ctx.composition_preferences).length
      ? asStringList(ctx.composition_preferences)
      : ['asymmetric', 'negative_space', 'editorial'],
    preferredNegativeSpaceRatio: 0.35,
    preferredLogoPosition: asString(theme.logo_position) ?? 'bottom_right',
    preferredTextAlignment: asString(theme.text_alignment) ?? 'left',
    preferredTypographyCategory: asString(
      (theme.typography as Record<string, unknown> | undefined)?.category,
    ) ?? 'editorial_serif_sans_mix',
    headlineTone: tone ?? 'restrained_premium',
    ctaTone: 'quiet_invitation',
    preferredHeadlineLength: 'short',
    forbiddenVisualStyles: forbiddenFromVibe.length
      ? forbiddenFromVibe
      : [
          'canva_template',
          'neon_club_clutter',
          'oversaturated_stock',
          'fake_luxury_cliches',
          'busy_diagonal_triangles',
        ],
    competitorReferences: [],
    inspirationReferences: asStringList(ctx.inspiration_references),
    seasonalContext: asString(ctx.seasonal_context) ?? seasonFromDate(),
    localCulturalElements: asStringList(ctx.local_cultural_elements),
    brandDistinctiveAssets: asStringList(ctx.distinctive_assets),
    logoAssetUrl: logoUrl,
    brandGalleryAssetIds: gallery,
    existingSuccessfulContentReferences: asStringList(ctx.successful_content_refs),
    promptArchitectureVersion: PREMIUM_EDITORIAL_PROMPT_VERSION,
  };
}
