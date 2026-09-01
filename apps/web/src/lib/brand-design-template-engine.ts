/**
 * Brand design template engine.
 *
 * Generates a brand-consistent set of design templates from the brand's real
 * gallery photos, corporate colors, logo and vibe — the onboarding step that
 * makes "Canva-level, brand-aware" output possible. Each preset becomes one
 * Fal.ai (GPT-image grounded edit) preview anchored on a matched gallery photo,
 * mirrored to R2, and described by a reusable `design_spec` so the auto-produce
 * pipeline can re-render brand-consistent variations for any mission headline.
 */

import type { TypographyVibe, TypographyBackgroundStyle } from '@/types/brand-theme';
import {
  buildDesignedPostDesignCardPrompt,
  buildDesignedStoryDesignCardPrompt,
  buildDesignedVideoReelDesignCardPrompt,
  pickFalLibraryFallbackDirectives,
  produceFalDesignedPostStill,
  resolveIdeogramBackgroundStyle,
  resolveTypographyVibeFromContext,
} from '@/lib/fal-designer-production';
import {
  lockImageToCanvas,
  resolveTargetCanvasForFormat,
} from '@/lib/design-canvas-aspect';
import {
  resolveFalTemplateBackgroundStyle,
  resolveFalTemplateProductionSettings,
  resolveTemplateLibraryDesignIntensity,
  shouldProminentLogoInFalTemplate,
  applyFalProductionOverridesToTheme,
  type BrandFalTemplateProductionConfig,
} from '@/lib/fal-template-production-settings';
import {
  buildFalDesignBriefDirectives,
  readTenantPreferredCanvaArchetypes,
  resolveFalDesignBrief,
} from '@/lib/fal-design-brief';
import type { FalDesignChannel } from '@/lib/fal-design-intensity';
import {
  clampDesignIntensityForArchetype,
  describeDesignCraftLayoutFamily,
  resolveCalendarFalDesignIntensity,
  resolveDesignCraftLayoutFamily,
  type DesignCraftLayoutFamily,
  type FalDesignIntensityLevel,
} from '@/lib/fal-design-intensity';
import {
  buildBrandLayoutLanguageDirectives,
  resolveBrandLayoutLanguage,
  resolveCraftAllowlistForPack,
  resolveTemplateLibraryEffectiveIntensity,
  shouldApplyCraftLayoutFamily,
} from '@/lib/brand-layout-language';
import { resolveBrandMarkMode } from '@/lib/brand-mark-mode';
import {
  formatFalLogoPlacementDirective,
  resolveFalLogoPlacement,
  type ResolvedFalLogoPlacement,
} from '@/lib/fal-logo-placement';
import {
  fetchSlotTemplateArtDirection,
  formatSlotArtDirectionPromptBlock,
  type SlotArtDirection,
} from '@/lib/slot-template-art-direction';
import {
  DESIGN_TEMPLATE_TO_CALENDAR_ANNOUNCEMENT,
  resolveFalUseCaseForDesignTemplate,
  type DesignTemplateFormat,
  type DesignTemplatePreset,
  resolveDesignTemplatePresets,
} from '@/lib/brand-design-template-presets';
import { normalizeLibraryPromptForFormat } from '@/lib/brand-design-template-production';
import { resolveCalendarDesignLayout } from '@/lib/calendar-design-layout';
import {
  isTypographyDesignConfirmed,
  readTypographyDesignConfig,
} from '@/lib/typography-design-policy';
import {
  type GalleryPhotoMeta,
  matchPhotoToContent,
} from '@/lib/gallery-photo-matcher';
import {
  buildCatalogAwareGalleryMatchFields,
  filterGalleryUrlsByPreferredAssetTypes,
} from '@/lib/catalog-slot-gallery';
import { normalizeGalleryUrl } from '@/lib/gallery-usage-tracker';
import { isUsableGalleryPhotoUrl } from '@/lib/media-url';
import { generateDesignedPostImage } from '@/app/api/auto-produce/handlers/image-generators';
import { generateStorageKey, isR2Configured, uploadImageFromUrl } from '@/lib/r2-storage';
import { serverConfig } from '@/lib/server-config';
import { getSectorProfile } from '@/lib/sector-production-profile';
import { parseMotionProfileFromTheme } from '@/lib/brand-motion-profile';
import { resolveBrandReelProductionParams } from '@/lib/brand-reel-motion-profile';
import {
  reelRecipeToJson,
  seedReelRecipeForTemplate,
} from '@/lib/reel-production-recipe';
import {
  buildReelCoverDiversityDirectives,
  preferCoverCanvaForReelArchetype,
  resolveReelArchetypeForProduction,
} from '@/lib/reel-canva-archetypes';
import { getCanvaArchetype } from '@/lib/canva-archetype-catalog';
import {
  buildSlotCopyFitDirective,
  fitSlotPunchline,
  resolveSlotSampleCopy,
} from '@/lib/slot-sample-copy';
import { showSublineFromSampleCopy } from '@/lib/slot-subline-policy';
import {
  formatSlotCreativeBriefPromptBlock,
  resolveSlotCreativeForLibraryGen,
  type SlotCreativeCustomization,
} from '@/lib/slot-creative-customization';
import {
  seedGeneratedTypeBudget,
  type TemplateTypeBudget,
} from '@/lib/template-type-budget';

/** A special day (DB-resolved) the brand should get a dedicated event template for. */
export interface EngineSpecialDay {
  name: string;
  /** Day-specific creative vibe layered on top of the brand template. */
  themeHint: string;
  /** MM-DD so production can pick the right template when the day approaches. */
  mmdd: string;
  category: string;
  daysUntil: number;
}

export interface DesignTemplateEngineInput {
  workspaceId: string;
  sector: string;
  brandName: string;
  brandColors: { primary: string; accent: string };
  logoUrl?: string;
  location?: string;
  locale?: string;
  /** Resolved country code (for design_spec provenance). */
  countryCode?: string;
  /** One-line brand visual tone distilled from visual_dna (see fal-brand-input). */
  visualDnaTone?: string;
  /** Deep brand learning context injected into every template prompt. */
  brandIntelligence?: {
    description?: string;
    brandTone?: string;
    visualDna?: string;
    visualStyle?: string;
    targetAudience?: string;
    campaignGoals?: string;
    contentPillars?: string[];
    defaultCtas?: string[];
    vibeProfile?: Record<string, unknown> | null;
    serviceProfile?: Record<string, unknown> | null;
  };
  /** brand_theme JSON — typography_design + fal_design_intensity for onboarding previews. */
  brandTheme?: Record<string, unknown> | null;
  /** Sector + theme anti-patterns injected into preview prompts. */
  antiPatterns?: string[];
  galleryPhotoUrls: string[];
  galleryAnalysis: Record<string, GalleryPhotoMeta>;
  /**
   * Country special days (closest first). The `event_special` preset expands
   * into one brand-consistent template per occasion (capped by maxSpecialDays).
   */
  specialDays?: EngineSpecialDay[];
  /** Max number of special-day event templates to generate (default 4). */
  maxSpecialDays?: number;
  /** Limit how many preset types to generate (default: all presets). */
  limit?: number;
  /** Parallelism for generation calls (default 3). */
  concurrency?: number;
  /** When set, overrides sector default presets (catalog-driven onboarding). */
  presets?: DesignTemplatePreset[];
  /** Transient fal_template_production overrides (slot preview / compare). */
  productionOverrides?: Partial<BrandFalTemplateProductionConfig>;
  /**
   * When true, fal still path may use a faster Ideogram-only pass (no gallery).
   * Template library generation prefers GPT-image when a gallery photo exists;
   * this flag only affects the fal fallback path. Default true.
   */
  templatePreviewMode?: boolean;
  /**
   * Gallery URLs to skip when picking a photo (per-slot regenerate should not
   * reuse the previous anchor — otherwise the preview looks "unchanged").
   */
  excludeGalleryUrls?: string[];
  /**
   * Salt mixed into craft layout-family seed so regenerate diversifies composition
   * even when catalog slot key stays the same. Also passed to CrewAI art direction.
   */
  layoutFamilySalt?: string;
  /**
   * Explicit subline preference from Brand Hub toggle / prior design_spec.
   * false → headline-only; true → keep/ensure short support; unset → sample copy default.
   */
  forceShowSubline?: boolean | null;
  /**
   * Explicit logo preference from Brand Hub toggle / prior design_spec.
   * false → no official logo / wordmark; true → include when asset exists;
   * unset → theme + preset prominentLogo default.
   */
  forceIncludeLogo?: boolean | null;
  /**
   * Operator type_budget from a prior design_spec — preserved across regenerate.
   * Non-operator budgets are re-seeded from the new sample punchline.
   */
  preserveOperatorTypeBudget?: TemplateTypeBudget | null;
  /** When false, skip CrewAI slot art direction (tests / offline). Default true. */
  enableSlotArtDirection?: boolean;
  /**
   * Existing brand×slot creative briefs keyed by catalog_slot_key
   * (from tenant_slot_assignments.customization).
   */
  slotCreativeByKey?: Record<string, unknown>;
  /** When true, reseed auto briefs even if one already exists (never overwrites operator). */
  forceReseedSlotCreative?: boolean;
}

