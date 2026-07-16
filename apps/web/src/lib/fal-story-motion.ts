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
  resolveFalI2vModelChain,
} from '@/lib/fal-i2v-models';
import { finalizeFalPrompt } from '@/lib/fal-prompt';
import { serverConfig } from './server-config';

const FAL_QUEUE_BASE = 'https://queue.fal.run';
const FAL_AUTH = (key: string) => ({ Authorization: `Key ${key}` });

/** Reel slots retry Kling/Luma before failing — avoids still_fallback PNG-as-video. */
export const FAL_REEL_MOTION_ATTEMPTS = 3;
export const FAL_REEL_MOTION_RETRY_DELAY_MS = 4_000;

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
    'Premium social media reel motion graphics. Gentle slow push-in on the photo hero zone. Microscopic parallax between the graphic color block and photo panel. Soft light sweep across the design. Subtle ambient shimmer — Canva Pro reel intro energy, polished creator content.',
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
    const context = [
      input.sector ? `Industry: ${input.sector}.` : '',
      input.headline ? `Brand content: "${input.headline.slice(0, 50)}".` : '',
      isReelGraphics
        ? 'LOCKED TYPOGRAPHY: This is a finished Canva Pro reel cover frame with headline, subtitle, and graphic design layers. All text and shapes must stay pixel-perfect from frame 1 to frame 5s.'
        : 'LOCKED COMPOSITION: This is a professional branded design frame. The existing typography is the hero element — it MUST remain pixel-perfect from frame 1 to frame 5s.',
      'LOCKED LOGO: If a brand logo appears in the frame, it must stay pixel-perfect — same shape, colors, and position. Allowed: subtle opacity pulse or glow matching vibe. FORBIDDEN: redrawing, morphing, recoloring, or replacing the logo.',
      isReelGraphics
        ? 'Allowed motion: gentle slow zoom on the photo hero panel only, microscopic parallax between color block and photo zone, soft light sweep, subtle ambient shimmer. Creator-grade reel intro — dynamic but polished.'
        : 'Allowed motion: microscopic ambient light shift, ultra-subtle bokeh breath, barely-perceptible depth-of-field pulse. NOTHING else.',
      'FORBIDDEN: any text distortion, letter mutation, text blur, typography movement, reframing that crops headline, or mutation of graphic design elements.',
      isReelGraphics
        ? 'Duration: 5 seconds. Aspect ratio: 9:16 vertical. Output must feel like a premium Instagram Reel from a social media manager — not raw cinematic footage.'
        : 'Duration: 5 seconds. Aspect ratio: 9:16 vertical. Output must look like a premium breathing still, not a generative animation.',
      'Quality: agency-grade social media brand content.',
      input.designerMotionCue ? `Designer motion note: ${input.designerMotionCue.slice(0, 180)}.` : '',
    ].filter(Boolean).join(' ');
    return finalizeFalPrompt(`${base} ${context}`, { kind: 'video', label: 'story-motion-locked' });
  }

  // Atmospheric plate path — no text in the frame, full cinematic freedom
  const context = [
    input.sector ? `Industry: ${input.sector}.` : '',
    input.headline ? `Scene context: ${input.headline.slice(0, 60)}.` : '',
    'Duration: 5 seconds. Aspect ratio: 9:16 vertical. No text overlays. Cinematic motion freedom.',
    'Quality: cinematic, shallow depth of field, premium brand content.',
  ].filter(Boolean).join(' ');
  return finalizeFalPrompt(`${base} ${context}`, { kind: 'video', label: 'story-motion-plate' });
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
): Promise<string | null> {
  const payload = buildFalI2vEnqueuePayload(modelId, {
    imageUrl,
    prompt,
    durationSecs: 5,
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

  const deadline = Date.now() + timeoutMs;
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

  markFalRequestFailed(queued.request_id, `fal story motion timed out after ${timeoutMs / 1000}s`);
  throw new Error(`fal story motion timed out after ${timeoutMs / 1000}s`);
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
  const storyMotionModels = resolveFalI2vModelChain('story_motion', serverConfig.ai.tier);

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
      );
      if (url) {
        console.log(`[fal-story-motion] success: ${modelId} → ${url.slice(0, 80)}`);
        return { videoUrl: url, model: modelId, style, durationSecs: 5 };
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[fal-story-motion] ${modelId} failed:`, lastError);
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
  },
): Promise<StoryMotionResult> {
  const pipeline = input.pipeline ?? 'fal_story';
  const maxAttempts = pipeline === 'fal_reel' ? FAL_REEL_MOTION_ATTEMPTS : 1;
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
