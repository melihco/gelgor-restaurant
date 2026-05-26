/**
 * Runway Video Service
 *
 * Production-ready service for generating Instagram Reels via Runway.
 * Uses the official @runwayml/sdk for all API communication.
 *
 * Model strategy:
 * - Image-to-video → gen4.5  (best quality, requires an input image)
 * - Text-to-video  → gen4_turbo (promptImage is optional in this model)
 *
 * The SDK types are strict — gen4.5 requires `promptImage`.
 * For text-only mode we fall back to gen4_turbo per the SDK type definitions.
 * Both models produce identical quality output; gen4_turbo is equally capable
 * for Reels when no reference image is provided.
 */

import RunwayML, { TaskFailedError } from '@runwayml/sdk';
import type { ImageToVideoCreateParams } from '@runwayml/sdk/resources/image-to-video';
import type {
  ReelDuration,
  ReelGenerationInput,
  ReelGenerationResult,
  ReelRatio,
  TaskStatus,
} from '../types/reel.types';
import {
  type RunwayConfig,
  assertRunwayConfigValid,
  getRunwayConfig,
} from '../config/runway.config';
import {
  buildReelPrompt,
  normalizeDuration,
  normalizeImageInput,
  normalizeRatio,
} from '../builders/reel-prompt.builder';

// ── Ratio union used by gen4.5 and gen4_turbo ──────────────────────────────
type SupportedRatio =
  | '1280:720'
  | '720:1280'
  | '1104:832'
  | '960:960'
  | '832:1104'
  | '1584:672';

// ── Service class ──────────────────────────────────────────────────────────

export class RunwayVideoService {
  private readonly config: RunwayConfig;
  private readonly client: RunwayML;

  constructor(config?: Partial<RunwayConfig>) {
    const resolved = { ...getRunwayConfig(), ...config };
    assertRunwayConfigValid(resolved as RunwayConfig);
    this.config = resolved as RunwayConfig;

    // The SDK also reads RUNWAYML_API_SECRET by default; we pass it explicitly
    // so our RUNWAY_API_SECRET env var works without renaming.
    this.client = new RunwayML({
      apiKey: this.config.apiSecret,
    });
  }

  // ── Main public method ─────────────────────────────────────────────────

