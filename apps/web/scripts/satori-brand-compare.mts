#!/usr/bin/env npx tsx
/**
 * Two-brand Satori comparison — SAME slot brief, each brand's LIVE theme
 * (palette + vibe + logo + own gallery photo) through the production
 * `renderLocalTypography` code path. Proves per-brand output divergence.
 *
 * Usage (apps/web): npx tsx scripts/satori-brand-compare.mts
 * Output: .preview-renders/satori-brand-compare/{brand}.jpg
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderLocalTypography } from '../src/lib/local-typography-renderer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');

function loadEnvLocal(): void {
  const envPath = path.join(webRoot, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i);
    let v = t.slice(i + 1);
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvLocal();
process.env.LOCAL_TYPOGRAPHY_ENABLED = 'true';

const OUT_DIR = path.join(webRoot, '.preview-renders/satori-brand-compare');
fs.mkdirSync(OUT_DIR, { recursive: true });

// Live DB values (brand_contexts.brand_theme) — fetched 2026-07-16.
const BRANDS = [
  {
    slug: 'yula',
    workspaceId: 'd365f0e0-436e-402d-8f84-0c8fd7ab2022',
    brandName: 'Yula Bodrum',
    brandColors: { primary: '#00C5CC', accent: '#DF1F29' },
    vibe: 'retro_poster' as const,
    // Restaurant/cafe library pin — poster slab, not shared hero_footer
    canvaArchetypeId: 'magazine_cover_drop' as string | null,
    logoUrl: 'https://yulabodrum.com/yula-bodrum-logo.png',
    sector: 'beach_club',
    referencePhotoUrl: 'https://yulabodrum.com/galeri/54.webp',
  },
  {
    slug: 'sarnic',
    workspaceId: '431b2901-a2dc-4df6-abe3-3670d9844851',
    brandName: 'Sarnıç Beach',
    brandColors: { primary: '#87CEEB', accent: '#FF69B4' },
    vibe: 'warm_coastal' as const,
    // Coastal chill — frosted glass panel
    canvaArchetypeId: 'frosted_quote_card' as string | null,
    logoUrl: 'https://www.sarnicbeach.com/images/logo.png',
    sector: 'beach_club',
    referencePhotoUrl:
      '/api/media?key=431b2901-a2dc-4df6-abe3-3670d9844851%2Fimage%2F2026-07-02%2F22b8ed49-43fe-415a-b7b4-b0c18b0a59bb.jpg',
  },
];

// Same copy — geometry must diverge via archetype + vibe, not only colors.
const BRIEFS = [
  {
    name: 'story',
    headline: 'Gün Batımı Kokteylleri',
    subtitle: 'Bu hafta sonu — sahilde canlı müzik.',
    aspectRatio: '9:16' as const,
    slotRole: 'campaign_story_motion',
    templateType: null as string | null,
  },
  {
    name: 'post',
    headline: 'Yaz Menüsü Yayında',
    subtitle: 'Taze mandalina kokteylleri ve Ege mezeleri.',
    aspectRatio: '4:5' as const,
    slotRole: 'designed_typography',
    templateType: 'promo' as string | null,
  },
];

async function main(): Promise<void> {
  for (const brand of BRANDS) {
    for (const brief of BRIEFS) {
      const result = await renderLocalTypography({
        workspaceId: brand.workspaceId,
        headline: brief.headline,
        subtitle: brief.subtitle,
        brandName: brand.brandName,
        brandColors: brand.brandColors,
        vibe: brand.vibe,
        aspectRatio: brief.aspectRatio,
        referencePhotoUrl: brand.referencePhotoUrl,
        logoUrl: brand.logoUrl,
        sector: brand.sector,
        slotRole: brief.slotRole,
        templateType: brief.templateType,
        canvaArchetypeId: brand.canvaArchetypeId,
      });
      if (!result) {
        console.error(`${brand.slug}/${brief.name}: render FAILED`);
        continue;
      }
      // persistImageBuffer already uploaded to R2; also mirror locally for preview.
      const local = path.join(OUT_DIR, `${brand.slug}-${brief.name}.jpg`);
      const url = result.imageUrl.startsWith('/api/media')
        ? `https://smartagency-web.onrender.com${result.imageUrl}`
        : result.imageUrl;
      const res = await fetch(url);
      if (res.ok) fs.writeFileSync(local, Buffer.from(await res.arrayBuffer()));
      console.log(`${brand.slug}/${brief.name}: layout=${result.layoutFamily} url=${result.imageUrl.slice(0, 100)}`);
    }
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
