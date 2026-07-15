/**
 * Shared Satori font loader.
 *
 * Centralises the font-loading logic previously inline in `api/canvas/export`
 * so both the canvas exporter and the local typography renderer draw from one
 * cache and one Turkish-safe fetch path.
 *
 * Turkish glyph guarantee (ğ ş ı İ ç ö ü Ç Ö Ü):
 *   Google Fonts' css2 API serves unicode-range-split WOFF2 by default, whose
 *   FIRST @font-face block is the `latin` subset — missing latin-ext glyphs.
 *   Requesting with a legacy (IE) User-Agent makes Google return a single
 *   complete TTF with the full glyph set, so Turkish diacritics always render.
 *   `&subset=latin-ext` is appended as belt-and-braces.
 */

import type { Font } from 'satori';
import { readFile } from 'fs/promises';
import path from 'path';
import type { TypographyVibe } from '@/types/brand-theme';

export type FontWeight = 400 | 500 | 600 | 700 | 800;

/** name+weight keyed cache — one entry per rendered weight variant. */
const _fontCache = new Map<string, ArrayBuffer | null>();

/**
 * Families we serve from Google Fonts. Value = css2 family token (spaces → `+`).
 * Weight is appended per-request; families without the requested weight fall
 * back to their default face automatically (see fetchFontFromGoogle).
 */
const GOOGLE_FONT_FAMILIES: Record<string, string> = {
  'Inter': 'Inter',
  'Playfair Display': 'Playfair+Display',
  'Montserrat': 'Montserrat',
  'Lora': 'Lora',
  'Raleway': 'Raleway',
  'Nunito': 'Nunito',
  'Josefin Sans': 'Josefin+Sans',
  'Cormorant Garamond': 'Cormorant+Garamond',
  'DM Sans': 'DM+Sans',
  'DM Serif Display': 'DM+Serif+Display',
  'Libre Baskerville': 'Libre+Baskerville',
  'Poppins': 'Poppins',
  'Source Serif 4': 'Source+Serif+4',
  'Fraunces': 'Fraunces',
  'Space Grotesk': 'Space+Grotesk',
  'Syne': 'Syne',
  'Great Vibes': 'Great+Vibes',
  'Allura': 'Allura',
  'Anton': 'Anton',
  'Bebas Neue': 'Bebas+Neue',
  'Bangers': 'Bangers',
};

/** Single-weight display faces — never append a `wght` axis (css2 returns 400). */
const SINGLE_WEIGHT_FAMILIES = new Set<string>([
  'DM Serif Display',
  'Great Vibes',
  'Allura',
  'Anton',
  'Bebas Neue',
  'Bangers',
]);

/**
 * Legacy UA forces Google to return a single full-glyph TTF (incl. latin-ext /
 * Turkish) without unicode-range subset splitting. Safari 5 gets a plain
 * fonts.gstatic.com/s/… TTF; newer IE-style UAs now get obfuscated `/l/font?kit=`
 * binaries that Satori rejects ("Unsupported OpenType signature").
 */
const LEGACY_UA =
  'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1';

async function fetchFontFromGoogle(
  name: string,
  weight: FontWeight,
): Promise<ArrayBuffer | null> {
  const family = GOOGLE_FONT_FAMILIES[name];
  if (!family) return null;

  const withWeight = SINGLE_WEIGHT_FAMILIES.has(name) ? family : `${family}:wght@${weight}`;
  const attempts = [withWeight, family];

  for (const fam of attempts) {
    try {
      const cssUrl = `https://fonts.googleapis.com/css2?family=${fam}&subset=latin-ext&display=swap`;
      const cssRes = await fetch(cssUrl, {
        headers: { 'User-Agent': LEGACY_UA },
        signal: AbortSignal.timeout(10_000),
      });
      if (!cssRes.ok) continue;
      const css = await cssRes.text();
      const ttf = css.match(/src:\s*url\(([^)]+\.ttf)\)/);
      const woff2 = css.match(/url\(([^)]+)\)\s+format\(['"]woff2['"]\)/);
      // Legacy-UA responses now serve extension-less `/l/font?kit=…` URLs (still
      // full-glyph TTF binaries) — accept any src url as the final fallback.
      const anySrc = css.match(/src:\s*url\(([^)]+)\)/);
      const fontUrl = ttf?.[1] ?? woff2?.[1] ?? anySrc?.[1];
      if (!fontUrl) continue;
      const fontRes = await fetch(fontUrl, { signal: AbortSignal.timeout(15_000) });
      if (!fontRes.ok) continue;
      return await fontRes.arrayBuffer();
    } catch {
      // try next attempt
    }
  }
  return null;
}

