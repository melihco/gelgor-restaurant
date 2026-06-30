/**
 * Single source of truth for trusted CDN hosts and gallery prefixes.
 * Used by media-url.ts, remotion render route, and gallery-photo-matcher.
 */

/** Hosts safe for direct HTTP access (no proxy needed for display or headless render). */
export const SAFE_HTTP_HOSTS: readonly string[] = [
  'oaidalleapiprodscus.blob.core',
  'fal-cdn',
  'fal.media',
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
];

/** Trusted CDN prefixes — skip network probe entirely (no stale/expired risk). */
export const TRUSTED_GALLERY_PREFIXES: readonly string[] = [
  'https://pub-',
  'r2.cloudflarestorage.com',
  'r2.dev',
  'imagedelivery.net',
  'cdn.smartagency',
  '/api/media',
];

export function isSafeHttpHost(url: string): boolean {
  const lower = url.toLowerCase();
  return SAFE_HTTP_HOSTS.some((h) => lower.includes(h));
}

export function isTrustedGalleryUrl(url: string): boolean {
  const u = url.trim();
  return TRUSTED_GALLERY_PREFIXES.some((prefix) => u.includes(prefix));
}

export function isHeadlessRenderSafeUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  return isSafeHttpHost(url);
}
