/**
 * fal.ai Designer Studio — parallel production track (NOT Remotion).
 *
 * Used by mission reel slots `fal_reel` / `fal_reel_motion` (and legacy `fal_story`).
 * Story üretimi Remotion'da kalır — bu modül video için fal.ai designer track.
 */

import type { TypographyBackgroundStyle, TypographyVibe } from '@/types/brand-theme';
import { defaultTypographyVibeForSector } from '@/types/brand-theme';
import { generateTypographyDesignWithRetry, getVibePromptSpec } from '@/lib/fal-typography-design';
import {
  generateStoryMotionPlateWithRetry,
  resolveMotionStyle,
  type StoryMotionResult,
} from '@/lib/fal-story-motion';
import { validateFalCanvasText, validateTypographyText } from '@/lib/typography-text-validation';
import { runGrafikerVisionReview } from '@/lib/grafiker-review-service';
import { fetchExternalImageBuffer } from '@/lib/external-image-fetch';
import { GRAFIKER_PASS_THRESHOLD } from '@/lib/grafiker-quality';
import { getSectorProfile } from '@/lib/sector-production-profile';
import {
  resolveFalDisplayHeadline,
  resolveFalSubtitle,
  correctTurkishSpelling,
  ensureMeaningfulFalOverlayText,
  formatFalOnImageHeadlineDirective,
  formatFalOnImageSubtitleDirective,
  isMeaningfulFalOverlayText,
  sanitizeFalOverlayText,
  clampFalOverlayHeadlineForCanvas,
  shortenFalOverlayForImageRetry,
  truncateAtWordBoundary,
  buildFalBrandMarkPlacementDirective,
  buildFalLogoPlacementContract,
  buildFalOnCanvasTextContract,
  resolveBrandMarkLockup,
  resolveFalProductionOverlayHeadline,
  areFalOverlayTextsRedundant,
  resolveFalOverlayCopy,
  type FalLogoCanvasChannel,
} from '@/lib/fal-caption-headline';
import {
  describeDesignCraftLayoutFamily,
  resolveDesignCraftLayoutFamily,
  resolveFalDesignIntensityDirectives,
  resolveFalDesignIntensityForChannel,
  resolveFalDesignIntensityMode,
  type DesignCraftLayoutFamily,
  type FalDesignChannel,
  type FalDesignIntensityLevel,
} from '@/lib/fal-design-intensity';
import {
  buildBrandLayoutLanguageDirectives,
  resolveBrandLayoutLanguage,
  resolveCraftAllowlistForPack,
  shouldApplyCraftLayoutFamily,
} from '@/lib/brand-layout-language';
import {
  lockImageToCanvas,
  POST_CANVAS,
  STORY_CANVAS,
} from '@/lib/design-canvas-aspect';
import { resolveBrandMarkMode } from '@/lib/brand-mark-mode';
import { compositeOfficialLogoOnFrameUrl, compositeOfficialLogoOnVideoUrl } from '@/lib/fal-logo-composite';
import { finalizeFalPrompt } from '@/lib/fal-prompt';

type AspectRatio = '9:16' | '1:1' | '4:5';

/**
 * Keep typography/panels off photo heroes without changing the design system.
 * Injected early into every fal designer card prompt (post / story / reel).
 * Kept short so finalizeFalPrompt maxChars trim cannot drop it or crowd logo rules.
 */
export const FAL_SUBJECT_CLEARANCE_DIRECTIVE =
  'SUBJECT CLEARANCE (MANDATORY): Never cover faces, hands, glassware, plates, vehicles/scooters, seated groups, or the product hero with type or opaque paint. Design zones and photo window are separate — type stays in painted/craft zones only.';

/**
 * Design-first compose: paint layout + type, then place the gallery photo in the leftover window.
 * Prevents craft plates from landing on wine glasses / dishes after a full-bleed photo underlay.
 */
export const FAL_PHOTO_WINDOW_COMPOSE_DIRECTIVE =
  'COMPOSE ORDER (MANDATORY for bold craft locks): (1) Reserve brand craft zones from the locked layout family and place ALL headline/subtitle fully inside those zones with padding. (2) Place the gallery photo ONLY in the remaining clear rectangle — object-fit contain so the FULL photo is visible (no crop of glassware/faces/plates/product). (3) Never cover the photo hero afterward. FORBIDDEN: full-bleed underlay then opaque cover-up; FORBIDDEN: header/footer Canva sandwich.';

export interface FalDesignerInput {
  workspaceId?: string;
  headline: string;
  subtitle?: string;
  caption?: string;
  brandName?: string;
  brandColors: { primary: string; accent: string };
  vibe: TypographyVibe;
  backgroundStyle?: TypographyBackgroundStyle;
  aspectRatio: AspectRatio;
  logoUrl?: string;
  logoPlacement?: import('@/lib/fal-logo-placement').ResolvedFalLogoPlacement | null;
  location?: string;
  brandReferenceImageUrls?: string[];
  sector?: string;
  mood?: string;
  /** BCD-generated art direction for this specific brief×brand. */
  artDirection?: string;
  /** Gallery photo for photo_overlay backgrounds */
  referencePhotoUrl?: string;
  /**
   * Brief-derived subject/scene the generated background should evoke.
   * Combines Feed Art Director `visual_subject_hint` + mission visual brief so
   * fal-only output reflects the post's actual topic instead of a generic gradient.
   */
  sceneHint?: string;
  grafikerMaxRetries?: number;
  /**
   * When true, derive a unique display headline from caption instead of using
   * the raw headline (which may be the same mission title across all slots).
   * Defaults to false — mission ideation headline + CTA are rendered verbatim.
   */
  captionAwareHeadline?: boolean;
  /** Shared brand-system directives resolved from Brand Theme + Template Library. */
  brandDirectives?: string[];
  /**
   * One-sentence brand visual DNA tone distilled from brand_contexts.visual_dna.
   * Injected into Ideogram prompt so the design feels brand-authentic, not sector-generic.
   */
  visualDnaTone?: string;
  /**
   * When true, the still generation uses backgroundOnly mode — Ideogram produces a
   * pure atmospheric plate (zero text) to serve as the Kling/Luma start frame.
   * Used by fal_story / fal_reel so the motion model never distorts baked text.
   * For fal_designed_post stills this must stay false (full typography design).
   */
  backgroundOnlyPlate?: boolean;
  /** One-sentence motion cue from agent designer brief (Kling). */
  designerMotionCue?: string;
  /** Ad-hoc New Brief: must compose on the real gallery photo (GPT-image grounded edit). */
  requireGroundedGallery?: boolean;
  /** fal.ai video pipeline — drives story-specific prompts and fallback policy. */
  pipeline?: 'fal_story' | 'fal_reel';
  /** Per-channel design intensity — overrides default photo/typography balance in prompts. */
  designIntensityLevel?: FalDesignIntensityLevel;
  /** Locked special-day occasion from brand template (event_special). */
  occasion?: { name: string; mood?: string };
  /**
   * When true, skip post-generation logo on still frames — caller composites once
   * on the final video (fal_reel) to avoid duplicate marks after Kling motion.
   */
  deferLogoComposite?: boolean;
  /**
   * Brand Hub per-slot preview — skip slow GPT grounded edit + Grafiker loops.
   * Uses a single Ideogram typography pass (~30–90s). Mission production keeps full QA.
   */
  templatePreviewMode?: boolean;
  /**
   * Approved brand template preview — second GPT edit image so the grounded
   * compose replicates the template's exact layout (photo + text swapped).
   */
  templateLayoutImageUrl?: string | null;
  /**
   * Stored template generation prompt (design_spec.prompt) + sample copy.
   * When set, the grounded compose reuses it verbatim with mission text swapped
   * in — "Yeniden üret" semantics instead of a freshly built prompt.
   */
  templateReplica?: import('@/lib/brand-design-template-production').TemplateReplicaSpec | null;
  /** economy/agency/starter — VIDEO_TIER_SCOPE caps reel I2V retries. */
  productionTier?: string | null;
  /**
   * Resolved reel production recipe (slot + template + brand).
   * Controls photo_plate vs locked_graphics I2V path for fal_reel.
   */
  reelRecipe?: import('@/lib/reel-production-recipe').ReelRecipe | null;
  /**
   * Skip Kling/Luma when the caller will run beat-montage I2V instead.
   * Prevents paying for a full locked-graphics clip that is immediately discarded.
   */
  skipMotion?: boolean;
}

export interface FalDesignerStillResult {
  imageUrl: string;
  typographyModel: string;
  vibe: TypographyVibe;
  grafikerScore: number | null;
  grafikerPass: boolean;
  textValidated: boolean;
  retryCount: number;
  /** The actual headline rendered on the design (may differ from input if caption-aware). */
  resolvedHeadline?: string;
}

export interface FalDesignerVideoResult extends FalDesignerStillResult {
  videoUrl: string;
  motionModel: string;
  motionStyle: string;
}

async function reviewDesignedFrame(
  imageUrl: string,
  headline: string,
  mode: 'story' | 'poster',
): Promise<{ score: number | null; pass: boolean }> {
  const buf = await fetchExternalImageBuffer(imageUrl, 25_000);
  if (!buf || buf.length < 100) return { score: null, pass: true };
  const review = await runGrafikerVisionReview(buf, headline.slice(0, 60), mode);
  if (!review) return { score: null, pass: true };
  const score = review.score ?? null;
  const pass = review.pass === true
    || (score != null && score >= GRAFIKER_PASS_THRESHOLD);
  return { score, pass };
}

