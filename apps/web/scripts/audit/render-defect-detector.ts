/**
 * AUDIT INSTRUMENT — not a production quality gate. Read the limitation below
 * before wiring this into a publish path.
 *
 * Deterministic check for a headline that runs off the canvas.
 *
 * The vision reviewer is an opinion, and a poor one: it scored a Karaman frame
 * whose headline was sliced by the left edge 9/10, and a clean frame 7/10. This
 * defect needs no opinion. Overlay type is painted in a near-neutral, extreme
 * tone (cream, white, near-black) with hard edges, so type touching the border
 * is measurable — and unlike a score, a measurement can be enforced.
 *
 * The check is pure pixel work: no model, no API key, no quota. It therefore runs
 * on every frame rather than the 14% a vision call managed to cover.
 *
 * Known limitation — why this is not yet a gate. Tone and local contrast cannot
 * separate cream type from bright neutral photography. Pale sand, whitewashed
 * walls, cream linen and bleached wood all sit in the same tonal band as overlay
 * type and step into shade just as sharply, so each produced border contact on
 * frames verified clean by eye. Decorative frame rules and letterbox bars are
 * filtered out below, but that last confusion needs a glyph-shape model rather
 * than another threshold. Blocking on this as it stands would withhold good work.
 *
 * Scope note: the "empty plate" defect is deliberately not detected here. The
 * real artefact is a thin outlined rectangle enclosing nothing, not a flat
 * placeholder block, and a flatness test for it flagged legitimate brand colour
 * bands. That defect is addressed at the prompt level instead (c988a6f).
 */
import sharp from 'sharp';

/** Frames are normalised to this width so the thresholds below stay meaningful. */
const CANVAS_WIDTH = 1080;
/** Distance from the border treated as touching it. */
const EDGE_BAND_PX = 4;

/**
 * Where a glyph is cut, the border pixels are its *interior* — a flat fill,
 * because the stroke's own edges lie off-canvas. A high-pass filter therefore
 * reads a sliced headline as featureless, which is why the first version of this
 * check missed real defects and fired on sharp photographic texture instead.
 *
 * What actually marks the cut is contrast a short way inward: type sits on a
 * background it must be legible against, so stepping off the stroke crosses a
 * large tonal gap. A pale wood table filling the same border has no such gap.
 */
const INWARD_PROBES_PX = [12, 24, 36] as const;
const MIN_INWARD_CONTRAST = 60;
/**
 * Contact thresholds, chosen from the segment structure of 63 audited frames
 * rather than guessed. Two numbers do the work:
 *
 * - `runPx` is the longest single stretch of painted-type contact along a border.
 * - `dominance` is that stretch divided by all contact on the same border.
 *
 * Verified sliced headlines: Karaman `00` (89px, 0.34), Karaman `03` (48px, 0.39),
 * Gel Gör `07` (20px, 0.18), Gel Gör `05` (28px, 0.26).
 * Verified clean frames that still register contact: a pale wood table filling the
 * bottom border (177px, 0.89 — one unbroken stretch, which type never produces)
 * and a decorative frame rule with JPEG speckle (30px, 0.16).
 *
 * So a stretch alone cannot decide, and neither can the spread. Blocking requires
 * both a stretch no glyph-free texture produced and a spread no solid band
 * produced; everything above the reporting floor is recorded but ships.
 */
const REPORT_RUN_PX = 20;
const BLOCK_RUN_PX = 45;
const BLOCK_MAX_DOMINANCE = 0.6;

/**
 * Two design patterns look exactly like type at a border and are not defects.
 *
 * A decorative rule framing the canvas runs the whole way round: a Karaman gift
 * bundle post registered 973px of contact down a 1350px border — 72% of it — on
 * all four sides at once. A letterbox bar does the same on the sides it fills.
 * A sliced headline covers a fraction of one border: the verified defects sat
 * between 8% and 28%, and never on more than two borders.
 */
const MAX_BORDER_COVERAGE = 0.45;
const MAX_CONTACTED_EDGES = 2;

/**
 * Painted type is near-neutral; photographic texture carries colour. Wood grain
 * and palm fronds both produced long stroke runs at the border and both are
 * strongly chromatic, so requiring neutrality is what separates a sliced
 * headline from a sharp photograph.
 */
const MAX_TEXT_CHROMA = 40;
/** Overlay type sits at an extreme tone; photo mid-tones do not qualify. */
const TEXT_BRIGHT_FLOOR = 195;
const TEXT_DARK_CEILING = 60;

export type FrameEdge = 'left' | 'right' | 'top' | 'bottom';

export interface ClippedTextDefect {
  edge: FrameEdge;
  /** Longest single stretch of contact, in pixels of the normalised canvas. */
  runPx: number;
  /** All contact along that border. */
  totalPx: number;
  /** `runPx / totalPx` — 1.0 is one unbroken band, which type never produces. */
  dominance: number;
  /**
   * `blocking` withholds the frame. `suspect` is recorded and ships: it is real
   * contact, but at a level where a decorative rule or pale texture can look the
   * same, and a gate that withholds good work is worse than no gate.
   */
  severity: 'blocking' | 'suspect';
}

