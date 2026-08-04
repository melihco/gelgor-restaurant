import { describe, expect, it } from 'vitest';
import {
  isCrossTenantPollutionName,
  isForeignBrandCustomerSummary,
  resolveCoherentBrandName,
  resolveCoherentLogoUrl,
  resolveCustomerVisibleSummary,
  shouldPreferBrandContextIdentity,
} from '@/lib/brand-identity-coherence';
import { resolveCanonicalBrandName } from '@/lib/resolve-brand-name';
import { buildTenantBrandContext } from '@/lib/tenant-brand-context';

const YULA_CTX = {
  business_name: 'Karaman Datça',
  website_url: 'https://yulabodrum.com/',
  instagram_handle: 'yulabodrum',
  logo_url: 'https://yulabodrum.com/yula-bodrum-logo.png',
  instagram_bio: 'Bodrum’da Yula · kitchen & garden',
  instagram_profile_pic_url: 'https://cdninstagram.com/yula-avatar.jpg',
  instagram_followers: 12500,
  instagram_following: 420,
  instagram_posts_count: 890,
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
    expect(ctx.instagramBio).toBe('Bodrum’da Yula · kitchen & garden');
    expect(ctx.instagramProfilePicUrl).toContain('yula-avatar');
    expect(ctx.instagramFollowers).toBe(12500);
    expect(ctx.instagramFollowing).toBe(420);
    expect(ctx.instagramPostsCount).toBe(890);
  });

  it('detects Meon onboarding stub on Sarnıç as foreign customer summary', () => {
    const sarnicCtx = {
      business_name: 'Sarnıç Beach',
      website_url: 'https://www.sarnicbeach.com/',
      instagram_handle: 'sarnicbeach',
      website_summary: 'Bitez’de beach club — Sarnıç Beach.',
    };
    const polluted = 'Meon Wedding için onboarding başlatıldı. Web sitesi ve görsel analiz sonuçları hazırlanıyor.';
    expect(isForeignBrandCustomerSummary(polluted, 'Sarnıç Beach', sarnicCtx)).toBe(true);
    expect(resolveCustomerVisibleSummary(polluted, 'Sarnıç Beach', sarnicCtx)).toMatch(/Sarnıç|Bitez/i);
    expect(isForeignBrandCustomerSummary(
      'Sarnıç Beach için onboarding başlatıldı. Web sitesi ve görsel analiz sonuçları hazırlanıyor.',
      'Sarnıç Beach',
      sarnicCtx,
    )).toBe(false);
  });
});
