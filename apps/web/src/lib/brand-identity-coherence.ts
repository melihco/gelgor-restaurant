/**
 * Detect cross-tenant brand identity pollution (e.g. Karaman profile on Yula workspace)
 * and prefer workspace-scoped brand_context when CompanyProfile is incoherent.
 */

import { cleanBrandName } from '@/lib/resolve-brand-name';

type BrandIdentitySource = Partial<{
  brandName: string;
  logoUrl: string;
  websiteUrl: string;
  instagramHandle: string;
}> | null | undefined;

function str(v: unknown): string {
  return String(v ?? '').trim();
}

function hostFromUrl(raw: unknown): string {
  const url = str(raw);
  if (!url) return '';
  try {
    const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(withScheme).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function handleToken(handle: unknown): string {
  return str(handle).replace(/^@/, '').toLowerCase();
}

/** True when a display name references one brand while website/handle belong to another. */
export function isCrossTenantPollutionName(
  name: string,
  brandCtx?: Record<string, unknown> | null,
): boolean {
  const cleaned = cleanBrandName(name);
  if (!cleaned) return false;
  const ctxWebsite = hostFromUrl(brandCtx?.website_url ?? brandCtx?.websiteUrl);
  const ctxHandle = handleToken(brandCtx?.instagram_handle ?? brandCtx?.instagramHandle);
  if (!ctxWebsite && !ctxHandle) return false;

  const nameTokens = cleaned.toLowerCase().split(/[\s\-–|]+/).filter((t) => t.length >= 4);
  if (!nameTokens.length) return false;

  const siteRoot = ctxWebsite.split('.')[0] ?? '';
  const handleRoot = ctxHandle.replace(/[^a-z0-9]/g, '').slice(0, 12);

  const nameMatchesSite = Boolean(siteRoot && nameTokens.some((t) => siteRoot.includes(t) || t.includes(siteRoot)));
  const nameMatchesHandle = Boolean(handleRoot && nameTokens.some((t) => handleRoot.includes(t) || t.includes(handleRoot)));

  if (nameMatchesSite || nameMatchesHandle) return false;

  // Name is unrelated to the workspace's own website/handle — likely another tenant's profile leaked in.
  return true;
}

/** brand_context website + logo/handle agree with each other. */
export function isBrandContextIdentityCoherent(brandCtx?: Record<string, unknown> | null): boolean {
  if (!brandCtx) return false;
  const website = hostFromUrl(brandCtx.website_url ?? brandCtx.websiteUrl);
  const logoHost = hostFromUrl(brandCtx.logo_url ?? brandCtx.logoUrl);
  const handle = handleToken(brandCtx.instagram_handle ?? brandCtx.instagramHandle);
  if (!website) return false;

  const siteRoot = website.split('.')[0] ?? '';
  const logoMatches = Boolean(logoHost && (logoHost === website || logoHost.includes(siteRoot) || website.includes(logoHost.split('.')[0] ?? '')));
  const handleMatches = Boolean(handle && (website.includes(handle.slice(0, 6)) || handle.includes(siteRoot.slice(0, 6))));
  return logoMatches || handleMatches;
}

/** CompanyProfile disagrees with coherent workspace brand_context — prefer context for UI. */
export function shouldPreferBrandContextIdentity(
  profile: BrandIdentitySource,
  brandCtx?: Record<string, unknown> | null,
): boolean {
  if (!profile || !brandCtx || !isBrandContextIdentityCoherent(brandCtx)) return false;

  const profileName = cleanBrandName(str(profile.brandName));
  const ctxName = cleanBrandName(str(brandCtx.business_name ?? brandCtx.businessName));
  const profileLogoHost = hostFromUrl(profile.logoUrl);
  const ctxLogoHost = hostFromUrl(brandCtx.logo_url ?? brandCtx.logoUrl);
  const ctxWebsite = hostFromUrl(brandCtx.website_url ?? brandCtx.websiteUrl);
  const profileWebsite = hostFromUrl(profile.websiteUrl);

  const profileAlignedWithCtx =
    (profileWebsite && profileWebsite === ctxWebsite)
    || (profileLogoHost && ctxLogoHost && profileLogoHost === ctxLogoHost);

  if (profileAlignedWithCtx) return false;

  // Profile name is another tenant's label while context points to this workspace's site.
  if (profileName && isCrossTenantPollutionName(profileName, brandCtx)) return true;
  // Profile logo host differs from workspace website (classic Karaman-logo-on-Yula leak).
  if (profileLogoHost && ctxWebsite && profileLogoHost !== ctxWebsite && !profileLogoHost.includes(ctxWebsite.split('.')[0] ?? '')) {
    return true;
  }
  return false;
}

export function resolveCoherentBrandName(
  profile: BrandIdentitySource,
  brandCtx?: Record<string, unknown> | null,
): string {
  if (!shouldPreferBrandContextIdentity(profile, brandCtx)) {
    return cleanBrandName(str(profile?.brandName));
  }

  const ctxName = cleanBrandName(str(brandCtx?.business_name ?? brandCtx?.businessName));
  if (ctxName && !isCrossTenantPollutionName(ctxName, brandCtx)) return ctxName;

  const handle = handleToken(brandCtx?.instagram_handle ?? brandCtx?.instagramHandle);
  if (handle) {
    return handle.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const siteRoot = hostFromUrl(brandCtx?.website_url ?? brandCtx?.websiteUrl).split('.')[0] ?? '';
  if (siteRoot) {
    return siteRoot.replace(/[^a-z0-9]+/gi, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return ctxName || cleanBrandName(str(profile?.brandName));
}

export function resolveCoherentInstagramHandle(
  profile: BrandIdentitySource,
  brandCtx?: Record<string, unknown> | null,
): string {
  const ctxHandle = handleToken(brandCtx?.instagram_handle ?? brandCtx?.instagramHandle);
  if (shouldPreferBrandContextIdentity(profile, brandCtx) && ctxHandle) return ctxHandle;
  const fromProfile = String(profile?.instagramHandle || '').replace(/^@/, '').trim().toLowerCase();
  if (fromProfile && !isCrossTenantPollutionName(fromProfile, brandCtx)) return fromProfile;
  if (ctxHandle) return ctxHandle;
  return fromProfile;
}

export function resolveCoherentLogoUrl(
  profile: BrandIdentitySource,
  brandCtx?: Record<string, unknown> | null,
): string {
  const ctxLogo = str(brandCtx?.logo_url ?? brandCtx?.logoUrl);
  const profileLogo = str(profile?.logoUrl);
  if (shouldPreferBrandContextIdentity(profile, brandCtx) && ctxLogo) return ctxLogo;
  return profileLogo || ctxLogo;
}
