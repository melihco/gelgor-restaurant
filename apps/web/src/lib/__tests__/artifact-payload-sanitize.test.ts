import { describe, expect, it } from 'vitest';
import {
  isInlineDataMediaUrl,
  sanitizeMediaUrlList,
  slimArtifactContentJson,
  slimArtifactMetadata,
} from '@/lib/artifact-payload-sanitize';

describe('artifact-payload-sanitize', () => {
  it('detects inline data media urls', () => {
    expect(isInlineDataMediaUrl('data:image/jpeg;base64,abc')).toBe(true);
    expect(isInlineDataMediaUrl('https://cdn.example.com/a.jpg')).toBe(false);
  });

  it('strips inline urls from carousel lists', () => {
    const urls = sanitizeMediaUrlList([
      'data:image/jpeg;base64,abc',
      'https://cdn.example.com/1.jpg',
      'https://cdn.example.com/2.jpg',
    ]);
    expect(urls).toEqual([
      'https://cdn.example.com/1.jpg',
      'https://cdn.example.com/2.jpg',
    ]);
  });

  it('slims artifact content json without breaking http urls', () => {
    const raw = JSON.stringify({
      kind: 'instagram_carousel',
      imageUrl: 'data:image/jpeg;base64,hero',
      carousel_urls: [
        'data:image/jpeg;base64,slide1',
        'https://cdn.example.com/slide2.jpg',
      ],
      gallery_photo_urls: [
        'https://cdn.example.com/g1.jpg',
        'https://cdn.example.com/g2.jpg',
      ],
    });
    const slim = slimArtifactContentJson(raw, 'https://cdn.example.com/cover.jpg');
    const parsed = JSON.parse(String(slim));
    expect(parsed.imageUrl).toBe('https://cdn.example.com/cover.jpg');
    expect(parsed.carousel_urls).toEqual(['https://cdn.example.com/slide2.jpg']);
    expect(parsed.gallery_photo_urls).toHaveLength(2);
  });

  it('slims metadata carousel_urls', () => {
    const meta = slimArtifactMetadata({
      carousel_urls: ['data:image/jpeg;base64,x', 'https://cdn.example.com/a.jpg'],
      imageUrl: 'data:image/jpeg;base64,y',
    });
    expect(meta.carousel_urls).toEqual(['https://cdn.example.com/a.jpg']);
    expect(meta.imageUrl).toBeUndefined();
  });
});