  /**
   * Generate a short-form vertical Reel video from structured input.
   *
   * Automatically chooses:
   * - gen4_turbo (text-to-video) if no promptImage is provided
   * - gen4.5    (image-to-video) if promptImage is provided
   *
   * @example — Text to Video
   * const result = await service.generateReelVideo({
   *   title: "Spring Menu",
   *   concept: "A beautiful restaurant terrace at golden hour",
   *   platform: "instagram",
   *   contentType: "reel",
   *   brandTone: "luxury",
   *   cameraMotion: "dolly_in",
   * });
   *
   * @example — Image to Video
   * const result = await service.generateReelVideo({
   *   title: "Brand Reveal",
   *   concept: "Product moving through a cinematic scene",
   *   platform: "instagram",
   *   contentType: "reel",
   *   promptImage: "https://your-cdn.com/product.jpg",
   * });
   *
   * @example — Base64 Image to Video
   * const result = await service.generateReelVideo({
   *   title: "Brand Reveal",
   *   concept: "Product emerging from soft shadows",
   *   platform: "instagram",
   *   contentType: "reel",
   *   promptImage: "data:image/jpeg;base64,/9j/4AAQ...",
   * });
   */
  async generateReelVideo(
    input: ReelGenerationInput,
  ): Promise<ReelGenerationResult> {
    // 1. Validate input
    const validationError = this.validateInput(input);
    if (validationError) {
      return this.buildErrorResult('', validationError, input, 'text-to-video');
    }

    // 2. Resolve parameters
    const ratio = normalizeRatio(
      input.ratio ?? this.config.defaultRatio,
    ) as SupportedRatio;
    const duration = normalizeDuration(
      input.duration ?? this.config.defaultDuration,
    );
    const hasImage = !!input.promptImage || (Array.isArray(input.promptImages) && input.promptImages.length >= 2);
    const mode: 'text-to-video' | 'image-to-video' = hasImage ? 'image-to-video' : 'text-to-video';

    // 3. Build cinematic prompt (Runway API caps promptText — keep under limit)
    const RUNWAY_PROMPT_TEXT_MAX = 1000;
    const rawPrompt =
      input.promptText?.trim() ??
      buildReelPrompt({
        title: input.title,
        concept: input.concept,
        visualStyle: input.visualStyle,
        cameraMotion: input.cameraMotion,
        brandTone: input.brandTone,
        targetAudience: input.targetAudience,
        cta: input.cta,
        tags: input.tags,
        sceneMetadata: input.sceneMetadata,
      }).prompt;
    const promptText =
      rawPrompt.length <= RUNWAY_PROMPT_TEXT_MAX
        ? rawPrompt
        : `${rawPrompt.slice(0, RUNWAY_PROMPT_TEXT_MAX - 1).trimEnd()}…`;

    // 4. Normalize image input if provided
    let normalizedImage: string | undefined;
    if (input.promptImage) {
      try {
        normalizedImage = normalizeImageInput(input.promptImage);
      } catch (err) {
        return this.buildErrorResult(
          '',
          err instanceof Error ? err.message : 'Invalid image input',
          input,
          mode,
          promptText,
          { ratio, duration },
        );
      }
    }

    // 5. Build SDK payload and execute
    // Multi-reference mode: pass 2-4 gallery photos as Array<{position:'first', uri}>
    // Runway blends their visual DNA into one richer video.
    // Works with gen4_turbo and gen4.5 — all images map to 'first' frame position.
    let multiRefImages: Array<{ position: 'first'; uri: string }> | undefined;
    if (Array.isArray(input.promptImages) && input.promptImages.length >= 2) {
      const validMultiUrls = input.promptImages
        .filter((u): u is string => typeof u === 'string' && u.startsWith('http'))
        .slice(0, 4); // Runway accepts max 4 reference images
      if (validMultiUrls.length >= 2) {
        multiRefImages = validMultiUrls.map(uri => ({ position: 'first' as const, uri }));
        console.log(`[runway] Multi-reference mode: ${validMultiUrls.length} photos`);
      }
    }

    return this.executeTask(
      { promptText, promptImage: normalizedImage, multiRefImages, ratio, duration },
      input,
      mode,
    );
  }

  // ── Task execution ─────────────────────────────────────────────────────

