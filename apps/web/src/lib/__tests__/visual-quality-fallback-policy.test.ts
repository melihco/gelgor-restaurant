import { describe, expect, it } from 'vitest';
import {
  allowDegradedVisualFallback,
  isStoryOrReelVisualFormat,
} from '@/lib/visual-quality-fallback-policy';

describe('visual-quality-fallback-policy', () => {
  it('never allows a cheaper second motor', () => {
    expect(allowDegradedVisualFallback()).toBe(false);
  });

  it('treats shop story and beach reel as vertical channels', () => {
    expect(isStoryOrReelVisualFormat('story')).toBe(true);
    expect(isStoryOrReelVisualFormat('fal_only_story')).toBe(true);
    expect(isStoryOrReelVisualFormat('reel')).toBe(true);
    expect(isStoryOrReelVisualFormat('fal_reel')).toBe(true);
    expect(isStoryOrReelVisualFormat('post')).toBe(false);
    expect(isStoryOrReelVisualFormat('instagram_post')).toBe(false);
  });
});
