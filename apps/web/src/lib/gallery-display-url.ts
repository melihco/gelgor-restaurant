/**
 * Gallery display URL helpers — upgrade CDN thumbnails to full-resolution for UI.
 */
import { resolveClientMediaUrl } from '@/lib/media-url';


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

/** Stable dedupe key — /api/media uses R2 object key, not bare `/api/media`. */
export function galleryUrlIdentityKey(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('/api/media') || lower.includes('/api/media?')) {
    const q = trimmed.indexOf('?');
    if (q !== -1) {
      const key = new URLSearchParams(trimmed.slice(q + 1)).get('key');
      if (key) return decodeURIComponent(key).split('?')[0]!.toLowerCase();
    }
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return upscaleCdnUrl(trimmed).split('?')[0]!.toLowerCase();
  }
  return trimmed.split('?')[0]!.toLowerCase();
}

/** Deduped, full-resolution URLs for gallery grids. */
export function prepareGalleryDisplayUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed.startsWith('http') && !trimmed.startsWith('/api/media')) continue;
    const display = trimmed.startsWith('http') ? upscaleCdnUrl(trimmed) : trimmed;
    const key = galleryUrlIdentityKey(display);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(display);
  }
  return out;
}

/** Browser `<img src>` for gallery grid — /api/media direct, external via proxy when needed. */
export function resolveGalleryImageSrc(url: string): string {
  const trimmed = url.trim();
  const prepared = trimmed.startsWith('http') ? upscaleCdnUrl(trimmed) : trimmed;
  return resolveClientMediaUrl(prepared) ?? prepared;
}