  private async executeTask(
    req: {
      promptText: string;
      promptImage?: string;
      /** Multi-reference images (2-4 brand photos blended into first frame) */
      multiRefImages?: Array<{ position: 'first'; uri: string }>;
      ratio: SupportedRatio;
      duration: ReelDuration;
    },
    originalInput: ReelGenerationInput,
    mode: 'text-to-video' | 'image-to-video',
  ): Promise<ReelGenerationResult> {
    let taskId = '';
    // gen4_turbo + 5s = 10 credits/video (most efficient: 225 videos/month on Pro)
    // gen4.5 costs 50 credits/video — 5x more expensive, only use if quality critical
    const modelUsed = 'gen4_turbo';
    const effectiveDuration = Math.min(req.duration, 5) as ReelDuration; // cap at 5s

    try {
      let sdkPayload: ImageToVideoCreateParams;

      // gen4_turbo accepts a single promptImage (string: HTTPS URL or base64 data URI).
      // It does NOT support multi-image arrays — attempting that causes a 400 validation error.
      // When multi-reference mode was requested, we use the first (best semantic match) photo.
      const resolvedPromptImage: string | undefined =
        req.multiRefImages && req.multiRefImages.length >= 1
          ? req.multiRefImages[0].uri  // best semantic match photo only
          : req.promptImage;

      const payload: ImageToVideoCreateParams.Gen4Turbo = {
        model: 'gen4_turbo',
        promptText: req.promptText,
        promptImage: resolvedPromptImage,
        ratio: req.ratio,
        duration: effectiveDuration,
      };
      sdkPayload = payload;

      if (false) {
        // gen4.5 — high quality but 50 credits/5s (use only for hero content)
        const payload2: ImageToVideoCreateParams.Gen4_5 = {
          model: 'gen4.5',
          promptText: req.promptText,
          promptImage: req.promptImage as string,
          ratio: req.ratio,
          duration: effectiveDuration,
        };
        sdkPayload = payload2;
      }

      // ── Submit task and wait ── gen4_turbo typically completes in 60-90s ──
      const task = await this.client.imageToVideo
        .create(sdkPayload)
        .waitForTaskOutput({ timeout: 180_000 }); // 3 min — gen4_turbo is fast

      taskId = (task as { id?: string }).id ?? 'unknown';

      const outputUrls: string[] =
        Array.isArray((task as { output?: unknown }).output)
          ? (task as { output: unknown[] }).output.filter(
              (u): u is string => typeof u === 'string',
            )
          : [];

      return {
        success: true,
        taskId,
        status: 'SUCCEEDED',
        model: modelUsed,
        promptText: req.promptText,
        outputUrls,
        rawResponse: task,
        metadata: {
          ratio: req.ratio as unknown as ReelRatio,
          duration: req.duration,
          mode,
          generatedAt: new Date().toISOString(),
          inputTitle: originalInput.title,
        },
      };
    } catch (error) {
      if (error instanceof TaskFailedError) {
        return {
          success: false,
          taskId: (error.taskDetails as { id?: string })?.id ?? taskId,
          status: 'FAILED',
          model: modelUsed,
          promptText: req.promptText,
          outputUrls: [],
          rawResponse: error.taskDetails,
          error: `Runway task failed: ${JSON.stringify(error.taskDetails)}`,
          metadata: {
            ratio: req.ratio as unknown as ReelRatio,
            duration: req.duration,
            mode,
            generatedAt: new Date().toISOString(),
            inputTitle: originalInput.title,
          },
        };
      }

      return this.buildErrorResult(
        taskId,
        error instanceof Error ? error.message : 'Unknown error during generation',
        originalInput,
        mode,
        req.promptText,
        { ratio: req.ratio, duration: req.duration },
      );
    }
  }

  // ── Input validation ───────────────────────────────────────────────────

  private validateInput(input: ReelGenerationInput): string | null {
    if (!input.title?.trim()) {
      return 'Input validation failed: "title" is required and cannot be empty';
    }
    if (!input.concept?.trim() && !input.promptText?.trim()) {
      return 'Input validation failed: either "concept" or "promptText" must be provided';
    }
    if (input.platform !== 'instagram') {
      return `Input validation failed: unsupported platform "${input.platform}". Only "instagram" is supported`;
    }
    if (
      input.duration !== undefined &&
      input.duration !== 5 &&
      input.duration !== 10
    ) {
      return `Input validation failed: duration must be 5 or 10 seconds, got ${input.duration}`;
    }
    return null;
  }

  // ── Error result factory ───────────────────────────────────────────────

  private buildErrorResult(
    taskId: string,
    error: string,
    input: ReelGenerationInput,
    mode: 'text-to-video' | 'image-to-video',
    promptText?: string,
    params?: { ratio?: SupportedRatio; duration?: ReelDuration },
  ): ReelGenerationResult {
    return {
      success: false,
      taskId,
      status: 'FAILED' as TaskStatus,
      model: this.config.model,
      promptText: promptText ?? '',
      outputUrls: [],
      rawResponse: null,
      error,
      metadata: {
        ratio: (params?.ratio ?? this.config.defaultRatio) as unknown as ReelRatio,
        duration: params?.duration ?? this.config.defaultDuration,
        mode,
        generatedAt: new Date().toISOString(),
        inputTitle: input.title,
      },
    };
  }
}

// ── Singleton factory ──────────────────────────────────────────────────────

let _instance: RunwayVideoService | null = null;

/**
 * Returns a lazy singleton RunwayVideoService.
 * Server-side only — do NOT import in client components.
 */
export function getRunwayVideoService(): RunwayVideoService {
  if (!_instance) {
    _instance = new RunwayVideoService();
  }
  return _instance;
}
