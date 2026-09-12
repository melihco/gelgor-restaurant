/**
 * Bind-time vision URL resolve. Look used to treat /api/media-only
 * paths as attachable; everything else (uploads, R2 keys, proxy) fell
 * through as look_unavailable.
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

export async function resolveLookVisionUrls<T extends LookUrlCandidate>(
  candidates: T[],
): Promise<T[]> {
  const needsWork = candidates.some((c) => needsLookVisionResolve(c.visionUrl ?? c.url));
  if (!needsWork) return candidates;

  const { resolveExternallyAccessibleUrl } = await import('@/lib/media-url');
  return Promise.all(
    candidates.map(async (candidate) => {
      const source = (candidate.visionUrl ?? candidate.url).trim();
      if (!needsLookVisionResolve(source)) return candidate;
      try {
        const visionUrl = await resolveExternallyAccessibleUrl(source);
        return isAttachableVisionUrl(visionUrl)
          ? { ...candidate, visionUrl }
          : candidate;
      } catch {
        return candidate;
      }
    }),
  );
}

/**
 * OpenAI vision cannot fetch Instagram / Wix / hotlink-blocked CDNs.
 * Grafiker already inlines bytes. Look must do the same or the call
 * throws and the slot dies as look_call_failed after a long hang.
 * One in-call fetch retry — factory must not tour the slot three times.
 */
export async function inlineLookVisionDataUris<T extends LookUrlCandidate>(
  candidates: T[],
): Promise<T[]> {
  const { fetchReviewableFrameBuffer } = await import('@/lib/external-image-fetch');
  return Promise.all(
    candidates.map(async (candidate) => {
      const source = (candidate.visionUrl ?? candidate.url).trim();
      if (!source || isLookDataUri(source)) return candidate;
      let buf = await fetchLookBuffer(fetchReviewableFrameBuffer, source);
      if (!buf) {
        buf = await fetchLookBuffer(fetchReviewableFrameBuffer, source);
      }
      if (!buf || buf.length < 100) return candidate;
      try {
        const visionUrl = await bufferToLookDataUri(buf);
        return visionUrl ? { ...candidate, visionUrl } : candidate;
      } catch {
        return candidate;
      }
    }),
  );
}

async function fetchLookBuffer(
  fetchFn: (url: string, timeoutMs?: number) => Promise<Buffer | null>,
  source: string,
): Promise<Buffer | null> {
  try {
    return await fetchFn(source, LOOK_INLINE_TIMEOUT_MS);
  } catch {
    return null;
  }
}

export function sniffLookImageMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50) {
    return 'image/png';
  }
  if (
    buf.length >= 12
    && buf.slice(0, 4).toString('ascii') === 'RIFF'
    && buf.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buf.length >= 12 && buf.slice(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.slice(8, 12).toString('ascii');
    if (brand.startsWith('avif') || brand.startsWith('avis')) return 'image/avif';
    if (brand.startsWith('heic') || brand.startsWith('mif1') || brand.startsWith('heix')) {
      return 'image/heic';
    }
  }
  return null;
}

async function bufferToLookDataUri(buf: Buffer): Promise<string | null> {
  try {
    const sharp = (await import('sharp')).default;
    const jpeg = await sharp(buf)
      .rotate()
      .resize(LOOK_INLINE_MAX_EDGE, LOOK_INLINE_MAX_EDGE, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 72 })
      .toBuffer();
    if (jpeg.length < 80) return null;
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  } catch {
    const mime = sniffLookImageMime(buf);
    if (!mime || mime === 'image/avif' || mime === 'image/heic') return null;
    return `data:${mime};base64,${buf.toString('base64')}`;
  }
}
