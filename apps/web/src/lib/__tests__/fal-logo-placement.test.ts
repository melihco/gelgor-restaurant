import { describe, expect, it } from 'vitest';

import { resolveFalDesignBrief } from '../fal-design-brief';
import {
  parseResolvedFalLogoPlacement,
  resolveArchetypeLogoPosition,
  resolveFalLogoPlacement,
} from '../fal-logo-placement';

describe('resolveFalLogoPlacement', () => {
  it('prefers agent logo_position over archetype default', () => {
    const placement = resolveFalLogoPlacement({
      agentLogoPosition: 'bottom_right',
      canvaArchetypeId: 'diagonal_brand_split',
      channel: 'feed_post',
    });
    expect(placement.source).toBe('agent');
    expect(placement.position).toBe('bottom_right');
  });

  it('uses archetype default when agent is silent', () => {
    expect(resolveArchetypeLogoPosition('diagonal_brand_split')).toBe('top_left');
    const placement = resolveFalLogoPlacement({
      canvaArchetypeId: 'diagonal_brand_split',
      channel: 'feed_post',
    });
    expect(placement.source).toBe('archetype');
    expect(placement.position).toBe('top_left');
  });

  it('parses agent logo_zone free text', () => {
    const placement = resolveFalLogoPlacement({
      agentLogoZone: 'Place logo inside the top color panel, upper-left of headline stack',
      canvaArchetypeId: 'split_feature_panel',
      channel: 'feed_post',
    });
    expect(placement.source).toBe('agent');
    expect(placement.zoneHint).toContain('top color panel');
  });

  it('moves top-center archetype logo to bottom-right on reels with upper headline', () => {
    const placement = resolveFalLogoPlacement({
      canvaArchetypeId: 'campaign_hero_block',
      layoutPattern: 'full_bleed_type — headline occupies 40–70% of canvas',
      typographyMode: 'oversized_display — text IS the hero',
      channel: 'reel',
    });
    expect(placement.position).toBe('bottom_right');
  });

  it('beach_club feed: moves logo off bottom type zone (design-fit)', () => {
    // cinematic_full_bleed defaults bottom_right — type zone also bottom → flip up.
    const placement = resolveFalLogoPlacement({
      canvaArchetypeId: 'cinematic_full_bleed',
      typeZoneAnchor: 'bottom_right',
      channel: 'feed_post',
      layoutPattern: 'full_bleed sunset hospitality post',
    });
    expect(placement.source).toBe('archetype');
    expect(placement.position).toBe('top_left');
  });

  it('local_products_shop feed: keeps archetype seat when type zone is opposite band', () => {
    // product_hero_card defaults bottom_right; type at top → no conflict.
    const placement = resolveFalLogoPlacement({
      canvaArchetypeId: 'product_hero_card',
      typeZoneAnchor: 'top_center',
      channel: 'feed_post',
      layoutPattern: 'product hero craft pack',
    });
    expect(placement.position).toBe('bottom_right');
  });

  it('local_products_shop: flips logo when agent seat collides with type zone', () => {
    const placement = resolveFalLogoPlacement({
      agentLogoPosition: 'top_left',
      typeZoneAnchor: 'top_left',
      channel: 'feed_post',
      canvaArchetypeId: 'product_hero_card',
    });
    expect(placement.source).toBe('agent');
    expect(placement.position).toBe('bottom_right');
  });
});

describe('parseResolvedFalLogoPlacement', () => {
  it('round-trips design_spec logoPlacement', () => {
    const parsed = parseResolvedFalLogoPlacement({
      position: 'top_left',
      zoneHint: 'away from type',
      source: 'archetype',
    });
    expect(parsed?.position).toBe('top_left');
    expect(parsed?.zoneHint).toBe('away from type');
    expect(parsed?.source).toBe('archetype');
  });
});

describe('resolveFalDesignBrief logoPlacement', () => {
  it('attaches logoPlacement from agent fal_design_brief', () => {
    const brief = resolveFalDesignBrief({
      caption: 'Meet our culinary team tonight',
      headline: 'Meet Our Culinary Team',
      format: 'post',
      sector: 'restaurant',
      referencePhotoUrl: 'https://cdn.example.com/kitchen.jpg',
      agentFalDesignBrief: {
        canva_archetype: 'diagonal_brand_split',
        logo_position: 'top_left',
        logo_zone: 'On the pink diagonal panel, above headline — never over the hands in the photo',
      },
    });

    expect(brief.logoPlacement?.source).toBe('agent');
    expect(brief.logoPlacement?.position).toBe('top_left');
    expect(brief.logoZone).toContain('pink diagonal panel');
  });
});