/** Shape matching the backend DesignTemplateCreate payload. */
export interface GeneratedDesignTemplate {
  template_type: string;
  template_name: string;
  format: DesignTemplateFormat;
  thumbnail_url: string | null;
  sector_category: string | null;
  locale: string | null;
  catalog_slot_key?: string | null;
  design_spec: {
    prompt: string;
    vibe: TypographyVibe;
    brandColors: { primary: string; accent: string };
    sampleHeadline: string;
    sampleSubtitle?: string;
    /** false = headline-only layout for this template slot */
    showSubline?: boolean;
    /**
     * Brand Hub: include official logo on this template canvas.
     * Synced with prominentLogo for matcher / production.
     */
    includeLogo?: boolean;
    /** Layout-fit logo anchor for post-composite (when includeLogo). */
    logoPlacement?: ResolvedFalLogoPlacement | null;
    /** Per-template on-canvas char/word budget (operator | generated). */
    type_budget?: TemplateTypeBudget;
    galleryRef: string | null;
    galleryMatchScore: number | null;
    intent: string;
    prominentLogo: boolean;
    logoUrl?: string;
    /** official_logo | text_wordmark | none — never logo + typed name together. */
    brandMarkMode?: 'official_logo' | 'text_wordmark' | 'none';
    /** Set for event_special templates so production can match by date. */
    specialDay?: { name: string; mmdd: string; category: string };
    generatedAt: string;
    generator: 'gpt-image-1' | 'gpt-image-2' | 'fal-ideogram' | 'none';
    /** Per-channel design intensity applied during generation. */
    designIntensityLevel?: import('@/lib/fal-design-intensity').FalDesignIntensityLevel;
    /** Original tenant setting before template-library layout enrichment. */
    productionIntensityLevel?: import('@/lib/fal-design-intensity').FalDesignIntensityLevel;
    /** Catalog slot key when preset came from production_slot_definitions. */
    catalogSlotKey?: string | null;
    /** True when this template was anchored to the shared venue/hero photo. */
    defaultHeroPhotoLock?: boolean;
    /** Canva archetype metadata locked into the reusable template recipe. */
    canvaArchetypeId?: string | null;
    canvaArchetypeName?: string | null;
    layoutPattern?: string;
    typographyMode?: string;
    /** CrewAI marka×slot art direction persisted for mission replica. */
    slot_art_direction?: SlotArtDirection | null;
    /** Brand×slot structured creative brief used during library generation. */
    slot_creative_brief?: SlotCreativeCustomization | null;
    designBriefDirectives?: string[];
    /**
     * Reel production recipe (motion/kurgu/audio) — seeded for reel_cover
     * templates so slot match carries brand-specific fal_reel policy.
     */
    reel_recipe?: Record<string, unknown>;
  };
}

export interface DesignTemplateEngineResult {
  templates: GeneratedDesignTemplate[];
  generated: number;
  failed: number;
}

function aspectForFormat(format: DesignTemplateFormat): '9:16' | '4:5' | '1:1' {
  if (format === 'story' || format === 'reel_cover') return '9:16';
  return '4:5';
}

function imageFormatForFormat(format: DesignTemplateFormat): 'post' | 'story' {
  return format === 'post' ? 'post' : 'story';
}

const HERO_ASSET_TYPE_SCORES: Array<[RegExp, number]> = [
  [/hero_image/i, 120],
  [/venue_reference|venue_photo/i, 100],
  [/brand_background/i, 80],
  [/product_image|food_drink_photo/i, -20],
  [/event_photo/i, -30],
  [/logo|icon/i, -120],
];

/** F&B / hospitality — plate & glass photos ARE the brand hero, not a penalty. */
const FOOD_VENUE_HERO_ASSET_SCORES: Array<[RegExp, number]> = [
  [/hero_image/i, 120],
  [/venue_reference|venue_photo/i, 100],
  [/food_drink_photo|product_image/i, 55],
  [/brand_background/i, 50],
  [/event_photo/i, 25],
  [/logo|icon/i, -120],
];

function scoreDefaultHeroPhoto(
  url: string,
  meta: GalleryPhotoMeta | undefined,
  sector?: string | null,
): number {
  const assetType = String(meta?.suggestedAssetType ?? '');
  const description = String(
    (meta as GalleryPhotoMeta & { description?: unknown; caption?: unknown; summary?: unknown } | undefined)?.description
      ?? (meta as GalleryPhotoMeta & { caption?: unknown } | undefined)?.caption
      ?? (meta as GalleryPhotoMeta & { summary?: unknown } | undefined)?.summary
      ?? '',
  ).toLowerCase();
  const quality = Number(
    (meta as GalleryPhotoMeta & { qualityScore?: unknown; quality_score?: unknown; score?: unknown } | undefined)?.qualityScore
      ?? (meta as GalleryPhotoMeta & { quality_score?: unknown; score?: unknown } | undefined)?.quality_score
      ?? (meta as GalleryPhotoMeta & { score?: unknown } | undefined)?.score
      ?? 0,
  );

  const sectorId = String(sector ?? '');
  const foodVenue = getSectorProfile(sector).hasPhysicalVenue
    && /restaurant|cafe|bar|bakery|local_products|hospitality|hotel/i.test(sectorId);
  const assetScores = foodVenue ? FOOD_VENUE_HERO_ASSET_SCORES : HERO_ASSET_TYPE_SCORES;

  let score = Number.isFinite(quality) ? Math.min(quality, 100) / 5 : 0;
  for (const [rx, value] of assetScores) {
    if (rx.test(assetType)) score += value;
  }
  if (/water|sea|beach|shore|venue|terrace|table|entrance|harbor|sunset|view|mekan|sahil|deniz|pool|infinity|aerial|drone|panoram/.test(description)) {
    score += 20;
  }
  if (/paddle|surfboard|sup board|kayak|single board|product only|haute boards|brand on product/.test(description)) {
    score -= 35;
  }
  if (!foodVenue
    && /cocktail|drink|food|burger|fries|salad|taco|plate|glass|champagne|dj|party|people celebrating/.test(description)) {
    score -= 12;
  }
  if (foodVenue
    && /food|yemek|dish|meal|plate|tabak|menu|menü|cocktail|drink|glass|meze|restaurant|dining/.test(description)) {
    score += 18;
  }
  if (/assets\/img|ikonlar|logo|\.svg/i.test(url)) score -= 100;
  return score;
}

/**
 * Pick one brand-owned venue/hero image to anchor the whole template set.
 * Prefer a strong venue hero; if none clears the ideal bar, still return the
 * best usable gallery photo so generation never falls through to Ideogram-only.
 */
