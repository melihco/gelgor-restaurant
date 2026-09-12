import { describe, expect, it } from 'vitest';
import {
  bufferLooksLikeAvif,
  isOpenAiEditCompatibleMime,
  rewriteCdnUrlForOpenAiEdit,
} from '@/lib/openai-image-upload';

describe('openai-image-upload', () => {
  it('rewrites Wix AVIF fill URLs used by stay and shop galleries', () => {
    const wix =
      'https://static.wixstatic.com/media/f894ab_abc~mv2.jpg/v1/fill/w_566,h_405,q_90,enc_avif,quality_auto/x.jpg';
    expect(rewriteCdnUrlForOpenAiEdit(wix)).toContain('enc_jpg');
    expect(rewriteCdnUrlForOpenAiEdit(wix)).not.toContain('enc_avif');
  });

  it('accepts jpeg/png/webp and rejects avif for both sectors', () => {
    expect(isOpenAiEditCompatibleMime('image/jpeg')).toBe(true);
    expect(isOpenAiEditCompatibleMime('image/png')).toBe(true);
    expect(isOpenAiEditCompatibleMime('image/webp')).toBe(true);
    expect(isOpenAiEditCompatibleMime('image/avif')).toBe(false);
    expect(isOpenAiEditCompatibleMime('image/avif; charset=binary')).toBe(false);
  });

  it('detects AVIF magic bytes', () => {
    const buf = Buffer.alloc(16);
    buf.write('xxxxftypavif', 0, 'ascii');
    expect(bufferLooksLikeAvif(buf)).toBe(true);
    expect(bufferLooksLikeAvif(Buffer.from('not-an-image'))).toBe(false);
  });
});
