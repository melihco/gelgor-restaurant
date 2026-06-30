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

/** True when Nexus industry should be overwritten from Python/service profile. */
export function shouldRefreshIndustryFromPython(
  profile: Record<string, unknown>,
  py: Record<string, unknown>,
): boolean {
  const authoritative = resolveAuthoritativeIndustry(py);
  if (!authoritative) return false;

  const current = str(profile.industry).toLowerCase();
  if (!current || WEAK_INDUSTRY_VALUES.has(current)) return true;

  const sp = py.brand_service_profile as Record<string, unknown> | undefined;
  const confidence = Number(sp?.category_confidence ?? 0);
  if (confidence < 0.55) return false;

  return normalizeSectorId(current) !== normalizeSectorId(authoritative);
}
