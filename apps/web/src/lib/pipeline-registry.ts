/**
 * Pipeline Registry — single source of truth for production pipeline metadata.
 *
 * Why this exists
 * ---------------
 * Pipeline classification used to be spread across ad-hoc string comparisons in
 * `production-loop.ts` (`pipeline === 'fal_reel'`, `isFalOnly* `, …) and a set of
 * predicate functions in `fal-video.ts`. Adding or reclassifying a pipeline meant
 * editing several call sites (an Open/Closed violation).
 *
 * This registry is the canonical descriptor table. Classification helpers derive
 * their answers from it, so adding a pipeline = adding one row here. The legacy
 * predicates in `fal-video.ts` now delegate to these helpers, keeping every
 * existing call site behavior-identical (proven by `pipeline-registry.test.ts`).
 */

export type PipelineFamily =
  | 'remotion' // Remotion-rendered (shares the render gate)
  | 'fal_video' // fal.ai designer video track (fal_story / fal_reel)
  | 'fal_design' // fal.ai / GPT-image designed still post (fal_design)
  | 'fal_only' // pure fal.ai slots (fal_only_*)
  | 'gallery' // direct gallery photo attach (no render)
  | 'product_showcase' // product scene studio
  | 'other';

export interface PipelineDescriptor {
  /** Canonical pipeline key as stored on an assignment. */
  readonly key: string;
  readonly family: PipelineFamily;
  /** Produces a video artifact (vs. a still image). */
  readonly isVideo: boolean;
  /** Competes for the global Remotion render concurrency gate. */
  readonly isRenderBound: boolean;
  /** Routes through the fal.ai designer (typography/design card) path. */
  readonly usesFalDesigner: boolean;
  /** Whether a failed slot of this pipeline is worth retrying. */
  readonly retryable: boolean;
}

function d(
  key: string,
  family: PipelineFamily,
  opts: Partial<Omit<PipelineDescriptor, 'key' | 'family'>> = {},
): PipelineDescriptor {
  return {
    key,
    family,
    isVideo: opts.isVideo ?? false,
    isRenderBound: opts.isRenderBound ?? false,
    usesFalDesigner: opts.usesFalDesigner ?? false,
    retryable: opts.retryable ?? false,
  };
}

/** Canonical table. Add a new pipeline by adding one row here. */
export const PIPELINE_REGISTRY: Readonly<Record<string, PipelineDescriptor>> = {
  // Remotion render-bound family
  remotion_story: d('remotion_story', 'remotion', { isVideo: true, isRenderBound: true, retryable: true }),
  remotion_poster: d('remotion_poster', 'remotion', { isRenderBound: true, retryable: true }),
  remotion_post: d('remotion_post', 'remotion', { isRenderBound: true, retryable: true }),

  // fal.ai designer video track
  fal_story: d('fal_story', 'fal_video', { usesFalDesigner: true, retryable: true }),
  fal_reel: d('fal_reel', 'fal_video', { isVideo: true, usesFalDesigner: true, retryable: true }),
  /** @deprecated — legacy assignments; routes same as fal_reel. */
  runway_reel: d('runway_reel', 'fal_video', { isVideo: true, usesFalDesigner: true, retryable: true }),

  // fal.ai / GPT-image designed still post
  fal_design: d('fal_design', 'fal_design', { usesFalDesigner: true, retryable: true }),

  // pure fal.ai slots
  fal_only_post: d('fal_only_post', 'fal_only', { usesFalDesigner: true, retryable: true }),
  fal_only_story: d('fal_only_story', 'fal_only', { isVideo: true, usesFalDesigner: true, retryable: true }),
  fal_only_reel: d('fal_only_reel', 'fal_only', { isVideo: true, usesFalDesigner: true, retryable: true }),

  // gallery + product
  gallery_photo: d('gallery_photo', 'gallery', { retryable: false }),
  product_showcase: d('product_showcase', 'product_showcase', { isVideo: true, retryable: true }),
};

function normalize(pipeline: string | undefined | null): string {
  return String(pipeline ?? '').trim();
}

/** Descriptor for a pipeline key, or `undefined` for unknown/empty keys. */
export function getPipelineDescriptor(
  pipeline: string | undefined | null,
): PipelineDescriptor | undefined {
  return PIPELINE_REGISTRY[normalize(pipeline)];
}

function inFamily(pipeline: string | undefined | null, family: PipelineFamily): boolean {
  return getPipelineDescriptor(pipeline)?.family === family;
}

// ── Classification helpers (registry-derived) ────────────────────────────────
// These reproduce the exact semantics of the legacy `fal-video.ts` predicates;
// see `pipeline-registry.test.ts` for the parity proof.

/** fal.ai designer video track: `fal_story` | `fal_reel`. */
export function isFalVideoPipeline(pipeline: string | undefined | null): boolean {
  return inFamily(pipeline, 'fal_video');
}

/** fal.ai/GPT-image designed still feed post: `fal_design`. */
export function isFalDesignPipeline(pipeline: string | undefined | null): boolean {
  return inFamily(pipeline, 'fal_design');
}

/** Pure fal.ai slots (no gallery/GPT/Remotion/Runway): `fal_only_*`. */
export function isFalOnlyPipeline(pipeline: string | undefined | null): boolean {
  return inFamily(pipeline, 'fal_only');
}

/** fal-only video slots: `fal_only_story` | `fal_only_reel`. */
export function isFalOnlyVideoPipeline(pipeline: string | undefined | null): boolean {
  const desc = getPipelineDescriptor(pipeline);
  return desc?.family === 'fal_only' && desc.isVideo;
}

/** fal-only still post slot: `fal_only_post`. */
export function isFalOnlyPostPipeline(pipeline: string | undefined | null): boolean {
  const desc = getPipelineDescriptor(pipeline);
  return desc?.family === 'fal_only' && !desc.isVideo;
}

/** Remotion render-gate-bound pipelines. */
export function isRenderBoundPipeline(pipeline: string | undefined | null): boolean {
  return getPipelineDescriptor(pipeline)?.isRenderBound ?? false;
}

/** Whether the pipeline produces a video artifact. */
export function isVideoPipeline(pipeline: string | undefined | null): boolean {
  return getPipelineDescriptor(pipeline)?.isVideo ?? false;
}
