/**
 * Cost-aware GPT image enhance — skip when gallery + Remotion already deliver quality.
 */
import type { ProductionAssignment } from '@/lib/mission-production-manifest';
import { GIS_PILOT_MIN_SCORE, MIN_ACCEPT_SCORE } from '@/lib/gallery-photo-matcher';
import type { ProductionProfile } from '@/lib/production-profile';
import { shouldAiEnhanceForOutput } from '@/lib/ai-visual-production-standard';
import type { AiVisualProductionStandard } from '@/lib/ai-visual-production-standard';
import { isNonVenueSector } from '@/lib/sector-gallery-seed';
import { isNonVenueSectorProfile } from '@/lib/sector-production-profile';

/** Strong caption↔photo match — no $0.21 enhance needed for organic stills. */
export const GALLERY_ENHANCE_SKIP_MIN_SCORE = GIS_PILOT_MIN_SCORE + 3;

export interface GptEnhancePolicyInput {
  visualStandard: AiVisualProductionStandard;
  contentKind: string;
  assignment: ProductionAssignment;
  businessType?: string;
  galleryMatchScore: number | null;
  pickedFromBrandGallery: boolean;
  referenceIsStock: boolean;
  willRemotionStory?: boolean;
  willRemotionPost?: boolean;
  designedPosterSync?: boolean;
  /** Photo-quality-only enhance for designed_post background before Remotion overlay. */
  designedPostPhotoEnhance?: boolean;
  /** Faz 1.4 — render-zamanı cinematic grade güçlü galeri fotoğraflarında designed_post
   * arka-plan enhance'ini gereksiz kılar. Flag (SKIP_ENHANCE_FOR_REMOTION_GRADE) açıkken
   * ve fotoğraf güçlü bir marka-galeri eşleşmesiyse enhance atlanır. */
  skipEnhanceForRemotionGrade?: boolean;
  productionProfile?: ProductionProfile | null;
}

/**
 * Returns false when enhance would add cost without visible quality gain.
 */
export type GptEnhanceSkipCode =
  | 'disabled'
  | 'format_excluded'
  | 'remotion_story'
  | 'fal_story'
  | 'remotion_post'
  | 'remotion_grade'
  | 'gallery_match_ok'
  | 'stock_only'
  | 'non_venue_saas';

/**
 * Faz 1.4 — designed_post arka-plan enhance'i, fotoğraf güçlü bir marka-galeri
 * eşleşmesiyse (stok değil) render-zamanı cinematic grade ile karşılanabilir.
 */
function canSkipDesignedPostEnhanceForGrade(input: GptEnhancePolicyInput): boolean {
  return Boolean(
    input.skipEnhanceForRemotionGrade
    && input.designedPostPhotoEnhance
    && input.pickedFromBrandGallery
    && !input.referenceIsStock
    && input.galleryMatchScore != null
    && input.galleryMatchScore >= GALLERY_ENHANCE_SKIP_MIN_SCORE,
  );
}

function isGalleryRevisionMode(standard: GptEnhancePolicyInput['visualStandard']): boolean {
  return standard.enabled && standard.enhanceGallerySelected;
}

