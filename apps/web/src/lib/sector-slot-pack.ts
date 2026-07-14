/**
 * Sector Slot Pack — data-driven slot catalog SSOT for all canonical sectors.
 *
 * Used when DB catalog is empty (client fallback) and mirrored in Python for seed.
 * Archetype instances map to production_slot_definitions rows per sector.
 */

import type { ProductionSlotDefinition } from '@/lib/production-slot-catalog';
import { buildDesignedStoryPromptPack } from '@/lib/catalog-slot-visual-defaults';

export type SlotFormat = 'post' | 'story' | 'reel' | 'carousel';

/** Facility hints stored on brand_theme.slot_facilities (opt-out model). */
export interface BrandSlotFacilities {
  pool?: boolean;
  dj_stage?: boolean;
  full_menu?: boolean;
  spa?: boolean;
  outdoor_terrace?: boolean;
  private_events?: boolean;
  live_music?: boolean;
  classes?: boolean;
  kids_area?: boolean;
  delivery?: boolean;
}

export interface SlotArchetypeInstance {
  suffix: string;
  labelTr: string;
  labelEn: string;
  format: SlotFormat;
  /** e.g. ['requires:pool'] — disabled when matching facility is false. */
  optionalTags?: string[];
  enabledByDefault?: boolean;
  /** Override default format→pipeline mapping (e.g. fal_only_story for typography posters). */
  pipeline?: string;
  /** Override default format→slot_role mapping. */
  slotRole?: string;
  /** Override inferDesignTemplateType() when set. */
  designTemplateType?: string;
  /** Designed Fal story — ideation + production get premium_composition defaults. */
  requiresPremiumComposition?: boolean;
}

export interface SectorSlotPack {
  sectorId: string;
  labelTr: string;
  labelEn: string;
  aliases: string[];
  sortOrder: number;
  instances: SlotArchetypeInstance[];
}

const REQUIRES_PREFIX = 'requires:';

export function slotKeyForSector(sectorId: string, suffix: string): string {
  return `${sectorId}_${suffix}`;
}

export function parseFacilityFromTag(tag: string): keyof BrandSlotFacilities | null {
  if (!tag.startsWith(REQUIRES_PREFIX)) return null;
  const key = tag.slice(REQUIRES_PREFIX.length) as keyof BrandSlotFacilities;
  return key in DEFAULT_SLOT_FACILITIES ? key : null;
}

/** Opt-out default — all facilities assumed present until brand disables. */
export const DEFAULT_SLOT_FACILITIES: BrandSlotFacilities = {
  pool: true,
  dj_stage: true,
  full_menu: true,
  spa: true,
  outdoor_terrace: true,
  private_events: true,
  live_music: true,
  classes: true,
  kids_area: true,
  delivery: true,
};

export function resolveBrandSlotFacilities(
  input?: BrandSlotFacilities | Record<string, unknown> | null,
): BrandSlotFacilities {
  if (!input || typeof input !== 'object') return { ...DEFAULT_SLOT_FACILITIES };
  const out: BrandSlotFacilities = { ...DEFAULT_SLOT_FACILITIES };
  for (const key of Object.keys(DEFAULT_SLOT_FACILITIES) as (keyof BrandSlotFacilities)[]) {
    if (key in input && typeof input[key] === 'boolean') {
      out[key] = input[key] as boolean;
    }
  }
  return out;
}

export function slotEnabledByFacilities(
  optionalTags: string[] | undefined,
  facilities: BrandSlotFacilities,
): boolean {
  if (!optionalTags?.length) return true;
  for (const tag of optionalTags) {
    const facility = parseFacilityFromTag(tag);
    if (facility && facilities[facility] === false) return false;
  }
  return true;
}

function inferDesignTemplateType(slotKey: string): string {
  const key = slotKey.toLowerCase();
  if (/typography_poster/.test(key)) return 'campaign_announcement';
  if (/event_announcement/.test(key)) return 'event_special';
  if (/social_proof|testimonial|review|ugc|guest_social|client_testimonial|member_story/.test(key)) {
    return 'social_proof';
  }
  if (/event|dj|live_music|private_event|aftermovie|wedding|bridal/.test(key)) {
    return 'event_special';
  }
  if (/offer|sale|promo|flash|happy_hour|membership|daybed|day_pass|trial|campaign/.test(key)) {
    return 'campaign_announcement';
  }
  if (/menu|dish|product|cocktail|retail|arrival|collection|unboxing|pastry|property|listing/.test(key)) {
    return 'menu_highlight';
  }
  if (/ambiance|venue|facility|aerial|tour|atmosphere|lifestyle|pool|room|suite|interior/.test(key)) {
    return 'venue_showcase';
  }
  if (/seasonal|summer|opening|ingredient|farm_to_table/.test(key)) {
    return 'seasonal_promo';
  }
  if (/brand_story|brand_identity|stylist_intro|trainer_spotlight|barber_intro|agent_intro/.test(key)) {
    return 'brand_identity';
  }
  if (key.endsWith('_reel')) return 'reel_cover';
  if (/appointment|reminder|schedule|class_reminder|consultation|booking/.test(key)) {
    return 'announcement_formal';
  }
  if (/bts|kitchen|behind|morning|self_care|nutrition|tip|process|craft/.test(key)) {
    return 'daily_story';
  }
  return 'campaign_announcement';
}

function inferPipeline(format: SlotFormat): string {
  if (format === 'carousel') return 'carousel_gallery';
  if (format === 'reel') return 'fal_reel';
  if (format === 'story') return 'fal_story';
  return 'fal_design';
}

function inferSlotRole(format: SlotFormat): string {
  if (format === 'carousel') return 'organic_carousel';
  if (format === 'reel') return 'fal_reel_motion';
  if (format === 'story') return 'campaign_story_motion';
  return 'fal_designed_post';
}

function inferLibrarySlotKey(slotKey: string, designType: string): string | null {
  if (designType === 'event_special') return 'event_story';
  if (designType === 'campaign_announcement' || designType === 'seasonal_promo') return 'campaign_post';
  if (designType === 'social_proof') return 'social_proof_post';
  if (['venue_showcase', 'brand_identity', 'daily_story'].includes(designType)) return 'daily_story';
  if (designType === 'menu_highlight') return 'editorial_story';
  if (slotKey.includes('social')) return 'social_proof';
  return 'campaign_post';
}

function buildMatchSignals(slotKey: string, designType: string): Record<string, unknown> {
  const signals: Record<string, unknown> = { design_template_type: designType };
  if (/typography_poster/.test(slotKey)) {
    signals.announcement_types = ['campaign_offer', 'offer_campaign'];
    signals.typography_forward = true;
  }
  if (/event_announcement/.test(slotKey)) {
    signals.announcement_types = ['event_teaser', 'event_announcement'];
  }
  if (/event|dj|wedding/.test(slotKey)) {
    signals.announcement_types = ['event_teaser', 'event_announcement'];
  }
  if (/offer|sale|promo/.test(slotKey)) {
    signals.announcement_types = ['offer_campaign'];
  }
  if (/social|testimonial|review|ugc/.test(slotKey)) {
    signals.announcement_types = ['social_proof'];
  }
  if (/product|menu|dish|pastry|property/.test(slotKey)) {
    signals.announcement_types = ['product_reveal', 'product_showcase'];
  }
  if (/venue|ambiance|facility|room|suite/.test(slotKey)) {
    signals.announcement_types = ['venue_showcase'];
  }
  if (/booking|reservation/.test(slotKey)) {
    signals.announcement_types = ['announcement', 'campaign_offer'];
  }
  return signals;
}

// ─── Sector packs (18 canonical sectors) ─────────────────────────────────────

