/**
 * Logo Compositor — embeds a brand logo onto an enhanced product photo.
 *
 * Uses `sharp` for server-side image compositing.
 * Logo URL is detected from brand's reference_image_urls or a dedicated logo field.
 *
 * Placement options: bottom_right | bottom_left | top_right | top_left | none
 * Opacity: 0.0–1.0 (default 0.75 = watermark-style)
 * Size: percentage of the base image width (default 12%)
 *
 * JPEG / opaque logos often ship on a white square. We knock out near-white
 * backing pixels for compositing only — mark colors/shapes are never recolored.
 */

import sharp from '@/lib/sharp-runtime';

export type LogoPlacement =
  | 'bottom_right'
  | 'bottom_left'
  | 'top_right'
  | 'top_left'
  | 'top_center'
  | 'bottom_center'
  | 'none';

export interface LogoCompositorOptions {
  /** Enhanced product photo as Buffer or base64 data URL */
  baseImageBuffer: Buffer;
  /** Logo image URL (PNG with transparency preferred) */
  logoUrl: string;
  placement?: LogoPlacement;
  /** Logo width as % of base image width (1–30) */
  sizePct?: number;
  /** Logo opacity 0–1 */
  opacity?: number;
  /** Padding from edge in pixels */
  padding?: number;
}

/** Near-white RGB floor for backing knockout (mark pixels stay untouched). */
export const LOGO_WHITE_BACKING_THRESHOLD = 248;

export interface LogoCompositorResult {
  buffer: Buffer;
  /** MIME type of output */
  mimeType: 'image/png' | 'image/jpeg';
  /** Whether logo was successfully applied */
  logoApplied: boolean;
}

/** Resolve R2 proxy paths and relative /api/media URLs for server-side fetch. */
export async function resolveMediaFetchUrl(url: string): Promise<string> {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('data:')) return trimmed;
  if (trimmed.startsWith('/')) {
    const origin = (process.env.NEXTJS_INTERNAL_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
    return `${origin}${trimmed}`;
  }
  const { resolveExternallyAccessibleUrl } = await import('./media-url');
  return resolveExternallyAccessibleUrl(trimmed);
}

