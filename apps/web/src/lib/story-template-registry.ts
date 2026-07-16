/**
 * Remotion template registry — resolves templates, kits, showcase jobs, routing.
 */

import type { ContentIntent } from './brand-motion-profile';
import type { StoryCompositionId } from './story-composition-types';
import {
  AGENCY_BRAND_KITS,
  getBrandKit,
} from './agency-brand-kits';
import type { AgencyBrandKit } from './story-template-types';
import {
  LEGACY_COMPOSITION_TEMPLATE,
  STORY_TEMPLATE_CATALOG,
  STORY_TEMPLATE_BY_ID,
  getStoryTemplate,
  listTemplatesForIntent,
} from './story-template-catalog';
import type { StoryShowcaseJob, StoryTemplateDefinition } from './story-template-types';
import { resolveKitSectorForVibe } from './sector-template-vibes';

const SHOWCASE_PHOTOS = [
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1080&q=85',
  'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=1080&q=85',
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1080&q=85',
  'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=1080&q=85',
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1080&q=85',
];

/** Verified Unsplash URLs for showcase / vibe presets (HTTP 200 checked). */
export const VERIFIED_SHOWCASE_PHOTOS = [
  ...SHOWCASE_PHOTOS,
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1080&q=85',
  'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=1080&q=85',
  'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1080&q=85',
  'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1080&q=85',
  'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1080&q=85',
  'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1080&q=85',
  'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1080&q=85',
  'https://images.unsplash.com/photo-1509048191080-d2984bad6ae5?w=1080&q=85',
  'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=1080&q=85',
  'https://images.unsplash.com/photo-1519823551278-64ac92734fb1?w=1080&q=85',
  'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=1080&q=85',
  'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=1080&q=85',
] as const;

export function pickVerifiedPhotoPool(startIndex: number, size = 7): string[] {
  const pool = VERIFIED_SHOWCASE_PHOTOS;
  return Array.from({ length: size }, (_, i) => pool[(startIndex + i) % pool.length]!);
}

/** Beach club / marina showcase — golden hour, pool, Aegean lounge */
/** HTTP 200 verified — beach, pool, resort lounge */
export const BEACH_CLUB_SHOWCASE_PHOTOS = [
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1080&q=85',
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1080&q=85',
  'https://images.unsplash.com/photo-1505142468610-359e7d316be0?w=1080&q=85',
  'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1080&q=85',
  'https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?w=1080&q=85',
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1080&q=85',
  'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=1080&q=85',
] as const;

export function pickBeachClubPhotoPool(startIndex = 0, size = 7): string[] {
  const pool = BEACH_CLUB_SHOWCASE_PHOTOS;
  return Array.from({ length: size }, (_, i) => pool[(startIndex + i) % pool.length]!);
}

/** Beauty salon / spa showcase — soft light, treatment, wellness (HTTP 200 verified) */
export const BEAUTY_SALON_SHOWCASE_PHOTOS = [
  'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=1080&q=85',
  'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=1080&q=85',
  'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=1080&q=85',
  'https://images.unsplash.com/photo-1519823551278-64ac92734fb1?w=1080&q=85',
  'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=1080&q=85',
  'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1080&q=85',
  'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=1080&q=85',
] as const;

export function pickBeautySalonPhotoPool(startIndex = 0, size = 7): string[] {
  const pool = BEAUTY_SALON_SHOWCASE_PHOTOS;
  return Array.from({ length: size }, (_, i) => pool[(startIndex + i) % pool.length]!);
}