export function resolveDefaultTemplateHeroPhoto(input: DesignTemplateEngineInput): { url: string; score: number } | null {
  let best: { url: string; score: number } | null = null;
  for (const url of input.galleryPhotoUrls) {
    if (!isUsableGalleryPhotoUrl(url)) continue;
    const meta = input.galleryAnalysis[normalizeGalleryUrl(url)] ?? input.galleryAnalysis[url];
    const score = scoreDefaultHeroPhoto(url, meta, input.sector);
    if (!best || score > best.score) best = { url, score };
  }
  if (!best) return null;
  // Ideal bar for a dedicated "hero" lock — keep when available.
  if (best.score > 40) return best;
  // Soft fallback: any non-logo brand photo beats fal-without-venue.
  if (best.score > -80) return best;
  return null;
}

/** Last-resort: any unused usable gallery URL (never leave a venue template photo-less). */
function pickAnyUnusedGalleryPhoto(
  input: DesignTemplateEngineInput,
  usedUrls: Set<string>,
): { url: string; score: number } | null {
  for (const url of input.galleryPhotoUrls) {
    if (!isUsableGalleryPhotoUrl(url)) continue;
    const n = normalizeGalleryUrl(url);
    if (usedUrls.has(n) || usedUrls.has(url)) continue;
    return { url, score: 1 };
  }
  // If every photo was already used in this set, reuse the first usable one.
  const first = input.galleryPhotoUrls.find((url) => isUsableGalleryPhotoUrl(url));
  return first ? { url: first, score: 1 } : null;
}

/**
 * Pick the most representative gallery photo for a preset.
 *
 * Prefers photos whose vision-tagged `suggestedAssetType` matches the preset's
 * preferred types; falls back to the full pool. Uses the gallery matcher for
 * semantic scoring and excludes already-used photos so the template set covers
 * varied imagery. Always returns a gallery URL when the brand has photos —
 * venue sectors must never generate Ideogram-only templates.
 */
export function pickPhotoForPreset(
  preset: DesignTemplatePreset,
  input: DesignTemplateEngineInput,
  usedUrls: Set<string>,
): { url: string; score: number } | null {
  const exclude = Array.from(usedUrls);

  // First pass: restrict to preferred asset types when we have tagged photos.
  // Shared alias-aware filter — same as production pickGalleryPhotoForSlot.
  const preferredPool = filterGalleryUrlsByPreferredAssetTypes(
    input.galleryPhotoUrls,
    input.galleryAnalysis,
    preset.preferredAssetTypes,
  );

  const tryPools = preferredPool.length > 0
    ? [preferredPool, input.galleryPhotoUrls]
    : [input.galleryPhotoUrls];

  // Same catalog-aware match fields as mission pickGalleryPhotoForSlot / Idea.
  const catalogAware = buildCatalogAwareGalleryMatchFields({
    caption: '',
    headline: preset.sampleHeadline || preset.name,
    catalogSlotKey: preset.catalogSlotKey ?? preset.templateType,
    sectorId: input.sector,
    forceBlend: true,
    seedHeadlineFromCatalog: true,
  });
  const matchInput = {
    caption: catalogAware.caption
      || `${preset.sampleHeadline} ${preset.matchKeywords}`.trim(),
    headline: catalogAware.headline || preset.sampleHeadline || preset.name,
    businessType: input.sector,
    templateUseCase: catalogAware.templateUseCase || preset.templateType,
    preferredAssetTypes: catalogAware.preferredAssetTypes?.length
      ? catalogAware.preferredAssetTypes
      : preset.preferredAssetTypes,
  };

  for (const pool of tryPools) {
    const match = matchPhotoToContent(
      matchInput,
      pool,
      input.galleryAnalysis,
      { excludeUrls: exclude, bestEffort: true },
    );
    if (match) return { url: match.url, score: match.score };
  }

  return pickAnyUnusedGalleryPhoto(input, usedUrls);
}

/** Resolve the headline/subtitle/sceneHint for a preset, special-day aware. */
function resolveCopy(
  preset: DesignTemplatePreset,
  input: DesignTemplateEngineInput,
  special?: EngineSpecialDay,
): {
  headline: string;
  subtitle?: string;
  sceneHint: string;
  occasion?: { name: string; mood?: string };
} {
  const showSub = input.forceShowSubline;

  if (special) {
    // Keep the brand template + palette intact; the day's spirit is passed as an
    // `occasion` cue so the art-director prompt harmonises it into the brand world
    // instead of clashing holiday-cliché colors baked into the scene hint.
    const specialHeadline = fitSlotPunchline(special.name, 3, 28) || special.name;
    const specialSub = showSub === false
      ? undefined
      : fitSlotPunchline(input.brandName, 2, 20) || undefined;
    return {
      headline: specialHeadline,
      subtitle: specialSub,
      sceneHint: preset.matchKeywords,
      occasion: { name: special.name, mood: special.themeHint },
    };
  }

  const slotCopy = resolveSlotSampleCopy({
    catalogSlotKey: preset.catalogSlotKey,
    templateType: preset.templateType,
    format: preset.format,
    slotLabel: preset.name,
    showSubline: showSub,
    sector: input.sector,
  });
  // Prefer slot-key / label punchline; fall back to tightened preset sample.
  const headline = slotCopy.headline
    || fitSlotPunchline(preset.sampleHeadline, 3, 28)
    || preset.sampleHeadline
    || input.brandName;
  let subtitle = slotCopy.subtitle;
  if (showSub === false) {
    subtitle = undefined;
  } else if (showSub !== true && !subtitle && preset.sampleSubtitle?.trim()) {
    subtitle = fitSlotPunchline(preset.sampleSubtitle, 3, 24) || undefined;
  }

  return {
    headline,
    subtitle,
    sceneHint: preset.matchKeywords,
  };
}

function compactList(values: unknown, limit = 5): string[] {
  const arr = Array.isArray(values)
    ? values
    : typeof values === 'string'
      ? values.split(/[,\n]/)
      : [];
  return arr
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .slice(0, limit);
}

function compactObjectSummary(value: Record<string, unknown> | null | undefined, max = 360): string {
  if (!value || typeof value !== 'object') return '';
  const entries = Object.entries(value)
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .slice(0, 10);
  if (!entries.length) return '';
  return entries
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? compactList(v, 4).join(', ') : String(v).slice(0, 80)}`)
    .join(' | ')
    .slice(0, max);
}

export function buildBrandIntelligenceDirectives(
  input: DesignTemplateEngineInput,
  channel: FalDesignChannel,
  level: FalDesignIntensityLevel,
): string[] {
  const intel = input.brandIntelligence;
  if (!intel) return [];

  const pillars = compactList(intel.contentPillars, 5);
  const ctas = compactList(intel.defaultCtas, 4);
  const vibe = compactObjectSummary(intel.vibeProfile, 420);
  const service = compactObjectSummary(intel.serviceProfile, 360);
  // Uniqueness + visual DNA first — fal-designer extracts these into BRAND SOUL LOCK.
  const lines = [
    `BRAND DESIGN CONTRACT: This template set is for ${input.brandName}, sector=${input.sector}${input.location ? `, location=${input.location}` : ''}. Every layout, type choice, color block, crop, and decorative rhythm must come from THIS brand's visual identity, not from generic ${input.sector} presets.`,
    `BRAND UNIQUENESS: A stranger should recognize this as ${input.brandName} from color (${input.brandColors.primary}/${input.brandColors.accent}), venue photo, and type energy — never a stock ${input.sector} Canva pack that could belong to any competitor.`,
    intel.visualDna ? `VISUAL DNA — PRIMARY DESIGN SOURCE: ${intel.visualDna.slice(0, 620)}. Treat this as the highest creative reference after the requested on-canvas text. If sector defaults conflict with visual DNA, visual DNA wins.` : '',
    intel.brandTone ? `Brand tone: ${intel.brandTone.slice(0, 160)}.` : '',
    intel.visualStyle ? `Visual style: ${intel.visualStyle.slice(0, 180)}.` : '',
    intel.description ? `Brand description: ${intel.description.slice(0, 220)}.` : '',
    intel.targetAudience ? `Target audience: ${intel.targetAudience.slice(0, 160)}.` : '',
    pillars.length ? `Content pillars to reflect: ${pillars.join(' | ')}.` : '',
    ctas.length ? `Native CTA language: ${ctas.join(' | ')}.` : '',
    vibe ? `Vibe profile signals: ${vibe.slice(0, 280)}.` : '',
    service ? `Service/venue profile signals: ${service.slice(0, 220)}.` : '',
    `Template channel/intensity: ${channel} uses ${level}. Build a DISTINCT LAYOUT RECIPE for THIS slot role — vary composition across the library while keeping brand DNA, palette, and typography vibe consistent. Never generic identical Canva header strips across every template.`,
  ].filter(Boolean);

  return [
    lines.join(' '),
    'TEMPLATE RULE: Build reusable brand recipes, not one-off copy cards. The generated preview may use sample copy, but the layout system must be reusable for future mission headlines, captions, events, and offers. Keep text exact and legible; never invent or misspell Turkish words.',
  ];
}

