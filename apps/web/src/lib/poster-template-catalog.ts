/**
 * Poster template catalog — 50 agency poster layouts (10 families × 5 variants).
 * Next-gen: event lineup, festival grid, DJ night, promo, gala, editorial date…
 */

import {
  AGENCY_POSTER_FAMILY_UPGRADES,
  agencyPosterTags,
} from './agency-template-standard';
import type {
  PosterLayoutFamily,
  PosterLayoutSpec,
  PosterTemplateDefinition,
} from './poster-template-types';

const BASE: PosterLayoutSpec = {
  family: 'lineup_tiered',
  collection: 'Agency',
  posterMode: 'lineup_tiered',
  posterHeader: 'accent_bar',
  posterFooter: 'solid_bar',
  fontPersonality: 'display_bold',
  heroWeight: 900,
  heroUppercase: true,
  heroTracking: 0.06,
  heroScale: 1.0,
  photoRatio: 0.42,
  gradientStart: 0.28,
  gradientEnd: 0.88,
  overlayOpacity: 0.72,
  duotoneWash: 'none',
  duotoneOpacity: 0.4,
  neonGlow: false,
  vignette: 'radial',
  align: 'center',
  accentLine: 'both',
  frame: 'none',
  showDateBadge: true,
  showCta: true,
  panelUsesPrimary: true,
};

type FamilyMeta = {
  family: PosterLayoutFamily;
  collection: PosterLayoutSpec['collection'];
  nameTr: string;
  nameEn: string;
  descTr: string;
  tags: string[];
  sectors: string[];
  formats: PosterTemplateDefinition['formats'];
  base: Partial<PosterLayoutSpec>;
  variants: Array<{ suffix: string; suffixTr: string; patch: Partial<PosterLayoutSpec> }>;
};

