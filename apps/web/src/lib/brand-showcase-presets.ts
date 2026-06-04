/**
 * Remotion showcase vibes — gerçek markalar + sektör/motion stili kombinasyonları.
 * Her preset: renk, font, copy ve foto havuzu ile aynı şablonu farklı hissiyatla önizletir.
 */
import type { AgencyBrandKit } from './remotion-template-types';
import { AGENCY_BRAND_KITS, getBrandKit } from './agency-brand-kits';
import type { MotionStyle } from './brand-motion-profile';
import { pickVerifiedPhotoPool } from './remotion-template-registry';

export type ShowcasePresetGroup = 'real_brand' | 'sector_vibe';

export interface BrandShowcasePreset extends AgencyBrandKit {
  brandName: string;
  location: string;
  /** Tenant logo — yoksa demo SVG wordmark üretilir */
  logoUrl?: string;
  storyPhotoUrls: string[];
  /** brand=1 katalog türetimi için kit id */
  catalogKitId: string;
  vibeLabel: string;
  vibeDesc: string;
  presetGroup: ShowcasePresetGroup;
}

/** Remotion headless render — external görselleri media-proxy üzerinden yükle */
export function resolveShowcasePhotoForRender(photoUrl: string, baseUrl: string): string {
  const trimmed = photoUrl.trim();
  if (!trimmed || trimmed.startsWith('data:')) return trimmed;
  const origin = baseUrl.replace(/\/$/, '');
  if (trimmed.startsWith('/')) return `${origin}${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) {
    return `${origin}/api/media-proxy?url=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}

export function resolveShowcasePhotosForRender(urls: string[], baseUrl: string): string[] {
  return urls.map((url) => resolveShowcasePhotoForRender(url, baseUrl));
}

export const YULA_BODRUM_PRESET: BrandShowcasePreset = {
  id: 'preset_yula_bodrum',
  name: 'Yula Bodrum',
  brandName: 'YULA BODRUM',
  location: 'Bodrum',
  sector: 'beach_club',
  locale: 'tr',
  primaryColor: '#2b2b2b',
  accentColor: '#f5a25d',
  textColor: '#f3f1e7',
  headingFont: 'Syne',
  bodyFont: 'DM Sans',
  motionStyle: 'luxury',
  templateIds: [],
  showcaseHeadline: 'Gün Batımında Yula',
  showcaseSubtitle: 'Ege · Bodrum',
  showcaseCategory: 'YULA',
  catalogKitId: 'kit_01_beach_club',
  vibeLabel: 'Mediterranean Beach',
  vibeDesc: 'Sıcak turuncu · deniz · golden hour',
  presetGroup: 'real_brand',
  storyPhotoUrls: [
    'https://yulabodrum.com/galeri/1.webp',
    'https://yulabodrum.com/galeri/4.webp',
    'https://yulabodrum.com/galeri/6.webp',
    'https://yulabodrum.com/galeri/9.webp',
    'https://yulabodrum.com/galeri/14.webp',
    'https://yulabodrum.com/galeri/15.webp',
    'https://yulabodrum.com/galeri/19.webp',
  ],
};

