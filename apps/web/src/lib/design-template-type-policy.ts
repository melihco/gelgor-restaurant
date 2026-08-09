/**
 * Sector-driven fal design template type coverage policy.
 * No tenant UUID / brand-name branches — sector family only.
 */

import { normalizeSectorId } from '@/lib/sector-production-profile';
import type { DesignTemplateType } from '@/lib/brand-design-template-presets';

/** Hospitality balance buckets — at least this many distinct buckets should be present. */
export const HOSPITALITY_BALANCE_BUCKETS = {
  event: ['event_special', 'campaign_announcement'] as DesignTemplateType[],
  menu: ['menu_highlight', 'seasonal_promo'] as DesignTemplateType[],
  atmosphere: ['venue_showcase', 'daily_story', 'reel_cover', 'brand_identity'] as DesignTemplateType[],
} as const;

export type DesignTemplateTypePolicy = {
  sectorId: string;
  minDistinctTypes: number;
  /** Hospitality: require ≥ this many of {event, menu, atmosphere} buckets. */
  minHospitalityBuckets?: number;
  family: 'local_products' | 'hospitality' | 'general';
};

const LOCAL_PRODUCT_SECTORS = new Set([
  'local_products_shop',
  'ecommerce_retail',
  'retail',
  'gourmet_shop',
]);

const HOSPITALITY_SECTORS = new Set([
  'beach_club',
  'restaurant_cafe',
  'restaurant_bar',
  'hotel_resort',
  'hotel',
  'nightlife',
  'cafe',
  'pub',
  'bar',
]);

export function resolveDesignTemplateTypePolicy(
  sector: string | null | undefined,
): DesignTemplateTypePolicy {
  const sectorId = normalizeSectorId(sector);
  if (LOCAL_PRODUCT_SECTORS.has(sectorId) || sectorId.includes('local_product')) {
    return {
      sectorId,
      minDistinctTypes: 6,
      family: 'local_products',
    };
  }
  if (
    HOSPITALITY_SECTORS.has(sectorId)
    || sectorId.includes('beach')
    || sectorId.includes('hotel')
    || sectorId.includes('restaurant')
  ) {
    return {
      sectorId,
      minDistinctTypes: 5,
      minHospitalityBuckets: 3,
      family: 'hospitality',
    };
  }
  return {
    sectorId,
    minDistinctTypes: 5,
    family: 'general',
  };
}

export function hospitalityBucketsPresent(types: Iterable<string>): string[] {
  const set = new Set([...types].map((t) => t.toLowerCase()));
  const present: string[] = [];
  for (const [bucket, members] of Object.entries(HOSPITALITY_BALANCE_BUCKETS)) {
    if (members.some((m) => set.has(m))) present.push(bucket);
  }
  return present;
}