async function finalizeFalStillWithOfficialLogo(
  result: FalDesignerStillResult,
  input: Pick<FalDesignerInput, 'logoUrl' | 'logoPlacement' | 'aspectRatio' | 'workspaceId' | 'deferLogoComposite'>,
): Promise<FalDesignerStillResult> {
  if (!result.imageUrl) return result;

  // GPT grounded edits return 1024×1536 (2:3). Lock post→4:5 / story→9:16 before
  // persist so library + production never ship the same tall slab for both formats.
  const target = input.aspectRatio === '9:16' ? STORY_CANVAS : POST_CANVAS;
  const locked = await lockImageToCanvas(result.imageUrl, target);
  let imageUrl = locked.url;
  let typographyModel = result.typographyModel;
  if (locked.locked) {
    typographyModel = `${typographyModel}+canvas-${locked.label}`;
    console.log(
      `[fal-designer] canvas locked to ${locked.label} (${target.width}x${target.height})`,
    );
  }

  const logoUrl = input.logoUrl?.trim();
  if (input.deferLogoComposite || !logoUrl) {
    return { ...result, imageUrl, typographyModel };
  }

  const channel = input.aspectRatio === '9:16' ? 'reel' : 'feed_post';
  const composited = await compositeOfficialLogoOnFrameUrl({
    frameUrl: imageUrl,
    logoUrl,
    placement: input.logoPlacement ?? null,
    channel,
    workspaceId: input.workspaceId,
  });

  if (!composited.logoApplied) {
    console.warn(
      '[fal-designer] Official logo composite failed — AI may have drawn a substitute mark; check logo URL and frame persistence',
    );
    return { ...result, imageUrl, typographyModel };
  }

  return {
    ...result,
    imageUrl: composited.imageUrl,
    typographyModel: `${typographyModel}+logo-composite`,
  };
}

function resolveBackgroundStyle(
  style: TypographyBackgroundStyle | undefined,
  referencePhotoUrl?: string,
): TypographyBackgroundStyle {
  if (style) return style;
  return referencePhotoUrl ? 'photo_overlay' : 'gradient_mesh';
}

/**
 * Ideogram generates backgrounds from scratch — it cannot anchor to a real gallery
 * photo. When a reference exists, avoid photo_overlay (which invents a fake venue
 * scene). GPT-image grounded edit handles real-photo compositing instead.
 */
export function resolveIdeogramBackgroundStyle(
  style: TypographyBackgroundStyle | undefined,
  referencePhotoUrl?: string,
): TypographyBackgroundStyle {
  const resolved = resolveBackgroundStyle(style, referencePhotoUrl);
  if (referencePhotoUrl && resolved === 'photo_overlay') {
    return 'gradient_mesh';
  }
  return resolved;
}

// ── Caption / brief → typography vibe ────────────────────────────────────────

/** Keyword → vibe heuristics, ordered by specificity. */
const VIBE_KEYWORD_RULES: Array<{ vibe: TypographyVibe; rx: RegExp }> = [
  { vibe: 'warm_coastal', rx: /\b(deniz|sea|plaj|beach|sahil|coast|yüzme|swim|kumsal|dalga|wave|güneş|sun|marina|tekne|boat)\b/i },
  { vibe: 'neon_glow', rx: /\b(gece|night|parti|party|dj|club|kulüp|bar|lounge|after|set|live|canlı)\b/i },
  { vibe: 'handwritten', rx: /\b(doğal|natural|organik|organic|el yapımı|handmade|spa|wellness|huzur|sakin|cilt|skin|bakım)\b/i },
  { vibe: 'editorial_serif', rx: /\b(lüks|luxury|premium|şık|elegant|özel|exclusive|fine|gurme|gourmet|signature|imza)\b/i },
  { vibe: 'street_bold', rx: /\b(yeni sezon|drop|koleksiyon|collection|streetwear|moda|fashion|stil|style|trend|enerji|energy|güçlü)\b/i },
  { vibe: 'retro_poster', rx: /\b(kahve|coffee|fırın|bakery|tatlı|dessert|nostalji|retro|vintage|lezzet|menü|menu|brunch)\b/i },
  { vibe: 'chrome_gradient', rx: /\b(tatil|holiday|resort|otel|hotel|kaçamak|escape|manzara)\b/i },
  { vibe: 'minimal_modern', rx: /\b(teknoloji|tech|dijital|digital|ajans|agency|kurumsal|corporate|minimal|sade|clean)\b/i },
  { vibe: 'bubble_3d', rx: /\b(eğlence|fun|genç|çocuk|kids|playful|şenlik|festival|kampanya|indirim|fırsat|%)\b/i },
];

/** Map distilled brand soul phrases → typography vibe (general brand DNA layer). */
const SOUL_VIBE_RULES: Array<{ vibe: TypographyVibe; rx: RegExp }> = [
  { vibe: 'warm_coastal', rx: /\b(aegean|mediterranean|bodrum|coastal|beach|marina|sun.?bleach|turquoise|bohemian)\b/i },
  { vibe: 'editorial_serif', rx: /\b(luxury|lüks|premium|elegant|refined|michelin|fine dining|sophisticated)\b/i },
  { vibe: 'handwritten', rx: /\b(artisan|organic|natural|hand.?craft|wellness|spa|warm|samimi)\b/i },
  { vibe: 'retro_poster', rx: /\b(craft|artisan|coffee|roast|vintage|nostalg|warm|rustic)\b/i },
  { vibe: 'minimal_modern', rx: /\b(minimal|clean|modern|contemporary|sleek|understated)\b/i },
  { vibe: 'neon_glow', rx: /\b(neon|nightlife|club|dj|electric|after.?dark|speakeasy)\b/i },
  { vibe: 'street_bold', rx: /\b(bold|urban|street|energy|dynamic|impact)\b/i },
];

function inferVibeFromBrandSoul(visualDnaTone?: string | null): TypographyVibe | null {
  const soul = (visualDnaTone ?? '').trim();
  if (!soul) return null;
  for (const rule of SOUL_VIBE_RULES) {
    if (rule.rx.test(soul)) return rule.vibe;
  }
  return null;
}

function inferVibeFromPostMood(postMood?: string | null): TypographyVibe | null {
  const mood = (postMood ?? '').trim();
  if (mood.length < 8) return null;
  for (const rule of VIBE_KEYWORD_RULES) {
    if (rule.rx.test(mood)) return rule.vibe;
  }
  return null;
}

function inferVibeFromCaptionKeywords(caption?: string, headline?: string): TypographyVibe | null {
  const text = `${headline ?? ''} ${caption ?? ''}`.trim();
  if (!text) return null;
  for (const rule of VIBE_KEYWORD_RULES) {
    if (rule.rx.test(text)) return rule.vibe;
  }
  return null;
}

/**
 * Resolve typography vibe — multi-tenant hierarchy (general → specific):
 *   1. Tenant `typography_design.vibe` (brand standard)
 *   2. Brand visual DNA soul
 *   3. This post's mood / photo_mood
 *   4. Sector default
 *   5. Caption keyword tie-break only
 */
export function resolveTypographyVibeFromContext(input: {
  caption?: string;
  headline?: string;
  sector?: string;
  brandVibe?: TypographyVibe | null;
  visualDnaTone?: string | null;
  postMood?: string | null;
  /**
   * When true (premium / global venue brands), caption keywords must not flip
   * a refined soul vibe into neon_glow / street_bold from a single DJ word.
   */
  lockPremiumVibe?: boolean;
}): TypographyVibe {
  if (input.brandVibe) return input.brandVibe;

  const fromSoul = inferVibeFromBrandSoul(input.visualDnaTone);
  if (fromSoul) {
    // Premium soul wins — don't let one nightlife keyword override editorial restraint.
    if (input.lockPremiumVibe) return fromSoul;
    return fromSoul;
  }

  const fromPost = inferVibeFromPostMood(input.postMood);
  if (fromPost) return fromPost;

  const sectorDefault = defaultTypographyVibeForSector(input.sector ?? '');
  const fromCaption = inferVibeFromCaptionKeywords(input.caption, input.headline);
  // Beach / hospitality: prefer coastal/editorial defaults over neon unless mood is explicit.
  if (
    input.lockPremiumVibe
    && fromCaption
    && (fromCaption === 'neon_glow' || fromCaption === 'street_bold' || fromCaption === 'bubble_3d')
  ) {
    return sectorDefault;
  }
  if (fromCaption && fromCaption !== sectorDefault) return fromCaption;

  return sectorDefault;
}

/** Venue sectors that should default to restrained, agency-grade Fal language. */
export function isPremiumVenueSector(sector?: string): boolean {
  const s = (sector ?? '').toLowerCase();
  return (
    s.includes('beach')
    || s.includes('club')
    || s.includes('hotel')
    || s.includes('resort')
    || s.includes('spa')
    || s.includes('fine_dining')
    || s.includes('restaurant')
    || s.includes('bar')
    || s.includes('nightclub')
  );
}

/** Premium social-post typography bar — rejects amateur/system-font output. */
export function buildPremiumSocialTypographyBlock(input: {
  vibe: TypographyVibe;
  headline: string;
  subtitle?: string;
  fontPersonality?: string;
  headingFont?: string;
  bodyFont?: string;
}): string[] {
  const spec = getVibePromptSpec(input.vibe);
  const fontHint = [input.headingFont, input.bodyFont].filter(Boolean).join(' / ');
  const personalityHint = input.fontPersonality && input.fontPersonality !== 'brand'
    ? `Font personality: ${input.fontPersonality} — `
    : '';
  const safeHeadline = sanitizeFalOverlayText(input.headline);

  const lines = [
    'TYPOGRAPHY STANDARD (MANDATORY): This is a premium Instagram/TikTok designer post — NOT a raw photo with default text overlay.',
    'Reject amateur output: no plain Arial/Helvetica/system sans, no unstyled white text on photo, no Canva-template stock look, no Microsoft Word caption styling.',
    `${personalityHint}${formatFalOnImageHeadlineDirective(safeHeadline, spec.fontDescription)}`,
    `Style energy: ${spec.styleDirective}`,
  ];

  if (fontHint) {
    lines.push(
      `Brand font direction: render as premium social display type in the spirit of ${fontHint} — designed, not generic.`,
    );
  }

  if (input.subtitle?.trim() && isMeaningfulFalOverlayText(input.subtitle)) {
    lines.push(formatFalOnImageSubtitleDirective(input.subtitle));
  }

  return lines;
}

