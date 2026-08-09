/**
 * Sector packs (Sprint 6).
 *
 * Maps a tenant's business_type to a sector pack, and emits sector-specific
 * SignalRecords that turn raw temporal facts into concrete, on-brand triggers
 * (e.g. beach_hospitality + full moon → "Full moon beach party brief").
 *
 * Packs also EMPHASISE which universal signal types matter most for the sector,
 * so the Strategist weights them correctly. Aligns with the Python industry
 * playbook ids (normalize_industry_id).
 */

import type { SignalRecord, SignalType } from './types';
import { normalizeSeasonKey, type SignalLanguage } from './language';

export type SectorPackId =
  | 'beach_hospitality'
  | 'nightlife'
  | 'urban_restaurant'
  | 'hotel'
  | 'wellness'
  | 'clinic'
  | 'retail'
  | 'local_artisan'
  | 'professional_service'
  | 'generic';

export interface SectorPack {
  id: SectorPackId;
  label: string;
  /** Universal signal types this sector cares about most (confidence boost). */
  emphasis: SignalType[];
}

const PACKS: Record<SectorPackId, SectorPack> = {
  beach_hospitality:    { id: 'beach_hospitality',    label: 'Beach / Sahil',         emphasis: ['lunar', 'golden_hour', 'season', 'weekly_rhythm'] },
  nightlife:            { id: 'nightlife',            label: 'Gece Hayatı / Kulüp',   emphasis: ['lunar', 'weekly_rhythm', 'day_part'] },
  urban_restaurant:     { id: 'urban_restaurant',     label: 'Restoran / Kafe',       emphasis: ['weekly_rhythm', 'holiday', 'season'] },
  hotel:                { id: 'hotel',                label: 'Otel / Resort',         emphasis: ['season', 'holiday', 'golden_hour'] },
  wellness:             { id: 'wellness',             label: 'Wellness / Güzellik',   emphasis: ['season', 'holiday', 'weekly_rhythm'] },
  clinic:               { id: 'clinic',               label: 'Klinik / Sağlık',       emphasis: ['season', 'holiday'] },
  retail:               { id: 'retail',               label: 'Perakende / E-ticaret', emphasis: ['holiday', 'season'] },
  local_artisan:        { id: 'local_artisan',        label: 'Yerel Ürünler / Butik', emphasis: ['season', 'holiday', 'weekly_rhythm'] },
  professional_service: { id: 'professional_service', label: 'Profesyonel Hizmet',    emphasis: ['weekly_rhythm', 'season'] },
  generic:              { id: 'generic',              label: 'Genel',                 emphasis: ['season', 'holiday'] },
};

/**
 * Resolve the best sector pack from business_type string + optional brand name / description.
 * Order matters: more specific checks first (beach > nightlife > hotel > restaurant).
 * Sector-agnostic and self-maintaining — no hardcoded brand names.
 */
/**
 * Resolve the best sector pack from business_type string + optional brand name / description.
 *
 * Priority:
 *   1. Exact business_type slug match (DB values like 'beach_club', 'local_products_shop')
 *   2. Keyword search across combined business_type + brand name + description
 *
 * This prevents false positives: 'local_products_shop' contains 'shop' and 'product'
 * which would wrongly match 'retail' without the exact-match pass.
 */
