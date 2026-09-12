/**
 * Server-only look vision inline. Do not import from client / Akış.
 * URL helpers stay in look-urls.ts.
 */
import {
  isAttachableVisionUrl,
  isLookDataUri,
  LOOK_INLINE_MAX_EDGE,
  LOOK_INLINE_TIMEOUT_MS,
  needsLookVisionResolve,
  type LookUrlCandidate,
} from '@/studio/look-urls';

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
