/**
 * Sector vibe presets — curated 5-slot template libraries for local businesses.
 *
 * Used by deriveBrandTemplateLibrary (defaults), dropdown curation, and kit resolution.
 */
import type { RemotionLayoutFamily } from './remotion-template-types';
import type { PosterLayoutFamily } from './poster-template-types';
import { AGENCY_VIBE_PICK_TEMPLATE_IDS } from './agency-vibe-picks';
import { isAgencyStoryTemplate } from './agency-template-standard';
import { REMOTION_TEMPLATE_BY_ID } from './remotion-template-catalog';
import { POSTER_TEMPLATE_BY_ID } from './poster-template-catalog';

export type SectorVibeKey =
  | 'beauty_salon'
  | 'barber_salon'
  | 'moving_logistics'
  | 'retail'
  | 'coffee_shop'
  | 'beach_club'
  | 'agency_services';

export interface SectorVibeMeta {
  key: SectorVibeKey;
  labelTr: string;
  vibeTr: string;
  motionStyle: 'luxury' | 'editorial' | 'bold' | 'minimal' | 'playful';
  kitSector: string;
}

export interface SectorSlotPreset {
  storyTemplateId?: string;
  posterTemplateId?: string;
  storyFamilies?: RemotionLayoutFamily[];
  posterFamilies?: PosterLayoutFamily[];
}

const SLOT_KEYS = [
  'daily_story',
  'event_story',
  'campaign_post',
  'editorial_story',
  'social_proof',
  'social_proof_post',
  'ad_creative_post',
] as const;

export type BrandLibrarySlotKey = (typeof SLOT_KEYS)[number];

/** Raw business_type / industry → canonical vibe key (first match wins — coffee before retail) */
const SECTOR_VIBE_ALIASES: Array<{ match: RegExp; vibe: SectorVibeKey }> = [
  {
    match: /coffee|kahve|kafe|cafe|coffee_shop|cafe_bakery|patisserie|brunch|roastery|espresso|latte|barista/i,
    vibe: 'coffee_shop',
  },
  {
    match: /güzellik|guzellik|beauty|wellness_spa|wellness|spa|nail|estetik|cilt|kosmetik|beauty_salon/i,
    vibe: 'beauty_salon',
  },
  {
    match: /berber|barber|kuaför|kuafor|hairdress|hair_salon|saç|sac|barber_salon/i,
    vibe: 'barber_salon',
  },
  {
    match: /nakliyat|nakliye|moving|logistics|taşımac|tasimac|lojistik|freight|evden.eve|transport/i,
    vibe: 'moving_logistics',
  },
  {
    match: /perakende|retail|ecommerce|e-commerce|mağaza|magaza|butik|boutique|giyim|moda|fashion|handmade_product/i,
    vibe: 'retail',
  },
  {
    match: /saas|software|agency_services|tech_company|professional_service|berber.*panel|kuafor.*panel|rezervasyon.*yazilim|yazilim/i,
    vibe: 'agency_services',
  },
];

export const SECTOR_VIBE_META: Record<SectorVibeKey, SectorVibeMeta> = {
  beauty_salon: {
    key: 'beauty_salon',
    labelTr: 'Güzellik & Salon',
    vibeTr: 'Frosted glass · campaign hero · editorial date · magazine cover · diptych',
    motionStyle: 'luxury',
    kitSector: 'beauty_salon',
  },
  barber_salon: {
    key: 'barber_salon',
    labelTr: 'Berber & Kuaför',
    vibeTr: 'Bold tipografi · neon edge · polaroid · etkinlik bileti',
    motionStyle: 'bold',
    kitSector: 'beauty_salon',
  },
  moving_logistics: {
    key: 'moving_logistics',
    labelTr: 'Nakliyat & Lojistik',
    vibeTr: 'Konum pin · güven paneli · kampanya hero · müşteri yorumu',
    motionStyle: 'editorial',
    kitSector: 'real_estate',
  },
  retail: {
    key: 'retail',
    labelTr: 'Perakende & Mağaza',
    vibeTr: 'Mosaic grid · kampanya hero · asimetrik moda · bento vitrin',
    motionStyle: 'bold',
    kitSector: 'fashion_retail',
  },
  coffee_shop: {
    key: 'coffee_shop',
    labelTr: 'Coffee Shop & Kafe',
    vibeTr: 'Vibe fullscreen · polaroid · minimal lüks · frosted cam',
    motionStyle: 'editorial',
    kitSector: 'cafe_bakery',
  },
  beach_club: {
    key: 'beach_club',
    labelTr: 'Beach Club & Marina',
    vibeTr: 'Cinematic golden hour · campaign hero · split panel · gallery',
    motionStyle: 'luxury',
    kitSector: 'beach_club',
  },
  agency_services: {
    key: 'agency_services',
    labelTr: 'SaaS & Ajans',
    vibeTr: 'Editorial date · minimal luxury · quote card · sosyal kanıt post',
    motionStyle: 'minimal',
    kitSector: 'agency_services',
  },
};