export function resolveSectorPack(
  businessType?: string,
  brandName?: string,
  description?: string,
): SectorPack {
  const bt = (businessType || '').toLowerCase().trim();

  // ── Pass 1: Exact / prefix business_type slug matching ────────────────────
  // These are the actual DB enum values returned by the Python backend.
  // Checked BEFORE keyword search to avoid false positives.
  const exactMatch: Record<string, SectorPackId> = {
    // Beach & hospitality
    'beach_club':            'beach_hospitality',
    'beach_resort':          'beach_hospitality',
    'beach_bar':             'beach_hospitality',
    // Nightlife
    'nightclub':             'nightlife',
    'night_club':            'nightlife',
    'bar':                   'nightlife',
    'lounge_bar':            'nightlife',
    // Restaurant & café
    'restaurant':            'urban_restaurant',
    'restaurant_cafe':       'urban_restaurant',
    'cafe':                  'urban_restaurant',
    'coffee_shop':           'urban_restaurant',
    'bistro':                'urban_restaurant',
    'restoran & bar':        'urban_restaurant',
    // Hotel
    'hotel':                 'hotel',
    'boutique_hotel':        'hotel',
    'resort':                'hotel',
    // Wellness & beauty
    'beauty_salon':          'wellness',
    'hair_salon':            'wellness',
    'wellness':              'wellness',
    'spa':                   'wellness',
    'gym':                   'wellness',
    'fitness':               'wellness',
    'yoga_studio':           'wellness',
    'pilates_studio':        'wellness',
    // Clinic & health
    'clinic':                'clinic',
    'healthcare_clinic':     'clinic',
    'dental_clinic':         'clinic',
    'medical_clinic':        'clinic',
    'hospital':              'clinic',
    'physio':                'clinic',
    // Local artisan / yerel ürünler
    'local_products_shop':   'local_artisan',
    'local_products':        'local_artisan',
    'artisan':               'local_artisan',
    'handcraft':             'local_artisan',
    'yoresel':               'local_artisan',
    'local_food':            'local_artisan',
    // Professional services
    'local_service_business':'professional_service',
    'agency_services':       'professional_service',
    'consulting':            'professional_service',
    'law_firm':              'professional_service',
    'accounting':            'professional_service',
    // Kids party / event venues (prefer professional_service seasonality over nightlife)
    'kids_party_venue':      'professional_service',
    'kids_party':            'professional_service',
    'wedding_event':         'professional_service',
    // Retail / e-commerce
    'retail':                'retail',
    'ecommerce':             'retail',
    'e-ticaret':             'retail',
    'online_store':          'retail',
    'fashion':               'retail',
    'clothing':              'retail',
  };

  for (const [slug, packId] of Object.entries(exactMatch)) {
    if (bt === slug || bt.startsWith(slug + '_') || bt.endsWith('_' + slug)) {
      return PACKS[packId];
    }
  }

  // ── Pass 2: Keyword search (broader, may produce false positives — used only as fallback) ──
  const combined = [businessType, brandName, description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[\s/]+/g, '_');
  const has = (...keys: string[]) => keys.some((k) => combined.includes(k));

  // Beach / coastal venue
  if (has('beach', 'sahil', 'plaj', 'beach_club', 'coastal', 'beachfront', 'waterfront',
          'sea_club', 'deniz_kiyisi', 'beach_resort')) return PACKS.beach_hospitality;
  // Nightlife
  if (has('nightclub', 'gece_kulübü', 'discotheque')) return PACKS.nightlife;
  // Hotel / resort
  if (has('hotel', 'otel', 'resort', 'pansiyon', 'boutique_hotel')) return PACKS.hotel;
  // Restaurant / café
  if (has('restaurant', 'restoran', 'cafe', 'kafe', 'coffee', 'kahve', 'bistro',
          'brasserie', 'steakhouse', 'pizzeria', 'kebap')) return PACKS.urban_restaurant;
  // Beauty / wellness
  if (has('beauty', 'wellness', 'spa', 'güzellik', 'guzellik', 'kuaför', 'kuafor',
          'aesthetic', 'estetik', 'pilates', 'yoga')) return PACKS.wellness;
  // Clinic / health
  if (has('clinic', 'klinik', 'health', 'sağlık', 'saglik', 'medical', 'medikal',
          'dental', 'diş', 'hospital', 'hastane')) return PACKS.clinic;
  // Local artisan / handcraft — before retail (contains 'shop')
  if (has('local_products', 'yöresel', 'yoresel', 'handcraft', 'artisan', 'zanaatkar')) return PACKS.local_artisan;
  // Professional services
  if (has('agency', 'consulting', 'hizmet', 'service', 'danışmanlık', 'danismanlik')) return PACKS.professional_service;
  // Retail / e-commerce — LAST, only when clearly retail
  if (has('ecommerce', 'e-ticaret', 'online_store', 'fashion_brand', 'clothing_brand')) return PACKS.retail;
  return PACKS.generic;
}

