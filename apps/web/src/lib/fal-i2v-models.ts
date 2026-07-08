/**
 * fal.ai image-to-video model registry — tier-aware, deprecated-slug safe.
 *
 * SSOT for story-motion (designer Kling plate) and raw gallery I2V fallback chains.
 * Replaces deprecated `fal-ai/luma-dream-machine/image-to-video` (v1.5) and
 * removed `hailuo-ai` slug (404 on fal queue API).
 */
import { resolveAiModelTier, type AiModelTier } from '@/lib/ai-model-tier';

export type FalI2vChainKind = 'story_motion' | 'raw_gallery';

/** Models that must never be enqueued (fal dashboard marks deprecated / 404). */
export const DEPRECATED_FAL_I2V_MODELS: ReadonlySet<string> = new Set([
  'fal-ai/luma-dream-machine/image-to-video',
  'fal-ai/hailuo-ai/video-01/image-to-video',
]);

const STORY_MOTION_BY_TIER: Record<AiModelTier, readonly string[]> = {
  starter: [
    'fal-ai/kling-video/v3/standard/image-to-video',
    'fal-ai/luma-dream-machine/ray-2/image-to-video',
  ],
  agency: [
    'fal-ai/kling-video/v3/standard/image-to-video',
    'fal-ai/luma-dream-machine/ray-2/image-to-video',
  ],
  premium: [
    'fal-ai/kling-video/v3/pro/image-to-video',
    'fal-ai/luma-dream-machine/ray-2/image-to-video',
  ],
};

const RAW_GALLERY_BY_TIER: Record<AiModelTier, readonly string[]> = {
  starter: [
    'fal-ai/kling-video/v1.6/standard/image-to-video',
    'fal-ai/luma-dream-machine/ray-2/image-to-video',
  ],
  agency: [
    'fal-ai/kling-video/v1.6/standard/image-to-video',
    'fal-ai/luma-dream-machine/ray-2/image-to-video',
  ],
  premium: [
    'fal-ai/kling-video/v1.6/pro/image-to-video',
    'fal-ai/luma-dream-machine/ray-2/image-to-video',
  ],
};

export function resolveFalI2vModelChain(
  kind: FalI2vChainKind,
  tier?: AiModelTier,
): readonly string[] {
  const t = tier ?? resolveAiModelTier();
  const chain = kind === 'story_motion' ? STORY_MOTION_BY_TIER[t] : RAW_GALLERY_BY_TIER[t];
  return chain.filter((id) => !DEPRECATED_FAL_I2V_MODELS.has(id));
}

export function isKlingI2vModel(modelId: string): boolean {
  return modelId.includes('kling-video');
}

export function isLumaRayI2vModel(modelId: string): boolean {
  return modelId.includes('luma-dream-machine/ray-') || modelId.startsWith('luma/agent/ray');
}

export interface FalI2vEnqueueInput {
  imageUrl: string;
  prompt: string;
  /** Kling numeric seconds; Luma uses `"5s"` string internally. */
  durationSecs?: number;
  aspectRatio?: '9:16' | '16:9';
  preserveExistingText?: boolean;
  /** Luma Ray-2/3 — starter/agency default 540p to match test cost profile. */
  lumaResolution?: '540p' | '720p';
}

export function buildFalI2vEnqueuePayload(
  modelId: string,
  input: FalI2vEnqueueInput,
): Record<string, unknown> {
  const durationSecs = input.durationSecs ?? 5;
  const aspectRatio = input.aspectRatio ?? '9:16';
  const preserveText = input.preserveExistingText === true;

  if (isLumaRayI2vModel(modelId)) {
    return {
      prompt: input.prompt,
      image_url: input.imageUrl,
      aspect_ratio: aspectRatio,
      duration: durationSecs <= 5 ? '5s' : '9s',
      resolution: input.lumaResolution ?? '540p',
    };
  }

  const negativePrompt = preserveText
    ? 'text distortion, letter mutation, blurred text, cropped letters, missing characters, extra characters, rewritten text, typography change, font change, text movement, text warp, text bend, logo distortion, logo redraw, logo morph, logo recolor, logo replacement, fake brand mark, camera pan, camera tilt, camera zoom, reframing, composition change, low quality, artifacts'
    : 'text, typography, letters, words, captions, subtitles, watermarks, logos, brand names, numbers, signs, labels, blur, distort, low quality, fast motion, zoom, shake';

  if (modelId.includes('/v3/')) {
    return {
      prompt: input.prompt,
      start_image_url: input.imageUrl,
      duration: durationSecs,
      aspect_ratio: aspectRatio,
      negative_prompt: negativePrompt,
    };
  }

  // Kling v1.x raw gallery I2V
  return {
    prompt: input.prompt,
    image_url: input.imageUrl,
    duration: durationSecs,
    aspect_ratio: aspectRatio,
  };
}

/** Parse fal queue enqueue error for structured logging. */
export function formatFalEnqueueError(status: number, body: string): string {
  const trimmed = body.trim().slice(0, 400);
  if (status === 403 && trimmed.includes('Exhausted balance')) {
    return `enqueue failed ${status}: fal.ai balance exhausted — top up at fal.ai/dashboard/billing`;
  }
  if (status === 404 || trimmed.toLowerCase().includes('deprecated') || trimmed.includes('not found')) {
    return `enqueue failed ${status}: model unavailable or deprecated — ${trimmed.slice(0, 200)}`;
  }
  return `enqueue failed ${status}: ${trimmed.slice(0, 200)}`;
}