/** Curated slot defaults per sector vibe (partial — missing keys fall back to library slot spec). */
const SECTOR_VIBE_PRESETS: Record<SectorVibeKey, Partial<Record<BrandLibrarySlotKey, SectorSlotPreset>>> = {
  beauty_salon: {
    daily_story: {
      storyTemplateId: 'remotion_glassmorphism_showcase_01',
      storyFamilies: ['glassmorphism_showcase', 'frosted_glass', 'minimal_luxury', 'asymmetric_editorial', 'vibe_fullscreen', 'quote_card'],
    },
    event_story: {
      storyTemplateId: 'remotion_luxury_kinetic_type_03',
      storyFamilies: ['luxury_kinetic_type', 'campaign_hero', 'event_ticket', 'frosted_glass', 'bold_impact'],
    },
    campaign_post: {
      posterTemplateId: 'poster_editorial_date_03',
      posterFamilies: ['editorial_date', 'gala_invite', 'restaurant_feature'],
    },
    editorial_story: {
      storyTemplateId: 'remotion_editorial_product_stage_03',
      storyFamilies: ['editorial_product_stage', 'magazine_cover', 'asymmetric_editorial', 'minimal_luxury', 'split_panel', 'noir_editorial'],
    },
    social_proof: {
      storyTemplateId: 'remotion_diptych_collage_02',
      storyFamilies: ['diptych_collage', 'quote_card', 'gallery_series', 'mosaic_pinterest', 'polaroid_stack'],
    },
  },
  barber_salon: {
    daily_story: {
      storyTemplateId: 'remotion_luxury_kinetic_type_06',
      storyFamilies: ['luxury_kinetic_type', 'bold_impact', 'editorial_bottom', 'neon_night', 'asymmetric_editorial', 'polaroid_single'],
    },
    event_story: {
      storyTemplateId: 'remotion_event_ticket_05',
      storyFamilies: ['event_ticket', 'campaign_hero', 'neon_night', 'bold_impact'],
    },
    campaign_post: {
      posterTemplateId: 'poster_promo_split_04',
      posterFamilies: ['promo_split', 'dj_night', 'neon_club', 'event_masthead'],
    },
    editorial_story: {
      storyTemplateId: 'remotion_neon_night_01',
      storyFamilies: ['luxury_kinetic_type', 'neon_night', 'asymmetric_editorial', 'bold_impact', 'magazine_cover', 'noir_editorial'],
    },
    social_proof: {
      storyTemplateId: 'remotion_polaroid_stack_03',
      storyFamilies: ['polaroid_stack', 'polaroid_single', 'bento_story', 'diptych_collage', 'quote_card'],
    },
  },
  moving_logistics: {
    daily_story: {
      storyTemplateId: 'remotion_location_pin_01',
      storyFamilies: ['location_pin', 'split_panel', 'editorial_bottom', 'frosted_glass', 'vibe_fullscreen'],
    },
    event_story: {
      storyTemplateId: 'remotion_campaign_hero_02',
      storyFamilies: ['campaign_hero', 'bold_impact', 'event_ticket', 'location_pin'],
    },
    campaign_post: {
      posterTemplateId: 'poster_restaurant_feature_02',
      posterFamilies: ['restaurant_feature', 'editorial_date', 'event_masthead', 'promo_split'],
    },
    editorial_story: {
      storyTemplateId: 'remotion_split_panel_03',
      storyFamilies: ['split_panel', 'minimal_luxury', 'asymmetric_editorial', 'editorial_bottom', 'frosted_glass'],
    },
    social_proof: {
      storyTemplateId: 'remotion_quote_card_05',
      storyFamilies: ['quote_card', 'bento_story', 'gallery_series', 'diptych_collage', 'location_pin'],
    },
  },
  retail: {
    daily_story: {
      storyTemplateId: 'remotion_editorial_product_stage_05',
      storyFamilies: ['editorial_product_stage', 'mosaic_pinterest', 'bento_story', 'asymmetric_editorial', 'minimal_luxury', 'vibe_fullscreen'],
    },
    event_story: {
      storyTemplateId: 'remotion_luxury_kinetic_type_02',
      storyFamilies: ['luxury_kinetic_type', 'campaign_hero', 'bold_impact', 'event_ticket', 'neon_night'],
    },
    campaign_post: {
      posterTemplateId: 'poster_promo_split_05',
      posterFamilies: ['promo_split', 'art_deco', 'gala_invite', 'editorial_date'],
    },
    editorial_story: {
      storyTemplateId: 'remotion_editorial_product_stage_01',
      storyFamilies: ['editorial_product_stage', 'asymmetric_editorial', 'magazine_cover', 'minimal_luxury', 'split_panel', 'noir_editorial'],
    },
    social_proof: {
      storyTemplateId: 'remotion_bento_story_07',
      storyFamilies: ['bento_story', 'mosaic_pinterest', 'diptych_collage', 'gallery_series', 'quote_card'],
    },
  },
  coffee_shop: {
    daily_story: {
      storyTemplateId: 'remotion_glassmorphism_showcase_06',
      storyFamilies: ['glassmorphism_showcase', 'vibe_fullscreen', 'polaroid_single', 'frosted_glass', 'editorial_bottom', 'minimal_luxury'],
    },
    event_story: {
      storyTemplateId: 'remotion_event_ticket_02',
      storyFamilies: ['event_ticket', 'campaign_hero', 'frosted_glass', 'bold_impact'],
    },
    campaign_post: {
      posterTemplateId: 'poster_restaurant_feature_02',
      posterFamilies: ['restaurant_feature', 'promo_split', 'editorial_date', 'gala_invite'],
    },
    editorial_story: {
      storyTemplateId: 'remotion_editorial_product_stage_06',
      storyFamilies: ['editorial_product_stage', 'minimal_luxury', 'magazine_cover', 'asymmetric_editorial', 'cinematic_center', 'noir_editorial'],
    },
    social_proof: {
      storyTemplateId: 'remotion_mosaic_pinterest_03',
      storyFamilies: ['mosaic_pinterest', 'diptych_collage', 'polaroid_stack', 'gallery_series', 'quote_card'],
    },
  },
  beach_club: {
    daily_story: {
      storyTemplateId: 'remotion_cinematic_center_04',
      storyFamilies: ['luxury_kinetic_type', 'cinematic_center', 'vibe_fullscreen', 'minimal_luxury', 'frosted_glass', 'location_pin'],
    },
    event_story: {
      storyTemplateId: 'remotion_luxury_kinetic_type_08',
      storyFamilies: ['luxury_kinetic_type', 'campaign_hero', 'event_ticket', 'bold_impact', 'neon_night'],
    },
    campaign_post: {
      posterTemplateId: 'poster_restaurant_feature_03',
      posterFamilies: ['restaurant_feature', 'editorial_date', 'gala_invite', 'promo_split'],
    },
    editorial_story: {
      storyTemplateId: 'remotion_editorial_product_stage_08',
      storyFamilies: ['editorial_product_stage', 'split_panel', 'magazine_cover', 'asymmetric_editorial', 'minimal_luxury', 'noir_editorial'],
    },
    social_proof: {
      storyTemplateId: 'remotion_gallery_series_04',
      storyFamilies: ['gallery_series', 'quote_card', 'diptych_collage', 'bento_story', 'polaroid_stack'],
    },
  },
  agency_services: {
    daily_story: {
      storyTemplateId: 'remotion_glassmorphism_showcase_02',
      storyFamilies: ['glassmorphism_showcase', 'minimal_luxury', 'split_panel', 'editorial_bottom', 'frosted_glass', 'quote_card'],
    },
    event_story: {
      storyTemplateId: 'remotion_luxury_kinetic_type_01',
      storyFamilies: ['luxury_kinetic_type', 'event_ticket', 'campaign_hero', 'minimal_luxury', 'bold_impact'],
    },
    campaign_post: {
      posterTemplateId: 'poster_editorial_date_03',
      posterFamilies: ['editorial_date', 'restaurant_feature', 'gala_invite', 'art_deco'],
    },
    editorial_story: {
      storyTemplateId: 'remotion_editorial_product_stage_03',
      storyFamilies: ['editorial_product_stage', 'magazine_cover', 'minimal_luxury', 'split_panel', 'asymmetric_editorial', 'noir_editorial'],
    },
    social_proof: {
      storyTemplateId: 'remotion_glassmorphism_showcase_08',
      storyFamilies: ['glassmorphism_showcase', 'diptych_collage', 'quote_card', 'gallery_series', 'minimal_luxury', 'polaroid_stack'],
    },
    social_proof_post: {
      posterTemplateId: 'poster_editorial_date_03',
      posterFamilies: ['editorial_date', 'restaurant_feature', 'gala_invite', 'art_deco', 'event_masthead'],
    },
    ad_creative_post: {
      posterTemplateId: 'poster_gala_invite_02',
      posterFamilies: ['gala_invite', 'editorial_date', 'restaurant_feature', 'art_deco', 'event_masthead'],
    },
  },
};

