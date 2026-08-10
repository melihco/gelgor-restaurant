/**
 * fal.ai Motion Plate Generator — Kling v3 Pro / Standard / Luma I2V
 *
 * Call site: fal.ai designer video track (`produceFalDesignerVideo`) —
 * animates a clean atmospheric background plate (no baked text).
 * `preserveExistingText` is always false — the prompt explicitly forbids any
 * text so the motion plate stays purely visual; captions/typography are
 * overlaid downstream (designed still or the mobile caption layer).
 */

import {
  buildFalI2vEnqueuePayload,
  formatFalEnqueueError,
  isKlingI2vModel,
  isLumaRayI2vModel,
  resolveFalI2vModelChain,
} from '@/lib/fal-i2v-models';
import { finalizeFalPrompt } from '@/lib/fal-prompt';
import { resolveFalReelMotionAttemptBudget } from '@/lib/video-tier-scope';
import { serverConfig } from './server-config';

const FAL_QUEUE_BASE = 'https://queue.fal.run';
const FAL_AUTH = (key: string) => ({ Authorization: `Key ${key}` });

/**
 * Full-chain retries for fal_reel. Keep at 1 — Kling→Luma already falls through
 * inside one attempt. Higher values × multi-model chain = 2–6× fal token burn
 * when Kling times out client-side while still completing on fal.
 */
export const FAL_REEL_MOTION_ATTEMPTS = 1;
export const FAL_REEL_MOTION_RETRY_DELAY_MS = 4_000;

/** Kling I2V often needs 4–5 min; short poll budgets abandon paid jobs and start Luma. */
export const FAL_KLING_MOTION_POLL_MS = 360_000;
export const FAL_LUMA_MOTION_POLL_MS = 120_000;
/** Extra wait once if job is still IN_PROGRESS at the primary deadline. */
export const FAL_MOTION_IN_PROGRESS_GRACE_MS = 90_000;

function resolveMotionPollTimeoutMs(modelId: string, requestedMs?: number): number {
  const modelDefault = isKlingI2vModel(modelId)
    ? FAL_KLING_MOTION_POLL_MS
    : isLumaRayI2vModel(modelId)
      ? FAL_LUMA_MOTION_POLL_MS
      : 180_000;
  if (requestedMs == null || requestedMs <= 0) return modelDefault;
  // Never shorten below model defaults — caller timeouts used to cut Kling at 150s.
  return Math.max(requestedMs, modelDefault);
}

export function isPlayableVideoUrl(url: string | null | undefined): boolean {
  return Boolean(url && /\.(mp4|mov|webm)(\?|$)/i.test(String(url).trim()));
}

export type StoryMotionStyle =
  | 'subtle_drift'
  | 'steam_shimmer'
  | 'liquid_pour'
  | 'bokeh_pulse'
  | 'ambient_light'
  | 'product_hero'
  | 'social_reel_graphics';

const MOTION_PROMPTS: Record<StoryMotionStyle, string> = {
  subtle_drift:
    'Very subtle camera drift, gentle parallax movement. Cinematic, barely perceptible motion. No zooming, no fast movements. Ambient atmosphere.',
  steam_shimmer:
    'Delicate steam or heat shimmer rising from the product. Subtle atmospheric particles. Warm golden light. Cinematic food/beverage photography mood.',
  liquid_pour:
    'Smooth slow-motion liquid movement. Viscous drip, honey-like flow. Macro photography style. Premium product showcase.',
  bokeh_pulse:
    'Gentle background bokeh lights softly pulsing. Shallow depth of field. Subject stays sharp. Luxury nightlife or event atmosphere.',
  ambient_light:
    'Soft ambient light rays slowly shifting across the scene. Golden hour warmth. Dust particles in light beams. Editorial photography mood.',
  product_hero:
    'Ultra-slow 360-degree subtle rotation showcasing the product from slightly different angle. Premium studio lighting. Clean background.',
  social_reel_graphics:
    'Premium Instagram Reel I2V: 35mm shallow-DOF editorial still brought to life. Ultra-slow dolly push-in on the photo hero only; microscopic parallax between craft panel and photograph; soft volumetric light breath. Luxury hospitality color science — warm highlights, calm midtones, natural optical depth. Agency-grade finish: restrained, cinematic, photo-real. No party energy, neon chaos, or busy motion graphics.',
};

