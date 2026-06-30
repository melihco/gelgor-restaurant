import { describe, expect, it } from 'vitest';

import { falLogoPositionToCompositorPlacement } from '../fal-logo-composite';

describe('falLogoPositionToCompositorPlacement', () => {
  it('maps art director positions to compositor anchors', () => {
    expect(falLogoPositionToCompositorPlacement('top_left', 'feed_post')).toBe('top_left');
    expect(falLogoPositionToCompositorPlacement('top_center', 'reel')).toBe('top_center');
    expect(falLogoPositionToCompositorPlacement('bottom_right', 'story')).toBe('bottom_right');
  });

  it('falls back by channel when position is missing', () => {
    expect(falLogoPositionToCompositorPlacement(null, 'feed_post')).toBe('bottom_right');
    expect(falLogoPositionToCompositorPlacement(null, 'reel')).toBe('top_right');
    expect(falLogoPositionToCompositorPlacement(null, 'story')).toBe('top_right');
  });
});
