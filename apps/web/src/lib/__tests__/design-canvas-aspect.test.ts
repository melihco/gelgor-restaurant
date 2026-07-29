import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  POST_CANVAS,
  STORY_CANVAS,
  GPT_IMAGE_2_FEED_SIZE,
  GPT_IMAGE_2_STORY_SIZE,
  canvasNeedsNormalization,
  normalizeCanvasBuffer,
  resolveTargetCanvas,
  resolveTargetCanvasForFormat,
  supportsFlexibleOpenAiImageSize,
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

describe('resolveTargetCanvasForFormat', () => {
  it('maps template formats to post 4:5 vs story/reel 9:16', () => {
    expect(resolveTargetCanvasForFormat('post')).toEqual(POST_CANVAS);
    expect(resolveTargetCanvasForFormat('story')).toEqual(STORY_CANVAS);
    expect(resolveTargetCanvasForFormat('reel_cover')).toEqual(STORY_CANVAS);
  });
});

describe('gpt-image-2 native sizes', () => {
  it('exposes exact 4:5 and 9:16 request sizes (edges ÷16)', () => {
    expect(GPT_IMAGE_2_FEED_SIZE).toBe('1088x1360');
    expect(GPT_IMAGE_2_STORY_SIZE).toBe('1152x2048');
    const [fw, fh] = GPT_IMAGE_2_FEED_SIZE.split('x').map(Number);
    const [sw, sh] = GPT_IMAGE_2_STORY_SIZE.split('x').map(Number);
    expect(fw! % 16).toBe(0);
    expect(fh! % 16).toBe(0);
    expect(sw! % 16).toBe(0);
    expect(sh! % 16).toBe(0);
    expect(fw! / fh!).toBeCloseTo(4 / 5, 5);
    expect(sw! / sh!).toBeCloseTo(9 / 16, 5);
  });

  it('detects flexible size models', () => {
    expect(supportsFlexibleOpenAiImageSize('gpt-image-2')).toBe(true);
    expect(supportsFlexibleOpenAiImageSize('gpt-image-2-2026-04-21')).toBe(true);
    expect(supportsFlexibleOpenAiImageSize('gpt-image-1')).toBe(false);
    expect(supportsFlexibleOpenAiImageSize('gpt-image-1.5')).toBe(false);
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
    expect(canvasNeedsNormalization(1088, 1360, POST_CANVAS)).toBe(false);
    expect(canvasNeedsNormalization(1152, 2048, STORY_CANVAS)).toBe(false);
  });
});

describe('normalizeCanvasBuffer', () => {
  it('letterboxes a 2:3 design card onto exact 4:5 post canvas (never cover-crops)', async () => {
    const img = await makeImage(1024, 1536);
    const out = await normalizeCanvasBuffer(img, POST_CANVAS);
    expect(out).not.toBeNull();
    const meta = await sharp(out!).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);
    // Contain leaves pillarbox bars — corner is near letterbox navy, not source blue-gray.
    const { data } = await sharp(out!).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[0]!).toBeLessThan(20);
    expect(data[1]!).toBeLessThan(20);
    expect(data[2]!).toBeLessThan(25);
  });

  it('letterboxes a 2:3 design card onto exact 9:16 story canvas', async () => {
    const img = await makeImage(1024, 1536);
    const out = await normalizeCanvasBuffer(img, STORY_CANVAS);
    expect(out).not.toBeNull();
    const meta = await sharp(out!).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
  });

  it('scales same-ratio native gpt-image-2 feed size to Instagram 4:5 without crop', async () => {
    const img = await makeImage(1088, 1360);
    const out = await normalizeCanvasBuffer(img, POST_CANVAS);
    expect(out).not.toBeNull();
    const meta = await sharp(out!).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);
    // Fill scale — no letterbox; corner stays source color.
    const { data } = await sharp(out!).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBe(40);
  });

  it('returns null when the canvas already matches the target exactly', async () => {
    const img = await makeImage(1080, 1920);
    expect(await normalizeCanvasBuffer(img, STORY_CANVAS)).toBeNull();
    const post = await makeImage(1080, 1350);
    expect(await normalizeCanvasBuffer(post, POST_CANVAS)).toBeNull();
  });
});