async function fetchLogoBuffer(logoUrl: string): Promise<Buffer | null> {
  try {
    const fetchUrl = await resolveMediaFetchUrl(logoUrl);
    const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function hasMeaningfulAlpha(data: Buffer, channels: number): boolean {
  if (channels < 4 || data.length < 4) return false;
  let transparent = 0;
  const pixels = Math.floor(data.length / channels);
  const sampleStep = Math.max(1, Math.floor(pixels / 4000));
  let sampled = 0;
  for (let i = 0; i < data.length; i += channels * sampleStep) {
    sampled += 1;
    if (data[i + 3]! < 240) transparent += 1;
  }
  return sampled > 0 && transparent / sampled >= 0.04;
}

function isNearWhiteBacking(
  r: number,
  g: number,
  b: number,
  threshold: number,
): boolean {
  const minC = Math.min(r, g, b);
  const maxC = Math.max(r, g, b);
  // Neutral light plate only — keep pale gold/brand ink in the mark.
  return minC >= threshold && maxC - minC <= 22;
}

/**
 * Prepare official logo bytes for overlay: knock out opaque white/cream square
 * backing so the mark sits on the design without a sticker plate.
 * Does not recolor, redraw, or reshape non-backing pixels.
 */
export async function prepareLogoForComposite(
  logoBuffer: Buffer,
  opts?: { whiteThreshold?: number },
): Promise<Buffer> {
  const threshold = opts?.whiteThreshold ?? LOGO_WHITE_BACKING_THRESHOLD;
  const softFloor = Math.max(0, threshold - 14);

  const { data, info } = await sharp(logoBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  if (channels < 4 || width < 2 || height < 2) {
    return sharp(logoBuffer).ensureAlpha().png().toBuffer();
  }

  // Already-transparent assets (true PNG marks) — keep as-is, only trim empty margin.
  if (hasMeaningfulAlpha(data, channels)) {
    return sharp(logoBuffer)
      .ensureAlpha()
      .trim({ threshold: 8 })
      .png()
      .toBuffer()
      .catch(() => sharp(logoBuffer).ensureAlpha().png().toBuffer());
  }

  const out = Buffer.from(data);
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let qh = 0;
  let qt = 0;

  const enqueue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (visited[idx]) return;
    const i = idx * 4;
    if (!isNearWhiteBacking(out[i]!, out[i + 1]!, out[i + 2]!, softFloor)) return;
    visited[idx] = 1;
    queue[qt++] = idx;
  };

  // Flood-fill from edges — removes the connected white plate, keeps interior art.
  for (let x = 0; x < width; x++) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (qh < qt) {
    const idx = queue[qh++]!;
    const x = idx % width;
    const y = (idx / width) | 0;
    const i = idx * 4;
    const minC = Math.min(out[i]!, out[i + 1]!, out[i + 2]!);
    if (minC >= threshold) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
    } else {
      // Soft fringe into transparency (JPEG compression halo)
      const t = (minC - softFloor) / Math.max(1, threshold - softFloor);
      out[i + 3] = Math.round(out[i + 3]! * (1 - Math.min(1, Math.max(0, t))));
      if (out[i + 3]! < 8) {
        out[i] = 0;
        out[i + 1] = 0;
        out[i + 2] = 0;
        out[i + 3] = 0;
      }
    }
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  return sharp(out, { raw: { width, height, channels: 4 } })
    .png()
    .trim({ threshold: 4 })
    .toBuffer()
    .catch(() =>
      sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer(),
    );
}

/** Anchors a mark may occupy, in the order we fall back through. */
const LOGO_ANCHOR_CANDIDATES: readonly Exclude<LogoPlacement, 'none'>[] = [
  'top_right', 'top_left', 'bottom_right', 'bottom_left', 'top_center', 'bottom_center',
];

/** Keep the art-directed anchor unless another corner is clearly calmer. */
const QUIET_ANCHOR_TOLERANCE = 1.4;

function anchorBox(
  placement: Exclude<LogoPlacement, 'none'>,
  frameW: number,
  frameH: number,
  boxW: number,
  boxH: number,
  padding: number,
): { left: number; top: number } {
  const right = Math.max(0, frameW - boxW - padding);
  const bottom = Math.max(0, frameH - boxH - padding);
  const centerX = Math.max(0, Math.round((frameW - boxW) / 2));
  switch (placement) {
    case 'top_left': return { left: padding, top: padding };
    case 'top_center': return { left: centerX, top: padding };
    case 'top_right': return { left: right, top: padding };
    case 'bottom_left': return { left: padding, top: bottom };
    case 'bottom_center': return { left: centerX, top: bottom };
    case 'bottom_right': default: return { left: right, top: bottom };
  }
}

/**
 * How busy is this region? Mean neighbour gradient over a grayscale raster.
 *
 * Painted typography and hard graphic edges produce far higher gradients than
 * foliage, sky, or a tablecloth, so this separates "quiet photo" from "occupied
 * by the headline" without needing to know what the text says.
 */
function regionBusyness(
  gray: Buffer,
  rasterW: number,
  rasterH: number,
  box: { left: number; top: number; width: number; height: number },
): number {
  const x0 = Math.max(0, Math.min(rasterW - 2, Math.floor(box.left)));
  const y0 = Math.max(0, Math.min(rasterH - 2, Math.floor(box.top)));
  const x1 = Math.max(x0 + 1, Math.min(rasterW - 1, Math.ceil(box.left + box.width)));
  const y1 = Math.max(y0 + 1, Math.min(rasterH - 1, Math.ceil(box.top + box.height)));
  let total = 0;
  let n = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = y * rasterW + x;
      const dx = Math.abs(gray[i]! - gray[i + 1]!);
      const dy = Math.abs(gray[i]! - gray[i + rasterW]!);
      total += dx + dy;
      n += 1;
    }
  }
  return n > 0 ? total / n : Number.POSITIVE_INFINITY;
}

