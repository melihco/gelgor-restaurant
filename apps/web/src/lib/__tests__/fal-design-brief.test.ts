import { describe, expect, it } from 'vitest';

import {
  buildFalDesignBriefDirectives,
  resolveFalDesignBrief,
  resolveFalDesignPromptContext,
} from '../fal-design-brief';

describe('fal-design-brief', () => {
  it('synthesizes designer directives from caption and template use case', () => {
    const { brief, promptDirectives } = resolveFalDesignPromptContext({
      caption: 'Bu yaz Bodrum gecelerinde dans edin! %20 indirim sadece bu hafta.',
      headline: 'Yaz Geceleri Başladı',
      mood: 'energetic',
      templateUseCase: 'campaign_offer',
      format: 'reel',
      slotRole: 'fal_reel_motion',
      referencePhotoUrl: 'https://cdn.example.com/party.jpg',
      sector: 'nightclub',
    });

    expect(brief.canvaArchetypeId).toBeTruthy();
    expect(brief.layoutPattern).toBeTruthy();
    expect(brief.graphicAccents.length).toBeGreaterThan(0);
    expect(promptDirectives.some((d) => d.startsWith('CANVA ARCHETYPE:'))).toBe(true);
    expect(promptDirectives.some((d) => d.startsWith('DESIGNER BRIEF:'))).toBe(true);
    expect(promptDirectives.some((d) => d.startsWith('CAPTION → VISUAL:'))).toBe(true);
  });

  it('routes beach club social proof to diagonal or social proof archetype', () => {
    const { brief } = resolveFalDesignPromptContext({
      caption: 'Cheers to our happy customers! Join us tonight.',
      headline: 'Mutlu Müşterilerimiz',
      format: 'post',
      templateUseCase: 'social_proof',
      sector: 'beach_club',
      referencePhotoUrl: 'https://cdn.example.com/party.jpg',
    });

    expect(['diagonal_brand_split', 'social_proof_banner', 'split_feature_panel']).toContain(
      brief.canvaArchetypeId,
    );
  });

  it('routes beach club venue showcase away from generic split panel', () => {
    const { brief } = resolveFalDesignPromptContext({
      caption: 'Havadan mekan manzarası',
      headline: 'Havadan Mekan',
      format: 'post',
      templateUseCase: 'daily_story',
      sector: 'beach_club',
      referencePhotoUrl: 'https://cdn.example.com/aerial.jpg',
      explicitCanvaArchetypeId: 'diagonal_brand_split',
    });

    expect(brief.canvaArchetypeId).toBe('diagonal_brand_split');
  });

  it('rotates archetypes across a mission when no explicit pick is supplied', () => {
    // Production used to hand the calendar matrix's default in as an explicit id.
    // An explicit id is absolute and also disables the repeat penalty and the
    // rotation boost, so one archetype was forced onto every slot in a mission.
    for (const sector of ['restaurant_cafe', 'local_products_shop']) {
      const used: string[] = [];
      for (let ordinal = 0; ordinal < 4; ordinal += 1) {
        const { brief } = resolveFalDesignPromptContext({
          caption: 'Bugün bahçemizde sizi bekliyoruz.',
          headline: 'Bugün Bahçede',
          format: 'post',
          templateUseCase: 'daily_story',
          sector,
          referencePhotoUrl: 'https://cdn.example.com/venue.jpg',
          usedArchetypeIds: used,
          falSlotOrdinal: ordinal,
        });
        used.push(brief.canvaArchetypeId);
      }
      expect(new Set(used).size).toBeGreaterThan(1);
    }
  });

  it('merges agent fal_design_brief over synthesized defaults', () => {
    const brief = resolveFalDesignBrief({
      caption: 'Mutlu müşterilerimiz',
      headline: 'Cheers!',
      format: 'post',
      agentFalDesignBrief: {
        creative_hook: 'Social proof quote card with warm crowd energy',
        layout_pattern: 'quote_card — frosted panel over photo',
        typography_mode: 'quote_pull',
        caption_visual_bridge: 'Celebrate customer joy visually',
        differentiator: 'Hand-lettered accent underline, not generic template',
        graphic_accents: ['quote marks', 'star accent'],
      },
    });

    expect(brief.creativeHook).toContain('Social proof quote card');
    expect(brief.layoutPattern).toContain('quote_card');
    expect(brief.differentiator).toContain('Hand-lettered');

    const directives = buildFalDesignBriefDirectives(brief, 'post');
    expect(directives.some((d) => d.startsWith('DIFFERENTIATOR:'))).toBe(true);
    expect(directives.some((d) => d.includes('quote marks'))).toBe(true);
  });

  it('maps premium_composition into layout and accents', () => {
    const brief = resolveFalDesignBrief({
      caption: 'Editorial chef spotlight',
      headline: 'Chef Table',
      format: 'reel',
      premiumComposition: {
        compositionType: 'graphic_layering',
        compositionDescription: 'Layered circles over left photo panel with bold headline right',
        creativeDirection: 'Modern dynamic social — not flat split',
        graphicElements: ['circle_frame', 'accent_line'],
        layoutStrategy: 'asymmetric',
        motionApproach: 'gentle push on photo zone',
      },
    });

    expect(brief.layoutPattern).toContain('layered_graphics');
    expect(brief.graphicAccents.join(' ')).toMatch(/circle/i);
    expect(brief.motionCue).toContain('gentle push');
  });

  it('uses Instagram Story channel language for story format (not feed 4:5)', () => {
    const brief = resolveFalDesignBrief({
      caption: 'Join us for tonight\'s tasting',
      headline: 'Join us today',
      format: 'story',
    });
    expect(brief.creativeHook).toMatch(/Instagram Story/i);
    expect(brief.creativeHook).not.toMatch(/\bfeed\b/i);
    expect(brief.motionCue).toBeUndefined();

    const directives = buildFalDesignBriefDirectives(brief, 'story');
    expect(directives.some((d) => d.includes('story 9:16'))).toBe(true);
    expect(directives.some((d) => d.includes('feed 4:5'))).toBe(false);
    expect(directives.some((d) => d.includes('REEL PREMIUM BAR'))).toBe(false);
  });

  it('prefers Feed Art Director reel_art_direction as motionCue and adds reel premium bar', () => {
    const brief = resolveFalDesignBrief({
      caption: 'Sunset cocktails on the terrace',
      headline: 'Golden Hour',
      format: 'reel',
      falDesignHint: 'editorial split — quiet type, photo lower half',
      reelArtDirection: 'Ultra-slow push-in on glass; soft light breath; typography frozen',
      reelSupportingSubjects: ['cocktail close-up', 'terrace sunset'],
    });

    expect(brief.motionCue).toContain('Ultra-slow push-in');
    expect(brief.designerRationale).toMatch(/Supporting gallery beats/);
    const directives = buildFalDesignBriefDirectives(brief, 'reel');
    expect(directives.some((d) => d.includes('REEL PREMIUM BAR'))).toBe(true);
    expect(directives.some((d) => d.includes('MOTION CUE') && d.includes('never alter text'))).toBe(true);
  });
});
