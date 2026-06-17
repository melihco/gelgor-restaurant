/**
 * Gallery display URL helpers — upgrade CDN thumbnails to full-resolution for UI.
 */


const WP_SIZE_SUFFIX = new RegExp(String.raw`-\d+x\d+(?=\.(?:jpe?g|png|webp|gif|avif)$)`, 'i');

/** WordPress / WooCommerce registered sizes → original upload filename. */
export function toFullSizeGalleryUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed.startsWith('http')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname.includes('/wp-content/uploads')) {
      parsed.pathname = parsed.pathname.replace(WP_SIZE_SUFFIX, '');
      return parsed.toString();
    }
    const [path, query] = trimmed.split('?');
    if (path && /wp-content\/uploads/i.test(path)) {
      const upgraded = path.replace(WP_SIZE_SUFFIX, '');
      return query ? `${upgraded}?${query}` : upgraded;
    }
  } catch {
    /* keep original */
  }
  return trimmed;
}

/** CDN resize params → ~1080px display quality. */
export function upscaleCdnUrl(url: string): string {
  const base = toFullSizeGalleryUrl(url);
  try {
    if (base.includes('wixstatic.com') && base.includes('/v1/fill/')) {
      return base.replace(
        /\/v1\/fill\/[^/]+\//,
        '/v1/fill/w_1080,h_1920,al_c,q_90,usm_0.66_1.00_0.01,enc_avif,quality_auto/',
      );
    }
    if (base.includes('cloudinary.com') && base.includes('/upload/')) {
      return base.replace(
        /\/upload\/[^/]*[wh]_\d+[^/]*\//,
        '/upload/w_1080,h_1920,c_fill,q_auto,f_auto/',
      );
    }
    if (base.includes('imgix.net')) {
      const u = new URL(base);
      u.searchParams.set('w', '1080');
      u.searchParams.set('h', '1920');
      u.searchParams.set('fit', 'crop');
      u.searchParams.set('q', '90');
      return u.toString();
    }
    if (base.includes('cdn.shopify.com') && /(_\d+x\d*\.)/.test(base)) {
      return base.replace(/_\d+x\d*\./, '_1080x.');
    }
  } catch {
    /* malformed URL */
  }
  return base;
}

/** Upgrade WP/WooCommerce thumbnails (-150x150) before display or persistence. */
export function normalizeExternalPhotoUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  if (!trimmed.startsWith('http')) return trimmed;
  return upscaleCdnUrl(trimmed);
}

/** Deduped, full-resolution URLs for gallery grids. */
export function prepareGalleryDisplayUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    if (typeof raw !== 'string' || !raw.startsWith('http')) continue;
    if (!raw.startsWith('http')) continue;
    const display = upscaleCdnUrl(raw);
    const key = display.split('?')[0] ?? display;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(display);
  }
  return out;
}
