import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { toAppJpegBuffer } from '@/lib/app-jpeg';

describe('app jpeg — shop + beach gallery bytes', () => {
  it('re-encodes a shop bottle still as a real jpeg', async () => {
    const raw = await sharp({
      create: { width: 80, height: 80, channels: 3, background: { r: 120, g: 70, b: 20 } },
    }).png().toBuffer();
    const jpeg = await toAppJpegBuffer(raw);
    expect(jpeg && jpeg[0] === 0xff && jpeg[1] === 0xd8).toBe(true);
  });

  it('re-encodes a beach venue still as a real jpeg', async () => {
    const raw = await sharp({
      create: { width: 80, height: 80, channels: 3, background: { r: 30, g: 90, b: 160 } },
    }).png().toBuffer();
    const jpeg = await toAppJpegBuffer(raw);
    expect(jpeg && jpeg[0] === 0xff && jpeg[1] === 0xd8).toBe(true);
  });
});
