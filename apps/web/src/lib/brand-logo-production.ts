/**
 * Production / Remotion logo selection — operator profile wins over scraped site assets.
 */

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/** Next.js image optimizer + legacy product marks are not reliable in headless Remotion. */
export function isUnreliableScrapedLogoUrl(url: string | null | undefined): boolean {
  const u = String(url ?? '').trim().toLowerCase();
  if (!u) return false;
  return (
    u.includes('/_next/image')
    || u.includes('berberlogo')
    || u.includes('placeholder')
    || u.includes('via.placeholder')
  );
}

/**
 * When onboarding scraped a logo from a legacy/staging domain but website_url points
 * elsewhere (e.g. gelgorrestaurant.com vs gelgor.vercel.app), rewrite to the live site.
 */
export function reconcileLogoUrlWithWebsite(
  logoUrl: string | null | undefined,
  websiteUrl: string | null | undefined,
): string {
  const logo = String(logoUrl ?? '').trim();
  const website = String(websiteUrl ?? '').trim();
  if (!logo.startsWith('http') || !website.startsWith('http')) return logo;

  const logoHost = hostnameOf(logo);
  const siteHost = hostnameOf(website);
  if (!logoHost || !siteHost || logoHost === siteHost) return logo;

  try {
    const logoParsed = new URL(logo);
    const siteParsed = new URL(website);
    return `${siteParsed.origin}${logoParsed.pathname}${logoParsed.search}`;
  } catch {
    return logo;
  }
}

export function resolveProductionLogoUrl(
  candidates: Array<string | null | undefined>,
  opts?: { websiteUrl?: string | null },
): string {
  const websiteUrl = opts?.websiteUrl ?? null;
  const list = candidates.map((c) => String(c ?? '').trim()).filter(Boolean);
  for (const raw of list) {
    const url = reconcileLogoUrlWithWebsite(raw, websiteUrl);
    if (url.startsWith('/api/media') || url.includes('r2.dev') || url.includes('cloudflarestorage.com')) {
      return url;
    }
    if (url.startsWith('http') && !isUnreliableScrapedLogoUrl(url)) {
      return url;
    }
  }
  return '';
}

/** UI önizleme — http, /api/media ve data: URL'leri destekler */
export function resolveBrandLogoDisplayUrl(url: string | null | undefined): string | null {
  const u = String(url ?? '').trim();
  if (!u) return null;
  if (u.startsWith('data:')) return u;
  if (u.startsWith('/api/media') || u.startsWith('/')) return u;
  if (u.startsWith('http') && !isUnreliableScrapedLogoUrl(u)) return u;
  return null;
}

/** Template kütüphanesi slot — showLogo=false ise render'da logo kullanılmaz */
export function resolveSlotLogoForRender(
  brandLogoUrl: string | null | undefined,
  slot?: { showLogo?: boolean } | null,
): string | undefined {
  if (slot?.showLogo === false) return undefined;
  const resolved = String(brandLogoUrl ?? '').trim();
  return resolved || undefined;
}
