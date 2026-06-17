/**
 * Agency template standard — tüm story/poster şablonları bu çizgide etiketlenir ve yükseltilir.
 * Mevcut template ID'leri ve slot akışı değişmez; sadece collection + spec kalitesi normalize edilir.
 */
import type { RemotionLayoutFamily, RemotionLayoutSpec } from './remotion-template-types';
import type { PosterLayoutFamily, PosterLayoutSpec } from './poster-template-types';

export const AGENCY_STORY_COLLECTION = 'Agency' as const;
export const AGENCY_STORY_TAG = 'agency';

/** Legacy (pre-Agency) story aileleri — premium spec ile ajans seviyesine çekilir */
const LEGACY_STORY_FAMILIES = new Set<RemotionLayoutFamily>([
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

export const AGENCY_STORY_FAMILY_UPGRADES: Partial<Record<RemotionLayoutFamily, Partial<RemotionLayoutSpec>>> = {
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

export function getAgencyStoryFamilyUpgrade(family: RemotionLayoutFamily): Partial<RemotionLayoutSpec> | undefined {
  return AGENCY_STORY_FAMILY_UPGRADES[family];
}

export function isLegacyStoryFamily(family: RemotionLayoutFamily): boolean {
  return LEGACY_STORY_FAMILIES.has(family);
}

export function normalizeAgencyStorySpec(
  family: RemotionLayoutFamily,
  spec: RemotionLayoutSpec,
  vibeCollection?: string,
): RemotionLayoutSpec {
  const upgrade = getAgencyStoryFamilyUpgrade(family);
  const next: RemotionLayoutSpec = {
    ...spec,
    ...(upgrade ?? {}),
    collection: AGENCY_STORY_COLLECTION,
  };
  return next;
}

export function agencyStoryTags(family: RemotionLayoutFamily, vibeCollection: string, extra: string[]): string[] {
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
  'remotion_editorial_bottom_01',
  'remotion_editorial_left_01',
  'remotion_split_panel_02',
  'remotion_magazine_cover_07',
  'remotion_cinematic_center_04',
  'remotion_campaign_hero_03',
  'remotion_gallery_series_04',
  'remotion_frosted_glass_02',
  'remotion_bold_impact_03',
  'remotion_noir_editorial_03',
  'remotion_event_ticket_03',
  'remotion_diptych_collage_02',
  'remotion_minimal_luxury_03',
  'remotion_mosaic_pinterest_03',
  'remotion_asymmetric_editorial_04',
  'remotion_polaroid_single_02',
  'remotion_polaroid_stack_03',
  'remotion_vibe_fullscreen_04',
  'remotion_bento_story_07',
  'remotion_neon_night_02',
  'remotion_quote_card_05',
  'remotion_location_pin_01',
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