const FAMILIES: FamilyMeta[] = [
  {
    family: 'lineup_tiered',
    collection: 'Event',
    nameTr: 'Konser Lineup',
    nameEn: 'Concert Lineup',
    descTr: 'Headliner + tiered artist stack — Coachella poster hiyerarşisi.',
    tags: ['concert', 'lineup', 'event'],
    sectors: ['music_venue', 'nightclub', 'beach_club'],
    formats: ['story', 'portrait', 'post'],
    base: { family: 'lineup_tiered', posterMode: 'lineup_tiered', posterHeader: 'accent_bar', posterFooter: 'solid_bar' },
    variants: [
      { suffix: 'Classic', suffixTr: 'Klasik', patch: {} },
      { suffix: 'Stack', suffixTr: 'Stack', patch: { posterMode: 'lineup_stack' } },
      { suffix: 'Outline Bar', suffixTr: 'Outline', patch: { posterHeader: 'outline_bar' } },
      { suffix: 'No Header', suffixTr: 'Başlıksız', patch: { posterHeader: 'none' } },
      { suffix: 'Pill Footer', suffixTr: 'Pill Alt', patch: { posterFooter: 'pill_row' } },
    ],
  },
  {
    family: 'festival_grid',
    collection: 'Festival',
    nameTr: 'Festival Grid',
    nameEn: 'Festival Grid',
    descTr: 'Çok günlük festival matrisi — sahne/tarih grid.',
    tags: ['festival', 'multi_day'],
    sectors: ['music_venue', 'event_venue', 'beach_club'],
    formats: ['story', 'portrait'],
    base: {
      family: 'festival_grid', collection: 'Festival', posterMode: 'festival_grid',
      posterHeader: 'accent_bar', posterFooter: 'solid_bar', heroScale: 1.12, vignette: 'noir',
    },
    variants: [
      { suffix: 'Grid', suffixTr: 'Grid', patch: {} },
      { suffix: 'Neon', suffixTr: 'Neon', patch: { neonGlow: true, duotoneWash: 'accent' } },
      { suffix: 'Warm', suffixTr: 'Sıcak', patch: { duotoneWash: 'warm' } },
      { suffix: 'Minimal Footer', suffixTr: 'Minimal Alt', patch: { posterFooter: 'transparent_bar' } },
      { suffix: 'Double Frame', suffixTr: 'Çift Çerçeve', patch: { frame: 'double' } },
    ],
  },
  {
    family: 'dj_night',
    collection: 'Nightlife',
    nameTr: 'DJ Night',
    nameEn: 'DJ Night',
    descTr: 'Neon glow + duotone — club gece posteri.',
    tags: ['dj', 'nightlife', 'neon'],
    sectors: ['nightclub', 'rooftop_bar', 'cocktail_bar'],
    formats: ['story', 'portrait', 'post'],
    base: {
      family: 'dj_night', collection: 'Nightlife', posterMode: 'dj_set',
      neonGlow: true, duotoneWash: 'accent', duotoneOpacity: 0.48, vignette: 'noir',
      posterFooter: 'pill_row', heroWeight: 900,
    },
    variants: [
      { suffix: 'Neon Classic', suffixTr: 'Neon', patch: {} },
      { suffix: 'Primary Wash', suffixTr: 'Primary', patch: { duotoneWash: 'primary' } },
      { suffix: 'Cool', suffixTr: 'Soğuk', patch: { duotoneWash: 'cool', neonGlow: false } },
      { suffix: 'Solid Footer', suffixTr: 'Solid Alt', patch: { posterFooter: 'solid_bar' } },
      { suffix: 'Knockout Bar', suffixTr: 'Knockout', patch: { posterHeader: 'knockout_bar' } },
    ],
  },
  {
    family: 'promo_split',
    collection: 'Campaign',
    nameTr: 'Promo Split',
    nameEn: 'Promo Split',
    descTr: 'Split panel kampanya — büyük teklif + detay footer.',
    tags: ['promo', 'offer', 'campaign'],
    sectors: ['fitness', 'fashion_retail', 'restaurant'],
    formats: ['story', 'post', 'portrait'],
    base: {
      family: 'promo_split', collection: 'Campaign', posterMode: 'promo_split',
      photoRatio: 0.58, posterFooter: 'solid_bar', heroScale: 1.15, showCta: true,
      gradientStart: 0.44, gradientEnd: 0.91, overlayOpacity: 0.52, vignette: 'radial', duotoneOpacity: 0.26,
    },
    variants: [
      { suffix: 'Offer', suffixTr: 'Teklif', patch: {} },
      { suffix: 'Wide Panel', suffixTr: 'Geniş Panel', patch: { photoRatio: 0.52, gradientStart: 0.48, overlayOpacity: 0.48 } },
      { suffix: 'Bold', suffixTr: 'Kalın', patch: {
        heroScale: 1.22, heroWeight: 900,
        gradientStart: 0.50, gradientEnd: 0.93, overlayOpacity: 0.46, duotoneOpacity: 0.2, vignette: 'radial',
      } },
      { suffix: 'Pill CTA', suffixTr: 'Pill CTA', patch: { posterFooter: 'pill_row' } },
      { suffix: 'Minimal', suffixTr: 'Minimal', patch: { posterFooter: 'transparent_bar', accentLine: 'none' } },
    ],
  },
  {
    family: 'gala_invite',
    collection: 'Luxury',
    nameTr: 'Gala Davet',
    nameEn: 'Gala Invite',
    descTr: 'Merkez tipografi + corner stamp — lüks davetiye posteri.',
    tags: ['gala', 'luxury', 'invite'],
    sectors: ['fine_dining', 'hotel_resort', 'wine_bar'],
    formats: ['story', 'portrait'],
    base: {
      family: 'gala_invite', collection: 'Luxury', posterMode: 'gala_centered',
      fontPersonality: 'serif_editorial', heroWeight: 400, heroUppercase: false,
      posterHeader: 'outline_bar', frame: 'thin', showDateBadge: true,
    },
    variants: [
      { suffix: 'Classic', suffixTr: 'Klasik', patch: {} },
      { suffix: 'Gold Bar', suffixTr: 'Altın Bar', patch: { posterHeader: 'accent_bar' } },
      { suffix: 'Double Frame', suffixTr: 'Çift Çerçeve', patch: { frame: 'double' } },
      { suffix: 'No Frame', suffixTr: 'Çerçevesiz', patch: { frame: 'none' } },
      { suffix: 'CTA Pill', suffixTr: 'CTA', patch: { showCta: true, posterFooter: 'pill_row' } },
    ],
  },
  {
    family: 'editorial_date',
    collection: 'Editorial',
    nameTr: 'Editoryal Tarih',
    nameEn: 'Editorial Date',
    descTr: 'Dev tarih watermark + editoryal stack — fashion poster.',
    tags: ['editorial', 'date', 'fashion'],
    sectors: ['fashion_retail', 'art_gallery', 'fine_dining', 'agency_services', 'professional_service'],
    formats: ['story', 'portrait', 'post'],
    base: {
      family: 'editorial_date', collection: 'Editorial', posterMode: 'editorial_date',
      fontPersonality: 'serif_editorial', showDateBadge: true, align: 'left',
      posterHeader: 'none', posterFooter: 'transparent_bar',
    },
    variants: [
      { suffix: 'Watermark', suffixTr: 'Watermark', patch: {} },
      { suffix: 'Center', suffixTr: 'Merkez', patch: { align: 'center' } },
      { suffix: 'Bold Date', suffixTr: 'Kalın Tarih', patch: { heroScale: 1.18 } },
      { suffix: 'Warm Wash', suffixTr: 'Sıcak', patch: { duotoneWash: 'warm', duotoneOpacity: 0.3 } },
      { suffix: 'No Footer', suffixTr: 'Altsız', patch: { posterFooter: 'none' } },
    ],
  },
  {
    family: 'event_masthead',
    collection: 'Event',
    nameTr: 'Event Masthead',
    nameEn: 'Event Masthead',
    descTr: 'Üst masthead bar + hero — program duyuru posteri.',
    tags: ['event', 'masthead', 'announcement'],
    sectors: ['event_venue', 'beach_club', 'hotel_resort'],
    formats: ['story', 'post', 'portrait'],
    base: {
      family: 'event_masthead', collection: 'Event', posterMode: 'masthead',
      posterHeader: 'knockout_bar', posterFooter: 'solid_bar', photoRatio: 0.48,
    },
    variants: [
      { suffix: 'Knockout', suffixTr: 'Knockout', patch: {} },
      { suffix: 'Accent Bar', suffixTr: 'Accent', patch: { posterHeader: 'accent_bar' } },
      { suffix: 'Outline', suffixTr: 'Outline', patch: { posterHeader: 'outline_bar' } },
      { suffix: 'Transparent Footer', suffixTr: 'Şeffaf Alt', patch: { posterFooter: 'transparent_bar' } },
      { suffix: 'Vignette', suffixTr: 'Vignette', patch: { vignette: 'noir' } },
    ],
  },
  {
    family: 'restaurant_feature',
    collection: 'Hospitality',
    nameTr: 'Restoran Feature',
    nameEn: 'Restaurant Feature',
    descTr: 'Yemek fotoğrafı + split panel — menü / chef spotlight.',
    tags: ['food', 'menu', 'chef'],
    sectors: ['fine_dining', 'steakhouse', 'mediterranean', 'agency_services', 'professional_service', 'moving_logistics', 'real_estate'],
    formats: ['post', 'portrait', 'story'],
    base: {
      family: 'restaurant_feature', collection: 'Hospitality', posterMode: 'promo_split',
      photoRatio: 0.62, fontPersonality: 'serif_editorial', heroUppercase: false,
      posterFooter: 'transparent_bar', panelUsesPrimary: true,
    },
    variants: [
      { suffix: 'Chef', suffixTr: 'Şef', patch: {} },
      { suffix: 'Menu', suffixTr: 'Menü', patch: { showCta: true } },
      { suffix: 'Dark Panel', suffixTr: 'Koyu Panel', patch: { vignette: 'noir' } },
      { suffix: 'Accent Line', suffixTr: 'Çizgi', patch: { accentLine: 'both' } },
      { suffix: 'Minimal', suffixTr: 'Minimal', patch: { posterHeader: 'none', accentLine: 'none' } },
    ],
  },
  {
    family: 'neon_club',
    collection: 'Nightlife',
    nameTr: 'Neon Club',
    nameEn: 'Neon Club',
    descTr: 'Full bleed neon type — gece kulübü afişi.',
    tags: ['club', 'neon', 'night'],
    sectors: ['nightclub', 'rooftop_bar', 'yacht_club'],
    formats: ['story', 'portrait'],
    base: {
      family: 'neon_club', collection: 'Nightlife', posterMode: 'dj_set',
      neonGlow: true, duotoneWash: 'accent', photoRatio: 0.38,
      fontPersonality: 'display_bold', heroScale: 1.2, vignette: 'noir',
    },
    variants: [
      { suffix: 'Full Neon', suffixTr: 'Full Neon', patch: {} },
      { suffix: 'Cool Neon', suffixTr: 'Cool', patch: { duotoneWash: 'cool' } },
      { suffix: 'Stack Lineup', suffixTr: 'Lineup', patch: { posterMode: 'lineup_stack' } },
      { suffix: 'Pill Row', suffixTr: 'Pill', patch: { posterFooter: 'pill_row' } },
      { suffix: 'Frame', suffixTr: 'Çerçeve', patch: { frame: 'thin' } },
    ],
  },
  {
    family: 'art_deco',
    collection: 'Luxury',
    nameTr: 'Art Deco',
    nameEn: 'Art Deco',
    descTr: 'Art deco çerçeve + ornament — gala / premium event.',
    tags: ['art_deco', 'gala', 'premium'],
    sectors: ['wine_bar', 'golf_club', 'hotel_resort'],
    formats: ['story', 'portrait', 'post'],
    base: {
      family: 'art_deco', collection: 'Luxury', posterMode: 'gala_centered',
      frame: 'double', fontPersonality: 'serif_editorial',
      posterHeader: 'outline_bar', accentLine: 'both', heroUppercase: true,
    },
    variants: [
      { suffix: 'Gala', suffixTr: 'Gala', patch: {} },
      { suffix: 'Gold Accent', suffixTr: 'Altın', patch: { posterHeader: 'accent_bar' } },
      { suffix: 'Knockout', suffixTr: 'Knockout', patch: { posterHeader: 'knockout_bar' } },
      { suffix: 'Date Stamp', suffixTr: 'Tarih', patch: { showDateBadge: true } },
      { suffix: 'No Frame', suffixTr: 'Sade', patch: { frame: 'none', accentLine: 'above' } },
    ],
  },
];

