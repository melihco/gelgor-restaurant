/**
 * Dynamic text measurement & copy fitting for Premium Editorial Campaign.
 * Deterministic — no blind send of raw copy into the image model.
 */

import {
  COPY_LIMITS,
  type LayoutSpecification,
  type TextLayoutInput,
  type TextLayoutResult,
} from './types';

function splitWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/** Greedy line break — never splits a word; avoids single-word orphans when possible. */
export function breakLines(
  text: string,
  maxCharsPerLine: number,
  maxLines: number,
): { lines: string[]; overflow: boolean } {
  const words = splitWords(text);
  if (!words.length) return { lines: [], overflow: false };

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxCharsPerLine) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length >= maxLines) {
      return { lines: lines.slice(0, maxLines), overflow: true };
    }
  }
  if (current) lines.push(current);

  // Collapse orphan last line of 1 word into previous when possible
  if (lines.length >= 2) {
    const last = lines[lines.length - 1]!;
    const prev = lines[lines.length - 2]!;
    if (splitWords(last).length === 1 && (prev + ' ' + last).length <= maxCharsPerLine + 4) {
      lines[lines.length - 2] = `${prev} ${last}`;
      lines.pop();
    }
  }

  return {
    lines: lines.slice(0, maxLines),
    overflow: lines.length > maxLines || words.join(' ').length > maxCharsPerLine * maxLines,
  };
}

function zoneCharCapacity(zoneWidth: number, fontSize: number, canvasWidth: number): number {
  const pxWidth = zoneWidth * canvasWidth;
  // ~0.55em average glyph width for mixed TR/EN display type
  return Math.max(8, Math.floor(pxWidth / (fontSize * 0.55)));
}

export function buildDefaultTextLayoutInput(opts: {
  headline?: string | null;
  subheadline?: string | null;
  cta?: string | null;
  language?: string | null;
}): TextLayoutInput {
  return {
    headline: (opts.headline ?? '').trim(),
    subheadline: (opts.subheadline ?? '').trim(),
    cta: (opts.cta ?? '').trim(),
    language: opts.language ?? 'tr',
    fontFamily: 'Editorial Display',
    fontWeight: 600,
    minFontSize: 28,
    maxFontSize: 72,
    maxHeadlineLines: 3,
    maxSubheadlineLines: 3,
    letterSpacing: 0.02,
    lineHeight: 1.15,
    alignment: 'left',
  };
}

export function validateAndFitText(opts: {
  text: TextLayoutInput;
  layout: LayoutSpecification;
}): TextLayoutResult {
  const warnings: string[] = [];
  const { text, layout } = opts;

  if (text.headline.length > COPY_LIMITS.headlineIdeal) {
    warnings.push(`Headline exceeds ideal ${COPY_LIMITS.headlineIdeal} characters — layout adjusted.`);
  }
  if (text.subheadline.length > COPY_LIMITS.subheadlineIdeal) {
    warnings.push(`Subheadline exceeds ideal ${COPY_LIMITS.subheadlineIdeal} characters — layout adjusted.`);
  }
  if (text.cta.length > COPY_LIMITS.ctaIdeal) {
    warnings.push(`CTA exceeds ideal ${COPY_LIMITS.ctaIdeal} characters.`);
  }

  let headlineFont = text.maxFontSize;
  let subFont = Math.round(text.maxFontSize * 0.42);
  let ctaFont = Math.round(text.maxFontSize * 0.32);

  const fitAtSize = (fontSize: number) => {
    const maxChars = zoneCharCapacity(layout.headlineZone.width, fontSize, layout.canvas.width);
    return breakLines(text.headline, maxChars, text.maxHeadlineLines);
  };

  let headlineBreak = fitAtSize(headlineFont);
  while (headlineBreak.overflow && headlineFont > text.minFontSize) {
    headlineFont -= 4;
    headlineBreak = fitAtSize(headlineFont);
  }
  if (headlineBreak.overflow) {
    warnings.push('Headline may still be tight after minimum font size — prefer shorter copy.');
  }

  const subMaxChars = zoneCharCapacity(layout.bodyZone.width, subFont, layout.canvas.width);
  let subBreak = breakLines(text.subheadline, subMaxChars, text.maxSubheadlineLines);
  while (subBreak.overflow && subFont > 18) {
    subFont -= 2;
    const cap = zoneCharCapacity(layout.bodyZone.width, subFont, layout.canvas.width);
    subBreak = breakLines(text.subheadline, cap, text.maxSubheadlineLines);
  }

  const ctaMaxChars = zoneCharCapacity(layout.ctaZone.width, ctaFont, layout.canvas.width);
  const ctaBreak = breakLines(text.cta, ctaMaxChars, 1);

  return {
    input: text,
    fittedHeadline: headlineBreak.lines.join('\n'),
    fittedSubheadline: subBreak.lines.join('\n'),
    fittedCta: ctaBreak.lines.join(' ') || text.cta,
    headlineLines: headlineBreak.lines,
    subheadlineLines: subBreak.lines,
    headlineFontSize: headlineFont,
    subheadlineFontSize: subFont,
    ctaFontSize: ctaFont,
    warnings,
    selectedLayoutFamily: layout.family,
  };
}