export function resolveTemplateId(input: {
  templateId?: string;
  compositionId?: StoryCompositionId;
  intent?: ContentIntent;
  kitId?: string;
  seed?: number;
}): string {
  if (input.templateId && STORY_TEMPLATE_BY_ID.has(input.templateId)) {
    return input.templateId;
  }
  if (input.compositionId) {
    const familyTemplates = STORY_TEMPLATE_CATALOG.filter(
      (t) => t.legacyComposition === input.compositionId,
    );
    if (familyTemplates.length) {
      return familyTemplates[(input.seed ?? 0) % familyTemplates.length]!.id;
    }
    if (LEGACY_COMPOSITION_TEMPLATE[input.compositionId]) {
      return LEGACY_COMPOSITION_TEMPLATE[input.compositionId]!;
    }
  }
  const kit = input.kitId ? getBrandKit(input.kitId) : undefined;
  if (kit?.templateIds.length) {
    const idx = (input.seed ?? 0) % kit.templateIds.length;
    return kit.templateIds[idx]!;
  }
  if (input.intent) {
    const matches = listTemplatesForIntent(input.intent);
    if (matches.length) return matches[(input.seed ?? 0) % matches.length]!.id;
  }
  return STORY_TEMPLATE_CATALOG[0]!.id;
}

export function resolveLegacyComposition(templateId: string): StoryCompositionId {
  return getStoryTemplate(templateId)?.legacyComposition ?? 'EditorialStory';
}

export function buildShowcaseJobs(limit = 100): StoryShowcaseJob[] {
  const jobs: StoryShowcaseJob[] = [];
  const templates = STORY_TEMPLATE_CATALOG.slice(0, limit);

  for (let i = 0; i < templates.length; i++) {
    const template = templates[i]!;
    const kit = AGENCY_BRAND_KITS[i % AGENCY_BRAND_KITS.length]!;
    const photo = SHOWCASE_PHOTOS[i % SHOWCASE_PHOTOS.length]!;

    jobs.push({
      templateId: template.id,
      kitId: kit.id,
      headline: kit.showcaseHeadline,
      subtitle: kit.showcaseSubtitle,
      categoryLabel: kit.showcaseCategory,
      photoUrl: photo,
      galleryPhotoUrls: template.family === 'gallery_series'
        ? [SHOWCASE_PHOTOS[(i + 1) % SHOWCASE_PHOTOS.length]!, SHOWCASE_PHOTOS[(i + 2) % SHOWCASE_PHOTOS.length]!]
        : undefined,
    });
  }
  return jobs;
}

export function getTemplateEvaluation(template: StoryTemplateDefinition) {
  const s = template.spec;
  return {
    font: {
      personality: s.fontPersonality,
      weight: s.heroWeight,
      uppercase: s.heroUppercase,
      tracking: s.heroTracking,
      scale: s.heroScale,
    },
    background: {
      mode: s.backgroundMode,
      gradient: `${Math.round(s.gradientStart * 100)}% → ${Math.round(s.gradientEnd * 100)}%`,
      overlay: s.overlayOpacity,
      kenBurns: s.kenBurnsOrigin,
      vignette: s.vignette,
      duotone: s.duotoneWash,
    },
    design: {
      zone: s.textZone,
      align: s.align,
      accent: s.accentLine,
      frame: s.frame,
      frosted: s.frostedCard,
      sideBar: s.sideBar,
    },
    color: {
      panelPrimary: s.panelUsesPrimary,
      accentCategory: s.accentOnCategory,
      textOnPhoto: s.textOnPhoto,
    },
  };
}

export function listRegistrySummary() {
  return {
    templateCount: STORY_TEMPLATE_CATALOG.length,
    kitCount: AGENCY_BRAND_KITS.length,
    families: [...new Set(STORY_TEMPLATE_CATALOG.map((t) => t.family))].length,
    collections: [...new Set(STORY_TEMPLATE_CATALOG.map((t) => t.collection))],
  };
}

/**
 * Canonical business sectors → concrete kit sector (one of the 50 AGENCY_BRAND_KITS
 * sectors). Covers the hospitality/retail slugs that onboarding produces but that
 * do NOT fuzzy-match a kit sector (e.g. `restaurant_bar`, `local_products_shop`),
 * which previously fell through to a random kit over all 50 — the root cause of a
 * beach bar being locked to `kit_36_vegan_cafe`.
 */
