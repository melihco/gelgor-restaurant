import { describe, expect, it } from 'vitest';

import {
  getCanvaArchetype,
  pickSectorArchetypePool,
  resolveCanvaArchetype,
  CANVA_ARCHETYPE_CATALOG,
} from '../canva-archetype-catalog';

describe('canva-archetype-catalog', () => {
  it('has at least 15 archetypes with layout specs', () => {
    expect(CANVA_ARCHETYPE_CATALOG.length).toBeGreaterThanOrEqual(15);
    for (const a of CANVA_ARCHETYPE_CATALOG) {
      expect(a.layoutPattern.length).toBeGreaterThan(10);
      expect(a.graphicAccents.length).toBeGreaterThan(0);
    }
  });

  it('resolves explicit agent canva_archetype id', () => {
    const a = resolveCanvaArchetype({
      format: 'reel',
      useCase: 'daily_story',
      explicitArchetypeId: 'neon_night_promo',
      caption: 'hello',
    });
    expect(a.id).toBe('neon_night_promo');
    expect(getCanvaArchetype('neon_night_promo')?.name).toBe('Neon Night Promo');
  });

  it('routes campaign copy to campaign_hero_block', () => {
    const a = resolveCanvaArchetype({
      format: 'post',
      useCase: 'campaign_offer',
      caption: '%30 indirim bu hafta sonu',
      headline: 'Yaz Kampanyası',
    });
    expect(a.id).toBe('campaign_hero_block');
  });

  it('rotates beach club layouts across mission fal slots', () => {
    const sector = 'beach_club_bar';
    const first = resolveCanvaArchetype({
      format: 'post',
      useCase: 'social_proof',
      caption: 'Mutlu müşterilerimiz',
      sector,
      slotOrdinal: 0,
    });
    const second = resolveCanvaArchetype({
      format: 'reel',
      useCase: 'social_proof',
      caption: 'Mutlu müşterilerimiz gece',
      sector,
      slotOrdinal: 1,
      usedArchetypeIds: [first.id],
    });
    expect(second.id).not.toBe(first.id);
  });

  it('uses different sector pools for different tenant verticals (same caption)', () => {
    const caption = 'Mutlu müşterilerimizle buluşun';
    const beach = resolveCanvaArchetype({
      format: 'post',
      useCase: 'social_proof',
      caption,
      sector: 'beach_club_bar',
    });
    const restaurant = resolveCanvaArchetype({
      format: 'post',
      useCase: 'social_proof',
      caption,
      sector: 'restaurant_cafe',
    });
    expect(beach.id).not.toBe(restaurant.id);
  });

  it('restaurant_cafe: prior-mission archetype is discouraged without leaving the sector pool', () => {
    const base = {
      format: 'post' as const,
      useCase: 'daily_story',
      caption: 'Bugün bahçemizde sizi bekliyoruz.',
      headline: 'Bugün Bahçede',
      sector: 'restaurant_cafe',
    };
    const first = resolveCanvaArchetype(base);
    const next = resolveCanvaArchetype({
      ...base,
      recentTenantArchetypeIds: [first.id],
    });
    expect(next.id).not.toBe(first.id);
    const pool = ['magazine_cover_drop', 'product_hero_card', 'split_feature_panel', 'polaroid_memory', 'cinematic_full_bleed', 'frosted_quote_card', 'social_proof_banner'];
    expect(pool).toContain(next.id);
  });

  it('local_products_shop: prior-mission archetype is discouraged without leaving the sector pool', () => {
    const base = {
      format: 'post' as const,
      useCase: 'daily_story',
      caption: 'Yeni hasat raflarda.',
      headline: 'Yeni Hasat',
      sector: 'local_products_shop',
    };
    const first = resolveCanvaArchetype(base);
    const next = resolveCanvaArchetype({
      ...base,
      recentTenantArchetypeIds: [first.id],
    });
    expect(next.id).not.toBe(first.id);
    const pool = ['product_hero_card', 'promo_price_stack', 'graphic_shape_stack', 'split_feature_panel', 'polaroid_memory', 'before_after_diptych', 'frosted_quote_card', 'location_pin_card'];
    expect(pool).toContain(next.id);
  });

  it('does not treat prior-mission memory as pool exhaustion', () => {
    const pool = pickSectorArchetypePool('local_products_shop', 'post');
    const a = resolveCanvaArchetype({
      format: 'post',
      useCase: 'product_highlight',
      caption: 'Erken hasat zeytinyağı',
      sector: 'local_products_shop',
      usedArchetypeIds: pool,
      recentTenantArchetypeIds: pool,
    });
    expect(pool).toContain(a.id);
    expect(a.id).not.toBe('neon_night_promo');
  });

  it('honors tenant preferred_canva_archetypes override', () => {
    const a = resolveCanvaArchetype({
      format: 'post',
      useCase: 'daily_story',
      sector: 'beach_club',
      tenantPreferredArchetypes: ['event_ticket_stub', 'frosted_quote_card'],
    });
    expect(['event_ticket_stub', 'frosted_quote_card']).toContain(a.id);
  });
});
