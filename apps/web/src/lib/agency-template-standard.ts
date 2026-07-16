/**
 * Agency template standard — tüm story/poster şablonları bu çizgide etiketlenir ve yükseltilir.
 * Mevcut template ID'leri ve slot akışı değişmez; sadece collection + spec kalitesi normalize edilir.
 */
import type { StoryLayoutFamily, StoryLayoutSpec } from './story-template-types';
import type { PosterLayoutFamily, PosterLayoutSpec } from './poster-template-types';

export const AGENCY_STORY_COLLECTION = 'Agency' as const;
export const AGENCY_STORY_TAG = 'agency';

/** Legacy (pre-Agency) story aileleri — premium spec ile ajans seviyesine çekilir */
const LEGACY_STORY_FAMILIES = new Set<StoryLayoutFamily>([
  'editorial_bottom',
  'editorial_left',
  'split_panel',
  'magazine_cover',
  'cinematic_center',
  'campaign_hero',
  'gallery_series',
  'frosted_glass',
  'bold_impact',
  'noir_editorial',
]);

export const AGENCY_STORY_FAMILY_UPGRADES: Partial<Record<StoryLayoutFamily, Partial<StoryLayoutSpec>>> = {
  editorial_bottom: {
    fontPersonality: 'luxury_serif',
    heroWeight: 700,
    vignette: 'soft',
    kenBurnsScale: 1.08,
    overlayOpacity: 0.65,
    gradientStart: 0.54,
    gradientEnd: 0.8,
  },
  editorial_left: {
    fontPersonality: 'luxury_serif',
    vignette: 'soft',
    kenBurnsScale: 1.08,
    overlayOpacity: 0.62,
  },
  split_panel: {
    fontPersonality: 'luxury_serif',
    heroWeight: 700,
    accentLine: 'above',
    kenBurnsScale: 1.06,
  },
  magazine_cover: {
    fontPersonality: 'neo_grotesk',
    heroWeight: 900,
    vignette: 'soft',
    kenBurnsScale: 1.1,
    overlayOpacity: 0.64,
  },
  cinematic_center: {
    fontPersonality: 'luxury_serif',
    vignette: 'soft',
    kenBurnsScale: 1.08,
    overlayOpacity: 0.7,
  },
  campaign_hero: {
    fontPersonality: 'display_bold',
    vignette: 'radial',
    kenBurnsScale: 1.1,
    overlayOpacity: 0.72,
  },
  gallery_series: {
    fontPersonality: 'sans_modern',
    heroWeight: 800,
    accentLine: 'above',
  },
  frosted_glass: {
    fontPersonality: 'neo_grotesk',
    heroWeight: 800,
    vignette: 'soft',
    overlayOpacity: 0.58,
  },
  bold_impact: {
    fontPersonality: 'display_bold',
    vignette: 'radial',
    kenBurnsScale: 1.12,
    overlayOpacity: 0.72,
  },
  noir_editorial: {
    fontPersonality: 'luxury_serif',
    vignette: 'noir',
    overlayOpacity: 0.8,
  },
};

export const AGENCY_POSTER_FAMILY_UPGRADES: Partial<Record<PosterLayoutFamily, Partial<PosterLayoutSpec>>> = {
  promo_split: { vignette: 'radial', heroScale: 1.12, overlayOpacity: 0.54 },
  editorial_date: { fontPersonality: 'serif_editorial', heroWeight: 600, vignette: 'radial' },
  restaurant_feature: { fontPersonality: 'serif_editorial', vignette: 'radial', heroScale: 1.06 },
  gala_invite: { fontPersonality: 'serif_editorial', frame: 'thin', vignette: 'radial' },
  event_masthead: { heroWeight: 900, vignette: 'radial' },
  lineup_tiered: { heroScale: 1.08, vignette: 'radial' },
  festival_grid: { heroScale: 1.14, vignette: 'noir' },
  dj_night: { heroScale: 1.1, neonGlow: true },
  neon_club: { heroScale: 1.18, neonGlow: true },
  art_deco: { fontPersonality: 'serif_editorial', frame: 'double' },
};

export function getAgencyStoryFamilyUpgrade(family: StoryLayoutFamily): Partial<StoryLayoutSpec> | undefined {
  return AGENCY_STORY_FAMILY_UPGRADES[family];
}

export function isLegacyStoryFamily(family: StoryLayoutFamily): boolean {
  return LEGACY_STORY_FAMILIES.has(family);
}

export function normalizeAgencyStorySpec(
  family: StoryLayoutFamily,
  spec: StoryLayoutSpec,
  vibeCollection?: string,
): StoryLayoutSpec {
  const upgrade = getAgencyStoryFamilyUpgrade(family);
  const next: StoryLayoutSpec = {
    ...spec,
    ...(upgrade ?? {}),
    collection: AGENCY_STORY_COLLECTION,
  };
  return next;
}

export function agencyStoryTags(family: StoryLayoutFamily, vibeCollection: string, extra: string[]): string[] {
  const vibe = vibeCollection === 'Agency'
    ? (extra[0] ?? family)
    : vibeCollection.toLowerCase().replace(/\s+/g, '_');
  const tags = [AGENCY_STORY_TAG, `vibe_${vibe}`, ...extra];
  return [...new Set(tags)];
}

export function agencyPosterTags(vibeCollection: string, extra: string[]): string[] {
  const vibe = vibeCollection === 'Agency'
    ? (extra[0] ?? 'poster')
    : vibeCollection.toLowerCase().replace(/\s+/g, '_');
  return [...new Set([AGENCY_STORY_TAG, `vibe_${vibe}`, ...extra])];
}

export function isAgencyStoryTemplate(input: {
  collection?: string;
  tags?: string[];
}): boolean {
  return input.collection === AGENCY_STORY_COLLECTION || Boolean(input.tags?.includes(AGENCY_STORY_TAG));
}

/** Showcase / dropdown — her layout ailesinden bir öne çıkan varyant */
export const AGENCY_FEATURED_STORY_TEMPLATE_IDS = [
  'story_editorial_bottom_01',
  'story_editorial_left_01',
  'story_split_panel_02',
  'story_magazine_cover_07',
  'story_cinematic_center_04',
  'story_campaign_hero_03',
  'story_gallery_series_04',
  'story_frosted_glass_02',
  'story_bold_impact_03',
  'story_noir_editorial_03',
  'story_event_ticket_03',
  'story_diptych_collage_02',
  'story_minimal_luxury_03',
  'story_mosaic_pinterest_03',
  'story_asymmetric_editorial_04',
  'story_polaroid_single_02',
  'story_polaroid_stack_03',
  'story_vibe_fullscreen_04',
  'story_bento_story_07',
  'story_neon_night_02',
  'story_quote_card_05',
  'story_location_pin_01',
  'story_luxury_kinetic_type_01',
  'story_glassmorphism_showcase_01',
  'story_editorial_product_stage_01',
] as const;

const FEATURED_SET = new Set<string>(AGENCY_FEATURED_STORY_TEMPLATE_IDS);

export function isAgencyFeaturedStoryTemplate(templateId: string): boolean {
  return FEATURED_SET.has(templateId);
}

export function agencyStoryPickScore(templateId: string, tags: string[] = []): number {
  if (FEATURED_SET.has(templateId)) return 100;
  if (tags.includes(AGENCY_STORY_TAG)) return 50;
  return 0;
}