/** Intensity-aware typography — avoids premium headline block on photo-first levels. */
export function buildIntensityTypographyBlock(input: {
  level: FalDesignIntensityLevel;
  vibe: TypographyVibe;
  headline: string;
  subtitle?: string;
  fontPersonality?: string;
  headingFont?: string;
  bodyFont?: string;
}): string[] {
  const spec = getVibePromptSpec(input.vibe);
  const safeHeadline = sanitizeFalOverlayText(input.headline);

  if (input.level === 'photo_first') {
    const lines = [
      'TYPOGRAPHY (photo-first): Gallery photo is absolute hero — 88–95% of frame untouched.',
      `If any text appears: ONE small tagline only, max 5 words, in ${spec.fontDescription}.`,
      `Style: ${spec.styleDirective} — prefer type on a real painted/flat photo surface; else bottom-edge thin scrim — never poster-scale.`,
      'Do NOT render a large headline. No event-card layout. No upper-zone text blocks. Never invent a fake painted panel.',
    ];
    if (input.subtitle?.trim() && isMeaningfulFalOverlayText(input.subtitle)) {
      lines.push(`Preferred tagline (exact, small): "${input.subtitle.trim().slice(0, 48)}"`);
    } else if (safeHeadline) {
      lines.push(`If text required, shrink headline to max 5 words at bottom: "${truncateAtWordBoundary(safeHeadline, 32)}"`);
    }
    return lines;
  }

  if (input.level === 'elegant_light') {
    return [
      'TYPOGRAPHY (elegant/light): Refined headline — seat on a found painted/flat photo surface when clear; else soft translucent scrim.',
      'Reject loud poster type — medium-small display letterforms, max 15% frame height. Align type to the surface axis.',
      `${formatFalOnImageHeadlineDirective(safeHeadline, spec.fontDescription)} — found-surface or bottom-aligned, never upper-zone poster band.`,
      `Style energy: ${spec.styleDirective} — delicate, premium, whisper-quiet hierarchy.`,
    ];
  }

  if (input.level === 'bold_editorial') {
    return [
      'TYPOGRAPHY (bold editorial): OVERSIZED display inside reserved craft zones — magazine-cover impact, not a full-width paint brick over the photo.',
      'Stack headline lines large — 28–42% frame height fully inside the craft plate/rail/L. Photo window stays clear.',
      `${formatFalOnImageHeadlineDirective(safeHeadline, `heavy display caps — ${spec.fontDescription}`)}`,
      `Style energy: ${spec.styleDirective} — magazine cover craft beside a contained photo window.`,
    ];
  }

  if (input.level === 'designed') {
    return [
      'TYPOGRAPHY (designed): Bold custom-feel display locked inside craft zones — asymmetric or magazine lockup.',
      'Headline 18–28% frame height fully inside plate/rail/mat. Never paint type over the photo window. Never a full-width paint header sandwich.',
      `${formatFalOnImageHeadlineDirective(safeHeadline, spec.fontDescription)}`,
      `Style energy: ${spec.styleDirective} — boutique-agency craft, not Canva stacked blocks.`,
    ];
  }

  // balanced — premium social standard
  return buildPremiumSocialTypographyBlock(input);
}

type DesignCardPromptInput = {
  vibe: TypographyVibe;
  headline: string;
  subtitle?: string;
  caption?: string;
  sceneHint?: string;
  brandColors: { primary: string; accent: string };
  brandName?: string;
  /** Brand sector — frames the art-director role so the design fits the business. */
  sector?: string;
  aspectRatio: AspectRatio;
  brandDirectives?: string[];
  visualDnaTone?: string;
  /** Brand logo URL — when provided, a logo image is placed instead of text wordmark. */
  logoUrl?: string;
  /** Art director / archetype resolved logo anchor. */
  logoPlacement?: import('@/lib/fal-logo-placement').ResolvedFalLogoPlacement | null;
  /** Brief mood/vibe — injected so the design FEELS the brief's energy (e.g. "mystical euphoric" for Full Moon party). */
  briefMood?: string;
  /** BCD-generated art direction — composition, style reference, color temperature guidance specific to this brief×brand combination. */
  artDirection?: string;
  /**
   * Special occasion this design celebrates (e.g. "Anneler Günü"). Its spirit is
   * woven into the BRAND palette as subtle, tasteful accents — never as clashing
   * holiday-cliché colors or stock graphics. `mood` is a short creative cue.
   */
  occasion?: { name: string; mood?: string };
  designIntensityLevel?: FalDesignIntensityLevel;
  /** Catalog slot key / seed — locks a craft layout family for library diversity. */
  layoutFamilySeed?: string | null;
  /** Explicit craft layout family override (otherwise derived from layoutFamilySeed). */
  layoutFamily?: DesignCraftLayoutFamily | null;
  /** Template slot font personality (display_bold, serif_editorial, …). */
  fontPersonality?: string;
  headingFont?: string;
  bodyFont?: string;
  /** When true, derive overlay from caption hook instead of ideation headline. */
  captionAwareHeadline?: boolean;
};

/**
 * Build a Canva-style designed-post instruction for GPT-image-1, grounded on a
 * real caption-matched gallery photo. The photo is the base layer; the model
 * composes a designed text/graphic overlay in the resolved vibe + brand colors.
 */
export function buildDesignedPostDesignCardPrompt(input: DesignCardPromptInput): string {
  return buildDesignedDesignCardPrompt(input, 'feed_post');
}

/**
 * Instagram Story poster — venue photo hero + ideation headline panel.
 * Used for fal_story when a gallery photo anchors the design.
 * Always locks canvas language to 9:16 story (never 4:5 feed).
 */
export function buildDesignedStoryDesignCardPrompt(input: DesignCardPromptInput): string {
  return buildDesignedDesignCardPrompt({ ...input, aspectRatio: '9:16' }, 'story');
}

/**
 * Premium Reels/TikTok creator template — bold Canva Pro graphics + photo hero zone.
 * Used for fal_reel / fal_only_reel when a gallery photo anchors the design.
 * Always locks canvas language to 9:16 reel (never 4:5 feed).
 */
export function buildDesignedVideoReelDesignCardPrompt(input: DesignCardPromptInput): string {
  return buildDesignedDesignCardPrompt({ ...input, aspectRatio: '9:16' }, 'reel');
}

type DesignCardMode = 'feed_post' | 'reel' | 'story';

/** Resolve overlay clamp channel from pipeline + aspect ratio. */
export function resolveFalCanvasChannel(input: {
  pipeline?: 'fal_story' | 'fal_reel';
  aspectRatio?: AspectRatio;
}): 'reel' | 'feed_post' | 'story' {
  if (input.pipeline === 'fal_story') return 'story';
  if (input.pipeline === 'fal_reel') return 'reel';
  if (input.aspectRatio === '9:16') return 'story';
  return 'feed_post';
}

function requiresGroundedGalleryDesign(
  input: Pick<FalDesignerInput, 'pipeline' | 'requireGroundedGallery' | 'referencePhotoUrl' | 'sector' | 'templatePreviewMode'>,
): boolean {
  if (input.templatePreviewMode) return false;
  if (input.requireGroundedGallery === true || input.pipeline === 'fal_story') return true;
  const ref = String(input.referencePhotoUrl ?? '').trim();
  if (!ref) return false;
  const profile = getSectorProfile(input.sector);
  // Venue/product brands: gallery photo + template for all Fal video/story/reel slots.
  if (
    (input.pipeline === 'fal_reel' || input.pipeline === 'fal_story' || input.pipeline === 'fal_design')
    && profile.hasPhysicalVenue
    && profile.galleryReliability !== 'low'
  ) {
    return true;
  }
  if (profile.hasPhysicalVenue && profile.galleryReliability !== 'low') return true;
  return false;
}

/** Mission / pipeline router — when Fal must compose on the matched gallery photo. */
export function resolveFalRequireGroundedGallery(input: {
  requireGroundedGallery?: boolean;
  referencePhotoUrl?: string | null;
  sector?: string;
  pipeline?: 'fal_story' | 'fal_reel';
  captionDrivenGenerated?: boolean;
  /** Brand has analyzed venue/product gallery — synthetic AI scenes are not allowed. */
  hasRealBrandGallery?: boolean;
}): boolean {
  if (input.requireGroundedGallery) return true;
  const groundedByPolicy = requiresGroundedGalleryDesign({
    pipeline: input.pipeline,
    requireGroundedGallery: false,
    referencePhotoUrl: input.referencePhotoUrl ?? undefined,
    sector: input.sector,
  });
  if (groundedByPolicy) return true;
  // Gallery-backed physical venues: Fal paints on the caption-matched photo — never Ideogram-only.
  if (
    input.hasRealBrandGallery
    && input.referencePhotoUrl?.trim()
    && !input.captionDrivenGenerated
  ) {
    const profile = getSectorProfile(input.sector);
    if (profile.hasPhysicalVenue && profile.galleryReliability !== 'low') return true;
  }
  if (input.captionDrivenGenerated) return false;
  return false;
}

/**
 * Sector-specific design language — ensures each brand type gets a fundamentally
 * different visual approach rather than the same generic template.
 */