export function resolveMotionStyle(sector?: string, mood?: string): StoryMotionStyle {
  const s = (sector ?? '').toLowerCase();
  const m = (mood ?? '').toLowerCase();

  if (s.includes('night') || s.includes('club') || s.includes('bar') || s.includes('lounge')) return 'bokeh_pulse';
  if (s.includes('cafe') || s.includes('restaurant') || s.includes('food') || s.includes('bakery')) return 'steam_shimmer';
  if (s.includes('hotel') || s.includes('spa') || s.includes('wellness')) return 'ambient_light';
  if (s.includes('retail') || s.includes('product') || s.includes('shop')) return 'product_hero';
  if (m.includes('luxury') || m.includes('premium') || m.includes('editorial')) return 'ambient_light';
  if (m.includes('energy') || m.includes('vibrant') || m.includes('dynamic')) return 'bokeh_pulse';
  return 'subtle_drift';
}

export function buildStoryMotionPrompt(input: {
  style: StoryMotionStyle;
  headline?: string;
  sector?: string;
  brandName?: string;
  preserveExistingText?: boolean;
  pipeline?: 'fal_story' | 'fal_reel';
  /** Agent designer brief motion cue — appended to Kling prompt. */
  designerMotionCue?: string;
}): string {
  const base = MOTION_PROMPTS[input.style];
  const isReelGraphics = input.style === 'social_reel_graphics' || input.pipeline === 'fal_reel';

  if (input.preserveExistingText) {
    // Do NOT pass headline/copy into I2V — models rewrite letters into gibberish.
    const context = [
      input.sector ? `Industry: ${input.sector}.` : '',
      'FROZEN TEXT (NON-NEGOTIABLE): Treat every letter, number, diacritic, and glyph as frozen pixels. Zero new characters. Zero OCR rewrite. Zero language change. Zero word morphing. If text exists, it must be identical in every frame.',
      isReelGraphics
        ? 'LOCKED TYPOGRAPHY: Finished premium reel cover — headline/subtitle/panels stay pixel-perfect, sharp, and unmoved from frame 1 to end. Quiet luxury editorial, never carnival motion graphics.'
        : 'LOCKED COMPOSITION: Professional branded design frame — typography stays pixel-perfect from frame 1 to end.',
      'LOCKED LOGO: Brand mark stays identical — same shape, colors, position. Allowed: tiny opacity breath only. FORBIDDEN: redraw, morph, recolor, replace.',
      isReelGraphics
        ? 'Allowed motion ONLY: ultra-slow push-in on the photo zone, microscopic panel parallax, soft light breath with physically stable timing and temporal consistency. FORBIDDEN motion: shake, whip pans, particle storms, neon flashes, sticker pop-ins, emoji, kinetic type, bouncing UI, layout drift.'
        : 'Allowed motion: microscopic ambient light shift, ultra-subtle bokeh breath. NOTHING else.',
      'FORBIDDEN: text distortion, letter mutation, blurred/warped type, typography movement, gibberish words, invented slogans, cropped headline, mutating shapes.',
      isReelGraphics
        ? 'Duration: 5s. Aspect 9:16. Output = restrained agency Reel — photo realism preserved, design locked, editorial breathing still; not a generative party video.'
        : 'Duration: 5s. Aspect 9:16. Premium breathing still, not generative animation.',
      isReelGraphics
        ? 'Quality: agency commercial finish — calm luxury hospitality aesthetic, consistent frames, optical realism; less clutter wins.'
        : 'Quality: niche high-end brand content — less clutter wins.',
      input.designerMotionCue
        ? `Art director motion (photo/light only — never alter text): ${input.designerMotionCue.slice(0, 220)}.`
        : '',
    ].filter(Boolean).join(' ');
    return finalizeFalPrompt(`${base} ${context}`, { kind: 'video', label: 'story-motion-locked' });
  }

  // Atmospheric plate path — no text in the frame, full cinematic freedom
  const context = [
    input.sector ? `Industry: ${input.sector}.` : '',
    input.headline ? `Scene context: ${input.headline.slice(0, 60)}.` : '',
    'Duration: 8 seconds. Aspect ratio: 9:16 vertical. No text overlays. Cinematic motion freedom.',
    'Quality: cinematic, shallow depth of field, premium brand content.',
  ].filter(Boolean).join(' ');
  return finalizeFalPrompt(`${base} ${context}`, { kind: 'video', label: 'story-motion-plate' });
}

