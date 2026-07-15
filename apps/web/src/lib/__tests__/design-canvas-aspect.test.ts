import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  POST_CANVAS,
  STORY_CANVAS,
  canvasNeedsNormalization,
  normalizeCanvasBuffer,
  resolveTargetCanvas,
} from '@/lib/design-canvas-aspect';

async function makeImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 60, b: 90 } },
  }).jpeg().toBuffer();
}

describe('resolveTargetCanvas', () => {
  it('story content types always target 9:16 regardless of design card flag', () => {
    expect(resolveTargetCanvas('instagram_story', true)).toEqual(STORY_CANVAS);
    expect(resolveTargetCanvas('instagram_story', false)).toEqual(STORY_CANVAS);
    expect(resolveTargetCanvas('story', false)).toEqual(STORY_CANVAS);
    expect(resolveTargetCanvas('instagram_reel', true)).toEqual(STORY_CANVAS);
  });

  it('designed feed posts target 4:5', () => {
    expect(resolveTargetCanvas('instagram_post', true)).toEqual(POST_CANVAS);
    expect(resolveTargetCanvas('post', true)).toEqual(POST_CANVAS);
  });

  it('non-design posts are left alone (native 1:1 generation)', () => {
    expect(resolveTargetCanvas('instagram_post', false)).toBeNull();
    expect(resolveTargetCanvas('post', false)).toBeNull();
  });
});

describe('canvasNeedsNormalization', () => {
  it('flags the GPT-image 1024x1536 (2:3) canvas for both post and story targets', () => {
    expect(canvasNeedsNormalization(1024, 1536, POST_CANVAS)).toBe(true);
    expect(canvasNeedsNormalization(1024, 1536, STORY_CANVAS)).toBe(true);
  });

  it('accepts already-correct canvases within tolerance', () => {
    expect(canvasNeedsNormalization(1080, 1350, POST_CANVAS)).toBe(false);
    expect(canvasNeedsNormalization(1080, 1920, STORY_CANVAS)).toBe(false);
    expect(canvasNeedsNormalization(1024, 1280, POST_CANVAS)).toBe(false);
  });
});

describe('normalizeCanvasBuffer', () => {
  it('crops a 2:3 design card to exact 4:5 post canvas', async () => {
    const img = await makeImage(1024, 1536);
    const out = await normalizeCanvasBuffer(img, POST_CANVAS);
    expect(out).not.toBeNull();
    const meta = await sharp(out!).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);
  });

  it('crops a 2:3 design card to exact 9:16 story canvas', async () => {
    const img = await makeImage(1024, 1536);
    const out = await normalizeCanvasBuffer(img, STORY_CANVAS);
    expect(out).not.toBeNull();
    const meta = await sharp(out!).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
  });

  it('returns null when the canvas already matches the target', async () => {
    const img = await makeImage(1080, 1920);
    expect(await normalizeCanvasBuffer(img, STORY_CANVAS)).toBeNull();
    const post = await makeImage(1080, 1350);
    expect(await normalizeCanvasBuffer(post, POST_CANVAS)).toBeNull();
  });
});
