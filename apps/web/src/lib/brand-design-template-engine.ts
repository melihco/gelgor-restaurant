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
  shouldApplyCraftLayoutFamily,
} from '@/lib/brand-layout-language';
import { resolveBrandMarkMode } from '@/lib/brand-mark-mode';
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
import { normalizeGalleryUrl } from '@/lib/gallery-usage-tracker';
import { generateDesignedPostImage } from '@/app/api/auto-produce/handlers/image-generators';
import { generateStorageKey, isR2Configured, uploadImageFromUrl } from '@/lib/r2-storage';
import { serverConfig } from '@/lib/server-config';
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
   * even when catalog slot key stays the same.
   */
  layoutFamilySalt?: string;
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
    generator: 'gpt-image-1' | 'fal-ideogram' | 'none';
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

function scoreDefaultHeroPhoto(url: string, meta: GalleryPhotoMeta | undefined): number {
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

  let score = Number.isFinite(quality) ? Math.min(quality, 100) / 5 : 0;
  for (const [rx, value] of HERO_ASSET_TYPE_SCORES) {
    if (rx.test(assetType)) score += value;
  }
  if (/water|sea|beach|shore|venue|terrace|table|entrance|harbor|sunset|view|mekan|sahil|deniz|pool|infinity|aerial|drone|panoram/.test(description)) {
    score += 20;
  }
  if (/paddle|surfboard|sup board|kayak|single board|product only|haute boards|brand on product/.test(description)) {
    score -= 35;
  }
  if (/cocktail|drink|food|burger|fries|salad|taco|plate|glass|champagne|dj|party|people celebrating/.test(description)) {
    score -= 12;
  }
  if (/assets\/img|ikonlar|logo|\.svg/i.test(url)) score -= 100;
  return score;
}

/** Pick one brand-owned venue/hero image to anchor the whole template set. */
export function resolveDefaultTemplateHeroPhoto(input: DesignTemplateEngineInput): { url: string; score: number } | null {
  let best: { url: string; score: number } | null = null;
  for (const url of input.galleryPhotoUrls) {
    const meta = input.galleryAnalysis[normalizeGalleryUrl(url)] ?? input.galleryAnalysis[url];
    const score = scoreDefaultHeroPhoto(url, meta);
    if (!best || score > best.score) best = { url, score };
  }
  return best && best.score > 40 ? best : null;
}

/**
 * Pick the most representative gallery photo for a preset.
 *
 * Prefers photos whose vision-tagged `suggestedAssetType` matches the preset's
 * preferred types; falls back to the full pool. Uses the gallery matcher for
 * semantic scoring and excludes already-used photos so the template set covers
 * varied imagery.
 */
