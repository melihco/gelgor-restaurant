#!/usr/bin/env npx tsx
/**
 * Faz A visual QA — same photo + copy, distinct Canva archetypes × vibes.
 * Proves brands can diverge by geometry (not only corporate colors). $0 AI.
 *
 * Usage (apps/web):
 *   npx tsx scripts/satori-archetype-diversity.mts
 *
 * Output: .preview-renders/satori-archetype-diversity/{archetype}-{vibe}.jpg
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import satori from 'satori';
import { renderAsync } from '@resvg/resvg-js';
import sharp from 'sharp';
import type { TypographyVibe } from '../src/types/brand-theme';
import { fontsForVibe, loadSatoriFontSet } from '../src/lib/satori-fonts';
import {
  buildOverlayElement,
  formatForAspect,
  resolveCanvasDimensions,
  resolvePanelColors,
  selectLayoutFamily,
  type LayoutFamily,
} from '../src/lib/local-typography-renderer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
const OUT = path.join(webRoot, '.preview-renders/satori-archetype-diversity');
fs.mkdirSync(OUT, { recursive: true });

const PHOTO =
  'https://yulabodrum.com/galeri/54.webp';

const CASES: Array<{
  name: string;
  canvaArchetypeId: string;
  vibe: TypographyVibe;
  primary: string;
  accent: string;
}> = [
  { name: 'campaign-hero', canvaArchetypeId: 'campaign_hero_block', vibe: 'warm_coastal', primary: '#00C5CC', accent: '#DF1F29' },
  { name: 'frosted-chill', canvaArchetypeId: 'frosted_quote_card', vibe: 'warm_coastal', primary: '#00C5CC', accent: '#DF1F29' },
  { name: 'polaroid-casual', canvaArchetypeId: 'polaroid_memory', vibe: 'handwritten', primary: '#2C1810', accent: '#C9813F' },
  { name: 'neon-nightlife', canvaArchetypeId: 'neon_night_promo', vibe: 'neon_glow', primary: '#1A0A2E', accent: '#FF4FD8' },
  { name: 'ticket-event', canvaArchetypeId: 'event_ticket_stub', vibe: 'street_bold', primary: '#0B4F6C', accent: '#F5A25D' },
  { name: 'cinematic-luxury', canvaArchetypeId: 'cinematic_full_bleed', vibe: 'editorial_serif', primary: '#1A1A2E', accent: '#C9A84C' },
  { name: 'retro-poster', canvaArchetypeId: 'magazine_cover_drop', vibe: 'retro_poster', primary: '#8B2500', accent: '#F4E8C1' },
];

async function fetchBuf(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main(): Promise<void> {
  const photoBuf = await fetchBuf(PHOTO);
  const dims = resolveCanvasDimensions('9:16');
  const format = formatForAspect('9:16');
  const base = await sharp(photoBuf)
    .resize(dims.width, dims.height, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 90 })
    .toBuffer();

  const summary: Array<{ name: string; family: LayoutFamily }> = [];

  for (const c of CASES) {
    const family = selectLayoutFamily({
      format,
      canvaArchetypeId: c.canvaArchetypeId,
      vibe: c.vibe,
    });
    const { heading, body } = fontsForVibe(c.vibe);
    const fonts = await loadSatoriFontSet([
      { name: heading, weight: 800 },
      { name: heading, weight: 700 },
      { name: body, weight: 600 },
      { name: body, weight: 500 },
    ]);
    const colors = resolvePanelColors(family, { primary: c.primary, accent: c.accent }, c.vibe);
    const element = buildOverlayElement({
      family,
      format,
      headline: 'Yazına Özel Mandalina Kokteylleri',
      subtitle: 'Bu hafta sonu — terasta canlı müzik.',
      overline: 'Brand Demo',
      headingFontFamily: heading,
      bodyFontFamily: body,
      vibe: c.vibe,
      ...colors,
    });
    const svg = await satori(element as Parameters<typeof satori>[0], {
      width: dims.width,
      height: dims.height,
      fonts,
    });
    const png = await renderAsync(svg, { fitTo: { mode: 'width', value: dims.width } });
    const out = await sharp(base)
      .composite([{ input: Buffer.from(png.asPng()), top: 0, left: 0 }])
      .jpeg({ quality: 92 })
      .toBuffer();
    const file = path.join(OUT, `${c.name}.jpg`);
    fs.writeFileSync(file, out);
    summary.push({ name: c.name, family });
    console.log(`${c.name}: archetype=${c.canvaArchetypeId} vibe=${c.vibe} → ${family}`);
  }

  const families = new Set(summary.map((s) => s.family));
  console.log(`\nDistinct geometries: ${families.size}/${summary.length} → ${[...families].join(', ')}`);
  if (families.size < 5) {
    console.error('FAIL: expected ≥5 distinct layout families');
    process.exit(1);
  }
  console.log(`Wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
