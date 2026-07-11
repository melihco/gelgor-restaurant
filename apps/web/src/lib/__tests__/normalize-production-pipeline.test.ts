import { describe, expect, it } from 'vitest';
import { normalizeProductionPipeline } from '@/lib/mission-production-manifest';

describe('normalizeProductionPipeline legacy remotion aliases', () => {
  it('maps remotion_poster to fal_design', () => {
    expect(normalizeProductionPipeline('remotion_poster')).toBe('fal_design');
  });

  it('maps remotion_post to fal_design', () => {
    expect(normalizeProductionPipeline('remotion_post')).toBe('fal_design');
  });

  it('maps remotion_story to fal_story', () => {
    expect(normalizeProductionPipeline('remotion_story')).toBe('fal_story');
  });

  it('maps runway_reel to fal_reel', () => {
    expect(normalizeProductionPipeline('runway_reel')).toBe('fal_reel');
  });
});