export const BRAND_SHOWCASE_PRESETS: Record<string, BrandShowcasePreset> = {
  yula_bodrum: YULA_BODRUM_PRESET,

  vibe_luxury_hotel: {
    id: 'preset_vibe_luxury_hotel',
    name: 'Luxury Hotel',
    brandName: 'GRAND AEGEAN',
    location: 'Bodrum',
    sector: 'hotel_resort',
    locale: 'tr',
    primaryColor: '#1c1917',
    accentColor: '#d4a574',
    textColor: '#fafaf9',
    headingFont: 'Bodoni Moda',
    bodyFont: 'Manrope',
    motionStyle: 'luxury',
    templateIds: [],
    showcaseHeadline: 'Kaçış Başlasın',
    showcaseSubtitle: 'Premium konaklama · Ege',
    showcaseCategory: 'STAY',
    catalogKitId: 'kit_03_hotel_resort',
    vibeLabel: 'Luxury Resort',
    vibeDesc: 'Serif hero · split panel · altın accent',
    presetGroup: 'sector_vibe',
    storyPhotoUrls: pickVerifiedPhotoPool(5, 7),
  },

  vibe_fine_dining: {
    id: 'preset_vibe_fine_dining',
    name: 'Fine Dining',
    brandName: 'MAISON TABLE',
    location: 'İstanbul',
    sector: 'fine_dining',
    locale: 'tr',
    primaryColor: '#0d1117',
    accentColor: '#c9a96e',
    textColor: '#ffffff',
    headingFont: 'Cormorant Garamond',
    bodyFont: 'Libre Baskerville',
    motionStyle: 'luxury',
    templateIds: [],
    showcaseHeadline: 'Şefin Seçimi',
    showcaseSubtitle: 'Mevsimsel tadım menüsü',
    showcaseCategory: 'TASTING',
    catalogKitId: 'kit_02_fine_dining',
    vibeLabel: 'Fine Dining',
    vibeDesc: 'Editorial serif · minimal overlay · noir gradient',
    presetGroup: 'sector_vibe',
    storyPhotoUrls: pickVerifiedPhotoPool(0, 7),
  },

  vibe_night_bold: {
    id: 'preset_vibe_night_bold',
    name: 'Night & DJ',
    brandName: 'PULSE CLUB',
    location: 'İstanbul',
    sector: 'nightclub',
    locale: 'tr',
    primaryColor: '#1e1b4b',
    accentColor: '#a78bfa',
    textColor: '#ffffff',
    headingFont: 'Archivo Black',
    bodyFont: 'Barlow Condensed',
    motionStyle: 'bold',
    templateIds: [],
    showcaseHeadline: 'Gece Canlanıyor',
    showcaseSubtitle: 'DJ set · VIP',
    showcaseCategory: 'NIGHT',
    catalogKitId: 'kit_04_nightclub',
    vibeLabel: 'Nightlife Bold',
    vibeDesc: 'Display uppercase · neon duotone · event ticket',
    presetGroup: 'sector_vibe',
    storyPhotoUrls: pickVerifiedPhotoPool(7, 7),
  },

  vibe_editorial_cafe: {
    id: 'preset_vibe_editorial_cafe',
    name: 'Editorial Café',
    brandName: 'SLOW ROAST',
    location: 'Karaköy',
    sector: 'cafe_bakery',
    locale: 'tr',
    primaryColor: '#292524',
    accentColor: '#fcd34d',
    textColor: '#ffffff',
    headingFont: 'Fraunces',
    bodyFont: 'Lora',
    motionStyle: 'editorial',
    templateIds: [],
    showcaseHeadline: 'Sabah Ritüeli',
    showcaseSubtitle: 'Single origin · artisan',
    showcaseCategory: 'CAFÉ',
    catalogKitId: 'kit_06_cafe_bakery',
    vibeLabel: 'Editorial Café',
    vibeDesc: 'Warm serif · polaroid stack · daily story',
    presetGroup: 'sector_vibe',
    storyPhotoUrls: pickVerifiedPhotoPool(10, 7),
  },

  vibe_minimal_spa: {
    id: 'preset_vibe_minimal_spa',
    name: 'Minimal Spa',
    brandName: 'STILL WELLNESS',
    location: 'Alaçatı',
    sector: 'wellness_spa',
    locale: 'tr',
    primaryColor: '#134e4a',
    accentColor: '#86efac',
    textColor: '#ffffff',
    headingFont: 'DM Sans',
    bodyFont: 'Outfit',
    motionStyle: 'minimal',
    templateIds: [],
    showcaseHeadline: 'Nefes Al',
    showcaseSubtitle: 'Spa · mindfulness',
    showcaseCategory: 'WELLNESS',
    catalogKitId: 'kit_07_wellness_spa',
    vibeLabel: 'Minimal Wellness',
    vibeDesc: 'Az metin · soft gradient · minimal luxury',
    presetGroup: 'sector_vibe',
    storyPhotoUrls: pickVerifiedPhotoPool(12, 7),
  },

  vibe_playful_brunch: {
    id: 'preset_vibe_playful_brunch',
    name: 'Playful Brunch',
    brandName: 'SUNNY PLATE',
    location: 'Moda',
    sector: 'brunch',
    locale: 'tr',
    primaryColor: '#450a0a',
    accentColor: '#fca5a5',
    textColor: '#ffffff',
    headingFont: 'Space Grotesk',
    bodyFont: 'Outfit',
    motionStyle: 'playful',
    templateIds: [],
    showcaseHeadline: 'Pazar Brunch',
    showcaseSubtitle: 'Renkli tabak · good vibes',
    showcaseCategory: 'BRUNCH',
    catalogKitId: 'kit_23_brunch',
    vibeLabel: 'Playful Brunch',
    vibeDesc: 'Enerjik sans · mosaic grid · campaign hero',
    presetGroup: 'sector_vibe',
    storyPhotoUrls: pickVerifiedPhotoPool(14, 7),
  },

  vibe_rooftop_cocktail: {
    id: 'preset_vibe_rooftop_cocktail',
    name: 'Rooftop Bar',
    brandName: 'SKYLINE',
    location: 'Bebek',
    sector: 'rooftop_bar',
    locale: 'tr',
    primaryColor: '#0c4a6e',
    accentColor: '#38bdf8',
    textColor: '#ffffff',
    headingFont: 'Syne',
    bodyFont: 'DM Sans',
    motionStyle: 'bold',
    templateIds: [],
    showcaseHeadline: 'Şehir Işıkları',
    showcaseSubtitle: 'Cocktail · skyline',
    showcaseCategory: 'ROOFTOP',
    catalogKitId: 'kit_05_rooftop_bar',
    vibeLabel: 'Rooftop Cocktail',
    vibeDesc: 'Cool blue · asymmetric panel · cinematic',
    presetGroup: 'sector_vibe',
    storyPhotoUrls: pickVerifiedPhotoPool(3, 7),
  },
};

