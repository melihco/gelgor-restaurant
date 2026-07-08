import { describe, expect, it } from 'vitest';

import { finalizeFalPrompt, FAL_VIDEO_PROMPT_MAX_CHARS } from '@/lib/fal-prompt';
import { buildStoryMotionPrompt } from '@/lib/fal-story-motion';

describe('finalizeFalPrompt', () => {
  it('returns text unchanged when under limit', () => {
    expect(finalizeFalPrompt('hello world', { kind: 'video' })).toBe('hello world');
  });

  it('never truncates mid-word', () => {
    const long = `${'word '.repeat(600)}FORBIDDEN distortion mutation`;
    const out = finalizeFalPrompt(long, { maxChars: 100, kind: 'video' });
    expect(out.endsWith('distor')).toBe(false);
    expect(out.split(/\s+/).every((w) => w.length > 0)).toBe(true);
  });

  it('uses 2500 char default for video kind', () => {
    expect(FAL_VIDEO_PROMPT_MAX_CHARS).toBe(2500);
    const prompt = 'x'.repeat(2600);
    const out = finalizeFalPrompt(prompt, { kind: 'video' });
    expect(out.length).toBeLessThanOrEqual(2500);
  });
});

describe('buildStoryMotionPrompt', () => {
  it('sends complete reel locked-composition prompt (not cut at 1000 chars)', () => {
    const prompt = buildStoryMotionPrompt({
      style: 'social_reel_graphics',
      headline: 'Our happy customers',
      sector: 'local_products_shop',
      preserveExistingText: true,
      pipeline: 'fal_reel',
      designerMotionCue: 'Gentle push-in on product hero zone with soft shimmer.',
    });

    expect(prompt.length).toBeGreaterThan(1000);
    expect(prompt.length).toBeLessThanOrEqual(FAL_VIDEO_PROMPT_MAX_CHARS);
    expect(prompt).toContain('FORBIDDEN: any text distortion');
    expect(prompt.endsWith('distor')).toBe(false);
    expect(prompt).toContain('LOCKED LOGO');
    expect(prompt).toContain('Designer motion note');
  });
});