function resolveSectorDesignLanguage(
  sector: string | undefined,
  mode: DesignCardMode,
  intensityLevel: FalDesignIntensityLevel = 'balanced',
): string {
  const base = mode === 'reel'
    ? 'Build a confident editorial system: headline + supporting line crafted onto the photo. MOTION-READY layers without inventing opaque paint slabs.'
    : mode === 'story'
      ? 'Compose a branded vertical story: real venue photography as the canvas; type locked into the photo. Static Instagram Story — NOT a Canva sandwich, NOT a motion template.'
      : 'Compose a hand-crafted editorial design. Composite type and light accents on the photo — not painted geometric zones.';

  if (!sector) return base;
  const s = sector.toLowerCase();
  const isPhotoLed = intensityLevel === 'photo_first' || intensityLevel === 'elegant_light';

  if (s.includes('beach') || s.includes('club') || s.includes('nightclub')) {
    if (intensityLevel === 'photo_first') {
      return `${base} SECTOR STYLE (beach club — photo-first): Sun-washed Aegean restraint. The venue photograph IS the design — warm natural tones, zero poster energy. NO diagonal cuts, NO neon blocks, NO event-card layout. Think global luxury beach club Instagram — understated, never carnival.`;
    }
    if (intensityLevel === 'elegant_light' || intensityLevel === 'balanced' || isPhotoLed) {
      return `${base} SECTOR STYLE (beach club — global premium): Warm coastal editorial minimalism. Soft bottom scrim or quiet corner type, refined headline — NOT party poster, NOT split diagonal, NOT neon blocks, NOT event-card layout. Think Scorpios / Nobu / Aman social — quiet luxury, award-level restraint.`;
    }
    // designed / bold_editorial only — still avoid carnival poster language
    return `${base} SECTOR STYLE (beach club — designed): Confident editorial campaign, still photo-led. Brand-color accents as thin panels or type color — never full-bleed neon. Large refined display type, high contrast, luxury beach club lookbook energy — not festival flyer.`;
  }
  if (s.includes('restaurant') || s.includes('fine_dining') || s.includes('gastro')) {
    return `${base} SECTOR STYLE (fine dining/restaurant): Elegant restraint. Use thin serif or modern didone headline, generous white/cream space, a single fine accent line in the brand accent color. Minimal decorative elements — let the food photography speak. Think Michelin guide meets Condé Nast Traveller ad.`;
  }
  if (s.includes('cafe') || s.includes('coffee') || s.includes('bakery') || s.includes('brunch')) {
    return `${base} SECTOR STYLE (café/bakery): Warm, approachable, artisanal feel. Rounded sans or hand-drawn script on the photo, soft earth accents, light illustrative touches — never kraft cardboard paint slabs. Think indie café lookbook, not menu-board Canva.`;
  }
  if (s.includes('hotel') || s.includes('resort') || s.includes('spa')) {
    return `${base} SECTOR STYLE (luxury hotel/spa): Serene sophistication. Ultra-light serif, expansive negative space, muted gold or champagne accents. Thin hairline dividers, no heavy blocks. Breathing room everywhere. Think Four Seasons brand book meets Wallpaper* magazine.`;
  }
  if (s.includes('bar') || s.includes('cocktail') || s.includes('drink') || s.includes('pub')) {
    return `${base} SECTOR STYLE (bar/cocktail): Moody, vibrant, nightlife energy. Bold display type with character (retro, neon, art-deco), dark backgrounds with jewel-tone accents (amber, emerald, deep purple). Decorative: citrus slices, ice textures, liquid drips as subtle motifs. Think speakeasy menu card meets cocktail book cover.`;
  }
  if (s.includes('fitness') || s.includes('gym') || s.includes('sport')) {
    return `${base} SECTOR STYLE (fitness/gym): High-energy, bold, dynamic. Heavy black condensed type, angular slash cuts, neon accent highlights on dark. Geometric patterns, motion blur effects on graphics only. Think Nike campaign meets Men's Health cover.`;
  }
  if (s.includes('beauty') || s.includes('salon') || s.includes('hair') || s.includes('nail')) {
    return `${base} SECTOR STYLE (beauty salon): Feminine elegance with modern edge. Mix of thin script + clean sans, soft gradient panels (blush, lavender, champagne), delicate floral or abstract organic shapes. Think Glossier brand meets Vogue Beauty editorial.`;
  }
  if (s.includes('fashion') || s.includes('boutique') || s.includes('clothing')) {
    return `${base} SECTOR STYLE (fashion): High-fashion editorial. All-caps tracking headline, stark black-and-white with one accent pop, asymmetric layout, generous crop. Think Zara campaign meets i-D magazine spread.`;
  }
  if (s.includes('yoga') || s.includes('wellness') || s.includes('meditation')) {
    return `${base} SECTOR STYLE (wellness/yoga): Mindful calm. Light, airy, breathing space. Thin rounded sans headline, pastel or natural earth palette panels, organic curved shapes (not geometric). Think Headspace app meets wellness retreat brochure.`;
  }
  if (s.includes('real_estate') || s.includes('architecture')) {
    return `${base} SECTOR STYLE (real estate/architecture): Clean modernism. Geometric grid, thin uppercase sans-serif, monochrome + one metallic accent. Architectural line elements, structured negative space. Think AD magazine meets luxury property brochure.`;
  }
  if (s.includes('product') || s.includes('shop') || s.includes('retail') || s.includes('local_products')) {
    return `${base} SECTOR STYLE (product/retail): Product-forward, boutique feel. Clean modern sans headline, soft shadow panels, lifestyle color blocks that complement the product. Minimal decoration — let the product be the star. Think premium DTC brand meets Instagram shopping post.`;
  }
  return base;
}

/** Canvas label is driven by channel mode — story/reel never inherit feed 4:5 wording. */
function designCardAspectLabel(mode: DesignCardMode, aspectRatio?: AspectRatio): string {
  if (mode === 'story' || mode === 'reel') {
    return '1080×1920 vertical portrait frame (9:16 aspect ratio)';
  }
  if (aspectRatio === '1:1') return 'square 1:1 feed post (1080×1080)';
  return 'portrait 4:5 feed post (1080×1350)';
}

/** Boutique-agency reference bar — class, not template SaaS energy. */
function resolveAgencyReferenceBar(sector?: string, premiumVenue?: boolean): string {
  const s = (sector ?? '').toLowerCase();
  if (s.includes('beach') || s.includes('club') || s.includes('nightclub')) {
    return 'REF BAR: Scorpios / Nobu / Aman — quiet luxury coastal.';
  }
  if (s.includes('restaurant') || s.includes('fine_dining') || s.includes('gastro') || s.includes('cafe')) {
    return 'REF BAR: Michelin / Condé Nast Traveller — editorial venue.';
  }
  if (s.includes('hotel') || s.includes('resort') || s.includes('spa')) {
    return 'REF BAR: Four Seasons / Wallpaper* — serene hospitality.';
  }
  if (s.includes('bar') || s.includes('cocktail')) {
    return 'REF BAR: speakeasy cocktail lookbook — moody, crafted.';
  }
  if (s.includes('beauty') || s.includes('salon') || s.includes('fashion') || s.includes('boutique')) {
    return 'REF BAR: Glossier / Vogue Beauty — fashion-editorial.';
  }
  if (s.includes('product') || s.includes('shop') || s.includes('retail') || s.includes('local_products')) {
    return 'REF BAR: Aesop / premium DTC — product hero restraint.';
  }
  if (premiumVenue) {
    return 'REF BAR: boutique agency portfolio — understated, brand-true.';
  }
  return 'REF BAR: boutique social agency — hand-crafted, never template pack.';
}

/**
 * Image-model opener: boutique AD + concrete deliverable (craft over roleplay).
 * Keep short — creative brief must leave room for HARD CONTRACTS after finalizeFalPrompt trim.
 */
function buildAwardWinningArtDirectorOpener(input: {
  mode: DesignCardMode;
  brand: string;
  sector?: string;
  aspect: string;
  premiumVenue: boolean;
}): string {
  const { mode, brand, sector, aspect, premiumVenue } = input;
  const deliverable = mode === 'story'
    ? `Instagram Story design (${aspect})`
    : mode === 'reel'
      ? `Instagram Reel cover (${aspect})`
      : `Instagram feed post (${aspect})`;
  const craft = mode === 'story'
    ? 'Thumb-readable in 1s; photo+type inseparable.'
    : mode === 'reel'
      ? 'Motion-ready frozen headline; photo-led.'
      : 'Win the feed thumbnail before the caption.';

  return [
    `Boutique social-agency Art Director brief for ${brand}${sector ? ` (${sector})` : ''}.`,
    `Create one finished ${deliverable}. ${craft}`,
    resolveAgencyReferenceBar(sector, premiumVenue),
    premiumVenue ? 'Quiet luxury.' : 'Portfolio piece, not template SaaS.',
  ].join(' ');
}

/**
 * Agency-grade creative brief — craft first (REF / TYPE / SPACE / TASTE).
 * Kept compact so HARD CONTRACTS + intensity survive finalizeFalPrompt trim.
 */
export function buildCreativeDesignBrief(input: {
  mode: DesignCardMode;
  brand: string;
  sector?: string;
  aspect: string;
  premiumVenue: boolean;
  vibe: TypographyVibe;
  visualDnaTone?: string;
  briefMood?: string;
  sceneHint?: string;
  designIntensityLevel?: FalDesignIntensityLevel;
  headline?: string;
}): string {
  const opener = buildAwardWinningArtDirectorOpener({
    mode: input.mode,
    brand: input.brand,
    sector: input.sector,
    aspect: input.aspect,
    premiumVenue: input.premiumVenue,
  });
  const vibeSpec = getVibePromptSpec(input.vibe);
  const dna = input.visualDnaTone?.trim()
    ? `Brand DNA: ${input.visualDnaTone.trim().slice(0, 100)}.`
    : '';
  const mood = (input.briefMood || input.sceneHint)?.trim()
    ? `Mood: ${(input.briefMood || input.sceneHint)!.trim().slice(0, 90)}.`
    : '';
  const level = input.designIntensityLevel ?? 'elegant_light';
  const campaignOk = level === 'designed' || level === 'bold_editorial';
  const craftOk = campaignOk || level === 'balanced';
  const boldOk = level === 'bold_editorial';
  const oneIdea = input.headline?.trim()
    ? `ONE IDEA: "${input.headline.trim().slice(0, 64)}" — silence everything else.`
    : 'ONE IDEA: one clear message only.';

  const typeCraft = boldOk
    ? 'TYPE CRAFT: oversized custom-feel display unique to this brand; one family; never system sans; never clip.'
    : campaignOk
      ? 'TYPE CRAFT: bold designer display with clear hierarchy for THIS brand+slot; never centered Arial on a paint slab.'
      : craftOk
        ? 'TYPE CRAFT: refined display inside a light brand lockup; never default UI sans watermark.'
        : 'TYPE CRAFT: refined brand-drawn display; optical kerning; never default UI sans.';

  const spaceCraft = craftOk
    ? 'SPACE CRAFT: brand type/accents + clear photo hero; one eye path; no cluttered sandwich zones; no stock geometry kits.'
    : 'SPACE CRAFT: 30–40% empty air; one eye path; cut optional elements.';

  const photoType = boldOk
    ? 'PHOTO×TYPE: magazine-cover energy — oversized brand type with a clear photo window. FORBIDDEN: opaque header/footer sandwich, plain photo+caption, and generic rail/L geometry kits.'
    : campaignOk
      ? 'PHOTO×TYPE: brand+slot craft (type-led editorial, soft scrim/rules, small accents) with a clear gallery photo. FORBIDDEN: paint over the photo; FORBIDDEN: Canva sandwich; FORBIDDEN: stock rail/L/diagonal kits.'
      : craftOk
        ? 'PHOTO×TYPE: light brand zones (scrim / corner accent / rules) with photo clear. Plain photo+caption = fail.'
        : 'PHOTO×TYPE: type on found surface or tiny clear zone — never painted rectangle covering the hero subject.';

  const tasteFail = craftOk
    ? 'TASTE FAIL: text escaping its zone; covering glassware/faces/product; plain photo+caption; Canva sandwich; stock rail/L geometry; sticker CTA; meta labels (STORY/REEL/POST).'
    : 'TASTE FAIL: color-band ≥25%; system-sans; sticker CTA; carnival gradient; dual focus; template-pack; meta labels (STORY/REEL/POST).';

  return [
    '═══ CREATIVE BRIEF ═══',
    opener,
    oneIdea,
    `Vibe: ${input.vibe.replace(/_/g, ' ')} — ${vibeSpec.styleDirective.slice(0, 70)}`,
    dna,
    mood,
    typeCraft,
    spaceCraft,
    photoType,
    tasteFail,
  ].filter(Boolean).join(' ');
}

