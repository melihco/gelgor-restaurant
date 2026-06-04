/**
 * SVG font loader for server-side rasterisation (resvg-js / Sharp).
 *
 * The announcement design engine emits SVG referencing modern fonts (Playfair
 * Display, Inter, Montserrat, …). librsvg (used by Sharp) only sees SYSTEM
 * fonts, so those elegant typefaces silently fall back to a generic serif/sans
 * — the #1 reason cards looked dated. Loading the real TTFs and rendering via
 * resvg-js fixes typography for all 200 templates at once.
 *
 * Fonts are fetched from Google Fonts (TTF) and cached in-process. A local
 * /public/fonts/<Name>-Regular.ttf is used first when present (offline-safe).
 */

import { readFile, mkdir, writeFile, access } from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// Google Fonts CSS family specs — request the weights the engine actually uses.
// Extended list lives in premium-font-registry.ts (single source of truth).
import { GOOGLE_FONT_SPECS } from './premium-font-registry';

const GOOGLE_FONTS_FAMILIES: Record<string, string> = {
  ...GOOGLE_FONT_SPECS,
  // Legacy aliases kept for poster engine stacks
  'Black Han Sans': 'Black+Han+Sans:wght@400',
};

// Cache by family name → list of on-disk TTF file paths (resvg needs paths).
const _pathCache = new Map<string, string[]>();
const _fontDir = path.join(os.tmpdir(), 'smart-agency-fonts');

// UA without woff2 support → Google serves TTF (resvg/satori need TTF, not woff2).
const TTF_UA =
  'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)';

async function fetchFamilyTtfs(name: string): Promise<Buffer[]> {
  const family = GOOGLE_FONTS_FAMILIES[name];
  if (!family) return [];
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
    const cssRes = await fetch(cssUrl, {
      headers: { 'User-Agent': TTF_UA },
      signal: AbortSignal.timeout(10_000),
    });
    if (!cssRes.ok) return [];
    const css = await cssRes.text();
    // Google Fonts may return obfuscated URLs without .ttf extension.
    // Match any https://fonts.gstatic.com/... URL from the CSS.
    const urls = Array.from(
      css.matchAll(/url\(['"]?(https:\/\/fonts\.gstatic\.com\/[^'")\s]+)['"]?\)/g)
    ).map((m) => m[1]!);
    const unique = Array.from(new Set(urls)).slice(0, 6);
    const results = await Promise.all(
      unique.map(async (u) => {
        try {
          const r = await fetch(u, { signal: AbortSignal.timeout(15_000) });
          if (!r.ok) return null;
          return Buffer.from(await r.arrayBuffer());
        } catch {
          return null;
        }
      }),
    );
    const buffers: Buffer[] = [];
    for (const b of results) if (b) buffers.push(b);
    return buffers;
  } catch {
    return [];
  }
}

async function localTtfPaths(name: string): Promise<string[]> {
  const fontsDir = path.join(process.cwd(), 'public', 'fonts');
  const candidates = [
    `${name.replace(/ /g, '-')}-Regular.ttf`,
    `${name.replace(/ /g, '')}-Regular.ttf`,
    `${name.replace(/ /g, '_')}-Regular.ttf`,
  ];
  const found: string[] = [];
  for (const c of candidates) {
    const p = path.join(fontsDir, c);
    try {
      await access(p);
      found.push(p);
    } catch {
      /* next */
    }
  }
  return found;
}

async function writeBuffersToDisk(name: string, buffers: Buffer[]): Promise<string[]> {
  await mkdir(_fontDir, { recursive: true }).catch(() => {});
  const slug = name.replace(/[^a-z0-9]+/gi, '_');
  const paths: string[] = [];
  for (const buf of buffers) {
    const hash = crypto.createHash('md5').update(buf).digest('hex').slice(0, 8);
    const file = path.join(_fontDir, `${slug}-${hash}.ttf`);
    try {
      await access(file);
    } catch {
      await writeFile(file, buf).catch(() => {});
    }
    paths.push(file);
  }
  return paths;
}

/** Resolve on-disk TTF paths for a family (local first, then Google→tmp, cached). */
export async function loadFontFamily(name: string): Promise<string[]> {
  if (_pathCache.has(name)) return _pathCache.get(name)!;
  const local = await localTtfPaths(name);
  if (local.length) {
    _pathCache.set(name, local);
    return local;
  }
  const buffers = await fetchFamilyTtfs(name);
  const paths = buffers.length ? await writeBuffersToDisk(name, buffers) : [];
  if (paths.length) _pathCache.set(name, paths);
  return paths;
}

/**
 * Resolve on-disk TTF file paths for the given families (deduped), suitable for
 * resvg-js `font.fontFiles`. Safe: returns whatever it could load; never throws.
 */
export async function loadFontFiles(names: string[]): Promise<string[]> {
  const wanted = Array.from(new Set(names.filter(Boolean)));
  const groups = await Promise.all(wanted.map((n) => loadFontFamily(n)));
  return groups.flat();
}

/** Extract the first real font family from a CSS font-family stack. */
export function primaryFamily(stack: string | undefined | null): string {
  if (!stack) return '';
  const first = stack.split(',')[0]?.trim() ?? '';
  return first.replace(/^['"]|['"]$/g, '').trim();
}

/** Family names the design engine knows how to fetch (for validation/UI). */
export function knownFontFamilies(): string[] {
  return Object.keys(GOOGLE_FONTS_FAMILIES);
}
