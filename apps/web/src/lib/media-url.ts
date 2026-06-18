/**
 * Client + server helpers for R2 / media proxy URLs.
 * Fixes bare `/{tenantId}/posts/...` paths that 404 on Next.js root.
 */

import { normalizeExternalPhotoUrl as normalizeGalleryPhotoUrl } from '@/lib/gallery-display-url';

/** Re-export wrapper — safe under circular imports (live re-exports can be undefined). */
export function normalizeExternalPhotoUrl(url: string | null | undefined): string | null {
  return normalizeGalleryPhotoUrl(url);
}

const PUBLIC_STATIC_PREFIXES = [
  '/generated/',
  '/remotion-showcase/',
  '/audio/',
  '/_next/',
  '/favicon',
];

const R2_KEY_PATH =
  /^\/[0-9a-f-]{36}\/(posts|stories|reels|videos|images|image|video)\//i;

const R2_KEY_BARE =
  /^[0-9a-f-]{36}\/(posts|stories|reels|videos|images|image|video)\//i;

/** Stock / seed URLs — not the customer's own venue photos. */
export function isStockGalleryPhotoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('images.unsplash.com')
    || lower.includes('plus.unsplash.com')
    || lower.includes('unsplash.com')
    || lower.includes('pexels.com')
    || lower.includes('pixabay.com')
    || lower.includes('placeholder.com')
    || lower.includes('placehold.co')
  );
}

/** Remove stock/seed URLs — gallery should only keep crawl + manual uploads. */
export function stripStockGalleryUrls(urls: string[]): string[] {
  return urls.filter((u) => !isStockGalleryPhotoUrl(u));
}

export function isR2StorageKeyPath(path: string): boolean {
  const p = path.startsWith('/') ? path : `/${path}`;
  return R2_KEY_PATH.test(p);
}

/** Server-side: build public URL for an R2 object key. */
export function mediaUrlForKey(key: string, publicBase = process.env.R2_PUBLIC_URL ?? ''): string {
  const k = key.replace(/^\//, '');
  if (publicBase) {
    return `${publicBase.replace(/\/$/, '')}/${k}`;
  }
  return `/api/media?key=${encodeURIComponent(k)}`;
}

const SAFE_HTTP_HOSTS = [
  'oaidalleapiprodscus.blob.core',
  'fal-cdn',
  'storage.googleapis',
  'images.unsplash.com',
  'plus.unsplash.com',
  'r2.dev',
  'r2.cloudflarestorage.com',
  'cloudflarestorage.com',
  'amazonaws.com',
  'cloudfront.net',
  'export-download.canva.com',
  'cdninstagram.com',
  'fbcdn.net',
  'sarnicbeach.com',
  'yulabodrum.com',
  'sarnıc.com',
  'karaman',
];

const NON_IMAGE_PATH_EXT = /\.(woff2?|ttf|otf|eot|css|js|json|html|xml|map|svg|ico|mp4|mov|webm)$/i;

const TRUSTED_IMAGE_HOST_SNIPPETS = [
  'images.unsplash.com',
  'plus.unsplash.com',
  'oaidalleapiprodscus.blob.core',
  'fal-cdn',
  'r2.dev',
  'cloudfront.net',
  'amazonaws.com',
  'export-download.canva.com',
  'yulabodrum.com',
  'sarnicbeach.com',
];

const IMAGE_PATH_HINTS = /\/(uploads?|media|images?|galeri|gallery|photos?|assets|img|wp-content)\//i;

const IMAGE_KEY_EXT = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
  Accept: 'image/*,*/*;q=0.8',
};

/** R2 object key (from /api/media?key=...) looks like a still image. */
function r2KeyLooksLikeImage(key: string): boolean {
  const k = decodeURIComponent(key).trim().toLowerCase();
  if (!k) return false;
  if (NON_IMAGE_PATH_EXT.test(k)) return false;
  if (IMAGE_KEY_EXT.test(k)) return true;
  if (R2_KEY_BARE.test(k) || R2_KEY_PATH.test(`/${k}`)) return true;
  if (IMAGE_PATH_HINTS.test(`/${k}`)) return true;
  return false;
}