export const SECTOR_SLOT_PACKS: SectorSlotPack[] = [
  {
    sectorId: 'beach_club',
    labelTr: 'Beach Club',
    labelEn: 'Beach Club',
    aliases: ['beach', 'beach_club_bar', 'nightclub', 'cocktail_bar'],
    sortOrder: 10,
    instances: [
      { suffix: 'sunset_ambiance_post', labelTr: 'Gün batımı atmosfer', labelEn: 'Sunset ambiance', format: 'post' },
      { suffix: 'cocktail_menu_post', labelTr: 'Kokteyl menü', labelEn: 'Cocktail menu', format: 'post', optionalTags: ['requires:full_menu'] },
      { suffix: 'pool_lifestyle_post', labelTr: 'Havuz lifestyle', labelEn: 'Pool lifestyle', format: 'post', optionalTags: ['requires:pool'] },
      { suffix: 'daybed_offer_post', labelTr: 'Şezlong teklifi', labelEn: 'Daybed offer', format: 'post' },
      { suffix: 'dj_night_teaser_post', labelTr: 'DJ gece teaser', labelEn: 'DJ night teaser', format: 'post', optionalTags: ['requires:dj_stage'] },
      { suffix: 'guest_social_proof_post', labelTr: 'Misafir sosyal kanıt', labelEn: 'Guest social proof', format: 'post' },
      { suffix: 'aerial_venue_post', labelTr: 'Havadan mekan', labelEn: 'Aerial venue', format: 'post' },
      { suffix: 'summer_opening_post', labelTr: 'Yaz açılış', labelEn: 'Summer opening', format: 'post' },
      { suffix: 'live_music_event_post', labelTr: 'Canlı müzik etkinlik', labelEn: 'Live music event', format: 'post', optionalTags: ['requires:live_music'] },
      { suffix: 'private_event_post', labelTr: 'Özel etkinlik', labelEn: 'Private event', format: 'post', optionalTags: ['requires:private_events'] },
      { suffix: 'sunset_golden_story', labelTr: 'Altın saat story', labelEn: 'Golden hour story', format: 'story' },
      { suffix: 'dj_event_story', labelTr: 'DJ etkinlik story', labelEn: 'DJ event story', format: 'story', optionalTags: ['requires:dj_stage'] },
      { suffix: 'cocktail_promo_story', labelTr: 'Kokteyl promo story', labelEn: 'Cocktail promo story', format: 'story' },
      { suffix: 'pool_party_story', labelTr: 'Havuz partisi story', labelEn: 'Pool party story', format: 'story', optionalTags: ['requires:pool'] },
      { suffix: 'day_pass_story', labelTr: 'Gün pass story', labelEn: 'Day pass story', format: 'story' },
      {
        suffix: 'event_announcement_story',
        labelTr: 'Etkinlik duyuru afişi',
        labelEn: 'Event announcement story',
        format: 'story',
        pipeline: 'fal_story',
        slotRole: 'campaign_story_motion',
        designTemplateType: 'event_special',
      },
      {
        suffix: 'typography_poster_story',
        labelTr: 'Tipografi poster story',
        labelEn: 'Typography poster story',
        format: 'story',
        pipeline: 'fal_only_story',
        slotRole: 'fal_only_story',
        designTemplateType: 'campaign_announcement',
      },
      { suffix: 'atmosphere_reel', labelTr: 'Atmosfer reel', labelEn: 'Atmosphere reel', format: 'reel' },
      { suffix: 'cocktail_craft_reel', labelTr: 'Kokteyl craft reel', labelEn: 'Cocktail craft reel', format: 'reel' },
      { suffix: 'sunset_timelapse_reel', labelTr: 'Gün batımı timelapse reel', labelEn: 'Sunset timelapse reel', format: 'reel' },
      { suffix: 'event_aftermovie_reel', labelTr: 'Etkinlik aftermovie reel', labelEn: 'Event aftermovie reel', format: 'reel', optionalTags: ['requires:dj_stage'] },
      { suffix: 'guest_moments_carousel', labelTr: 'Misafir anları carousel', labelEn: 'Guest moments carousel', format: 'carousel' },
    ],
  },
  {
    sectorId: 'restaurant_cafe',
    labelTr: 'Restoran & Kafe',
    labelEn: 'Restaurant & Cafe',
    aliases: ['restaurant', 'bistro', 'brunch', 'restaurant_bar'],
    sortOrder: 20,
    instances: [
      { suffix: 'signature_dish_post', labelTr: 'İmza tabak', labelEn: 'Signature dish', format: 'post' },
      { suffix: 'menu_highlight_post', labelTr: 'Menü öne çıkan', labelEn: 'Menu highlight', format: 'post', optionalTags: ['requires:full_menu'] },
      { suffix: 'chef_special_post', labelTr: 'Şef özel', labelEn: 'Chef special', format: 'post' },
      { suffix: 'dining_ambiance_post', labelTr: 'Yemek atmosferi', labelEn: 'Dining ambiance', format: 'post' },
      { suffix: 'reservation_cta_post', labelTr: 'Rezervasyon CTA', labelEn: 'Reservation CTA', format: 'post' },
      { suffix: 'customer_review_post', labelTr: 'Müşteri yorumu', labelEn: 'Customer review', format: 'post' },
      { suffix: 'seasonal_ingredient_post', labelTr: 'Mevsimsel malzeme', labelEn: 'Seasonal ingredient', format: 'post' },
      { suffix: 'brunch_offer_post', labelTr: 'Brunch teklifi', labelEn: 'Brunch offer', format: 'post' },
      { suffix: 'happy_hour_post', labelTr: 'Happy hour', labelEn: 'Happy hour', format: 'post' },
      { suffix: 'private_dining_post', labelTr: 'Özel yemek', labelEn: 'Private dining', format: 'post', optionalTags: ['requires:private_events'] },
      { suffix: 'new_menu_story', labelTr: 'Yeni menü story', labelEn: 'New menu story', format: 'story', optionalTags: ['requires:full_menu'] },
      { suffix: 'kitchen_bts_story', labelTr: 'Mutfak kulis story', labelEn: 'Kitchen BTS story', format: 'story' },
      { suffix: 'table_ready_story', labelTr: 'Masa hazır story', labelEn: 'Table ready story', format: 'story' },
      { suffix: 'farm_to_table_story', labelTr: 'Çiftlikten sofraya story', labelEn: 'Farm to table story', format: 'story' },
      {
        suffix: 'weekend_booking_story',
        labelTr: 'Hafta sonu rezervasyon story',
        labelEn: 'Weekend booking story',
        format: 'story',
        pipeline: 'fal_story',
        slotRole: 'campaign_story_motion',
        designTemplateType: 'announcement_formal',
        requiresPremiumComposition: true,
      },
      {
        suffix: 'event_announcement_story',
        labelTr: 'Etkinlik duyuru afişi',
        labelEn: 'Event announcement story',
        format: 'story',
        pipeline: 'fal_story',
        slotRole: 'campaign_story_motion',
        designTemplateType: 'event_special',
      },
      {
        suffix: 'typography_poster_story',
        labelTr: 'Tipografi poster story',
        labelEn: 'Typography poster story',
        format: 'story',
        pipeline: 'fal_only_story',
        slotRole: 'fal_only_story',
        designTemplateType: 'campaign_announcement',
      },
      { suffix: 'chef_plating_reel', labelTr: 'Şef plating reel', labelEn: 'Chef plating reel', format: 'reel' },
      { suffix: 'kitchen_process_reel', labelTr: 'Mutfak süreç reel', labelEn: 'Kitchen process reel', format: 'reel' },
      { suffix: 'dining_experience_reel', labelTr: 'Yemek deneyimi reel', labelEn: 'Dining experience reel', format: 'reel' },
      { suffix: 'cocktail_bar_reel', labelTr: 'Kokteyl bar reel', labelEn: 'Cocktail bar reel', format: 'reel' },
      { suffix: 'menu_tasting_carousel', labelTr: 'Menü tadım carousel', labelEn: 'Menu tasting carousel', format: 'carousel', optionalTags: ['requires:full_menu'] },
    ],
  },
  {
    sectorId: 'coffee_shop',
    labelTr: 'Kahve Dükkanı',
    labelEn: 'Coffee Shop',
    aliases: ['cafe', 'coffee', 'specialty_coffee', 'roastery'],
    sortOrder: 25,
    instances: [
      { suffix: 'signature_latte_post', labelTr: 'İmza latte', labelEn: 'Signature latte', format: 'post' },
      { suffix: 'pastry_pairing_post', labelTr: 'Pastane eşleşmesi', labelEn: 'Pastry pairing', format: 'post' },
      { suffix: 'cafe_ambiance_post', labelTr: 'Kafe atmosferi', labelEn: 'Cafe ambiance', format: 'post' },
      { suffix: 'bean_origin_post', labelTr: 'Çekirdek kökeni', labelEn: 'Bean origin', format: 'post' },
      { suffix: 'morning_ritual_post', labelTr: 'Sabah ritüeli', labelEn: 'Morning ritual', format: 'post' },
      { suffix: 'loyalty_offer_post', labelTr: 'Sadakat teklifi', labelEn: 'Loyalty offer', format: 'post' },
      { suffix: 'customer_moment_post', labelTr: 'Müşteri anı', labelEn: 'Customer moment', format: 'post' },
      { suffix: 'seasonal_drink_post', labelTr: 'Mevsimsel içecek', labelEn: 'Seasonal drink', format: 'post' },
      { suffix: 'workspace_vibe_post', labelTr: 'Çalışma alanı vibe', labelEn: 'Workspace vibe', format: 'post' },
      { suffix: 'delivery_promo_post', labelTr: 'Teslimat promo', labelEn: 'Delivery promo', format: 'post', optionalTags: ['requires:delivery'] },
      { suffix: 'brew_method_story', labelTr: 'Demleme yöntemi story', labelEn: 'Brew method story', format: 'story' },
      { suffix: 'barista_bts_story', labelTr: 'Barista kulis story', labelEn: 'Barista BTS story', format: 'story' },
      { suffix: 'new_blend_story', labelTr: 'Yeni harman story', labelEn: 'New blend story', format: 'story' },
      { suffix: 'happy_hour_story', labelTr: 'Happy hour story', labelEn: 'Happy hour story', format: 'story' },
      { suffix: 'latte_art_reel', labelTr: 'Latte art reel', labelEn: 'Latte art reel', format: 'reel' },
      { suffix: 'cafe_atmosphere_reel', labelTr: 'Kafe atmosfer reel', labelEn: 'Cafe atmosphere reel', format: 'reel' },
      { suffix: 'roasting_process_reel', labelTr: 'Kavurma süreç reel', labelEn: 'Roasting process reel', format: 'reel' },
      { suffix: 'drink_menu_carousel', labelTr: 'İçecek menü carousel', labelEn: 'Drink menu carousel', format: 'carousel' },
    ],
  },
  {
    sectorId: 'fine_dining',
    labelTr: 'Fine Dining',
    labelEn: 'Fine Dining',
    aliases: ['fine_dining', 'gastronomy', 'michelin', 'tasting_menu'],
    sortOrder: 28,
    instances: [
      { suffix: 'tasting_menu_post', labelTr: 'Tadım menüsü', labelEn: 'Tasting menu', format: 'post', optionalTags: ['requires:full_menu'] },
      { suffix: 'chef_table_post', labelTr: 'Şef masası', labelEn: 'Chef table', format: 'post' },
      { suffix: 'wine_pairing_post', labelTr: 'Şarap eşleşmesi', labelEn: 'Wine pairing', format: 'post' },
      { suffix: 'plating_art_post', labelTr: 'Plating sanatı', labelEn: 'Plating art', format: 'post' },
      { suffix: 'dining_room_ambiance_post', labelTr: 'Salon atmosferi', labelEn: 'Dining room ambiance', format: 'post' },
      { suffix: 'reservation_exclusive_post', labelTr: 'Özel rezervasyon', labelEn: 'Exclusive reservation', format: 'post' },
      { suffix: 'guest_experience_post', labelTr: 'Misafir deneyimi', labelEn: 'Guest experience', format: 'post' },
      { suffix: 'seasonal_course_post', labelTr: 'Mevsimsel kurs', labelEn: 'Seasonal course', format: 'post' },
      { suffix: 'sommelier_pick_post', labelTr: 'Sommelier seçimi', labelEn: 'Sommelier pick', format: 'post' },
      { suffix: 'private_dining_post', labelTr: 'Özel yemek', labelEn: 'Private dining', format: 'post', optionalTags: ['requires:private_events'] },
      { suffix: 'menu_reveal_story', labelTr: 'Menü reveal story', labelEn: 'Menu reveal story', format: 'story' },
      { suffix: 'kitchen_precision_story', labelTr: 'Mutfak hassasiyet story', labelEn: 'Kitchen precision story', format: 'story' },
      { suffix: 'reservation_reminder_story', labelTr: 'Rezervasyon hatırlatma story', labelEn: 'Reservation reminder story', format: 'story' },
      { suffix: 'wine_cellar_story', labelTr: 'Şarap mahzeni story', labelEn: 'Wine cellar story', format: 'story' },
      { suffix: 'chef_signature_reel', labelTr: 'Şef imza reel', labelEn: 'Chef signature reel', format: 'reel' },
      { suffix: 'service_ritual_reel', labelTr: 'Servis ritüeli reel', labelEn: 'Service ritual reel', format: 'reel' },
      { suffix: 'evening_ambiance_reel', labelTr: 'Akşam atmosfer reel', labelEn: 'Evening ambiance reel', format: 'reel' },
      { suffix: 'course_journey_carousel', labelTr: 'Kurs yolculuğu carousel', labelEn: 'Course journey carousel', format: 'carousel' },
    ],
  },
  {
    sectorId: 'hospitality',
    labelTr: 'Otel & Konaklama',
    labelEn: 'Hospitality',
    aliases: ['hotel', 'resort', 'boutique_hotel', 'hostel'],
    sortOrder: 30,
    instances: [
      { suffix: 'suite_showcase_post', labelTr: 'Suit tanıtım', labelEn: 'Suite showcase', format: 'post' },
      { suffix: 'lobby_ambiance_post', labelTr: 'Lobi atmosferi', labelEn: 'Lobby ambiance', format: 'post' },
      { suffix: 'breakfast_experience_post', labelTr: 'Kahvaltı deneyimi', labelEn: 'Breakfast experience', format: 'post' },
      { suffix: 'pool_retreat_post', labelTr: 'Havuz dinlenme', labelEn: 'Pool retreat', format: 'post', optionalTags: ['requires:pool'] },
      { suffix: 'spa_wellness_post', labelTr: 'Spa wellness', labelEn: 'Spa wellness', format: 'post', optionalTags: ['requires:spa'] },
      { suffix: 'guest_review_post', labelTr: 'Misafir yorumu', labelEn: 'Guest review', format: 'post' },
      { suffix: 'local_experience_post', labelTr: 'Yerel deneyim', labelEn: 'Local experience', format: 'post' },
      { suffix: 'seasonal_package_post', labelTr: 'Mevsimsel paket', labelEn: 'Seasonal package', format: 'post' },
      { suffix: 'terrace_view_post', labelTr: 'Teras manzara', labelEn: 'Terrace view', format: 'post', optionalTags: ['requires:outdoor_terrace'] },
      { suffix: 'event_venue_post', labelTr: 'Etkinlik mekanı', labelEn: 'Event venue', format: 'post', optionalTags: ['requires:private_events'] },
      { suffix: 'checkin_story', labelTr: 'Check-in story', labelEn: 'Check-in story', format: 'story' },
      { suffix: 'room_tour_story', labelTr: 'Oda turu story', labelEn: 'Room tour story', format: 'story' },
      { suffix: 'spa_offer_story', labelTr: 'Spa teklifi story', labelEn: 'Spa offer story', format: 'story', optionalTags: ['requires:spa'] },
      { suffix: 'weekend_escape_story', labelTr: 'Hafta sonu kaçamağı story', labelEn: 'Weekend escape story', format: 'story' },
      { suffix: 'property_tour_reel', labelTr: 'Tesis turu reel', labelEn: 'Property tour reel', format: 'reel' },
      { suffix: 'guest_experience_reel', labelTr: 'Misafir deneyimi reel', labelEn: 'Guest experience reel', format: 'reel' },
      { suffix: 'sunrise_terrace_reel', labelTr: 'Gün doğumu teras reel', labelEn: 'Sunrise terrace reel', format: 'reel', optionalTags: ['requires:outdoor_terrace'] },
      { suffix: 'amenities_carousel', labelTr: 'Olanaklar carousel', labelEn: 'Amenities carousel', format: 'carousel' },
    ],
  },
  {
    sectorId: 'beauty_wellness',
    labelTr: 'Güzellik & Wellness',
    labelEn: 'Beauty & Wellness',
    aliases: ['beauty', 'beauty_salon', 'wellness_spa', 'spa', 'nail_salon'],
    sortOrder: 35,
    instances: [
      { suffix: 'treatment_showcase_post', labelTr: 'Bakım tanıtım', labelEn: 'Treatment showcase', format: 'post' },
      { suffix: 'before_after_post', labelTr: 'Önce sonra', labelEn: 'Before after', format: 'post' },
      { suffix: 'nail_art_spotlight_post', labelTr: 'Tırnak art spotlight', labelEn: 'Nail art spotlight', format: 'post' },
      { suffix: 'skincare_routine_post', labelTr: 'Cilt bakım rutini', labelEn: 'Skincare routine', format: 'post' },
      { suffix: 'salon_ambiance_post', labelTr: 'Salon atmosferi', labelEn: 'Salon ambiance', format: 'post' },
      { suffix: 'stylist_intro_post', labelTr: 'Stilist tanıtım', labelEn: 'Stylist intro', format: 'post' },
      { suffix: 'bridal_package_post', labelTr: 'Gelin paketi', labelEn: 'Bridal package', format: 'post' },
      { suffix: 'membership_offer_post', labelTr: 'Üyelik teklifi', labelEn: 'Membership offer', format: 'post' },
      { suffix: 'client_testimonial_post', labelTr: 'Müşteri yorumu', labelEn: 'Client testimonial', format: 'post' },
      { suffix: 'retail_product_post', labelTr: 'Perakende ürün', labelEn: 'Retail product', format: 'post' },
      { suffix: 'appointment_reminder_story', labelTr: 'Randevu hatırlatma story', labelEn: 'Appointment reminder story', format: 'story' },
      { suffix: 'new_treatment_story', labelTr: 'Yeni bakım story', labelEn: 'New treatment story', format: 'story' },
      { suffix: 'seasonal_campaign_story', labelTr: 'Mevsimsel kampanya story', labelEn: 'Seasonal campaign story', format: 'story' },
      { suffix: 'self_care_tip_story', labelTr: 'Self care ipucu story', labelEn: 'Self care tip story', format: 'story' },
      { suffix: 'flash_sale_story', labelTr: 'Flash sale story', labelEn: 'Flash sale story', format: 'story' },
      { suffix: 'transformation_reel', labelTr: 'Dönüşüm reel', labelEn: 'Transformation reel', format: 'reel' },
      { suffix: 'treatment_process_reel', labelTr: 'Bakım süreç reel', labelEn: 'Treatment process reel', format: 'reel' },
      { suffix: 'salon_tour_reel', labelTr: 'Salon turu reel', labelEn: 'Salon tour reel', format: 'reel' },
      { suffix: 'styling_demo_reel', labelTr: 'Styling demo reel', labelEn: 'Styling demo reel', format: 'reel' },
      { suffix: 'portfolio_gallery_carousel', labelTr: 'Portfolyo galeri carousel', labelEn: 'Portfolio gallery carousel', format: 'carousel' },
    ],
  },
  {
    sectorId: 'barber_salon',
    labelTr: 'Berber & Kuaför',
    labelEn: 'Barber Salon',
    aliases: ['barber', 'barbershop', 'mens_grooming', 'hair_salon_men'],
    sortOrder: 38,
    instances: [
      { suffix: 'fade_showcase_post', labelTr: 'Fade vitrin', labelEn: 'Fade showcase', format: 'post' },
      { suffix: 'beard_styling_post', labelTr: 'Sakal styling', labelEn: 'Beard styling', format: 'post' },
      { suffix: 'shop_ambiance_post', labelTr: 'Dükkan atmosferi', labelEn: 'Shop ambiance', format: 'post' },
      { suffix: 'barber_intro_post', labelTr: 'Berber tanıtım', labelEn: 'Barber intro', format: 'post' },
      { suffix: 'client_transformation_post', labelTr: 'Müşteri dönüşüm', labelEn: 'Client transformation', format: 'post' },
      { suffix: 'grooming_package_post', labelTr: 'Bakım paketi', labelEn: 'Grooming package', format: 'post' },
      { suffix: 'walkin_offer_post', labelTr: 'Walk-in teklifi', labelEn: 'Walk-in offer', format: 'post' },
      { suffix: 'social_proof_post', labelTr: 'Sosyal kanıt', labelEn: 'Social proof', format: 'post' },
      { suffix: 'appointment_story', labelTr: 'Randevu story', labelEn: 'Appointment story', format: 'story' },
      { suffix: 'technique_bts_story', labelTr: 'Teknik kulis story', labelEn: 'Technique BTS story', format: 'story' },
      { suffix: 'new_service_story', labelTr: 'Yeni hizmet story', labelEn: 'New service story', format: 'story' },
      { suffix: 'cut_process_reel', labelTr: 'Kesim süreç reel', labelEn: 'Cut process reel', format: 'reel' },
      { suffix: 'shop_vibe_reel', labelTr: 'Dükkan vibe reel', labelEn: 'Shop vibe reel', format: 'reel' },
      { suffix: 'style_gallery_carousel', labelTr: 'Stil galeri carousel', labelEn: 'Style gallery carousel', format: 'carousel' },
    ],
  },
  {
    sectorId: 'healthcare_clinic',
    labelTr: 'Sağlık Kliniği',
    labelEn: 'Healthcare Clinic',
    aliases: ['clinic', 'medical', 'dental', 'physiotherapy', 'dermatology'],
    sortOrder: 40,
    instances: [
      { suffix: 'service_overview_post', labelTr: 'Hizmet özeti', labelEn: 'Service overview', format: 'post' },
      { suffix: 'expert_intro_post', labelTr: 'Uzman tanıtım', labelEn: 'Expert intro', format: 'post' },
      { suffix: 'clinic_trust_post', labelTr: 'Klinik güven', labelEn: 'Clinic trust', format: 'post' },
      { suffix: 'patient_story_post', labelTr: 'Hasta hikayesi', labelEn: 'Patient story', format: 'post' },
      { suffix: 'health_tip_post', labelTr: 'Sağlık ipucu', labelEn: 'Health tip', format: 'post' },
      { suffix: 'appointment_cta_post', labelTr: 'Randevu CTA', labelEn: 'Appointment CTA', format: 'post' },
      { suffix: 'technology_highlight_post', labelTr: 'Teknoloji öne çıkan', labelEn: 'Technology highlight', format: 'post' },
      { suffix: 'seasonal_checkup_post', labelTr: 'Mevsimsel kontrol', labelEn: 'Seasonal checkup', format: 'post' },
      { suffix: 'consultation_story', labelTr: 'Konsültasyon story', labelEn: 'Consultation story', format: 'story' },
      { suffix: 'faq_story', labelTr: 'SSS story', labelEn: 'FAQ story', format: 'story' },
      { suffix: 'reminder_story', labelTr: 'Hatırlatma story', labelEn: 'Reminder story', format: 'story' },
      { suffix: 'facility_tour_reel', labelTr: 'Tesis turu reel', labelEn: 'Facility tour reel', format: 'reel' },
      { suffix: 'expert_advice_reel', labelTr: 'Uzman tavsiye reel', labelEn: 'Expert advice reel', format: 'reel' },
      { suffix: 'services_carousel', labelTr: 'Hizmetler carousel', labelEn: 'Services carousel', format: 'carousel' },
    ],
  },
  {
    sectorId: 'wedding_event',
    labelTr: 'Düğün & Etkinlik',
    labelEn: 'Wedding & Event',
    aliases: ['wedding', 'event_venue', 'wedding_planner', 'banquet'],
    sortOrder: 45,
    instances: [
      { suffix: 'venue_showcase_post', labelTr: 'Mekan vitrin', labelEn: 'Venue showcase', format: 'post' },
      { suffix: 'bridal_inspiration_post', labelTr: 'Gelin ilham', labelEn: 'Bridal inspiration', format: 'post' },
      { suffix: 'real_wedding_post', labelTr: 'Gerçek düğün', labelEn: 'Real wedding', format: 'post' },
      { suffix: 'package_offer_post', labelTr: 'Paket teklifi', labelEn: 'Package offer', format: 'post' },
      { suffix: 'vendor_spotlight_post', labelTr: 'Tedarikçi spotlight', labelEn: 'Vendor spotlight', format: 'post' },
      { suffix: 'seasonal_trend_post', labelTr: 'Mevsimsel trend', labelEn: 'Seasonal trend', format: 'post' },
      { suffix: 'client_testimonial_post', labelTr: 'Müşteri yorumu', labelEn: 'Client testimonial', format: 'post' },
      { suffix: 'planning_tip_post', labelTr: 'Planlama ipucu', labelEn: 'Planning tip', format: 'post' },
      { suffix: 'outdoor_ceremony_post', labelTr: 'Açık hava tören', labelEn: 'Outdoor ceremony', format: 'post', optionalTags: ['requires:outdoor_terrace'] },
      { suffix: 'dj_reception_post', labelTr: 'DJ resepsiyon', labelEn: 'DJ reception', format: 'post', optionalTags: ['requires:dj_stage'] },
      { suffix: 'save_date_story', labelTr: 'Save the date story', labelEn: 'Save the date story', format: 'story' },
      { suffix: 'behind_setup_story', labelTr: 'Kurulum kulis story', labelEn: 'Behind setup story', format: 'story' },
      { suffix: 'availability_story', labelTr: 'Müsaitlik story', labelEn: 'Availability story', format: 'story' },
      { suffix: 'floral_detail_story', labelTr: 'Çiçek detay story', labelEn: 'Floral detail story', format: 'story' },
      { suffix: 'venue_walkthrough_reel', labelTr: 'Mekan walkthrough reel', labelEn: 'Venue walkthrough reel', format: 'reel' },
      { suffix: 'ceremony_moments_reel', labelTr: 'Tören anları reel', labelEn: 'Ceremony moments reel', format: 'reel' },
      { suffix: 'reception_energy_reel', labelTr: 'Resepsiyon enerji reel', labelEn: 'Reception energy reel', format: 'reel', optionalTags: ['requires:live_music'] },
      { suffix: 'portfolio_carousel', labelTr: 'Portfolyo carousel', labelEn: 'Portfolio carousel', format: 'carousel' },
    ],
  },
  {
    sectorId: 'local_products_shop',
    labelTr: 'Yerel Ürün Dükkanı',
    labelEn: 'Local Products Shop',
    aliases: ['local_shop', 'artisan_shop', 'farm_shop', 'handmade_shop'],
    sortOrder: 48,
    instances: [
      { suffix: 'product_hero_post', labelTr: 'Ürün hero', labelEn: 'Product hero', format: 'post' },
      { suffix: 'maker_story_post', labelTr: 'Üretici hikayesi', labelEn: 'Maker story', format: 'post' },
      { suffix: 'seasonal_harvest_post', labelTr: 'Mevsimsel hasat', labelEn: 'Seasonal harvest', format: 'post' },
      { suffix: 'shop_ambiance_post', labelTr: 'Dükkan atmosferi', labelEn: 'Shop ambiance', format: 'post' },
      { suffix: 'customer_favorite_post', labelTr: 'Müşteri favorisi', labelEn: 'Customer favorite', format: 'post' },
      { suffix: 'limited_batch_post', labelTr: 'Sınırlı parti', labelEn: 'Limited batch', format: 'post' },
      { suffix: 'gift_bundle_post', labelTr: 'Hediye paketi', labelEn: 'Gift bundle', format: 'post' },
      { suffix: 'market_day_post', labelTr: 'Pazar günü', labelEn: 'Market day', format: 'post' },
      { suffix: 'new_arrival_story', labelTr: 'Yeni gelen story', labelEn: 'New arrival story', format: 'story' },
      { suffix: 'production_bts_story', labelTr: 'Üretim kulis story', labelEn: 'Production BTS story', format: 'story' },
      { suffix: 'farm_visit_story', labelTr: 'Çiftlik ziyareti story', labelEn: 'Farm visit story', format: 'story' },
      { suffix: 'weekend_hours_story', labelTr: 'Hafta sonu saat story', labelEn: 'Weekend hours story', format: 'story' },
      { suffix: 'product_detail_reel', labelTr: 'Ürün detay reel', labelEn: 'Product detail reel', format: 'reel' },
      { suffix: 'shop_tour_reel', labelTr: 'Dükkan turu reel', labelEn: 'Shop tour reel', format: 'reel' },
      { suffix: 'craft_process_reel', labelTr: 'El işi süreç reel', labelEn: 'Craft process reel', format: 'reel' },
      { suffix: 'product_range_carousel', labelTr: 'Ürün yelpazesi carousel', labelEn: 'Product range carousel', format: 'carousel' },
    ],
  },
  {
    sectorId: 'ecommerce_retail',
    labelTr: 'E-Ticaret & Perakende',
    labelEn: 'E-commerce & Retail',
    aliases: ['retail', 'ecommerce', 'fashion', 'boutique', 'handmade_product'],
    sortOrder: 50,
    instances: [
      { suffix: 'product_hero_post', labelTr: 'Ürün hero', labelEn: 'Product hero', format: 'post' },
      { suffix: 'new_arrival_post', labelTr: 'Yeni gelen', labelEn: 'New arrival', format: 'post' },
      { suffix: 'bestseller_spotlight_post', labelTr: 'Çok satan spotlight', labelEn: 'Bestseller spotlight', format: 'post' },
      { suffix: 'outfit_styling_post', labelTr: 'Kombin styling', labelEn: 'Outfit styling', format: 'post' },
      { suffix: 'sale_announcement_post', labelTr: 'İndirim duyurusu', labelEn: 'Sale announcement', format: 'post' },
      { suffix: 'ugc_customer_post', labelTr: 'UGC müşteri', labelEn: 'UGC customer', format: 'post' },
      { suffix: 'limited_drop_post', labelTr: 'Limited drop', labelEn: 'Limited drop', format: 'post' },
      { suffix: 'gift_guide_post', labelTr: 'Hediye rehberi', labelEn: 'Gift guide', format: 'post' },
      { suffix: 'restock_alert_post', labelTr: 'Stok uyarısı', labelEn: 'Restock alert', format: 'post' },
      { suffix: 'brand_story_post', labelTr: 'Marka hikayesi', labelEn: 'Brand story', format: 'post' },
      { suffix: 'flash_sale_story', labelTr: 'Flash sale story', labelEn: 'Flash sale story', format: 'story' },
      { suffix: 'new_collection_story', labelTr: 'Yeni koleksiyon story', labelEn: 'New collection story', format: 'story' },
      { suffix: 'styling_tip_story', labelTr: 'Styling ipucu story', labelEn: 'Styling tip story', format: 'story' },
      { suffix: 'behind_brand_story', labelTr: 'Marka perde arkası story', labelEn: 'Behind brand story', format: 'story' },
      { suffix: 'customer_review_story', labelTr: 'Müşteri yorum story', labelEn: 'Customer review story', format: 'story' },
      { suffix: 'product_detail_reel', labelTr: 'Ürün detay reel', labelEn: 'Product detail reel', format: 'reel' },
      { suffix: 'lookbook_reel', labelTr: 'Lookbook reel', labelEn: 'Lookbook reel', format: 'reel' },
      { suffix: 'unboxing_reel', labelTr: 'Unboxing reel', labelEn: 'Unboxing reel', format: 'reel' },
      { suffix: 'warehouse_bts_reel', labelTr: 'Depo kulis reel', labelEn: 'Warehouse BTS reel', format: 'reel' },
      { suffix: 'multi_product_carousel', labelTr: 'Çoklu ürün carousel', labelEn: 'Multi product carousel', format: 'carousel' },
    ],
  },
  {
    sectorId: 'fitness_gym',
    labelTr: 'Fitness & Gym',
    labelEn: 'Fitness & Gym',
    aliases: ['fitness', 'gym', 'yoga_studio', 'crossfit', 'pilates'],
    sortOrder: 55,
    instances: [
      { suffix: 'class_schedule_post', labelTr: 'Ders programı', labelEn: 'Class schedule', format: 'post', optionalTags: ['requires:classes'] },
      { suffix: 'trainer_spotlight_post', labelTr: 'Antrenör spotlight', labelEn: 'Trainer spotlight', format: 'post' },
      { suffix: 'transformation_post', labelTr: 'Dönüşüm', labelEn: 'Transformation', format: 'post' },
      { suffix: 'facility_tour_post', labelTr: 'Tesis turu', labelEn: 'Facility tour', format: 'post' },
      { suffix: 'membership_offer_post', labelTr: 'Üyelik teklifi', labelEn: 'Membership offer', format: 'post' },
      { suffix: 'nutrition_tip_post', labelTr: 'Beslenme ipucu', labelEn: 'Nutrition tip', format: 'post' },
      { suffix: 'group_class_post', labelTr: 'Grup dersi', labelEn: 'Group class', format: 'post', optionalTags: ['requires:classes'] },
      { suffix: 'personal_training_post', labelTr: 'Kişisel antrenman', labelEn: 'Personal training', format: 'post' },
      { suffix: 'member_story_post', labelTr: 'Üye hikayesi', labelEn: 'Member story', format: 'post' },
      { suffix: 'equipment_highlight_post', labelTr: 'Ekipman öne çıkan', labelEn: 'Equipment highlight', format: 'post' },
      { suffix: 'class_reminder_story', labelTr: 'Ders hatırlatma story', labelEn: 'Class reminder story', format: 'story', optionalTags: ['requires:classes'] },
      { suffix: 'challenge_launch_story', labelTr: 'Challenge lansman story', labelEn: 'Challenge launch story', format: 'story' },
      { suffix: 'morning_motivation_story', labelTr: 'Sabah motivasyon story', labelEn: 'Morning motivation story', format: 'story' },
      { suffix: 'trial_pass_story', labelTr: 'Deneme pass story', labelEn: 'Trial pass story', format: 'story' },
      { suffix: 'pt_availability_story', labelTr: 'PT müsaitlik story', labelEn: 'PT availability story', format: 'story' },
      { suffix: 'workout_highlight_reel', labelTr: 'Antrenman highlight reel', labelEn: 'Workout highlight reel', format: 'reel' },
      { suffix: 'class_energy_reel', labelTr: 'Ders enerji reel', labelEn: 'Class energy reel', format: 'reel', optionalTags: ['requires:classes'] },
      { suffix: 'trainer_demo_reel', labelTr: 'Antrenör demo reel', labelEn: 'Trainer demo reel', format: 'reel' },
      { suffix: 'member_testimonial_reel', labelTr: 'Üye testimonial reel', labelEn: 'Member testimonial reel', format: 'reel' },
      { suffix: 'program_overview_carousel', labelTr: 'Program genel bakış carousel', labelEn: 'Program overview carousel', format: 'carousel' },
    ],
  },
  {
    sectorId: 'nightclub',
    labelTr: 'Gece Kulübü',
    labelEn: 'Nightclub',
    aliases: ['club', 'dance_club', 'lounge_bar', 'cocktail_lounge'],
    sortOrder: 58,
    instances: [
      { suffix: 'dj_lineup_post', labelTr: 'DJ lineup', labelEn: 'DJ lineup', format: 'post', optionalTags: ['requires:dj_stage'] },
      { suffix: 'theme_night_post', labelTr: 'Tema gecesi', labelEn: 'Theme night', format: 'post' },
      { suffix: 'vip_table_post', labelTr: 'VIP masa', labelEn: 'VIP table', format: 'post', optionalTags: ['requires:private_events'] },
      { suffix: 'venue_energy_post', labelTr: 'Mekan enerji', labelEn: 'Venue energy', format: 'post' },
      { suffix: 'guest_moments_post', labelTr: 'Misafir anları', labelEn: 'Guest moments', format: 'post' },
      { suffix: 'bottle_service_post', labelTr: 'Şişe servis', labelEn: 'Bottle service', format: 'post' },
      { suffix: 'weekend_teaser_post', labelTr: 'Hafta sonu teaser', labelEn: 'Weekend teaser', format: 'post' },
      { suffix: 'social_proof_post', labelTr: 'Sosyal kanıt', labelEn: 'Social proof', format: 'post' },
      { suffix: 'guestlist_story', labelTr: 'Guestlist story', labelEn: 'Guestlist story', format: 'story' },
      { suffix: 'dj_announce_story', labelTr: 'DJ duyuru story', labelEn: 'DJ announce story', format: 'story', optionalTags: ['requires:dj_stage'] },
      { suffix: 'door_time_story', labelTr: 'Kapı saati story', labelEn: 'Door time story', format: 'story' },
      { suffix: 'aftermovie_teaser_story', labelTr: 'Aftermovie teaser story', labelEn: 'Aftermovie teaser story', format: 'story' },
      { suffix: 'crowd_energy_reel', labelTr: 'Kalabalık enerji reel', labelEn: 'Crowd energy reel', format: 'reel' },
      { suffix: 'dj_set_reel', labelTr: 'DJ set reel', labelEn: 'DJ set reel', format: 'reel', optionalTags: ['requires:dj_stage'] },
      { suffix: 'light_show_reel', labelTr: 'Işık gösterisi reel', labelEn: 'Light show reel', format: 'reel' },
      { suffix: 'event_highlights_carousel', labelTr: 'Etkinlik öne çıkanlar carousel', labelEn: 'Event highlights carousel', format: 'carousel' },
    ],
  },
  {
    sectorId: 'fashion_boutique',
    labelTr: 'Moda Butiği',
    labelEn: 'Fashion Boutique',
    aliases: ['boutique', 'fashion_store', 'designer_boutique', 'apparel'],
    sortOrder: 60,
    instances: [
      { suffix: 'lookbook_hero_post', labelTr: 'Lookbook hero', labelEn: 'Lookbook hero', format: 'post' },
      { suffix: 'new_collection_post', labelTr: 'Yeni koleksiyon', labelEn: 'New collection', format: 'post' },
      { suffix: 'styling_inspiration_post', labelTr: 'Styling ilham', labelEn: 'Styling inspiration', format: 'post' },
      { suffix: 'bestseller_post', labelTr: 'Çok satan', labelEn: 'Bestseller', format: 'post' },
      { suffix: 'seasonal_trend_post', labelTr: 'Mevsimsel trend', labelEn: 'Seasonal trend', format: 'post' },
      { suffix: 'client_look_post', labelTr: 'Müşteri kombin', labelEn: 'Client look', format: 'post' },
      { suffix: 'sale_event_post', labelTr: 'İndirim etkinlik', labelEn: 'Sale event', format: 'post' },
      { suffix: 'brand_story_post', labelTr: 'Marka hikayesi', labelEn: 'Brand story', format: 'post' },
      { suffix: 'fitting_room_story', labelTr: 'Kabin story', labelEn: 'Fitting room story', format: 'story' },
      { suffix: 'stylist_pick_story', labelTr: 'Stilist seçimi story', labelEn: 'Stylist pick story', format: 'story' },
      { suffix: 'new_arrival_story', labelTr: 'Yeni gelen story', labelEn: 'New arrival story', format: 'story' },
      { suffix: 'weekend_hours_story', labelTr: 'Hafta sonu saat story', labelEn: 'Weekend hours story', format: 'story' },
      { suffix: 'runway_style_reel', labelTr: 'Runway stil reel', labelEn: 'Runway style reel', format: 'reel' },
      { suffix: 'outfit_transition_reel', labelTr: 'Kombin geçiş reel', labelEn: 'Outfit transition reel', format: 'reel' },
      { suffix: 'boutique_tour_reel', labelTr: 'Butik turu reel', labelEn: 'Boutique tour reel', format: 'reel' },
      { suffix: 'collection_carousel', labelTr: 'Koleksiyon carousel', labelEn: 'Collection carousel', format: 'carousel' },
    ],
  },
  {
    sectorId: 'bakery_patisserie',
    labelTr: 'Fırın & Pastane',
    labelEn: 'Bakery & Patisserie',
    aliases: ['bakery', 'patisserie', 'pastry_shop', 'cake_shop'],
    sortOrder: 62,
    instances: [
      { suffix: 'signature_pastry_post', labelTr: 'İmza pasta', labelEn: 'Signature pastry', format: 'post' },
      { suffix: 'daily_fresh_post', labelTr: 'Günlük taze', labelEn: 'Daily fresh', format: 'post' },
      { suffix: 'custom_cake_post', labelTr: 'Özel pasta', labelEn: 'Custom cake', format: 'post' },
      { suffix: 'bakery_ambiance_post', labelTr: 'Fırın atmosferi', labelEn: 'Bakery ambiance', format: 'post' },
      { suffix: 'seasonal_flavor_post', labelTr: 'Mevsimsel lezzet', labelEn: 'Seasonal flavor', format: 'post' },
      { suffix: 'customer_favorite_post', labelTr: 'Müşteri favorisi', labelEn: 'Customer favorite', format: 'post' },
      { suffix: 'catering_offer_post', labelTr: 'Catering teklifi', labelEn: 'Catering offer', format: 'post', optionalTags: ['requires:private_events'] },
      { suffix: 'morning_batch_post', labelTr: 'Sabah fırını', labelEn: 'Morning batch', format: 'post' },
      { suffix: 'oven_bts_story', labelTr: 'Fırın kulis story', labelEn: 'Oven BTS story', format: 'story' },
      { suffix: 'new_recipe_story', labelTr: 'Yeni tarif story', labelEn: 'New recipe story', format: 'story' },
      { suffix: 'order_reminder_story', labelTr: 'Sipariş hatırlatma story', labelEn: 'Order reminder story', format: 'story' },
      { suffix: 'weekend_special_story', labelTr: 'Hafta sonu özel story', labelEn: 'Weekend special story', format: 'story' },
      { suffix: 'decorating_process_reel', labelTr: 'Süsleme süreç reel', labelEn: 'Decorating process reel', format: 'reel' },
      { suffix: 'fresh_from_oven_reel', labelTr: 'Fırından taze reel', labelEn: 'Fresh from oven reel', format: 'reel' },
      { suffix: 'display_case_reel', labelTr: 'Vitrin reel', labelEn: 'Display case reel', format: 'reel' },
      { suffix: 'pastry_range_carousel', labelTr: 'Pastane yelpazesi carousel', labelEn: 'Pastry range carousel', format: 'carousel' },
    ],
  },
  {
    sectorId: 'real_estate',
    labelTr: 'Emlak',
    labelEn: 'Real Estate',
    aliases: ['realty', 'property', 'realtor', 'housing'],
    sortOrder: 65,
    instances: [
      { suffix: 'listing_hero_post', labelTr: 'İlan hero', labelEn: 'Listing hero', format: 'post' },
      { suffix: 'property_tour_post', labelTr: 'Mülk turu', labelEn: 'Property tour', format: 'post' },
      { suffix: 'neighborhood_highlight_post', labelTr: 'Mahalle öne çıkan', labelEn: 'Neighborhood highlight', format: 'post' },
      { suffix: 'agent_intro_post', labelTr: 'Danışman tanıtım', labelEn: 'Agent intro', format: 'post' },
      { suffix: 'sold_success_post', labelTr: 'Satıldı başarı', labelEn: 'Sold success', format: 'post' },
      { suffix: 'market_insight_post', labelTr: 'Piyasa içgörü', labelEn: 'Market insight', format: 'post' },
      { suffix: 'open_house_post', labelTr: 'Açık ev', labelEn: 'Open house', format: 'post' },
      { suffix: 'client_testimonial_post', labelTr: 'Müşteri yorumu', labelEn: 'Client testimonial', format: 'post' },
      { suffix: 'new_listing_story', labelTr: 'Yeni ilan story', labelEn: 'New listing story', format: 'story' },
      { suffix: 'viewing_reminder_story', labelTr: 'Görüntüleme hatırlatma story', labelEn: 'Viewing reminder story', format: 'story' },
      { suffix: 'price_update_story', labelTr: 'Fiyat güncelleme story', labelEn: 'Price update story', format: 'story' },
      { suffix: 'walkthrough_reel', labelTr: 'Walkthrough reel', labelEn: 'Walkthrough reel', format: 'reel' },
      { suffix: 'aerial_property_reel', labelTr: 'Havadan mülk reel', labelEn: 'Aerial property reel', format: 'reel' },
      { suffix: 'portfolio_carousel', labelTr: 'Portfolyo carousel', labelEn: 'Portfolio carousel', format: 'carousel' },
    ],
  },
  {
    sectorId: 'local_service_business',
    labelTr: 'Yerel Hizmet İşletmesi',
    labelEn: 'Local Service Business',
    aliases: ['local_service', 'home_service', 'repair', 'cleaning', 'plumber'],
    sortOrder: 70,
    instances: [
      { suffix: 'service_hero_post', labelTr: 'Hizmet hero', labelEn: 'Service hero', format: 'post' },
      { suffix: 'before_after_post', labelTr: 'Önce sonra', labelEn: 'Before after', format: 'post' },
      { suffix: 'team_intro_post', labelTr: 'Ekip tanıtım', labelEn: 'Team intro', format: 'post' },
      { suffix: 'customer_review_post', labelTr: 'Müşteri yorumu', labelEn: 'Customer review', format: 'post' },
      { suffix: 'seasonal_offer_post', labelTr: 'Mevsimsel teklif', labelEn: 'Seasonal offer', format: 'post' },
      { suffix: 'service_area_post', labelTr: 'Hizmet bölgesi', labelEn: 'Service area', format: 'post' },
      { suffix: 'booking_cta_story', labelTr: 'Rezervasyon CTA story', labelEn: 'Booking CTA story', format: 'story' },
      { suffix: 'tip_of_week_story', labelTr: 'Haftanın ipucu story', labelEn: 'Tip of week story', format: 'story' },
      { suffix: 'job_complete_story', labelTr: 'İş tamamlandı story', labelEn: 'Job complete story', format: 'story' },
      { suffix: 'work_process_reel', labelTr: 'İş süreç reel', labelEn: 'Work process reel', format: 'reel' },
      { suffix: 'team_in_action_reel', labelTr: 'Ekip aksiyon reel', labelEn: 'Team in action reel', format: 'reel' },
      { suffix: 'services_carousel', labelTr: 'Hizmetler carousel', labelEn: 'Services carousel', format: 'carousel' },
    ],
  },
  {
    sectorId: 'general_business',
    labelTr: 'Genel İşletme',
    labelEn: 'General Business',
    aliases: ['business', 'company', 'startup', 'b2b'],
    sortOrder: 99,
    instances: [
      { suffix: 'brand_intro_post', labelTr: 'Marka tanıtım', labelEn: 'Brand intro', format: 'post' },
      { suffix: 'value_proposition_post', labelTr: 'Değer önerisi', labelEn: 'Value proposition', format: 'post' },
      { suffix: 'team_spotlight_post', labelTr: 'Ekip spotlight', labelEn: 'Team spotlight', format: 'post' },
      { suffix: 'customer_success_post', labelTr: 'Müşteri başarısı', labelEn: 'Customer success', format: 'post' },
      { suffix: 'announcement_post', labelTr: 'Duyuru', labelEn: 'Announcement', format: 'post' },
      { suffix: 'behind_scenes_post', labelTr: 'Perde arkası', labelEn: 'Behind scenes', format: 'post' },
      { suffix: 'news_update_story', labelTr: 'Haber güncelleme story', labelEn: 'News update story', format: 'story' },
      { suffix: 'tip_insight_story', labelTr: 'İpucu içgörü story', labelEn: 'Tip insight story', format: 'story' },
      { suffix: 'event_invite_story', labelTr: 'Etkinlik davet story', labelEn: 'Event invite story', format: 'story' },
      { suffix: 'brand_story_reel', labelTr: 'Marka hikaye reel', labelEn: 'Brand story reel', format: 'reel' },
      { suffix: 'office_culture_reel', labelTr: 'Ofis kültür reel', labelEn: 'Office culture reel', format: 'reel' },
      { suffix: 'highlights_carousel', labelTr: 'Öne çıkanlar carousel', labelEn: 'Highlights carousel', format: 'carousel' },
    ],
  },
];