function mergeSpec(...layers: Partial<PosterLayoutSpec>[]): PosterLayoutSpec {
  return { ...BASE, ...Object.assign({}, ...layers) } as PosterLayoutSpec;
}

function buildTemplate(family: FamilyMeta, idx: number, v: FamilyMeta['variants'][0]): PosterTemplateDefinition {
  const vibeCollection = family.collection;
  const agencyUpgrade = AGENCY_POSTER_FAMILY_UPGRADES[family.family];
  const spec = mergeSpec(
    { family: family.family, collection: 'Agency' },
    family.base,
    agencyUpgrade ?? {},
    v.patch,
  );
  spec.collection = 'Agency';
  const nn = String(idx + 1).padStart(2, '0');
  const variantTag = v.suffix.toLowerCase().replace(/\s+/g, '_');
  return {
    id: `poster_${family.family}_${nn}`,
    family: family.family,
    collection: 'Agency',
    variantIndex: idx,
    nameTr: `${family.nameTr} · ${v.suffixTr}`,
    nameEn: `${family.nameEn} · ${v.suffix}`,
    descTr: family.descTr,
    tags: agencyPosterTags(vibeCollection, [...family.tags, variantTag]),
    formats: family.formats,
    spec,
    sectors: family.sectors,
    status: 'active',
  };
}

export const POSTER_TEMPLATE_CATALOG: PosterTemplateDefinition[] = FAMILIES.flatMap((f) =>
  f.variants.map((v, i) => buildTemplate(f, i, v)),
);

export const POSTER_TEMPLATE_BY_ID = new Map(POSTER_TEMPLATE_CATALOG.map((t) => [t.id, t]));

export const POSTER_FAMILY_META = FAMILIES.map(({ family, nameTr, nameEn, collection, descTr, tags, formats }) => ({
  family, nameTr, nameEn, collection, descTr, tags, formats, variantCount: 5,
}));

export function getPosterTemplate(id: string): PosterTemplateDefinition | undefined {
  return POSTER_TEMPLATE_BY_ID.get(id);
}

export function listPostersByFormat(format: PosterTemplateDefinition['formats'][number]) {
  return POSTER_TEMPLATE_CATALOG.filter((t) => t.formats.includes(format));
}
