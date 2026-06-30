import { describe, expect, it } from 'vitest';

import {
  getCanvaArchetype,
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
