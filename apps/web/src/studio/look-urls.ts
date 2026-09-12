/**
 * Bind-time vision URL helpers. Client-safe — no sharp / Node I/O.
 * Inlining lives in look-urls-inline.ts (server / worker only).
 */

const HOTLINK_VISION_HOSTS = [
  'cdninstagram.com',
  'fbcdn.net',
  'instagram.com',
  'wixstatic.com',
  'wixmp.com',
  'parastorage.com',
];

export const LOOK_INLINE_TIMEOUT_MS = 20_000;
export const LOOK_INLINE_MAX_EDGE = 1024;

export function isAttachableVisionUrl(url: string): boolean {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:image/');
}

export function isLookDataUri(url: string): boolean {
  return url.trim().startsWith('data:image/');
}

/** Wix / Instagram — OpenAI cannot fetch these; look must inline bytes. */
export function isHotlinkBlockedVisionUrl(url: string): boolean {
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return HOTLINK_VISION_HOSTS.some((marker) => host === marker || host.endsWith(`.${marker}`));
  } catch {
    return false;
  }
}

/**
 * What the look model may receive. Data URIs always. Remote HTTP only when
 * the host is not a known hotlink wall (tests + public CDNs).
 */
export function isLookModelVisionUrl(url: string, allowRemoteHttp = false): boolean {
  const trimmed = url.trim();
  if (isLookDataUri(trimmed)) return true;
  if (!allowRemoteHttp) return false;
  if (!isAttachableVisionUrl(trimmed)) return false;
  return !isHotlinkBlockedVisionUrl(trimmed);
}

export function needsLookVisionResolve(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (isAttachableVisionUrl(trimmed) && !isInternalHttpMediaUrl(trimmed)) return false;
  if (trimmed.startsWith('/')) return true;
  if (/^[0-9a-f-]{36}\/(posts|stories|reels|videos|images|image|video)\//i.test(trimmed)) {
    return true;
  }
  return isInternalHttpMediaUrl(trimmed);
}

function isInternalHttpMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    return (
      path.includes('/api/media')
      || path.includes('/api/media-proxy')
      || path.startsWith('/uploads')
      || path.startsWith('/generated')
    );
  } catch {
    return false;
  }
}

export type LookUrlCandidate = {
  url: string;
  visionUrl?: string;
};