/**
 * Choose the anchor where the mark will actually be readable.
 *
 * Placement is otherwise decided from layout metadata while the headline position
 * is decided by the image model at paint time, so the two drift apart — and when
 * a template carries no `type_zone_anchor` there is no metadata to reconcile at
 * all. Live frames shipped with the official mark composited straight across the
 * punchline. Measuring the rendered frame is the only signal that always exists.
 */
export async function pickQuietLogoPlacement(
  baseImageBuffer: Buffer,
  opts: {
    preferred?: LogoPlacement | null;
    sizePct?: number;
    padding?: number;
    candidates?: readonly Exclude<LogoPlacement, 'none'>[];
  } = {},
): Promise<{ placement: Exclude<LogoPlacement, 'none'>; movedFromPreferred: boolean }> {
  const candidates = opts.candidates ?? LOGO_ANCHOR_CANDIDATES;
  const preferred = opts.preferred && opts.preferred !== 'none' ? opts.preferred : null;
  const fallback = preferred ?? candidates[0] ?? 'bottom_right';
  try {
    const RASTER_W = 180;
    const meta = await sharp(baseImageBuffer).metadata();
    const frameW = meta.width ?? 1080;
    const frameH = meta.height ?? 1080;
    const rasterH = Math.max(8, Math.round((RASTER_W * frameH) / frameW));
    const { data } = await sharp(baseImageBuffer)
      .removeAlpha()
      .grayscale()
      .resize(RASTER_W, rasterH, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    // The mark plus a breathing margin, in raster units.
    const boxW = Math.max(4, Math.round((RASTER_W * (opts.sizePct ?? 12)) / 100 * 1.25));
    const boxH = boxW;
    const padding = Math.max(1, Math.round(((opts.padding ?? 20) / frameW) * RASTER_W));

    const scored = candidates.map((placement) => {
      const { left, top } = anchorBox(placement, RASTER_W, rasterH, boxW, boxH, padding);
      return {
        placement,
        busyness: regionBusyness(data, RASTER_W, rasterH, { left, top, width: boxW, height: boxH }),
      };
    }).sort((a, b) => a.busyness - b.busyness);

    const quietest = scored[0];
    if (!quietest || !Number.isFinite(quietest.busyness)) {
      return { placement: fallback, movedFromPreferred: false };
    }
    if (preferred) {
      const preferredScore = scored.find((s) => s.placement === preferred);
      // Art direction wins unless the corner it chose is measurably crowded.
      if (
        preferredScore
        && preferredScore.busyness <= quietest.busyness * QUIET_ANCHOR_TOLERANCE
      ) {
        return { placement: preferred as Exclude<LogoPlacement, 'none'>, movedFromPreferred: false };
      }
    }
    return {
      placement: quietest.placement,
      movedFromPreferred: Boolean(preferred && preferred !== quietest.placement),
    };
  } catch {
    return { placement: fallback, movedFromPreferred: false };
  }
}

/**
 * Detect the most likely logo URL from a list of brand reference image URLs.
 * Prioritizes: URLs containing 'logo', 'brand', 'icon', 'mark', or SVG/PNG extensions.
 */
export function detectLogoUrl(referenceUrls: string[]): string | null {
  if (!referenceUrls?.length) return null;

  const logoPatterns = /logo|brand|icon|mark|emblem|badge|watermark/i;
  const imageExts = /\.(png|svg|webp)(\?|$)/i;

  // Priority 1: URL contains logo keyword
  const byKeyword = referenceUrls.find(u => logoPatterns.test(u));
  if (byKeyword) return byKeyword;

  // Priority 2: PNG/SVG (likely transparent)
  const byExt = referenceUrls.find(u => imageExts.test(u));
  if (byExt) return byExt;

  // Fallback: first URL (caller should validate)
  return null;
}

/**
 * Composite a brand logo onto an enhanced product photo.
 * Returns the original buffer on any failure (non-fatal).
 */
export async function compositeLogoOnPhoto(
  opts: LogoCompositorOptions,
): Promise<LogoCompositorResult> {
  const {
    baseImageBuffer,
    logoUrl,
    placement = 'bottom_right',
    sizePct = 12,
    opacity = 0.75,
    padding = 20,
  } = opts;

  if (placement === 'none') {
    return { buffer: baseImageBuffer, mimeType: 'image/jpeg', logoApplied: false };
  }

  // Fetch logo
  const logoBuffer = await fetchLogoBuffer(logoUrl);
  if (!logoBuffer) {
    console.warn('[logo-compositor] Could not fetch logo, returning original');
    return { buffer: baseImageBuffer, mimeType: 'image/jpeg', logoApplied: false };
  }

  try {
    // Get base image metadata
    const baseMeta = await sharp(baseImageBuffer).metadata();
    const baseW = baseMeta.width ?? 1024;
    const baseH = baseMeta.height ?? 1024;

    // Calculate logo dimensions
    const logoW = Math.round((baseW * sizePct) / 100);

    // Knock out white JPEG/PNG plate, then resize — mark artwork unchanged
    const preparedLogo = await prepareLogoForComposite(logoBuffer);

    // Prepare logo: resize, preserve alpha, apply opacity
    const logoResized = await sharp(preparedLogo)
      .resize(logoW, undefined, { fit: 'inside', withoutEnlargement: false })
      .png()
      .toBuffer();
    const logoMeta = await sharp(logoResized).metadata();
    const placedW = logoMeta.width ?? logoW;
    const placedH = logoMeta.height ?? logoW;

    // If the logo has no alpha channel, add one for opacity
    let logoWithOpacity = logoResized;
    if (opacity < 1.0) {
      // Use linear compositing to apply opacity
      logoWithOpacity = await sharp(logoResized)
        .composite([{
          input: Buffer.from([
            255, 255, 255, Math.round(opacity * 255),
          ]),
          raw: { width: 1, height: 1, channels: 4 },
          tile: true,
          blend: 'dest-in',
        }])
        .png()
        .toBuffer();
    }

    // Calculate position based on placement
    let left: number;
    let top: number;

    switch (placement) {
      case 'top_left':
        left = padding;
        top = padding;
        break;
      case 'top_center':
        left = Math.round((baseW - placedW) / 2);
        top = padding;
        break;
      case 'top_right':
        left = baseW - placedW - padding;
        top = padding;
        break;
      case 'bottom_left':
        left = padding;
        top = baseH - placedH - padding;
        break;
      case 'bottom_center':
        left = Math.round((baseW - placedW) / 2);
        top = baseH - placedH - padding;
        break;
      case 'bottom_right':
      default:
        left = baseW - placedW - padding;
        top = baseH - placedH - padding;
        break;
    }

    // Ensure within bounds
    left = Math.max(0, Math.min(left, baseW - placedW));
    top = Math.max(0, Math.min(top, baseH - placedH));

    // Composite logo onto base
    const result = await sharp(baseImageBuffer)
      .composite([{
        input: logoWithOpacity,
        left,
        top,
        blend: 'over',
      }])
      .jpeg({ quality: 90 })
      .toBuffer();

    return { buffer: result, mimeType: 'image/jpeg', logoApplied: true };
  } catch (err: any) {
    console.error('[logo-compositor] Composite failed:', err?.message);
    return { buffer: baseImageBuffer, mimeType: 'image/jpeg', logoApplied: false };
  }
}

/**
 * Convert a base64 data URL or fetch a URL to Buffer.
 */
export async function imageUrlToBuffer(imageUrl: string): Promise<Buffer | null> {
  if (imageUrl.startsWith('data:')) {
    const b64 = imageUrl.split(',')[1];
    if (!b64) return null;
    return Buffer.from(b64, 'base64');
  }
  try {
    const fetchUrl = await resolveMediaFetchUrl(imageUrl);
    const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(45_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}
