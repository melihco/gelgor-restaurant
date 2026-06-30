/**
 * Legacy standalone composition previews — renders the 6 bespoke story
 * compositions (not the SpecStory engine) so we can verify their premium upgrade.
 *
 * Usage:  node scripts/preview-legacy.mjs
 * Output: .preview-renders/legacy/<compositionId>.png
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderStill } from '@remotion/renderer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
const outDir = path.resolve(webRoot, '.preview-renders/legacy');
fs.mkdirSync(outDir, { recursive: true });

const U = (id) => `https://images.unsplash.com/${id}?w=1080&q=80`;
const logo = (text, hex) => `https://placehold.co/640x200/transparent/${hex}/png?text=${encodeURIComponent(text)}`;

const COMMON = {
  brandName: 'LUMEN', primaryColor: '#1f2a44', accentColor: '#c9a96e',
  fontFamily: 'Playfair Display', bodyFont: 'Sora', location: 'Bodrum',
  logoUrl: logo('LUMEN', 'C9A96E'),
};

const TARGETS = [
  { id: 'EditorialStory', photoUrl: U('photo-1414235077428-338989a2e8c0'), headline: 'Akşamın İlk Işıkları', subtitle: 'Deniz kenarında mevsimin tabakları', categoryLabel: 'Hikaye' },
  { id: 'CinematicStory', photoUrl: U('photo-1507525428034-b723cf961d3e'), headline: 'Sahilde Akşam', subtitle: 'Günbatımı menüsü', categoryLabel: 'Atmosfer' },
  { id: 'LuxurySplitStory', photoUrl: U('photo-1566073771259-6a8506099945'), headline: 'Sessizliğin Lüksü', subtitle: 'Denize sıfır süitler', categoryLabel: 'Signature', cta: 'Rezervasyon' },
  { id: 'CampaignHeroStory', photoUrl: U('photo-1513104890138-7c749659a591'), headline: 'Brunch Geri Döndü', subtitle: 'Hafta sonu 10:00 - 14:00', categoryLabel: 'Kampanya', cta: '2. Tabak Bizden' },
  { id: 'MagazineCoverStory', photoUrl: U('photo-1490481651871-ab68de25d43d'), headline: 'Sezonun Menüsü', subtitle: 'Şefin imza tabağı', categoryLabel: 'Feature' },
  { id: 'EventAnnouncementStory', photoUrl: U('photo-1516450360452-9312f5e86fc7'), headline: 'Canlı Müzik Gecesi', subtitle: 'Resident DJ performansı', categoryLabel: 'Etkinlik', eventDate: '28 Haz', eventTime: '21:00', cta: 'Bilet Al' },
];

const run = async () => {
  console.log('[legacy] bundling Root.tsx …');
  const serveUrl = await bundle({
    entryPoint: path.resolve(webRoot, 'src/remotion/Root.tsx'),
    webpackOverride: (config) => {
      config.resolve = config.resolve ?? {};
      config.resolve.alias = { ...(config.resolve.alias ?? {}), '@': path.resolve(webRoot, 'src') };
      return config;
    },
    publicDir: path.resolve(webRoot, 'public'),
  });
  console.log('[legacy] bundle ready');

  for (const t of TARGETS) {
    const inputProps = { ...COMMON, ...t, storyMusicUrl: '' };
    const output = path.join(outDir, `${t.id}.png`);
    try {
      const composition = await selectComposition({ serveUrl, id: t.id, inputProps });
      await renderStill({ composition, serveUrl, output, inputProps, frame: 110, imageFormat: 'png', scale: 0.5 });
      console.log(`[legacy] ✓ ${t.id}`);
    } catch (err) {
      console.error(`[legacy] ✗ ${t.id}: ${err?.message ?? err}`);
    }
  }
  console.log(`\n[legacy] done → ${outDir}`);
  process.exit(0);
};

run().catch((e) => { console.error(e); process.exit(1); });
