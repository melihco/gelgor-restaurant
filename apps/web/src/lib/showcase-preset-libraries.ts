/**
 * Showcase preset → premium 5-slot template libraries.
 * Each vibe gets visually distinct families (not seed-random repeats).
 */
import {
  defaultSlotTypographyPatch,
  deriveBrandTemplateLibrary,
  type BrandTemplateLibrary,
  type BrandTemplateLibrarySlot,
} from './brand-template-library';
import { getBrandKit } from './agency-brand-kits';
import { BRAND_SHOWCASE_PRESETS } from './brand-showcase-presets';
import { REMOTION_TEMPLATE_BY_ID } from './story-template-catalog';
import { POSTER_TEMPLATE_BY_ID } from './poster-template-catalog';

type SlotPatch = Partial<Pick<BrandTemplateLibrarySlot, 'storyTemplateId' | 'posterTemplateId'>>;

const PRESET_SLOT_PATCHES: Record<string, Partial<Record<string, SlotPatch>>> = {
  vibe_minimal_spa: {
    daily_story: { storyTemplateId: 'remotion_frosted_glass_02' },
    event_story: { storyTemplateId: 'remotion_minimal_luxury_05' },
    campaign_post: { posterTemplateId: 'poster_editorial_date_03' },
    editorial_story: { storyTemplateId: 'remotion_vibe_fullscreen_02' },
    social_proof: { storyTemplateId: 'remotion_quote_card_04' },
  },
  vibe_luxury_hotel: {
    daily_story: { storyTemplateId: 'remotion_split_panel_02' },
    event_story: { storyTemplateId: 'remotion_event_ticket_02' },
    campaign_post: { posterTemplateId: 'poster_gala_invite_02' },
    editorial_story: { storyTemplateId: 'remotion_magazine_cover_07' },
    social_proof: { storyTemplateId: 'remotion_gallery_series_04' },
  },
  vibe_fine_dining: {
    daily_story: { storyTemplateId: 'remotion_noir_editorial_03' },
    event_story: { storyTemplateId: 'remotion_event_ticket_01' },
    campaign_post: { posterTemplateId: 'poster_restaurant_feature_03' },
    editorial_story: { storyTemplateId: 'remotion_asymmetric_editorial_02' },
    social_proof: { storyTemplateId: 'remotion_diptych_collage_02' },
  },
  vibe_night_bold: {
    daily_story: { storyTemplateId: 'remotion_neon_night_02' },
    event_story: { storyTemplateId: 'remotion_event_ticket_03' },
    campaign_post: { posterTemplateId: 'poster_neon_club_02' },
    editorial_story: { storyTemplateId: 'remotion_bold_impact_05' },
    social_proof: { storyTemplateId: 'remotion_bento_story_01' },
  },
  vibe_editorial_cafe: {
    daily_story: { storyTemplateId: 'remotion_polaroid_single_02' },
    event_story: { storyTemplateId: 'remotion_campaign_hero_04' },
    campaign_post: { posterTemplateId: 'poster_restaurant_feature_02' },
    editorial_story: { storyTemplateId: 'remotion_minimal_luxury_01' },
    social_proof: { storyTemplateId: 'remotion_mosaic_pinterest_03' },
  },
  vibe_playful_brunch: {
    daily_story: { storyTemplateId: 'remotion_mosaic_pinterest_04' },
    event_story: { storyTemplateId: 'remotion_campaign_hero_07' },
    campaign_post: { posterTemplateId: 'poster_promo_split_04' },
    editorial_story: { storyTemplateId: 'remotion_bento_story_06' },
    social_proof: { storyTemplateId: 'remotion_polaroid_stack_04' },
  },
  vibe_rooftop_cocktail: {
    daily_story: { storyTemplateId: 'remotion_cinematic_center_04' },
    event_story: { storyTemplateId: 'remotion_neon_night_01' },
    campaign_post: { posterTemplateId: 'poster_event_masthead_02' },
    editorial_story: { storyTemplateId: 'remotion_asymmetric_editorial_05' },
    social_proof: { storyTemplateId: 'remotion_vibe_fullscreen_04' },
  },
  vibe_beauty_salon: {
    daily_story: { storyTemplateId: 'remotion_frosted_glass_02' },
    event_story: { storyTemplateId: 'remotion_campaign_hero_05' },
    campaign_post: { posterTemplateId: 'poster_editorial_date_03' },
    editorial_story: { storyTemplateId: 'remotion_magazine_cover_07' },
    social_proof: { storyTemplateId: 'remotion_diptych_collage_02' },
  },
  vibe_barber_salon: {
    daily_story: { storyTemplateId: 'remotion_bold_impact_03' },
    event_story: { storyTemplateId: 'remotion_event_ticket_05' },
    campaign_post: { posterTemplateId: 'poster_promo_split_04' },
    editorial_story: { storyTemplateId: 'remotion_neon_night_01' },
    social_proof: { storyTemplateId: 'remotion_polaroid_stack_03' },
  },
  vibe_moving_logistics: {
    daily_story: { storyTemplateId: 'remotion_location_pin_01' },
    event_story: { storyTemplateId: 'remotion_campaign_hero_02' },
    campaign_post: { posterTemplateId: 'poster_restaurant_feature_02' },
    editorial_story: { storyTemplateId: 'remotion_split_panel_03' },
    social_proof: { storyTemplateId: 'remotion_quote_card_05' },
  },
  vibe_retail_store: {
    daily_story: { storyTemplateId: 'remotion_mosaic_pinterest_02' },
    event_story: { storyTemplateId: 'remotion_campaign_hero_03' },
    campaign_post: { posterTemplateId: 'poster_promo_split_05' },
    editorial_story: { storyTemplateId: 'remotion_asymmetric_editorial_02' },
    social_proof: { storyTemplateId: 'remotion_bento_story_07' },
  },
  vibe_coffee_shop: {
    daily_story: { storyTemplateId: 'remotion_vibe_fullscreen_04' },
    event_story: { storyTemplateId: 'remotion_event_ticket_02' },
    campaign_post: { posterTemplateId: 'poster_restaurant_feature_02' },
    editorial_story: { storyTemplateId: 'remotion_minimal_luxury_01' },
    social_proof: { storyTemplateId: 'remotion_quote_card_08' },
  },
  vibe_beach_club: {
    daily_story: { storyTemplateId: 'remotion_cinematic_center_04' },
    event_story: { storyTemplateId: 'remotion_event_ticket_02' },
    campaign_post: { posterTemplateId: 'poster_restaurant_feature_03' },
    editorial_story: { storyTemplateId: 'remotion_split_panel_02' },
    social_proof: { storyTemplateId: 'remotion_quote_card_05' },
  },
  yula_bodrum: {
    daily_story: { storyTemplateId: 'remotion_vibe_fullscreen_04' },
    event_story: { storyTemplateId: 'remotion_campaign_hero_03' },
    campaign_post: { posterTemplateId: 'poster_editorial_date_03' },
    editorial_story: { storyTemplateId: 'remotion_magazine_cover_07' },
    social_proof: { storyTemplateId: 'remotion_gallery_series_04' },
  },
};