export const SHOWCASE_VIBE_GROUPS: {
  id: ShowcasePresetGroup;
  labelTr: string;
}[] = [
  { id: 'real_brand', labelTr: 'Gerçek marka' },
  { id: 'sector_vibe', labelTr: 'Sektör vibe' },
];

export const MOTION_STYLE_LABELS: Record<MotionStyle, string> = {
  minimal: 'Minimal',
  editorial: 'Editorial',
  luxury: 'Luxury',
  bold: 'Bold',
  playful: 'Playful',
};

export type ShowcaseBrandContext = AgencyBrandKit & {
  brandName?: string;
  location?: string;
  storyPhotoUrls?: string[];
  presetKey?: string;
  vibeLabel?: string;
  vibeDesc?: string;
};

export function listShowcasePresets(): BrandShowcasePreset[] {
  return Object.values(BRAND_SHOWCASE_PRESETS);
}

export function listShowcasePresetEntries(): Array<[string, BrandShowcasePreset]> {
  return Object.entries(BRAND_SHOWCASE_PRESETS);
}

export function listShowcasePresetEntriesByGroup(
  group: ShowcasePresetGroup,
): Array<[string, BrandShowcasePreset]> {
  return listShowcasePresetEntries().filter(([, p]) => p.presetGroup === group);
}

export function getShowcasePreset(key: string): BrandShowcasePreset | undefined {
  return BRAND_SHOWCASE_PRESETS[key];
}

export function resolveShowcaseBrandKit(input: {
  kitId?: string;
  presetKey?: string | null;
}): ShowcaseBrandContext {
  const preset = input.presetKey ? BRAND_SHOWCASE_PRESETS[input.presetKey] : undefined;
  if (preset) return { ...preset, presetKey: input.presetKey! };

  const kit = getBrandKit(input.kitId ?? '') ?? AGENCY_BRAND_KITS[0]!;
  return kit;
}

export function showcaseKitIdForCatalog(presetKey?: string | null, kitId?: string): string {
  const preset = presetKey ? BRAND_SHOWCASE_PRESETS[presetKey] : undefined;
  if (preset?.catalogKitId) return preset.catalogKitId;
  return kitId ?? 'kit_01_beach_club';
}

/** URL query string suffix for preset-aware links */
export function showcasePresetQuery(presetKey?: string | null, extra?: Record<string, string>): string {
  const params = new URLSearchParams(extra ?? {});
  if (presetKey) params.set('preset', presetKey);
  const s = params.toString();
  return s ? `?${s}` : '';
}
