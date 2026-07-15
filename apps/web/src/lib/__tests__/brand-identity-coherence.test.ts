import { describe, expect, it } from 'vitest';
import {
  isCrossTenantPollutionName,
  resolveCoherentBrandName,
  resolveCoherentLogoUrl,
  shouldPreferBrandContextIdentity,
} from '@/lib/brand-identity-coherence';
import { resolveCanonicalBrandName } from '@/lib/resolve-brand-name';
import { buildTenantBrandContext } from '@/lib/tenant-brand-context';

const YULA_CTX = {
  business_name: 'Karaman Datça',
  website_url: 'https://yulabodrum.com/',
  instagram_handle: 'yulabodrum',
  logo_url: 'https://yulabodrum.com/yula-bodrum-logo.png',
};

const KARAMAN_PROFILE = {
  brandName: 'Karaman Datça',
  logoUrl: 'https://karamandatca.com.tr/wp-content/uploads/logo.png',
  websiteUrl: 'https://karamandatca.com.tr/',
  instagramHandle: 'karamandatca',
};

describe('brand-identity-coherence', () => {
  it('detects Karaman name on Yula website context as pollution', () => {
    expect(isCrossTenantPollutionName('Karaman Datça', YULA_CTX)).toBe(true);
  });

  it('prefers brand_context when CompanyProfile is cross-tenant polluted', () => {
    expect(shouldPreferBrandContextIdentity(KARAMAN_PROFILE, YULA_CTX)).toBe(true);
  });

  it('resolveCanonicalBrandName returns Yula-derived name instead of Karaman profile', () => {
    expect(resolveCanonicalBrandName(KARAMAN_PROFILE, YULA_CTX)).toBe('Yulabodrum');
  });

  it('resolveCoherentLogoUrl uses workspace logo not Karaman logo', () => {
    expect(resolveCoherentLogoUrl(KARAMAN_PROFILE, YULA_CTX)).toContain('yulabodrum.com');
  });

  it('buildTenantBrandContext surfaces coherent tenant branding for polluted profile', () => {
    const ctx = buildTenantBrandContext(KARAMAN_PROFILE, YULA_CTX);
    expect(ctx.brandName).toBe('Yulabodrum');
    expect(ctx.logoUrl).toContain('yulabodrum.com');
    expect(ctx.instagramHandle).toBe('yulabodrum');
  });
});