function pickPhotoForPreset(
  preset: DesignTemplatePreset,
  input: DesignTemplateEngineInput,
  usedUrls: Set<string>,
): { url: string; score: number } | null {
  const exclude = Array.from(usedUrls);

  // First pass: restrict to preferred asset types when we have tagged photos.
  const preferredPool = input.galleryPhotoUrls.filter((url) => {
    const meta = input.galleryAnalysis[normalizeGalleryUrl(url)]
      ?? input.galleryAnalysis[url];
    const assetType = meta?.suggestedAssetType ?? '';
    return preset.preferredAssetTypes.includes(assetType);
  });

  const tryPools = preferredPool.length > 0
    ? [preferredPool, input.galleryPhotoUrls]
    : [input.galleryPhotoUrls];

  for (const pool of tryPools) {
    const match = matchPhotoToContent(
      {
        caption: `${preset.sampleHeadline} ${preset.matchKeywords}`.trim(),
        headline: preset.sampleHeadline || preset.name,
        businessType: input.sector,
      },
      pool,
      input.galleryAnalysis,
      { excludeUrls: exclude, bestEffort: true },
    );
    if (match) return { url: match.url, score: match.score };
  }
  return null;
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
  if (special) {
    // Keep the brand template + palette intact; the day's spirit is passed as an
    // `occasion` cue so the art-director prompt harmonises it into the brand world
    // instead of clashing holiday-cliché colors baked into the scene hint.
    return {
      headline: special.name,
      subtitle: `${input.brandName} ile`,
      sceneHint: preset.matchKeywords,
      occasion: { name: special.name, mood: special.themeHint },
    };
  }
  return {
    headline: preset.sampleHeadline,
    subtitle: preset.sampleSubtitle,
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
  const lines = [
    `BRAND DESIGN CONTRACT: This template set is for ${input.brandName}, sector=${input.sector}${input.location ? `, location=${input.location}` : ''}. Every layout, type choice, color block, crop, and decorative rhythm must come from THIS brand's visual identity, not from generic ${input.sector} presets.`,
    intel.visualDna ? `VISUAL DNA — PRIMARY DESIGN SOURCE: ${intel.visualDna.slice(0, 620)}. Treat this as the highest creative reference after the requested on-canvas text. If sector defaults conflict with visual DNA, visual DNA wins.` : '',
    intel.brandTone ? `Brand tone: ${intel.brandTone.slice(0, 180)}.` : '',
    intel.description ? `Brand description: ${intel.description.slice(0, 320)}.` : '',
    intel.visualStyle ? `Visual style: ${intel.visualStyle.slice(0, 220)}.` : '',
    intel.targetAudience ? `Target audience: ${intel.targetAudience.slice(0, 220)}.` : '',
    intel.campaignGoals ? `Business/campaign goals: ${intel.campaignGoals.slice(0, 220)}.` : '',
    pillars.length ? `Content pillars to reflect: ${pillars.join(' | ')}.` : '',
    ctas.length ? `Native CTA language: ${ctas.join(' | ')}.` : '',
    vibe ? `Vibe profile signals: ${vibe}.` : '',
    service ? `Service/venue profile signals: ${service}.` : '',
    `BRAND UNIQUENESS: A stranger should recognize this as ${input.brandName} from color (${input.brandColors.primary}/${input.brandColors.accent}), venue photo, and type energy — never a stock ${input.sector} Canva pack that could belong to any competitor.`,
    `Template channel/intensity: ${channel} uses ${level}. Build a DISTINCT LAYOUT RECIPE for THIS slot role — vary composition across the library while keeping brand DNA, palette, and typography vibe consistent. Never generic identical Canva header strips across every template.`,
  ].filter(Boolean);

  return [
    lines.join(' '),
    'TEMPLATE RULE: Build reusable brand recipes, not one-off copy cards. The generated preview may use sample copy, but the layout system must be reusable for future mission headlines, captions, events, and offers. Keep text exact and legible; never invent or misspell Turkish words.',
  ];
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
}): string {
  const place = input.location?.trim() || input.sector.replace(/_/g, ' ');
  const dnaCue = input.visualDna?.trim()
    ? input.visualDna.trim().slice(0, 160)
    : `${input.brandName} authentic ${place} atmosphere`;
  const toneCue = input.brandTone?.trim()?.slice(0, 80)
    || input.vibeProfileSummary?.slice(0, 80)
    || 'on-brand, intentional, boutique';
  const familyLine = input.layoutFamily
    ? `Execute layout family "${input.layoutFamily}": ${describeDesignCraftLayoutFamily(input.layoutFamily)}`
    : 'Pick one craft composition that feels hand-designed for this brand.';
  const idea = input.sampleHeadline?.trim()
    ? `Design idea for "${input.sampleHeadline.trim().slice(0, 48)}": make the craft system feel like ${input.brandName}'s own social studio — ${toneCue}.`
    : `Design idea: a reusable ${input.channel} recipe that could only belong to ${input.brandName}.`;

  return [
    `═══ BRAND SLOT DESIGN RECIPE ═══`,
    `Slot: ${input.slotName} (${input.slotKey}) · ${input.channel} · intensity ${input.level}.`,
    idea,
    `Motifs from brand world: ${dnaCue}.`,
    `Color craft: use ${input.primary} + ${input.accent} as intentional accents/plates/rules — never random teal/orange stock packs.`,
    familyLine,
    'Reject: competitor-generic sector flyer, identical library clones, text escaping its plate.',
  ].join(' ');
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
  const picked = matchedPhoto ?? heroFallback ?? null;
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

  const layoutBrief = resolveFalDesignBrief({
    caption: subtitle ?? headline ?? preset.name,
    headline: headline || input.brandName,
    templateUseCase: resolveFalUseCaseForDesignTemplate(preset.templateType, preset.intent),
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
  const productionIntensity = slotIntensity.level;
  const designIntensityLevel = clampDesignIntensityForArchetype(
    resolveTemplateLibraryDesignIntensity(productionIntensity),
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
  const brandMark = resolveBrandMarkMode({
    logoUrl: input.logoUrl,
    brandName: input.brandName,
    logoTreatment: productionSettings.logo_treatment,
    wantBrandMark: shouldProminentLogoInFalTemplate(theme, preset.prominentLogo)
      || Boolean(input.logoUrl?.trim()),
  });
  const prominentLogo = brandMark.mode === 'official_logo';
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
  const needsCraftFamily = shouldApplyCraftLayoutFamily(designIntensityLevel, layoutLanguage);
  const layoutFamily = needsCraftFamily
    ? resolveDesignCraftLayoutFamily(
      layoutFamilySeed,
      resolveCraftAllowlistForPack(layoutLanguage),
    )
    : null;
  const slotDesignRecipe = buildBrandSlotDesignRecipe({
    brandName: input.brandName,
    sector: input.sector,
    location: input.location,
    primary: input.brandColors.primary,
    accent: input.brandColors.accent,
    slotKey: layoutFamilySeed,
    slotName: preset.name,
    channel: intensityChannel,
    level: designIntensityLevel,
    layoutFamily,
    visualDna: input.brandIntelligence?.visualDna ?? input.visualDnaTone,
    brandTone: input.brandIntelligence?.brandTone,
    vibeProfileSummary: compactObjectSummary(input.brandIntelligence?.vibeProfile, 120),
    sampleHeadline: headline || preset.sampleHeadline,
  });

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
      occasion,
      brandDirectives: [
        ...brandIntelligenceDirectives,
        slotDesignRecipe,
        brandMark.xorDirective,
        'LAYOUT TEMPLATE CONTRACT: reusable brand layout recipe — graphic craft system (rail/plate/L/rules/soft split) + photo + type. NOT a raw photo with floating center text, and NOT a solid painted header panel + photo strip Canva sandwich.',
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
          ? 'FORBIDDEN LOGO PAINT: never paint, type, or illustrate the brand mark — official logo is composited post-generation in the reserved quiet zone. Do not also type the brand name.'
          : brandMark.mode === 'text_wordmark'
            ? `BRAND WORDMARK: type "${input.brandName}" once as a small corner mark — do not invent a logo icon.`
            : 'FORBIDDEN BRAND MARK: no logo and no typed brand name on this canvas.',
        'FORBIDDEN TEXT: misspelled Turkish diacritics, invented subtitle words, or ASCII-only approximations of contracted copy.',
        picked?.url
          ? 'DEFAULT VENUE/HERO PHOTO LOCK: Use the provided reference image as the immutable brand venue anchor for this template. Preserve the actual place, coastline, furniture, colors, and atmosphere. Do not invent a synthetic beach, sand dune, generic sea, fake architecture, or alternate venue.'
          : '',
        ...layoutDirectives,
        ...(antiPatternDirective ? [antiPatternDirective] : []),
      ].filter(Boolean),
      // Only pass logo into the image pipeline when XOR mode is official_logo —
      // otherwise generators may both composite logo and type the name.
      logoUrl: brandMark.logoUrl,
    }),
    preset.format === 'reel_cover' ? 'reel' : preset.format,
  );

  let thumbnailUrl: string | null = null;
  let generator: 'gpt-image-1' | 'fal-ideogram' | 'none' = 'none';

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
        overlayColor: input.brandColors.primary,
        backgroundIntent: sceneHint,
      });
      if (generated) {
        generator = 'gpt-image-1';
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
        sceneHint,
        visualDnaTone: input.visualDnaTone,
        designIntensityLevel,
        logoUrl: brandMark.logoUrl,
        logoPlacement: layoutBrief.logoPlacement ?? undefined,
        location: input.location,
        sector: input.sector,
        captionAwareHeadline: false,
        requireGroundedGallery: Boolean(picked?.url),
        grafikerMaxRetries: 1,
        // With a gallery photo, keep fal fallback grounded (no Ideogram-only shortcut).
        templatePreviewMode: picked ? false : input.templatePreviewMode !== false,
        occasion,
      });
      if (still.imageUrl) {
        generator = still.typographyModel.includes('gpt-image-1') ? 'gpt-image-1' : 'fal-ideogram';
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
  },
): Promise<GeneratedDesignTemplate> {
  const engineInput = {
    ...input,
    productionOverrides: options?.productionOverrides ?? input.productionOverrides,
    excludeGalleryUrls: options?.excludeGalleryUrls ?? input.excludeGalleryUrls,
    layoutFamilySalt: options?.layoutFamilySalt ?? input.layoutFamilySalt,
  };
  return generateOne(
    preset,
    engineInput,
    new Set<string>(),
    undefined,
    resolveDefaultTemplateHeroPhoto(engineInput),
  );
}
