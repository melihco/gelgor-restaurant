/**
 * Bind-time vision URL resolve. Look used to treat /api/media-only
 * paths as attachable; everything else (uploads, R2 keys, proxy) fell
 * through as look_unavailable.
 */

export function isAttachableVisionUrl(url: string): boolean {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:image/');
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

const LOOK_INLINE_MAX_EDGE = 1024;

/**
 * OpenAI vision cannot fetch Instagram / hotlink-blocked CDNs.
 * Grafiker already inlines bytes. Look must do the same or the call
 * throws and the slot dies as look_unavailable.
 */
export async function inlineLookVisionDataUris<T extends LookUrlCandidate>(
  candidates: T[],
): Promise<T[]> {
  const { fetchReviewableFrameBuffer } = await import('@/lib/external-image-fetch');
  return Promise.all(
    candidates.map(async (candidate) => {
      const source = (candidate.visionUrl ?? candidate.url).trim();
      if (!source || source.startsWith('data:image/')) return candidate;
      try {
        const buf = await fetchReviewableFrameBuffer(source, 12_000);
        if (!buf || buf.length < 100) return candidate;
        const visionUrl = await bufferToLookDataUri(buf);
        return visionUrl ? { ...candidate, visionUrl } : candidate;
      } catch {
        return candidate;
      }
    }),
  );
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
    const mime = buf[0] === 0x89 ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  }
}
