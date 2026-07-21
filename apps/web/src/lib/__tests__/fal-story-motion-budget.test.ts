import { describe, expect, it } from 'vitest';

import {
  FAL_KLING_MOTION_POLL_MS,
  FAL_LUMA_MOTION_POLL_MS,
  FAL_REEL_MOTION_ATTEMPTS,
  FalMotionInFlightTimeoutError,
} from '@/lib/fal-story-motion';
import { resolveFalReelMotionAttemptBudget } from '@/lib/video-tier-scope';

describe('fal reel motion cost guards', () => {
  it('uses a single outer attempt — Kling→Luma chain is the only fallback', () => {
    expect(FAL_REEL_MOTION_ATTEMPTS).toBe(1);
    expect(resolveFalReelMotionAttemptBudget('fal_reel', FAL_REEL_MOTION_ATTEMPTS, 'premium')).toBe(1);
    expect(resolveFalReelMotionAttemptBudget('fal_reel', FAL_REEL_MOTION_ATTEMPTS, 'agency')).toBe(1);
  });

  it('budgets Kling poll long enough to finish (~4–5 min jobs)', () => {
    expect(FAL_KLING_MOTION_POLL_MS).toBeGreaterThanOrEqual(300_000);
    expect(FAL_LUMA_MOTION_POLL_MS).toBeGreaterThanOrEqual(90_000);
    expect(FAL_KLING_MOTION_POLL_MS).toBeGreaterThan(FAL_LUMA_MOTION_POLL_MS);
  });

  it('marks in-flight timeouts distinctly so callers skip the next model', () => {
    const err = new FalMotionInFlightTimeoutError('still IN_PROGRESS');
    expect(err.name).toBe('FalMotionInFlightTimeoutError');
    expect(err).toBeInstanceOf(Error);
  });
});
