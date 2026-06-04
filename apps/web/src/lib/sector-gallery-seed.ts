/**
 * Synthetic gallery seeds for tenants without venue/product photos.
 *
 * Used for SaaS, agencies, and other sectors where website crawl yields no
 * usable images (e.g. Next.js `/_next/image` stubs). Seeds are curated Unsplash
 * URLs tagged by sector — not generative AI, stable for production matching.
 */
import { BRS_MIN_USABLE_PHOTOS } from '@/lib/brand-readiness';
import { filterUsableGalleryPhotoUrls, isUsableGalleryPhotoUrl } from '@/lib/media-url';
import {
  SYNTHETIC_GALLERY_FULL,
  AGENCY_SERVICES_PHOTO_IDS,
  ECOMMERCE_PHOTO_IDS,
  HEALTHCARE_PHOTO_IDS,
  GENERAL_BUSINESS_PHOTO_IDS,
  MASTER_GALLERY_PHOTO_IDS,
} from '@/lib/sector-gallery-seed-data';

export { SYNTHETIC_GALLERY_FULL };
export const SYNTHETIC_GALLERY_MIN = BRS_MIN_USABLE_PHOTOS;

/** Sectors that never rely on physical venue photography. */
export const NON_VENUE_SECTORS = new Set([
  'agency_services',
  'ecommerce_retail',
  'production_company',
  'mental_health_clinic',
]);

const U = (id: string, w = 1200) =>
  `https://images.unsplash.com/photo-${id}?w=${w}&q=85&auto=format`;

function idsToUrls(ids: string[]): string[] {
  return ids.map((id) => U(id));
}

const SECTOR_ID_POOLS: Record<string, string[]> = {
  agency_services: AGENCY_SERVICES_PHOTO_IDS,
  ecommerce_retail: ECOMMERCE_PHOTO_IDS,
  healthcare_clinic: HEALTHCARE_PHOTO_IDS,
  general_business: GENERAL_BUSINESS_PHOTO_IDS,
};

/** Legacy export — first 10 agency URLs for backwards compatibility. */
export const SECTOR_GALLERY_SEEDS: Record<string, string[]> = {
  agency_services: idsToUrls(AGENCY_SERVICES_PHOTO_IDS.slice(0, 10)),
  ecommerce_retail: idsToUrls(ECOMMERCE_PHOTO_IDS.slice(0, 10)),
  healthcare_clinic: idsToUrls(HEALTHCARE_PHOTO_IDS.slice(0, 8)),
  general_business: idsToUrls(GENERAL_BUSINESS_PHOTO_IDS.slice(0, 8)),
};

export function normalizeSectorKey(sector: string | null | undefined): string {
  return (sector ?? 'general_business').toLowerCase().replace(/[\s-]+/g, '_').trim()
    || 'general_business';
}

/** Target gallery size: 100 when brand has no own photos; 8 minimum for BRS gates. */
export function resolveSyntheticGalleryTarget(
  sector: string | null | undefined,
  usableCount: number,
): number {
  const key = normalizeSectorKey(sector);
  if (usableCount === 0) return SYNTHETIC_GALLERY_FULL;
  if (NON_VENUE_SECTORS.has(key) && usableCount < SYNTHETIC_GALLERY_FULL) {
    return SYNTHETIC_GALLERY_FULL;
  }
  if (usableCount < SYNTHETIC_GALLERY_MIN) return SYNTHETIC_GALLERY_MIN;
  return usableCount;
}

export function sectorNeedsSyntheticGallery(
  sector: string | null | undefined,
  usableCount: number,
  min = SYNTHETIC_GALLERY_MIN,
): boolean {
  const target = resolveSyntheticGalleryTarget(sector, usableCount);
  if (usableCount >= target) return false;
  const key = normalizeSectorKey(sector);
  return NON_VENUE_SECTORS.has(key) || usableCount === 0;
}

export function getSectorGallerySeedUrls(
  sector: string | null | undefined,
  count = SYNTHETIC_GALLERY_MIN,
): string[] {
  const key = normalizeSectorKey(sector);
  const ids = SECTOR_ID_POOLS[key] ?? GENERAL_BUSINESS_PHOTO_IDS ?? MASTER_GALLERY_PHOTO_IDS;
  return idsToUrls(ids).slice(0, Math.max(count, SYNTHETIC_GALLERY_MIN));
}

/** Merge existing usable URLs with sector seeds until `min` reached. */
export function mergeSectorGallerySeed(
  existing: string[],
  sector: string | null | undefined,
  min = SYNTHETIC_GALLERY_MIN,
): { urls: string[]; added: number; provisioned: boolean } {
  const usable = filterUsableGalleryPhotoUrls(existing);
  const target = resolveSyntheticGalleryTarget(sector, usable.length);
  const effectiveMin = Math.max(min, target);
  if (usable.length >= effectiveMin) {
    return { urls: usable, added: 0, provisioned: false };
  }

  const seeds = getSectorGallerySeedUrls(sector, effectiveMin);
  const seen = new Set(usable.map((u) => u.split('?')[0]!.toLowerCase()));
  const merged = [...usable];

  for (const seed of seeds) {
    if (!isUsableGalleryPhotoUrl(seed)) continue;
    const base = seed.split('?')[0]!.toLowerCase();
    if (seen.has(base)) continue;
    seen.add(base);
    merged.push(seed);
    if (merged.length >= effectiveMin) break;
  }

  return {
    urls: merged,
    added: merged.length - usable.length,
    provisioned: merged.length > usable.length,
  };
}