export interface RenderDefectReport {
  /** False when the bytes could not be decoded — absence of proof, not of defects. */
  inspected: boolean;
  clippedText: ClippedTextDefect | null;
}

interface Frame {
  rgb: Uint8Array;
  grey: Uint8Array;
  width: number;
  height: number;
}

async function loadFrame(buffer: Buffer): Promise<Frame | null> {
  try {
    const base = sharp(buffer, { failOn: 'none' }).resize({ width: CANVAS_WIDTH });

    const [rgbRaw, greyRaw] = await Promise.all([
      base.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true }),
      base.clone().greyscale().raw().toBuffer({ resolveWithObject: true }),
    ]);

    const { width, height } = greyRaw.info;
    if (!width || !height) return null;
    if (greyRaw.info.channels !== 1 || rgbRaw.info.channels !== 3) return null;
    if (rgbRaw.info.width !== width || rgbRaw.info.height !== height) return null;

    return {
      rgb: new Uint8Array(rgbRaw.data),
      grey: new Uint8Array(greyRaw.data),
      width,
      height,
    };
  } catch {
    return null;
  }
}

/** Longest single stretch of contact, and all contact, along one border. */
function measureContact(flags: Uint8Array): { runPx: number; totalPx: number } {
  let runPx = 0;
  let totalPx = 0;
  let current = 0;
  for (let i = 0; i < flags.length; i++) {
    if (flags[i]) {
      current++;
      totalPx++;
      if (current > runPx) runPx = current;
    } else {
      current = 0;
    }
  }
  return { runPx, totalPx };
}

/** Uniform, near-black or near-white bar tones — a letterbox, not artwork. */
const BAR_TONE_SPREAD = 10;
const BAR_DARK_MEAN = 24;
const BAR_BRIGHT_MEAN = 246;
/** Never trim more than this off a side; beyond it the frame is the artwork. */
const MAX_BAR_FRACTION = 0.25;

/**
 * The rectangle the design actually occupies.
 *
 * A Scorpios post arrives letterboxed, and the black bar reads as neutral type
 * tone stepping into a bright photograph — the exact signature of a cut glyph.
 * The bar is not the canvas edge, so it is trimmed away and the design's own
 * border is measured instead.
 */
