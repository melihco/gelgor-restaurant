/**
 * Carousel Compositor — adds branded frame overlays to carousel slide images.
 *
 * Uses `sharp` to composite:
 *   - Slide 1: headline text overlay + brand color gradient at bottom
 *   - Middle slides: subtle brand color gradient + slide number
 *   - Last slide: CTA + brand name + accent bar
 *   - All slides: "swipe" indicator chevron on right edge
 *
 * Returns array of Buffer (JPEG) ready for upload or base64.
 */

import sharp from '@/lib/sharp-runtime';

export interface CarouselSlide {
  /** Source image Buffer */
  buffer: Buffer;
  /** 0-based index */
  index: number;
  total: number;
  /** Middle-slide overlay line (from caption brief) */
  overlayCaption?: string;
}

export interface CarouselCompositorOptions {
  slides: CarouselSlide[];
  brandName: string;
  headline: string;
  /** Feed caption / brief — split across middle slides */
  caption?: string;
  cta?: string;
  primaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
}

export interface CarouselFromUrlsOptions {
  photoUrls: string[];
  brandName: string;
  headline: string;
  caption?: string;
  cta?: string;
  primaryColor?: string;
  accentColor?: string;
}

export interface CarouselFromUrlsResult {
  buffers: Buffer[];
  overlaysApplied: boolean;
  fetchedCount: number;
}

export interface CarouselCompositorResult {
  buffers: Buffer[];
  count: number;
}

