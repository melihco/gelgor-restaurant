import { describe, expect, it } from 'vitest';
import { resolveHeadlineLineHeight } from '@/remotion/shared/story-primitives';

describe('resolveHeadlineLineHeight', () => {
  it('never returns below 1.06 for light weights', () => {
    expect(resolveHeadlineLineHeight(0.84, 400)).toBeGreaterThanOrEqual(1.06);
  });

  it('raises tight lineGap for heavy display type', () => {
    expect(resolveHeadlineLineHeight(0.9, 900)).toBeGreaterThanOrEqual(1.12);
    expect(resolveHeadlineLineHeight(0.92, 800)).toBeGreaterThanOrEqual(1.1);
  });

  it('preserves comfortable lineGap when already safe', () => {
    expect(resolveHeadlineLineHeight(1.12, 900)).toBe(1.12);
  });
});
