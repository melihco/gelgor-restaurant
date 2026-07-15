/**
 * Canonical brand display name — operator-confirmed profile wins over scraped labels,
 * unless CompanyProfile is cross-tenant polluted (incoherent vs workspace brand_context).
 */

import {
  isCrossTenantPollutionName,
  isBrandContextIdentityCoherent,
  resolveCoherentBrandName,
  shouldPreferBrandContextIdentity,
} from '@/lib/brand-identity-coherence';

export function cleanBrandName(raw: string): string {
  return raw
    .replace(/^Anasayfa\s*[-–|]\s*/i, '')
    .replace(/\s*[-–|]\s*Anasayfa$/i, '')
    .replace(/\s*\|\s*.+$/, '')
    .trim();
}

function parseWebsiteDisplayName(brandCtx?: Record<string, unknown> | null): string {
  const wi = brandCtx?.website_intelligence ?? brandCtx?.websiteIntelligence;
  if (!wi) return '';
  try {
    const obj = typeof wi === 'string' ? JSON.parse(wi) : wi;
    return cleanBrandName(String((obj as { brand_display_name?: string })?.brand_display_name || ''));
  } catch {
    return '';
  }
}

/** Scraped nav/product labels (e.g. BerberRandevu) vs real brand names. */
function looksLikeProductLabel(name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  if (n.includes(' ')) return false;
  return /^[A-Z][a-z]+[A-Z]/.test(n) || n === n.toLowerCase() && n.length > 8;
}

/**
 * Priority: CompanyProfile.brandName → sensible business_name → website brand_display_name.
 * When profile is cross-tenant polluted, workspace brand_context wins.
 */
export function resolveCanonicalBrandName(
  profile?: Partial<{ brandName?: string; logoUrl?: string; websiteUrl?: string; instagramHandle?: string }> | null,
  brandCtx?: Record<string, unknown> | null,
): string {
  if (shouldPreferBrandContextIdentity(profile, brandCtx)) {
    const coherent = resolveCoherentBrandName(profile, brandCtx);
    if (coherent) return coherent;
  }

  const fromProfile = cleanBrandName(String(profile?.brandName || ''));
  if (fromProfile && !isCrossTenantPollutionName(fromProfile, brandCtx)) return fromProfile;

  const fromCtx = cleanBrandName(String(brandCtx?.business_name || brandCtx?.businessName || ''));
  const fromWeb = parseWebsiteDisplayName(brandCtx);

  if (fromCtx && !looksLikeProductLabel(fromCtx) && !isCrossTenantPollutionName(fromCtx, brandCtx)) return fromCtx;
  if (fromWeb && !isCrossTenantPollutionName(fromWeb, brandCtx)) return fromWeb;

  const handle = String(brandCtx?.instagram_handle || brandCtx?.instagramHandle || '')
    .replace(/^@/, '').trim();
  if (handle && isBrandContextIdentityCoherent(brandCtx)) {
    return handle.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  if (fromCtx && !isCrossTenantPollutionName(fromCtx, brandCtx)) return fromCtx;
  return fromProfile && !isCrossTenantPollutionName(fromProfile, brandCtx) ? fromProfile : '';
}