/**
 * Why this template slot exists — drives distinct design jobs across the library
 * (event poster ≠ menu card ≠ social-proof quote).
 */
export function resolveTemplatePurposeBrief(input: {
  slotName: string;
  slotKey?: string | null;
  templateType?: string | null;
  falUseCase?: string | null;
  channel?: string | null;
}): { jobLabel: string; designJob: string; rejectLook: string } {
  const key = `${input.slotKey ?? ''} ${input.templateType ?? ''} ${input.falUseCase ?? ''} ${input.slotName}`
    .toLowerCase();
  const type = String(input.templateType ?? '').toLowerCase();
  const useCase = String(input.falUseCase ?? '').toLowerCase();
  const jobLabel = input.slotName.trim() || type || 'brand social template';

  if (
    /event_announcement|event_special|event_teaser|event_ticket|etkinlik|dj|lineup|konser/.test(key)
    || useCase === 'event_announcement'
    || type === 'event_special'
  ) {
    return {
      jobLabel,
      designJob:
        'EVENT ANNOUNCEMENT POSTER: date/time hierarchy, event name energy, RSVP/come-tonight pull — masthead + photo window. Reads as a night/event flyer the brand would post, not a menu card or quiet ambiance story.',
      rejectLook: 'daily venue ambiance-only, plated-food menu card, generic quote banner',
    };
  }
  if (/social_proof|yorum|testimonial|review|misafir/.test(key) || type === 'social_proof') {
    return {
      jobLabel,
      designJob:
        'SOCIAL PROOF CARD: guest-voice punchline hierarchy, trust/warmth, short attribution energy — not a promo price stack or event ticket.',
      rejectLook: 'event ticket stub, campaign price badge, formal corporate memo',
    };
  }
  // Food / chef / dish jobs before campaign_announcement type catch-all
  // (many restaurant slots are typed campaign_* but must read as menu heroes).
  if (
    /chef|şef|sef|signature|imza|menu|product|tabak|food|dish|kokteyl|cocktail|brunch|kahvalt|plating|farm.?to.?table|mevsim/.test(key)
    || type === 'menu_highlight'
    || useCase === 'product_highlight'
  ) {
    return {
      jobLabel,
      designJob:
        'PRODUCT / MENU HERO: hero dish/drink photo window + short product punchline — appetite-led, warm hospitality craft, not event date masthead or price-stack flyer.',
      rejectLook: 'event ticket date block, review quote layout, promo price badge spam, full-frame venue only',
    };
  }
  if (
    /campaign|offer|promo|kampanya|seasonal|sezon|happy.?hour|rezerv|book/.test(key)
    || type === 'campaign_announcement'
    || type === 'seasonal_promo'
    || useCase === 'campaign_offer'
  ) {
    return {
      jobLabel,
      designJob:
        'CAMPAIGN / OFFER POSTER: clear offer hierarchy, brand-true invite craft — boutique hospitality, never carnival sticker spam or generic "Özel Kampanya" flyer.',
      rejectLook: 'quiet daily story, guest-review quote card, formal hours notice',
    };
  }
  if (/venue|mekan|ambiance|atmosphere|havadan|aerial|showcase/.test(key) || type === 'venue_showcase') {
    return {
      jobLabel,
      designJob:
        'VENUE SHOWCASE: atmosphere-first photo window + brand-hex craft lockup (not cream paper) — invite to the place, not a priced promo or event lineup.',
      rejectLook: 'ticket stub, price stack, dense flyer text, cream/beige Canva corner sticker',
    };
  }
  if (/announcement_formal|duyuru|formal|hours|saat/.test(key) || type === 'announcement_formal') {
    return {
      jobLabel,
      designJob:
        'FORMAL ANNOUNCEMENT: clear informational hierarchy, calm institutional craft — readable notice, not nightlife flyer energy.',
      rejectLook: 'neon club flyer, emoji promo, crowded event lineup',
    };
  }
  if (/reel|kapak/.test(key) || type === 'reel_cover') {
    return {
      jobLabel,
      designJob:
        'REEL COVER FREEZE: motion-ready single punchline, thumb-stopping vertical craft — stable type for I2V, not a multi-line event programme.',
      rejectLook: 'dense story programme, multi-block campaign flyer',
    };
  }
  if (/daily|günaydın|story/.test(key) || type === 'daily_story' || useCase === 'daily_story') {
    return {
      jobLabel,
      designJob:
        'DAILY STORY BEAT: light day-part energy, soft brand lockup, photo-led — casual check-in, not a campaign poster.',
      rejectLook: 'heavy promo stack, event ticket masthead, formal memo',
    };
  }
  if (/brand_identity|kimlik/.test(key) || type === 'brand_identity') {
    return {
      jobLabel,
      designJob:
        'BRAND IDENTITY LOCKUP: mark/palette/type as the hero craft — identity system sample, not a one-off promo.',
      rejectLook: 'busy event flyer, review quote card',
    };
  }
  return {
    jobLabel,
    designJob:
      `PURPOSE-BUILT ${String(input.channel ?? 'social').toUpperCase()} TEMPLATE: composition must serve "${jobLabel}" specifically — a stranger should guess the slot job from layout alone.`,
    rejectLook: 'generic identical Canva sandwich reused across unrelated slots',
  };
}

/**
 * Per-slot creative brief for template library — gives the image model a concrete
 * brand-specific design idea (not just sector defaults + intensity).
 */