/** Generate SVG overlay for a carousel slide */
function buildSlideOverlaySvg(opts: {
  width: number;
  height: number;
  index: number;
  total: number;
  headline: string;
  cta: string;
  brandName: string;
  primaryColor: string;
  accentColor: string;
  isFirst: boolean;
  isLast: boolean;
  slideCaption?: string;
}): Buffer {
  const {
    width, height, index, total, headline, cta, brandName, primaryColor, accentColor,
    isFirst, isLast, slideCaption,
  } = opts;

  const lines: string[] = [];

  // Common: bottom gradient (brand color)
  const gradH = Math.round(height * 0.32);
  const gradY = height - gradH;
  lines.push(
    `<defs>`,
    `  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">`,
    `    <stop offset="0%" stop-color="${primaryColor}" stop-opacity="0"/>`,
    `    <stop offset="100%" stop-color="${primaryColor}" stop-opacity="0.82"/>`,
    `  </linearGradient>`,
    `</defs>`,
    `<rect x="0" y="${gradY}" width="${width}" height="${gradH}" fill="url(#grad)"/>`,
  );

  // Slide number (top-right, except last slide where CTA takes over)
  if (!isLast) {
    lines.push(
      `<rect x="${width - 64}" y="16" width="48" height="24" rx="12" fill="${primaryColor}CC"/>`,
      `<text x="${width - 40}" y="33" font-size="11" fill="rgba(255,255,255,0.85)" text-anchor="middle" font-weight="700" font-family="Helvetica Neue, sans-serif">${index + 1}/${total}</text>`,
    );
  }

  // Swipe arrow (right edge, middle slides only — not last)
  if (!isLast) {
    const arrowY = Math.round(height / 2);
    lines.push(
      `<circle cx="${width - 20}" cy="${arrowY}" r="18" fill="${primaryColor}80"/>`,
      `<text x="${width - 20}" y="${arrowY + 5}" font-size="14" fill="rgba(255,255,255,0.9)" text-anchor="middle" font-family="Helvetica Neue, sans-serif">›</text>`,
    );
  }

  // First slide: headline
  if (isFirst && headline) {
    const truncated = headline.length > 40 ? headline.slice(0, 37) + '...' : headline;
    const fontSize = headline.length < 16 ? 36 : headline.length < 28 ? 30 : 24;
    const textY = height - 56;
    lines.push(
      `<text x="24" y="${textY}" font-size="${fontSize}" fill="#ffffff" font-weight="800" font-family="Helvetica Neue, sans-serif">${escSvg(truncated)}</text>`,
    );
    // Accent bar under headline
    lines.push(
      `<rect x="24" y="${textY + 8}" width="48" height="3" rx="1.5" fill="${accentColor}"/>`,
    );
    // Optional caption hook under headline (brief-aligned)
    if (slideCaption && isFirst) {
      const hook = slideCaption.length > 72 ? `${slideCaption.slice(0, 69)}...` : slideCaption;
      lines.push(
        `<text x="24" y="${textY + 36}" font-size="15" fill="rgba(255,255,255,0.88)" font-weight="500" font-family="Helvetica Neue, sans-serif">${escSvg(hook)}</text>`,
      );
    }
    // Brand name
    lines.push(
      `<text x="24" y="${height - 20}" font-size="11" fill="rgba(255,255,255,0.5)" font-family="Helvetica Neue, sans-serif" letter-spacing="3">${escSvg(brandName.toUpperCase())}</text>`,
    );
  }

  // Last slide: CTA + brand
  if (isLast) {
    // Full dark overlay for CTA visibility
    lines.push(
      `<rect x="0" y="0" width="${width}" height="${height}" fill="${primaryColor}B0"/>`,
    );

    // Brand name (large, centered)
    const brandFontSize = brandName.length < 10 ? 40 : brandName.length < 18 ? 32 : 26;
    lines.push(
      `<text x="${Math.round(width / 2)}" y="${Math.round(height / 2) - 20}" `,
      `  font-size="${brandFontSize}" fill="#ffffff" font-weight="800" font-family="Helvetica Neue, sans-serif" text-anchor="middle" letter-spacing="2">`,
      `  ${escSvg(brandName.toUpperCase())}`,
      `</text>`,
    );

    // Accent bar
    const barW = Math.round(width * 0.15);
    lines.push(
      `<rect x="${Math.round((width - barW) / 2)}" y="${Math.round(height / 2) + 6}" width="${barW}" height="3" rx="1.5" fill="${accentColor}"/>`,
    );

    // CTA button
    if (cta) {
      const ctaTrunc = cta.length > 30 ? cta.slice(0, 27) + '...' : cta;
      const ctaY = Math.round(height / 2) + 60;
      const ctaBtnW = Math.min(Math.max(ctaTrunc.length * 14, 140), width - 80);
      const ctaBtnX = Math.round((width - ctaBtnW) / 2);
      lines.push(
        `<rect x="${ctaBtnX}" y="${ctaY - 24}" width="${ctaBtnW}" height="44" rx="22" fill="${accentColor}"/>`,
        `<text x="${Math.round(width / 2)}" y="${ctaY + 6}" font-size="16" fill="#ffffff" font-weight="700" text-anchor="middle" font-family="Helvetica Neue, sans-serif">${escSvg(ctaTrunc)}</text>`,
      );
    }
  }

  // Middle slides: caption line + brand anchor
  if (!isFirst && !isLast) {
    if (slideCaption) {
      const line = slideCaption.length > 56 ? `${slideCaption.slice(0, 53)}...` : slideCaption;
      lines.push(
        `<text x="24" y="${height - 52}" font-size="20" fill="#ffffff" font-weight="700" font-family="Helvetica Neue, sans-serif">${escSvg(line)}</text>`,
      );
    }
    lines.push(
      `<text x="24" y="${height - 20}" font-size="10" fill="rgba(255,255,255,0.40)" font-family="Helvetica Neue, sans-serif" letter-spacing="3">${escSvg(brandName.toUpperCase())}</text>`,
    );
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">\n${lines.join('\n')}\n</svg>`;
  return Buffer.from(svg);
}

function escSvg(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Split caption into lines for middle carousel slides (venue photos stay visible under gradient). */
export function splitCaptionForCarouselSlides(caption: string, total: number): string[] {
  const clean = caption.replace(/\s+/g, ' ').trim();
  if (!clean || total < 3) return [];
  const middle = Math.max(1, total - 2);
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
  if (sentences.length >= middle) {
    return sentences.slice(0, middle);
  }
  const chunk = Math.ceil(clean.length / middle);
  const out: string[] = [];
  for (let i = 0; i < middle; i++) {
    const part = clean.slice(i * chunk, (i + 1) * chunk).trim();
    if (part) out.push(part);
  }
  return out;
}

/** Composite branded frames onto all carousel slides */
export async function compositeCarouselFrames(
  opts: CarouselCompositorOptions,
): Promise<CarouselCompositorResult> {
  const {
    slides,
    brandName,
    headline,
    caption = '',
    cta = '',
    primaryColor = '#1a2b4a',
    accentColor = '#c9a96e',
  } = opts;

  const middleCaptions = splitCaptionForCarouselSlides(caption, slides[0]?.total ?? slides.length);
  const results: Buffer[] = [];

  for (const slide of slides) {
    try {
      const meta = await sharp(slide.buffer).metadata();
      const w = meta.width ?? 1080;
      const h = meta.height ?? 1080;
      const isFirst = slide.index === 0;
      const isLast = slide.index === slide.total - 1;
      const slideCaption = slide.overlayCaption
        ?? (isFirst ? caption.slice(0, 120) : (!isLast ? middleCaptions[slide.index - 1] : undefined));

      const overlaySvg = buildSlideOverlaySvg({
        width: w, height: h,
        index: slide.index, total: slide.total,
        headline, cta, brandName,
        primaryColor, accentColor,
        isFirst, isLast,
        slideCaption,
      });

      const composited = await sharp(slide.buffer)
        .composite([{ input: overlaySvg, top: 0, left: 0 }])
        .jpeg({ quality: 90 })
        .toBuffer();

      results.push(composited);
    } catch (err: any) {
      console.warn(`[carousel-compositor] Slide ${slide.index} failed:`, err?.message);
      results.push(slide.buffer); // fallback: original
    }
  }

  return { buffers: results, count: results.length };
}

/** Fetch image URL → Buffer (via media proxy) */
export async function fetchCarouselImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const proxyBase = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';
    const proxyUrl = url.startsWith('http')
      ? `${proxyBase}/api/media-proxy?url=${encodeURIComponent(url)}`
      : url.startsWith('/')
        ? `${proxyBase}${url}`
        : url;
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Venue/gallery carousel passthrough — keep real photos, add headline/caption/CTA overlays.
 */
export async function compositeCarouselFromPhotoUrls(
  opts: CarouselFromUrlsOptions,
): Promise<CarouselFromUrlsResult> {
  const urls = opts.photoUrls.filter((u) => typeof u === 'string' && u.trim().length > 0).slice(0, 4);
  if (urls.length < 2) {
    return { buffers: [], overlaysApplied: false, fetchedCount: 0 };
  }

  const slideBuffers = await Promise.all(
    urls.map(async (url, idx) => {
      const buf = await fetchCarouselImageBuffer(url);
      return buf ? { buffer: buf, index: idx, total: urls.length } : null;
    }),
  );
  const validSlides = slideBuffers.filter((s): s is NonNullable<typeof s> => s !== null);
  if (validSlides.length < 2) {
    return { buffers: [], overlaysApplied: false, fetchedCount: validSlides.length };
  }

  const { buffers } = await compositeCarouselFrames({
    slides: validSlides,
    brandName: opts.brandName,
    headline: opts.headline,
    caption: opts.caption,
    cta: opts.cta,
    primaryColor: opts.primaryColor ?? '#1a2b4a',
    accentColor: opts.accentColor ?? '#c9a96e',
  });

  return {
    buffers,
    overlaysApplied: buffers.length >= 2,
    fetchedCount: validSlides.length,
  };
}