/** Next.js R2 proxy — relative or absolute /api/media?key=tenant/image/....webp */
function isNextMediaProxyImageUrl(url: string): boolean {
  const trimmed = url.trim();
  const q = trimmed.indexOf('?');
  if (q === -1) return false;
  const pathPart = trimmed.slice(0, q);
  if (!pathPart.endsWith('/api/media')) return false;
  const key = new URLSearchParams(trimmed.slice(q + 1)).get('key');
  return key ? r2KeyLooksLikeImage(key) : false;
}

/** Structural check — fast, no network. */
export function hasLikelyImageAssetPath(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    const path = parsed.pathname.toLowerCase();
    if (NON_IMAGE_PATH_EXT.test(path)) return false;
    if (path.includes('/_next/image') && !parsed.searchParams.get('url')) return false;
    if (path.includes('/_next/static/') && !/\.(jpe?g|png|webp|gif|avif)$/.test(path)) return false;
    if (path === '/_next/image' || path.endsWith('/_next/image/')) return false;
    if (path === '/api/media' || path.endsWith('/api/media')) {
      const key = parsed.searchParams.get('key') ?? '';
      return r2KeyLooksLikeImage(key);
    }
    if (/\.(jpe?g|png|webp|gif|avif|bmp)$/i.test(path)) return true;
    const host = parsed.hostname.toLowerCase();
    if (TRUSTED_IMAGE_HOST_SNIPPETS.some((h) => host.includes(h) || url.includes(h))) {
      return true;
    }
    if (IMAGE_PATH_HINTS.test(path)) return true;
    return false;
  } catch {
    return false;
  }
}

/** Unwrap /api/media-proxy?url=… (relative or absolute showcase render URLs). */
function unwrapMediaProxyTargetUrl(url: string): string | null {
  const trimmed = url.trim();
  if (trimmed.startsWith('/api/media-proxy?')) {
    const q = trimmed.indexOf('?');
    return new URLSearchParams(trimmed.slice(q + 1)).get('url');
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname.endsWith('/api/media-proxy')) {
      return parsed.searchParams.get('url');
    }
  } catch {
    /* not a URL */
  }
  return null;
}

/** Public alias — unwrap media-proxy to direct CDN URL for Remotion headless render. */
export function unwrapMediaProxyUrl(url: string): string | null {
  return unwrapMediaProxyTargetUrl(url);
}

/** Reject scraped/stub URLs that are not direct image assets. */
export function isUsableGalleryPhotoUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  const proxied = unwrapMediaProxyTargetUrl(trimmed);
  if (proxied) return isUsableGalleryPhotoUrl(proxied);
  if (trimmed.startsWith('/api/media')) {
    return isNextMediaProxyImageUrl(trimmed);
  }
  if (!trimmed.startsWith('http')) return false;
  return hasLikelyImageAssetPath(trimmed);
}

export function filterUsableGalleryPhotoUrls(urls: string[]): string[] {
  return urls.filter(isUsableGalleryPhotoUrl);
}

/** Rendered story/reel MP4 — HEAD-only routes reject these probes. */
export function isLikelyRenderedVideoUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (!u) return false;
  if (u.includes('/api/remotion/video/')) return true;
  if (u.includes('/api/media?key=') && (u.includes('/stories/') || u.includes('.mp4'))) return true;
  if (/\/stories\/[^?]+\.mp4/.test(u)) return true;
  return /\.(mp4|mov|webm)(\?|#|$)/i.test(u);
}

