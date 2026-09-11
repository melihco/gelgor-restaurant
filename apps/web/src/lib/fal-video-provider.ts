/**
 * Fal I2V adapter — maps a domain ReelGenerationRequest onto the selected model.
 * Director/composer stay provider-agnostic.
 */

import {
  buildFalI2vEnqueuePayload,
  isKlingI2vModel,
  isLumaRayI2vModel,
} from '@/lib/fal-i2v-models';
import type {
  IVideoGenerationProvider,
  ReelGenerationRequest,
  VideoGenerationCapabilities,
} from '@/lib/reel-creative-direction';

const KLING_V3: VideoGenerationCapabilities = {
  supportsImageToVideo: true,
  supportsMultiShot: false,
  supportsStartEndFrame: true,
  supportsReferenceImages: false,
  supportsNegativePrompt: true,
  supportsElements: false,
  supportsNativeAudio: false,
  maxDurationSeconds: 10,
};

const LUMA_RAY: VideoGenerationCapabilities = {
  supportsImageToVideo: true,
  supportsMultiShot: false,
  supportsStartEndFrame: false,
  supportsReferenceImages: false,
  supportsNegativePrompt: false,
  supportsElements: false,
  supportsNativeAudio: false,
  maxDurationSeconds: 9,
};

const KLING_V1: VideoGenerationCapabilities = {
  supportsImageToVideo: true,
  supportsMultiShot: false,
  supportsStartEndFrame: false,
  supportsReferenceImages: false,
  supportsNegativePrompt: false,
  supportsElements: false,
  supportsNativeAudio: false,
  maxDurationSeconds: 10,
};

export function resolveFalVideoCapabilities(modelId: string): VideoGenerationCapabilities {
  if (isLumaRayI2vModel(modelId)) return LUMA_RAY;
  if (modelId.includes('/v3/')) return KLING_V3;
  if (isKlingI2vModel(modelId)) return KLING_V1;
  return KLING_V3;
}

export function mapReelRequestToFalPayload(
  request: ReelGenerationRequest,
  modelId: string,
): Record<string, unknown> {
  const caps = resolveFalVideoCapabilities(modelId);
  const duration = Math.min(request.duration, caps.maxDurationSeconds);
  return buildFalI2vEnqueuePayload(modelId, {
    imageUrl: request.sourceImageUrl,
    prompt: request.prompt,
    durationSecs: duration,
    aspectRatio: request.aspectRatio,
    preserveExistingText: request.creativeDirection.preserveTypographySafeArea,
    negativePrompt: caps.supportsNegativePrompt ? request.negativePrompt : undefined,
  });
}

export const falVideoGenerationProvider: IVideoGenerationProvider = {
  id: 'fal.ai',
  capabilitiesFor: resolveFalVideoCapabilities,
};
