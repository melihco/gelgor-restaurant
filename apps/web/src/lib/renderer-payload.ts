/**
 * Renderer payload builder + Prompt Integrity Score (PIS) — Sprint 4.
 *
 * Single place that turns a normalised `ProductionIdea` + brand context +
 * (optional) gallery photo metadata into the exact request body each renderer
 * expects. Previously every call site hand-built bodies and dropped fields
 * (e.g. AutoProductionFeed's Canva path lost canvaFieldCopy / VPS /
 * template_use_case). Centralising guarantees every renderer is fully fed.
 *
 * PIS = per-renderer completeness check so we can gate / audit before
 * autonomous production. See docs/foundation-sprint-program.md § Sprint 4.
 */

import type { ProductionIdea, ProductionRenderer } from '@/types/production-idea';
import type { ProductionPipeline } from '@/lib/mission-production-manifest';
import { productionIdeaToRecord } from '@/lib/production-idea-parse';
import { resolveReelCameraMotionForFidelity } from './reel-motion-fidelity';
import { normalizeSectorId } from './sector-production-profile';

/** Minimum PIS before auto-produce runs a slot (Foundation S4 / APO-3). */
export const PIS_PRODUCTION_MIN_SCORE = 70;

export interface RendererBrandContext {
  brandName: string;
  location?: string;
  logoUrl?: string;
  businessType?: string;
  visualStyle?: string;
  brandTone?: string;
  targetAudience?: string;
  /** BrandTheme grading hints, when available. */
  themeGrading?: { look?: string; lutDirective?: string; paletteDescription?: string };
  /** Brand vibe profile object (passed through to image/event renderers). */
  vibeProfile?: unknown;
  missionBrief?: string;
}

export interface RendererGalleryMeta {
  photoUrl: string | null;
  description?: string;
  tags?: string[];
  /** Match score 0..100 of the chosen photo (Sprint 2 GIS). */
  matchScore?: number;
  /** One-line frame summary from gallery vision (I2V fidelity). */
  sceneMoment?: string;
  /** Subtle i2v motions derived from visible subjects. */
  microMotions?: string[];
  photoMood?: string;
  usageContext?: string;
  pairingKeywords?: string[];
  hasPeople?: boolean;
}

// ── Reel (fal.ai I2V) ─────────────────────────────────────────────────────────

export interface ReelPayload {
  title: string;
  caption: string;
  concept: string;
  platform: 'instagram';
  contentType: 'reel';
  duration: number;
  cameraMotion: string;
  ratio: string;
  visualStyle: string;
  brandTone: string;
  targetAudience: string;
  tags: string[];
  promptImage: string;
  sceneMetadata: {
    brandName: string;
    location: string;
    photoDescription?: string;
    photoTags?: string[];
    agentVisualDirection?: string;
  };
}

export function buildReelPayload(
  idea: ProductionIdea,
  brand: RendererBrandContext,
  gallery: RendererGalleryMeta,
  opts?: { cameraMotion?: string; reelPace?: string; sector?: string },
): ReelPayload {
  const vibeMotion = (brand.vibeProfile as { motion?: { camera_movement?: string; pace?: string } } | undefined)?.motion;
  const sectorId = normalizeSectorId(opts?.sector ?? brand.businessType);
  const defaultCamera = resolveReelCameraMotionForFidelity({
    agentCamera: opts?.cameraMotion,
    vibeCamera: vibeMotion?.camera_movement,
    mood: brand.visualStyle,
    reelPace: opts?.reelPace,
    vibePace: vibeMotion?.pace,
    sector: sectorId,
  });
  const vibeClause = brand.themeGrading
    ? `Visual style: ${brand.themeGrading.look ?? ''}. Palette: ${brand.themeGrading.paletteDescription ?? ''}. ${brand.themeGrading.lutDirective ?? ''}.`.trim()
    : '';
  const motionHint = idea.visualProductionSpec.imageEditPrompt || idea.caption;
  const learningHint = brand.missionBrief?.trim();
  const concept = [motionHint, vibeClause, learningHint].filter(Boolean).join(' ').trim()
    || idea.caption
    || idea.headline;

  return {
    title: idea.headline || `${brand.brandName} Reel`,
    caption: idea.caption,
    concept,
    platform: 'instagram',
    contentType: 'reel',
    duration: 5,
    cameraMotion: opts?.cameraMotion ?? defaultCamera,
    ratio: '720:1280',
    visualStyle: brand.themeGrading?.look ?? brand.visualStyle ?? 'cinematic editorial',
    brandTone: brand.brandTone ?? idea.canvaFieldCopy.subtitle ?? '',
    targetAudience: brand.targetAudience ?? '',
    tags: idea.hashtags.slice(0, 5),
    promptImage: gallery.photoUrl ?? '',
    sceneMetadata: {
      brandName: brand.brandName,
      location: brand.location ?? '',
      photoDescription: gallery.description,
      photoTags: gallery.tags,
      ...(idea.visualProductionSpec.imageEditPrompt
        ? { agentVisualDirection: idea.visualProductionSpec.imageEditPrompt.slice(0, 400) }
        : {}),
    },
  };
}

