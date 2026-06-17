/**
 * Production / Remotion logo selection — operator profile wins over scraped site assets.
 */

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

export function resolveProductionLogoUrl(candidates: Array<string | null | undefined>): string {
  const list = candidates.map((c) => String(c ?? '').trim()).filter(Boolean);
  for (const url of list) {
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
