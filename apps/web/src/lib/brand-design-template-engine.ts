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
  buildDesignedVideoReelDesignCardPrompt,
  produceFalDesignedPostStill,
  resolveIdeogramBackgroundStyle,
  resolveTypographyVibeFromContext,
} from '@/lib/fal-designer-production';
import {
  resolveFalTemplateIntensityForChannel,
  resolveFalTemplateBackgroundStyle,
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
import { clampDesignIntensityForArchetype } from '@/lib/fal-design-intensity';
import {
  DESIGN_TEMPLATE_TO_CALENDAR_ANNOUNCEMENT,
  resolveFalUseCaseForDesignTemplate,
  type DesignTemplateFormat,
  type DesignTemplatePreset,
  resolveDesignTemplatePresets,
} from '@/lib/brand-design-template-presets';
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
  /** Ideogram-only fast path for onboarding batch (~60s/slot). Default true. */
  templatePreviewMode?: boolean;
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
  level: import('@/lib/fal-design-intensity').FalDesignIntensityLevel,
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
    `Template channel/intensity: ${channel} uses ${level}. Build a reusable LAYOUT RECIPE with visible graphic architecture (zones, panels, hierarchy, brand-color accents) — not a raw photo with floating center text. At photo_first/elegant_light keep quiet luxury but still show designed zones; at balanced/designed/bold_editorial increase canvas composition, editorial typography and brand-specific structure while preserving the real gallery photo and visual DNA.`,
  ].filter(Boolean);

  return [
    lines.join(' '),
    'TEMPLATE RULE: Build reusable brand recipes, not one-off copy cards. The generated preview may use sample copy, but the layout system must be reusable for future mission headlines, captions, events, and offers. Keep text exact and legible; never invent or misspell Turkish words.',
  ];
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
  const productionIntensity = resolveFalTemplateIntensityForChannel(theme, intensityChannel);
  const picked = defaultHeroPhoto ?? pickPhotoForPreset(preset, input, usedUrls);
  if (picked && !defaultHeroPhoto) usedUrls.add(normalizeGalleryUrl(picked.url));
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
    explicitCanvaArchetypeId: calendarLayout.canvaArchetypeId,
  });
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
  const layoutDirectives = buildFalDesignBriefDirectives(layoutBrief, briefFormat);
  const backgroundStyle: TypographyBackgroundStyle = resolveFalTemplateBackgroundStyle({
    theme,
    referencePhotoUrl: picked?.url,
  });
  const useOfficialLogo = Boolean(input.logoUrl?.trim());
  const prominentLogo = useOfficialLogo || shouldProminentLogoInFalTemplate(theme, preset.prominentLogo);
  const antiPatternDirective = (input.antiPatterns ?? []).length
    ? `Avoid: ${input.antiPatterns!.slice(0, 6).join('; ')}.`
    : undefined;

  const aspect = aspectForFormat(preset.format);
  const isReel = preset.format === 'reel_cover' || aspect === '9:16';
  const buildPrompt = isReel
    ? buildDesignedVideoReelDesignCardPrompt
    : buildDesignedPostDesignCardPrompt;

  const prompt = buildPrompt({
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
    occasion,
    brandDirectives: [
      ...brandIntelligenceDirectives,
      'LAYOUT TEMPLATE CONTRACT: This output is a reusable brand layout recipe for future missions — it MUST show intentional graphic architecture (zones, panels, type hierarchy, brand-color accents), not a raw gallery photo with floating center text.',
      'FORBIDDEN LAYOUT: generic 50/50 horizontal screen-split with flat color block on top and photo strip below — unless the Canva archetype explicitly requires a diagonal or editorial asymmetry.',
      'FORBIDDEN LOGO: never paint, type, or illustrate the brand mark — official logo is composited post-generation in the reserved quiet zone.',
      'FORBIDDEN TEXT: misspelled Turkish diacritics, invented subtitle words, or ASCII-only approximations of contracted copy.',
      picked?.url
        ? 'DEFAULT VENUE/HERO PHOTO LOCK: Use the provided reference image as the immutable brand venue anchor for this template. Preserve the actual place, coastline, furniture, colors, and atmosphere. Do not invent a synthetic beach, sand dune, generic sea, fake architecture, or alternate venue.'
        : '',
      ...layoutDirectives,
      ...(antiPatternDirective ? [antiPatternDirective] : []),
    ].filter(Boolean),
  });

  let thumbnailUrl: string | null = null;
  let generator: 'gpt-image-1' | 'fal-ideogram' | 'none' = 'none';

  const tryFalPreview = async (): Promise<boolean> => {
    if (!serverConfig.fal.configured) return false;
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
        logoUrl: prominentLogo ? input.logoUrl : undefined,
        logoPlacement: layoutBrief.logoPlacement ?? undefined,
        location: input.location,
        sector: input.sector,
        captionAwareHeadline: false,
        requireGroundedGallery: Boolean(picked?.url),
        grafikerMaxRetries: 1,
        templatePreviewMode: input.templatePreviewMode !== false,
        occasion,
      });
      if (!still.imageUrl) return false;
      generator = still.typographyModel.includes('gpt-image-1') ? 'gpt-image-1' : 'fal-ideogram';
      thumbnailUrl = (await mirrorPreview(still.imageUrl, input.workspaceId)) ?? still.imageUrl;
      return Boolean(thumbnailUrl);
    } catch (err) {
      console.warn(
        `[design-template-engine] fal preview failed for ${preset.templateType}:`,
        err instanceof Error ? err.message : err,
      );
      return false;
    }
  };

  if (picked || serverConfig.fal.configured) {
    await tryFalPreview();
  }

  const allowGptFallback = !serverConfig.imageGen.preferFalDesignedPosts
    || input.templatePreviewMode !== false;
  if (!thumbnailUrl && picked && allowGptFallback) {
    try {
      const generated = await generateDesignedPostImage({
        workspaceId: input.workspaceId,
        designCardPrompt: prompt,
        designCardMode: isReel ? 'reel' : 'post',
        headline: headline || input.brandName,
        caption: subtitle ?? headline ?? preset.name,
        referenceImageUrls: [picked.url],
        brandName: input.brandName,
        format: imageFormatForFormat(preset.format),
        location: input.location,
        businessType: input.sector,
        logoUrl: prominentLogo ? input.logoUrl : undefined,
        overlayColor: input.brandColors.primary,
        backgroundIntent: sceneHint,
      });
      if (generated) {
        generator = 'gpt-image-1';
        thumbnailUrl = await mirrorPreview(generated, input.workspaceId) ?? generated;
      }
    } catch (err) {
      console.warn(
        `[design-template-engine] gpt preview failed for ${preset.templateType}:`,
        err instanceof Error ? err.message : err,
      );
    }
  } else if (!thumbnailUrl && !picked) {
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
      logoUrl: input.logoUrl,
      designIntensityLevel,
      productionIntensityLevel: productionIntensity,
      catalogSlotKey: preset.catalogSlotKey ?? null,
      canvaArchetypeId: layoutBrief.canvaArchetypeId ?? null,
      canvaArchetypeName: layoutBrief.canvaArchetypeName ?? null,
      layoutPattern: layoutBrief.layoutPattern,
      typographyMode: layoutBrief.typographyMode,
      designBriefDirectives: layoutDirectives,
      ...(special
        ? { specialDay: { name: special.name, mmdd: special.mmdd, category: special.category } }
        : {}),
      generatedAt: new Date().toISOString(),
      generator,
    },
  };
}

async function mirrorPreview(url: string, workspaceId: string): Promise<string | null> {
  if (!isR2Configured()) return null;
  try {
    const ext = url.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
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
  options?: { productionOverrides?: Partial<BrandFalTemplateProductionConfig> },
): Promise<GeneratedDesignTemplate> {
  const engineInput = {
    ...input,
    productionOverrides: options?.productionOverrides ?? input.productionOverrides,
  };
  return generateOne(
    preset,
    engineInput,
    new Set<string>(),
    undefined,
    resolveDefaultTemplateHeroPhoto(engineInput),
  );
}
