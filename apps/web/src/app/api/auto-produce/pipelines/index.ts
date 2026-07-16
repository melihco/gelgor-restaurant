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
 * Gallery-photo attachment (organic slots) is still driven inline by
 * production-loop.ts. Remotion rendering has been removed from the production
 * path — legacy remotion_* pipeline ids normalize to fal equivalents.
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
