/**
 * Sector collection packages — curated announcement templates per brand industry.
 * Aligns with backend `industry_playbooks.py` IDs.
 */

import type {
  AnnouncementLibraryPreferences,
  AnnouncementTemplateId,
} from './announcement-template-types';

export type SectorId =
  | 'beach_club'
  | 'restaurant_cafe'
  | 'coffee_shop'
  | 'beauty_wellness'
  | 'healthcare_clinic'
  | 'real_estate'
  | 'ecommerce_retail'
  | 'agency_services'
  | 'local_service_business'
  | 'local_products_shop';

export interface SectorCollectionPackage {
  id: SectorId;
  labelTr: string;
  labelEn: string;
  icon: string;
  descriptionTr: string;
  creativeDirectionTr: string;
  defaultPreferences: AnnouncementLibraryPreferences;
  /** Curated templates for sector-pack filter */
  templateIds: AnnouncementTemplateId[];
  picks: {
    event: AnnouncementTemplateId[];
    campaign: AnnouncementTemplateId[];
    announcement: AnnouncementTemplateId[];
  };
}

const SECTOR_ALIASES: Record<string, SectorId> = {
  restaurant: 'restaurant_cafe',
  bistro: 'restaurant_cafe',
  restoran: 'restaurant_cafe',
  brunch: 'restaurant_cafe',
  coffee_shop: 'coffee_shop',
  cafe: 'coffee_shop',
  kahve: 'coffee_shop',
  espresso_bar: 'coffee_shop',
  roastery: 'coffee_shop',
  cafe_bakery: 'coffee_shop',
  hospitality: 'restaurant_cafe',
  hotel: 'restaurant_cafe',
  resort: 'restaurant_cafe',
  beauty: 'beauty_wellness',
  wellness: 'beauty_wellness',
  health: 'healthcare_clinic',
  healthcare: 'healthcare_clinic',
  clinic: 'healthcare_clinic',
  medical: 'healthcare_clinic',
  mental_health_clinic: 'healthcare_clinic',
  property: 'real_estate',
  ecommerce: 'ecommerce_retail',
  retail: 'ecommerce_retail',
  handmade_product_brand: 'ecommerce_retail',
  agency: 'agency_services',
  web_agency: 'agency_services',
  production_company: 'agency_services',
  service: 'local_service_business',
  general_business: 'local_service_business',
  business: 'local_service_business',
  local_products: 'local_products_shop',
  yöresel_ürün: 'local_products_shop',
  yoresel_urun: 'local_products_shop',
  artisan_food: 'local_products_shop',
  food_retail: 'local_products_shop',
  local_food_shop: 'local_products_shop',
  grocery: 'local_products_shop',
  bar: 'beach_club',
  nightclub: 'beach_club',
  club: 'beach_club',
};

