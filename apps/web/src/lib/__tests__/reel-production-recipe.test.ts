import { describe, expect, it } from 'vitest';
import {
  finalizeReelRecipe,
  inferReelPolicyFromSlotSignals,
  parseReelRecipePartial,
  resolveEffectiveReelMotionMode,
  resolveReelProductionRecipe,
  reelRecipeToJson,
  seedReelRecipeForTemplate,
} from '../reel-production-recipe';

describe('reel-production-recipe', () => {
  it('infers menu_highlight recipe for cocktail reel slots', () => {
    const partial = inferReelPolicyFromSlotSignals({
      catalogSlotKey: 'restaurant_cafe_cocktail_bar_reel',
      templateType: 'menu_highlight',
      sector: 'beach_club',
    });
    expect(partial.reelJob).toBe('menu_highlight');
    expect(partial.motionMode).toBe('photo_plate');
    expect(partial.editStyle).toBe('sequential_beats');
    expect(partial.logoPolicy).toBe('composite_only');
  });

  it('infers event_tease as hybrid with audio enabled', () => {
    const partial = inferReelPolicyFromSlotSignals({
      catalogSlotKey: 'beach_club_dj_night_teaser_reel',
      templateType: 'event_special',
    });
    expect(partial.reelJob).toBe('event_tease');
    expect(partial.motionMode).toBe('hybrid');
    expect(partial.audioEnabled).toBe(true);
    expect(partial.durationSecs).toBe(10);
  });

  it('resolve prefers template recipe over sector defaults', () => {
    const recipe = resolveReelProductionRecipe({
      sector: 'beach_club',
      catalogSlotKey: 'restaurant_cafe_cocktail_bar_reel',
      templateRecipe: {
        motion_mode: 'locked_graphics',
        on_canvas_density: 'minimal',
        camera: 'static',
        pace: 'slow_burn',
      },
    });
    expect(recipe.motionMode).toBe('locked_graphics');
    expect(recipe.camera).toBe('static');
    expect(recipe.pace).toBe('slow_burn');
    expect(resolveEffectiveReelMotionMode(recipe)).toBe('locked_graphics');
  });

  it('forces photo_plate when locked_graphics cover is too dense', () => {
    const recipe = finalizeReelRecipe({
      motionMode: 'locked_graphics',
      onCanvasDensity: 'hook_sub',
      fidelityGate: 'strict',
    });
    expect(resolveEffectiveReelMotionMode(recipe)).toBe('photo_plate');
  });

  it('mission spec can soft-override pace/camera', () => {
    const recipe = resolveReelProductionRecipe({
      catalogSlotKey: 'venue_atmosphere_reel',
      missionReelMotionSpec: {
        pace: 'fast_cut',
        camera_movement: 'orbit',
        audio_mood: 'sunset lounge',
      },
    });
    expect(recipe.pace).toBe('fast_cut');
    expect(recipe.camera).toBe('orbit_micro');
    expect(recipe.audioEnabled).toBe(true);
    expect(recipe.audioMood).toBe('sunset lounge');
  });

  it('seed + json round-trip keeps versioned snake_case', () => {
    const seeded = seedReelRecipeForTemplate({
      catalogSlotKey: 'local_products_shop_product_hero_reel',
      templateType: 'product_highlight',
      sector: 'local_products_shop',
    });
    const json = reelRecipeToJson(seeded);
    expect(json.version).toBe(1);
    expect(json.motion_mode).toBe('photo_plate');
    const parsed = parseReelRecipePartial(json);
    expect(parsed.motionMode).toBe('photo_plate');
    expect(parsed.reelJob).toBe('menu_highlight');
  });

  it('defaults photo_plate for generic slots across sectors', () => {
    for (const sector of ['beach_club', 'local_products_shop', 'beauty_salon']) {
      const recipe = resolveReelProductionRecipe({ sector, catalogSlotKey: 'generic_brand_reel' });
      expect(resolveEffectiveReelMotionMode(recipe)).toBe('photo_plate');
      expect(recipe.logoPolicy).toBe('composite_only');
      expect(recipe.headlinePolicy).toBe('verbatim');
    }
  });
});
