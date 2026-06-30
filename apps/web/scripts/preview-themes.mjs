/**
 * Themed preview renderer — 30 stories across different sectors / palettes /
 * typography so we can eyeball the premium system on varied brands.
 *
 * Usage:  node scripts/preview-themes.mjs
 * Output: .preview-renders/themes/<NN>_<slug>.png
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderStill } from '@remotion/renderer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
const outDir = path.resolve(webRoot, '.preview-renders/themes');
fs.mkdirSync(outDir, { recursive: true });

const U = (id, w = 1080) => `https://images.unsplash.com/${id}?w=${w}&q=80`;
const logo = (text, hex) =>
  `https://placehold.co/640x200/transparent/${hex}/png?text=${encodeURIComponent(text)}`;

// id (catalog templateId) + full brand theme
const THEMES = [
  {
    slug: 'fine_dining', id: 'remotion_editorial_bottom_01',
    brandName: 'LUMEN', primaryColor: '#1f2a44', accentColor: '#c9a96e',
    fontFamily: 'Playfair Display', bodyFont: 'Sora', location: 'Bodrum',
    photoUrl: U('photo-1414235077428-338989a2e8c0'), logoHex: 'C9A96E',
    headline: 'Akşamın İlk Işıkları', subtitle: 'Deniz kenarında mevsimin tabakları', categoryLabel: 'Bu Akşam',
  },
  {
    slug: 'coffee_roastery', id: 'remotion_bold_impact_01',
    brandName: 'NORTH ROAST', primaryColor: '#2a1d16', accentColor: '#d8b48a',
    fontFamily: 'Archivo', bodyFont: 'Inter', location: 'Karaköy',
    photoUrl: U('photo-1495474472287-4d71bcdd2085'), logoHex: 'D8B48A',
    headline: 'Taze Kavrum', subtitle: 'Her sabah yeniden', categoryLabel: 'Yeni Parti', cta: 'Sipariş Ver',
  },
  {
    slug: 'fashion_boutique', id: 'remotion_magazine_cover_01',
    brandName: 'ATELIER NOIR', primaryColor: '#0d0d0d', accentColor: '#e8e2d8',
    fontFamily: 'Bodoni Moda', bodyFont: 'Archivo', location: 'Nişantaşı',
    photoUrl: U('photo-1490481651871-ab68de25d43d'), logoHex: 'E8E2D8',
    headline: 'Sonbahar Koleksiyonu', subtitle: 'Yeni sezon vitrinde', categoryLabel: 'Lookbook',
  },
  {
    slug: 'luxury_hotel', id: 'remotion_minimal_luxury_01',
    brandName: 'AZURE', primaryColor: '#0f2e2b', accentColor: '#c9a96e',
    fontFamily: 'Cormorant Garamond', bodyFont: 'Sora', location: 'Çeşme',
    photoUrl: U('photo-1566073771259-6a8506099945'), logoHex: 'C9A96E',
    headline: 'Sessizliğin Lüksü', subtitle: 'Denize sıfır süitler', categoryLabel: 'Signature',
  },
  {
    slug: 'fitness_gym', id: 'remotion_bold_impact_02',
    brandName: 'FORGE', primaryColor: '#131418', accentColor: '#c6f135',
    fontFamily: 'Anton', bodyFont: 'Inter', location: 'Levent',
    photoUrl: U('photo-1534438327276-14e5300c3a48'), logoHex: 'C6F135',
    headline: 'Limit Yok', subtitle: 'Yeni dönem üyelikleri', categoryLabel: 'Kampanya', cta: 'Hemen Başla',
  },
  {
    slug: 'nightclub', id: 'remotion_neon_night_01',
    brandName: 'PULSE', primaryColor: '#160f3d', accentColor: '#a78bfa',
    fontFamily: 'Space Grotesk', bodyFont: 'Inter', location: 'Maslak',
    photoUrl: U('photo-1516450360452-9312f5e86fc7'), logoHex: 'A78BFA',
    headline: 'Gece Başlıyor', subtitle: 'Resident DJ performansı', categoryLabel: 'Bu Cuma',
    eventDate: '28 Haz', eventTime: '23:00', cta: 'Liste',
  },
  {
    slug: 'beauty_salon', id: 'remotion_glassmorphism_showcase_01',
    brandName: 'GLOW BAR', primaryColor: '#2b1620', accentColor: '#e4a6b0',
    fontFamily: 'Syne', bodyFont: 'Inter', location: 'Bağdat Cd.',
    photoUrl: U('photo-1560066984-138dadb4c035'), logoHex: 'E4A6B0',
    headline: 'Işıltını Yansıt', subtitle: 'Yeni cilt bakım ritüeli', categoryLabel: 'Showcase',
  },
  {
    slug: 'real_estate', id: 'remotion_split_panel_01',
    brandName: 'MERIDIAN', primaryColor: '#1b2430', accentColor: '#b08d57',
    fontFamily: 'Montserrat', bodyFont: 'Inter', location: 'Etiler',
    photoUrl: U('photo-1564013799919-ab600027ffc6'), logoHex: 'B08D57',
    headline: 'Şehrin Üstünde', subtitle: 'Sınırlı sayıda rezidans', categoryLabel: 'Yeni Proje',
  },
  {
    slug: 'patisserie', id: 'remotion_frosted_glass_01',
    brandName: 'MÉLANGE', primaryColor: '#2a201a', accentColor: '#d9a679',
    fontFamily: 'Cormorant Garamond', bodyFont: 'Sora', location: 'Cihangir',
    photoUrl: U('photo-1509440159596-0249088772ff'), logoHex: 'D9A679',
    headline: 'Günün Tazesi', subtitle: 'El yapımı viennoiserie', categoryLabel: 'Fırından',
  },
  {
    slug: 'jewelry', id: 'remotion_noir_editorial_01',
    brandName: 'AURUM', primaryColor: '#08080a', accentColor: '#d9c9a3',
    fontFamily: 'Bodoni Moda', bodyFont: 'Archivo', location: 'Kanyon',
    photoUrl: U('photo-1515562141207-7a88fb7ce338'), logoHex: 'D9C9A3',
    headline: 'Zamansız Parıltı', subtitle: 'Pırlanta koleksiyonu', categoryLabel: 'Maison',
  },
  {
    slug: 'yoga_wellness', id: 'remotion_cinematic_center_01',
    brandName: 'PRANA', primaryColor: '#233028', accentColor: '#cda07a',
    fontFamily: 'Cormorant Garamond', bodyFont: 'Sora', location: 'Arnavutköy',
    photoUrl: U('photo-1545205597-3d9d02c29597'), logoHex: 'CDA07A',
    headline: 'Nefes Al', subtitle: 'Sabah akış seansları', categoryLabel: 'Stüdyo',
  },
  {
    slug: 'travel', id: 'remotion_location_pin_01',
    brandName: 'WAYFARE', primaryColor: '#0d2a3d', accentColor: '#e0c79a',
    fontFamily: 'Sora', bodyFont: 'Inter', location: 'Kapadokya',
    photoUrl: U('photo-1507525428034-b723cf961d3e'), logoHex: 'E0C79A',
    headline: 'Yeni Rotalar', subtitle: 'Yaz turları açıldı', categoryLabel: 'Konum',
  },
  {
    slug: 'cocktail_bar', id: 'remotion_vibe_fullscreen_01',
    brandName: 'EMBER', primaryColor: '#1f0f1a', accentColor: '#c98a5e',
    fontFamily: 'Syne', bodyFont: 'Inter', location: 'Asmalımescit',
    photoUrl: U('photo-1551024601-bec78aea704b'), logoHex: 'C98A5E',
    headline: 'Akşam Karışımı', subtitle: 'İmza kokteyller', categoryLabel: 'Bar',
  },
  {
    slug: 'florist', id: 'remotion_mosaic_pinterest_01',
    brandName: 'BLOOM CO.', primaryColor: '#2c1b16', accentColor: '#8aa66b',
    fontFamily: 'DM Serif Display', bodyFont: 'Sora', location: 'Moda',
    photoUrl: U('photo-1490750967868-88aa4486c946'), logoHex: '8AA66B',
    headline: 'Mevsimin Buketi', subtitle: 'Taze kesim çiçekler', categoryLabel: 'Seçki',
    galleryPhotoUrls: [U('photo-1490750967868-88aa4486c946'), U('photo-1559339352-11d035aa65de'), U('photo-1556228578-8c89e6adf883')],
  },
  {
    slug: 'tech_product', id: 'remotion_editorial_product_stage_01',
    brandName: 'NOVA', primaryColor: '#11132e', accentColor: '#5ad1e6',
    fontFamily: 'Space Grotesk', bodyFont: 'Inter', location: 'Online',
    photoUrl: U('photo-1498049794561-7780e7231661'), logoHex: '5AD1E6',
    headline: 'Yeni Nesil', subtitle: 'Önyükleme şimdi başladı', categoryLabel: 'Ürün',
    galleryPhotoUrls: [U('photo-1498049794561-7780e7231661'), U('photo-1486406146926-c627a92ad1ab')],
  },
  {
    slug: 'pizzeria', id: 'remotion_campaign_hero_01',
    brandName: 'FORNO', primaryColor: '#3a0f0f', accentColor: '#e8c98a',
    fontFamily: 'Archivo', bodyFont: 'Inter', location: 'Kadıköy',
    photoUrl: U('photo-1513104890138-7c749659a591'), logoHex: 'E8C98A',
    headline: 'Odun Ateşinde', subtitle: 'Hafta içi 2. pizza bizden', categoryLabel: 'Kampanya', cta: 'Sipariş',
  },
  {
    slug: 'spa_retreat', id: 'remotion_asymmetric_editorial_01',
    brandName: 'SERENE', primaryColor: '#1e2b29', accentColor: '#c2b6a3',
    fontFamily: 'Cormorant Garamond', bodyFont: 'Sora', location: 'Sapanca',
    photoUrl: U('photo-1540555700478-4be289fbecef'), logoHex: 'C2B6A3',
    headline: 'Arınma Zamanı', subtitle: 'Hafta sonu kaçamağı', categoryLabel: 'Retreat',
  },
  {
    slug: 'wedding_planner', id: 'remotion_event_ticket_01',
    brandName: 'ÉPOQUE', primaryColor: '#241d1f', accentColor: '#d8a7a0',
    fontFamily: 'Playfair Display', bodyFont: 'Sora', location: 'Sarıyer',
    photoUrl: U('photo-1519225421980-715cb0215aed'), logoHex: 'D8A7A0',
    headline: 'O Özel Gün', subtitle: 'Davet ve organizasyon', categoryLabel: 'Etkinlik',
    eventDate: '14 Eyl', eventTime: '19:00',
  },
  {
    slug: 'streetwear', id: 'remotion_luxury_kinetic_type_01',
    brandName: 'VOLT', primaryColor: '#0a0a0a', accentColor: '#e6ff3a',
    fontFamily: 'Anton', bodyFont: 'Inter', location: 'Drop 03',
    photoUrl: U('photo-1521572163474-6864f9cf17ab'), logoHex: 'E6FF3A',
    headline: 'Sokağın Sesi', subtitle: 'Sınırlı üretim', categoryLabel: 'Premium', cta: 'Shop',
  },
  {
    slug: 'brunch_cafe', id: 'remotion_diptych_collage_01',
    brandName: 'MORNING', primaryColor: '#2a2410', accentColor: '#5fae9e',
    fontFamily: 'Archivo', bodyFont: 'Inter', location: 'Bebek',
    photoUrl: U('photo-1495474472287-4d71bcdd2085'), logoHex: '5FAE9E',
    headline: 'Güne İyi Başla', subtitle: 'Hafta sonu brunch', categoryLabel: 'Koleksiyon',
    galleryPhotoUrls: [U('photo-1495474472287-4d71bcdd2085'), U('photo-1509042239860-f550ce710b93')],
  },
  {
    slug: 'art_gallery', id: 'remotion_editorial_left_01',
    brandName: 'VOID', primaryColor: '#14140f', accentColor: '#d8d2c4',
    fontFamily: 'Bodoni Moda', bodyFont: 'Archivo', location: 'Tophane',
    photoUrl: U('photo-1531913764164-f85c52e6e654'), logoHex: 'D8D2C4',
    headline: 'Yeni Sergi', subtitle: 'Çağdaş eserler', categoryLabel: 'Sergi',
  },
  {
    slug: 'music_festival', id: 'remotion_bento_story_01',
    brandName: 'WAVEFORM', primaryColor: '#2a0f2e', accentColor: '#f15bb5',
    fontFamily: 'Space Grotesk', bodyFont: 'Inter', location: 'Çeşme',
    photoUrl: U('photo-1459749411175-04bf5292ceea'), logoHex: 'F15BB5',
    headline: 'Sahne Senin', subtitle: '3 gün 3 sahne', categoryLabel: 'Bento',
    galleryPhotoUrls: [U('photo-1459749411175-04bf5292ceea'), U('photo-1470229722913-7c0e2dbbafd3'), U('photo-1516450360452-9312f5e86fc7'), U('photo-1551024601-bec78aea704b')],
  },
  {
    slug: 'skincare', id: 'remotion_quote_card_01',
    brandName: 'DERMA', primaryColor: '#211d18', accentColor: '#a9b89a',
    fontFamily: 'Cormorant Garamond', bodyFont: 'Sora', location: '',
    photoUrl: U('photo-1556228578-8c89e6adf883'), logoHex: 'A9B89A',
    headline: 'Cildim hiç bu kadar iyi olmamıştı.', subtitle: 'Elif T.', categoryLabel: 'Misafir',
  },
  {
    slug: 'winery', id: 'remotion_gallery_series_01',
    brandName: 'VIGNA', primaryColor: '#2a0e16', accentColor: '#c9a96e',
    fontFamily: 'Cormorant Garamond', bodyFont: 'Sora', location: 'Urla',
    photoUrl: U('photo-1510812431401-41d2bd2722f3'), logoHex: 'C9A96E',
    headline: 'Bağdan Kadehe', subtitle: 'Hasat hikayemiz', categoryLabel: 'Galeri',
    galleryPhotoUrls: [U('photo-1510812431401-41d2bd2722f3'), U('photo-1559339352-11d035aa65de'), U('photo-1414235077428-338989a2e8c0')],
  },
  {
    slug: 'beach_club', id: 'remotion_polaroid_stack_01',
    brandName: 'SALT', primaryColor: '#0e2e33', accentColor: '#f0846a',
    fontFamily: 'Syne', bodyFont: 'Inter', location: 'Alaçatı',
    photoUrl: U('photo-1507525428034-b723cf961d3e'), logoHex: 'F0846A',
    headline: 'Yaz Burada', subtitle: 'Bu haftadan kareler', categoryLabel: 'Galeri',
    galleryPhotoUrls: [U('photo-1507525428034-b723cf961d3e'), U('photo-1470229722913-7c0e2dbbafd3'), U('photo-1559339352-11d035aa65de')],
  },
  {
    slug: 'barbershop', id: 'remotion_magazine_cover_02',
    brandName: 'KLINGE', primaryColor: '#121212', accentColor: '#d99a4e',
    fontFamily: 'Oswald', bodyFont: 'Inter', location: 'Şişli',
    photoUrl: U('photo-1503951914875-452162b0f3f1'), logoHex: 'D99A4E',
    headline: 'Usta İşi', subtitle: 'Klasik tıraş deneyimi', categoryLabel: 'Feature',
  },
  {
    slug: 'sushi', id: 'remotion_minimal_luxury_02',
    brandName: 'KOMA', primaryColor: '#0b0b0d', accentColor: '#d6453f',
    fontFamily: 'DM Serif Display', bodyFont: 'Inter', location: 'Akaretler',
    photoUrl: U('photo-1579584425555-c3ce17fd4351'), logoHex: 'D6453F',
    headline: 'Omakase', subtitle: 'Şefin günlük seçkisi', categoryLabel: 'Signature',
  },
  {
    slug: 'gelato', id: 'remotion_vibe_fullscreen_02',
    brandName: 'DOLCE', primaryColor: '#2b1822', accentColor: '#8fe3c8',
    fontFamily: 'Syne', bodyFont: 'Inter', location: 'Karaköy',
    photoUrl: U('photo-1488900128323-21503983a07e'), logoHex: '8FE3C8',
    headline: 'Serinleten Anlar', subtitle: 'Günlük taze gelato', categoryLabel: 'Yeni',
  },
  {
    slug: 'architecture', id: 'remotion_asymmetric_editorial_02',
    brandName: 'AXIS', primaryColor: '#1d1e20', accentColor: '#e08a3c',
    fontFamily: 'Space Grotesk', bodyFont: 'Inter', location: 'Studio',
    photoUrl: U('photo-1486406146926-c627a92ad1ab'), logoHex: 'E08A3C',
    headline: 'Form ve İşlev', subtitle: 'Yeni projemiz', categoryLabel: 'Editorial',
  },
  {
    slug: 'specialty_coffee', id: 'remotion_editorial_bottom_02',
    brandName: 'EMBER & OAK', primaryColor: '#241a12', accentColor: '#d8b48a',
    fontFamily: 'Cormorant Garamond', bodyFont: 'Sora', location: 'Galata',
    photoUrl: U('photo-1509042239860-f550ce710b93'), logoHex: 'D8B48A',
    headline: 'Demlemenin Sanatı', subtitle: 'Tek menşe çekirdekler', categoryLabel: 'Bugün',
  },
];

const run = async () => {
  console.log('[themes] bundling Root.tsx …');
  const serveUrl = await bundle({
    entryPoint: path.resolve(webRoot, 'src/remotion/Root.tsx'),
    webpackOverride: (config) => {
      config.resolve = config.resolve ?? {};
      config.resolve.alias = { ...(config.resolve.alias ?? {}), '@': path.resolve(webRoot, 'src') };
      return config;
    },
    publicDir: path.resolve(webRoot, 'public'),
  });
  console.log('[themes] bundle ready');

  let i = 0;
  for (const t of THEMES) {
    i += 1;
    const nn = String(i).padStart(2, '0');
    const inputProps = {
      templateId: t.id,
      photoUrl: t.photoUrl,
      galleryPhotoUrls: t.galleryPhotoUrls,
      brandName: t.brandName,
      primaryColor: t.primaryColor,
      accentColor: t.accentColor,
      fontFamily: t.fontFamily,
      bodyFont: t.bodyFont,
      location: t.location ?? '',
      headline: t.headline,
      subtitle: t.subtitle ?? '',
      categoryLabel: t.categoryLabel ?? '',
      cta: t.cta ?? '',
      eventDate: t.eventDate ?? '',
      eventTime: t.eventTime ?? '',
      logoUrl: logo(t.brandName, t.logoHex),
      storyMusicUrl: '',
    };
    const output = path.join(outDir, `${nn}_${t.slug}.png`);
    try {
      const composition = await selectComposition({ serveUrl, id: 'SpecStory', inputProps });
      await renderStill({ composition, serveUrl, output, inputProps, frame: 96, imageFormat: 'png', scale: 0.5 });
      console.log(`[themes] ✓ ${nn}_${t.slug} (${t.id})`);
    } catch (err) {
      console.error(`[themes] ✗ ${nn}_${t.slug}: ${err?.message ?? err}`);
    }
  }
  console.log(`\n[themes] done → ${outDir}`);
  process.exit(0);
};

run().catch((e) => { console.error(e); process.exit(1); });
