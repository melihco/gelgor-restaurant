/**
 * Brand gallery upload helpers — persisted R2 URLs + vision analysis input.
 */
import { getNextjsInternalOrigin } from '@/lib/runtime-config';
import { isUsableGalleryPhotoUrl } from '@/lib/media-url';

export function isBrandGalleryPersistedUrl(url: string | null | undefined): boolean {
  return isUsableGalleryPhotoUrl(url);
}

export function filterBrandGalleryUrls(urls: string[]): string[] {
  return urls.filter((u) => typeof u === 'string' && isBrandGalleryPersistedUrl(u));
}

/** Parse brand_context.reference_image_urls — includes persisted R2 /api/media URLs. */
export function parseBrandReferenceUrls(raw: unknown): string[] {
  let urls: string[] = [];
  if (Array.isArray(raw)) {
    urls = raw.map((u) => String(u).trim());
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      urls = Array.isArray(parsed) ? parsed.map((u) => String(u).trim()) : [raw.trim()];
    } catch {
      urls = [raw.trim()];
    }
  }
  return filterBrandGalleryUrls(urls);
}

/** gallery_analysis keys that map to usable brand photos (http or /api/media). */
export function filterGalleryAnalysisKeys(meta: Record<string, unknown>): string[] {
  return Object.keys(meta).filter(isBrandGalleryPersistedUrl);
}

/** OpenAI Vision input — relative /api/media URLs become base64 data URIs. */
export async function resolveVisionImageUrl(url: string): Promise<string> {
  const trimmed = url.trim();
  if (!trimmed) throw new Error('empty_url');
  if (trimmed.startsWith('data:')) return trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;

  const origin = getNextjsInternalOrigin();
  const fetchUrl = trimmed.startsWith('/') ? `${origin}${trimmed}` : `${origin}/${trimmed}`;
  const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`fetch_failed_${res.status}`);
  const mime = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
  if (!mime.startsWith('image/')) throw new Error('not_an_image');
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${mime};base64,${buf.toString('base64')}`;
}

export async function probeGalleryPhotoAccessible(url: string): Promise<boolean> {
  if (!isBrandGalleryPersistedUrl(url)) return false;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(url.split('?')[0] ?? url)) return true;
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(8_000),
        headers: {
          'User-Agent': 'Mozilla/5.0 SmartAgency/1.0',
          Accept: 'image/*,*/*;q=0.8',
        },
      });
      if (res.ok) return true;
      const res2 = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: 'image/*,*/*;q=0.8' },
      });
      return res2.ok && (res2.headers.get('content-type') ?? '').startsWith('image/');
    } catch {
      return false;
    }
  }
  try {
    const origin = getNextjsInternalOrigin();
    const fetchUrl = url.startsWith('/') ? `${origin}${url}` : `${origin}/${url}`;
    const res = await fetch(fetchUrl, { method: 'GET', signal: AbortSignal.timeout(12_000) });
    return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/');
  } catch {
    return false;
  }
}
