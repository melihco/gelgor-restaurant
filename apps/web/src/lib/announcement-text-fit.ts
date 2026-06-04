/**
 * Text fitting for announcement SVG overlays — auto-scale, wrap, stay in bounds.
 */

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface FitTextResult {
  fontSize: number;
  letterSpacing: number;
  lines: string[];
  lineHeight: number;
  blockHeight: number;
}

/** Horizontal inset for center-anchored SVG text (avoids first/last glyph clipping). */
export const FIT_WIDTH_SAFETY = 0.9;

/** Approximate rendered width (uppercase display / serif headlines). */
export function estimateTextWidth(
  text: string,
  fontSize: number,
  letterSpacing: number,
): number {
  if (!text) return 0;
  const upper = text === text.toUpperCase() && /[A-ZİĞÜŞÖÇ]/.test(text);
  const charWidth = fontSize * (upper ? 0.64 : 0.56);
  return text.length * charWidth + Math.max(0, text.length - 1) * letterSpacing;
}

/** Word-wrap into lines that fit maxWidth at the given size. */
function wrapWordsToLines(
  text: string,
  maxLines: number,
  maxWidth: number,
  fontSize: number,
  letterSpacing: number,
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [trimmed];

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (estimateTextWidth(test, fontSize, letterSpacing) <= maxWidth) {
      current = test;
      continue;
    }
    if (current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    } else {
      lines.push(word);
      current = '';
      if (lines.length >= maxLines) break;
    }
  }

  if (current && lines.length < maxLines) lines.push(current);

  if (lines.length === 0) return [trimmed];
  if (lines.length === 1 && estimateTextWidth(lines[0]!, fontSize, letterSpacing) > maxWidth) {
    return splitBalancedLines(trimmed, maxLines);
  }
  return lines.slice(0, maxLines);
}

function splitBalancedLines(text: string, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && maxLines >= 2) {
    const mid = Math.ceil(words.length / 2);
    const out = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
    return out.slice(0, maxLines);
  }
  if (text.length <= 1 || maxLines < 2) return [text];
  const mid = Math.ceil(text.length / 2);
  return [text.slice(0, mid).trim(), text.slice(mid).trim()].filter(Boolean).slice(0, maxLines);
}

export function fitTextToWidth(
  text: string,
  maxWidth: number,
  baseFontSize: number,
  trackingRatio: number,
  minFontSizeRatio = 0.52,
  maxLines = 2,
): FitTextResult {
  const safeWidth = Math.round(maxWidth * FIT_WIDTH_SAFETY);
  const minFontSize = Math.max(12, Math.round(baseFontSize * minFontSizeRatio));
  let fontSize = baseFontSize;

  const tryLines = (lines: string[], size: number): FitTextResult | null => {
    const letterSpacing = Math.round(size * trackingRatio);
    const lineHeight = Math.round(size * 1.15);
    const widest = Math.max(...lines.map((l) => estimateTextWidth(l, size, letterSpacing)), 0);
    if (widest <= safeWidth) {
      return {
        fontSize: size,
        letterSpacing,
        lines,
        lineHeight,
        blockHeight: lines.length * lineHeight,
      };
    }
    return null;
  };

  while (fontSize >= minFontSize) {
    const single = tryLines([text], fontSize);
    if (single) return single;
    fontSize = Math.round(fontSize * 0.94);
  }

  fontSize = baseFontSize;
  while (fontSize >= minFontSize) {
    const wrapped = wrapWordsToLines(text, maxLines, safeWidth, fontSize, Math.round(fontSize * trackingRatio));
    const multi = tryLines(wrapped, fontSize);
    if (multi) return multi;
    fontSize = Math.round(fontSize * 0.94);
  }

  const letterSpacing = Math.max(0, Math.round(minFontSize * trackingRatio * 0.5));
  const lineHeight = Math.round(minFontSize * 1.12);
  const lines = wrapWordsToLines(text, maxLines, safeWidth, minFontSize, letterSpacing);
  return {
    fontSize: minFontSize,
    letterSpacing,
    lines,
    lineHeight,
    blockHeight: lines.length * lineHeight,
  };
}

export interface SvgTextBlockOptions {
  x: number;
  y: number;
  fontFamily: string;
  fontWeight: string | number;
  fill: string;
  textAnchor: string;
  opacity?: number;
  fontStyle?: string;
  fit: FitTextResult;
  stroke?: string;
  strokeWidth?: number;
  paintOrder?: string;
  filter?: string;
}

export function buildSvgTextBlock(opts: SvgTextBlockOptions): string {
  const { fit } = opts;
  if (fit.lines.length === 0 || !fit.lines[0]) return '';

  const opacity = opts.opacity ?? 1;
  const style = opts.fontStyle ? ` font-style="${opts.fontStyle}"` : '';
  const stroke = opts.stroke ? ` stroke="${opts.stroke}" stroke-width="${opts.strokeWidth ?? 1}"` : '';
  const paintOrder = opts.paintOrder ? ` paint-order="${opts.paintOrder}"` : '';
  const filter = opts.filter ? ` filter="url(#${opts.filter})"` : '';
  const firstY = fit.lines.length === 1
    ? opts.y
    : opts.y - Math.round((fit.blockHeight - fit.lineHeight) / 2);

  const tspans = fit.lines.map((line, i) => {
    const dy = i === 0 ? 0 : fit.lineHeight;
    return `<tspan x="${opts.x}" dy="${i === 0 ? 0 : dy}">${escapeXml(line)}</tspan>`;
  }).join('');

  return `<text x="${opts.x}" y="${firstY}" font-family="${opts.fontFamily}" font-size="${fit.fontSize}" font-weight="${opts.fontWeight}" letter-spacing="${fit.letterSpacing}" fill="${opts.fill}" text-anchor="${opts.textAnchor}" dominant-baseline="middle" opacity="${opacity}"${style}${stroke}${paintOrder}${filter}>${tspans}</text>`;
}

export interface ContentBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  maxWidth: number;
  anchorX: number;
  textAnchor: 'start' | 'middle' | 'end';
}

export function resolveContentBounds(
  width: number,
  height: number,
  padX: number,
  align: 'center' | 'start' | 'end',
  frosted?: { top: number; height: number; padX: number; innerPad: number },
): ContentBounds {
  if (frosted) {
    const left = frosted.padX + frosted.innerPad;
    const right = width - frosted.padX - frosted.innerPad;
    return {
      left,
      right,
      top: frosted.top + frosted.innerPad,
      bottom: frosted.top + frosted.height - frosted.innerPad,
      maxWidth: right - left,
      anchorX: align === 'start' ? left : align === 'end' ? right : width / 2,
      textAnchor: align === 'start' ? 'start' : align === 'end' ? 'end' : 'middle',
    };
  }

  const margin = padX;
  const left = margin;
  const right = width - margin;
  return {
    left,
    right,
    top: Math.round(height * 0.08),
    bottom: height - Math.round(height * 0.05),
    maxWidth: right - left,
    anchorX: align === 'start' ? left + 8 : align === 'end' ? right - 8 : width / 2,
    textAnchor: align === 'start' ? 'start' : align === 'end' ? 'end' : 'middle',
  };
}