export const SECTOR_COLLECTIONS: SectorCollectionPackage[] = [
  {
    id: 'beach_club',
    labelTr: 'Beach Club & Gece',
    labelEn: 'Beach Club & Nightlife',
    icon: '🌊',
    descriptionTr: 'DJ set, pool party, sunset session, konser lineup ve yaz sezonu duyuruları.',
    creativeDirectionTr: 'Neon gece, konser lineup, impact tipografi, kampanya bandı — fotoğraf ön planda, enerji yüksek.',
    defaultPreferences: {
      event: 'agency_concert_lineup_01',
      campaign: 'agency_offer_band_01',
      announcement: 'agency_corner_stamp_01',
      defaultFormat: 'story',
    },
    picks: {
      event: [
        'agency_concert_lineup_01', 'agency_concert_lineup_08', 'agency_dj_night_01',
        'agency_dj_night_04', 'agency_festival_poster_01', 'agency_festival_poster_02',
        'agency_neon_night_01', 'agency_neon_night_06', 'agency_luxury_bottom_01',
        'agency_impact_vignette_01', 'agency_gala_invite_01',
      ],
      campaign: [
        'agency_promo_banner_01', 'agency_promo_banner_05', 'agency_offer_band_01',
        'agency_offer_band_03', 'agency_color_split_01', 'agency_campaign_badge_06',
      ],
      announcement: [
        'agency_corner_stamp_01', 'agency_corner_stamp_10', 'agency_frosted_panel_01',
        'agency_magazine_date_05', 'agency_gala_invite_10',
      ],
    },
    templateIds: [],
  },
  {
    id: 'restaurant_cafe',
    labelTr: 'Restoran & Kafe',
    labelEn: 'Restaurant & Cafe',
    icon: '🍽',
    descriptionTr: 'Chef tabakları, brunch, özel menü günleri, gala daveti ve rezervasyon duyuruları.',
    creativeDirectionTr: 'Davetiye script, gala invite, mühür tarih, soft frosted — sıcak ve davetkar.',
    defaultPreferences: {
      event: 'agency_script_luxe_01',
      campaign: 'agency_offer_band_01',
      announcement: 'agency_frosted_panel_02',
      defaultFormat: 'story',
    },
    picks: {
      event: [
        'agency_script_luxe_01', 'agency_script_luxe_04', 'agency_gala_invite_01',
        'agency_gala_invite_04', 'agency_corner_stamp_10',
        'agency_luxury_bottom_01', 'agency_top_masthead_02', 'agency_frame_classic_01',
      ],
      campaign: [
        'agency_promo_banner_01', 'agency_offer_band_01', 'agency_campaign_badge_01',
        'agency_color_split_01', 'agency_offer_band_05',
      ],
      announcement: [
        'agency_frosted_panel_02', 'agency_editorial_left_01', 'agency_minimal_whisper_03',
        'agency_corner_stamp_10', 'agency_gala_invite_10',
      ],
    },
    templateIds: [],
  },
  {
    id: 'coffee_shop',
    labelTr: 'Kahve Dükkanı',
    labelEn: 'Coffee Shop',
    icon: '☕',
    descriptionTr: 'Latte art, yeni çekirdek, sabah ritüeli, seasonal içecek ve cozy corner duyuruları.',
    creativeDirectionTr: 'Minimal whisper, frosted panel, editorial — sıcak, samimi, ürün odaklı.',
    defaultPreferences: {
      event: 'agency_minimal_whisper_03',
      campaign: 'agency_campaign_badge_01',
      announcement: 'agency_frosted_panel_02',
      defaultFormat: 'story',
    },
    picks: {
      event: [
        'agency_minimal_whisper_03', 'agency_frosted_panel_02', 'agency_editorial_left_01',
        'agency_corner_stamp_10', 'agency_frame_classic_01',
      ],
      campaign: [
        'agency_campaign_badge_01', 'agency_offer_band_05', 'agency_color_split_05',
        'agency_promo_banner_01',
      ],
      announcement: [
        'agency_frosted_panel_02', 'agency_minimal_whisper_03', 'agency_editorial_left_08',
        'agency_corner_stamp_04',
      ],
    },
    templateIds: [],
  },
  {
    id: 'beauty_wellness',
    labelTr: 'Güzellik & Wellness',
    labelEn: 'Beauty & Wellness',
    icon: '✨',
    descriptionTr: 'Treatment launch, sezon kampanyası, randevu ve bakım duyuruları.',
    creativeDirectionTr: 'Script lüks, frosted panel, ince minimal — zarif ve sakin.',
    defaultPreferences: {
      event: 'agency_script_luxe_04',
      campaign: 'agency_campaign_badge_04',
      announcement: 'agency_minimal_whisper_03',
      defaultFormat: 'story',
    },
    picks: {
      event: [
        'agency_script_luxe_01', 'agency_script_luxe_04', 'agency_frame_classic_01',
        'agency_luxury_bottom_08', 'agency_frosted_panel_02',
      ],
      campaign: [
        'agency_campaign_badge_04', 'agency_offer_band_05', 'agency_color_split_05',
        'agency_frosted_panel_06',
      ],
      announcement: [
        'agency_minimal_whisper_03', 'agency_editorial_left_08', 'agency_frosted_panel_04',
        'agency_frame_classic_07',
      ],
    },
    templateIds: [],
  },
  {
    id: 'healthcare_clinic',
    labelTr: 'Sağlık & Klinik',
    labelEn: 'Healthcare & Clinic',
    icon: '🏥',
    descriptionTr: 'Hizmet duyurusu, bilgilendirme, randevu hatırlatma — güven veren ton.',
    creativeDirectionTr: 'Minimal şerit, editoryal sol, soft frosted — sade ve okunaklı.',
    defaultPreferences: {
      event: 'agency_minimal_whisper_01',
      campaign: 'agency_editorial_left_04',
      announcement: 'agency_frosted_panel_04',
      defaultFormat: 'story',
    },
    picks: {
      event: [
        'agency_minimal_whisper_01', 'agency_minimal_whisper_04', 'agency_editorial_left_01',
        'agency_frosted_panel_04', 'agency_luxury_bottom_06',
      ],
      campaign: [
        'agency_editorial_left_04', 'agency_campaign_badge_05', 'agency_color_split_05',
        'agency_frame_classic_07',
      ],
      announcement: [
        'agency_frosted_panel_04', 'agency_minimal_whisper_06', 'agency_editorial_left_06',
        'agency_frame_classic_03',
      ],
    },
    templateIds: [],
  },
  {
    id: 'real_estate',
    labelTr: 'Gayrimenkul',
    labelEn: 'Real Estate',
    icon: '🏠',
    descriptionTr: 'Proje lansmanı, açık ev, yeni portföy — premium ve net.',
    creativeDirectionTr: 'Magazine tarih, çerçeve, sol panel split — kurumsal güven.',
    defaultPreferences: {
      event: 'agency_magazine_date_01',
      campaign: 'agency_color_split_02',
      announcement: 'agency_frame_classic_05',
      defaultFormat: 'story',
    },
    picks: {
      event: [
        'agency_magazine_date_01', 'agency_magazine_date_03', 'agency_frame_classic_05',
        'agency_luxury_bottom_01', 'agency_top_masthead_01',
      ],
      campaign: [
        'agency_color_split_02', 'agency_color_split_03', 'agency_campaign_badge_03',
        'agency_offer_band_04',
      ],
      announcement: [
        'agency_frame_classic_05', 'agency_editorial_left_01', 'agency_minimal_whisper_06',
        'agency_luxury_bottom_05',
      ],
    },
    templateIds: [],
  },
  {
    id: 'ecommerce_retail',
    labelTr: 'E-ticaret & Perakende',
    labelEn: 'Ecommerce & Retail',
    icon: '🛍',
    descriptionTr: 'Sezon indirimi, yeni koleksiyon, flash sale, promo banner — dönüşüm odaklı.',
    creativeDirectionTr: 'Promo banner, kampanya bandı, rozet, impact hero — teklif net görünmeli.',
    defaultPreferences: {
      event: 'agency_impact_vignette_01',
      campaign: 'agency_promo_banner_01',
      announcement: 'agency_campaign_badge_01',
      defaultFormat: 'story',
    },
    picks: {
      event: [
        'agency_impact_vignette_01', 'agency_impact_vignette_06', 'agency_color_split_01',
        'agency_top_masthead_04',
      ],
      campaign: [
        'agency_promo_banner_01', 'agency_promo_banner_03', 'agency_promo_banner_06',
        'agency_offer_band_01', 'agency_offer_band_03', 'agency_campaign_badge_01',
        'agency_color_split_01', 'agency_neon_night_05',
      ],
      announcement: [
        'agency_campaign_badge_04', 'agency_minimal_whisper_01', 'agency_magazine_date_05',
        'agency_offer_band_06', 'agency_promo_banner_10',
      ],
    },
    templateIds: [],
  },
  {
    id: 'agency_services',
    labelTr: 'Ajans & Profesyonel',
    labelEn: 'Agency & Professional',
    icon: '💼',
    descriptionTr: 'Case study, webinar, hizmet lansmanı — editoryal ve ciddi.',
    creativeDirectionTr: 'Editoryal sol, magazine watermark, minimal — B2B güvenilirlik.',
    defaultPreferences: {
      event: 'agency_editorial_left_01',
      campaign: 'agency_magazine_date_02',
      announcement: 'agency_minimal_whisper_01',
      defaultFormat: 'post',
    },
    picks: {
      event: [
        'agency_editorial_left_01', 'agency_magazine_date_02', 'agency_top_masthead_04',
        'agency_frame_classic_07', 'agency_frosted_panel_04',
      ],
      campaign: [
        'agency_magazine_date_02', 'agency_color_split_03', 'agency_campaign_badge_05',
        'agency_editorial_left_05',
      ],
      announcement: [
        'agency_minimal_whisper_01', 'agency_editorial_left_06', 'agency_frosted_panel_06',
        'agency_frame_classic_03',
      ],
    },
    templateIds: [],
  },
  {
    id: 'local_service_business',
    labelTr: 'Yerel Hizmet',
    labelEn: 'Local Service',
    icon: '📍',
    descriptionTr: 'Randevu, kampanya, mahalle duyurusu — yerel güven.',
    creativeDirectionTr: 'Köşe mühür, renk paneli, editoryal — net ve samimi.',
    defaultPreferences: {
      event: 'agency_corner_stamp_01',
      campaign: 'agency_color_split_01',
      announcement: 'agency_editorial_left_01',
      defaultFormat: 'story',
    },
    picks: {
      event: [
        'agency_corner_stamp_01', 'agency_luxury_bottom_01', 'agency_top_masthead_01',
        'agency_campaign_badge_02',
      ],
      campaign: [
        'agency_color_split_01', 'agency_offer_band_04', 'agency_campaign_badge_02',
        'agency_offer_band_01',
      ],
      announcement: [
        'agency_editorial_left_01', 'agency_minimal_whisper_05', 'agency_frosted_panel_01',
        'agency_corner_stamp_04',
      ],
    },
    templateIds: [],
  },
  {
    id: 'local_products_shop',
    labelTr: 'Yöresel Ürün & Artisan',
    labelEn: 'Local Products & Artisan',
    icon: '🫙',
    descriptionTr: 'Hasat, tadım günü, üretici hikâyesi — otantik ve sıcak.',
    creativeDirectionTr: 'Script davetiye, mühür, çerçeve — el yapımı premium his.',
    defaultPreferences: {
      event: 'agency_corner_stamp_10',
      campaign: 'agency_script_luxe_03',
      announcement: 'agency_frame_classic_06',
      defaultFormat: 'story',
    },
    picks: {
      event: [
        'agency_corner_stamp_10', 'agency_script_luxe_03', 'agency_frame_classic_06',
        'agency_luxury_bottom_04', 'agency_magazine_date_01',
      ],
      campaign: [
        'agency_script_luxe_03', 'agency_offer_band_05', 'agency_color_split_05',
        'agency_campaign_badge_08',
      ],
      announcement: [
        'agency_frame_classic_06', 'agency_editorial_left_01', 'agency_minimal_whisper_06',
        'agency_corner_stamp_10',
      ],
    },
    templateIds: [],
  },
];

