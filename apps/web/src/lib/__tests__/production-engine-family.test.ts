import { describe, expect, it } from 'vitest';

import { resolveProductionEngineFamily } from '@/lib/production-engine-family';

describe('resolveProductionEngineFamily', () => {
  it('maps designed stills — including fallbacks — to gallery_design', () => {
    expect(resolveProductionEngineFamily({
      engine: 'gpt_image_designed',
      pipeline: 'fal_design',
    })).toBe('gallery_design');
    expect(resolveProductionEngineFamily({
      engine: 'fal_ideogram',
      pipeline: 'fal_design',
    })).toBe('gallery_design');
    expect(resolveProductionEngineFamily({
      engine: 'satori_local',
      pipeline: 'fal_design',
    })).toBe('gallery_design');
    expect(resolveProductionEngineFamily({
      engine: 'fal_grounded_designer',
      pipeline: 'fal_only',
    })).toBe('gallery_design');
    expect(resolveProductionEngineFamily({
      engine: 'premium_editorial_v1',
      pipeline: 'premium_editorial',
    })).toBe('gallery_design');
  });

  it('maps video / I2V to motion', () => {
    expect(resolveProductionEngineFamily({
      engine: 'gpt_image_designed',
      pipeline: 'fal_reel',
      hasVideo: true,
    })).toBe('motion');
    expect(resolveProductionEngineFamily({
      engine: 'kling-v2',
      pipeline: 'fal_reel',
    })).toBe('motion');
    expect(resolveProductionEngineFamily({
      pipeline: 'fal_story',
      slotRole: 'campaign_story_motion',
    })).toBe('motion');
  });
});
