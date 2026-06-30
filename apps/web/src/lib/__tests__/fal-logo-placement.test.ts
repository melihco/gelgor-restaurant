import { describe, expect, it } from 'vitest';

import { resolveFalDesignBrief } from '../fal-design-brief';
import {
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
