/**
 * fal.ai Brand Content Designer — Ideogram V4 + Flux
 *
 * Ürettiği içerikler:
 *   - Designed stills  → `fal_designed_post` slotları; tam tipografi + marka
 *     rengi + visual DNA. Ajans kalitesinde feed post.
 *   - Background plates → `backgroundOnly: true` modunda; metinsiz atmosferik
 *     frame — `fal_only_*` veya sinematik video başlangıç noktası.
 *
 * Video slotları (`fal_story`, `fal_reel`) için: tam tipografi still üretilir,
 * ardından Kling locked-composition animasyonu ile metin korunarak premium
 * branded reel/story videosuna dönüştürülür.
 *
 * Remotion ile hiçbir bağlantısı yoktur; tamamen bağımsız fal.ai üretim kanalı.
 */

import type { TypographyVibe, TypographyBackgroundStyle } from '@/types/brand-theme';
import { serverConfig } from './server-config';
import {
  buildFalLogoPlacementContract,
  buildFalOnCanvasTextContract,
  clampFalOverlayHeadlineForCanvas,
  formatFalOnImageHeadlineDirective,
  formatFalOnImageSubtitleDirective,
  isMeaningfulFalOverlayText,
  sanitizeFalOverlayText,
  shortenFalOverlayForImageRetry,
} from './fal-caption-headline';

const FAL_RUN_BASE = 'https://fal.run';
const FAL_QUEUE_BASE = 'https://queue.fal.run';
const FAL_AUTH = (key: string) => ({ Authorization: `Key ${key}` });

const IDEOGRAM_MODEL = () => serverConfig.imageGen.falIdeogramModel;
const FLUX_FALLBACK_MODEL = () => serverConfig.imageGen.falTypographyFallback;

// ── Prompt Templates per Vibe ────────────────────────────────────────────────

export interface VibePromptSpec {
  styleDirective: string;
  fontDescription: string;
  backgroundHint: string;
  colorUsage: (primary: string, accent: string) => string;
}

const VIBE_PROMPTS: Record<TypographyVibe, VibePromptSpec> = {
  bubble_3d: {
    styleDirective: 'Inflated 3D bubble letters with soft rounded puffy letterforms. Playful, Gen Z aesthetic.',
    fontDescription: 'puffy inflated 3D bubble font with subtle specular highlight and soft drop shadow',
    backgroundHint: 'clean pastel gradient or soft bokeh',
    colorUsage: (_, accent) => `Soft pink to white gradient on letters with ${accent} shadow tint. Candy-like sheen.`,
  },
  chrome_gradient: {
    styleDirective: 'Premium metallic chrome 3D typography. Mirror-like reflective surface on letters.',
    fontDescription: 'bold chrome metallic 3D font with mirror reflection and polished surface',
    backgroundHint: 'dark luxury background with subtle ambient light',
    colorUsage: (primary, accent) => `Chrome gradient from ${primary} to ${accent} with silver highlights. Luxury feel.`,
  },
  neon_glow: {
    styleDirective: 'Neon tube lettering with realistic glass tube glow effect. Nightlife atmosphere.',
    fontDescription: 'neon tube script font glowing with light emission and wall reflection',
    backgroundHint: 'dark brick wall or moody dark surface with light spill',
    colorUsage: (_, accent) => `Neon glow in ${accent} color with light spill on surrounding surface. Warm ambient.`,
  },
  editorial_serif: {
    styleDirective: 'High-fashion editorial typography. Dramatic size contrast between headline and subtitle.',
    fontDescription: 'elegant bold serif display font with dramatic weight and refined spacing',
    backgroundHint: 'clean editorial layout with generous whitespace',
    colorUsage: (primary, _) => `Deep ${primary} text on cream/white. Minimal color — let typography speak.`,
  },
  street_bold: {
    styleDirective: 'Urban street-style condensed typography. Stacked words filling the frame edge-to-edge.',
    fontDescription: 'ultra-condensed bold sans-serif filling entire width, stacked vertically',
    backgroundHint: 'high-contrast with urban texture or solid color block',
    colorUsage: (_, accent) => `White or ${accent} text on dark. High contrast. Raw energy.`,
  },
  handwritten: {
    styleDirective: 'Organic hand-lettered brush calligraphy. Natural, warm, authentic feel.',
    fontDescription: 'flowing brush script calligraphy with natural ink texture and slight imperfections',
    backgroundHint: 'soft natural tones, kraft paper texture or botanical elements',
    colorUsage: (primary, _) => `Warm ${primary} ink on natural cream/white background. Organic warmth.`,
  },
  retro_poster: {
    styleDirective: 'Vintage-inspired poster lettering. Bold retro display type with nostalgia.',
    fontDescription: 'retro bold display lettering with vintage poster aesthetic and slight texture',
    backgroundHint: 'warm retro color palette, vintage paper or bold color blocks',
    colorUsage: (primary, accent) => `Vintage palette: ${primary} and ${accent} with cream/mustard accents. Retro warmth.`,
  },
  minimal_modern: {
    styleDirective: 'Ultra-clean modern sans-serif typography. Generous negative space. Swiss design.',
    fontDescription: 'clean geometric sans-serif in precise weight with mathematical spacing',
    backgroundHint: 'pure white or single brand color with maximum whitespace',
    colorUsage: (primary, _) => `Monochrome ${primary} on white. One accent element maximum. Clean precision.`,
  },
  warm_coastal: {
    styleDirective: 'Sun-washed Mediterranean coastal typography. Warm, relaxed, summer holiday feel with sandy textures.',
    fontDescription: 'rounded warm sans-serif or playful condensed bold font with soft edges and sun-bleached warmth',
    backgroundHint: 'warm sunset gradient, ocean horizon, sandy beach tones, or turquoise water texture',
    colorUsage: (primary, accent) => `Warm ${accent} text on soft ocean-blue to sunset gradient. Sandy cream highlights. Mediterranean warmth — no metallic or chrome.`,
  },
};