/**
 * Load a single font weight as raw bytes.
 * Order: /public/fonts local file → Google Fonts CDN. Result cached by name+weight.
 */
export async function loadSatoriFont(
  name: string,
  weight: FontWeight = 400,
): Promise<ArrayBuffer | null> {
  const cacheKey = `${name}:${weight}`;
  if (_fontCache.has(cacheKey)) return _fontCache.get(cacheKey)!;

  const fontsDir = path.join(process.cwd(), 'public', 'fonts');
  const base = name.replace(/ /g, '');
  const spaced = name.replace(/ /g, '-');
  const weightTag =
    weight >= 800 ? 'ExtraBold'
      : weight >= 700 ? 'Bold'
        : weight >= 600 ? 'SemiBold'
          : weight >= 500 ? 'Medium'
            : 'Regular';
  const candidates = [
    `${spaced}-${weightTag}.ttf`,
    `${base}-${weightTag}.ttf`,
    `${spaced}-Regular.ttf`,
    `${base}-Regular.ttf`,
  ];
  for (const candidate of candidates) {
    try {
      const nodeBuf = await readFile(path.join(fontsDir, candidate));
      const ab = nodeBuf.buffer.slice(
        nodeBuf.byteOffset,
        nodeBuf.byteOffset + nodeBuf.byteLength,
      ) as ArrayBuffer;
      _fontCache.set(cacheKey, ab);
      return ab;
    } catch {
      // not found, try next
    }
  }

  const ab = await fetchFontFromGoogle(name, weight);
  _fontCache.set(cacheKey, ab);
  return ab;
}

export interface FontSpec {
  name: string;
  weight: FontWeight;
}

/**
 * Load a set of font weights into Satori `Font[]`. Missing weights are skipped;
 * an Inter 400 fallback is appended so Satori always has at least one usable
 * face (prevents a hard render throw on transient CDN failure).
 */
export async function loadSatoriFontSet(specs: FontSpec[]): Promise<Font[]> {
  const fonts: Font[] = [];
  const seen = new Set<string>();
  for (const spec of specs) {
    const key = `${spec.name}:${spec.weight}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const data = await loadSatoriFont(spec.name, spec.weight);
    if (data) {
      fonts.push({
        name: spec.name,
        data,
        weight: spec.weight as Font['weight'],
        style: 'normal',
      });
    }
  }

  if (fonts.length === 0) {
    const inter = await loadSatoriFont('Inter', 400);
    if (inter) fonts.push({ name: 'Inter', data: inter, weight: 400, style: 'normal' });
  }
  return fonts;
}

export interface VibeFontPair {
  /** Display / headline face. */
  heading: string;
  /** Body / supporting face. */
  body: string;
}

/** Typography vibe → Google Fonts family pair (all present in SAFE_FONTS). */
const VIBE_FONTS: Record<TypographyVibe, VibeFontPair> = {
  editorial_serif: { heading: 'Playfair Display', body: 'Lora' },
  warm_coastal: { heading: 'Fraunces', body: 'Montserrat' },
  minimal_modern: { heading: 'Space Grotesk', body: 'Inter' },
  retro_poster: { heading: 'DM Serif Display', body: 'DM Sans' },
  street_bold: { heading: 'Anton', body: 'Montserrat' },
  handwritten: { heading: 'Cormorant Garamond', body: 'DM Sans' },
  neon_glow: { heading: 'Space Grotesk', body: 'Inter' },
  bubble_3d: { heading: 'Poppins', body: 'Poppins' },
  chrome_gradient: { heading: 'Montserrat', body: 'Montserrat' },
};

/** Resolve the heading/body font pair for a typography vibe. */
export function fontsForVibe(vibe: TypographyVibe | null | undefined): VibeFontPair {
  return (vibe && VIBE_FONTS[vibe]) || VIBE_FONTS.minimal_modern;
}
