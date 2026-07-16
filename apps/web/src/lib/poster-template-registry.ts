/**
 * Poster template registry — resolve, showcase jobs, evaluation.
 */

import { AGENCY_BRAND_KITS, getBrandKit } from './agency-brand-kits';
import {
  POSTER_FAMILY_META,
  POSTER_TEMPLATE_CATALOG,
  POSTER_TEMPLATE_BY_ID,
  getPosterTemplate,
  listPostersByFormat,
} from './poster-template-catalog';
import type {
  PosterFormat,
  PosterLayoutFamily,
  PosterShowcaseJob,
  PosterTemplateDefinition,
} from './poster-template-types';
import type { AgencyBrandKit } from './story-template-types';

const PHOTOS_NIGHTLIFE = [
  'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1080&q=85',
  'https://images.unsplash.com/photo-1459749411175-04bf5132ceea?w=1080&q=85',
  'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1080&q=85',
  'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=1080&q=85',
  'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1080&q=85',
];

const PHOTOS_LUXURY = [
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1080&q=85',
  'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=1080&q=85',
  'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=1080&q=85',
];

const PHOTOS_RESTAURANT = [
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1080&q=85',
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1080&q=85',
];

const PHOTOS_BY_FAMILY: Record<PosterLayoutFamily, string[]> = {
  lineup_tiered: PHOTOS_NIGHTLIFE,
  festival_grid: PHOTOS_NIGHTLIFE,
  dj_night: PHOTOS_NIGHTLIFE,
  neon_club: PHOTOS_NIGHTLIFE,
  promo_split: PHOTOS_NIGHTLIFE,
  event_masthead: PHOTOS_NIGHTLIFE,
  editorial_date: PHOTOS_LUXURY,
  gala_invite: PHOTOS_LUXURY,
  art_deco: PHOTOS_LUXURY,
  restaurant_feature: PHOTOS_RESTAURANT,
};

const LINEUP_TIERED = ['DJ KARMA', 'LUNA B2B', 'ALEX V'];
const LINEUP_FESTIVAL = ['Cuma: Main Stage', 'Cmt: Sunset Stage', 'Pazar: Closing'];
const LINEUP_DJ = ['Resident Set', 'Guest DJ', 'Opening'];

function demoCopyForFamily(family: PosterLayoutFamily): {
  headline: string;
  subtitle: string;
  eventDate: string;
  eventTime: string;
  cta: string;
  lineupArtists?: string[];
} {
  switch (family) {
    case 'lineup_tiered':
      return {
        headline: 'SUMMER SESSIONS',
        subtitle: 'Rooftop · Dancefloor',
        eventDate: '15 HAZİRAN',
        eventTime: '21:00',
        cta: 'Bilet Al',
        lineupArtists: LINEUP_TIERED,
      };
    case 'festival_grid':
      return {
        headline: 'SUNSET FEST',
        subtitle: '3 Gün · 4 Sahne · İstanbul',
        eventDate: '20–22 TEMMUZ',
        eventTime: '18:00',
        cta: 'Erken Bilet',
        lineupArtists: LINEUP_FESTIVAL,
      };
    case 'dj_night':
    case 'neon_club':
      return {
        headline: 'DEEP HOUSE NIGHT',
        subtitle: 'Resident & Guest DJs',
        eventDate: 'CUMARTESİ',
        eventTime: '23:00',
        cta: 'Masa Ayırt',
        lineupArtists: LINEUP_DJ,
      };
    case 'promo_split':
      return {
        headline: '%30 YAZ İNDİRİMİ',
        subtitle: 'Erken kayıt fırsatı',
        eventDate: '12 HAZİRAN',
        eventTime: 'Tüm Gün',
        cta: 'Hemen Katıl',
      };
    case 'gala_invite':
    case 'art_deco':
      return {
        headline: 'GALA AKŞAMI',
        subtitle: 'Özel davet · Black tie',
        eventDate: '28 HAZİRAN',
        eventTime: '20:30',
        cta: 'RSVP',
      };
    case 'editorial_date':
      return {
        headline: 'YAZ SEZONU',
        subtitle: 'Editorial launch',
        eventDate: '1 HAZİRAN',
        eventTime: '19:00',
        cta: 'Keşfet',
      };
    case 'event_masthead':
      return {
        headline: 'LIVE AT DAWN',
        subtitle: 'Sunrise session',
        eventDate: '7 HAZİRAN',
        eventTime: '05:30',
        cta: 'Bilet Al',
        lineupArtists: LINEUP_TIERED,
      };
    case 'restaurant_feature':
      return {
        headline: 'CHEF\'S TABLE',
        subtitle: '7 course tasting menu',
        eventDate: 'HER CUMA',
        eventTime: '20:00',
        cta: 'Rezervasyon',
      };
    default:
      return {
        headline: 'SUMMER SESSIONS',
        subtitle: 'Season opening',
        eventDate: '15 HAZİRAN',
        eventTime: '21:00',
        cta: 'Bilet Al',
      };
  }
}

