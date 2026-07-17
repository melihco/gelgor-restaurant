import { describe, expect, it } from 'vitest';
import {
  isReelLikeSlot,
  resolveFalSlotAspectRatio,
} from '../fal-slot-aspect-ratio';

describe('resolveFalSlotAspectRatio', () => {
  it('forces 9:16 for fal_reel / organic reel roles', () => {
    expect(resolveFalSlotAspectRatio({ pipeline: 'fal_reel' })).toBe('9:16');
    expect(resolveFalSlotAspectRatio({ slotRole: 'organic_reel' })).toBe('9:16');
    expect(resolveFalSlotAspectRatio({ kind: 'instagram_reel' })).toBe('9:16');
    expect(resolveFalSlotAspectRatio({ formatHint: 'reel' })).toBe('9:16');
  });

  it('forces 9:16 for stories', () => {
    expect(resolveFalSlotAspectRatio({ pipeline: 'fal_story' })).toBe('9:16');
    expect(resolveFalSlotAspectRatio({ formatHint: 'story' })).toBe('9:16');
  });

  it('keeps feed posts at 4:5', () => {
    expect(resolveFalSlotAspectRatio({ pipeline: 'fal_designed_post' })).toBe('4:5');
    expect(resolveFalSlotAspectRatio({ slotRole: 'designed_post' })).toBe('4:5');
  });

  it('paid ads stay 4:5 even if reel-like keywords appear elsewhere', () => {
    expect(resolveFalSlotAspectRatio({
      isPaidAd: true,
      pipeline: 'meta_ad',
    })).toBe('4:5');
  });
});

describe('isReelLikeSlot', () => {
  it('detects reel pipelines', () => {
    expect(isReelLikeSlot({ pipeline: 'fal_only_reel' })).toBe(true);
    expect(isReelLikeSlot({ pipeline: 'fal_designed_post' })).toBe(false);
  });
});