// Flatten picks into templateIds
for (const pkg of SECTOR_COLLECTIONS) {
  const ids = new Set<AnnouncementTemplateId>([
    ...pkg.picks.event,
    ...pkg.picks.campaign,
    ...pkg.picks.announcement,
    pkg.defaultPreferences.event,
    pkg.defaultPreferences.campaign,
    pkg.defaultPreferences.announcement,
  ]);
  pkg.templateIds = [...ids];
}

const SECTOR_BY_ID = new Map<SectorId, SectorCollectionPackage>(
  SECTOR_COLLECTIONS.map((p) => [p.id, p]),
);

export function normalizeSectorId(raw: string | null | undefined): SectorId {
  const value = (raw ?? '').trim().toLowerCase().replace(/\s+/g, '_').replace(/\//g, '_');
  if (!value) return 'local_service_business';
  if (SECTOR_BY_ID.has(value as SectorId)) return value as SectorId;
  const aliased = SECTOR_ALIASES[value];
  if (aliased) return aliased;
  return 'local_service_business';
}

export function getSectorCollection(raw: string | null | undefined): SectorCollectionPackage {
  return SECTOR_BY_ID.get(normalizeSectorId(raw)) ?? SECTOR_BY_ID.get('local_service_business')!;
}

export function isGenericAnnouncementDefaults(prefs: AnnouncementLibraryPreferences): boolean {
  return prefs.event === 'luxury_bottom'
    && prefs.campaign === 'campaign_badge'
    && prefs.announcement === 'editorial_left';
}

export function templatesForSectorPackage(
  sectorId: string,
  useCase?: 'event' | 'campaign' | 'announcement',
): AnnouncementTemplateId[] {
  const pkg = getSectorCollection(sectorId);
  if (!useCase) return pkg.templateIds;
  return pkg.picks[useCase];
}
