import { describe, expect, it } from 'vitest';

import {
  buildReelGenerationRequest,
  generateReelCreativeDirection,
} from '@/lib/reel-creative-director';
import { GENERIC_REEL_PROMPT_BANS } from '@/lib/reel-creative-direction';
import { finalizeReelRecipe } from '@/lib/reel-production-recipe';
import { mapReelRequestToFalPayload } from '@/lib/fal-video-provider';

function assertCommercialPrompt(prompt: string, negative: string, opts: {
  intensity: number;
  product?: boolean;
  logo?: boolean;
}) {
  const lower = prompt.toLowerCase();
  for (const ban of GENERIC_REEL_PROMPT_BANS) {
    expect(lower).not.toContain(ban);
  }
  expect(lower).not.toContain('cinematic motion freedom');
  expect(prompt).toMatch(/preserve the exact composition/i);
  expect(prompt).toMatch(/do not generate new text/i);
  expect(prompt).toMatch(/camera/i);
  expect(prompt).toMatch(/hero/i);
  expect(prompt).toMatch(new RegExp(`motion intensity ${opts.intensity} of 5`, 'i'));
  expect(negative).toMatch(/warped product|distorted geometry/i);
  expect(negative).toMatch(/generated typography|fake text/i);
  if (opts.product) {
    expect(prompt).toMatch(/geometrically identical/i);
  }
  if (opts.logo) {
    expect(prompt).toMatch(/do not modify, recreate, morph or hallucinate logos/i);
    expect(negative).toMatch(/altered logo|fake brand mark/i);
  }
}

