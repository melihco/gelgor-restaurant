import { describe, expect, it } from 'vitest';
import {
  resolveAuthoritativeIndustry,
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
});
