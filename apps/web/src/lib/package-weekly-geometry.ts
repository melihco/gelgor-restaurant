/**
 * Weekly mission slot geometry by subscription plan.
 * Production target is idea_count; geometry is the fallback mix + ideation prompt count.
 */

import type { PackageGeometry } from '@/lib/mission-production-manifest';

/** ~15 deliverables: 4 post · 8 story · 1 carousel · 2 reel */
export const STARTER_WEEKLY_PACKAGE_COUNTS: PackageGeometry = {
  post: 4,
  story: 8,
  carousel: 1,
  reel: 2,
  total: 15,
};

/** Growth: same mix (idea_count still wins at produce time). */
export const AGENCY_WEEKLY_PACKAGE_COUNTS: PackageGeometry = {
  post: 4,
  story: 8,
  carousel: 1,
  reel: 2,
  total: 15,
};

function normalizePlanSlug(packageSlug?: string | null): string {
  return (packageSlug ?? '').trim().toLowerCase();
}

export function isStarterPlanSlug(packageSlug?: string | null): boolean {
  const slug = normalizePlanSlug(packageSlug);
  return slug === 'starter' || slug === 'studio';
}

/** Resolve weekly manifest / ideation geometry from subscription plan slug. */
export function resolveWeeklyPackageGeometry(packageSlug?: string | null): PackageGeometry {
  if (isStarterPlanSlug(packageSlug)) {
    return { ...STARTER_WEEKLY_PACKAGE_COUNTS };
  }
  return { ...AGENCY_WEEKLY_PACKAGE_COUNTS };
}

/**
 * Ideation A/B passes — default 1 for all plans (cost-safe).
 * Second pass only when CREWAI_CONTENT_ITERATIONS=2 on the Python side.
 */
export function resolveContentIdeationIterations(_packageSlug?: string | null): number {
  return 1;
}

export function formatMixLabel(geometry: PackageGeometry): string {
  return (
    `${geometry.story} story, ${geometry.post} post, ${geometry.carousel} carousel, `
    + `${geometry.reel} reel — her biri benzersiz caption/hashtag`
  );
}
