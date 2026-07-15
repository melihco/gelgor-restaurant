/**
 * Canvas aspect normalization — generated design images must match the format
 * they were produced for (post → 4:5, story/reel → 9:16).
 *
 * GPT-image models only support 1024×1024 / 1024×1536 / 1536×1024 canvases, so
 * portrait design cards come back as 2:3 regardless of the target channel.
 * Without normalization, feed posts render story-tall and stories render
 * shorter than 9:16 — the exact "story sized posts / post sized stories"
 * inconsistency seen in production feeds.
 */

export interface TargetCanvas {
  width: number;
  height: number;
  /** width / height */
  ratio: number;
  label: '4:5' | '9:16';
}

export const POST_CANVAS: TargetCanvas = { width: 1080, height: 1350, ratio: 1080 / 1350, label: '4:5' };
export const STORY_CANVAS: TargetCanvas = { width: 1080, height: 1920, ratio: 1080 / 1920, label: '9:16' };

/** Aspect drift tolerance — below this the image is considered already correct. */
const RATIO_TOLERANCE = 0.02;

function isStoryContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return ct === 'story' || ct.includes('story') || ct.includes('reel');
}

/**
 * Which canvas the generated image must land on, from the content type the
 * idea/slot was produced for. Returns null when no normalization applies
 * (e.g. square organic posts already generated at a native 1:1 size).
 */
export function resolveTargetCanvas(
  contentType: string,
  isDesignCard: boolean,
): TargetCanvas | null {
  if (isStoryContentType(contentType)) return STORY_CANVAS;
  // Designed feed cards are produced on the 1024×1536 portrait canvas but the
  // feed contract is 4:5.
  if (isDesignCard) return POST_CANVAS;
  return null;
}

export function canvasNeedsNormalization(
  width: number,
  height: number,
  target: TargetCanvas,
): boolean {
  if (!width || !height) return false;
  const ratio = width / height;
  return Math.abs(ratio - target.ratio) / target.ratio > RATIO_TOLERANCE;
}

/**
 * Center-crop + resize a raw image buffer onto the target canvas.
 * Returns null when the buffer already matches the target ratio.
 */
export async function normalizeCanvasBuffer(
  buffer: Buffer,
  target: TargetCanvas,
): Promise<Buffer | null> {
  const { default: sharp } = await import('sharp');
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) return null;
  if (!canvasNeedsNormalization(meta.width, meta.height, target)) return null;
  return sharp(buffer)
    .resize(target.width, target.height, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 92 })
    .toBuffer();
}

async function fetchImageBuffer(imageUrl: string): Promise<Buffer | null> {
  const trimmed = imageUrl.trim();
  if (trimmed.startsWith('data:image/')) {
    const base64 = trimmed.slice(trimmed.indexOf(',') + 1);
    return Buffer.from(base64, 'base64');
  }
  let fetchTarget = trimmed;
  if (trimmed.startsWith('/')) {
    const { getNextjsInternalOrigin } = await import('@/lib/runtime-config');
    fetchTarget = `${getNextjsInternalOrigin()}${trimmed}`;
  }
  if (!fetchTarget.startsWith('http')) return null;
  const res = await fetch(fetchTarget, {
    signal: AbortSignal.timeout(30_000),
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*' },
  });
  if (!res.ok) return null;
  const mime = res.headers.get('content-type')?.split(';')[0] ?? '';
  if (mime && !mime.startsWith('image/')) return null;
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Normalize a generated image URL (data: / http / internal path) onto the
 * target canvas. Returns a JPEG data URL when a crop was applied, or null when
 * the image already matches (or could not be read — caller keeps the original).
 */
export async function normalizeGeneratedImageAspect(
  imageUrl: string,
  target: TargetCanvas,
): Promise<string | null> {
  try {
    const buffer = await fetchImageBuffer(imageUrl);
    if (!buffer) return null;
    const normalized = await normalizeCanvasBuffer(buffer, target);
    if (!normalized) return null;
    return `data:image/jpeg;base64,${normalized.toString('base64')}`;
  } catch (err) {
    console.warn(
      '[design-canvas-aspect] normalization failed — keeping original:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