/** Public accessor so other design pipelines (GPT-image cards) can reuse vibe styling. */
export function getVibePromptSpec(vibe: TypographyVibe): VibePromptSpec {
  return VIBE_PROMPTS[vibe];
}

// ── Aspect Ratio Mapping ─────────────────────────────────────────────────────

type AspectRatio = '9:16' | '1:1' | '4:5';

const ASPECT_LABELS: Record<AspectRatio, string> = {
  '9:16': 'vertical 9:16 story/reel format',
  '1:1': 'square 1:1 Instagram feed post format',
  '4:5': 'portrait 4:5 Instagram feed post format',
};

// ── Prompt Builder ───────────────────────────────────────────────────────────

/**
 * Distill a mission brief / subject hint into a short, image-safe scene phrase.
 * Strips marketing filler and length so it can be injected into an Ideogram prompt
 * without overflowing the token budget or leaking instructions.
 */
function distillSceneHint(raw: string | undefined): string {
  if (!raw) return '';
  return raw
    .replace(/\s+/g, ' ')
    .replace(/["'`]/g, '')
    .trim()
    .slice(0, 140);
}

function buildTypographyPrompt(input: {
  headline: string;
  subtitle?: string;
  vibe: TypographyVibe;
  brandColors: { primary: string; accent: string };
  backgroundStyle: TypographyBackgroundStyle;
  aspectRatio: AspectRatio;
  brandName?: string;
  logoUrl?: string;
  logoPlacement?: import('./fal-logo-placement').ResolvedFalLogoPlacement | null;
  logoHint?: boolean;
  /** Brief-derived subject/scene the generated background should evoke (abstract, not literal). */
  sceneHint?: string;
  /** Shared brand-system directives resolved from Brand Theme + Template Library. */
  brandDirectives?: string[];
  /**
   * A single-sentence tone distilled from the brand's visual_dna + description.
   * Injected as a visual atmosphere hint so the design feels brand-authentic,
   * not sector-generic.
   */
  visualDnaTone?: string;
  /**
   * When true, generate a pure atmospheric background plate with NO text, NO
   * typography, NO letters. Used as the start frame for Kling/Luma animation
   * so the motion model never needs to preserve baked-in text.
   */
  backgroundOnly?: boolean;
  /** Premium Canva Pro Reels cover frame — bold graphics + stacked headline. */
  reelDesignMode?: boolean;
}): string {
  const spec = VIBE_PROMPTS[input.vibe];
  const aspect = ASPECT_LABELS[input.aspectRatio];
  const sceneHint = distillSceneHint(input.sceneHint);

  const bgDirective = input.backgroundStyle === 'photo_overlay'
    ? 'Cinematic blurred background photo atmosphere. Subtle dark gradient depth.'
    : input.backgroundStyle === 'solid_brand'
      ? `Solid brand color background (${input.brandColors.primary}). Clean, editorial, agency-quality.`
      : input.backgroundStyle === 'gradient_mesh'
        ? `Abstract gradient mesh background blending ${input.brandColors.primary} and ${input.brandColors.accent}. Smooth organic shapes, premium depth.`
        : 'Transparent/clean background.';

  const sceneLine = sceneHint
    ? ` Background should subtly evoke the theme of: ${sceneHint} — abstract and atmospheric, complementing the design without competing with the text.`
    : '';

  const brandColorEmphasis = `BRAND IDENTITY: Primary color ${input.brandColors.primary}, accent color ${input.brandColors.accent}. These colors MUST dominate the design palette — use them for gradient overlays or decorative accents. The design must feel on-brand.`;

  const visualDnaLine = input.visualDnaTone
    ? `BRAND VISUAL TONE: ${input.visualDnaTone} — let this personality permeate the composition, atmosphere, and typographic feel.`
    : '';

  // ── Background-only plate (for Kling/Luma animation start frame) ─────────
  if (input.backgroundOnly) {
    const bgSceneLine = sceneHint
      ? ` Evoke the mood and theme of: ${sceneHint} — purely through light, color, texture, and atmosphere.`
      : '';
    return [
      `Cinematic atmospheric background plate, ${aspect}. Pure mood — absolutely NO text, NO letters, NO words, NO typography of any kind.`,
      spec.backgroundHint ? `Atmosphere: ${spec.backgroundHint}.` : '',
      brandColorEmphasis,
      visualDnaLine,
      bgDirective,
      bgSceneLine,
      'CRITICAL: This is a background plate only. Zero text. Zero letters. Zero numbers. No watermarks. No brand name text. No headlines. No captions. Just beautiful atmospheric visuals.',
      'Premium cinematic quality. Suitable as a video start frame for professional social content.',
    ].filter(Boolean).join(' ').trim().slice(0, 1200);
  }

  // ── Reels / TikTok creator template (9:16 video still) ───────────────────
  if (input.reelDesignMode && input.aspectRatio === '9:16') {
    const safeHeadline = clampFalOverlayHeadlineForCanvas(input.headline, 'reel');
    const safeSubtitle = input.subtitle && isMeaningfulFalOverlayText(input.subtitle)
      ? sanitizeFalOverlayText(input.subtitle).slice(0, 36)
      : undefined;
    const headlineLine = formatFalOnImageHeadlineDirective(safeHeadline, spec.fontDescription);
    const subtitleLine = safeSubtitle
      ? ` ${formatFalOnImageSubtitleDirective(safeSubtitle)}`
      : '';
    const textContract = buildFalOnCanvasTextContract({
      headline: safeHeadline,
      subtitle: safeSubtitle,
      brandName: input.brandName,
      logoProvided: Boolean(input.logoUrl),
    });
    const logoLine = input.logoUrl
      ? buildFalLogoPlacementContract({
          logoProvided: true,
          brandName: input.brandName,
          channel: 'reel',
          hasPhotoHero: false,
          placement: input.logoPlacement ?? null,
        })
      : input.brandName
        ? ` Place "${input.brandName}" brand name at top-right corner — small, clean watermark.`
        : '';
    return [
      `Premium Canva Pro Instagram Reel / TikTok cover frame, ${aspect}.`,
      'Social media creator aesthetic — bold stacked headline, geometric color blocks, accent bars, divider lines, decorative shapes (circles, stars, brush strokes). NOT a raw photo.',
      spec.styleDirective,
      brandColorEmphasis,
      visualDnaLine,
      ...(input.brandDirectives ?? []),
      headlineLine,
      subtitleLine,
      textContract,
      spec.colorUsage(input.brandColors.primary, input.brandColors.accent),
      bgDirective,
      sceneLine,
      spec.backgroundHint ? `Background hint: ${spec.backgroundHint}.` : '',
      logoLine,
      'Layout: creator template with large typography panel + abstract branded background. Motion-ready layered composition.',
      'Render only the quoted on-image copy. No prompt instruction words on canvas.',
    ].filter(Boolean).join(' ').trim().slice(0, 1500);
  }

  // ── Full typography design (for post stills) ─────────────────────────────
  const canvasChannel = input.aspectRatio === '9:16' ? 'story' : 'feed_post';
  const safeHeadline = clampFalOverlayHeadlineForCanvas(input.headline, canvasChannel);
  const safeSubtitle = input.subtitle && isMeaningfulFalOverlayText(input.subtitle)
    ? sanitizeFalOverlayText(input.subtitle).slice(0, 36)
    : undefined;
  const headlineLine = formatFalOnImageHeadlineDirective(safeHeadline, spec.fontDescription);
  const subtitleLine = safeSubtitle
    ? ` ${formatFalOnImageSubtitleDirective(safeSubtitle)}`
    : '';
  const textContract = buildFalOnCanvasTextContract({
    headline: safeHeadline,
    subtitle: safeSubtitle,
    brandName: input.brandName,
    logoProvided: Boolean(input.logoUrl),
  });

  const logoLine = input.logoUrl
    ? buildFalLogoPlacementContract({
        logoProvided: true,
        brandName: input.brandName,
        channel: canvasChannel,
        hasPhotoHero: false,
        placement: input.logoPlacement ?? null,
      })
    : input.brandName
      ? ` Place "${input.brandName}" brand name in a clean, minimal style at the top-right or bottom-right corner. Small but legible. Brand watermark presence is mandatory.`
      : '';

  return [
    `Professional social media design poster, ${aspect}.`,
    spec.styleDirective,
    brandColorEmphasis,
    visualDnaLine,
    ...(input.brandDirectives ?? []),
    headlineLine,
    subtitleLine,
    textContract,
    spec.colorUsage(input.brandColors.primary, input.brandColors.accent),
    bgDirective,
    sceneLine,
    spec.backgroundHint ? `Background hint: ${spec.backgroundHint}.` : '',
    logoLine,
    'Design hierarchy: large headline, optional supporting subtitle, brand watermark — full Canva/agency layout, not a single floating word.',
    'No watermarks. No stock photo badges. No random text or placeholder words.',
    'Render only the quoted on-image copy. Do not paint prompt instruction words (e.g. "exactly", "headline", "critical").',
    'Premium agency design quality. Balanced layout with intentional negative space.',
  ].filter(Boolean).join(' ').trim().slice(0, 1500);
}

// ── API Call ─────────────────────────────────────────────────────────────────

interface FalQueueSubmit {
  request_id: string;
  response_url: string;
  status_url: string;
}

interface FalQueueStatus {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  error?: string;
}

interface IdeogramResult {
  images?: Array<{ url?: string; content_type?: string }>;
  image?: { url?: string };
}

async function callIdeogramV4(
  apiKey: string,
  prompt: string,
  aspectRatio: AspectRatio,
  timeoutMs: number,
): Promise<string> {
  const imageSize = aspectRatio === '9:16'
    ? { width: 1080, height: 1920 }
    : aspectRatio === '4:5'
      ? { width: 1080, height: 1350 }
      : { width: 1080, height: 1080 };

  const ideogramModel = IDEOGRAM_MODEL();
  const enqueueRes = await fetch(`${FAL_QUEUE_BASE}/${ideogramModel}`, {
    method: 'POST',
    headers: { ...FAL_AUTH(apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      image_size: imageSize,
      rendering_speed: 'BALANCED',
      expansion_model: 'None',
      num_images: 1,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!enqueueRes.ok) {
    const body = await enqueueRes.text().catch(() => '');
    throw new Error(`Ideogram enqueue failed ${enqueueRes.status}: ${body.slice(0, 200)}`);
  }

  const queued = (await enqueueRes.json()) as FalQueueSubmit;
  const statusUrl = queued.status_url ?? `${FAL_QUEUE_BASE}/${ideogramModel}/requests/${queued.request_id}/status`;
  const resultUrl = queued.response_url ?? `${FAL_QUEUE_BASE}/${ideogramModel}/requests/${queued.request_id}`;

  const deadline = Date.now() + timeoutMs;
  let pollInterval = 3_000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollInterval));
    pollInterval = Math.min(pollInterval * 1.4, 10_000);

    const statusRes = await fetch(statusUrl, {
      headers: FAL_AUTH(apiKey),
      signal: AbortSignal.timeout(10_000),
    });
    if (!statusRes.ok) continue;

    const status = (await statusRes.json()) as FalQueueStatus;
    if (status.status === 'FAILED') throw new Error(status.error ?? 'Ideogram V4 job failed');
    if (status.status !== 'COMPLETED') continue;

    const resultRes = await fetch(resultUrl, {
      headers: FAL_AUTH(apiKey),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resultRes.ok) throw new Error(`Ideogram result fetch failed ${resultRes.status}`);

    const result = (await resultRes.json()) as IdeogramResult;
    const url = result.images?.[0]?.url ?? result.image?.url;
    if (url) return url;
    throw new Error('Ideogram result has no image URL');
  }

  throw new Error(`Ideogram V4 timed out after ${timeoutMs / 1000}s`);
}

async function callFluxFallback(
  apiKey: string,
  prompt: string,
  aspectRatio: AspectRatio,
): Promise<string> {
  const fluxModel = FLUX_FALLBACK_MODEL();
  const res = await fetch(`${FAL_RUN_BASE}/${fluxModel}`, {
    method: 'POST',
    headers: { ...FAL_AUTH(apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      aspect_ratio: aspectRatio,
      output_format: 'jpeg',
      num_images: 1,
      raw: true,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Flux fallback failed ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { images?: Array<{ url?: string }> };
  const url = data.images?.[0]?.url;
  if (!url) throw new Error('Flux result has no image URL');
  return url;
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface TypographyDesignResult {
  imageUrl: string;
  model: string;
  vibe: TypographyVibe;
  prompt: string;
  retryCount: number;
}

export async function generateTypographyDesign(input: {
  headline: string;
  subtitle?: string;
  vibe: TypographyVibe;
  brandColors: { primary: string; accent: string };
  backgroundStyle?: TypographyBackgroundStyle;
  aspectRatio: AspectRatio;
  brandName?: string;
  logoUrl?: string;
  logoPlacement?: import('./fal-logo-placement').ResolvedFalLogoPlacement | null;
  timeoutMs?: number;
  /** Brief-derived subject/scene the generated background should evoke. */
  sceneHint?: string;
  /** Shared brand-system directives resolved from Brand Theme + Template Library. */
  brandDirectives?: string[];
  /** Visual DNA tone sentence — makes design feel brand-authentic, not sector-generic. */
  visualDnaTone?: string;
  /**
   * When true, generates a pure atmospheric background plate with zero text.
   * Used as the Kling/Luma start frame for fal_story / fal_reel video slots.
   */
  backgroundOnly?: boolean;
  /** Premium Canva Pro Reels cover — bold creator graphics for 9:16 video stills. */
  reelDesignMode?: boolean;
}): Promise<TypographyDesignResult> {
  const apiKey = serverConfig.fal.apiKey;
  if (!apiKey) throw new Error('FAL_API_KEY not set — typography design unavailable');

  const backgroundStyle = input.backgroundStyle ?? 'gradient_mesh';
  const timeoutMs = input.timeoutMs ?? 90_000;

  const prompt = buildTypographyPrompt({
    headline: clampFalOverlayHeadlineForCanvas(
      sanitizeFalOverlayText(input.headline),
      input.reelDesignMode && input.aspectRatio === '9:16'
        ? 'reel'
        : input.aspectRatio === '9:16'
          ? 'story'
          : 'feed_post',
    ),
    subtitle: input.subtitle ? sanitizeFalOverlayText(input.subtitle).slice(0, 36) : undefined,
    vibe: input.vibe,
    brandColors: input.brandColors,
    backgroundStyle,
    aspectRatio: input.aspectRatio,
    brandName: input.backgroundOnly ? undefined : input.brandName,
    logoUrl: input.backgroundOnly ? undefined : input.logoUrl,
    logoPlacement: input.backgroundOnly ? undefined : input.logoPlacement,
    logoHint: input.backgroundOnly ? false : Boolean(input.brandName || input.logoUrl),
    sceneHint: input.sceneHint,
    brandDirectives: input.brandDirectives,
    visualDnaTone: input.visualDnaTone,
    backgroundOnly: input.backgroundOnly,
    reelDesignMode: input.reelDesignMode,
  });

  const mode = input.backgroundOnly ? 'background-plate' : input.reelDesignMode ? 'reel-design' : 'typography';
  console.log(`[fal-typography] Generating ${mode}: vibe=${input.vibe} aspect=${input.aspectRatio}${input.backgroundOnly ? '' : ` headline="${input.headline.slice(0, 30)}"`}`);

  try {
    const imageUrl = await callIdeogramV4(apiKey, prompt, input.aspectRatio, timeoutMs);
    console.log(`[fal-typography] Ideogram V4 success: ${imageUrl.slice(0, 80)}`);
    return { imageUrl, model: IDEOGRAM_MODEL(), vibe: input.vibe, prompt, retryCount: 0 };
  } catch (ideogramErr) {
    console.warn(`[fal-typography] Ideogram V4 failed, trying Flux fallback:`, ideogramErr instanceof Error ? ideogramErr.message : ideogramErr);
    try {
      const { emitQualityEvent } = await import('@/lib/ai-cost-telemetry');
      emitQualityEvent({
        event: 'fallback',
        transition: 'ideogram->flux',
        reason: ideogramErr instanceof Error ? ideogramErr.message : String(ideogramErr),
        label: mode,
      });
    } catch { /* telemetri üretimi bozmamalı */ }
    try {
      const imageUrl = await callFluxFallback(apiKey, prompt, input.aspectRatio);
      console.log(`[fal-typography] Flux fallback success: ${imageUrl.slice(0, 80)}`);
      return { imageUrl, model: FLUX_FALLBACK_MODEL(), vibe: input.vibe, prompt, retryCount: 1 };
    } catch (fluxErr) {
      throw new Error(`All typography models failed. Ideogram: ${ideogramErr instanceof Error ? ideogramErr.message : ideogramErr}. Flux: ${fluxErr instanceof Error ? fluxErr.message : fluxErr}`);
    }
  }
}

/**
 * Generate with retry — on text accuracy failure, simplifies the prompt and retries.
 * In backgroundOnly mode, text validation is skipped (no text to validate).
 */
export async function generateTypographyDesignWithRetry(
  input: Parameters<typeof generateTypographyDesign>[0],
  opts?: { maxRetries?: number; validateFn?: (imageUrl: string, headline: string) => Promise<boolean> },
): Promise<TypographyDesignResult> {
  // Background plates never need text validation — one attempt is sufficient.
  if (input.backgroundOnly) {
    return generateTypographyDesign(input);
  }

  const maxRetries = opts?.maxRetries ?? 2;
  let lastResult: TypographyDesignResult | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const canvasChannel = input.reelDesignMode && input.aspectRatio === '9:16'
      ? 'reel'
      : input.aspectRatio === '9:16'
        ? 'story'
        : 'feed_post';
    const modifiedInput = attempt === 0
      ? input
      : {
          ...input,
          headline: shortenFalOverlayForImageRetry(
            sanitizeFalOverlayText(input.headline),
            attempt,
            canvasChannel,
          ),
          subtitle: undefined,
        };

    if (attempt > 0 && !modifiedInput.headline) {
      console.warn(`[fal-typography] Retry ${attempt + 1}: no complete shortened headline`);
      continue;
    }

    const result = await generateTypographyDesign(modifiedInput);
    result.retryCount = attempt;
    lastResult = result;

    if (!opts?.validateFn) return result;

    const isValid = await opts.validateFn(result.imageUrl, modifiedInput.headline);
    if (isValid) return result;

    console.warn(`[fal-typography] Text validation failed (attempt ${attempt + 1}/${maxRetries + 1})`);
  }

  return lastResult!;
}