const PACK_BY_SECTOR = new Map(SECTOR_SLOT_PACKS.map((p) => [p.sectorId, p]));

export function getSectorSlotPack(sectorId: string): SectorSlotPack | null {
  return PACK_BY_SECTOR.get(sectorId) ?? null;
}

export function listSectorSlotPackIds(): string[] {
  return SECTOR_SLOT_PACKS.map((p) => p.sectorId);
}

export function instanceToSlotDefinition(
  pack: SectorSlotPack,
  instance: SlotArchetypeInstance,
  sortOrder: number,
  facilities?: BrandSlotFacilities,
): ProductionSlotDefinition {
  const slotKey = slotKeyForSector(pack.sectorId, instance.suffix);
  const designType = instance.designTemplateType ?? inferDesignTemplateType(slotKey);
  return {
    slot_key: slotKey,
    sector_id: pack.sectorId,
    label_tr: instance.labelTr,
    label_en: instance.labelEn,
    format: instance.format,
    pipeline: instance.pipeline ?? inferPipeline(instance.format),
    slot_role: instance.slotRole ?? inferSlotRole(instance.format),
    design_template_type: designType,
    library_slot_key: inferLibrarySlotKey(slotKey, designType),
    tier: instance.format === 'reel' || instance.format === 'carousel' ? 'premium' : 'standard',
    match_signals: buildMatchSignals(slotKey, designType),
    prompt_pack: instance.requiresPremiumComposition
      ? {
        ...buildDesignedStoryPromptPack(instance.labelEn),
        scene_hint_template: `{brand_name} — ${instance.labelEn} content for {content_brief}`,
      }
      : {
        scene_hint_template: `{brand_name} — ${instance.labelEn} content for {content_brief}`,
      },
    optional_tags: instance.optionalTags ?? [],
    enabled_by_default: instance.enabledByDefault ?? true,
    sort_order: sortOrder,
    status: 'active',
  };
}

