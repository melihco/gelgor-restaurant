/**
 * Shared types for production pipelines.
 */

import type { BrandProductionTokens } from '@/lib/brand-production-tokens';
import type { BrandTemplateLibrary } from '@/lib/brand-template-library';

/** Video-source metadata refined by the fal/runway video pipelines. */
export interface RunwayProduceMeta {
  source: 'runway' | 'runway_multi_photo' | 'kling' | 'luma' | 'fal_video';
  strategy?: string;
  photoCount?: number;
  cameraMotion?: string;
  reelPace?: string;
  sectorId?: string;
  i2vReused?: boolean;
  reusedFromArtifactId?: string;
}

/**
 * Mutable per-slot output, refined in order by each {@link ProductionPipelineHandler}.
 * The slot loop seeds this from its locals, runs the handlers, then writes it back.
 */
export interface SlotProductionState {
  imageUrl: string | null;
  videoUrl: string | null;
  falGrafikerScore: number | null;
  falGrafikerPass: boolean;
  falDesignEngine: string | null;
  runwayProduceMeta: RunwayProduceMeta | null;
  /** Locked brand design template applied this slot (onboarding fal set). */
  brandDesignTemplateId?: string | null;
  brandDesignTemplateType?: string | null;
  brandDesignTemplateName?: string | null;
  /** Cost accrued by handlers this slot; the loop adds it to its running estimate. */
  costDelta: number;
}

/**
 * Readonly per-slot inputs shared by the pipeline handlers. Grows as more of the
 * production-loop branches are migrated to handlers (b2b staged migration).
 */
export interface SlotProductionInputs {
  workspaceId: string;
  pipeline: string;
  slotRole: string;
  ideaIndex: number;
  librarySlotKey: string | null | undefined;
  brandTheme: Record<string, unknown> | null;
  templateLibrary: BrandTemplateLibrary | null | undefined;
  brandTokens: BrandProductionTokens;
  brandBusinessType: string;
  brandTone: string;
  resolvedBrandName: string;
  brandLocation: string;
  brandLogoUrl: string | null | undefined;
  brandReferenceImageUrls: string[];
  visualDna: string;
  brandDescription: string;
  caption: string;
  headline: string;
  cta: string;
  mood: string | undefined;
  referenceUrl: string | null;
  sceneHint: string | undefined;
  grafikerMaxRetries: number | undefined;
  designBriefDirectives: string[] | undefined;
  designerMotionCue: string | undefined;
  /** BCD-generated art direction for this brief×brand combination. */
  artDirection: string | undefined;
  /** Resolved logo placement from fal design brief (agent / archetype / brand). */
  falLogoPlacement: import('@/lib/fal-logo-placement').ResolvedFalLogoPlacement | undefined;
  isFalMissionVideo: boolean;
  isFalDesignPost: boolean;
  isFalOnlyPost: boolean;
  isFalOnlyVideo: boolean;
  isProductShowcase: boolean;
  /** New Brief form — user-intent driven fal art-director production. */
  adHocBrief?: boolean;
  /** Calendar story cards — vertical fal designed output. */
  falAspectRatio?: '9:16' | '4:5';
  /** Calendar gallery-designed track — must compose on matched gallery photo. */
  requireGroundedGallery?: boolean;
  /** Override brand design intensity (calendar defaults to photo_first). */
  falDesignIntensityOverride?: import('@/lib/fal-design-intensity').FalDesignIntensityLevel;
  /** Grid rotation — alternate background treatment vs previous feed tiles. */
  falBackgroundStyleOverride?: import('@/types/brand-theme').TypographyBackgroundStyle;
  /** Persisted on artifact metadata after fal production. */
  falGridSurfaceKind?: import('@/lib/fal-grid-surface-rotation').FalGridSurfaceKind;
  /** When false, keep calendar headline verbatim (no caption-derived headline rewrite). */
  captionAwareHeadline?: boolean;
  /** Designed tagline/subline for fal typography (calendar tagline). */
  falSubtitle?: string;
  falFontPersonality?: string;
  falHeadingFont?: string;
  falBodyFont?: string;
}

export interface SlotProductionContext {
  readonly inputs: SlotProductionInputs;
  readonly state: SlotProductionState;
}

/**
 * One production pipeline stage. `canRun` mirrors the original inline branch guard
 * exactly; `run` mutates `ctx.state` in place, preserving the loop's sequential
 * refinement semantics.
 */
export interface ProductionPipelineHandler {
  readonly name: string;
  canRun(ctx: SlotProductionContext): boolean;
  run(ctx: SlotProductionContext): Promise<void>;
}

/**
 * Dispatch: run each handler in declared order, executing a handler only when its
 * `canRun(ctx)` is true. Order MUST match the original branch order — no reordering.
 */
export async function runPipelineStages(
  ctx: SlotProductionContext,
  handlers: readonly ProductionPipelineHandler[],
): Promise<void> {
  for (const handler of handlers) {
    if (handler.canRun(ctx)) {
      await handler.run(ctx);
    }
  }
}

export interface PipelineContext {
  workspaceId: string;
  missionId: string;
  brandName: string;
  brandBusinessType: string;
  tenantId: string;
  nexusClient: {
    attachVideo: (params: Record<string, unknown>) => Promise<unknown>;
    markBundleFailed: (params: Record<string, unknown>) => Promise<unknown>;
  };
  resolvedBrandName: string;
}

export interface PipelineResult {
  success: boolean;
  artifactId?: string;
  error?: string;
  pipeline: string;
  slotRole: string;
  retryable: boolean;
}
