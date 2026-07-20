/**
 * Canvas aspect normalization — generated design images must match the format
 * they were produced for (post → 4:5, story/reel → 9:16).
 *
 * GPT-image models only support 1024×1024 / 1024×1536 / 1536×1024 canvases, so
 * portrait design cards come back as 2:3 regardless of the target channel.
 * Without normalization, feed posts render story-tall and stories/posts look
 * the same height in the library and production feed.
 */

export interface TargetCanvas {
  width: number;
  height: number;
  /** width / height */
  ratio: number;
  label: '4:5' | '9:16';
  /**
   * How to map GPT's 2:3 canvas onto the target:
   * - cover: fill the frame (post default — true 4:5 feed, crops excess)
   * - contain: letterbox (legacy; leaves bars that make posts look story-tall)
   */
  fit?: 'cover' | 'contain';
}

export const POST_CANVAS: TargetCanvas = {
  width: 1080,
  height: 1350,
  ratio: 1080 / 1350,
  label: '4:5',
  fit: 'cover',
};
export const STORY_CANVAS: TargetCanvas = {
  width: 1080,
  height: 1920,
  ratio: 1080 / 1920,
  label: '9:16',
  fit: 'cover',
};

/** Aspect drift tolerance — below this the image is considered already correct. */
const RATIO_TOLERANCE = 0.02;

function isStoryContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return (
    ct === 'story'
    || ct === 'instagram_story'
    || ct === 'reel'
    || ct === 'instagram_reel'
    || ct.includes('story')
    || ct.includes('reel')
  );
}

function isFeedPostContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  if (isStoryContentType(ct)) return false;
  return (
    ct === 'post'
    || ct === 'instagram_post'
    || ct.includes('feed')
    || ct.includes('post')
  );
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
  // feed contract is 4:5. Organic (non-design) posts stay native (often 1:1).
  if (isDesignCard && isFeedPostContentType(contentType)) return POST_CANVAS;
  if (isDesignCard) return POST_CANVAS;
  return null;
}

/** Resolve canvas from template / fal channel format. */
export function resolveTargetCanvasForFormat(
  format: 'post' | 'story' | 'reel' | 'reel_cover' | string,
): TargetCanvas {
  if (format === 'post' || format === 'carousel') return POST_CANVAS;
  return STORY_CANVAS;
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
 * Map a raw image onto the target canvas.
 *
 * Post (4:5): cover-fill so the frame is a real feed post — not a letterboxed
 * 2:3 story slab. Story/reel (9:16): cover-fill to true vertical.
 * GPT safe-zone prompts keep type inside the retained region.
 */
export async function normalizeCanvasBuffer(
  buffer: Buffer,
  target: TargetCanvas,
): Promise<Buffer | null> {
  const { default: sharp } = await import('sharp');
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) return null;
  if (!canvasNeedsNormalization(meta.width, meta.height, target)) return null;
  const fit = target.fit ?? 'cover';
  return sharp(buffer)
    .resize(target.width, target.height, {
      fit,
      position: 'centre',
      background: { r: 8, g: 10, b: 14, alpha: 1 },
    })
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
  if (mime && !mime.startsWith('image/') && !mime.includes('octet-stream')) return null;
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

/**
 * Hard canvas lock for template library / fal stills.
 * Always returns a URL; logs when the source could not be rewritten.
 */
export async function lockImageToCanvas(
  imageUrl: string,
  target: TargetCanvas,
): Promise<{ url: string; locked: boolean; label: TargetCanvas['label'] }> {
  const normalized = await normalizeGeneratedImageAspect(imageUrl, target);
  if (normalized) {
    return { url: normalized, locked: true, label: target.label };
  }
  return { url: imageUrl, locked: false, label: target.label };
}
