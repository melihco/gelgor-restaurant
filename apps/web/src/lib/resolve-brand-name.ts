/**
 * Canonical brand display name — operator-confirmed profile wins over scraped labels.
 */

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
 */
export function resolveCanonicalBrandName(
  profile?: Partial<{ brandName?: string }> | null,
  brandCtx?: Record<string, unknown> | null,
): string {
  const fromProfile = cleanBrandName(String(profile?.brandName || ''));
  if (fromProfile) return fromProfile;

  const fromCtx = cleanBrandName(String(brandCtx?.business_name || brandCtx?.businessName || ''));
  const fromWeb = parseWebsiteDisplayName(brandCtx);

  if (fromCtx && !looksLikeProductLabel(fromCtx)) return fromCtx;
  if (fromWeb) return fromWeb;
  return fromCtx;
}