function applyPatches(library: BrandTemplateLibrary, patches: Partial<Record<string, SlotPatch>>): BrandTemplateLibrary {
  return {
    ...library,
    slots: library.slots.map((slot) => {
      const patch = patches[slot.key];
      if (!patch) return slot;
      const storyTemplateId = patch.storyTemplateId && REMOTION_TEMPLATE_BY_ID.has(patch.storyTemplateId)
        ? patch.storyTemplateId
        : slot.storyTemplateId;
      const posterTemplateId = patch.posterTemplateId && POSTER_TEMPLATE_BY_ID.has(patch.posterTemplateId)
        ? patch.posterTemplateId
        : slot.posterTemplateId;
      const templateId = slot.format === 'post' ? posterTemplateId : storyTemplateId;
      const typoPatch = templateId
        ? defaultSlotTypographyPatch(templateId, slot.format === 'post' ? 'post' : 'story')
        : {};
      return { ...slot, storyTemplateId, posterTemplateId, ...typoPatch };
    }),
  };
}

export function resolveShowcasePresetLibrary(presetKey: string): BrandTemplateLibrary | null {
  const preset = BRAND_SHOWCASE_PRESETS[presetKey];
  if (!preset) return null;

  const kit = getBrandKit(preset.catalogKitId);
  const baseline = deriveBrandTemplateLibrary({
    kitId: preset.catalogKitId,
    sector: preset.sector,
    motionStyle: preset.motionStyle,
    tenantId: `showcase_${presetKey}`,
  });

  const patches = PRESET_SLOT_PATCHES[presetKey];
  if (!patches) return baseline;

  return applyPatches({
    ...baseline,
    kitId: kit?.id ?? baseline.kitId,
  }, patches);
}
