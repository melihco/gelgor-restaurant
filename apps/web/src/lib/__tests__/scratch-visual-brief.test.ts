import { describe, expect, it } from 'vitest';
import {
  buildScratchCreativePromptLines,
  buildScratchVisualBrief,
  scratchBriefTelemetry,
} from '../scratch-visual-brief';

describe('scratch-visual-brief / P5', () => {
  it('prioritizes visual_direction over caption for scene brief', () => {
    const brief = buildScratchVisualBrief({
      idea: {
        visual_direction: 'Wide terrace sunset with cocktails on marble table',
        strategic_purpose: 'Drive evening reservations',
        mood: 'golden hour',
        product_type: '',
        caption: 'Rezervasyon için DM — %20 indirim!',
        headline: 'Sunset Special',
      },
      headline: 'Sunset Special',
      caption: 'Rezervasyon için DM — %20 indirim!',
      mood: 'golden hour',
      assignment: {
        slot_role: 'organic_post',
        catalog_slot_key: 'beach_club_sunset_post',
        visual_subject_hint: 'terrace, cocktail',
      },
      missionBrief: 'Weekly sunset series',
    });

    expect(brief.sceneBrief).toMatch(/Wide terrace sunset/);
    expect(brief.sceneBrief).not.toMatch(/Rezervasyon için DM/);
    expect(brief.sources).toContain('visual_direction');
    expect(brief.sources).toContain('strategic_purpose');
    expect(brief.sources).toContain('slot_role');
    expect(brief.sources).toContain('mission_brief');
    expect(brief.briefThin).toBe(false);

    const lines = buildScratchCreativePromptLines({
      brief,
      headline: 'Sunset Special',
      caption: 'Rezervasyon için DM — %20 indirim!',
    }).join('\n');
    expect(lines).toMatch(/Primary scene brief:.*Wide terrace sunset/i);
    expect(lines).toMatch(/Narrative meaning to imply visually/);
    expect(lines).toMatch(/Rezervasyon için DM/);
    // Caption must not be the only / primary scene line
    const primaryIdx = lines.indexOf('Primary scene brief:');
    const narrativeIdx = lines.indexOf('Narrative meaning');
    expect(primaryIdx).toBeGreaterThanOrEqual(0);
    expect(narrativeIdx).toBeGreaterThan(primaryIdx);
  });

  it('local_products_shop brief uses product + VPS edit prompt', () => {
    const brief = buildScratchVisualBrief({
      idea: {
        visual_direction: 'Hero jar of fig jam on olive-wood board',
        product_type: 'fig jam',
        visual_production_spec: {
          image_edit_prompt: 'Preserve packaging label; warm lifestyle BG',
          shot_type: 'product_closeup',
        },
      },
      headline: 'İncir Reçeli',
      caption: 'Sipariş için link bio',
      assignment: { slot_role: 'fal_designed_post', catalog_slot_key: 'local_products_product_reveal_post' },
    });
    expect(brief.sources).toContain('product_type');
    expect(brief.sources).toContain('image_edit_prompt');
    expect(brief.sceneBrief).toMatch(/fig jam/i);
    expect(brief.sceneBrief).toMatch(/Preserve packaging/);
  });

  it('thin brief falls back to headline only', () => {
    const brief = buildScratchVisualBrief({
      idea: {},
      headline: 'Only Headline',
      caption: 'CTA only copy for discount week',
    });
    expect(brief.briefThin).toBe(true);
    expect(brief.sources).toContain('headline_fallback');
    expect(brief.sceneBrief).toBe('Only Headline');
  });

  it('telemetry marks idea_brief mode', () => {
    const brief = buildScratchVisualBrief({
      idea: { visual_direction: 'Pool daybeds at noon' },
      headline: 'Pool',
    });
    expect(scratchBriefTelemetry(brief)).toEqual({
      scratch_visual_mode: 'idea_brief',
      scratch_brief_sources: ['visual_direction'],
      scratch_brief_thin: false,
    });
  });
});