/** Machine-readable skip reason — Mission Hub + logs. */
export function resolveGptEnhanceSkipReason(input: GptEnhancePolicyInput): GptEnhanceSkipCode | null {
  if (input.businessType && isNonVenueSectorProfile(input.businessType)) return 'non_venue_saas';
  if (isGalleryRevisionMode(input.visualStandard)) {
    if (!shouldAiEnhanceForOutput(input.visualStandard, input.contentKind, input.assignment)) {
      if (!input.visualStandard.enabled) return 'disabled';
      return 'format_excluded';
    }
    return null;
  }

  if (!shouldAiEnhanceForOutput(input.visualStandard, input.contentKind, input.assignment)) {
    if (!input.visualStandard.enabled) return 'disabled';
    return 'format_excluded';
  }

  if (input.referenceIsStock) return null;

  // Faz 1.4 — güçlü galeri fotoğrafında designed_post arka-plan enhance'i atla (flag).
  if (canSkipDesignedPostEnhanceForGrade(input)) return 'remotion_grade';

  const pipeline = input.assignment.pipeline;
  const role = input.assignment.slot_role;

  // designedPostPhotoEnhance: photo-quality-only pass for designed_post background — allow through.
  if (!input.designedPostPhotoEnhance) {
    if (input.designedPosterSync || input.willRemotionPost) return 'remotion_post';
    if (pipeline === 'remotion_poster' || pipeline === 'fal_design' || role === 'designed_post' || role === 'designed_typography' || role === 'fal_designed_post') return 'remotion_post';
  }

  // Fal/Remotion story adds headline overlay — skip GPT enhance on story photos (gibberish UI in-image).
  if (
    (input.willRemotionStory && pipeline === 'remotion_story')
    || pipeline === 'fal_story'
    || (role === 'campaign_story_motion' && pipeline !== 'story_still')
  ) {
    return pipeline === 'fal_story' || role === 'campaign_story_motion' ? 'fal_story' : 'remotion_story';
  }

  const adaptiveScene = input.visualStandard.adaptiveScene;

  if (!adaptiveScene) {
    if (
      input.pickedFromBrandGallery
      && input.galleryMatchScore != null
      && input.galleryMatchScore >= GALLERY_ENHANCE_SKIP_MIN_SCORE
      && (pipeline === 'gallery_photo' || pipeline === 'story_still')
    ) {
      return 'gallery_match_ok';
    }

    if (
      input.pickedFromBrandGallery
      && input.galleryMatchScore != null
      && input.galleryMatchScore >= GIS_PILOT_MIN_SCORE
      && pipeline === 'carousel_gallery'
    ) {
      return 'gallery_match_ok';
    }
  }

  return null;
}

export function shouldRunGptImageEnhance(input: GptEnhancePolicyInput): boolean {
  if (input.businessType && isNonVenueSectorProfile(input.businessType)) {
    return false;
  }
  // Remotion+Grafiker yolu ham galeri kullanır — enhance Marky kısayolunu tetiklemesin.
  if (input.productionProfile?.requireDesignedVisuals) {
    return false;
  }

  if (isGalleryRevisionMode(input.visualStandard)) {
    return shouldAiEnhanceForOutput(input.visualStandard, input.contentKind, input.assignment);
  }

  if (!shouldAiEnhanceForOutput(input.visualStandard, input.contentKind, input.assignment)) {
    return false;
  }

  if (input.productionProfile?.skipAggressiveEnhance) {
    if (
      input.pickedFromBrandGallery
      && !input.referenceIsStock
      && input.galleryMatchScore != null
      && input.galleryMatchScore >= GIS_PILOT_MIN_SCORE - 8
    ) {
      return false;
    }
  }

  if (input.referenceIsStock) {
    return true;
  }

  // Faz 1.4 — güçlü galeri fotoğrafında designed_post arka-plan enhance'i atla (flag).
  if (canSkipDesignedPostEnhanceForGrade(input)) return false;

  const pipeline = input.assignment.pipeline;
  const role = input.assignment.slot_role;

  if (!input.designedPostPhotoEnhance) {
    if (input.designedPosterSync || input.willRemotionPost) return false;
    if (pipeline === 'remotion_poster' || pipeline === 'fal_design' || role === 'designed_post' || role === 'designed_typography' || role === 'fal_designed_post') return false;
  }

  const adaptiveScene = input.visualStandard.adaptiveScene;

  if (!adaptiveScene && input.willRemotionStory && pipeline === 'remotion_story') {
    return false;
  }

  if (!adaptiveScene) {
    if (
      input.pickedFromBrandGallery
      && input.galleryMatchScore != null
      && input.galleryMatchScore >= GALLERY_ENHANCE_SKIP_MIN_SCORE
      && (pipeline === 'gallery_photo' || pipeline === 'story_still')
    ) {
      return false;
    }

    if (
      input.pickedFromBrandGallery
      && input.galleryMatchScore != null
      && input.galleryMatchScore >= GIS_PILOT_MIN_SCORE
      && pipeline === 'carousel_gallery'
    ) {
      return false;
    }
  }

  return true;
}

/** Skip expensive render when gallery cannot support the caption. */
export const GALLERY_PRODUCTION_MIN_SCORE = GIS_PILOT_MIN_SCORE - 10;

/**
 * Fal grounded designs compose typography ON the gallery photo — a weak match
 * ships kitchen food under a DJ caption. Floor is above generic MIN_ACCEPT.
 */