function buildDesignedDesignCardPrompt(
  input: DesignCardPromptInput,
  mode: DesignCardMode,
): string {
  const spec = getVibePromptSpec(input.vibe);
  const isReel = mode === 'reel';
  const isStory = mode === 'story';
  const isVertical = isStory || isReel || input.aspectRatio === '9:16';
  const aspect = designCardAspectLabel(mode, input.aspectRatio);

  const brand = input.brandName?.trim() || 'the brand';
  const sector = input.sector?.trim();
  const layoutLanguage = resolveBrandLayoutLanguage({
    sector: sector ?? '',
    visualDnaTone: input.visualDnaTone,
    typographyVibe: input.vibe,
  });
  // Intensity from caller / brand parameters — DNA only shapes craft allowlist.
  const intensityLevel = input.designIntensityLevel ?? 'elegant_light';
  const intensityMode = resolveFalDesignIntensityMode(
    isStory || isReel ? '9:16' : input.aspectRatio,
    isReel || isStory,
  );

  const premiumVenue = isPremiumVenueSector(sector);
  const creativeBrief = buildCreativeDesignBrief({
    mode,
    brand,
    sector,
    aspect,
    premiumVenue,
    vibe: input.vibe,
    visualDnaTone: input.visualDnaTone,
    briefMood: input.briefMood,
    sceneHint: input.sceneHint,
    designIntensityLevel: intensityLevel,
    headline: input.headline,
  });

  const captionAnchor = (input.caption ?? '').trim().slice(0, 220);
  const captionMessageLock = captionAnchor
    ? `CAPTION MESSAGE LOCK: The Instagram caption for this post is: "${captionAnchor}". Typography, mood, and graphic energy must support THIS message. Never invent a different topic (e.g. kitchen/menu copy for a DJ/nightlife caption, nightlife copy for a food caption, or plated-meat heroes for a cocktail caption). Never paint calendar/signal labels like season names, "15 Temmuz", "plaj/havuz", or internal strategy phrases — ONLY the contracted headline/subtitle below.`
    : '';
  const designHarmonyLock = [
    'DESIGN HARMONY LOCK (mandatory): Photo subject, on-canvas headline, supporting line, logo zone, and color craft must read as ONE boutique-agency composition.',
    'The hero photo MUST depict the same topic as the headline/caption (cocktail post → drink/glass; food post → plated food; DJ → nightlife — never mix).',
    'Paint the HEADLINE string EXACTLY as contracted — do not invent romantic fillers ("özlemle", "sizi bekliyoruz") or brand-name slogans.',
    'Logo: official mark only in its reserved quiet corner; never compete with the headline or cover the product hero.',
    'Typography hierarchy: one dominant punchline, optional short support — not two competing poster slogans.',
  ].join(' ');
  const premiumBar = premiumVenue
    ? 'PREMIUM BAR: Global luxury hospitality Instagram standard — generous breathing room, intentional type hierarchy, photo as hero, zero clutter, zero emoji-as-design, zero festival flyer energy. If it could belong to a mid-tier Canva template pack, reject that look.'
    : 'PREMIUM BAR: Agency-grade Instagram design — intentional hierarchy, brand-true color, no amateur system-font dump.';

  const occasion = input.occasion
    ? `OCCASION — ${input.occasion.name}: honour its spirit${input.occasion.mood ? ` (${input.occasion.mood.slice(0, 90)})` : ''} tastefully WOVEN INTO ${brand}'s palette and visual world — symbolic, subtle accents only. Never clashing holiday-cliché colors, literal flags, balloons, or stock holiday graphics.`
    : '';

  const sectorDesignLanguage = resolveSectorDesignLanguage(sector, mode, intensityLevel);

  const intensityDirectives = resolveFalDesignIntensityDirectives(intensityLevel, intensityMode);

  const photoRules = intensityDirectives.photoRules;

  const canvasChannel = isStory ? 'story' : isReel ? 'reel' : 'feed_post';
  const overlayCopy = resolveFalOverlayCopy({
    headline: input.headline,
    cta: input.subtitle,
    caption: input.caption,
    channel: canvasChannel,
    lockIdeationCopy: input.captionAwareHeadline !== true,
    // Mission/calendar punchlines are authoritative — never rebias to caption stubs.
    preservePlannedHeadline: input.captionAwareHeadline !== true,
  });
  const safeHeadline = overlayCopy.headline;
  const safeSubtitle = overlayCopy.subtitle;

  const logoChannel: 'feed_post' | 'reel' | 'story' = isStory
    ? 'story'
    : isReel
      ? 'reel'
      : isVertical
        ? 'story'
        : 'feed_post';
  const brandMark = resolveBrandMarkMode({
    logoUrl: input.logoUrl,
    brandName: input.brandName,
    wantBrandMark: true,
  });
  const logoProvided = brandMark.mode === 'official_logo';
  const brandMarkInstruction = buildFalLogoPlacementContract({
    logoProvided,
    brandName: input.brandName,
    channel: logoChannel,
    hasPhotoHero: true,
    placement: input.logoPlacement ?? null,
  });
  const logoRefNote = logoProvided
    ? 'LOGO ASSET: Official logo is composited after generation — leave the reserved logo zone empty; do not paint any brand mark or type the brand name in this image.'
    : '';

  const onCanvasTextContract = buildFalOnCanvasTextContract({
    headline: safeHeadline,
    subtitle: safeSubtitle,
    brandName: brandMark.typeWordmark ? input.brandName : undefined,
    logoProvided,
    channel: logoChannel,
  });

  const artDirectionBlock = input.artDirection
    ? `ART DIRECTION (brief-specific): ${input.artDirection.slice(0, 250)}`
    : '';

  const premiumTypography = buildIntensityTypographyBlock({
    level: intensityLevel,
    vibe: input.vibe,
    headline: safeHeadline,
    subtitle: safeSubtitle,
    fontPersonality: input.fontPersonality,
    headingFont: input.headingFont,
    bodyFont: input.bodyFont,
  });

  const logoBlock = [brandMark.xorDirective, logoRefNote, brandMarkInstruction]
    .filter(Boolean)
    .join(' ');
  // Vertical prompts need more room: intensity lock + text contracts both must survive.
  // Feed posts get a slightly higher budget so brand recipe + creative brief can coexist
  // with LAYOUT LOCK / TYPE CONTAINMENT / HARD CONTRACTS.
  const promptLimit = (isReel || isStory || input.aspectRatio === '9:16' ? 4800 : 4300)
    + (input.logoUrl ? 900 : 0)
    + 320
    + 220;

  // Brand slot recipe is product-critical for template library uniqueness — never leave it
  // only in optionalTail (tail often gets zero budget when intensity+contracts fill the limit).
  const brandRecipeRaw = (input.brandDirectives ?? []).find((d) =>
    d.includes('BRAND SLOT DESIGN RECIPE'),
  );
  const brandDirectivesRest = (input.brandDirectives ?? []).filter(
    (d) => !d.includes('BRAND SLOT DESIGN RECIPE'),
  );
  const brandRecipeLock = brandRecipeRaw
    ? truncateAtWordBoundary(brandRecipeRaw.replace(/\s+/g, ' ').trim(), 480)
    : '';
  const recipeReserve = brandRecipeLock ? Math.min(brandRecipeLock.length + 1, 481) : 0;

  const needsCraftLock = shouldApplyCraftLayoutFamily(intensityLevel, layoutLanguage);
  const layoutFamily = needsCraftLock
    ? (input.layoutFamily
      ?? resolveDesignCraftLayoutFamily(
        input.layoutFamilySeed
          ?? input.brandDirectives?.find((d) => d.startsWith('SLOT:'))?.slice(5)
          ?? `${input.brandName ?? 'brand'}:${intensityLevel}:${mode}:${input.headline}`,
        resolveCraftAllowlistForPack(layoutLanguage),
      ))
    : null;
  const layoutLock = layoutFamily
    ? `LAYOUT LOCK: use ONLY "${layoutFamily}" — ${describeDesignCraftLayoutFamily(layoutFamily)}`
    : '';
  const typeContainment = needsCraftLock
    ? 'TYPE CONTAINMENT (MANDATORY): Every letter of headline/subtitle/brand mark must sit fully inside its plate, rail, L, mat, or soft scrim — ≥8% padding from that shape\'s edges. FORBIDDEN: text straddling a hard color edge onto the photo window (amateur overflow). If copy is long, shrink type or widen the plate — never clip or spill.'
    : '';
  const photoWindowCompose = needsCraftLock ? FAL_PHOTO_WINDOW_COMPOSE_DIRECTIVE : '';

  // Protected head — never trimmed. Layout families used to die at the end of finalizeFalPrompt.
  const layoutLanguageLock = buildBrandLayoutLanguageDirectives(layoutLanguage).join(' ');
  const intensityLock = [
    layoutLanguageLock,
    intensityDirectives.priorityBlock,
    layoutLock,
    typeContainment,
    photoWindowCompose,
    ...photoRules,
    ...intensityDirectives.forbiddenLayouts,
    intensityDirectives.typographyAnchor,
    intensityDirectives.layoutNote,
    intensityDirectives.foundSurfaceAnchor,
  ].filter(Boolean).join(' ');

  const hardContracts = [
    '═══ HARD CONTRACTS ═══',
    onCanvasTextContract,
    FAL_SUBJECT_CLEARANCE_DIRECTIVE,
    captionMessageLock,
    designHarmonyLock,
    logoBlock,
    isVertical
      ? 'SAFE ZONE: keep all text/logos inside inner 85%; protect top 12% / bottom 15% from UI overlap; shrink type before clipping.'
      : 'SAFE ZONE: keep all text/logos inside inner 85% (7.5% edge margin); headline/CTA inside central 4:5 crop.',
    needsCraftLock
      ? (isVertical
        ? 'PHOTO FRAMING (9:16): After craft+type zones are reserved, contain the FULL gallery photo in the leftover photo window — no crop of hero subjects; never paint over the photo.'
        : 'PHOTO FRAMING (4:5): After craft+type zones are reserved, contain the FULL gallery photo in the leftover photo window — no crop of hero subjects; never paint slabs over the photo.')
      : (isVertical
        ? 'PHOTO FRAMING (9:16): Full-bleed gallery photo preferred; never invent brand-color letterbox bands as the design.'
        : 'PHOTO FRAMING (4:5): Show the entire gallery photo (contain); soft letterbox only if needed — never paint slabs as composition.'),
    intensityLevel === 'designed' || intensityLevel === 'bold_editorial'
      ? `BRAND COLORS: ${input.brandColors.primary} + ${input.brandColors.accent} for craft zones/type — never full-width opaque paint slabs that swallow the photo window.`
      : `BRAND COLORS: ${input.brandColors.primary} + ${input.brandColors.accent} for headline/scrims — never full-width opaque header slabs.`,
  ].filter(Boolean).join(' ');

  // Occasion + sector are brand-critical — keep a compact form in the protected head.
  const occasionLock = occasion ? occasion.slice(0, 220) : '';
  const sectorLock = sectorDesignLanguage ? sectorDesignLanguage.slice(0, 280) : '';

  const label = isStory ? 'fal-designer-story' : 'fal-designer';
  const coreLock = [intensityLock, hardContracts].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  // Prefer: creative brief → brand recipe → intensity/layout → hard contracts → occasion/sector.
  // On overflow: never cut intensity/contracts from the end — trim soft brand context instead.
  // Brand recipe keeps priority over creative brief / occasion when soft budget is tight.
  let protectedHead = [
    creativeBrief,
    brandRecipeLock,
    intensityLock,
    hardContracts,
    occasionLock,
    sectorLock,
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (protectedHead.length > promptLimit) {
    const coreBudget = Math.max(1200, promptLimit - recipeReserve);
    if (coreLock.length >= coreBudget) {
      const trimmedCore = truncateAtWordBoundary(coreLock, coreBudget);
      protectedHead = [trimmedCore, brandRecipeLock].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      if (protectedHead.length > promptLimit) {
        protectedHead = truncateAtWordBoundary(protectedHead, promptLimit);
      }
      console.warn(
        `[fal-prompt:${label}] core intensity+contracts alone ${coreLock.length}→${trimmedCore.length}; `
        + `reserved recipe ${recipeReserve} (limit ${promptLimit})`,
      );
    } else {
      const softBudget = promptLimit - coreLock.length - 1;
      const soft = [brandRecipeLock, creativeBrief, occasionLock, sectorLock]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      const trimmedSoft = truncateAtWordBoundary(soft, softBudget);
      // Keep intensity immediately after whatever soft prefix fits.
      protectedHead = [trimmedSoft, coreLock].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      console.warn(
        `[fal-prompt:${label}] trimmed soft context ${soft.length}→${trimmedSoft.length}; `
        + `kept intensity+contracts ${coreLock.length} (limit ${promptLimit})`,
      );
    }
  }

  // Optional tail — trimmed first when over budget.
  const optionalTail = [
    ...brandDirectivesRest,
    ...premiumTypography,
    premiumBar,
    input.sceneHint ? `Scene emphasis (photo zone only — do not repaint): ${input.sceneHint.slice(0, 120)}.` : '',
    artDirectionBlock,
    spec.colorUsage(input.brandColors.primary, input.brandColors.accent),
    `FINISH: Looks like ${brand}'s boutique Art Director shipped it — modern Instagram craft, ready to publish.`,
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  const tailBudget = Math.max(0, promptLimit - protectedHead.length - 1);
  const trimmedTail = tailBudget > 0
    ? truncateAtWordBoundary(optionalTail, tailBudget)
    : '';
  if (optionalTail.length > trimmedTail.length) {
    console.warn(
      `[fal-prompt:${label}] protected-head kept ${protectedHead.length} chars; `
      + `trimmed optional tail ${optionalTail.length}→${trimmedTail.length} (limit ${promptLimit})`,
    );
  }

  let prompt = [protectedHead, trimmedTail].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (intensityLevel === 'photo_first') {
    prompt = harmonizePhotoFirstDesignPrompt(prompt, {
      vibe: input.vibe,
      subtitle: input.subtitle,
      brandName: brandMark.typeWordmark ? input.brandName : undefined,
      logoProvided,
      channel: logoChannel,
    });
  }
  return prompt;
}

/**
 * Strip conflicting typography/sector blocks when photo_first intensity is active.
 * Prevents "minimal caption" + "bold headline block" fighting in the same prompt.
 */
export function harmonizePhotoFirstDesignPrompt(
  prompt: string,
  input: {
    vibe: TypographyVibe;
    subtitle?: string;
    brandName?: string;
    logoProvided?: boolean;
    channel?: FalLogoCanvasChannel;
  },
): string {
  const withoutLegacyTypography = prompt
    .replace(
      /TYPOGRAPHY STANDARD \(MANDATORY\):[\s\S]*?(?=SAFE ZONE \(MANDATORY\):|BRAND COLORS:|═══ CRITICAL TEXT LOCK ═══|$)/,
      '',
    )
    .replace(
      /SECTOR STYLE \(beach\/night club\):[\s\S]*?(?=PHOTO HERO \(MAXIMUM\):|PHOTO FIDELITY \(MAXIMUM\):|PHOTO HERO:|PHOTO FIDELITY:|TYPOGRAPHY \(photo-first\):)/,
      'SECTOR STYLE (beach club): Sun-washed coastal restraint — warm natural photo hero, subtle brand accents only. ',
    )
    .replace(/\s+/g, ' ')
    .trim();

  const harmonized = buildHarmonizedPhotoFirstTypographyBlock(input).join(' ');
  return `${withoutLegacyTypography} ${harmonized}`.replace(/\s+/g, ' ').trim();
}

export function buildHarmonizedPhotoFirstTypographyBlock(input: {
  vibe: TypographyVibe;
  subtitle?: string;
  brandName?: string;
  /** When true, official logo is composited — never type the brand name. */
  logoProvided?: boolean;
  channel?: FalLogoCanvasChannel;
}): string[] {
  const spec = getVibePromptSpec(input.vibe);
  const lines = [
    'TYPOGRAPHY (photo-first): Keep the gallery photo as absolute hero — 85–95% of frame untouched.',
    `If any text appears: ONE small designed tagline only, max 6 words, in ${spec.fontDescription}.`,
    `Style energy: ${spec.styleDirective} — subtle corner placement or thin scrim, never poster-scale blocks.`,
    'Do NOT render a large headline block. No event-card layout. No date/time baked into the image.',
  ];
  if (input.subtitle?.trim()) {
    lines.push(
      `Preferred tagline text (exact): "${input.subtitle.trim().slice(0, 48)}" — small, refined, vibe-aligned.`,
    );
  }
  if (input.logoProvided) {
    lines.push(
      'BRAND MARK XOR: official logo composited later — leave a quiet corner empty; do NOT type or invent a brand wordmark.',
    );
  } else if (input.brandName?.trim()) {
    const mark = resolveBrandMarkLockup(input.brandName);
    if (mark) {
      lines.push(
        buildFalBrandMarkPlacementDirective({
          brandName: input.brandName,
          channel: input.channel ?? 'feed_post',
        }),
      );
    }
  }
  return lines;
}

export function detectFalPromptConflicts(
  prompt: string,
  intensity: FalDesignIntensityLevel,
): string[] {
  const conflicts: string[] = [];
  const wantsSmallType = /small, refined caption line only|minimal corner caption|tiny brand mark only/i.test(prompt);
  const wantsBoldHeadline = /Headline "[^"]+" in [^.]+\./i.test(prompt);
  const wantsLargeBlocks = /no large blocks|no poster blocks/i.test(prompt);
  const hasSectorNightEnergy = /neon-glow accents|nightlife energy|speakeasy/i.test(prompt);

  if (intensity === 'photo_first' && wantsSmallType && wantsBoldHeadline) {
    conflicts.push(
      'photo_first asks for minimal caption-only type, but TYPOGRAPHY STANDARD demands full custom headline letterforms.',
    );
  }
  if (intensity === 'photo_first' && wantsLargeBlocks && /Supporting tagline/i.test(prompt)) {
    conflicts.push(
      'photo_first forbids large text blocks, but prompt still instructs a DESIGNED secondary tagline line.',
    );
  }
  if (hasSectorNightEnergy && /warm_coastal|handwritten|coastal typography/i.test(prompt)) {
    conflicts.push(
      'Sector style block pushes nightlife/neon energy while resolved vibe is coastal/handwritten.',
    );
  }
  return conflicts;
}

/**
 * Designed feed post via fal Ideogram V4 typography (4:5 / 1:1).
 * Thin wrapper over produceFalDesignerStill with feed-post defaults.
 */
export async function produceFalDesignedPostStill(
  input: Omit<FalDesignerInput, 'aspectRatio'> & { aspectRatio?: AspectRatio },
): Promise<FalDesignerStillResult> {
  return produceFalDesignerStill({
    ...input,
    aspectRatio: input.aspectRatio ?? '4:5',
    backgroundStyle: resolveBackgroundStyle(input.backgroundStyle, input.referencePhotoUrl),
  });
}

/**
 * Premium still — Ideogram V4 + text validation + Grafiker QA.
 *
 * When `input.backgroundOnlyPlate` is true, generates a pure atmospheric plate
 * (zero text) for use as a Kling/Luma video start frame. Skips GPT grounded
 * edit, text validation, and Grafiker QA.
 */
export async function produceFalDesignerStill(
  input: FalDesignerInput,
): Promise<FalDesignerStillResult> {
  const backgroundStyle = resolveBackgroundStyle(input.backgroundStyle, input.referencePhotoUrl);

  // ── Background-only plate path ────────────────────────────────────────────
  // Used by produceFalDesignerVideo: generate a clean atmospheric Ideogram frame
  // with no baked text, so Kling animates pure visuals.
  if (input.backgroundOnlyPlate) {
    const plate = await generateTypographyDesignWithRetry({
      headline: input.headline, // passed for context/logging only; prompt ignores it
      vibe: input.vibe,
      brandColors: input.brandColors,
      backgroundStyle,
      aspectRatio: input.aspectRatio ?? '9:16',
      sceneHint: input.sceneHint,
      brandDirectives: input.brandDirectives,
      visualDnaTone: input.visualDnaTone,
      backgroundOnly: true,
    });
    console.log(
      `[fal-designer] background plate: vibe=${input.vibe} model=${plate.model}`,
    );
    return {
      imageUrl: plate.imageUrl,
      typographyModel: `${plate.model}:background-plate`,
      vibe: input.vibe,
      grafikerScore: null,
      grafikerPass: true,
      textValidated: false,
      retryCount: plate.retryCount,
      resolvedHeadline: input.headline,
    };
  }

  // ── Full typography still path ─────────────────────────────────────────────
  if (input.templatePreviewMode && !input.referencePhotoUrl?.trim()) {
    const previewChannel = resolveFalCanvasChannel({
      pipeline: input.pipeline,
      aspectRatio: input.aspectRatio,
    });
    const overlayCopy = resolveFalOverlayCopy({
      headline: input.headline,
      cta: input.subtitle,
      caption: input.caption,
      channel: previewChannel,
      lockIdeationCopy: true,
    });
    const displayHeadline = overlayCopy.headline;
    const captionSubtitle = overlayCopy.subtitle;
    if (!displayHeadline) {
      throw new Error('template preview: no valid overlay headline');
    }
    const ideogramBackground = resolveIdeogramBackgroundStyle(
      backgroundStyle,
      input.referencePhotoUrl,
    );
    const typoResult = await generateTypographyDesignWithRetry({
      headline: displayHeadline,
      subtitle: captionSubtitle?.slice(0, 60),
      vibe: input.vibe,
      brandColors: input.brandColors,
      backgroundStyle: ideogramBackground,
      aspectRatio: input.aspectRatio,
      brandName: input.brandName,
      logoUrl: input.logoUrl,
      logoPlacement: input.logoPlacement,
      sceneHint: input.sceneHint,
      brandDirectives: input.brandDirectives,
      visualDnaTone: input.visualDnaTone,
      storyDesignMode: input.aspectRatio === '9:16',
      reelDesignMode: input.aspectRatio === '9:16' && input.pipeline === 'fal_reel',
    }, { maxRetries: 0 });
    const previewResult: FalDesignerStillResult = {
      imageUrl: typoResult.imageUrl,
      typographyModel: `${typoResult.model}:template-preview`,
      vibe: input.vibe,
      grafikerScore: null,
      grafikerPass: true,
      textValidated: false,
      retryCount: typoResult.retryCount,
      resolvedHeadline: displayHeadline,
    };
    return finalizeFalStillWithOfficialLogo(previewResult, input);
  }

  const maxAttempts = Math.min(2, Math.max(1, (input.grafikerMaxRetries ?? 1) + 1));
  let last: FalDesignerStillResult | null = null;

  const isVerticalVideo = input.aspectRatio === '9:16';
  const canvasChannel = resolveFalCanvasChannel({
    pipeline: input.pipeline,
    aspectRatio: input.aspectRatio,
  });
  const groundedOnly = requiresGroundedGalleryDesign(input);

  if (input.pipeline === 'fal_story' && !input.referencePhotoUrl?.trim()) {
    throw new Error(
      'fal_story: gallery photo required — story design must be grounded on a real venue/product image',
    );
  }

  const useCaptionAware = input.captionAwareHeadline === true
    && !groundedOnly
    && Boolean(input.caption);

  const overlayCopy = resolveFalOverlayCopy({
    headline: input.headline,
    cta: input.subtitle,
    caption: input.caption,
    channel: canvasChannel,
    lockIdeationCopy: !useCaptionAware,
  });
  const displayHeadline = overlayCopy.headline;
  const captionSubtitle = overlayCopy.subtitle;

  if (useCaptionAware) {
    console.log(
      `[fal-designer] Caption-aware overlay: headline="${displayHeadline.slice(0, 40)}"`,
    );
  } else {
    console.log(
      `[fal-designer] Ideation overlay lock: headline="${displayHeadline.slice(0, 40)}"` +
      (captionSubtitle ? ` subtitle="${captionSubtitle.slice(0, 32)}"` : ''),
    );
  }

  if (!displayHeadline) {
    throw new Error(
      'fal designer: no valid overlay headline after sanitization — slot withheld',
    );
  }

  const groundedRefUrls = [
    input.referencePhotoUrl,
    ...(input.brandReferenceImageUrls ?? []),
  ].filter((url, index, arr): url is string =>
    Boolean(url) && arr.indexOf(url) === index,
  ).slice(0, 2);


  if (input.workspaceId && groundedRefUrls.length > 0) {
    // Prefer the photo-grounded result: it composes the design ON the real
    // gallery photo (the brand's venue/product), which is far more brand-faithful
    // than a synthetic Ideogram background. Retry once before falling back so a
    // single weak Grafiker score doesn't drop us to a photo-less design.
    const groundedMaxAttempts = groundedOnly ? 3 : 2;
    try {
      const { generateDesignedPostImage } = await import('@/app/api/auto-produce/handlers/image-generators');
      const buildPrompt = input.pipeline === 'fal_story'
        ? buildDesignedStoryDesignCardPrompt
        : isVerticalVideo && input.pipeline === 'fal_reel'
          ? buildDesignedVideoReelDesignCardPrompt
          : isVerticalVideo
            ? buildDesignedStoryDesignCardPrompt
            : buildDesignedPostDesignCardPrompt;
      // Template replica: reuse the stored template spec with mission copy
      // swapped — keeps the prompt aligned with the layout reference image.
      let replicaPrompt: string | null = null;
      if (input.templateReplica) {
        const { buildTemplateReplicaPrompt } = await import('@/lib/brand-design-template-production');
        replicaPrompt = buildTemplateReplicaPrompt(input.templateReplica, {
          headline: displayHeadline,
          subtitle: captionSubtitle,
        }, { showSubline: input.templateReplica.showSubline });
      }
      const replicaSublineOff = input.templateReplica?.showSubline === false;
      const groundedPrompt = replicaPrompt ?? buildPrompt({
        vibe: input.vibe,
        headline: displayHeadline,
        subtitle: replicaSublineOff ? undefined : captionSubtitle,
        caption: input.caption,
        sceneHint: input.sceneHint,
        brandColors: input.brandColors,
        brandName: input.brandName,
        sector: input.sector,
        aspectRatio: input.aspectRatio,
        brandDirectives: input.brandDirectives,
        visualDnaTone: input.visualDnaTone,
        logoUrl: input.logoUrl,
        briefMood: input.mood,
        artDirection: input.artDirection,
        designIntensityLevel: input.designIntensityLevel,
        occasion: input.occasion,
        logoPlacement: input.logoPlacement,
      });
      console.log(
        `[fal-designer] grounded edit start: headline="${displayHeadline.slice(0, 40)}" ` +
        `refs=${groundedRefUrls.map((u) => u.split('/').pop()).join(',')} ` +
        `requireGrounded=${Boolean(groundedOnly)}`,
      );
      for (let groundedAttempt = 0; groundedAttempt < groundedMaxAttempts; groundedAttempt++) {
        const groundedUrl = await generateDesignedPostImage({
          workspaceId: input.workspaceId,
          designCardPrompt: groundedPrompt,
          designCardMode: canvasChannel === 'reel' ? 'reel' : 'post',
          headline: displayHeadline,
          caption: input.caption ?? input.subtitle ?? displayHeadline,
          referenceImageUrls: groundedRefUrls,
          brandName: input.brandName ?? 'Brand',
          format: input.aspectRatio === '9:16' ? 'story' : 'post',
          location: input.location,
          businessType: input.sector,
          logoUrl: input.logoUrl,
          logoPlacement: input.logoPlacement,
          deferLogoComposite: true,
          overlayColor: input.brandColors.primary,
          backgroundIntent: input.sceneHint,
          templateLayoutImageUrl: input.templateLayoutImageUrl ?? undefined,
        });
        if (!groundedUrl) {
          console.warn(
            `[fal-designer] grounded edit attempt ${groundedAttempt + 1}/${groundedMaxAttempts} returned null`,
          );
          continue;
        }
        const textCheck = await validateFalCanvasText(groundedUrl, {
          headline: displayHeadline,
          subtitle: captionSubtitle,
        });
        if (!textCheck.valid) {
          console.warn(
            `[fal-designer] grounded edit text validation failed attempt ${groundedAttempt + 1}/${groundedMaxAttempts} ` +
            `headline="${displayHeadline}" subtitle="${captionSubtitle ?? ''}" reason=${textCheck.reason ?? 'mismatch'}`,
          );
          continue;
        }
        const grafiker = await reviewDesignedFrame(
          groundedUrl,
          displayHeadline,
          input.aspectRatio === '9:16' ? 'story' : 'poster',
        );
        last = {
          imageUrl: groundedUrl,
          typographyModel: 'gpt-image-1',
          vibe: input.vibe,
          grafikerScore: grafiker.score,
          grafikerPass: grafiker.pass,
          textValidated: true,
          retryCount: groundedAttempt,
          resolvedHeadline: displayHeadline,
        };
        if (grafiker.pass) {
          console.log(
            `[fal-designer] grounded photo edit success: "${displayHeadline.slice(0, 40)}" refs=${groundedRefUrls.length} attempt=${groundedAttempt + 1}`,
          );
          return finalizeFalStillWithOfficialLogo(last, input);
        }
        console.warn(
          `[fal-designer] grounded photo edit grafiker ${grafiker.score ?? '—'}/10 — attempt ${groundedAttempt + 1}/${groundedMaxAttempts}`,
        );
      }
      if (last) {
        // Library template replica: accept best grounded compose — Ideogram would
        // invent a new layout and abandon the approved library shell.
        if (input.templateReplica) {
          console.warn(
            '[fal-designer] template replica grounded compose below Grafiker threshold — keeping grounded result (Ideogram disabled)',
          );
          return finalizeFalStillWithOfficialLogo(last, input);
        }
        console.warn(
          '[fal-designer] grounded photo edit below threshold after retries — falling back to Ideogram',
        );
      }
    } catch (groundedErr) {
      if (input.templateReplica) {
        throw new Error(
          `library template replica grounded compose failed — Ideogram disabled when template is locked: ${
            groundedErr instanceof Error ? groundedErr.message : String(groundedErr)
          }`,
        );
      }
      console.warn(
        '[fal-designer] grounded photo edit failed, falling back to Ideogram:',
        groundedErr instanceof Error ? groundedErr.message : groundedErr,
      );
    }
  }

  if (groundedOnly || input.templateReplica) {
    throw new Error(
      input.templateReplica
        ? 'library template replica: grounded gallery design failed — synthetic Ideogram fallback disabled when a library template is locked'
        : input.pipeline === 'fal_story'
          ? 'fal_story: grounded gallery design failed — synthetic Ideogram fallback disabled for story slots'
          : 'Brand gallery design failed — could not compose the art-director design on the matched venue photo. ' +
            'Synthetic Ideogram fallback disabled when a brand gallery photo is available.',
    );
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const attemptHeadline = shortenFalOverlayForImageRetry(displayHeadline, attempt, canvasChannel);
    if (!attemptHeadline) {
      console.warn(`[fal-designer] Ideogram retry ${attempt + 1}: no complete headline after shortening`);
      continue;
    }

    const ideogramBackground = resolveIdeogramBackgroundStyle(
      backgroundStyle,
      input.referencePhotoUrl,
    );

    const typoResult = await generateTypographyDesignWithRetry({
      headline: attemptHeadline,
      subtitle: attempt === 0 ? captionSubtitle?.slice(0, 60) : undefined,
      vibe: input.vibe,
      brandColors: input.brandColors,
      backgroundStyle: ideogramBackground,
      aspectRatio: input.aspectRatio,
      brandName: input.brandName,
      logoUrl: input.logoUrl,
      logoPlacement: input.logoPlacement,
      sceneHint: input.sceneHint,
      brandDirectives: input.brandDirectives,
      visualDnaTone: input.visualDnaTone,
      reelDesignMode: canvasChannel === 'reel' && isVerticalVideo,
      storyDesignMode: canvasChannel === 'story' && isVerticalVideo,
    }, {
      maxRetries: 1,
      validateFn: async (imageUrl, headline) => {
        const check = await validateFalCanvasText(imageUrl, {
          headline,
          subtitle: attempt === 0 ? captionSubtitle : undefined,
        });
        return check.valid;
      },
    });

    const grafiker = await reviewDesignedFrame(
      typoResult.imageUrl,
      attemptHeadline,
      input.aspectRatio === '9:16' ? 'story' : 'poster',
    );

    last = {
      imageUrl: typoResult.imageUrl,
      typographyModel: typoResult.model,
      vibe: input.vibe,
      grafikerScore: grafiker.score,
      grafikerPass: grafiker.pass,
      textValidated: true,
      retryCount: attempt + typoResult.retryCount,
      resolvedHeadline: displayHeadline,
    };

    if (grafiker.pass) {
      return finalizeFalStillWithOfficialLogo(last, input);
    }
    console.warn(
      `[fal-designer] Grafiker ${grafiker.score ?? '—'}/10 — retry ${attempt + 1}/${maxAttempts}`,
    );
  }

  if (!last || !last.textValidated || !last.grafikerPass) {
    throw new Error('fal designer still failed text/Grafiker quality gate');
  }
  return finalizeFalStillWithOfficialLogo(last, input);
}

/**
 * fal.ai designer video — premium designed card (headline + subtitle + brand system),
 * then Kling locked-composition animation. Not a single-line Remotion-style hook.
 */
export async function produceFalDesignerVideo(input: Omit<FalDesignerInput, 'aspectRatio'> & {
  pipeline: 'fal_story' | 'fal_reel';
}): Promise<FalDesignerVideoResult> {
  const {
    resolveEffectiveReelMotionMode,
    reelRecipeDurationForFal,
  } = await import('@/lib/reel-production-recipe');

  const groundedRequired = input.requireGroundedGallery ?? resolveFalRequireGroundedGallery({
    requireGroundedGallery: false,
    referencePhotoUrl: input.referencePhotoUrl,
    sector: input.sector,
    pipeline: input.pipeline,
  });
  const still = await produceFalDesignerStill({
    ...input,
    aspectRatio: '9:16',
    pipeline: input.pipeline,
    captionAwareHeadline: input.captionAwareHeadline === true,
    backgroundStyle: input.referencePhotoUrl?.trim()
      ? 'photo_overlay'
      : resolveBackgroundStyle(input.backgroundStyle, input.referencePhotoUrl),
    backgroundOnlyPlate: false,
    deferLogoComposite: Boolean(input.logoUrl?.trim()),
    requireGroundedGallery: groundedRequired,
  });

  const recipe = input.pipeline === 'fal_reel' ? (input.reelRecipe ?? null) : null;
  const effectiveMotionMode = recipe
    ? resolveEffectiveReelMotionMode(recipe)
    : 'locked_graphics';
  // photo_plate: I2V the gallery photo (no baked type) → logo composite.
  // Designed still remains the feed cover (imageUrl) — kills frame-3 gibberish.
  const motionSourceUrl = effectiveMotionMode === 'photo_plate'
    && input.referencePhotoUrl?.trim()
    ? input.referencePhotoUrl.trim()
    : still.imageUrl;
  const preserveText = effectiveMotionMode !== 'photo_plate';

  const motionStyle = input.pipeline === 'fal_reel'
    ? (effectiveMotionMode === 'photo_plate'
        ? resolveMotionStyle(input.sector, input.mood)
        : 'social_reel_graphics' as const)
    : resolveMotionStyle(input.sector, input.mood);

  // Kling needs ~4–5 min; short budgets caused timeout→Luma double billing.
  const motionTimeout = input.pipeline === 'fal_reel' ? 360_000 : 180_000;
  const durationSecs = recipe ? reelRecipeDurationForFal(recipe) : 5;

  if (input.skipMotion) {
    console.log(
      `[fal-designer] skipMotion — cover still only (montage/I2V deferred) `
      + `headline="${still.resolvedHeadline ?? input.headline}"`,
    );
    return {
      ...still,
      videoUrl: still.imageUrl,
      motionModel: 'motion_deferred',
      motionStyle,
    };
  }

  let motion: StoryMotionResult;
  try {
    motion = await generateStoryMotionPlateWithRetry({
      imageUrl: motionSourceUrl,
      headline: still.resolvedHeadline ?? input.headline,
      sector: input.sector,
      brandName: input.brandName,
      mood: input.mood,
      style: motionStyle,
      timeoutMs: motionTimeout,
      preserveExistingText: preserveText,
      pipeline: input.pipeline,
      designerMotionCue: input.designerMotionCue,
      productionTier: input.productionTier,
      durationSecs,
    });
  } catch (motionErr) {
    const message = motionErr instanceof Error ? motionErr.message : String(motionErr);
    if (input.pipeline === 'fal_reel') {
      throw new Error(
        `fal reel motion failed after Kling/Luma attempts — will not save PNG as video: ${message}`,
      );
    }
    console.warn(
      `[fal-designer] story motion failed (returning still only): ${message}`,
    );
    return {
      ...still,
      videoUrl: still.imageUrl,
      motionModel: 'still_fallback',
      motionStyle,
    };
  }

  console.log(
    `[fal-designer] designed video: typo=${still.typographyModel} motion=${motion.model} `
    + `mode=${effectiveMotionMode} headline="${still.resolvedHeadline ?? input.headline}"`,
  );

  let finalVideoUrl = motion.videoUrl;
  const logoUrl = input.logoUrl?.trim();
  const shouldCompositeLogo = Boolean(logoUrl)
    && motion.videoUrl.startsWith('http')
    && (recipe?.logoPolicy !== 'baked_allowed' || effectiveMotionMode === 'photo_plate');
  if (shouldCompositeLogo && logoUrl) {
    const videoWithLogo = await compositeOfficialLogoOnVideoUrl({
      videoUrl: motion.videoUrl,
      logoUrl,
      placement: input.logoPlacement ?? null,
      channel: 'reel',
      workspaceId: input.workspaceId,
    });
    if (videoWithLogo.logoApplied) {
      finalVideoUrl = videoWithLogo.videoUrl;
    }
  }

  return {
    ...still,
    videoUrl: finalVideoUrl,
    motionModel: motion.model,
    motionStyle: motion.style,
  };
}