// ── Instagram image (photo / design card) ───────────────────────────────────────

export interface InstagramImagePayload {
  title: string;
  caption: string;
  concept: string;
  campaignContext: string;
  contentType: 'post' | 'story' | 'reel';
  brandName: string;
  location: string;
  visualStyle: string;
  referenceImageUrls: string[];
  designCardPrompt?: string;
  assetIntent?: string;
  logoUrl?: string;
  workspaceId?: string;
  postTemplateId?: string;
  layoutSpec?: Record<string, unknown>;
}

export function buildInstagramImagePayload(
  idea: ProductionIdea,
  brand: RendererBrandContext,
  gallery: RendererGalleryMeta,
  opts?: {
    designCard?: boolean;
    extraRefs?: string[];
    workspaceId?: string;
    postTemplateId?: string;
    layoutSpec?: Record<string, unknown>;
  },
): InstagramImagePayload {
  const ct = idea.format === 'story' ? 'story' : idea.format === 'reel' ? 'reel' : 'post';
  const refs = [gallery.photoUrl, ...(opts?.extraRefs ?? [])].filter(
    (u): u is string => typeof u === 'string' && u.length > 0,
  );
  const editPrompt = idea.visualProductionSpec.imageEditPrompt;
  return {
    title: idea.headline || `${brand.brandName} içerik`,
    caption: idea.caption,
    concept: editPrompt || idea.caption,
    campaignContext: brand.missionBrief || editPrompt || '',
    contentType: ct,
    brandName: brand.brandName,
    location: brand.location ?? '',
    visualStyle: brand.visualStyle ?? brand.themeGrading?.look ?? '',
    referenceImageUrls: refs,
    designCardPrompt: opts?.designCard ? editPrompt || undefined : undefined,
    assetIntent: idea.assetIntent,
    logoUrl: brand.logoUrl,
    workspaceId: opts?.workspaceId,
    postTemplateId: opts?.postTemplateId,
    layoutSpec: opts?.layoutSpec,
  };
}

// ── Announcement / event card ────────────────────────────────────────────────────

export interface EventCardPayload {
  photoUrl: string;
  contentType: 'story' | 'post';
  templateId: string;
  brandName: string;
  location: string;
  workspaceId?: string;
  eventName: string;
  tagline?: string;
  date?: string;
  enhancePhoto: boolean;
  vibeProfile?: unknown;
}

export function buildEventCardPayload(
  idea: ProductionIdea,
  brand: RendererBrandContext,
  gallery: RendererGalleryMeta,
  opts?: { templateId?: string; enhancePhoto?: boolean; workspaceId?: string },
): EventCardPayload {
  return {
    photoUrl: gallery.photoUrl ?? '',
    contentType: idea.format === 'story' ? 'story' : 'post',
    templateId: opts?.templateId ?? 'luxury_bottom',
    brandName: brand.brandName,
    location: brand.location ?? '',
    workspaceId: opts?.workspaceId,
    eventName: idea.headline || idea.canvaFieldCopy.headline || 'İçerik',
    tagline: (idea.cta || idea.caption).slice(0, 80) || undefined,
    date: idea.eventDetails?.eventDate,
    enhancePhoto: opts?.enhancePhoto ?? false,
    vibeProfile: brand.vibeProfile,
  };
}

// ── Canva idea record (full, no loss) ────────────────────────────────────────────

