import { normalizeSectorId } from '@/lib/sector-production-profile';

/** Service-profile categories → production playbook slugs (mirrors Python). */
export const CATEGORY_TO_CANONICAL_SECTOR: Record<string, string> = {
  beach_club_bar: 'beach_club',
  restaurant_bar: 'restaurant_cafe',
  cafe_bakery: 'coffee_shop',
  hotel_hospitality: 'hospitality',
  beauty_wellness: 'beauty_wellness',
  fitness_studio: 'fitness_gym',
  clinic_healthcare: 'healthcare_clinic',
  local_products_shop: 'local_products_shop',
  fashion_retail: 'fashion_boutique',
  wedding_event_service: 'wedding_event',
  event_planning_service: 'wedding_event',
};

export const WEAK_INDUSTRY_VALUES = new Set([
  '',
  'general_business',
  'business',
  'işletme',
  'isletme',
]);

function str(v: unknown): string {
  return String(v ?? '').trim();
}

export function canonicalSectorFromCategory(category: string): string {
  const key = str(category).toLowerCase();
  if (!key) return '';
  return CATEGORY_TO_CANONICAL_SECTOR[key] ?? key;
}

/** Reverse map — sector playbook slug → service-profile category for manual edits. */
const SECTOR_TO_SERVICE_CATEGORY: Record<string, string> = {
  beach_club: 'beach_club_bar',
  restaurant_cafe: 'restaurant_bar',
  coffee_shop: 'cafe_bakery',
  hospitality: 'hotel_hospitality',
  beauty_wellness: 'beauty_wellness',
  fitness_gym: 'fitness_studio',
  healthcare_clinic: 'clinic_healthcare',
  local_products_shop: 'local_products_shop',
  fashion_boutique: 'fashion_retail',
  wedding_event: 'wedding_event_service',
};

/**
 * When the operator edits sector in Marka, write the matching SP category
 * so readiness (Sector / SP alignment) and production kits stay in sync.
 */
export function serviceProfileCategoryForSector(sector: string): string {
  const key = normalizeSectorId(str(sector));
  if (!key || key === 'general_business') return '';
  if (CATEGORY_TO_CANONICAL_SECTOR[key]) return key; // already a category slug
  return SECTOR_TO_SERVICE_CATEGORY[key] ?? '';
}

/** Authoritative sector for prompts, template kits, and Nexus CompanyProfile.industry. */
export function resolveAuthoritativeIndustry(py: Record<string, unknown>): string {
  const sp = py.brand_service_profile as Record<string, unknown> | undefined;
  const category = sp && typeof sp.category === 'string' ? sp.category.trim() : '';
  if (category) {
    return normalizeSectorId(canonicalSectorFromCategory(category));
  }
  const businessType = str(py.business_type);
  if (!businessType) return '';
  return normalizeSectorId(businessType);
}

/**
 * Single runtime sector slug for a tenant — Python brand_context is authoritative,
 * Nexus CompanyProfile.industry is the synced mirror.
 */
export function resolveTenantCanonicalSector(
  profile?: Record<string, unknown> | null,
  py?: Record<string, unknown> | null,
): string {
  const fromPython = py ? resolveAuthoritativeIndustry(py) : '';
  if (fromPython) return fromPython;
  const fromNexus = normalizeSectorId(str(profile?.industry));
  if (fromNexus !== 'general_business') return fromNexus;
  const fromPyFallback = normalizeSectorId(str(py?.business_type ?? py?.industry));
  return fromPyFallback || 'general_business';
}

/** True when Nexus industry should be overwritten from Python/service profile. */
export function shouldRefreshIndustryFromPython(
  profile: Record<string, unknown>,
  py: Record<string, unknown>,
): boolean {
  const authoritative = resolveAuthoritativeIndustry(py);
  if (!authoritative) return false;

  const currentNorm = normalizeSectorId(str(profile.industry));
  const authNorm = normalizeSectorId(authoritative);
  if (currentNorm === authNorm) return false;

  const current = str(profile.industry).toLowerCase();
  if (!current || WEAK_INDUSTRY_VALUES.has(current)) return true;

  const sp = py.brand_service_profile as Record<string, unknown> | undefined;
  const category = sp && typeof sp.category === 'string' ? sp.category.trim() : '';
  const confidence = Number(sp?.category_confidence ?? 0);
  if (category && confidence >= 0.55) return true;

  // Align Nexus human labels / stale values with Python business_type SSOT.
  const pyBusinessNorm = normalizeSectorId(str(py.business_type));
  if (pyBusinessNorm && pyBusinessNorm === authNorm) return true;

  return false;
}