async function probeHttpAssetUrl(
  url: string,
  timeoutMs: number,
  accept: 'image' | 'video' | 'any',
): Promise<boolean> {
  try {
    let res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: accept === 'image' ? FETCH_HEADERS : { Accept: 'video/*,*/*;q=0.8' },
    });
    if (!res.ok && [403, 405, 501].includes(res.status)) {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          ...(accept === 'image' ? FETCH_HEADERS : { Accept: 'video/*,*/*;q=0.8' }),
          Range: 'bytes=0-1023',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
    }
    if (!res.ok) return false;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct) return true;
    if (accept === 'video') {
      return ct.startsWith('video/') || ct.includes('octet-stream');
    }
    if (accept === 'image') {
      return ct.startsWith('image/') || ct.includes('octet-stream');
    }
    return (
      ct.startsWith('image/')
      || ct.startsWith('video/')
      || ct.includes('octet-stream')
    );
  } catch {
    return false;
  }
}

/** HEAD/GET probe — used before production & Remotion render. */
/** Image or short video clip reachability check. */
export async function probeMediaUrl(url: string, timeoutMs = 10_000): Promise<boolean> {
  if (!url?.trim()) return false;
  const trimmed = url.trim();
  const isVideo = isLikelyRenderedVideoUrl(trimmed);

  if (trimmed.startsWith('/api/')) {
    const base = (process.env.NEXTJS_INTERNAL_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
    return probeHttpAssetUrl(`${base}${trimmed}`, timeoutMs, isVideo ? 'video' : 'any');
  }

  if (isVideo) {
    return probeHttpAssetUrl(trimmed, timeoutMs, 'video');
  }
  return probeGalleryImageUrl(trimmed);
}

/** R2 uploads via /api/media can lag a few hundred ms — retry before skipping a slot. */
export async function probeMediaUrlReliable(
  url: string,
  opts?: { timeoutMs?: number; retries?: number; delayMs?: number },
): Promise<boolean> {
  const retries = opts?.retries ?? (url.includes('/api/media') ? 4 : 1);
  const delayMs = opts?.delayMs ?? 400;
  for (let attempt = 0; attempt < retries; attempt++) {
    if (await probeMediaUrl(url, opts?.timeoutMs)) return true;
    if (attempt < retries - 1) {
      await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  return false;
}

/**
 * Remotion render + probe — relative /api paths stay local; external URLs → media-proxy.
 */
export function normalizePhotoUrlForRemotionRender(photoUrl: string): string {
  const trimmed = photoUrl.trim();
  if (!trimmed || trimmed.startsWith('data:')) return trimmed;
  if (trimmed.startsWith('/api/media-proxy?')) return trimmed;
  if (trimmed.startsWith('/api/')) return trimmed;
  if (trimmed.startsWith('http')) {
    return `/api/media-proxy?url=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}

export async function probeGalleryImageUrl(url: string, timeoutMs = 10_000): Promise<boolean> {
  const trimmed = url.trim();
  if (trimmed.startsWith('/api/')) {
    return probeMediaUrl(trimmed, timeoutMs);
  }
  if (!isUsableGalleryPhotoUrl(url)) return false;
  try {
    let res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: FETCH_HEADERS,
    });
    if (!res.ok && [403, 405].includes(res.status)) {
      res = await fetch(url, {
        method: 'GET',
        headers: { ...FETCH_HEADERS, Range: 'bytes=0-1023' },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
    }
    if (!res.ok) return false;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct && !ct.startsWith('image/') && !ct.includes('octet-stream')) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Drop structurally invalid + unreachable URLs before auto-produce / Remotion.
 * Trusted CDNs with obvious image paths skip network when list is large.
 */
export async function filterReachableGalleryUrls(
  urls: string[],
  opts: { maxProbe?: number; concurrency?: number } = {},
): Promise<{ urls: string[]; rejected: { url: string; reason: string }[] }> {
  const maxProbe = opts.maxProbe ?? 48;
  const concurrency = opts.concurrency ?? 8;
  const structural = filterUsableGalleryPhotoUrls(urls);
  const rejected: { url: string; reason: string }[] = [];
  const hasUnsplash = structural.some(
    (u) => u.includes('images.unsplash.com') || u.includes('plus.unsplash.com'),
  );
  // Unsplash IDs expire — never skip reachability checks for synthetic gallery seeds.
  const toProbe = hasUnsplash
    ? structural
    : structural.slice(0, maxProbe);
  const trustedWithoutProbe = hasUnsplash ? [] : structural.slice(maxProbe);

  const reachable: string[] = [];
  let idx = 0;

  async function worker() {
    while (idx < toProbe.length) {
      const i = idx++;
      const url = toProbe[i]!;
      const ok = await probeGalleryImageUrl(url);
      if (ok) reachable.push(url);
      else rejected.push({ url, reason: 'unreachable' });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, toProbe.length) }, () => worker()));

  const merged = [...reachable, ...trustedWithoutProbe.filter((u) => isUsableGalleryPhotoUrl(u))];
  const seen = new Set<string>();
  const urlsOut: string[] = [];
  for (const u of merged) {
    const key = u.split('?')[0]!.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    urlsOut.push(u);
  }

  return { urls: urlsOut, rejected };
}

/**
 * Persistable preview URL for Feed / Nexus (relative media-proxy or /api/media).
 * Use for artifact contentUrl / imageUrl — avoids raw expired Unsplash in DB.
 */
export function toFeedPreviewUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const fullSize = normalizeExternalPhotoUrl(url.trim()) ?? url.trim();
  const resolved = resolveClientMediaUrl(fullSize);
  if (resolved) return resolved;
  if (fullSize.startsWith('http') && fullSize.length <= 1000) {
    return `/api/media-proxy?url=${encodeURIComponent(fullSize)}`;
  }
  return fullSize.length <= 1000 ? fullSize : fullSize.slice(0, 1000);
}

/** Resolve artifact / gallery URLs for browser `<img src>`. */
export function resolveClientMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:')) return trimmed;

  if (
    trimmed.startsWith('/api/media')
    || trimmed.startsWith('/api/remotion/')
    || trimmed.startsWith('/api/generate-')
  ) {
    return trimmed;
  }

  if (trimmed.startsWith('http')) {
    if (trimmed.includes('canva.com/design')) return null;
    const displayUrl = normalizeExternalPhotoUrl(trimmed) ?? trimmed;
    // Unsplash: direct <img> works but fetch/canvas CORS fails; proxy also surfaces 404 clearly.
    if (displayUrl.includes('images.unsplash.com') || displayUrl.includes('plus.unsplash.com')) {
      return `/api/media-proxy?url=${encodeURIComponent(displayUrl)}`;
    }
    if (SAFE_HTTP_HOSTS.some((h) => displayUrl.includes(h))) return displayUrl;
    return `/api/media-proxy?url=${encodeURIComponent(displayUrl)}`;
  }

  if (trimmed.startsWith('/')) {
    if (PUBLIC_STATIC_PREFIXES.some((p) => trimmed.startsWith(p))) return trimmed;
    if (isR2StorageKeyPath(trimmed)) {
      return `/api/media?key=${encodeURIComponent(trimmed.replace(/^\//, ''))}`;
    }
    if (trimmed.startsWith('/api/')) {
      return `/api/nexus-backend/${trimmed.slice(5)}`;
    }
    return trimmed;
  }

  if (R2_KEY_BARE.test(trimmed)) {
    return `/api/media?key=${encodeURIComponent(trimmed)}`;
  }

  return null;
}

/** Browser `<img>` / canvas fetch — internal /api/media direct, external via proxy when needed. */
export function resolveBrowserImageSrc(url: string | null | undefined): string {
  if (!url?.trim()) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('data:')) return trimmed;
  return resolveClientMediaUrl(trimmed) ?? `/api/media-proxy?url=${encodeURIComponent(trimmed)}`;
}

/** Feed / Mission Hub — artifact has a previewable media URL (http, /api/, /generated/, data:image). */
export function isPublishableMediaUrl(url: string | null | undefined): boolean {
  const u = String(url ?? '').trim();
  if (!u) return false;
  if (u.startsWith('data:image')) return true;
  return Boolean(resolveClientMediaUrl(u));
}