export function buildBrandSlotDesignRecipe(input: {
  brandName: string;
  sector: string;
  location?: string;
  primary: string;
  accent: string;
  slotKey: string;
  slotName: string;
  channel: FalDesignChannel;
  level: FalDesignIntensityLevel;
  layoutFamily: DesignCraftLayoutFamily | null;
  visualDna?: string;
  brandTone?: string;
  vibeProfileSummary?: string;
  sampleHeadline?: string;
  /** Catalog design_template_type — drives PURPOSE diversity. */
  templateType?: string | null;
  /** Fal/Canva use-case id (e.g. event_announcement). */
  falUseCase?: string | null;
  /** Brand×slot structured creative brief (design craft intent). */
  creativeBrief?: SlotCreativeCustomization | null;
}): string {
  const place = input.location?.trim() || input.sector.replace(/_/g, ' ');
  const dnaCue = input.visualDna?.trim()
    ? input.visualDna.trim().slice(0, 280)
    : `${input.brandName} authentic ${place} atmosphere`;
  const toneCue = input.brandTone?.trim()?.slice(0, 80)
    || input.vibeProfileSummary?.slice(0, 80)
    || 'on-brand, intentional, boutique';
  const familyLine = input.layoutFamily
    ? `Layout accent (bold pack only): "${input.layoutFamily}" — ${describeDesignCraftLayoutFamily(input.layoutFamily)}`
    : `Layout: invent a composition that could ONLY be ${input.brandName}'s ${input.slotName} — type-led editorial with brand accents; do NOT default to rail/L/diagonal geometry kits.`;
  const purpose = resolveTemplatePurposeBrief({
    slotName: input.slotName,
    slotKey: input.slotKey,
    templateType: input.templateType,
    falUseCase: input.falUseCase,
    channel: input.channel,
  });
  const creativeBlock = formatSlotCreativeBriefPromptBlock(input.creativeBrief);
  // Brand + DNA first; sample punchline is the type-zone footprint, not the creative thesis.
  const idea = [
    `Design idea: a reusable ${input.channel} recipe that could ONLY belong to ${input.brandName} for slot ${input.slotName} — ${toneCue}.`,
    input.sampleHeadline?.trim()
      ? `Short punchline for type zone: "${input.sampleHeadline.trim().slice(0, 48)}".`
      : '',
  ].filter(Boolean).join(' ');

  return [
    `═══ BRAND SLOT DESIGN RECIPE ═══`,
    `Slot: ${input.slotName} (${input.slotKey}) · ${input.channel} · intensity ${input.level}.`,
    creativeBlock,
    `═══ TEMPLATE PURPOSE ═══`,
    `Job: "${purpose.jobLabel}" — this canvas exists for that job; layout/type energy must read as that purpose at a glance.`,
    input.templateType || input.falUseCase
      ? `Type/use-case: ${[input.templateType, input.falUseCase].filter(Boolean).join(' · ')}.`
      : '',
    purpose.designJob,
    `Diversity lock: invent a DISTINCT composition for THIS purpose vs other slots in the same library — never clone one layout across unrelated jobs. Reject look for this slot: ${purpose.rejectLook}.`,
    idea,
    `Motifs from brand world: ${dnaCue}.`,
    `Color craft: painted fields/plates/rails = ${input.primary} and/or ${input.accent} (solid or 60–85% tint) — never cream/beige/off-white Canva paper panels with brand-colored letters only; type may be white/ink for contrast.`,
    familyLine,
    'Reject: competitor-generic sector flyer, identical library clones, painted rail/L kits reused across brands.',
  ].filter(Boolean).join(' ');
}