export function buildPosterDemoProps(
  template: PosterTemplateDefinition,
  kit: AgencyBrandKit,
  format: PosterFormat,
) {
  const photos = PHOTOS_BY_FAMILY[template.family] ?? PHOTOS_NIGHTLIFE;
  const photoUrl = photos[template.variantIndex % photos.length]!;
  const copy = demoCopyForFamily(template.family);
  const needsLineup = template.spec.posterMode.includes('lineup')
    || template.spec.posterMode === 'dj_set'
    || template.spec.posterMode === 'festival_grid';

  return {
    posterTemplateId: template.id,
    kitId: kit.id,
    format,
    photoUrl,
    headline: copy.headline,
    subtitle: copy.subtitle,
    categoryLabel: template.collection.toUpperCase(),
    brandName: kit.name,
    location: 'İstanbul',
    primaryColor: kit.primaryColor,
    accentColor: kit.accentColor,
    fontFamily: kit.headingFont,
    eventDate: copy.eventDate,
    eventTime: copy.eventTime,
    cta: copy.cta,
    lineupArtists: needsLineup ? copy.lineupArtists : undefined,
  };
}

export function resolvePosterCompositionId(format: PosterFormat): 'SpecPosterStory' | 'SpecPosterPost' | 'SpecPosterPortrait' {
  if (format === 'post') return 'SpecPosterPost';
  if (format === 'portrait') return 'SpecPosterPortrait';
  return 'SpecPosterStory';
}

export function resolvePosterTemplateId(input: {
  posterTemplateId?: string;
  sector?: string;
  seed?: number;
}): string {
  if (input.posterTemplateId && POSTER_TEMPLATE_BY_ID.has(input.posterTemplateId)) {
    return input.posterTemplateId;
  }
  const norm = (input.sector ?? '').toLowerCase();
  const matched = POSTER_TEMPLATE_CATALOG.filter((t) =>
    t.sectors.some((s) => norm.includes(s.split('_')[0]!) || s.includes(norm)),
  );
  const pool = matched.length ? matched : POSTER_TEMPLATE_CATALOG;
  return pool[(input.seed ?? 0) % pool.length]!.id;
}

export function buildPosterShowcaseJobs(limit = 50): PosterShowcaseJob[] {
  const jobs: PosterShowcaseJob[] = [];
  const templates = POSTER_TEMPLATE_CATALOG.slice(0, limit);

  for (let i = 0; i < templates.length; i++) {
    const t = templates[i]!;
    const kit = AGENCY_BRAND_KITS[i % AGENCY_BRAND_KITS.length]!;
    const format = t.formats[i % t.formats.length] ?? 'story';
    const demo = buildPosterDemoProps(t, kit, format);
    jobs.push({
      templateId: t.id,
      kitId: kit.id,
      format,
      headline: demo.headline,
      subtitle: demo.subtitle,
      categoryLabel: demo.categoryLabel,
      photoUrl: demo.photoUrl,
      eventDate: demo.eventDate,
      eventTime: demo.eventTime,
      lineupArtists: demo.lineupArtists,
    });
  }
  return jobs;
}

export function getPosterEvaluation(template: PosterTemplateDefinition) {
  const s = template.spec;
  return {
    font: { personality: s.fontPersonality, weight: s.heroWeight, uppercase: s.heroUppercase },
    background: { photoRatio: s.photoRatio, gradient: `${Math.round(s.gradientStart * 100)}→${Math.round(s.gradientEnd * 100)}%`, duotone: s.duotoneWash },
    design: { mode: s.posterMode, header: s.posterHeader, footer: s.posterFooter, frame: s.frame },
    color: { neon: s.neonGlow, panelPrimary: s.panelUsesPrimary, vignette: s.vignette },
  };
}

export {
  POSTER_TEMPLATE_CATALOG,
  POSTER_FAMILY_META,
  getPosterTemplate,
  getBrandKit,
  listPostersByFormat,
};