describe('ReelCreativeDirector', () => {
  it('luxury product (local_products_shop) locks product and uses intensity 2', () => {
    const request = buildReelGenerationRequest({
      sourceImageUrl: 'https://cdn.example/still.jpg',
      directorInput: {
        sector: 'local_products_shop',
        catalogSlotKey: 'local_products_shop_product_hero_reel',
        motionStyle: 'luxury',
        qualityPreset: 'STANDARD',
        durationSecs: 5,
        recipe: finalizeReelRecipe({ camera: 'slow_push_in', pace: 'slow_burn' }),
      },
    });
    expect(request.creativeDirection.creativeIntent).toBe('product');
    expect(request.creativeDirection.motionIntensity).toBe(2);
    expect(request.creativeDirection.preserveProductGeometry).toBe(true);
    expect(request.creativeDirection.cameraMovement).toBe('slow_push_in');
    expect(request.shotPlan.shots).toHaveLength(1);
    assertCommercialPrompt(request.prompt, request.negativePrompt, {
      intensity: 2,
      product: true,
      logo: true,
    });
    expect(request.prompt).toMatch(/soft directional studio light/i);
    expect(request.prompt.toLowerCase()).not.toContain('luxury, premium, editorial');
  });

  it('fashion editorial allows tiny fabric motion, not a body rewrite', () => {
    const request = buildReelGenerationRequest({
      sourceImageUrl: 'https://cdn.example/look.jpg',
      directorInput: {
        sector: 'fashion_boutique',
        motionStyle: 'editorial',
        durationSecs: 5,
      },
    });
    expect(request.creativeDirection.creativeIntent).toBe('fashion');
    expect(request.creativeDirection.subjectMotion).toBe('fabric_breath');
    expect(request.creativeDirection.motionIntensity).toBe(2);
    expect(request.creativeDirection.allowObjectTransformation).toBe(false);
    assertCommercialPrompt(request.prompt, request.negativePrompt, {
      intensity: 2,
      logo: true,
    });
    expect(request.prompt).toMatch(/fabric or hair/i);
    expect(request.negativePrompt).toMatch(/extra limbs|morphing body/i);
  });

  it('restaurant food keeps vessels still and allows steam only', () => {
    const request = buildReelGenerationRequest({
      sourceImageUrl: 'https://cdn.example/plate.jpg',
      directorInput: {
        sector: 'restaurant_cafe',
        catalogSlotKey: 'restaurant_cafe_menu_reel',
        durationSecs: 5,
      },
    });
    expect(request.creativeDirection.creativeIntent).toBe('food');
    expect(request.creativeDirection.subjectMotion).toBe('steam_or_pour');
    expect(request.creativeDirection.preserveProductGeometry).toBe(true);
    assertCommercialPrompt(request.prompt, request.negativePrompt, {
      intensity: 2,
      product: true,
    });
    expect(request.prompt).toMatch(/steam or pour/i);
    expect(request.negativePrompt).toMatch(/melting plated food|invented garnish/i);
  });

  it('hotel / beach hospitality uses environmental motion, not subject action', () => {
    const hotel = buildReelGenerationRequest({
      sourceImageUrl: 'https://cdn.example/suite.jpg',
      directorInput: { sector: 'hospitality', durationSecs: 5 },
    });
    const beach = buildReelGenerationRequest({
      sourceImageUrl: 'https://cdn.example/terrace.jpg',
      directorInput: {
        sector: 'beach_club',
        catalogSlotKey: 'beach_club_sunset_reel',
        durationSecs: 5,
      },
    });
    expect(hotel.creativeDirection.creativeIntent).toBe('hospitality');
    expect(beach.creativeDirection.creativeIntent).toBe('hospitality');
    expect(hotel.creativeDirection.subjectMotion).toBe('environmental_only');
    expect(beach.prompt).toMatch(/distant environment|environment motion/i);
    assertCommercialPrompt(hotel.prompt, hotel.negativePrompt, { intensity: 2 });
    expect(hotel.negativePrompt).toMatch(/invented architecture/i);
  });

  it('corporate service stays near-static', () => {
    const request = buildReelGenerationRequest({
      sourceImageUrl: 'https://cdn.example/office.jpg',
      directorInput: {
        sector: 'agency_services',
        motionStyle: 'editorial',
        durationSecs: 5,
      },
    });
    expect(request.creativeDirection.creativeIntent).toBe('corporate');
    expect(request.creativeDirection.motionIntensity).toBe(1);
    expect(request.creativeDirection.cameraMovement).toBe('locked');
    assertCommercialPrompt(request.prompt, request.negativePrompt, { intensity: 1 });
    expect(request.prompt).toMatch(/locked tripod|no camera travel/i);
  });

  it('minimal product creative is lighting-only', () => {
    const request = buildReelGenerationRequest({
      sourceImageUrl: 'https://cdn.example/jar.jpg',
      directorInput: {
        sector: 'local_products_shop',
        motionStyle: 'minimal',
        durationSecs: 5,
      },
    });
    expect(request.creativeDirection.visualStyle).toBe('minimal_hold');
    expect(request.creativeDirection.motionIntensity).toBe(1);
    expect(request.creativeDirection.subjectMotion).toBe('frozen');
    assertCommercialPrompt(request.prompt, request.negativePrompt, {
      intensity: 1,
      product: true,
    });
    expect(request.prompt).toMatch(/hold the background still|no camera travel/i);
  });

  it('text-heavy slot freezes type and drops intensity to 1', () => {
    const request = buildReelGenerationRequest({
      sourceImageUrl: 'https://cdn.example/cover.jpg',
      directorInput: {
        sector: 'beach_club',
        catalogSlotKey: 'beach_club_offer_reel',
        headline: 'Sunset terrace reservations now open tonight',
        textHeavy: true,
        durationSecs: 5,
        recipe: finalizeReelRecipe({ onCanvasDensity: 'hook_sub', camera: 'slow_push_in' }),
      },
    });
    expect(request.creativeDirection.motionIntensity).toBe(1);
    expect(request.creativeDirection.preserveTypographySafeArea).toBe(true);
    expect(request.creativeDirection.allowGeneratedText).toBe(false);
    assertCommercialPrompt(request.prompt, request.negativePrompt, { intensity: 1 });
    expect(request.prompt).toMatch(/frozen text/i);
    expect(request.negativePrompt).toMatch(/new captions|generated typography/i);
  });

  it('logo-heavy slot forbids logo morph and keeps the frame locked', () => {
    const request = buildReelGenerationRequest({
      sourceImageUrl: 'https://cdn.example/branded.jpg',
      directorInput: {
        sector: 'local_products_shop',
        logoHeavy: true,
        hasLogo: true,
        durationSecs: 5,
        recipe: finalizeReelRecipe({ logoPolicy: 'baked_allowed', camera: 'orbit_micro' }),
      },
    });
    expect(request.creativeDirection.motionIntensity).toBe(1);
    expect(request.creativeDirection.preserveLogo).toBe(true);
    expect(request.creativeDirection.cameraMovement).toBe('locked');
    assertCommercialPrompt(request.prompt, request.negativePrompt, {
      intensity: 1,
      logo: true,
      product: true,
    });
  });

  it('campaign 8s product uses three controlled shots, not one complex wander', () => {
    const direction = generateReelCreativeDirection({
      sector: 'local_products_shop',
      motionStyle: 'luxury',
      qualityPreset: 'CAMPAIGN',
      durationSecs: 8,
    });
    expect(direction.shotCount).toBe(3);
    const request = buildReelGenerationRequest({
      sourceImageUrl: 'https://cdn.example/hero.jpg',
      directorInput: {
        sector: 'local_products_shop',
        motionStyle: 'luxury',
        qualityPreset: 'CAMPAIGN',
        durationSecs: 8,
      },
    });
    expect(request.shotPlan.shots).toHaveLength(3);
    expect(request.shotPlan.shots.map((s) => s.purpose)).toEqual([
      'hook',
      'hero',
      'final_hold',
    ]);
    expect(request.prompt).toMatch(/shot 1/i);
    expect(request.prompt).toMatch(/final hero/i);
  });

  it('maps the request onto fal without dropping the domain negative prompt', () => {
    const request = buildReelGenerationRequest({
      sourceImageUrl: 'https://cdn.example/still.jpg',
      directorInput: { sector: 'local_products_shop', durationSecs: 5 },
    });
    const payload = mapReelRequestToFalPayload(
      request,
      'fal-ai/kling-video/v3/standard/image-to-video',
    );
    expect(payload.start_image_url).toBe(request.sourceImageUrl);
    expect(String(payload.negative_prompt)).toContain('warped product');
    expect(String(payload.prompt)).toContain('Do not redesign the frame');
  });
});
