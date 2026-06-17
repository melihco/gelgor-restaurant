/**
 * Remotion showcase vibes — gerçek markalar + sektör/motion stili kombinasyonları.
 * Her preset: renk, font, copy ve foto havuzu ile aynı şablonu farklı hissiyatla önizletir.
 */
import type { AgencyBrandKit } from './remotion-template-types';
import { AGENCY_BRAND_KITS, getBrandKit } from './agency-brand-kits';
import type { MotionStyle } from './brand-motion-profile';
import { pickBeachClubPhotoPool, pickBeautySalonPhotoPool, pickVerifiedPhotoPool } from './remotion-template-registry';

export type ShowcasePresetGroup = 'real_brand' | 'sector_vibe' | 'local_business';

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
  primaryColor: '#0f172a',
  accentColor: '#f97316',
  textColor: '#fff7ed',
  headingFont: 'Bodoni Moda',
  bodyFont: 'Manrope',
  motionStyle: 'luxury',
  templateIds: [],
  showcaseHeadline: 'Gün Batımında\nYula',
  showcaseSubtitle: 'Ege · Bodrum · beach club',
  showcaseCategory: 'YULA',
  catalogKitId: 'kit_01_beach_club',
  vibeLabel: 'Mediterranean Beach',
  vibeDesc: 'Cinematic golden hour · split panel · editorial date post',
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

  vibe_beach_club: {
    id: 'preset_vibe_beach_club',
    name: 'Beach Club',
    brandName: 'AZURE COAST',
    location: 'Bodrum',
    sector: 'beach_club',
    locale: 'tr',
    primaryColor: '#0f172a',
    accentColor: '#fb923c',
    textColor: '#fff7ed',
    headingFont: 'Bodoni Moda',
    bodyFont: 'Manrope',
    motionStyle: 'luxury',
    templateIds: [],
    showcaseHeadline: 'Golden\nHour Ritüeli',
    showcaseSubtitle: 'Deniz kenarı · sunset lounge',
    showcaseCategory: 'BEACH',
    catalogKitId: 'kit_01_beach_club',
    vibeLabel: 'Beach Club Premium',
    vibeDesc: 'Vibe fullscreen · campaign hero · magazine cover · gallery proof',
    presetGroup: 'sector_vibe',
    storyPhotoUrls: pickBeachClubPhotoPool(0, 7),
  },

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
    vibeDesc: 'Frosted cam · vibe fullscreen · quote · 5 farklı layout',
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
    headingFont: 'Baloo 2',
    bodyFont: 'Nunito',
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

  vibe_beauty_salon: {
    id: 'preset_vibe_beauty_salon',
    name: 'Güzellik Salonu',
    brandName: 'AURA STUDIO',
    location: 'Nişantaşı',
    sector: 'beauty_salon',
    locale: 'tr',
    primaryColor: '#1a1218',
    accentColor: '#e8b4b8',
    textColor: '#fdf2f8',
    headingFont: 'Cormorant Garamond',
    bodyFont: 'Lora',
    motionStyle: 'luxury',
    templateIds: [],
    showcaseHeadline: 'Işıltını\nKeşfet',
    showcaseSubtitle: 'Cilt · saç · manikür',
    showcaseCategory: 'GLOW',
    catalogKitId: 'kit_27_beauty_salon',
    vibeLabel: 'Beauty Salon Premium',
    vibeDesc: 'Frosted glass · campaign hero · editorial date · magazine cover · diptych proof',
    presetGroup: 'local_business',
    storyPhotoUrls: pickBeautySalonPhotoPool(0, 7),
  },

  vibe_barber_salon: {
    id: 'preset_vibe_barber_salon',
    name: 'Berber & Kuaför',
    brandName: 'IRON CUT',
    location: 'Kadıköy',
    sector: 'barber_salon',
    locale: 'tr',
    primaryColor: '#0d1117',
    accentColor: '#e8c547',
    textColor: '#ffffff',
    headingFont: 'Unbounded',
    bodyFont: 'Plus Jakarta Sans',
    motionStyle: 'bold',
    templateIds: [],
    showcaseHeadline: 'Fresh\nCut',
    showcaseSubtitle: 'Randevu · walk-in',
    showcaseCategory: 'STYLE',
    catalogKitId: 'kit_27_beauty_salon',
    vibeLabel: 'Barber Bold',
    vibeDesc: 'Unbounded · bubble bold impact · neon edge',
    presetGroup: 'local_business',
    storyPhotoUrls: pickVerifiedPhotoPool(4, 7),
  },

  vibe_moving_logistics: {
    id: 'preset_vibe_moving_logistics',
    name: 'Nakliyat',
    brandName: 'PETEK NAKLİYAT',
    location: 'İstanbul',
    sector: 'nakliyat',
    locale: 'tr',
    primaryColor: '#1a2b4a',
    accentColor: '#38bdf8',
    textColor: '#ffffff',
    headingFont: 'Syne',
    bodyFont: 'DM Sans',
    motionStyle: 'editorial',
    templateIds: [],
    showcaseHeadline: 'Güvenli\nTaşıma',
    showcaseSubtitle: 'Sigortalı · profesyonel ekip',
    showcaseCategory: 'MOVE',
    catalogKitId: 'kit_10_real_estate',
    vibeLabel: 'Moving & Logistics',
    vibeDesc: 'Location pin · split panel · müşteri yorumu',
    presetGroup: 'local_business',
    storyPhotoUrls: pickVerifiedPhotoPool(6, 7),
  },

  vibe_retail_store: {
    id: 'preset_vibe_retail_store',
    name: 'Perakende',
    brandName: 'ATELIER NOIR',
    location: 'İstinye Park',
    sector: 'perakende',
    locale: 'tr',
    primaryColor: '#1c1917',
    accentColor: '#d4a574',
    textColor: '#fafaf9',
    headingFont: 'Cormorant Garamond',
    bodyFont: 'Manrope',
    motionStyle: 'luxury',
    templateIds: [],
    showcaseHeadline: 'Yeni\nSezon',
    showcaseSubtitle: 'Sınırlı koleksiyon',
    showcaseCategory: 'DROP',
    catalogKitId: 'kit_08_fashion_retail',
    vibeLabel: 'Retail Fashion',
    vibeDesc: 'Mosaic grid · asymmetric · bento vitrin',
    presetGroup: 'local_business',
    storyPhotoUrls: pickVerifiedPhotoPool(8, 7),
  },

  vibe_coffee_shop: {
    id: 'preset_vibe_coffee_shop',
    name: 'Coffee Shop',
    brandName: 'SLOW ROAST LAB',
    location: 'Cihangir',
    sector: 'coffee_shop',
    locale: 'tr',
    primaryColor: '#292524',
    accentColor: '#fcd34d',
    textColor: '#ffffff',
    headingFont: 'Baloo 2',
    bodyFont: 'Nunito',
    motionStyle: 'editorial',
    templateIds: [],
    showcaseHeadline: 'Single\nOrigin',
    showcaseSubtitle: 'Pour over · artisan',
    showcaseCategory: 'CAFÉ',
    catalogKitId: 'kit_06_cafe_bakery',
    vibeLabel: 'Specialty Coffee',
    vibeDesc: 'Baloo 2 · sticker vibe fullscreen · polaroid',
    presetGroup: 'local_business',
    storyPhotoUrls: pickVerifiedPhotoPool(10, 7),
  },
};

export const SHOWCASE_VIBE_GROUPS: {
  id: ShowcasePresetGroup;
  labelTr: string;
}[] = [
  { id: 'real_brand', labelTr: 'Gerçek marka' },
  { id: 'local_business', labelTr: 'Yerel işletme (premium)' },
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