/** Thrown when a paid fal job is still running — callers must not enqueue the next model. */
export class FalMotionInFlightTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FalMotionInFlightTimeoutError';
  }
}

interface FalQueueSubmit {
  request_id: string;
  response_url: string;
  status_url: string;
}

interface FalQueueStatus {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  error?: string;
}

interface FalVideoResult {
  video?: { url?: string };
  videoUrl?: string;
  output?: { url?: string };
}

async function runMotionModel(
  apiKey: string,
  modelId: string,
  imageUrl: string,
  prompt: string,
  timeoutMs: number,
  preserveExistingText = false,
  durationSecs = 5,
): Promise<string | null> {
  const pollBudgetMs = resolveMotionPollTimeoutMs(modelId, timeoutMs);
  const payload = buildFalI2vEnqueuePayload(modelId, {
    imageUrl,
    prompt,
    durationSecs,
    aspectRatio: '9:16',
    preserveExistingText,
    lumaResolution: serverConfig.ai.tier === 'premium' ? '720p' : '540p',
  });

  const enqueueRes = await fetch(`${FAL_QUEUE_BASE}/${modelId}`, {
    method: 'POST',
    headers: { ...FAL_AUTH(apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });

  const {
    recordFalEnqueueFailed,
    recordFalRequestSubmitted,
    markFalRequestCompleted,
    markFalRequestFailed,
  } = await import('./fal-request-tracker');

  if (!enqueueRes.ok) {
    const body = await enqueueRes.text().catch(() => '');
    const message = formatFalEnqueueError(enqueueRes.status, body);
    recordFalEnqueueFailed({
      model: modelId,
      kind: 'video',
      httpStatus: enqueueRes.status,
      error: message,
    });
    throw new Error(message);
  }

  const queued = (await enqueueRes.json()) as FalQueueSubmit;
  recordFalRequestSubmitted({
    requestId: queued.request_id,
    model: modelId,
    kind: 'video',
  });
  const statusUrl = queued.status_url ?? `${FAL_QUEUE_BASE}/${modelId}/requests/${queued.request_id}/status`;
  const resultUrl = queued.response_url ?? `${FAL_QUEUE_BASE}/${modelId}/requests/${queued.request_id}`;

  let deadline = Date.now() + pollBudgetMs;
  let graceUsed = false;
  let lastStatus: FalQueueStatus['status'] | 'UNKNOWN' = 'UNKNOWN';
  let pollInterval = 4_000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollInterval));
    pollInterval = Math.min(pollInterval * 1.5, 12_000);

    const statusRes = await fetch(statusUrl, {
      headers: FAL_AUTH(apiKey),
      signal: AbortSignal.timeout(10_000),
    });
    if (!statusRes.ok) continue;

    const status = (await statusRes.json()) as FalQueueStatus;
    lastStatus = status.status;
    if (status.status === 'FAILED') {
      markFalRequestFailed(queued.request_id, status.error ?? 'fal story motion job failed');
      throw new Error(status.error ?? 'fal story motion job failed');
    }
    if (status.status !== 'COMPLETED') continue;

    const resultRes = await fetch(resultUrl, {
      headers: FAL_AUTH(apiKey),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resultRes.ok) throw new Error(`result fetch failed ${resultRes.status}`);

    const result = (await resultRes.json()) as FalVideoResult;
    const url = result.video?.url ?? result.videoUrl ?? result.output?.url;
    if (url) {
      markFalRequestCompleted(queued.request_id, url);
      return url;
    }
    markFalRequestFailed(queued.request_id, 'fal story motion result has no video URL');
    throw new Error('fal story motion result has no video URL');
  }

  // Job still running on fal — wait once more instead of enqueueing the next model
  // (abandoning an IN_PROGRESS Kling job is what caused Kling+Luma double billing).
  if (
    !graceUsed
    && (lastStatus === 'IN_QUEUE' || lastStatus === 'IN_PROGRESS' || lastStatus === 'UNKNOWN')
  ) {
    graceUsed = true;
    deadline = Date.now() + FAL_MOTION_IN_PROGRESS_GRACE_MS;
    console.warn(
      `[fal-story-motion] ${modelId} still ${lastStatus} after ${Math.round(pollBudgetMs / 1000)}s `
      + `— grace +${Math.round(FAL_MOTION_IN_PROGRESS_GRACE_MS / 1000)}s before fallback `
      + `(request ${queued.request_id})`,
    );
    pollInterval = 6_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, pollInterval));
      pollInterval = Math.min(pollInterval * 1.4, 12_000);

      const statusRes = await fetch(statusUrl, {
        headers: FAL_AUTH(apiKey),
        signal: AbortSignal.timeout(10_000),
      });
      if (!statusRes.ok) continue;

      const status = (await statusRes.json()) as FalQueueStatus;
      lastStatus = status.status;
      if (status.status === 'FAILED') {
        markFalRequestFailed(queued.request_id, status.error ?? 'fal story motion job failed');
        throw new Error(status.error ?? 'fal story motion job failed');
      }
      if (status.status !== 'COMPLETED') continue;

      const resultRes = await fetch(resultUrl, {
        headers: FAL_AUTH(apiKey),
        signal: AbortSignal.timeout(15_000),
      });
      if (!resultRes.ok) throw new Error(`result fetch failed ${resultRes.status}`);

      const result = (await resultRes.json()) as FalVideoResult;
      const url = result.video?.url ?? result.videoUrl ?? result.output?.url;
      if (url) {
        markFalRequestCompleted(queued.request_id, url);
        return url;
      }
      markFalRequestFailed(queued.request_id, 'fal story motion result has no video URL');
      throw new Error('fal story motion result has no video URL');
    }
  }

  const waitedSec = Math.round((pollBudgetMs + (graceUsed ? FAL_MOTION_IN_PROGRESS_GRACE_MS : 0)) / 1000);
  const msg = `fal story motion timed out after ${waitedSec}s (last=${lastStatus})`;
  markFalRequestFailed(queued.request_id, msg);
  // IN_PROGRESS/IN_QUEUE timeout: job may still complete & bill on fal — do not chain Luma.
  if (lastStatus === 'IN_QUEUE' || lastStatus === 'IN_PROGRESS' || lastStatus === 'UNKNOWN') {
    throw new FalMotionInFlightTimeoutError(msg);
  }
  throw new Error(msg);
}

