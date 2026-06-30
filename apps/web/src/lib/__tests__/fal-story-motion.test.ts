import { describe, expect, it } from 'vitest';

import { isPlayableVideoUrl } from '@/lib/fal-story-motion';

describe('isPlayableVideoUrl', () => {
  it('accepts mp4/mov/webm URLs', () => {
    expect(isPlayableVideoUrl('https://cdn.example.com/out.mp4')).toBe(true);
    expect(isPlayableVideoUrl('https://cdn.example.com/out.mov?token=abc')).toBe(true);
    expect(isPlayableVideoUrl('https://cdn.example.com/out.webm')).toBe(true);
  });

  it('rejects PNG and other still URLs', () => {
    expect(isPlayableVideoUrl('https://cdn.example.com/still.png')).toBe(false);
    expect(isPlayableVideoUrl('https://cdn.example.com/still.jpg')).toBe(false);
    expect(isPlayableVideoUrl(null)).toBe(false);
    expect(isPlayableVideoUrl('')).toBe(false);
  });
});
