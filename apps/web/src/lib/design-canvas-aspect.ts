/**
 * Canvas aspect normalization — generated design images must match the format
 * they were produced for (post → 4:5, story/reel → 9:16).
 *
 * gpt-image-2 can render native 4:5 / 9:16 sizes (edges ÷16) — prefer that so we
 * never cover-crop faces/subjects. Legacy gpt-image-1 only emits 1024×1536 (2:3);
 * for those frames we letterbox (contain) onto the channel canvas — never cover.
 */

export interface TargetCanvas {
  width: number;
  height: number;
  /** width / height */
  ratio: number;
  label: '4:5' | '9:16';
  /**
   * How to map a mismatched-ratio source onto the target:
   * - contain: letterbox (default — never crop hero subjects / type)
   * - cover: fill the frame (legacy; crops excess — avoid for production)
   */
  fit?: 'cover' | 'contain';
}

export const POST_CANVAS: TargetCanvas = {
  width: 1080,
  height: 1350,
  ratio: 1080 / 1350,
  label: '4:5',
  fit: 'contain',
};
export const STORY_CANVAS: TargetCanvas = {
  width: 1080,
  height: 1920,
  ratio: 1080 / 1920,
  label: '9:16',
  fit: 'contain',
};

/**
 * gpt-image-2 native request sizes (both edges multiples of 16).
 * Exact Instagram channel ratios — avoids 2:3 → 4:5/9:16 cover-crop.
 */
export const GPT_IMAGE_2_FEED_SIZE = '1088x1360'; // 4:5
export const GPT_IMAGE_2_STORY_SIZE = '1152x2048'; // 9:16

/** True when the OpenAI image model accepts arbitrary WIDTHxHEIGHT strings. */
export function supportsFlexibleOpenAiImageSize(model: string): boolean {
  return model.trim().toLowerCase().startsWith('gpt-image-2');
}

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
 * Map a raw image onto the target canvas without cover-cropping content.
 *
 * - Same aspect, wrong pixels → scale (`fill`) to exact Instagram dims.
 * - Different aspect (legacy 2:3) → letterbox (`contain`) so faces/type stay whole.
 */
export async function normalizeCanvasBuffer(
  buffer: Buffer,
  target: TargetCanvas,
): Promise<Buffer | null> {
  const { default: sharp } = await import('sharp');
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) return null;

  const alreadyExact = meta.width === target.width && meta.height === target.height;
  if (alreadyExact) return null;

  const ratioMatches = !canvasNeedsNormalization(meta.width, meta.height, target);
  // Same channel ratio: scale only. Mismatched (e.g. 2:3→4:5): letterbox — never cover.
  const fit = ratioMatches ? 'fill' : (target.fit ?? 'contain');
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
 * target canvas. Returns a JPEG data URL when resized/letterboxed, or null when
 * the image already matches exactly (or could not be read — caller keeps original).
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