async function generateOne(
  preset: DesignTemplatePreset,
  input: DesignTemplateEngineInput,
  usedUrls: Set<string>,
  special?: EngineSpecialDay,
  defaultHeroPhoto?: { url: string; score: number } | null,
): Promise<GeneratedDesignTemplate> {
  const { headline, subtitle, sceneHint, occasion } = resolveCopy(preset, input, special);
  const theme = applyFalProductionOverridesToTheme(
    input.brandTheme ?? null,
    input.productionOverrides,
  );
  const typographyConfig = readTypographyDesignConfig(theme);
  const intensityChannel: FalDesignChannel = preset.format === 'reel_cover'
    ? 'reel'
    : preset.format === 'story'
      ? 'story'
      : 'post';
  // Prefer per-slot matcher (diverse library). Default venue hero is fallback only —
  // locking every template to one aerial/terrace shot collapsed the whole set.
  // Per-slot regenerate seeds exclusions so the same cocktail glass isn't locked forever.
  for (const url of input.excludeGalleryUrls ?? []) {
    const n = normalizeGalleryUrl(url);
    if (n) usedUrls.add(n);
    if (url.trim()) usedUrls.add(url.trim());
  }
  const matchedPhoto = pickPhotoForPreset(preset, input, usedUrls);
  const heroFallback = defaultHeroPhoto
    && !usedUrls.has(normalizeGalleryUrl(defaultHeroPhoto.url))
    && !usedUrls.has(defaultHeroPhoto.url)
    ? defaultHeroPhoto
    : null;
  // pickPhotoForPreset already hard-falls back to any gallery URL; hero is a
  // secondary anchor when the matcher skipped (empty pool edge cases).
  const picked = matchedPhoto ?? heroFallback ?? pickAnyUnusedGalleryPhoto(input, usedUrls);
  if (picked?.url) usedUrls.add(normalizeGalleryUrl(picked.url));
  const briefFormat = preset.format === 'reel_cover'
    ? 'reel'
    : preset.format === 'story'
      ? 'story'
      : 'post';
  const layoutChannel: 'story' | 'post' = briefFormat === 'story' ? 'story' : 'post';
  const announcementType = DESIGN_TEMPLATE_TO_CALENDAR_ANNOUNCEMENT[preset.templateType]
    ?? preset.intent;
  const calendarLayout = resolveCalendarDesignLayout({
    announcementType,
    channel: layoutChannel,
    sector: input.sector,
  });
  const reelArchetypeForCover = preset.format === 'reel_cover'
    ? resolveReelArchetypeForProduction({
        canvaArchetypeId: calendarLayout.canvaArchetypeId,
        caption: subtitle ?? undefined,
        headline: headline || input.brandName,
        sector: input.sector,
        catalogSlotKey: preset.catalogSlotKey,
        templateType: preset.templateType,
      })
    : null;
  const preferredReelCoverCanva = reelArchetypeForCover
    ? preferCoverCanvaForReelArchetype(
        reelArchetypeForCover.id,
        calendarLayout.canvaArchetypeId,
      )
    : undefined;
  // Bias reel_cover library toward archetype-preferred Canva families (diversity).
  const explicitCoverCanva = preferredReelCoverCanva
    && getCanvaArchetype(preferredReelCoverCanva)
    ? preferredReelCoverCanva
    : calendarLayout.canvaArchetypeId;

  const falUseCase = resolveFalUseCaseForDesignTemplate(preset.templateType, preset.intent);
  const layoutBrief = resolveFalDesignBrief({
    caption: subtitle ?? headline ?? preset.name,
    headline: headline || input.brandName,
    templateUseCase: falUseCase,
    format: briefFormat,
    sceneHint,
    sector: input.sector,
    referencePhotoUrl: picked?.url,
    tenantPreferredArchetypes: readTenantPreferredCanvaArchetypes(theme),
    layoutFamilyHint: preset.catalogSlotKey ?? calendarLayout.canvaArchetypeId,
    explicitCanvaArchetypeId: explicitCoverCanva,
  });
  // Slot proposes energy; Brand Hub fal_* intensity is the only ceiling.
  // DNA/vibe layout language shapes craft allowlist + compose — not intensity.
  const layoutLanguage = resolveBrandLayoutLanguage({
    sector: input.sector,
    visualDna: input.brandIntelligence?.visualDna,
    brandTone: input.brandIntelligence?.brandTone,
    visualDnaTone: input.visualDnaTone,
    vibeProfile: input.brandIntelligence?.vibeProfile,
  });
  const slotIntensity = resolveCalendarFalDesignIntensity({
    announcementType,
    channel: intensityChannel,
    brandTheme: theme,
  });
  // Hub is a ceiling only (already applied in resolveCalendar). Never raise the
  // library to Hub bold_editorial — that forced painted plate/rail/L geometry over
  // the brand-specific designed recipes (e.g. Kokteyl Promo story → offer_campaign).
  // Soft DNA packs further cap below bold poster intensity directives.
  const productionIntensity = slotIntensity.level;
  const libraryIntensity = resolveTemplateLibraryEffectiveIntensity({
    productionIntensity,
    language: layoutLanguage,
  });
  const designIntensityLevel = clampDesignIntensityForArchetype(
    resolveTemplateLibraryDesignIntensity(libraryIntensity),
    layoutBrief.canvaArchetypeId,
  );
  const brandIntelligenceDirectives = buildBrandIntelligenceDirectives(
    input,
    intensityChannel,
    designIntensityLevel,
  );
  const vibe = isTypographyDesignConfirmed(theme) && typographyConfig?.vibe
    ? typographyConfig.vibe
    : resolveTypographyVibeFromContext({
      caption: occasion ? `${sceneHint} ${occasion.mood ?? ''}`.trim() : sceneHint,
      headline,
      sector: input.sector,
      brandVibe: typographyConfig?.vibe ?? null,
      visualDnaTone: input.visualDnaTone,
      lockPremiumVibe: Boolean(input.visualDnaTone?.trim()),
    });
  const layoutDirectives = [
    ...buildBrandLayoutLanguageDirectives(layoutLanguage),
    ...buildFalDesignBriefDirectives(layoutBrief, briefFormat),
    ...(reelArchetypeForCover
      ? buildReelCoverDiversityDirectives({
          reelArchetype: reelArchetypeForCover,
          coverCanvaId: layoutBrief.canvaArchetypeId,
        })
      : []),
  ];
  const backgroundStyle: TypographyBackgroundStyle = resolveFalTemplateBackgroundStyle({
    theme,
    referencePhotoUrl: picked?.url,
  });
  const productionSettings = resolveFalTemplateProductionSettings(theme);
  const includeLogoPref = input.forceIncludeLogo;
  const wantBrandMark = includeLogoPref === false
    ? false
    : includeLogoPref === true
      ? true
      : (
        shouldProminentLogoInFalTemplate(theme, preset.prominentLogo)
        || Boolean(input.logoUrl?.trim())
      );
  const brandMark = resolveBrandMarkMode({
    logoUrl: includeLogoPref === false ? undefined : input.logoUrl,
    brandName: input.brandName,
    logoTreatment: includeLogoPref === false ? 'none' : productionSettings.logo_treatment,
    wantBrandMark,
  });
  const prominentLogo = brandMark.mode === 'official_logo';
  const includeLogo = brandMark.mode === 'official_logo';
  const antiPatternDirective = (input.antiPatterns ?? []).length
    ? `Avoid: ${input.antiPatterns!.slice(0, 6).join('; ')}.`
    : undefined;

  const aspect = aspectForFormat(preset.format);
  // Keep prompt channel aligned with slot format — do not treat every 9:16 as reel
  // (that made story/post previews inherit vertical story-stack language).
  const buildPrompt = preset.format === 'reel_cover'
    ? buildDesignedVideoReelDesignCardPrompt
    : preset.format === 'story'
      ? buildDesignedStoryDesignCardPrompt
      : buildDesignedPostDesignCardPrompt;
  const gptDesignCardMode: 'post' | 'reel' = preset.format === 'post' ? 'post' : 'reel';

  const layoutFamilySeed = [
    preset.catalogSlotKey ?? preset.name,
    input.layoutFamilySalt?.trim() || '',
  ].filter(Boolean).join('::');
  const purpose = resolveTemplatePurposeBrief({
    slotName: preset.name,
    slotKey: preset.catalogSlotKey || layoutFamilySeed,
    templateType: preset.templateType,
    falUseCase,
    channel: intensityChannel,
  });

  let slotArtDirection: SlotArtDirection | null = null;
  if (input.enableSlotArtDirection !== false) {
    slotArtDirection = await fetchSlotTemplateArtDirection({
      workspaceId: input.workspaceId,
      brandName: input.brandName,
      sector: input.sector,
      location: input.location,
      brandTone: input.brandIntelligence?.brandTone,
      visualDna: input.brandIntelligence?.visualDna ?? input.visualDnaTone,
      description: input.brandIntelligence?.description,
      primaryColor: input.brandColors.primary,
      accentColor: input.brandColors.accent,
      catalogSlotKey: preset.catalogSlotKey || layoutFamilySeed,
      slotName: preset.name,
      format: preset.format,
      templateType: preset.templateType,
      purposeJob: purpose.designJob,
      sampleHeadline: headline || preset.sampleHeadline,
      diversitySalt: input.layoutFamilySalt?.trim() || '',
    });
  }
  const slotArtDirectionBlock = slotArtDirection
    ? formatSlotArtDirectionPromptBlock(slotArtDirection)
    : '';

  // Design-fit logo seat AFTER type-zone art direction: archetype/layout first,
  // then push logo off the same vertical band as the headline stack.
  const logoChannel = intensityChannel === 'story'
    ? 'story' as const
    : intensityChannel === 'reel'
      ? 'reel' as const
      : 'feed_post' as const;
  const logoPlacement: ResolvedFalLogoPlacement | null = includeLogo
    ? resolveFalLogoPlacement({
        agentLogoPosition: layoutBrief.logoPlacement?.position,
        agentLogoZone: layoutBrief.logoPlacement?.zoneHint,
        canvaArchetypeId: layoutBrief.canvaArchetypeId,
        layoutPattern: layoutBrief.layoutPattern,
        typographyMode: layoutBrief.typographyMode,
        typeZoneAnchor: slotArtDirection?.type_zone_anchor ?? null,
        channel: logoChannel,
      })
    : null;
  const logoPlacementDirective = logoPlacement
    ? formatFalLogoPlacementDirective(logoPlacement, logoChannel)
    : '';

  const needsCraftFamily = shouldApplyCraftLayoutFamily(designIntensityLevel, layoutLanguage);
  // CrewAI owns composition when present — do not hard-pin a craft family kit.
  const layoutFamily = needsCraftFamily && !slotArtDirectionBlock
    ? resolveDesignCraftLayoutFamily(
      layoutFamilySeed,
      resolveCraftAllowlistForPack(layoutLanguage),
    )
    : null;

  const catalogKey = preset.catalogSlotKey || layoutFamilySeed;
  const existingCreative = input.slotCreativeByKey?.[catalogKey]
    ?? (preset.catalogSlotKey ? input.slotCreativeByKey?.[preset.catalogSlotKey] : undefined);
  const { brief: slotCreativeBrief } = resolveSlotCreativeForLibraryGen({
    existing: existingCreative,
    forceReseed: input.forceReseedSlotCreative === true,
    seed: {
      brandName: input.brandName,
      location: input.location,
      visualDna: input.brandIntelligence?.visualDna ?? input.visualDnaTone,
      brandTone: input.brandIntelligence?.brandTone,
      slotName: preset.name,
      slotKey: catalogKey,
      templateType: preset.templateType,
      format: preset.format,
      falUseCase,
      seedSource: 'auto_template_gen',
    },
  });

  const slotDesignRecipe = buildBrandSlotDesignRecipe({
    brandName: input.brandName,
    sector: input.sector,
    location: input.location,
    primary: input.brandColors.primary,
    accent: input.brandColors.accent,
    slotKey: catalogKey,
    slotName: preset.name,
    channel: intensityChannel,
    level: designIntensityLevel,
    layoutFamily,
    visualDna: input.brandIntelligence?.visualDna ?? input.visualDnaTone,
    brandTone: input.brandIntelligence?.brandTone,
    vibeProfileSummary: compactObjectSummary(input.brandIntelligence?.vibeProfile, 120),
    sampleHeadline: headline || preset.sampleHeadline,
    templateType: preset.templateType,
    falUseCase,
    creativeBrief: slotCreativeBrief,
  });

  const copyFit = buildSlotCopyFitDirective({
    headline: headline || input.brandName,
    subtitle,
  });
  const themeTypography = (theme as { typography?: { headingFont?: string; bodyFont?: string; personality?: string } } | null)
    ?.typography;
  const vibeFontLock = [
    `FONT / VIBE LOCK: typography vibe "${vibe}" — high-design letterforms matching this brand energy.`,
    themeTypography?.headingFont
      ? `Heading inspiration: ${themeTypography.headingFont}.`
      : 'Heading inspiration: editorial display serif (Playfair / Didot class) for hospitality punchlines.',
    themeTypography?.bodyFont
      ? `Support inspiration: ${themeTypography.bodyFont}.`
      : 'Support: clean grotesk for micro subline/CTA only.',
    themeTypography?.personality
      ? `Type personality: ${themeTypography.personality}.`
      : '',
  ].filter(Boolean).join(' ');

  const templateBrandDirectives = [
    copyFit,
    vibeFontLock,
    ...brandIntelligenceDirectives,
    // slotArtDirectionBlock goes via prompt field slotArtDirectionBlock (protected head)
    slotDesignRecipe,
    brandMark.xorDirective,
    'LAYOUT TEMPLATE CONTRACT: reusable brand+slot recipe — intentional type hierarchy + brand accents + clear photo. NOT raw photo+floating caption, NOT Canva header/footer sandwich, NOT generic painted rail/L/diagonal geometry kits.',
    `SLOT: ${layoutFamilySeed}`,
    preset.format === 'post'
      ? 'FEED CANVAS LOCK: Exact Instagram feed 4:5 (1080×1350). Compose as a feed post — corner/side/lower-third typography. FORBIDDEN: 9:16 story proportions or tall upper story panels that make the post look like a cropped story.'
      : preset.format === 'story'
        ? 'STORY CANVAS LOCK: Exact Instagram Story 9:16 (1080×1920). Compose as a vertical story poster — full-height frame, safe-zone typography. FORBIDDEN: 4:5 feed crop language, square feed composition, or feed-post framing.'
        : preset.format === 'reel_cover'
          ? 'REEL CANVAS LOCK: Exact Instagram Reel 9:16 (1080×1920). Compose as a reel cover — full-height frame, motion-ready typography. FORBIDDEN: 4:5 feed crop language or square feed composition.'
          : '',
    'FORBIDDEN LAYOUT: generic 50/50 horizontal screen-split with flat color block on top and photo strip below — unless the Canva archetype explicitly requires a diagonal or editorial asymmetry.',
    brandMark.mode === 'official_logo'
      ? [
          'FORBIDDEN LOGO PAINT: never paint, type, or illustrate the brand mark — official logo is composited post-generation in the reserved quiet zone. Do not also type the brand name.',
          logoPlacementDirective
            ? `LOGO CLEARANCE (design-fit): ${logoPlacementDirective} Keep that corner calm — no type, icons, busy texture, or painted placeholder.`
            : 'LOGO CLEARANCE: keep one quiet craft/margin corner calm for the official mark, background continuing as-is — never over the headline/subline block, and paint no plate there.',
        ].filter(Boolean).join(' ')
      : brandMark.mode === 'text_wordmark'
        ? `BRAND WORDMARK: type "${input.brandName}" once as a small corner mark — do not invent a logo icon.`
        : 'FORBIDDEN BRAND MARK: no logo and no typed brand name on this canvas.',
    'FORBIDDEN TEXT: misspelled Turkish diacritics, invented subtitle words, or ASCII-only approximations of contracted copy.',
    picked?.url
      ? 'DEFAULT VENUE/HERO PHOTO LOCK: Use the provided reference image as the immutable brand venue anchor for this template. Preserve the actual place, coastline, furniture, colors, and atmosphere. Do not invent a synthetic beach, sand dune, generic sea, fake architecture, or alternate venue.'
      : '',
    ...layoutDirectives,
    ...(antiPatternDirective ? [antiPatternDirective] : []),
  ].filter(Boolean);

  const prompt = normalizeLibraryPromptForFormat(
    buildPrompt({
      vibe,
      headline: headline || input.brandName,
      subtitle,
      sceneHint,
      brandColors: input.brandColors,
      brandName: input.brandName,
      sector: input.sector,
      aspectRatio: aspect,
      visualDnaTone: input.visualDnaTone,
      designIntensityLevel,
      layoutFamilySeed,
      layoutFamily,
      slotArtDirectionBlock: slotArtDirectionBlock || undefined,
      occasion,
      headingFont: themeTypography?.headingFont,
      bodyFont: themeTypography?.bodyFont,
      brandDirectives: templateBrandDirectives,
      // Only pass logo into the image pipeline when XOR mode is official_logo —
      // otherwise generators may both composite logo and type the name.
      logoUrl: brandMark.logoUrl,
    }),
    preset.format === 'reel_cover' ? 'reel' : preset.format,
  );

  let thumbnailUrl: string | null = null;
  let generator: 'gpt-image-1' | 'gpt-image-2' | 'fal-ideogram' | 'none' = 'none';
  const gptImageModel = serverConfig.imageGen.model.startsWith('gpt-image-2')
    ? 'gpt-image-2' as const
    : 'gpt-image-1' as const;

  // Agency template quality: GPT-image grounded on the gallery photo first.
  // Fal/Ideogram is last-resort only — templatePreviewMode previously let Ideogram
  // win after a soft grafiker miss and looked like "production flipped to fal".
  if (picked) {
    try {
      const generated = await generateDesignedPostImage({
        workspaceId: input.workspaceId,
        designCardPrompt: prompt,
        designCardMode: gptDesignCardMode,
        headline: headline || input.brandName,
        caption: subtitle ?? headline ?? preset.name,
        referenceImageUrls: [picked.url],
        brandName: input.brandName,
        format: imageFormatForFormat(preset.format),
        location: input.location,
        businessType: input.sector,
        logoUrl: brandMark.logoUrl,
        logoPlacement: logoPlacement ?? undefined,
        overlayColor: input.brandColors.primary,
        backgroundIntent: sceneHint,
      });
      if (generated) {
        generator = gptImageModel;
        const aspectLocked = await lockTemplatePreviewAspect(generated, preset.format);
        thumbnailUrl = await mirrorPreview(aspectLocked, input.workspaceId) ?? aspectLocked;
      }
    } catch (err) {
      console.warn(
        `[design-template-engine] gpt preview failed for ${preset.templateType}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (!thumbnailUrl && serverConfig.fal.configured) {
    try {
      const falSceneHint = [
        sceneHint,
        occasion ? `occasion=${occasion.name}${occasion.mood ? ` (${occasion.mood})` : ''}` : '',
        `slot_job=${preset.name}`,
      ].filter(Boolean).join('; ');
      const still = await produceFalDesignedPostStill({
        workspaceId: input.workspaceId,
        headline: headline || input.brandName,
        subtitle,
        caption: subtitle ?? headline ?? preset.name,
        brandName: input.brandName,
        brandColors: input.brandColors,
        vibe,
        backgroundStyle: resolveIdeogramBackgroundStyle(
          backgroundStyle,
          picked?.url,
        ),
        aspectRatio: aspect,
        referencePhotoUrl: picked?.url,
        brandReferenceImageUrls: picked?.url ? [picked.url] : undefined,
        sceneHint: falSceneHint,
        visualDnaTone: input.visualDnaTone,
        designIntensityLevel,
        logoUrl: brandMark.logoUrl,
        logoPlacement: logoPlacement ?? layoutBrief.logoPlacement ?? undefined,
        location: input.location,
        sector: input.sector,
        captionAwareHeadline: false,
        // Prefer GPT grounded when photo exists; if that fails, still allow
        // purpose-built Ideogram so library slots are not empty grain posters.
        requireGroundedGallery: false,
        libraryQualityFalFallback: true,
        grafikerMaxRetries: 1,
        templatePreviewMode: false,
        brandDirectives: pickFalLibraryFallbackDirectives(templateBrandDirectives),
        slotArtDirectionBlock: slotArtDirectionBlock || undefined,
        occasion,
      });
      if (still.imageUrl) {
        generator = still.typographyModel.includes('gpt-image')
          ? (still.typographyModel.includes('gpt-image-2') ? 'gpt-image-2' : gptImageModel)
          : 'fal-ideogram';
        const aspectLocked = await lockTemplatePreviewAspect(still.imageUrl, preset.format);
        thumbnailUrl = (await mirrorPreview(aspectLocked, input.workspaceId)) ?? aspectLocked;
      }
    } catch (err) {
      console.warn(
        `[design-template-engine] fal fallback failed for ${preset.templateType}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (!thumbnailUrl && !picked) {
    console.warn(
      `[design-template-engine] no gallery photo for ${preset.templateType} — recipe only`,
    );
  }

  return {
    template_type: preset.templateType,
    template_name: special ? special.name : preset.name,
    format: preset.format,
    thumbnail_url: thumbnailUrl,
    sector_category: input.sector || null,
    locale: input.locale ?? 'tr',
    catalog_slot_key: preset.catalogSlotKey ?? null,
    design_spec: {
      prompt,
      vibe,
      brandColors: input.brandColors,
      sampleHeadline: headline,
      sampleSubtitle: subtitle,
      // Explicit Brand Hub toggle wins; else headline-only when sample has no subtitle.
      showSubline: input.forceShowSubline === false
        ? false
        : input.forceShowSubline === true
          ? true
          : showSublineFromSampleCopy(subtitle),
      includeLogo,
      logoPlacement,
      type_budget: (() => {
        const preserved = input.preserveOperatorTypeBudget;
        if (preserved?.source === 'operator') return preserved;
        const resolvedShowSubline = input.forceShowSubline === false
          ? false
          : input.forceShowSubline === true
            ? true
            : showSublineFromSampleCopy(subtitle);
        return seedGeneratedTypeBudget({
          sampleHeadline: headline,
          sampleSubtitle: subtitle,
          showSubline: resolvedShowSubline,
        });
      })(),
      galleryRef: picked?.url ?? null,
      galleryMatchScore: picked?.score ?? null,
      defaultHeroPhotoLock: Boolean(defaultHeroPhoto),
      intent: preset.intent,
      prominentLogo,
      logoUrl: brandMark.logoUrl,
      brandMarkMode: brandMark.mode,
      designIntensityLevel,
      productionIntensityLevel: productionIntensity,
      catalogSlotKey: preset.catalogSlotKey ?? null,
      canvaArchetypeId: layoutBrief.canvaArchetypeId ?? null,
      canvaArchetypeName: layoutBrief.canvaArchetypeName ?? null,
      layoutPattern: layoutBrief.layoutPattern,
      typographyMode: layoutBrief.typographyMode,
      slot_art_direction: slotArtDirection,
      slot_creative_brief: slotCreativeBrief,
      designBriefDirectives: layoutDirectives,
      ...(preset.format === 'reel_cover'
        ? {
            reel_recipe: reelRecipeToJson(
              seedReelRecipeForTemplate({
                catalogSlotKey: preset.catalogSlotKey,
                templateType: preset.templateType,
                canvaArchetypeId: layoutBrief.canvaArchetypeId,
                sector: input.sector,
                headline,
                caption: subtitle,
                brandReelParams: resolveBrandReelProductionParams(
                  parseMotionProfileFromTheme(theme, { sector: input.sector }),
                  input.sector,
                ),
              }),
            ),
          }
        : {}),
      ...(special
        ? { specialDay: { name: special.name, mmdd: special.mmdd, category: special.category } }
        : {}),
      generatedAt: new Date().toISOString(),
      generator,
    },
  };
}

async function lockTemplatePreviewAspect(
  url: string,
  format: DesignTemplateFormat,
): Promise<string> {
  const target = resolveTargetCanvasForFormat(format);
  const locked = await lockImageToCanvas(url, target);
  if (!locked.locked) {
    console.warn(
      `[design-template-engine] canvas lock skipped for ${format} → ${target.label} — source may remain GPT 2:3`,
    );
  } else {
    console.log(
      `[design-template-engine] canvas locked to ${target.label} (${target.width}x${target.height}) format=${format}`,
    );
  }
  return locked.url;
}

async function mirrorPreview(url: string, workspaceId: string): Promise<string | null> {
  if (!isR2Configured()) return null;
  try {
    const ext = url.startsWith('data:image/png') || url.toLowerCase().endsWith('.png')
      ? 'png'
      : 'jpg';
    const key = generateStorageKey(`${workspaceId}/design-templates`, 'image', ext);
    const result = await uploadImageFromUrl(url, key);
    return result?.url ?? null;
  } catch {
    return null;
  }
}

/**
 * Build generation jobs. Legacy `event_special` presets (no catalog slot) expand
 * into one template per upcoming country special day. Catalog-bound venue event
 * slots (e.g. dj_night_teaser) stay a single job — they are not national holidays.
 */
export function buildDesignTemplateGenerationJobs(
  presets: DesignTemplatePreset[],
  specialDays: EngineSpecialDay[] = [],
  maxSpecialDays = 4,
): Array<{ preset: DesignTemplatePreset; special?: EngineSpecialDay }> {
  const days = specialDays.slice(0, maxSpecialDays);
  const jobs: Array<{ preset: DesignTemplatePreset; special?: EngineSpecialDay }> = [];
  for (const preset of presets) {
    const expandForSpecialDays = preset.templateType === 'event_special'
      && days.length > 0
      && !preset.catalogSlotKey;
    if (expandForSpecialDays) {
      for (const sd of days) jobs.push({ preset, special: sd });
    } else {
      jobs.push({ preset });
    }
  }
  return jobs;
}

/**
 * Generate the brand's design-template set. Runs presets with bounded
 * concurrency and never throws on individual failures — partial sets are valid.
 */
export async function generateBrandDesignTemplates(
  input: DesignTemplateEngineInput,
): Promise<DesignTemplateEngineResult> {
  const basePresets = input.presets?.length
    ? input.presets
    : resolveDesignTemplatePresets(input.sector);
  const selected = typeof input.limit === 'number'
    ? basePresets.slice(0, input.limit)
    : basePresets;
  const concurrency = Math.max(1, input.concurrency ?? 3);
  const usedUrls = new Set<string>();
  const templates: GeneratedDesignTemplate[] = [];
  const defaultHeroPhoto = resolveDefaultTemplateHeroPhoto(input);

  const jobs = buildDesignTemplateGenerationJobs(
    selected,
    input.specialDays ?? [],
    input.maxSpecialDays ?? 4,
  );

  // Process in bounded-concurrency batches. usedUrls is mutated across batches
  // so photo dedup holds; within a batch picks may overlap (acceptable).
  for (let i = 0; i < jobs.length; i += concurrency) {
    const batch = jobs.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((job) => generateOne(job.preset, input, usedUrls, job.special, defaultHeroPhoto)),
    );
    templates.push(...results);
  }

  const generated = templates.filter((t) => t.thumbnail_url).length;
  return {
    templates,
    generated,
    failed: templates.length - generated,
  };
}

/** Generate one catalog/onboarding preset — used for per-slot Fal preview & compare. */
export async function generateSingleDesignTemplatePreset(
  input: DesignTemplateEngineInput,
  preset: DesignTemplatePreset,
  options?: {
    productionOverrides?: Partial<BrandFalTemplateProductionConfig>;
    excludeGalleryUrls?: string[];
    layoutFamilySalt?: string;
    forceShowSubline?: boolean | null;
    forceIncludeLogo?: boolean | null;
    preserveOperatorTypeBudget?: TemplateTypeBudget | null;
    enableSlotArtDirection?: boolean;
  },
): Promise<GeneratedDesignTemplate> {
  const engineInput = {
    ...input,
    productionOverrides: options?.productionOverrides ?? input.productionOverrides,
    excludeGalleryUrls: options?.excludeGalleryUrls ?? input.excludeGalleryUrls,
    layoutFamilySalt: options?.layoutFamilySalt ?? input.layoutFamilySalt,
    forceShowSubline: options?.forceShowSubline ?? input.forceShowSubline,
    forceIncludeLogo: options?.forceIncludeLogo ?? input.forceIncludeLogo,
    preserveOperatorTypeBudget:
      options?.preserveOperatorTypeBudget ?? input.preserveOperatorTypeBudget,
    enableSlotArtDirection: options?.enableSlotArtDirection ?? input.enableSlotArtDirection,
  };
  return generateOne(
    preset,
    engineInput,
    new Set<string>(),
    undefined,
    resolveDefaultTemplateHeroPhoto(engineInput),
  );
}
