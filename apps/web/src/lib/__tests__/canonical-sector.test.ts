import { describe, expect, it } from 'vitest';
import {
  buildSectorSyncPatch,
  resolveAuthoritativeIndustry,
  resolveTenantCanonicalSector,
  serviceProfileCategoryForSector,
  shouldRefreshIndustryFromPython,
} from '@/lib/canonical-sector';
import { buildCompanyProfilePatchFromPython } from '@/lib/sync-company-profile-from-python';

describe('canonical sector sync', () => {
  it('prefers service profile category over stale business_type', () => {
    const py = {
      business_type: 'local_products_shop',
      brand_service_profile: {
        category: 'beach_club_bar',
        category_confidence: 0.9,
        cta_style: 'reservation',
      },
    };
    expect(resolveAuthoritativeIndustry(py)).toBe('beach_club');
  });

  it('maps barber_salon service-profile category to barber_salon sector', () => {
    const py = {
      business_type: 'beauty_wellness',
      brand_service_profile: {
        category: 'barber_salon',
        category_confidence: 0.92,
        cta_style: 'booking',
      },
    };
    expect(resolveAuthoritativeIndustry(py)).toBe('barber_salon');
    expect(serviceProfileCategoryForSector('barber_salon')).toBe('barber_salon');
  });

  it('buildSectorSyncPatch aligns stale business_type to SP (restaurant)', () => {
    const patch = buildSectorSyncPatch({
      business_type: 'local_products_shop',
      brand_service_profile: {
        category: 'restaurant_bar',
        category_confidence: 0.88,
      },
    });
    expect(patch).toMatchObject({
      business_type: 'restaurant_cafe',
      rebuildIndustryCalendar: true,
    });
    expect(patch?.detail).toContain('restaurant_cafe');
  });

  it('buildSectorSyncPatch is a no-op when already aligned', () => {
    expect(buildSectorSyncPatch({
      business_type: 'restaurant_cafe',
      brand_service_profile: { category: 'restaurant_bar' },
    })).toBeNull();
  });

  it('buildSectorSyncPatch respects manual_override — rewrites SP to operator sector', () => {
    const patch = buildSectorSyncPatch({
      business_type: 'local_products_shop',
      brand_service_profile: {
        category: 'restaurant_bar',
        source: 'manual_override',
      },
    });
    expect(patch?.brand_service_profile).toMatchObject({
      category: 'local_products_shop',
      source: 'manual_override',
    });
    expect(patch?.business_type).toBeUndefined();
  });

  it('overwrites general_business in Nexus profile', () => {
    const profile = { industry: 'general_business' };
    const py = {
      business_type: 'beach_club',
      brand_service_profile: {
        category: 'beach_club_bar',
        category_confidence: 0.85,
      },
    };
    expect(shouldRefreshIndustryFromPython(profile, py)).toBe(true);
    const patch = buildCompanyProfilePatchFromPython(profile, py);
    expect(patch?.industry).toBe('beach_club');
  });

  it('does not overwrite a confident manual industry without service profile disagreement', () => {
    const profile = { industry: 'healthcare_clinic' };
    const py = { business_type: 'healthcare_clinic' };
    expect(shouldRefreshIndustryFromPython(profile, py)).toBe(false);
  });

  it('overwrites Walters-class wrong SPECIFIC industry when Python corrected', () => {
    const profile = { industry: 'fashion_retail' };
    const py = { business_type: 'coffee_shop' };
    expect(shouldRefreshIndustryFromPython(profile, py)).toBe(true);
    const patch = buildCompanyProfilePatchFromPython(profile, py);
    expect(patch?.industry).toBe('coffee_shop');
  });

  it('does not overwrite user-confirmed sector when SP is manual_override', () => {
    const profile = { industry: 'coffee_shop' };
    const py = {
      business_type: 'fashion_retail',
      brand_service_profile: {
        category: 'fashion_retail',
        source: 'manual_override',
        category_confidence: 1,
      },
    };
    expect(shouldRefreshIndustryFromPython(profile, py)).toBe(false);
  });

  it('syncs Meon-style Nexus human label to Python wedding_event', () => {
    // Human label must not already normalize to wedding_event (e.g. "Etkinlik & Organizasyon" does).
    const profile = { industry: 'Düğün Planlama' };
    const py = { business_type: 'wedding_event', business_name: 'Meon Wedding' };
    expect(shouldRefreshIndustryFromPython(profile, py)).toBe(true);
    const patch = buildCompanyProfilePatchFromPython(profile, py);
    expect(patch?.industry).toBe('wedding_event');
  });

  it('resolveTenantCanonicalSector prefers Python over stale Nexus label', () => {
    const profile = { industry: 'Etkinlik & Organizasyon' };
    const py = { business_type: 'wedding_event' };
    expect(resolveTenantCanonicalSector(profile, py)).toBe('wedding_event');
  });

  it('maps wedding service profile category to wedding_event', () => {
    const py = {
      business_type: 'general_business',
      brand_service_profile: {
        category: 'wedding_event_service',
        category_confidence: 0.88,
      },
    };
    expect(resolveAuthoritativeIndustry(py)).toBe('wedding_event');
  });

  it('maps wedding_photography category to wedding_event pack sector', () => {
    const py = {
      business_type: 'wedding_photography',
      brand_service_profile: {
        category: 'wedding_photography',
        category_confidence: 0.95,
      },
    };
    expect(resolveAuthoritativeIndustry(py)).toBe('wedding_event');
  });

  it('maps kids_party_service category to kids_party_venue pack sector', () => {
    const py = {
      business_type: 'general_business',
      brand_service_profile: {
        category: 'kids_party_service',
        category_confidence: 0.9,
      },
    };
    expect(resolveAuthoritativeIndustry(py)).toBe('kids_party_venue');
    expect(serviceProfileCategoryForSector('kids_party_venue')).toBe('kids_party_service');
  });

  it('keeps coffee_shop separate from restaurant_cafe in food/drink aliases', () => {
    const py = {
      business_type: 'coffee_shop',
      brand_service_profile: {
        category: 'cafe_bakery',
        category_confidence: 0.9,
      },
    };
    expect(resolveAuthoritativeIndustry(py)).toBe('coffee_shop');
  });
});