function contentBox(frame: Frame): { x0: number; y0: number; x1: number; y1: number } {
  const { grey, width, height } = frame;
  const lumAt = (x: number, y: number) => grey[y * width + x]!;

  const isBar = (samples: number[]): boolean => {
    let min = 255;
    let max = 0;
    let sum = 0;
    for (const v of samples) {
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    if (max - min > BAR_TONE_SPREAD) return false;
    const mean = sum / samples.length;
    return mean <= BAR_DARK_MEAN || mean >= BAR_BRIGHT_MEAN;
  };

  const sampleRow = (y: number) =>
    Array.from({ length: 40 }, (_, k) => lumAt(Math.floor((k * (width - 1)) / 39), y));
  const sampleCol = (x: number) =>
    Array.from({ length: 40 }, (_, k) => lumAt(x, Math.floor((k * (height - 1)) / 39)));

  const advance = (limit: number, probe: (i: number) => boolean, from: number, step: number) => {
    let moved = 0;
    let at = from;
    while (moved < limit && probe(at)) {
      at += step;
      moved++;
    }
    return at;
  };

  const vLimit = Math.floor(height * MAX_BAR_FRACTION);
  const hLimit = Math.floor(width * MAX_BAR_FRACTION);

  return {
    y0: advance(vLimit, (y) => isBar(sampleRow(y)), 0, 1),
    y1: advance(vLimit, (y) => isBar(sampleRow(y)), height - 1, -1),
    x0: advance(hLimit, (x) => isBar(sampleCol(x)), 0, 1),
    x1: advance(hLimit, (x) => isBar(sampleCol(x)), width - 1, -1),
  };
}

function findClippedText(frame: Frame): ClippedTextDefect | null {
  const { rgb, grey, width, height } = frame;
  const lumAt = (x: number, y: number) => grey[y * width + x]!;
  const { x0, y0, x1, y1 } = contentBox(frame);
  const contentW = x1 - x0 + 1;
  const contentH = y1 - y0 + 1;
  if (contentW < 80 || contentH < 80) return null;

  /** Tone and chroma of overlay type: cream, white, near-black — never a photo mid-tone. */
  const looksLikeType = (x: number, y: number): boolean => {
    const j = (y * width + x) * 3;
    const r = rgb[j]!;
    const g = rgb[j + 1]!;
    const b = rgb[j + 2]!;
    if (Math.max(r, g, b) - Math.min(r, g, b) > MAX_TEXT_CHROMA) return false;
    const lum = grey[y * width + x]!;
    return lum >= TEXT_BRIGHT_FLOOR || lum <= TEXT_DARK_CEILING;
  };

  /** A cut stroke steps off its own fill into the background it sits on. */
  const stepsOffStroke = (
    x: number, y: number, dx: number, dy: number,
  ): boolean => {
    const base = lumAt(x, y);
    for (const d of INWARD_PROBES_PX) {
      const px = x + dx * d;
      const py = y + dy * d;
      if (px < 0 || px >= width || py < 0 || py >= height) continue;
      if (Math.abs(lumAt(px, py) - base) >= MIN_INWARD_CONTRAST) return true;
    }
    return false;
  };

  const band = Math.min(EDGE_BAND_PX, Math.floor(Math.min(contentW, contentH) / 4));
  if (band < 1) return null;

  const span = (from: number, count: number) =>
    Array.from({ length: count }, (_, k) => from + k);

  /** Mark positions along a border where type meets the design's edge. */
  const scan = (
    length: number,
    at: (pos: number, depth: number) => [number, number],
    inward: [number, number],
  ): Uint8Array => {
    const out = new Uint8Array(length);
    for (let pos = 0; pos < length; pos++) {
      for (const depth of span(0, band)) {
        const [x, y] = at(pos, depth);
        if (looksLikeType(x, y) && stepsOffStroke(x, y, inward[0], inward[1])) {
          out[pos] = 1;
          break;
        }
      }
    }
    return out;
  };

  const edges: Array<[FrameEdge, Uint8Array]> = [
    ['left', scan(contentH, (i, d) => [x0 + d, y0 + i], [1, 0])],
    ['right', scan(contentH, (i, d) => [x1 - d, y0 + i], [-1, 0])],
    ['top', scan(contentW, (i, d) => [x0 + i, y0 + d], [0, 1])],
    ['bottom', scan(contentW, (i, d) => [x0 + i, y1 - d], [0, -1])],
  ];

  const measured = edges.map(([edge, flags]) => {
    const { runPx, totalPx } = measureContact(flags);
    return { edge, runPx, totalPx, coverage: totalPx / flags.length };
  });

  // A frame rule or letterbox touches every border; a headline touches one.
  const contacted = measured.filter((m) => m.runPx >= REPORT_RUN_PX).length;
  if (contacted > MAX_CONTACTED_EDGES) return null;

  let worst: ClippedTextDefect | null = null;
  for (const { edge, runPx, totalPx, coverage } of measured) {
    if (runPx < REPORT_RUN_PX) continue;
    if (coverage > MAX_BORDER_COVERAGE) continue;

    const dominance = totalPx ? runPx / totalPx : 1;
    const severity: ClippedTextDefect['severity'] =
      runPx >= BLOCK_RUN_PX && dominance <= BLOCK_MAX_DOMINANCE ? 'blocking' : 'suspect';

    const candidate: ClippedTextDefect = {
      edge,
      runPx,
      totalPx,
      dominance: Math.round(dominance * 100) / 100,
      severity,
    };

    // A blocking edge always outranks a suspect one, however long the stretch.
    const beatsWorst = !worst
      || (severity === 'blocking' && worst.severity === 'suspect')
      || (severity === worst.severity && runPx > worst.runPx);
    if (beatsWorst) worst = candidate;
  }
  return worst;
}

/**
 * Inspect a rendered frame for a headline sliced by the canvas border.
 *
 * `inspected: false` means the bytes could not be read. It must never be treated
 * as clean — reading a failed check as a pass is exactly how the previous gate
 * came to stamp 99 unreviewed frames as having valid typography.
 */
export async function detectRenderDefects(buffer: Buffer): Promise<RenderDefectReport> {
  if (!buffer || buffer.length < 100) return { inspected: false, clippedText: null };

  const frame = await loadFrame(buffer);
  if (!frame) return { inspected: false, clippedText: null };

  return { inspected: true, clippedText: findClippedText(frame) };
}

/** True when the frame carries a defect no brand would publish. */
export function hasBlockingRenderDefect(report: RenderDefectReport): boolean {
  return report.inspected && report.clippedText?.severity === 'blocking';
}

const EDGE_LABEL_TR: Record<FrameEdge, string> = {
  left: 'sol', right: 'sağ', top: 'üst', bottom: 'alt',
};

/** Short, loggable reason — used in job failure messages and artifact metadata. */
export function describeRenderDefects(report: RenderDefectReport): string {
  if (!report.inspected) return 'kare incelenemedi';
  if (!report.clippedText) return 'kusur yok';
  const { edge, runPx, severity } = report.clippedText;
  const verdict = severity === 'blocking' ? 'kesilmiş' : 'kesilmiş olabilir';
  return `metin ${EDGE_LABEL_TR[edge]} kenardan ${verdict} (${runPx}px)`;
}