/** Fal typography-on-photo — require near-acceptable GIS bar, not bare MIN_ACCEPT. */
export const FAL_GROUNDED_GALLERY_MIN_SCORE = GIS_PILOT_MIN_SCORE;

function resolveGalleryWeakFloor(input: {
  galleryMatchScore: number | null;
  falGroundedPipeline?: boolean;
}): { weak: boolean; floor: number } {
  const floor = input.falGroundedPipeline
    ? FAL_GROUNDED_GALLERY_MIN_SCORE
    : MIN_ACCEPT_SCORE;
  if (input.galleryMatchScore == null) return { weak: false, floor };
  if (input.galleryMatchScore < 0) return { weak: true, floor };
  return { weak: input.galleryMatchScore < floor, floor };
}

export function isWeakGalleryMatch(input: {
  missionProduction: boolean;
  galleryMatchScore: number | null;
  pickedFromBrandGallery: boolean;
  referenceIsStock: boolean;
  hasReference: boolean;
  adaptiveScene?: boolean;
  /** True when a cross-service conflict penalty was applied (e.g. nail caption + lash photo).
   * Overrides adaptiveScene bypass so the slot triggers AI fallback instead of shipping
   * a visually mismatched photo. */
  captionServiceConflict?: boolean;
  /**
   * Fal / Ideogram grounded slots — never bypass weak-gallery via adaptiveScene;
   * photo must support the caption before design runs.
   */
  falGroundedPipeline?: boolean;
}): boolean {
  // adaptiveScene normally bypasses weak-gallery detection — but not when there is a
  // confirmed cross-service conflict, or when Fal will paint on the gallery photo.
  if (
    input.adaptiveScene
    && !input.captionServiceConflict
    && !input.falGroundedPipeline
  ) {
    return false;
  }
  if (!input.missionProduction) return false;
  if (!input.hasReference) return false;
  if (input.referenceIsStock) return false;
  if (!input.pickedFromBrandGallery) return false;
  if (input.galleryMatchScore == null) return false;
  return resolveGalleryWeakFloor(input).weak;
}

export function shouldSkipProductionForWeakGallery(input: {
  missionProduction: boolean;
  galleryMatchScore: number | null;
  pickedFromBrandGallery: boolean;
  referenceIsStock: boolean;
  pipeline: string;
  hasReference: boolean;
  /** AI sahne uyarlama — zayıf eşleşmede GPT ile sahne kur, slotu atlama */
  adaptiveScene?: boolean;
  /** brand_solid / logo_hero → slot üretilir; block → atla */
  mediaFallback?: 'brand_solid' | 'logo_hero' | 'block';
  /** See isWeakGalleryMatch — overrides adaptiveScene for service conflicts */
  captionServiceConflict?: boolean;
  /** Fal grounded — skip rather than ship mismatched photo+caption */
  falGroundedPipeline?: boolean;
  /**
   * Content ideation set visual_production_spec.selected_gallery_url — the caption
   * agent already paired headline ↔ photo; do not re-block at production GIS bar.
   */
  agentIdeationGalleryLock?: boolean;
}): boolean {
  if (
    input.agentIdeationGalleryLock
    && input.hasReference
    && !input.captionServiceConflict
    && !input.referenceIsStock
  ) {
    return false;
  }
  if (
    input.falGroundedPipeline
    && input.hasReference
    && !input.captionServiceConflict
    && !input.referenceIsStock
    && input.galleryMatchScore != null
    && input.galleryMatchScore >= GALLERY_PRODUCTION_MIN_SCORE
  ) {
    return false;
  }
  if (
    input.adaptiveScene
    && !input.captionServiceConflict
    && !input.falGroundedPipeline
  ) {
    return false;
  }
  if (!input.missionProduction) return false;
  if (input.falGroundedPipeline && input.hasReference && input.galleryMatchScore == null) {
    return true;
  }
  if (!input.hasReference) return true;
  if (input.referenceIsStock) return false;
  if (!input.pickedFromBrandGallery) return false;
  if (input.galleryMatchScore == null) return false;
  if (resolveGalleryWeakFloor(input).weak) {
    // Fal grounded: always block — brand_solid invents scenes; logo_hero is not a photo match.
    if (input.falGroundedPipeline) return true;
    const fallback = input.mediaFallback ?? 'block';
    return fallback === 'block';
  }
  return false;
}
