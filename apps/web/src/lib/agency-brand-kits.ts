/**
 * Agency Brand Kits — 50 ready-to-use brand motion identities.
 * Each tenant can bind to a kit_id + overrides in brand_theme.
 */

import type { AgencyBrandKit } from './story-template-types';

const SECTORS = [
  'beach_club', 'fine_dining', 'hotel_resort', 'nightclub', 'rooftop_bar',
  'cafe_bakery', 'wellness_spa', 'fashion_retail', 'jewelry', 'real_estate',
  'fitness', 'art_gallery', 'wine_bar', 'steakhouse', 'sushi',
  'mediterranean', 'turkish_cuisine', 'cocktail_bar', 'boutique_hotel', 'marina',
  'yacht_club', 'pool_club', 'brunch', 'patisserie', 'food_truck',
  'luxury_auto', 'beauty_salon', 'co_working', 'event_venue', 'music_venue',
  'theater', 'museum', 'golf_club', 'ski_resort', 'safari_lodge',
  'vegan_cafe', 'pizza', 'burger', 'seafood', 'bbq',
  'tea_house', 'dessert', 'flower_shop', 'pet_spa', 'kids_play',
  'photography', 'architecture', 'tech_startup', 'law_firm', 'dental',
] as const;

const PALETTES: Array<{ primary: string; accent: string; text: string }> = [
  { primary: '#1a2b4a', accent: '#c9a96e', text: '#ffffff' },
  { primary: '#0d1117', accent: '#e8c547', text: '#ffffff' },
  { primary: '#1c1917', accent: '#d4a574', text: '#fafaf9' },
  { primary: '#134e4a', accent: '#fbbf24', text: '#ffffff' },
  { primary: '#1e1b4b', accent: '#a78bfa', text: '#ffffff' },
  { primary: '#450a0a', accent: '#fca5a5', text: '#ffffff' },
  { primary: '#0c4a6e', accent: '#38bdf8', text: '#ffffff' },
  { primary: '#14532d', accent: '#86efac', text: '#ffffff' },
  { primary: '#292524', accent: '#fcd34d', text: '#ffffff' },
  { primary: '#18181b', accent: '#f472b6', text: '#ffffff' },
];

const FONT_PAIRS: Array<{ heading: string; body: string; motionStyle: AgencyBrandKit['motionStyle'] }> = [
  { heading: 'Cormorant Garamond', body: 'Libre Baskerville', motionStyle: 'luxury' },
  { heading: 'DM Serif Display', body: 'Sora', motionStyle: 'luxury' },
  { heading: 'Fraunces', body: 'Lora', motionStyle: 'editorial' },
  { heading: 'Bodoni Moda', body: 'Manrope', motionStyle: 'luxury' },
  { heading: 'Playfair Display', body: 'Libre Baskerville', motionStyle: 'editorial' },
  { heading: 'Syne', body: 'DM Sans', motionStyle: 'bold' },
  { heading: 'Archivo Black', body: 'Barlow Condensed', motionStyle: 'bold' },
  { heading: 'Space Grotesk', body: 'Outfit', motionStyle: 'editorial' },
  { heading: 'Anton', body: 'Oswald', motionStyle: 'bold' },
  { heading: 'Great Vibes', body: 'Cormorant Garamond', motionStyle: 'luxury' },
];

const SHOWCASE_COPY: Record<string, { headline: string; subtitle: string; category: string }> = {
  beach_club: { headline: 'Golden Hour Ritüeli', subtitle: 'Deniz · lounge · sunset', category: 'SUNSET' },
  beauty_salon: { headline: 'Işıltını\nKeşfet', subtitle: 'Cilt · saç · manikür', category: 'GLOW' },
  fine_dining: { headline: 'Şefin Seçimi', subtitle: 'Mevsimsel tadım menüsü', category: 'TASTING' },
  hotel_resort: { headline: 'Kaçış Başlasın', subtitle: 'Premium konaklama', category: 'STAY' },
  nightclub: { headline: 'Gece Canlanıyor', subtitle: 'DJ set · VIP', category: 'NIGHT' },
  default: { headline: 'Marka Hikayesi', subtitle: 'Ajans kalitesinde içerik', category: 'BRAND' },
};

function kitCopy(sector: string) {
  return SHOWCASE_COPY[sector] ?? SHOWCASE_COPY.default!;
}

/** Build 50 kits from sector × palette × font rotation */
export const AGENCY_BRAND_KITS: AgencyBrandKit[] = SECTORS.map((sector, i) => {
  const palette = sector === 'beach_club'
    ? { primary: '#0f172a', accent: '#fb923c', text: '#fff7ed' }
    : sector === 'beauty_salon'
      ? { primary: '#1a1218', accent: '#e8b4b8', text: '#fdf2f8' }
      : PALETTES[i % PALETTES.length]!;
  const fonts = sector === 'beach_club'
    ? { heading: 'Bodoni Moda', body: 'Manrope', motionStyle: 'luxury' as const }
    : sector === 'beauty_salon'
      ? { heading: 'Cormorant Garamond', body: 'Lora', motionStyle: 'luxury' as const }
      : FONT_PAIRS[i % FONT_PAIRS.length]!;
  const copy = kitCopy(sector);
  const id = `kit_${String(i + 1).padStart(2, '0')}_${sector}`;

  return {
    id,
    name: sector.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    sector,
    locale: i % 3 === 0 ? 'tr' : 'en',
    primaryColor: palette.primary,
    accentColor: palette.accent,
    textColor: palette.text,
    headingFont: fonts.heading,
    bodyFont: fonts.body,
    motionStyle: fonts.motionStyle,
    templateIds: [], // filled by registry after catalog build
    showcaseHeadline: copy.headline,
    showcaseSubtitle: copy.subtitle,
    showcaseCategory: copy.category,
  };
});

export const AGENCY_BRAND_KIT_BY_ID = new Map(AGENCY_BRAND_KITS.map((k) => [k.id, k]));

export function getBrandKit(kitId: string): AgencyBrandKit | undefined {
  return AGENCY_BRAND_KIT_BY_ID.get(kitId);
}

export function getDefaultBrandKit(): AgencyBrandKit {
  return AGENCY_BRAND_KITS[0]!;
}

export function listBrandKitsBySector(sector: string): AgencyBrandKit[] {
  const norm = sector.toLowerCase().replace(/\s+/g, '_');
  return AGENCY_BRAND_KITS.filter((k) => k.sector.includes(norm) || norm.includes(k.sector));
}
