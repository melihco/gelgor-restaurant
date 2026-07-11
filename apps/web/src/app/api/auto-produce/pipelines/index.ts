/**
 * Pipeline module index.
 *
 * Each extracted production pipeline is encapsulated in its own module for
 * testability, retry isolation, and independent error handling. Pipeline
 * *classification* (which family a slot belongs to, render-bound, video, etc.)
 * is owned by `@/lib/pipeline-registry` — the single source of truth.
 *
 * Currently extracted as standalone, unit-testable functions:
 *   - produceFalOnlySlot     (fal_only_*)
 *   - produceFalDesignedPost (fal_design)
 *
 * Remotion (story/post/poster) and gallery-photo attachment are still driven
 * inline by production-loop.ts / remotion-render-phase.ts and are scheduled for
 * extraction behind the same pattern.
 */

export { falVideoHandler } from './fal-video-pipeline';
export { productShowcaseHandler } from './product-showcase-pipeline';
export { produceFalOnlySlot, falOnlyHandler } from './fal-only-pipeline';
export { produceFalDesignedPost, falDesignHandler } from './fal-designed-post-pipeline';
export type { FalOnlySlotInput, FalOnlySlotResult } from './fal-only-pipeline';
export type { FalDesignedPostInput, FalDesignedPostResult } from './fal-designed-post-pipeline';
export {
  runPipelineStages,
} from './pipeline-types';
export type {
  PipelineContext,
  PipelineResult,
  ProductionPipelineHandler,
  SlotProductionContext,
  SlotProductionInputs,
  SlotProductionState,
  VideoProduceMeta,
} from './pipeline-types';