export interface SectorContext {
  date: Date;
  /** Canonical season key (`summer`) or legacy TR label (`Yaz`). */
  season: string;
  isWeekend: boolean;
  dayOfWeek: number;
  /** A full-moon lunar signal is active within the horizon. */
  fullMoonActive: boolean;
  /** Brand content language — drives TR vs EN sector hooks. */
  language?: SignalLanguage;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sig(
  packId: SectorPackId,
  key: string,
  date: Date,
  title: string,
  hooks: string[],
  confidence: number,
  formats: string[] = ['post', 'story', 'reel'],
): SignalRecord {
  return {
    id: `sector:${packId}:${key}:${isoDate(date)}`,
    type: 'sector',
    title,
    windowStart: isoDate(date),
    windowEnd: isoDate(new Date(date.getTime() + 3 * 86_400_000)),
    confidence,
    verified: false,
    contentHooks: hooks,
    applicableFormats: formats,
    meta: { pack: packId, key },
  };
}

type Localized = { tr: [string, string[]]; en: [string, string[]] };

function pick(lang: SignalLanguage, loc: Localized): [string, string[]] {
  return lang === 'en' ? loc.en : loc.tr;
}

/**
 * Emit sector-specific signals from the resolved pack + current context facts.
 * These ride on top of the universal signals and make triggers concrete.
 */
export function sectorPackSignals(pack: SectorPack, ctx: SectorContext): SignalRecord[] {
  const out: SignalRecord[] = [];
  const lang: SignalLanguage = ctx.language ?? 'tr';
  const seasonKey = normalizeSeasonKey(ctx.season);
  const isSummer = seasonKey === 'summer';
  const isSpring = seasonKey === 'spring';
  const push = (
    key: string,
    loc: Localized,
    confidence: number,
    formats?: string[],
  ) => {
    const [title, hooks] = pick(lang, loc);
    out.push(sig(pack.id, key, ctx.date, title, hooks, confidence, formats));
  };

  switch (pack.id) {
    case 'beach_hospitality': {
      if (ctx.fullMoonActive) {
        push('full_moon_party', {
          tr: ['Full moon beach party', ['Dolunay sahil partisi / özel gece', 'Full moon DJ & kokteyl konsepti']],
          en: ['Full moon beach party', ['Full moon beach party / special night', 'Full moon DJ & cocktail concept']],
        }, 0.9);
      }
      if (isSummer) {
        push('pool_day', {
          tr: ['Yaz zirvesi — plaj/havuz günü', ['Gündüz plaj/havuz keyfi', 'Serinletici kokteyl & meze']],
          en: ['Summer peak — beach/pool day', ['Daytime beach/pool vibes', 'Refreshing cocktails & meze']],
        }, 0.8);
      }
      if (isSpring) {
        push('season_opening', {
          tr: ['Sezon açılışı', ['Yeni sezon açılış duyurusu', 'İlk güneşli hafta sonu daveti']],
          en: ['Season opening', ['New season opening announcement', 'First sunny weekend invitation']],
        }, 0.75);
      }
      if (ctx.isWeekend) {
        push('sunset_session', {
          tr: ['Gün batımı seansı', ['Gün batımı DJ / sunset oturumu', 'Altın saat manzara içeriği']],
          en: ['Sunset session', ['Sunset DJ / golden-hour set', 'Golden-hour view content']],
        }, 0.7);
      }
      break;
    }
    case 'nightlife': {
      if (ctx.fullMoonActive) {
        push('full_moon', {
          tr: ['Dolunay özel gece', ['Dolunay temalı parti', 'Guest DJ / özel performans']],
          en: ['Full moon special night', ['Full-moon themed party', 'Guest DJ / special performance']],
        }, 0.85);
      }
      if (ctx.dayOfWeek === 5 || ctx.dayOfWeek === 6) {
        push('weekend_lineup', {
          tr: ['Hafta sonu lineup', ['Bu hafta sonu DJ kadrosu', 'Masa rezervasyon çağrısı']],
          en: ['Weekend lineup', ['This weekend DJ lineup', 'Table reservation CTA']],
        }, 0.8);
      }
      break;
    }
    case 'urban_restaurant': {
      if (ctx.dayOfWeek === 0) {
        push('sunday_brunch', {
          tr: ['Pazar brunch', ['Pazar brunch menüsü daveti', 'Geç kahvaltı / aile masası']],
          en: ['Sunday brunch', ['Sunday brunch menu invitation', 'Late breakfast / family table']],
        }, 0.75);
      }
      if (ctx.dayOfWeek === 5) {
        push('weekend_reservation', {
          tr: ['Hafta sonu rezervasyon', ['Cuma/Cumartesi rezervasyon çağrısı', 'Şefin özel menüsü']],
          en: ['Weekend reservation', ['Friday/Saturday reservation CTA', "Chef's special menu"]],
        }, 0.7);
      }
      push('daily_special', {
        tr: ['Günün özel menüsü', ['Günün tabağı / şef önerisi']],
        en: ["Today's special", ["Dish of the day / chef's pick"]],
      }, 0.5, ['story', 'post']);
      break;
    }
    case 'hotel': {
      if (isSummer) {
        push('peak_season', {
          tr: ['Yüksek sezon', ['Son dakika konaklama / paket', 'Havuz & spa deneyimi']],
          en: ['Peak season', ['Last-minute stay / package', 'Pool & spa experience']],
        }, 0.75);
      }
      if (!isSummer) {
        push('off_season_spa', {
          tr: ['Sezon dışı spa/keyif', ['Sezon dışı spa & wellness paketi', 'Hafta sonu kaçamağı']],
          en: ['Off-season spa escape', ['Off-season spa & wellness package', 'Weekend getaway']],
        }, 0.6);
      }
      break;
    }
    case 'wellness': {
      if (isSpring) {
        push('spring_glow', {
          tr: ['Bahar bakımı', ['Bahara hazırlık bakım paketi']],
          en: ['Spring glow care', ['Spring-prep wellness package']],
        }, 0.7);
      }
      if (isSummer) {
        push('summer_ready', {
          tr: ['Yaza hazırlık', ['Yaza hazırlık / vücut bakımı']],
          en: ['Summer ready', ['Summer-ready body care']],
        }, 0.7);
      }
      break;
    }
    case 'clinic': {
      const seasonLabel = lang === 'en'
        ? (seasonKey ?? 'season')
        : (ctx.season || 'Sezon');
      push('seasonal_health', {
        tr: [`${seasonLabel} sağlık önerisi`, [`${seasonLabel} dönemine özel sağlık tavsiyesi`]],
        en: [`${seasonLabel} health tip`, [`Seasonal health advice for ${seasonLabel}`]],
      }, 0.5, ['post', 'story']);
      break;
    }
    case 'retail': {
      if (ctx.isWeekend) {
        push('weekend_offer', {
          tr: ['Hafta sonu fırsatı', ['Hafta sonu kampanyası', 'Yeni koleksiyon vitrin']],
          en: ['Weekend offer', ['Weekend campaign', 'New collection showcase']],
        }, 0.65);
      }
      break;
    }
    case 'local_artisan': {
      if (isSpring || isSummer) {
        push('seasonal_harvest', {
          tr: ['Sezon ürünleri', ['Yeni sezon yöresel ürünler / taze stok', 'El yapımı koleksiyon tanıtımı']],
          en: ['Seasonal products', ['New-season local goods / fresh stock', 'Handmade collection highlight']],
        }, 0.75, ['post', 'story']);
      }
      if (ctx.isWeekend) {
        push('weekend_market', {
          tr: ['Pazar piyasası', ['Hafta sonu yerel pazar / butik vitrin', 'Sipariş al / kapıda teslim içeriği']],
          en: ['Weekend market', ['Weekend local market / boutique display', 'Order / pickup content']],
        }, 0.65, ['post', 'story']);
      }
      if (ctx.fullMoonActive) {
        push('full_moon_local', {
          tr: ['Dolunay alışverişi', ['Özel dolunay indirimi / sınırlı seri']],
          en: ['Full moon shopping', ['Special full-moon deal / limited series']],
        }, 0.55);
      }
      break;
    }
    case 'professional_service': {
      if (ctx.isWeekend) {
        push('weekend_insight', {
          tr: ['Hafta sonu içgörüsü', ['Sektöre özel haftalık bilgi paylaşımı', 'Müşteri başarı hikayesi']],
          en: ['Weekend insight', ['Sector weekly tip', 'Customer success story']],
        }, 0.55, ['post', 'story']);
      }
      if (isSpring) {
        push('spring_planning', {
          tr: ['Sezon planlaması', ['Yeni çeyrek / sezon strateji ipuçları']],
          en: ['Season planning', ['New quarter / season strategy tips']],
        }, 0.5, ['post']);
      }
      break;
    }
    case 'generic':
    default:
      break;
  }
  return out;
}

export { PACKS as SECTOR_PACKS };
