/**
 * Weekly mission slot geometry by subscription plan.
 * Starter: 4 post · 3 story · 1 carousel · 4 reel = 12
 * Agency (growth+): 6 post · 3 story · 1 carousel · 6 reel = 16
 */

import type { PackageGeometry } from '@/lib/mission-production-manifest';

export const STARTER_WEEKLY_PACKAGE_COUNTS: PackageGeometry = {
  post: 4,
  story: 6,
  carousel: 1,
  reel: 1,
  total: 12,
};

export const AGENCY_WEEKLY_PACKAGE_COUNTS: PackageGeometry = {
  post: 6,
  story: 8,
  carousel: 1,
  reel: 1,
  total: 16,
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

/** CREWAI_CONTENT_ITERATIONS parity — Starter=1, Agency/Premium=2. */
export function resolveContentIdeationIterations(packageSlug?: string | null): number {
  return isStarterPlanSlug(packageSlug) ? 1 : 2;
}

export function formatMixLabel(geometry: PackageGeometry): string {
  return (
    `${geometry.story} story, ${geometry.post} post, ${geometry.carousel} carousel, `
    + `${geometry.reel} reel — her biri benzersiz caption/hashtag`
  );
}
