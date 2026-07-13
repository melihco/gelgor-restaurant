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
});