const EXPLICIT_SECTOR_TO_KIT_SECTOR: Record<string, string> = {
  beach_club: 'beach_club',
  beach_club_bar: 'beach_club',
  beach_bar: 'beach_club',
  restaurant_bar: 'cocktail_bar',
  restaurant_cafe: 'cafe_bakery',
  restaurant: 'mediterranean',
  bistro: 'mediterranean',
  fine_dining: 'fine_dining',
  steakhouse: 'steakhouse',
  seafood: 'seafood',
  sushi: 'sushi',
  rooftop_bar: 'rooftop_bar',
  cocktail_bar: 'cocktail_bar',
  wine_bar: 'wine_bar',
  nightclub: 'nightclub',
  cafe: 'cafe_bakery',
  cafe_bakery: 'cafe_bakery',
  patisserie: 'patisserie',
  brunch: 'brunch',
  hotel_hospitality: 'boutique_hotel',
  hospitality: 'boutique_hotel',
  boutique_hotel: 'boutique_hotel',
  fashion_boutique: 'fashion_retail',
  fashion_retail: 'fashion_retail',
  local_products_shop: 'fashion_retail',
  beauty_wellness: 'beauty_salon',
  fitness_gym: 'fitness',
  healthcare_clinic: 'dental',
};

/**
 * Versatile, sector-neutral kits used when a sector matches no kit at all. Bounded
 * to upscale/editorial identities so the worst case stays brand-appropriate (never
 * a wildly mismatched kit like vegan_cafe / pet_spa / kids_play for a bar).
 */
const NEUTRAL_FALLBACK_KIT_SECTORS = ['cafe_bakery', 'fine_dining', 'mediterranean', 'boutique_hotel', 'art_gallery'];

/**
 * Kits a sector may legitimately resolve to, in priority order:
 *   1) explicit canonical kit (single kit), else
 *   2) vibe + fuzzy matched kits.
 * Empty array means the sector is not confidently mappable to any kit family
 * (callers then use a neutral fallback and must NOT treat a locked kit as wrong).
 */
function candidateKitsForSector(sector: string): AgencyBrandKit[] {
  const norm = (sector ?? '').toLowerCase().replace(/\s+/g, '_');
  if (!norm) return [];

  const explicit = EXPLICIT_SECTOR_TO_KIT_SECTOR[norm];
  if (explicit) {
    const exactKit = AGENCY_BRAND_KITS.find((k) => k.sector === explicit);
    if (exactKit) return [exactKit];
  }

  const kitSector = resolveKitSectorForVibe(sector).toLowerCase().replace(/\s+/g, '_');
  return AGENCY_BRAND_KITS.filter(
    (k) => k.sector === kitSector
      || k.sector.includes(kitSector)
      || kitSector.includes(k.sector)
      || k.sector.includes(norm)
      || norm.includes(k.sector.split('_')[0]!),
  );
}

export function resolveKitForSector(sector: string, seed = 0): string {
  const candidates = candidateKitsForSector(sector);
  if (candidates.length) return candidates[seed % candidates.length]!.id;

  // No confident match — pick from a safe neutral pool (deterministic per seed),
  // never the full 50-kit pool which yields absurd sector mismatches.
  const neutral = AGENCY_BRAND_KITS.filter((k) => NEUTRAL_FALLBACK_KIT_SECTORS.includes(k.sector));
  const pool = neutral.length ? neutral : AGENCY_BRAND_KITS;
  return pool[seed % pool.length]!.id;
}

/**
 * Is a locked/saved kit still compatible with an authoritative sector?
 * Returns true when the sector is unmappable (cannot judge → don't churn) or when
 * the kit belongs to one of the sector's candidate kit families. Used to auto-heal
 * a kit that was locked while the business was misclassified (e.g. a beach bar
 * locked to vegan_cafe before its sector was corrected to restaurant/beach).
 */
export function kitMatchesSector(kitId: string | undefined | null, sector: string): boolean {
  if (!kitId) return false;
  const kit = getBrandKit(kitId);
  if (!kit) return true; // unknown kit id — don't churn
  const candidates = candidateKitsForSector(sector);
  if (candidates.length === 0) return true; // sector not confidently mappable
  return candidates.some((k) => k.sector === kit.sector);
}

export { AGENCY_BRAND_KITS, STORY_TEMPLATE_CATALOG, getStoryTemplate, getBrandKit };
