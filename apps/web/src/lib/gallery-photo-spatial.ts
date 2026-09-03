/**
 * Per-photo spatial layer for gallery analysis → design prompts.
 *
 * Matching already knows mood/tags/subject. Layout was blind: type landed
 * wherever the image model guessed. This module measures (or parses) where
 * the subject sits, which cells are quiet, and the photo's dominant color,
 * then emits a short lock the designer prompt must obey.
 *
 * Pixel measure is SSOT when a buffer exists. Vision fields persist when
 * analysis ran without a fetch. No tenant / brand-name branches.
 */

import sharp from '@/lib/sharp-runtime';

export const GALLERY_SPATIAL_ANCHORS = [
  'top_left',
  'top_center',
  'top_right',
  'mid_left',
  'center',
  'mid_right',
  'bottom_left',
  'bottom_center',
  'bottom_right',
] as const;

export type GallerySpatialAnchor = (typeof GALLERY_SPATIAL_ANCHORS)[number];
export type GalleryTypeBand = 'top' | 'bottom' | 'left' | 'right' | 'center';
export type GallerySpatialSource = 'pixel' | 'vision' | 'merged';

export interface GallerySubjectBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GalleryPhotoSpatial {
  subjectAnchor: GallerySpatialAnchor;
  quietAnchors: GallerySpatialAnchor[];
  typeSeat: GallerySpatialAnchor;
  typeBand: GalleryTypeBand;
  dominantHex: string;
  typeSeatLuma: number;
  subjectLuma: number;
  subjectBox?: GallerySubjectBox;
  source: GallerySpatialSource;
  measuredAt?: string;
}

type SpatialMeta = { spatial?: GalleryPhotoSpatial | null } | null | undefined;

const ANCHOR_SET = new Set<string>(GALLERY_SPATIAL_ANCHORS);

const ANCHOR_LABEL: Record<GallerySpatialAnchor, string> = {
  top_left: 'upper-left',
  top_center: 'upper-center',
  top_right: 'upper-right',
  mid_left: 'mid-left',
  center: 'center',
  mid_right: 'mid-right',
  bottom_left: 'lower-left',
  bottom_center: 'lower-center',
  bottom_right: 'lower-right',
};

const OPPOSITE: Record<GallerySpatialAnchor, readonly GallerySpatialAnchor[]> = {
  top_left: ['bottom_right', 'mid_right', 'bottom_center'],
  top_center: ['bottom_center', 'bottom_left', 'bottom_right'],
  top_right: ['bottom_left', 'mid_left', 'bottom_center'],
  mid_left: ['mid_right', 'top_right', 'bottom_right'],
  center: ['top_left', 'top_right', 'bottom_left', 'bottom_right', 'mid_left', 'mid_right'],
  mid_right: ['mid_left', 'top_left', 'bottom_left'],
  bottom_left: ['top_right', 'mid_right', 'top_center'],
  bottom_center: ['top_center', 'top_left', 'top_right'],
  bottom_right: ['top_left', 'mid_left', 'top_center'],
};

const TYPE_FRIENDLY: readonly GallerySpatialAnchor[] = [
  'top_left',
  'top_right',
  'bottom_left',
  'bottom_right',
  'mid_left',
  'mid_right',
  'top_center',
  'bottom_center',
];