/** Synthesize full sector catalog client-side when DB has no rows. */
export function synthesizeSectorSlotDefinitions(
  sectorId: string,
  facilities?: BrandSlotFacilities,
): ProductionSlotDefinition[] {
  const pack = getSectorSlotPack(sectorId);
  if (!pack) return [];
  return pack.instances.map((inst, idx) =>
    instanceToSlotDefinition(pack, inst, (idx + 1) * 10, facilities),
  );
}

export function buildSectorSeedFromPacks(): Array<{
  sector_id: string;
  label_tr: string;
  label_en: string;
  aliases: string[];
  sort_order: number;
}> {
  return SECTOR_SLOT_PACKS.map((p) => ({
    sector_id: p.sectorId,
    label_tr: p.labelTr,
    label_en: p.labelEn,
    aliases: p.aliases,
    sort_order: p.sortOrder,
  }));
}

export function buildSlotKeysBySectorFromPacks(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const pack of SECTOR_SLOT_PACKS) {
    out[pack.sectorId] = pack.instances.map((i) => slotKeyForSector(pack.sectorId, i.suffix));
  }
  return out;
}

export function buildOptionalTagsBySlotKey(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const pack of SECTOR_SLOT_PACKS) {
    for (const inst of pack.instances) {
      if (inst.optionalTags?.length) {
        out[slotKeyForSector(pack.sectorId, inst.suffix)] = inst.optionalTags;
      }
    }
  }
  return out;
}

