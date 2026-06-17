import type { CSSProperties } from 'react';

/**
 * Marka kurumsal renkleri → hero başlık gradient (harfler üzerinde).
 * Poster SVG overlay + Remotion HeadlineStack ortak kaynak.
 *
 * Accent-led sheen: koyu arka planda primary→accent geçişi sol harfleri
 * görünmez yapıyordu; gradyan yalnızca accent tonları arasında parlar.
 */

export const BRAND_HERO_GRADIENT_ID = 'brandHeroGrad';
export const BRAND_HERO_GRADIENT_FILL = `url(#${BRAND_HERO_GRADIENT_ID})`;

function normalizeHex(hex: string, fallback: string): string {
  const trimmed = hex.trim();
  const match = trimmed.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match?.[1]) return fallback;
  let h = match[1].toLowerCase();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h}`;
}

function lightenHex(hex: string, amount: number, fallback: string): string {
  const safe = normalizeHex(hex, fallback);
  const h = safe.slice(1);
  const mix = (c: number) => Math.min(255, Math.round(c + (255 - c) * amount));
  const r = mix(parseInt(h.slice(0, 2), 16));
  const g = mix(parseInt(h.slice(2, 4), 16));
  const b = mix(parseInt(h.slice(4, 6), 16));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** Accent tabanlı okunabilir sheen — primary koyu olsa bile sol harfler kaybolmaz */
export function resolveBrandHeadlineGradient(
  _primary?: string | null,
  accent?: string | null,
): { from: string; mid: string; to: string } {
  const base = normalizeHex(accent ?? '', '#c9a96e');
  const mid = lightenHex(base, 0.38, '#f0d4a8');
  const to = lightenHex(base, 0.12, base);
  return { from: base, mid, to };
}

/** Remotion / React — background-clip text gradient (inline-block metin kutusuna uygulanmalı) */
export function brandHeadlineGradientStyle(
  primary?: string | null,
  accent?: string | null,
): CSSProperties {
  const { from, mid, to } = resolveBrandHeadlineGradient(primary, accent);
  return {
    backgroundImage: `linear-gradient(90deg, ${from} 0%, ${mid} 48%, ${to} 100%)`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
    WebkitTextFillColor: 'transparent',
  };
}

/** SVG linearGradient — userSpaceOnUse, gerçek metin genişliğinde */
export function buildBrandHeroGradientSvgDef(
  primary: string,
  accent: string,
  x1: number,
  x2: number,
  id = BRAND_HERO_GRADIENT_ID,
): string {
  const { from, mid, to } = resolveBrandHeadlineGradient(primary, accent);
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${Math.round(x1)}" y1="0" x2="${Math.round(x2)}" y2="0">
    <stop offset="0%" stop-color="${from}"/>
    <stop offset="48%" stop-color="${mid}"/>
    <stop offset="100%" stop-color="${to}"/>
  </linearGradient>`;
}

export function heroGradientXRange(
  anchorX: number,
  spanWidth: number,
  textAnchor: 'start' | 'middle' | 'end',
): { x1: number; x2: number } {
  const w = Math.max(spanWidth, 1);
  if (textAnchor === 'middle') {
    const half = w / 2;
    return { x1: anchorX - half, x2: anchorX + half };
  }
  if (textAnchor === 'end') {
    return { x1: anchorX - w, x2: anchorX };
  }
  return { x1: anchorX, x2: anchorX + w };
}
