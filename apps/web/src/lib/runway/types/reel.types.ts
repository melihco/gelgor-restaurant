/**
 * Runway Reel Generation — Type Definitions
 *
 * All input/output contracts for the Runway video generation pipeline.
 * Designed to be the canonical interface between the CrewAI upstream
 * and the Runway API downstream.
 */

// ── Input ──────────────────────────────────────────────────────────────────

/**
 * Supported vertical portrait ratios for Instagram Reels.
 * Maps to Runway API ratio format (width:height).
 * Gen 4.5 portrait options: 720:1280 | 832:1104 | 672:1584
 */
export type ReelRatio = '720:1280' | '832:1104' | '672:1584';

/**
 * Supported durations for Gen 4.5 (seconds).
 * Runway only accepts 5 or 10 for Gen 4.5.
 */
export type ReelDuration = 5 | 10;

/**
 * Visual style presets that map to cinematic prompt language.
 */
export type VisualStyle =
  | 'cinematic'
  | 'lifestyle'
  | 'minimalist'
  | 'dramatic'
  | 'warm'
  | 'editorial'
  | 'documentary'
  | 'luxury'
  | 'energetic'
  | 'soft';

/**
 * Camera motion presets mapped to Runway-compatible descriptors.
 */
export type CameraMotion =
  | 'static'
  | 'slow_pan'
  | 'dolly_in'
  | 'dolly_out'
  | 'orbit'
  | 'tracking'
  | 'handheld'
  | 'tilt_up'
  | 'tilt_down';

/**
 * Main input model for reel generation.
 * Accepts both structured CrewAI JSON output and raw text prompts.
 */
export interface ReelGenerationInput {
  /** Short title for logging / artifact naming */
  title: string;

  /** Content concept description from CrewAI */
  concept: string;

  /** Always "instagram" for Reels */
  platform: 'instagram';

  /** Content sub-type: post, reel, story, ad */
  contentType: string;

  /** Override: provide an explicit text prompt instead of building from concept */
  promptText?: string;

  /**
   * Input image for image-to-video mode.
   * Accepts:
   * - HTTPS URL (must respond to HEAD, no redirects, max 16MB)
   * - Data URI: "data:image/png;base64,..."
   * - Base64 string (will be auto-wrapped as data URI if provided)
   */
  promptImage?: string;
  /**
   * Multiple gallery photos for gen4.5 multi-image mode.
   * When provided, gen4.5 uses these as reference frames for style/content consistency.
   * Max 4 images. Each must be a HTTPS URL.
   */
  promptImages?: string[];

  /**
   * Video duration in seconds.
   * Must be 5 or 10 for Gen 4.5. Defaults to 10.
   */
  duration?: ReelDuration;

  /**
   * Output aspect ratio. Defaults to "720:1280" (9:16 portrait for Reels).
   * "9:16" will be mapped to "720:1280" automatically.
   */
  ratio?: ReelRatio | '9:16';

  /** Visual style hint used in prompt building */
  visualStyle?: VisualStyle | string;

  /** Camera movement hint used in prompt building */
  cameraMotion?: CameraMotion | string;

  /** Brand tone: friendly, professional, energetic, luxury, etc. */
  brandTone?: string;

  /** Target audience description for prompt tuning */
  targetAudience?: string;

  /** Call to action (used in prompt ending hook) */
  cta?: string;

  /** Hashtag hints for scene context (NOT appended to video, used for prompt context) */
  tags?: string[];

  /** Additional scene metadata from CrewAI (flexible key-value) */
  sceneMetadata?: Record<string, unknown>;

