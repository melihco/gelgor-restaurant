/**
 * Client + server helpers for R2 / media proxy URLs.
 * Fixes bare `/{tenantId}/posts/...` paths that 404 on Next.js root.
 */

import { normalizeExternalPhotoUrl as normalizeGalleryPhotoUrl } from '@/lib/gallery-display-url';
import { getNextjsInternalOrigin } from '@/lib/runtime-config';

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

function isLocalOrPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === 'localhost'
    || h === '127.0.0.1'
    || h === '0.0.0.0'
    || h === '[::1]'
    || h.endsWith('.local')
    || h.startsWith('10.')
    || h.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}

/** fal.ai / Kling / Luma accept HTTPS URLs or data URIs only. */
export function isFalAccessibleMediaUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('data:')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' && !isLocalOrPrivateHost(parsed.hostname);
  } catch {
    return false;
  }
}

function extractMediaKeyFromUrl(url: string): string | null {
  const keyMatch = url.match(/[?&]key=([^&]+)/);
  return keyMatch ? decodeURIComponent(keyMatch[1]!) : null;
}

async function resolveR2KeyToPublicHttps(key: string): Promise<string> {
  const cleanKey = key.replace(/^\//, '');
  const publicBase = process.env.R2_PUBLIC_URL ?? '';
  if (publicBase) {
    return `${publicBase.replace(/\/$/, '')}/${cleanKey}`;
  }

  const { getPresignedUrl, isR2Configured } = await import('@/lib/r2-storage');
  if (!isR2Configured()) {
    throw new Error(`R2 not configured — cannot expose media key for external API: ${cleanKey.slice(0, 80)}`);
  }
  return getPresignedUrl(cleanKey, 3600);
}

async function mirrorImageBytesToR2Https(sourceUrl: string, tenantId = 'fal-motion'): Promise<string> {
  const { fetchExternalImageBuffer } = await import('@/lib/external-image-fetch');
  const { isR2Configured, generateStorageKey, uploadToR2, getPresignedUrl } = await import('@/lib/r2-storage');

  if (!isR2Configured()) {
    throw new Error(`Cannot mirror image for external API (R2 missing): ${sourceUrl.slice(0, 120)}`);
  }

  let fetchUrl = sourceUrl;
  if (fetchUrl.startsWith('/')) {
    fetchUrl = `${getNextjsInternalOriginForMedia()}${fetchUrl}`;
  }

  const buffer = await fetchExternalImageBuffer(fetchUrl, 45_000);
  if (!buffer || buffer.length < 100) {
    throw new Error(`Failed to fetch image for external API: ${sourceUrl.slice(0, 120)}`);
  }

  const ext =
    sourceUrl.match(/\.(jpe?g|png|webp|gif)(\?|$)/i)?.[1]?.toLowerCase().replace('jpeg', 'jpg')
    ?? 'jpg';
  const tenantMatch = sourceUrl.match(/([0-9a-f-]{36})\/(?:image|posts|stories|reels)/i);
  const resolvedTenant = tenantMatch?.[1] ?? tenantId;
  const key = generateStorageKey(resolvedTenant, 'image', ext);
  const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  await uploadToR2(buffer, key, contentType);
  return getPresignedUrl(key, 3600);
}

function isTenantStoredMediaPath(url: string, workspaceId: string): boolean {
  const trimmed = url.trim();
  const key = extractMediaKeyFromUrl(trimmed) ?? (isR2StorageKeyPath(trimmed) ? trimmed.replace(/^\//, '') : null);
  if (key?.toLowerCase().startsWith(`${workspaceId.toLowerCase()}/`)) return true;
  return trimmed.includes(`${workspaceId}/`);
}

/**
 * Mirror an external (or proxy-wrapped) gallery photo into tenant R2 storage.
 * Returns a local `/api/media?key=…` URL suitable for Remotion headless render.
 */
export async function mirrorGalleryPhotoToTenantStorage(
  workspaceId: string,
  sourceUrl: string,
): Promise<string> {
  const { mirrorGalleryPhotoToTenantStorageServer } = await import('@/lib/gallery-mirror-server');
  return mirrorGalleryPhotoToTenantStorageServer(workspaceId, sourceUrl);
}

/**
 * Stable gallery URL for auto-produce / Remotion — mirrors external brand-site photos
 * into tenant storage so production does not depend on live media-proxy fetches.
 */
export async function ensureProductionGalleryPhotoUrl(
  workspaceId: string,
  photoUrl: string,
  opts?: { timeoutMs?: number },
): Promise<string | null> {
  const { ensureProductionGalleryPhotoUrlServer } = await import('@/lib/gallery-mirror-server');
  const mirrored = await ensureProductionGalleryPhotoUrlServer(workspaceId, photoUrl, opts);
  if (mirrored) return mirrored;

  const trimmed = photoUrl.trim();
  if (!trimmed || !workspaceId) return null;
  const timeoutMs = opts?.timeoutMs ?? 12_000;
  const reachable = await confirmGalleryPhotoReachableForRender(trimmed, { timeoutMs });
  if (!reachable) return null;
  return normalizePhotoUrlForRender(trimmed);
}

/** Try primary + candidate gallery URLs — tenant R2 keys first when brand site is down. */
export async function pickReachableProductionGalleryUrl(
  workspaceId: string,
  primaryUrl: string,
  candidateUrls: string[],
  opts?: { timeoutMs?: number },
): Promise<{ url: string; fallbackFrom?: string } | null> {
  const { pickReachableProductionGalleryUrl: pickServer } = await import('@/lib/gallery-mirror-server');
  return pickServer(workspaceId, primaryUrl, candidateUrls, opts);
}

/** Resolve a media URL to one accessible by external services (fal.ai, Kling, Luma).
 * - Unwraps `/api/media-proxy?url=…` (including localhost absolute wrappers) to the underlying HTTPS URL
 * - Converts `/api/media?key=…` to R2 public URL or pre-signed HTTPS URL
 * - Mirrors non-HTTPS / unreachable URLs to R2 when needed
 */
export async function resolveExternallyAccessibleUrl(url: string): Promise<string> {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('data:')) return trimmed;

  let working = trimmed;
  for (let depth = 0; depth < 5; depth++) {
    const proxied = unwrapMediaProxyTargetUrl(working);
    if (!proxied || proxied === working) break;
    working = proxied;
  }

  if (working.startsWith('/')) {
    const mediaKey = extractMediaKeyFromUrl(working);
    if (mediaKey && working.includes('/api/media')) {
      return resolveR2KeyToPublicHttps(mediaKey);
    }
    if (working.startsWith('/api/media-proxy?')) {
      const inner = unwrapMediaProxyTargetUrl(working);
      if (inner) return resolveExternallyAccessibleUrl(inner);
    }
    if (isR2StorageKeyPath(working)) {
      return resolveR2KeyToPublicHttps(working.replace(/^\//, ''));
    }
    return mirrorImageBytesToR2Https(working);
  }

  if (R2_KEY_BARE.test(working)) {
    return resolveR2KeyToPublicHttps(working);
  }

  if (working.startsWith('http://') || working.startsWith('https://')) {
    let parsed: URL;
    try {
      parsed = new URL(working);
    } catch {
      return working;
    }

    if (parsed.pathname.endsWith('/api/media-proxy')) {
      const inner = parsed.searchParams.get('url');
      if (inner) return resolveExternallyAccessibleUrl(inner);
    }

    const mediaKey = extractMediaKeyFromUrl(working);
    if (mediaKey && parsed.pathname.endsWith('/api/media')) {
      return resolveR2KeyToPublicHttps(mediaKey);
    }

    if (isLocalOrPrivateHost(parsed.hostname)) {
      const proxied = unwrapMediaProxyTargetUrl(working);
      if (proxied) return resolveExternallyAccessibleUrl(proxied);
      if (mediaKey) return resolveR2KeyToPublicHttps(mediaKey);
      return mirrorImageBytesToR2Https(working);
    }

    if (isFalAccessibleMediaUrl(working)) {
      return working;
    }

    if (parsed.protocol === 'http:') {
      const httpsVersion = working.replace(/^http:/, 'https:');
      const { fetchExternalImageBuffer } = await import('@/lib/external-image-fetch');
      const buf = await fetchExternalImageBuffer(httpsVersion, 15_000);
      if (buf && buf.length >= 100) return httpsVersion;
      return mirrorImageBytesToR2Https(working);
    }
  }

  return working;
}

function getNextjsInternalOriginForMedia(): string {
  return getNextjsInternalOrigin();
}

import { SAFE_HTTP_HOSTS, TRUSTED_GALLERY_PREFIXES, isTrustedGalleryUrl, isSafeHttpHost } from './trusted-media-hosts';

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
];

const IMAGE_PATH_HINTS = /\/(uploads?|media|images?|galeri|gallery|photos?|assets|img|wp-content)\//i;

const IMAGE_KEY_EXT = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
  Accept: 'image/*,*/*;q=0.8',
};

/**
 * Hotlink-protected CDNs (Wix, many brand sites) 403 server-side fetches that
 * lack a Referer even though the asset is perfectly valid. Sending the asset's
 * own origin as Referer mirrors what a browser does and what
 * fetchExternalImageBuffer already relies on — keeps probe results in sync with
 * the actual render-time fetch so we don't false-negative reachable photos.
 */
function refererForUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.protocol.startsWith('http')) return null;
    if (parsed.hostname.includes('cdninstagram.com') || parsed.hostname.includes('fbcdn.net')) {
      return 'https://www.instagram.com/';
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

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
    if (/dummy\.png$/i.test(path) || /\/dummy\./i.test(path)) return false;
    if (/-icon[-_]/i.test(path) || /icon[-_]beyaz/i.test(path)) return false;
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
    // media-proxy route is GET-only; HEAD can be slow/ambiguous during dev compiles.
    if (url.includes('/api/media-proxy')) {
      const referer = refererForUrl(url);
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          ...(accept === 'image' ? FETCH_HEADERS : { Accept: 'video/*,*/*;q=0.8' }),
          ...(referer ? { Referer: referer } : {}),
          Range: 'bytes=0-2047',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      return res.ok;
    }

    let res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: accept === 'image' ? FETCH_HEADERS : { Accept: 'video/*,*/*;q=0.8' },
    });
    if (!res.ok && [403, 405, 501].includes(res.status)) {
      const referer = refererForUrl(url);
      res = await fetch(url, {
        method: 'GET',
        headers: {
          ...(accept === 'image' ? FETCH_HEADERS : { Accept: 'video/*,*/*;q=0.8' }),
          ...(referer ? { Referer: referer } : {}),
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
    const base = getNextjsInternalOrigin();
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
export function normalizePhotoUrlForRender(photoUrl: string): string {
  const trimmed = photoUrl.trim();
  if (!trimmed || trimmed.startsWith('data:')) return trimmed;
  if (trimmed.startsWith('/api/media-proxy?')) return trimmed;
  if (trimmed.startsWith('/api/')) return trimmed;
  if (trimmed.startsWith('http')) {
    return `/api/media-proxy?url=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}

/** Resolve external target for proxy-wrapped gallery URLs. */
export function resolveExternalGalleryPhotoTarget(photoUrl: string): string | null {
  const trimmed = photoUrl.trim();
  if (!trimmed) return null;
  const unwrapped = unwrapMediaProxyTargetUrl(trimmed);
  if (unwrapped?.startsWith('http')) return unwrapped;
  if (trimmed.startsWith('http')) return trimmed;
  return null;
}

/**
 * Remotion pre-render gate — proxy-wrapped Feed URLs must unwrap before external fetch.
 * Dev media-proxy can take 8–15s during cold compile; use generous timeouts.
 */
export async function confirmGalleryPhotoReachableForRender(
  photoUrl: string,
  opts?: { timeoutMs?: number },
): Promise<boolean> {
  const timeoutMs = opts?.timeoutMs ?? 28_000;
  const trimmed = photoUrl.trim();
  if (!trimmed) return false;

  const externalTarget = resolveExternalGalleryPhotoTarget(trimmed);

  if (externalTarget) {
    try {
      const { fetchExternalImageBuffer } = await import('@/lib/external-image-fetch');
      const buf = await fetchExternalImageBuffer(externalTarget, timeoutMs);
      if (buf && buf.length > 0) return true;
    } catch {
      /* try proxy probe next */
    }
  }

  const proxyPath = trimmed.startsWith('/api/media-proxy')
    ? trimmed
    : externalTarget
      ? normalizePhotoUrlForRender(externalTarget)
      : null;

  if (proxyPath?.startsWith('/api/media-proxy')) {
    if (await probeMediaUrlReliable(proxyPath, { timeoutMs, retries: 3, delayMs: 700 })) {
      return true;
    }
  }

  if (externalTarget) {
    return probeGalleryImageUrl(externalTarget, timeoutMs);
  }

  return probeMediaUrlReliable(trimmed, { timeoutMs, retries: 2, delayMs: 500 });
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
      const referer = refererForUrl(url);
      res = await fetch(url, {
        method: 'GET',
        headers: { ...FETCH_HEADERS, ...(referer ? { Referer: referer } : {}), Range: 'bytes=0-1023' },
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
 * - R2 / Cloudflare CDN URLs are trusted without probe — no extra latency.
 * - External URLs use a short 4 s timeout and higher concurrency.
 * - Unsplash seeds always get probed (they expire).
 */
export async function filterReachableGalleryUrls(
  urls: string[],
  opts: { maxProbe?: number; concurrency?: number; strict?: boolean } = {},
): Promise<{ urls: string[]; rejected: { url: string; reason: string }[] }> {
  const maxProbe = opts.maxProbe ?? 48;
  const concurrency = opts.concurrency ?? 12;
  const strict = opts.strict === true;
  const structural = filterUsableGalleryPhotoUrls(urls);
  const rejected: { url: string; reason: string }[] = [];
  const hasUnsplash = structural.some(
    (u) => u.includes('images.unsplash.com') || u.includes('plus.unsplash.com'),
  );

  // Trusted URLs never need a network probe
  const trusted = hasUnsplash ? [] : structural.filter(isTrustedGalleryUrl);
  const needProbe = hasUnsplash
    ? structural
    : structural.filter((u) => !isTrustedGalleryUrl(u)).slice(0, maxProbe);
  const overProbe = hasUnsplash ? [] : structural.filter((u) => !isTrustedGalleryUrl(u)).slice(maxProbe);

  const reachable: string[] = [];
  let idx = 0;

  // Faster timeout for gallery probes — 4 s is enough for a HEAD response
  const PROBE_TIMEOUT = 4_000;

  async function worker() {
    while (idx < needProbe.length) {
      const i = idx++;
      const url = needProbe[i]!;
      const ok = await probeGalleryImageUrl(url, PROBE_TIMEOUT);
      if (ok) reachable.push(url);
      else rejected.push({ url, reason: 'unreachable' });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, needProbe.length || 1) }, () => worker()));

  if (strict && overProbe.length > 0) {
    for (const url of overProbe) {
      rejected.push({ url, reason: 'probe_limit_exceeded' });
    }
  }

  const merged = strict
    ? [...trusted, ...reachable]
    : [
      ...trusted,
      ...reachable,
      ...overProbe.filter((u) => isUsableGalleryPhotoUrl(u)),
    ];
  const seen = new Set<string>();
  const urlsOut: string[] = [];
  for (const u of merged) {
    // /api/media?key=… photos are identified by the R2 key, not the bare path —
    // otherwise every tenant R2 photo collapses into one dedup slot.
    const mediaKey = u.toLowerCase().includes('/api/media?')
      ? new URLSearchParams(u.slice(u.indexOf('?') + 1)).get('key')
      : null;
    const key = (mediaKey ?? u.split('?')[0]!).toLowerCase();
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
    return fullSize;
  }
  return fullSize.length <= 1000 ? fullSize : fullSize.slice(0, 1000);
}

/** Brand-site URLs scraped without scheme (e.g. www.example.com/logo.png). */
function ensureHttpScheme(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (/^\/\//.test(url)) return `https:${url}`;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(url)) return `https://${url}`;
  return url;
}

/** Resolve artifact / gallery URLs for browser `<img src>`. */
export function resolveClientMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:')) return trimmed;

  const proxied = unwrapMediaProxyUrl(trimmed);
  if (proxied && proxied !== trimmed) {
    return resolveClientMediaUrl(proxied);
  }

  if (
    trimmed.startsWith('/api/media')
    || trimmed.startsWith('/api/generate-')
  ) {
    return trimmed;
  }

  const httpCandidate = trimmed.startsWith('http') ? trimmed : ensureHttpScheme(trimmed);
  if (httpCandidate.startsWith('http')) {
    if (httpCandidate.includes('canva.com/design')) return null;
    const displayUrl = normalizeExternalPhotoUrl(httpCandidate) ?? httpCandidate;
    // Unsplash: direct <img> works but fetch/canvas CORS fails; proxy also surfaces 404 clearly.
    if (displayUrl.includes('images.unsplash.com') || displayUrl.includes('plus.unsplash.com')) {
      return `/api/media-proxy?url=${encodeURIComponent(displayUrl)}`;
    }
    if (SAFE_HTTP_HOSTS.some((h) => displayUrl.includes(h))) return displayUrl;
    if (isTrustedGalleryUrl(displayUrl)) return displayUrl;
    // Brand-site hosts — proxy so broken DNS / hotlink blocks do not spam console or blank UI.
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

/** Browser `<img>` / canvas fetch — img uses direct external URLs; canvas keeps proxy for CORS. */
export function resolveBrowserImageSrc(url: string | null | undefined): string {
  if (!url?.trim()) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('data:')) return trimmed;
  const resolved = resolveClientMediaUrl(trimmed);
  if (resolved) {
    const displayUrl = normalizeExternalPhotoUrl(trimmed) ?? trimmed;
    const needsCanvasProxy = displayUrl.startsWith('http')
      && !displayUrl.includes('images.unsplash.com')
      && !displayUrl.includes('plus.unsplash.com')
      && !SAFE_HTTP_HOSTS.some((h) => displayUrl.includes(h));
    if (needsCanvasProxy && resolved === displayUrl) {
      return `/api/media-proxy?url=${encodeURIComponent(displayUrl)}`;
    }
    return resolved;
  }
  if (trimmed.startsWith('http')) {
    return `/api/media-proxy?url=${encodeURIComponent(trimmed)}`;
  }
  return '';
}

/** Feed / Mission Hub — artifact has a previewable media URL (http, /api/, /generated/, data:image). */
export function isPublishableMediaUrl(url: string | null | undefined): boolean {
  const u = String(url ?? '').trim();
  if (!u) return false;
  if (u.startsWith('data:image')) return true;
  return Boolean(resolveClientMediaUrl(u));
}
