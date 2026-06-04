/**
 * ProductionIdea — unified, normalised contract for a single content idea as it
 * flows from agent output → renderer (Canva / Runway / announcement / photo).
 *
 * Sprint 1 deliverable (S1.6): the *type* is defined now as the convergence
 * target. The actual single-parse pipeline (`parseIdeas → ProductionIdea[]`) and
 * the wiring into MissionContentFactory / AutoProductionFeed land in Sprint 3 (ICS).
 *
 * Why this exists: today the same idea is parsed into `ArtifactIdea`
 * (artifact-preview.tsx) and `CanvasOutput` (canvas-output.ts) with drifting
 * fields, and `canvaFieldCopy` / `visualProductionSpec` are silently dropped in
 * `artifactIdeaToRecord`. ProductionIdea is the one shape both should normalise to.
 *
 * See docs/foundation-sprint-program.md § Sprint 3 (ICS) — "ICS 100" required fields.
 */

export type ProductionRenderer =
  | 'photo'
  | 'canva'
  | 'announcement'
  | 'runway'
  | 'canvas';

export type ProductionFormat = 'feed' | 'post' | 'story' | 'reel' | 'carousel';

export type VisualTreatment =
  | 'pure_photo'
  | 'story_event'
  | 'feed_text_overlay'
  | 'event_announcement';

export interface ProductionVisualSpec {
  treatment: VisualTreatment;
  /** Gallery photo chosen by the matcher; null = generate new image. */
  selectedGalleryUrl: string | null;
  /** Edit/generation prompt for the image renderer. */
  imageEditPrompt: string;
  /** Match score 0..100 of the selected gallery photo (Sprint 2 GIS). */
  matchScore?: number;
  shotType?: string;
  includePeople?: boolean;
}

export interface ProductionEventDetails {
  eventDate?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  priceInfo?: string;
}

export interface ProductionIdea {
  /** Stable id for dedupe / bundle grouping. */
  id: string;
  /** Originating mission, when produced from a mission. */
  missionId?: string;

  // ── Copy slots ─────────────────────────────────────────────────────────────
  headline: string;
  caption: string;
  cta: string;
  hashtags: string[];

  // ── Routing ──────────────────────────────────────────────────────────────────
  contentType: string;
  format: ProductionFormat;
  /** Which announcement/Canva template family this idea targets. */
  templateUseCase: string;
  /** Preferred renderer for the primary output. */
  primaryRenderer: ProductionRenderer;

  // ── Visual ───────────────────────────────────────────────────────────────────
  visualProductionSpec: ProductionVisualSpec;

  // ── Renderer-specific copy ─────────────────────────────────────────────────────
  /** Design-layer text, separate from the Instagram caption (Canva/announcement). */
  canvaFieldCopy: Record<string, string>;
  eventDetails?: ProductionEventDetails;

  // ── Metadata ───────────────────────────────────────────────────────────────────
  assetIntent?: string;
  postingTime?: string;
  brandConfidence?: number;
  /** Anti-pattern / learning flags raised during ideation. */
  flags?: string[];
}

/** Fields that must be present and non-empty for an idea to count as ICS-complete. */
export const ICS_REQUIRED_FIELDS = [
  'headline',
  'caption',
  'contentType',
  'cta',
  'hashtags',
  'templateUseCase',
  'visualProductionSpec.selectedGalleryUrl',
  'visualProductionSpec.imageEditPrompt',
  'canvaFieldCopy.headline',
] as const;

export interface IcsFieldStatus {
  field: string;
  present: boolean;
}

export interface IcsResult {
  /** 0..100 completeness for a single idea. */
  score: number;
  fields: IcsFieldStatus[];
  missing: string[];
}

function hasValue(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return true;
}

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

/**
 * Idea Contract Score — per-idea completeness. Used by the Hub ideation node
 * badge ("ICS: 92%") and as a hard gate before autonomous production (Sprint 3+).
 */
export function computeIdeaContractScore(idea: Partial<ProductionIdea>): IcsResult {
  const fields: IcsFieldStatus[] = ICS_REQUIRED_FIELDS.map((field) => ({
    field,
    present: hasValue(getPath(idea, field)),
  }));
  const presentCount = fields.filter((f) => f.present).length;
  const score = Math.round((presentCount / fields.length) * 100);
  return {
    score,
    fields,
    missing: fields.filter((f) => !f.present).map((f) => f.field),
  };
}
