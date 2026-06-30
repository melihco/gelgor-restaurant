/**
 * One-off preview renderer — bundles Root.tsx and renders SpecStory stills (PNG)
 * for the upgraded layout families so we can eyeball the new premium design.
 *
 * Usage:  node scripts/preview-templates.mjs
 * Output: .preview-renders/<templateId>.png
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderStill } from '@remotion/renderer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
const outDir = path.resolve(webRoot, '.preview-renders');
fs.mkdirSync(outDir, { recursive: true });

const PHOTO = 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1080&q=80';
const GALLERY = [
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1080&q=80',
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1080&q=80',
  'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=1080&q=80',
];

const COMMON = {
  photoUrl: PHOTO,
  brandName: 'LUMEN BISTRO',
  primaryColor: '#1f2a44',
  accentColor: '#c9a96e',
  fontFamily: 'Playfair Display',
  bodyFont: 'Sora',
  location: 'Bodrum',
  // Transparent-bg PNG wordmark to verify the logo zone renders the brand mark (not text).
  logoUrl: 'https://placehold.co/640x200/transparent/F5E9C8/png?text=LUMEN',
  kitId: undefined,
};

// One representative variant (_01) per layout family — full premium matrix.
const TARGETS = [
  { id: 'remotion_editorial_bottom_01', headline: 'Akşamın İlk Işıkları', subtitle: 'Deniz kenarında mevsimin tabakları', categoryLabel: 'Bu Akşam' },
  { id: 'remotion_editorial_left_01', headline: 'Sıcak Karşılama', subtitle: 'Her detayda zarafet', categoryLabel: 'Hikaye' },
  { id: 'remotion_split_panel_01', headline: 'Mevsimin Tabağı', subtitle: 'Şefin imza dokunuşu', categoryLabel: 'Menü' },
  { id: 'remotion_magazine_cover_01', headline: 'Sezonun Menüsü', subtitle: 'Şefin imza tabağı', categoryLabel: 'Feature' },
  { id: 'remotion_cinematic_center_01', headline: 'Bir Akşam Masalı', subtitle: 'Mum ışığında akşam yemeği', categoryLabel: 'Bu Akşam' },
  { id: 'remotion_campaign_hero_01', headline: 'Brunch Geri Döndü', subtitle: 'Hafta sonu 10:00 - 14:00', categoryLabel: 'Kampanya' },
  { id: 'remotion_gallery_series_01', headline: 'Bu Haftadan Kareler', subtitle: 'Mutfaktan masaya', categoryLabel: 'Galeri', galleryPhotoUrls: GALLERY },
  { id: 'remotion_frosted_glass_01', headline: 'Zarif Detaylar', subtitle: 'Cam berraklığında lezzet', categoryLabel: 'Signature' },
  { id: 'remotion_bold_impact_01', headline: 'Yaz Geldi', subtitle: 'Serinleten kokteyller', categoryLabel: 'Yeni' },
  { id: 'remotion_noir_editorial_01', headline: 'Gece Yarısı Menüsü', subtitle: 'Koyu tonlarda bir deneyim', categoryLabel: 'Noir' },
  { id: 'remotion_event_ticket_01', headline: 'Canlı Müzik Gecesi', subtitle: 'Cumartesi 21:00', categoryLabel: 'Etkinlik' },
  { id: 'remotion_diptych_collage_01', headline: 'İki Dünya Bir Sofra', subtitle: 'Klasik ve modern', categoryLabel: 'Koleksiyon', galleryPhotoUrls: GALLERY },
  { id: 'remotion_minimal_luxury_01', headline: 'İncelikli Lezzetler', subtitle: 'Sadelikte saklı ustalık', categoryLabel: 'Signature' },
  { id: 'remotion_mosaic_pinterest_01', headline: 'Lezzet Panosu', subtitle: 'Bu haftanın seçkisi', categoryLabel: 'Seçki', galleryPhotoUrls: GALLERY },
  { id: 'remotion_asymmetric_editorial_01', headline: 'Tasarım ve Tat', subtitle: 'Dengeli bir kompozisyon', categoryLabel: 'Editorial' },
  { id: 'remotion_polaroid_single_01', headline: 'Bir Kare Bir An', subtitle: 'Anı yakala', categoryLabel: 'Anı' },
  { id: 'remotion_polaroid_stack_01', headline: 'Anılar Burada', subtitle: 'Bu haftadan kareler', categoryLabel: 'Galeri', galleryPhotoUrls: GALLERY },
  { id: 'remotion_vibe_fullscreen_01', headline: 'Yeni Sezon', subtitle: 'Şehrin ritmi burada', categoryLabel: 'Vibe' },
  { id: 'remotion_bento_story_01', headline: 'Menü Vitrini', subtitle: 'Dört tabak bir hikaye', categoryLabel: 'Bento', galleryPhotoUrls: GALLERY },
  { id: 'remotion_neon_night_01', headline: 'Gece Başlıyor', subtitle: 'DJ performansı 23:00', categoryLabel: 'Gece' },
  { id: 'remotion_quote_card_01', headline: 'Hayatımızın en güzel akşam yemeğiydi.', subtitle: 'Ayşe K.', categoryLabel: 'Misafir' },
  { id: 'remotion_location_pin_01', headline: 'Bizi Ziyaret Edin', subtitle: 'Sahil yolu No:12', categoryLabel: 'Konum' },
  { id: 'remotion_luxury_kinetic_type_01', headline: 'Lüks Bir Deneyim', subtitle: 'Her detayda zarafet', categoryLabel: 'Premium' },
  { id: 'remotion_glassmorphism_showcase_01', headline: 'Şeffaf Zarafet', subtitle: 'Modern bir sunum', categoryLabel: 'Showcase' },
  { id: 'remotion_editorial_product_stage_01', headline: 'Ürün Sahnesi', subtitle: 'Spot ışıkları altında', categoryLabel: 'Ürün', galleryPhotoUrls: GALLERY },
];

const run = async () => {
  console.log('[preview] bundling Root.tsx …');
  const serveUrl = await bundle({
    entryPoint: path.resolve(webRoot, 'src/remotion/Root.tsx'),
    webpackOverride: (config) => {
      config.resolve = config.resolve ?? {};
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        '@': path.resolve(webRoot, 'src'),
      };
      return config;
    },
    publicDir: path.resolve(webRoot, 'public'),
  });
  console.log('[preview] bundle ready');

  for (const t of TARGETS) {
    const inputProps = { ...COMMON, templateId: t.id, headline: t.headline, subtitle: t.subtitle, categoryLabel: t.categoryLabel, galleryPhotoUrls: t.galleryPhotoUrls, storyMusicUrl: '' };
    try {
      const composition = await selectComposition({ serveUrl, id: 'SpecStory', inputProps });
      const output = path.join(outDir, `${t.id}.png`);
      await renderStill({
        composition,
        serveUrl,
        output,
        inputProps,
        frame: 96,
        imageFormat: 'png',
        scale: 0.5,
      });
      console.log(`[preview] ✓ ${t.id} → ${output}`);
    } catch (err) {
      console.error(`[preview] ✗ ${t.id}: ${err?.message ?? err}`);
    }
  }
  console.log(`\n[preview] done → ${outDir}`);
  process.exit(0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