  // ── AI Director Prompt context ──────────────────────────────────────────
  /** Description of the matched gallery photo (from gallery_analysis) */
  photoDescription?: string;
  /** One-line frame moment from gallery vision */
  photoSceneMoment?: string;
  /** Subtle i2v motions derived from photo subjects */
  photoMicroMotions?: string[];
  photoMood?: string;
  photoUsageContext?: string;
  photoPairingKeywords?: string[];
  /** Content tags of the matched gallery photo */
  photoTags?: string[];
  /** Brand vibe profile for color grading / motion injection */
  vibeProfile?: {
    grading?: { look?: string; lut_directive?: string };
    palette?: { primary?: string; accent?: string; palette_description?: string };
    motion?: { camera_movement?: string; pace?: string };
    composition?: { framing_rules?: string };
  };
  /** BrandTheme grading for color grade injection */
  brandThemeGrading?: { look?: string; lut_directive?: string };
  /**
   * The actual Instagram caption written by CrewAI for this content piece.
   * The AI director prompt generator uses this to determine WHAT the video must SHOW —
   * the visual narrative should match what the caption SAYS.
   * Separate from `concept` which carries vibe/style context.
   */
  caption?: string;
  /** VPS image_edit_prompt / scene brief slice for director grounding */
  agentVisualDirection?: string;
  /** hero = gen4.5 premium quality; standard = gen4_turbo (mission budget) */
  qualityTier?: 'hero' | 'standard';
}

// ── Output ─────────────────────────────────────────────────────────────────

/** Possible task statuses from Runway API */
export type TaskStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'THROTTLED';

/**
 * Normalized output returned by the service.
 * Always populated regardless of success/failure.
 */
export interface ReelGenerationResult {
  /** Whether the generation succeeded */
  success: boolean;

  /** Runway task ID for tracing / re-fetching */
  taskId: string;

  /** Final task status */
  status: TaskStatus;

  /** Model used for generation */
  model: string;

  /** Exact prompt sent to Runway */
  promptText: string;

  /** Direct CDN URLs of generated video(s) */
  outputUrls: string[];

  /** Raw task response from Runway SDK for full audit trail */
  rawResponse: unknown;

  /** Human-readable error message on failure */
  error?: string;

  /** Generation metadata */
  metadata: {
    ratio: ReelRatio;
    duration: ReelDuration;
    mode: 'text-to-video' | 'image-to-video';
    generatedAt: string;
    inputTitle: string;
  };
}

// ── Internal ───────────────────────────────────────────────────────────────

/** Internal normalized request passed to Runway SDK */
export interface RunwayTaskRequest {
  model: string;
  promptText: string;
  promptImage?: string;
  ratio: ReelRatio;
  duration: ReelDuration;
}

/** Prompt builder context passed to reel-prompt.builder */
export interface PromptBuilderContext {
  title: string;
  concept: string;
  visualStyle?: string;
  cameraMotion?: string;
  brandTone?: string;
  targetAudience?: string;
  cta?: string;
  tags?: string[];
  sceneMetadata?: Record<string, unknown>;
}

// ── CrewAI ↔ Runway bridge types ───────────────────────────────────────────

/**
 * Shape of the CrewAI content_agent JSON output for a single idea.
 * The service accepts this directly and converts it to ReelGenerationInput.
 */
export interface CrewAIContentIdea {
  title?: string;
  type?: string;
  caption?: string;
  hashtags?: string[];
  image_prompt?: string;
  best_time?: string;
  visual_direction?: string;
  strategic_purpose?: string;
  production_notes?: string;
}

/**
 * Utility to convert a CrewAI content idea into a ReelGenerationInput.
 */
export function crewAIIdeaToReelInput(
  idea: CrewAIContentIdea,
  brandContext?: {
    brandName?: string;
    brandTone?: string;
    targetAudience?: string;
    visualStyle?: string;
  },
): ReelGenerationInput {
  return {
    title: idea.title ?? 'AI Generated Reel',
    concept: [
      idea.visual_direction,
      idea.caption,
      idea.production_notes,
    ]
      .filter(Boolean)
      .join('. '),
    platform: 'instagram',
    contentType: idea.type ?? 'reel',
    promptImage: undefined,
    duration: 10,
    ratio: '720:1280',
    visualStyle: brandContext?.visualStyle ?? 'cinematic',
    brandTone: brandContext?.brandTone ?? 'professional',
    targetAudience: brandContext?.targetAudience,
    tags: idea.hashtags,
    sceneMetadata: {
      imagePrompt: idea.image_prompt,
      strategicPurpose: idea.strategic_purpose,
      bestTime: idea.best_time,
    },
  };
}
