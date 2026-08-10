import { describe, expect, it } from 'vitest';
import {
  buildReelCoverDiversityDirectives,
  mapLayoutCanvaToReelArchetype,
  preferCoverCanvaForReelArchetype,
  resolveReelArchetypeForProduction,
} from '../reel-canva-archetypes';
import { resolveReelProductionRecipe } from '../reel-production-recipe';
import {
  pickReelBeatPhotoUrls,
  shouldRunReelBeatMontage,
} from '../reel-beat-montage';

describe('reel canva archetype → recipe', () => {
  it('maps layout canva ids to reel archetypes', () => {
    expect(mapLayoutCanvaToReelArchetype('cinematic_full_bleed')).toBe('venue_atmosphere');
    expect(mapLayoutCanvaToReelArchetype('neon_night_promo')).toBe('event_energy');
    expect(mapLayoutCanvaToReelArchetype('frosted_quote_card')).toBe('testimonial_moment');
    expect(mapLayoutCanvaToReelArchetype('product_hero_card')).toBe('product_hero');
  });

  it('resolves cocktail slot to product_hero with sequential beats', () => {
    const recipe = resolveReelProductionRecipe({
      sector: 'beach_club',
      catalogSlotKey: 'restaurant_cafe_cocktail_bar_reel',
      canvaArchetypeId: 'split_feature_panel',
      headline: 'Sip into Summer',
      caption: 'Fresh cocktails by the sea',
    });
    expect(recipe.reelArchetypeId).toBe('product_hero');
    expect(recipe.editStyle).toBe('sequential_beats');
    expect(recipe.beatCount).toBeGreaterThanOrEqual(2);
    expect(recipe.coverCanvaId).toBeTruthy();
  });

  it('event layout forces event_energy cover diversity (no sandwich language)', () => {
    const arch = resolveReelArchetypeForProduction({
      canvaArchetypeId: 'event_ticket_stub',
      catalogSlotKey: 'beach_club_dj_night_teaser_reel',
      headline: 'Saturday Night Live',
    });
    expect(arch.id).toBe('event_energy');
    const dirs = buildReelCoverDiversityDirectives({
      reelArchetype: arch,
      coverCanvaId: 'event_ticket_stub',
    });
    expect(dirs.some((d) => /event_energy|ticket|neon/i.test(d))).toBe(true);
    expect(dirs.some((d) => /REJECT|FORBIDDEN|DIVERSITY/i.test(d))).toBe(true);
  });

  it('prefers archetype cover family when current cover is off-family', () => {
    const preferred = preferCoverCanvaForReelArchetype('venue_atmosphere', 'campaign_hero_block');
    expect(preferred).toBe('cinematic_full_bleed');
  });

  it('keeps current cover when already in archetype preferred family', () => {
    expect(preferCoverCanvaForReelArchetype('venue_atmosphere', 'noir_editorial')).toBe('noir_editorial');
  });

  it('venue atmosphere recipe stays photo_plate + minimal type', () => {
    const recipe = resolveReelProductionRecipe({
      sector: 'beach_club',
      canvaArchetypeId: 'cinematic_full_bleed',
      headline: 'Sunset Terrace',
      caption: 'Golden hour vibes',
    });
    expect(recipe.reelArchetypeId).toBe('venue_atmosphere');
    expect(recipe.motionMode).toBe('photo_plate');
    expect(recipe.onCanvasDensity).toBe('minimal');
  });
});

describe('reel beat montage helpers', () => {
  it('picks distinct beat photos up to cost-cap (2)', () => {
    const urls = pickReelBeatPhotoUrls({
      primaryUrl: 'https://cdn.example.com/a.jpg',
      candidates: [
        'https://cdn.example.com/b.jpg',
        'https://cdn.example.com/a.jpg',
        'https://cdn.example.com/c.jpg',
      ],
      beatCount: 3,
    });
    expect(urls).toEqual([
      'https://cdn.example.com/a.jpg',
      'https://cdn.example.com/b.jpg',
    ]);
  });

  it('shouldRunReelBeatMontage requires sequential + 2 photos', () => {
    const recipe = resolveReelProductionRecipe({
      catalogSlotKey: 'restaurant_cafe_cocktail_bar_reel',
      canvaArchetypeId: 'split_feature_panel',
    });
    expect(shouldRunReelBeatMontage({
      recipe,
      photoUrls: ['https://x.com/1.jpg'],
      productionTier: 'premium',
    })).toBe(false);
    expect(shouldRunReelBeatMontage({
      recipe,
      photoUrls: ['https://x.com/1.jpg', 'https://x.com/2.jpg'],
      productionTier: 'premium',
    })).toBe(true);
  });
});