const AGENCY_PICK_SET = new Set<string>(AGENCY_VIBE_PICK_TEMPLATE_IDS);

export function normalizeSectorVibe(sector: string | null | undefined): SectorVibeKey | null {
  const raw = (sector ?? '').trim();
  if (!raw) return null;
  const norm = raw.toLowerCase().replace(/\s+/g, '_');
  for (const { match, vibe } of SECTOR_VIBE_ALIASES) {
    if (match.test(raw) || match.test(norm)) return vibe;
  }
  if (norm in SECTOR_VIBE_PRESETS) return norm as SectorVibeKey;
  return null;
}

export function getSectorVibeMeta(sector: string): SectorVibeMeta | null {
  const vibe = normalizeSectorVibe(sector);
  return vibe ? SECTOR_VIBE_META[vibe] : null;
}

export function resolveKitSectorForVibe(sector: string): string {
  const meta = getSectorVibeMeta(sector);
  return meta?.kitSector ?? sector;
}

export function getSectorSlotPreset(
  sector: string,
  slotKey: string,
): SectorSlotPreset | undefined {
  const vibe = normalizeSectorVibe(sector);
  if (!vibe) return undefined;
  return SECTOR_VIBE_PRESETS[vibe][slotKey as BrandLibrarySlotKey];
}

