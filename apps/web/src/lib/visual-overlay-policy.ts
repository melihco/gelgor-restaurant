/**
 * Visual overlay policy — when to keep gallery photos clean vs designed layers.
 * Multi-tenant: driven by slot role, pipeline, and idea use-case — not tenant UUID or brand name.
 */
import type { ProductionAssignment, ProductionSlotRole } from '@/lib/mission-production-manifest';

const LIFESTYLE_USE_CASES = new Set([
  'social_proof',
  'daily_moment',
  'daily_story',
  'behind_the_scenes',
  'menu_share',
  'educational_post',
]);

const DESIGNED_ROLES = new Set<ProductionSlotRole>([
  'designed_post',
  'campaign_story_motion',
  'campaign_reel_motion',
  'paid_ad_creative',
]);

function normalizeUseCase(idea: Record<string, unknown>): string {
  return String(idea.template_use_case ?? idea.content_need ?? '').toLowerCase().trim();
}

/** Caption + hashtags stay on Feed card; image stays gallery-only. */
export function isGalleryOnlyVisualPolicy(
  assignment: ProductionAssignment,
  idea: Record<string, unknown>,
): boolean {
  if (assignment.pipeline === 'gallery_photo') return true;
  if (assignment.slot_role === 'organic_post' || assignment.slot_role === 'organic_story_still') {
    return true;
  }
  if (DESIGNED_ROLES.has(assignment.slot_role)) return false;

  const useCase = normalizeUseCase(idea);
  if (LIFESTYLE_USE_CASES.has(useCase)) return true;

  const treatment = String(
    idea.treatment ?? (idea.visual_production_spec as Record<string, unknown> | undefined)?.treatment ?? '',
  ).toLowerCase();
  if (treatment === 'pure_photo' || treatment === 'gallery_only') return true;

  return false;
}

/** Multi-photo story slideshow (Remotion GallerySeries sequence). */
export function prefersGallerySequenceStory(
  assignment: ProductionAssignment,
  idea: Record<string, unknown>,
  photoCount: number,
): boolean {
  if (photoCount < 2) return false;
  if (assignment.pipeline === 'remotion_story' || assignment.slot_role === 'campaign_story_motion') {
    const useCase = normalizeUseCase(idea);
    if (LIFESTYLE_USE_CASES.has(useCase) || photoCount >= 2) return true;
  }
  if (normalizeUseCase(idea) === 'social_proof' && photoCount >= 2) return true;
  return photoCount >= 3;
}

/** Target photo count for gallery-series / enhance (4 slides × ~2s @ 8s story). */
export function gallerySequencePhotoTarget(
  assignment: ProductionAssignment,
  contentKind: string,
): number {
  if (assignment.pipeline === 'carousel_gallery' || contentKind === 'instagram_carousel') return 4;
  if (assignment.pipeline === 'remotion_story' || assignment.slot_role === 'campaign_story_motion') {
    return 4;
  }
  return 3;
}

/** Polaroid ve diğer çoklu-foto layout'ları için slot şablonuna göre hedef. */
export function storyGalleryPhotoTarget(input: {
  assignment: ProductionAssignment;
  contentKind: string;
  templateFamily?: string;
}): number {
  if (input.templateFamily === 'polaroid_single') return 1;
  if (input.templateFamily === 'polaroid_stack') return 3;
  return gallerySequencePhotoTarget(input.assignment, input.contentKind);
}
