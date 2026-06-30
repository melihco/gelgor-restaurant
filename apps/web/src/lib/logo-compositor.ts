/**
 * Logo Compositor — embeds a brand logo onto an enhanced product photo.
 *
 * Uses `sharp` for server-side image compositing.
 * Logo URL is detected from brand's reference_image_urls or a dedicated logo field.
 *
 * Placement options: bottom_right | bottom_left | top_right | top_left | none
 * Opacity: 0.0–1.0 (default 0.75 = watermark-style)
 * Size: percentage of the base image width (default 12%)
 */

import sharp from 'sharp';

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

export interface LogoCompositorResult {
  buffer: Buffer;
  /** MIME type of output */
  mimeType: 'image/png' | 'image/jpeg';
  /** Whether logo was successfully applied */
  logoApplied: boolean;
}

async function fetchLogoBuffer(logoUrl: string): Promise<Buffer | null> {
  try {
    const proxyBase = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';
    const url = logoUrl.startsWith('http')
      ? `${proxyBase}/api/media-proxy?url=${encodeURIComponent(logoUrl)}`
      : logoUrl;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
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

    // Prepare logo: resize, preserve alpha, apply opacity
    let logoSharp = sharp(logoBuffer).resize(logoW, undefined, { fit: 'inside', withoutEnlargement: false });

    // Apply opacity via composite with extract approach
    // Sharp supports opacity via premultiplication on PNG
    const logoResized = await logoSharp.png().toBuffer();
    const logoMeta = await sharp(logoResized).metadata();
    const logoH = logoMeta.height ?? logoW;

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
        left = Math.round((baseW - logoW) / 2);
        top = padding;
        break;
      case 'top_right':
        left = baseW - logoW - padding;
        top = padding;
        break;
      case 'bottom_left':
        left = padding;
        top = baseH - logoH - padding;
        break;
      case 'bottom_center':
        left = Math.round((baseW - logoW) / 2);
        top = baseH - logoH - padding;
        break;
      case 'bottom_right':
      default:
        left = baseW - logoW - padding;
        top = baseH - logoH - padding;
        break;
    }

    // Ensure within bounds
    left = Math.max(0, Math.min(left, baseW - logoW));
    top = Math.max(0, Math.min(top, baseH - logoH));

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
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}