export const FACILITY_HINT_LABELS_TR: Record<keyof BrandSlotFacilities, string> = {
  pool: 'Havuz yoksa kapatabilirsiniz',
  dj_stage: 'DJ sahnesi yoksa kapatabilirsiniz',
  full_menu: 'Tam menü yoksa kapatabilirsiniz',
  spa: 'Spa yoksa kapatabilirsiniz',
  outdoor_terrace: 'Açık teras yoksa kapatabilirsiniz',
  private_events: 'Özel etkinlik alanı yoksa kapatabilirsiniz',
  live_music: 'Canlı müzik yoksa kapatabilirsiniz',
  classes: 'Grup dersi yoksa kapatabilirsiniz',
  kids_area: 'Çocuk alanı yoksa kapatabilirsiniz',
  delivery: 'Teslimat yoksa kapatabilirsiniz',
};

export function facilityHintForSlot(optionalTags?: string[]): string | null {
  if (!optionalTags?.length) return null;
  for (const tag of optionalTags) {
    const facility = parseFacilityFromTag(tag);
    if (facility && FACILITY_HINT_LABELS_TR[facility]) {
      return FACILITY_HINT_LABELS_TR[facility];
    }
  }
  return 'İsteğe bağlı — işletmenizde yoksa kapatabilirsiniz';
}

export function isOptionalCatalogSlot(optionalTags?: string[]): boolean {
  return Boolean(optionalTags?.some((t) => t.startsWith(REQUIRES_PREFIX)));
}

/** Read slot_facilities from brand_theme JSON (snake or camel). */
export function readBrandSlotFacilitiesFromTheme(
  theme?: Record<string, unknown> | null,
): BrandSlotFacilities | undefined {
  if (!theme || typeof theme !== 'object') return undefined;
  const raw = theme.slot_facilities ?? theme.slotFacilities;
  return raw && typeof raw === 'object' ? raw as BrandSlotFacilities : undefined;
}
