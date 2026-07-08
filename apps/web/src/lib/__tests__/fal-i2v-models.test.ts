import { describe, expect, it } from 'vitest';

import {
  DEPRECATED_FAL_I2V_MODELS,
  buildFalI2vEnqueuePayload,
  formatFalEnqueueError,
  resolveFalI2vModelChain,
} from '@/lib/fal-i2v-models';

describe('fal-i2v-models', () => {
  it('excludes deprecated luma v1.5 and hailuo slugs from chains', () => {
    for (const kind of ['story_motion', 'raw_gallery'] as const) {
      for (const tier of ['starter', 'agency', 'premium'] as const) {
        const chain = resolveFalI2vModelChain(kind, tier);
        for (const deprecated of DEPRECATED_FAL_I2V_MODELS) {
          expect(chain).not.toContain(deprecated);
        }
        expect(chain.length).toBeGreaterThan(0);
      }
    }
  });

  it('starter story motion uses kling v3 standard + luma ray-2', () => {
    expect(resolveFalI2vModelChain('story_motion', 'starter')).toEqual([
      'fal-ai/kling-video/v3/standard/image-to-video',
      'fal-ai/luma-dream-machine/ray-2/image-to-video',
    ]);
  });

  it('starter raw gallery uses kling v1.6 standard (not pro)', () => {
    expect(resolveFalI2vModelChain('raw_gallery', 'starter')).toEqual([
      'fal-ai/kling-video/v1.6/standard/image-to-video',
      'fal-ai/luma-dream-machine/ray-2/image-to-video',
    ]);
  });

  it('builds luma ray-2 payload with 540p and 5s duration string', () => {
    const payload = buildFalI2vEnqueuePayload('fal-ai/luma-dream-machine/ray-2/image-to-video', {
      imageUrl: 'https://example.com/a.webp',
      prompt: 'subtle motion',
      durationSecs: 5,
      aspectRatio: '9:16',
    });
    expect(payload.image_url).toBe('https://example.com/a.webp');
    expect(payload.duration).toBe('5s');
    expect(payload.resolution).toBe('540p');
    expect(payload.aspect_ratio).toBe('9:16');
  });

  it('builds kling v3 payload with start_image_url', () => {
    const payload = buildFalI2vEnqueuePayload('fal-ai/kling-video/v3/standard/image-to-video', {
      imageUrl: 'https://example.com/a.webp',
      prompt: 'motion',
      preserveExistingText: true,
    });
    expect(payload.start_image_url).toBe('https://example.com/a.webp');
    expect(String(payload.negative_prompt)).toContain('text distortion');
  });

  it('formatFalEnqueueError surfaces balance and deprecated hints', () => {
    expect(formatFalEnqueueError(403, '{"detail":"User is locked. Reason: Exhausted balance."}')).toContain(
      'balance exhausted',
    );
    expect(formatFalEnqueueError(404, '{"detail":"Application \\"hailuo-ai\\" not found"}')).toContain(
      'deprecated',
    );
  });
});