/**
 * Build the complete snake_case idea record for `buildCanvaMissionSignal`,
 * carrying canvaFieldCopy + template_use_case + asset_intent + VPS that the
 * thin reconstruction used to drop.
 */
export function buildCanvaIdeaRecord(
  idea: ProductionIdea,
  extras?: Record<string, unknown>,
): Record<string, unknown> {
  return { ...productionIdeaToRecord(idea), ...extras };
}

// ── PIS — Prompt Integrity Score ─────────────────────────────────────────────────

const REQUIRED_BY_RENDERER: Record<ProductionRenderer, string[]> = {
  canva: ['title', 'kind', 'canvaFieldCopy.headline'],
  reel: ['title', 'caption', 'concept', 'promptImage'],
  announcement: ['photoUrl', 'templateId', 'eventName', 'brandName'],
  photo: ['title', 'contentType', 'referenceImageUrls'],
  canvas: ['photoUrl', 'eventName'],
};

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function present(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

export interface PromptIntegrityResult {
  renderer: ProductionRenderer;
  score: number;
  missing: string[];
}

/**
 * Score a built payload's completeness for its renderer (0..100). Used to gate
 * and audit before production. Pass the actual body object you will POST.
 */
export function computePromptIntegrity(
  renderer: ProductionRenderer,
  payload: Record<string, unknown>,
): PromptIntegrityResult {
  const required = REQUIRED_BY_RENDERER[renderer] ?? [];
  if (required.length === 0) return { renderer, score: 100, missing: [] };
  const missing = required.filter((f) => !present(getPath(payload, f)));
  const score = Math.round(((required.length - missing.length) / required.length) * 100);
  return { renderer, score, missing };
}

/** Map APO pipeline → PIS renderer (payload shape differs from primaryRenderer). */
export function resolveProductionRenderer(
  pipeline: ProductionPipeline | string,
  idea: ProductionIdea,
): ProductionRenderer {
  switch (pipeline) {
    case 'marky_event':
    case 'meta_ad':
    case 'google_ad':
      // Canva retired — designed posts & ads use the announcement stack
      return 'announcement';
    case 'gallery_photo':
    case 'story_still':
    case 'carousel_gallery':
      return 'photo';
    default:
      return idea.primaryRenderer;
  }
}

/**
 * Build the payload object used for PIS gating (same builders as production POST bodies).
 * `gallery.photoUrl` may be agent-selected URL before matcher runs.
 */
export function buildPayloadForIntegrityCheck(
  renderer: ProductionRenderer,
  idea: ProductionIdea,
  brand: RendererBrandContext,
  gallery: RendererGalleryMeta,
): Record<string, unknown> {
  switch (renderer) {
    case 'reel':
      return buildReelPayload(idea, brand, gallery) as unknown as Record<string, unknown>;
    case 'photo':
      return buildInstagramImagePayload(idea, brand, gallery) as unknown as Record<string, unknown>;
    case 'announcement':
      return buildEventCardPayload(idea, brand, gallery) as unknown as Record<string, unknown>;
    case 'canva':
      // Legacy renderer id — design copy only (no Canva API); prefer announcement in new code
      return {
        title: idea.headline || brand.brandName,
        kind: idea.format,
        canvaFieldCopy: idea.canvaFieldCopy,
        ...buildCanvaIdeaRecord(idea),
      };
    case 'canvas':
      return {
        photoUrl: gallery.photoUrl ?? '',
        eventName: idea.headline || idea.canvaFieldCopy.headline || 'Event',
      };
    default:
      return { title: idea.headline };
  }
}

export function gatePromptIntegrity(
  renderer: ProductionRenderer,
  payload: Record<string, unknown>,
  minScore = PIS_PRODUCTION_MIN_SCORE,
): PromptIntegrityResult & { pass: boolean } {
  const pis = computePromptIntegrity(renderer, payload);
  return { ...pis, pass: pis.score >= minScore };
}

/** Dev-only audit log of what fields a renderer received (no-op in prod). */
export function auditRendererPayload(
  renderer: ProductionRenderer,
  payload: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV === 'production') return;
  const pis = computePromptIntegrity(renderer, payload);
  if (pis.missing.length > 0) {
    // eslint-disable-next-line no-console
    console.debug(`[PIS] ${renderer} ${pis.score}% — missing: ${pis.missing.join(', ')}`);
  }
}