export function getSectorSlotStoryFamilies(
  sector: string,
  slotKey: string,
  fallback: RemotionLayoutFamily[] | undefined,
): RemotionLayoutFamily[] | undefined {
  const preset = getSectorSlotPreset(sector, slotKey);
  return preset?.storyFamilies ?? fallback;
}

export function getSectorSlotPosterFamilies(
  sector: string,
  slotKey: string,
  fallback: PosterLayoutFamily[] | undefined,
): PosterLayoutFamily[] | undefined {
  const preset = getSectorSlotPreset(sector, slotKey);
  return preset?.posterFamilies ?? fallback;
}

/** Story template IDs for dropdown — sector curated first, then agency picks, then pool */
export function getSectorCuratedStoryIds(sector: string, slotKey: string): string[] {
  const preset = getSectorSlotPreset(sector, slotKey);
  const families = preset?.storyFamilies ?? [];
  const ids: string[] = [];
  if (preset?.storyTemplateId && REMOTION_TEMPLATE_BY_ID.has(preset.storyTemplateId)) {
    ids.push(preset.storyTemplateId);
  }
  for (const pick of AGENCY_VIBE_PICK_TEMPLATE_IDS) {
    if (ids.includes(pick)) continue;
    const tpl = REMOTION_TEMPLATE_BY_ID.get(pick);
    if (tpl && families.includes(tpl.family)) ids.push(pick);
  }
  return ids;
}

export function getSectorCuratedPosterIds(sector: string, slotKey: string): string[] {
  const preset = getSectorSlotPreset(sector, slotKey);
  const ids: string[] = [];
  if (preset?.posterTemplateId && POSTER_TEMPLATE_BY_ID.has(preset.posterTemplateId)) {
    ids.push(preset.posterTemplateId);
  }
  return ids;
}

export function isAgencyVibePickTemplateId(templateId: string): boolean {
  const tpl = REMOTION_TEMPLATE_BY_ID.get(templateId);
  if (tpl && isAgencyStoryTemplate(tpl)) return true;
  return AGENCY_PICK_SET.has(templateId);
}