export interface StoryMotionResult {
  videoUrl: string;
  model: string;
  style: StoryMotionStyle;
  durationSecs: number;
}

/**
 * Generate a 5-second motion plate from a still photo for premium story backgrounds.
 * Falls through Kling 3.0 Pro → Standard → Luma.
 */
export async function generateStoryMotionPlate(input: {
  imageUrl: string;
  headline?: string;
  sector?: string;
  brandName?: string;
  mood?: string;
  style?: StoryMotionStyle;
  timeoutMs?: number;
  preserveExistingText?: boolean;
  pipeline?: 'fal_story' | 'fal_reel';
  designerMotionCue?: string;
  /** Kling/Luma duration hint from reel recipe (default 5). */
  durationSecs?: number;
}): Promise<StoryMotionResult> {
  const apiKey = serverConfig.fal.apiKey;
  if (!apiKey) throw new Error('FAL_API_KEY not set — story motion plates unavailable');

  const { resolveExternallyAccessibleUrl, isFalAccessibleMediaUrl } = await import('@/lib/media-url');
  const resolvedImageUrl = await resolveExternallyAccessibleUrl(input.imageUrl);
  if (!isFalAccessibleMediaUrl(resolvedImageUrl)) {
    throw new Error(
      `Image URL not accessible to fal.ai (need HTTPS or data URI): ${resolvedImageUrl.slice(0, 120)}`,
    );
  }
  console.log(`[fal-story-motion] start_image_url → ${resolvedImageUrl.slice(0, 120)}`);

  const style = input.style ?? resolveMotionStyle(input.sector, input.mood);
  const prompt = buildStoryMotionPrompt({
    style,
    headline: input.headline,
    sector: input.sector,
    brandName: input.brandName,
    preserveExistingText: input.preserveExistingText,
    pipeline: input.pipeline,
    designerMotionCue: input.designerMotionCue,
  });
  console.log(`[fal-story-motion] prompt_chars=${prompt.length}`);
  const timeoutMs = input.timeoutMs ?? 120_000;
  const durationSecs = input.durationSecs && input.durationSecs > 0 ? input.durationSecs : 5;
  const storyMotionModels = resolveFalI2vModelChain(
    input.preserveExistingText === true ? 'story_motion' : 'raw_gallery',
    serverConfig.ai.tier,
  );

  let lastError = 'no models configured';
  for (const modelId of storyMotionModels) {
    try {
      console.log(`[fal-story-motion] trying ${modelId} (style: ${style})`);
      const url = await runMotionModel(
        apiKey,
        modelId,
        resolvedImageUrl,
        prompt,
        timeoutMs,
        input.preserveExistingText === true,
        durationSecs,
      );
      if (url) {
        console.log(`[fal-story-motion] success: ${modelId} → ${url.slice(0, 80)}`);
        return { videoUrl: url, model: modelId, style, durationSecs };
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[fal-story-motion] ${modelId} failed:`, lastError);
      // Do not start Luma (or any next model) while Kling may still be billing.
      if (err instanceof FalMotionInFlightTimeoutError) {
        throw err;
      }
    }
  }
  throw new Error(`All fal.ai story motion models failed: ${lastError}`);
}

/**
 * Designer-track motion with reel retries — fal_reel attempts Kling/Luma up to
 * FAL_REEL_MOTION_ATTEMPTS times before surfacing failure (no PNG still_fallback).
 */
export async function generateStoryMotionPlateWithRetry(
  input: Parameters<typeof generateStoryMotionPlate>[0] & {
    pipeline?: 'fal_story' | 'fal_reel';
    /** economy/agency/starter → 1 reel attempt when VIDEO_TIER_SCOPE is on. */
    productionTier?: string | null;
  },
): Promise<StoryMotionResult> {
  const pipeline = input.pipeline ?? 'fal_story';
  const maxAttempts = resolveFalReelMotionAttemptBudget(
    pipeline,
    FAL_REEL_MOTION_ATTEMPTS,
    input.productionTier,
  );
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await generateStoryMotionPlate(input);
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts) break;
      const delay = FAL_REEL_MOTION_RETRY_DELAY_MS * attempt;
      console.warn(
        `[fal-story-motion] ${pipeline} motion attempt ${attempt}/${maxAttempts} failed — retrying in ${delay}ms:`,
        err instanceof Error ? err.message : err,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error(String(lastErr ?? 'fal story motion failed'));
}

/**
 * Check if the production tier supports motion plates (agency / premium only).
 */
export function shouldGenerateMotionPlate(input: {
  productionTier?: string;
  isPremiumFamily?: boolean;
  hasMotionPlateUrl?: boolean;
}): boolean {
  if (input.hasMotionPlateUrl) return false;
  if (!serverConfig.fal.configured) return false;
  if (process.env.STORY_MOTION_PLATES_ENABLED === 'false') return false;
  const tier = (input.productionTier ?? '').toLowerCase();
  if (tier === 'premium' || tier === 'agency') return true;
  return input.isPremiumFamily === true;
}