function asAnchor(raw: unknown): GallerySpatialAnchor | null {
  const t = String(raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return ANCHOR_SET.has(t) ? (t as GallerySpatialAnchor) : null;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function parseSubjectBox(raw: unknown): GallerySubjectBox | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const x = Number(o.x);
  const y = Number(o.y);
  const w = Number(o.w ?? o.width);
  const h = Number(o.h ?? o.height);
  if (![x, y, w, h].every(Number.isFinite)) return undefined;
  const box = { x: clamp01(x), y: clamp01(y), w: clamp01(w), h: clamp01(h) };
  if (box.w < 0.05 || box.h < 0.05) return undefined;
  if (box.x + box.w > 1.05 || box.y + box.h > 1.05) return undefined;
  return box;
}

function parseHex(raw: unknown): string | null {
  const t = String(raw ?? '').trim();
  const m = t.match(/^#?([0-9a-f]{6})$/i);
  return m ? `#${m[1]!.toLowerCase()}` : null;
}

function typeBandFromSeat(seat: GallerySpatialAnchor): GalleryTypeBand {
  if (seat.startsWith('top_')) return 'top';
  if (seat.startsWith('bottom_')) return 'bottom';
  if (seat === 'mid_left') return 'left';
  if (seat === 'mid_right') return 'right';
  return 'center';
}

function pickTypeSeat(
  subject: GallerySpatialAnchor,
  quiet: GallerySpatialAnchor[],
): GallerySpatialAnchor {
  const pool = (quiet.length > 0 ? quiet : TYPE_FRIENDLY).filter((a) => a !== subject);
  const ranked = [...pool].sort((a, b) => {
    const opp = OPPOSITE[subject];
    const aOpp = opp.includes(a) ? 0 : 1;
    const bOpp = opp.includes(b) ? 0 : 1;
    if (aOpp !== bOpp) return aOpp - bOpp;
    const aFriendly = TYPE_FRIENDLY.includes(a) ? 0 : 1;
    const bFriendly = TYPE_FRIENDLY.includes(b) ? 0 : 1;
    return aFriendly - bFriendly;
  });
  return ranked[0] ?? 'top_left';
}

function normalizeSpatial(partial: {
  subjectAnchor: GallerySpatialAnchor;
  quietAnchors?: GallerySpatialAnchor[];
  typeSeat?: GallerySpatialAnchor | null;
  typeBand?: GalleryTypeBand | null;
  dominantHex?: string | null;
  typeSeatLuma?: number;
  subjectLuma?: number;
  subjectBox?: GallerySubjectBox;
  source: GallerySpatialSource;
  measuredAt?: string;
}): GalleryPhotoSpatial {
  const quiet = [...new Set((partial.quietAnchors ?? []).filter((a) => a !== partial.subjectAnchor))]
    .slice(0, 4);
  const typeSeat = partial.typeSeat && partial.typeSeat !== partial.subjectAnchor
    ? partial.typeSeat
    : pickTypeSeat(partial.subjectAnchor, quiet);
  return {
    subjectAnchor: partial.subjectAnchor,
    quietAnchors: quiet.length > 0 ? quiet : [typeSeat],
    typeSeat,
    typeBand: partial.typeBand ?? typeBandFromSeat(typeSeat),
    dominantHex: partial.dominantHex ?? '#808080',
    typeSeatLuma: Number.isFinite(partial.typeSeatLuma) ? Math.round(partial.typeSeatLuma!) : 160,
    subjectLuma: Number.isFinite(partial.subjectLuma) ? Math.round(partial.subjectLuma!) : 80,
    ...(partial.subjectBox ? { subjectBox: partial.subjectBox } : {}),
    source: partial.source,
    ...(partial.measuredAt ? { measuredAt: partial.measuredAt } : {}),
  };
}

/** Accept camelCase (Next persist) or snake_case (Python / vision dump). */
export function parseGalleryPhotoSpatial(raw: unknown): GalleryPhotoSpatial | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const nested = (o.spatial && typeof o.spatial === 'object')
    ? (o.spatial as Record<string, unknown>)
    : o;
  const subject = asAnchor(nested.subjectAnchor ?? nested.subject_anchor);
  if (!subject) return null;
  const quietRaw = nested.quietAnchors ?? nested.quiet_anchors;
  const quiet = Array.isArray(quietRaw)
    ? quietRaw.map(asAnchor).filter((a): a is GallerySpatialAnchor => Boolean(a))
    : [];
  const sourceRaw = String(nested.source ?? 'vision').toLowerCase();
  const source: GallerySpatialSource =
    sourceRaw === 'pixel' || sourceRaw === 'merged' ? sourceRaw : 'vision';
  return normalizeSpatial({
    subjectAnchor: subject,
    quietAnchors: quiet,
    typeSeat: asAnchor(nested.typeSeat ?? nested.type_seat),
    typeBand: (['top', 'bottom', 'left', 'right', 'center'] as const)
      .find((b) => b === String(nested.typeBand ?? nested.type_band ?? '').toLowerCase()) ?? null,
    dominantHex: parseHex(nested.dominantHex ?? nested.dominant_hex),
    typeSeatLuma: Number(nested.typeSeatLuma ?? nested.type_seat_luma),
    subjectLuma: Number(nested.subjectLuma ?? nested.subject_luma),
    subjectBox: parseSubjectBox(nested.subjectBox ?? nested.subject_box),
    source,
    measuredAt: typeof nested.measuredAt === 'string'
      ? nested.measuredAt
      : typeof nested.measured_at === 'string' ? nested.measured_at : undefined,
  });
}

export function resolveGalleryPhotoSpatial(
  meta: SpatialMeta,
): GalleryPhotoSpatial | null {
  if (!meta) return null;
  if (meta.spatial) {
    const parsed = parseGalleryPhotoSpatial(meta.spatial);
    if (parsed) return parsed;
  }
  return parseGalleryPhotoSpatial(meta);
}

export function mergePhotoSpatial(
  pixel: GalleryPhotoSpatial | null,
  vision: GalleryPhotoSpatial | null,
): GalleryPhotoSpatial | null {
  if (!pixel && !vision) return null;
  if (!pixel) return vision;
  if (!vision) return pixel;
  const visionBox = vision.subjectBox;
  const useVisionSubject = pixel.subjectAnchor === 'center'
    && vision.subjectAnchor !== 'center';
  return normalizeSpatial({
    subjectAnchor: useVisionSubject ? vision.subjectAnchor : pixel.subjectAnchor,
    quietAnchors: pixel.quietAnchors,
    typeSeat: pixel.typeSeat,
    typeBand: pixel.typeBand,
    dominantHex: pixel.dominantHex,
    typeSeatLuma: pixel.typeSeatLuma,
    subjectLuma: pixel.subjectLuma,
    subjectBox: visionBox ?? pixel.subjectBox,
    source: 'merged',
    measuredAt: pixel.measuredAt ?? vision.measuredAt,
  });
}

function cellBusyness(
  gray: Buffer,
  rasterW: number,
  rasterH: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { busyness: number; luma: number } {
  let grad = 0;
  let luma = 0;
  let n = 0;
  const right = Math.min(rasterW, x1);
  const bottom = Math.min(rasterH, y1);
  for (let y = y0; y < bottom; y += 1) {
    for (let x = x0; x < right; x += 1) {
      const i = y * rasterW + x;
      const v = gray[i]!;
      luma += v;
      const rightV = x + 1 < right ? gray[i + 1]! : v;
      const downV = y + 1 < bottom ? gray[i + rasterW]! : v;
      grad += Math.abs(v - rightV) + Math.abs(v - downV);
      n += 1;
    }
  }
  return {
    busyness: n > 0 ? grad / n : Number.POSITIVE_INFINITY,
    luma: n > 0 ? luma / n : 128,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * 3×3 gradient + luma map. Busy cells are the subject; calm cells are type seats.
 */
export async function measurePhotoSpatial(
  buffer: Buffer,
): Promise<GalleryPhotoSpatial | null> {
  if (!buffer || buffer.length < 80) return null;
  try {
    const RASTER_W = 90;
    const meta = await sharp(buffer).metadata();
    const frameW = meta.width ?? RASTER_W;
    const frameH = meta.height ?? RASTER_W;
    const rasterH = Math.max(9, Math.round((RASTER_W * frameH) / frameW));
    const gray = await sharp(buffer)
      .removeAlpha()
      .grayscale()
      .resize(RASTER_W, rasterH, { fit: 'fill' })
      .raw()
      .toBuffer();
    const rgb = await sharp(buffer)
      .removeAlpha()
      .resize(RASTER_W, rasterH, { fit: 'fill' })
      .raw()
      .toBuffer();

    const cols = 3;
    const rows = 3;
    const cellW = RASTER_W / cols;
    const cellH = rasterH / rows;
    const anchors = GALLERY_SPATIAL_ANCHORS;
    const scored = anchors.map((anchor, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x0 = Math.floor(col * cellW);
      const y0 = Math.floor(row * cellH);
      const x1 = Math.floor((col + 1) * cellW);
      const y1 = Math.floor((row + 1) * cellH);
      const { busyness, luma } = cellBusyness(gray, RASTER_W, rasterH, x0, y0, x1, y1);
      return {
        anchor,
        busyness,
        luma,
        box: {
          x: col / cols,
          y: row / rows,
          w: 1 / cols,
          h: 1 / rows,
        },
      };
    });

    const finite = scored.filter((s) => Number.isFinite(s.busyness));
    if (finite.length === 0) return null;
    const byBusy = [...finite].sort((a, b) => b.busyness - a.busyness);
    const subject = byBusy[0]!;
    const median = [...finite]
      .map((s) => s.busyness)
      .sort((a, b) => a - b)[Math.floor(finite.length / 2)] ?? subject.busyness;
    const quiet = finite
      .filter((s) => s.anchor !== subject.anchor && s.busyness <= median * 0.92)
      .sort((a, b) => a.busyness - b.busyness)
      .map((s) => s.anchor);
    const quietOrCalmest = quiet.length > 0
      ? quiet
      : finite
        .filter((s) => s.anchor !== subject.anchor)
        .sort((a, b) => a.busyness - b.busyness)
        .slice(0, 3)
        .map((s) => s.anchor);

    let r = 0;
    let g = 0;
    let b = 0;
    const pix = rgb.length / 3;
    for (let i = 0; i < rgb.length; i += 3) {
      r += rgb[i]!;
      g += rgb[i + 1]!;
      b += rgb[i + 2]!;
    }

    const typeSeat = pickTypeSeat(subject.anchor, quietOrCalmest);
    const typeCell = scored.find((s) => s.anchor === typeSeat);
    return normalizeSpatial({
      subjectAnchor: subject.anchor,
      quietAnchors: quietOrCalmest,
      typeSeat,
      dominantHex: pix > 0 ? rgbToHex(r / pix, g / pix, b / pix) : '#808080',
      typeSeatLuma: typeCell?.luma ?? 160,
      subjectLuma: subject.luma,
      subjectBox: subject.box,
      source: 'pixel',
      measuredAt: new Date().toISOString(),
    });
  } catch {
    return null;
  }
}

/** Compact lock — lives in HARD CONTRACTS so finalizeFalPrompt cannot drop it. */
export function buildPhotoSpatialPromptLock(spatial: GalleryPhotoSpatial): string {
  const ink = spatial.typeSeatLuma < 110
    ? 'light/white ink'
    : spatial.typeSeatLuma > 165
      ? 'dark ink'
      : 'high-contrast ink (soft scrim if needed)';
  const quiet = spatial.quietAnchors
    .filter((a) => a !== spatial.subjectAnchor)
    .slice(0, 3)
    .map((a) => ANCHOR_LABEL[a])
    .join(', ');
  const box = spatial.subjectBox
    ? ` Subject box ~${Math.round(spatial.subjectBox.x * 100)}%,${Math.round(spatial.subjectBox.y * 100)}% ${Math.round(spatial.subjectBox.w * 100)}×${Math.round(spatial.subjectBox.h * 100)}%.`
    : '';
  return (
    `PHOTO SPATIAL (MANDATORY): Subject sits ${ANCHOR_LABEL[spatial.subjectAnchor]} — never cover it with headline, subtitle, logo, or opaque paint.`
    + ` Type seat is ${ANCHOR_LABEL[spatial.typeSeat]} (${spatial.typeBand} band, luma ${spatial.typeSeatLuma} — use ${ink}).`
    + (quiet ? ` Quiet cells: ${quiet}.` : '')
    + ` Photo dominant ${spatial.dominantHex} — do not paint a competing cream plate over the subject.`
    + box
    + ' This measured map overrides generic type-zone guesses; keep craft geometry but put ALL type in the type seat.'
  );
}

export async function resolvePhotoSpatialForDesign(input: {
  spatial?: GalleryPhotoSpatial | null;
  meta?: SpatialMeta;
  photoUrl?: string | null;
}): Promise<GalleryPhotoSpatial | null> {
  const ready = input.spatial ?? resolveGalleryPhotoSpatial(input.meta ?? null);
  if (ready) return ready;
  const url = String(input.photoUrl ?? '').trim();
  if (!url) return null;
  try {
    const { fetchReviewableFrameBuffer } = await import('@/lib/external-image-fetch');
    const buf = await fetchReviewableFrameBuffer(url);
    if (!buf) return null;
    return measurePhotoSpatial(buf);
  } catch {
    return null;
  }
}
