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
  resolveFalDesignIntensityForChannel,
  type FalDesignChannel,
} from '@/lib/fal-design-intensity';
import {
  type GalleryPhotoMeta,
  matchPhotoToContent,
} from '@/lib/gallery-photo-matcher';
import { normalizeGalleryUrl } from '@/lib/gallery-usage-tracker';
import {
  type DesignTemplateFormat,
  type DesignTemplatePreset,
  resolveDesignTemplatePresets,
} from '@/lib/brand-design-template-presets';
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
}

/** Shape matching the backend DesignTemplateCreate payload. */
export interface GeneratedDesignTemplate {
  template_type: string;
  template_name: string;
  format: DesignTemplateFormat;
  thumbnail_url: string | null;
  sector_category: string | null;
  locale: string | null;
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

async function generateOne(
  preset: DesignTemplatePreset,
  input: DesignTemplateEngineInput,
  usedUrls: Set<string>,
  special?: EngineSpecialDay,
): Promise<GeneratedDesignTemplate> {
  const { headline, subtitle, sceneHint, occasion } = resolveCopy(preset, input, special);
  const theme = input.brandTheme ?? null;
  const typographyConfig = (theme?.typography_design ?? theme?.typographyDesign) as
    | { vibe?: TypographyVibe; background_style?: string; text_effect?: string; logo_treatment?: string }
    | undefined;
  const intensityChannel: FalDesignChannel = preset.format === 'reel_cover'
    ? 'reel'
    : preset.format === 'story'
      ? 'story'
      : 'post';
  const designIntensityLevel = resolveFalDesignIntensityForChannel(theme, intensityChannel);
  const vibe = resolveTypographyVibeFromContext({
    caption: occasion ? `${sceneHint} ${occasion.mood ?? ''}`.trim() : sceneHint,
    headline,
    sector: input.sector,
    brandVibe: typographyConfig?.vibe ?? null,
    visualDnaTone: input.visualDnaTone,
    lockPremiumVibe: Boolean(input.visualDnaTone?.trim()),
  });
  const picked = pickPhotoForPreset(preset, input, usedUrls);
  if (picked) usedUrls.add(normalizeGalleryUrl(picked.url));
  const backgroundStyle: TypographyBackgroundStyle = picked?.url
    ? 'photo_overlay'
    : ((typographyConfig?.background_style as TypographyBackgroundStyle | undefined) ?? 'gradient_mesh');
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
    brandDirectives: antiPatternDirective ? [antiPatternDirective] : undefined,
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
        sceneHint,
        visualDnaTone: input.visualDnaTone,
        designIntensityLevel,
        logoUrl: preset.prominentLogo ? input.logoUrl : undefined,
        location: input.location,
        sector: input.sector,
        captionAwareHeadline: false,
        grafikerMaxRetries: 0,
        occasion,
      });
      if (!still.imageUrl) return false;
      generator = 'fal-ideogram';
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

  if (!thumbnailUrl && picked && !serverConfig.imageGen.preferFalDesignedPosts) {
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
        logoUrl: preset.prominentLogo ? input.logoUrl : undefined,
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
    design_spec: {
      prompt,
      vibe,
      brandColors: input.brandColors,
      sampleHeadline: headline,
      sampleSubtitle: subtitle,
      galleryRef: picked?.url ?? null,
      galleryMatchScore: picked?.score ?? null,
      intent: preset.intent,
      prominentLogo: preset.prominentLogo,
      logoUrl: input.logoUrl,
      designIntensityLevel,
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
 * Generate the brand's design-template set. Runs presets with bounded
 * concurrency and never throws on individual failures — partial sets are valid.
 */
export async function generateBrandDesignTemplates(
  input: DesignTemplateEngineInput,
): Promise<DesignTemplateEngineResult> {
  const presets = resolveDesignTemplatePresets(input.sector);
  const selected = typeof input.limit === 'number'
    ? presets.slice(0, input.limit)
    : presets;
  const concurrency = Math.max(1, input.concurrency ?? 3);
  const usedUrls = new Set<string>();
  const templates: GeneratedDesignTemplate[] = [];

  // Build the generation job list. The event_special preset expands into one
  // brand-consistent template per upcoming country special day so the brand has
  // a ready-to-publish creative for every occasion from day one.
  const specialDays = (input.specialDays ?? []).slice(0, input.maxSpecialDays ?? 4);
  const jobs: Array<{ preset: DesignTemplatePreset; special?: EngineSpecialDay }> = [];
  for (const preset of selected) {
    if (preset.templateType === 'event_special' && specialDays.length > 0) {
      for (const sd of specialDays) jobs.push({ preset, special: sd });
    } else {
      jobs.push({ preset });
    }
  }

  // Process in bounded-concurrency batches. usedUrls is mutated across batches
  // so photo dedup holds; within a batch picks may overlap (acceptable).
  for (let i = 0; i < jobs.length; i += concurrency) {
    const batch = jobs.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((job) => generateOne(job.preset, input, usedUrls, job.special)),
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
