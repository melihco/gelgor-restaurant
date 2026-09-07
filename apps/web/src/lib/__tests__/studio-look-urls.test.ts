import { describe, expect, it, vi } from 'vitest';
import { isAttachableVisionUrl, needsLookVisionResolve, inlineLookVisionDataUris } from '@/studio/look-urls';

vi.mock('@/lib/external-image-fetch', () => ({
  fetchReviewableFrameBuffer: vi.fn(async (url: string) => {
    if (url.includes('cdninstagram.com') || url.includes('blocked')) {
      return Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 200 }, () => 0x11)]);
    }
    return null;
  }),
}));

describe('look-urls — bind vision attach', () => {
  it('treats https and data URIs as attachable', () => {
    expect(isAttachableVisionUrl('https://cdn.example.com/a.jpg')).toBe(true);
    expect(isAttachableVisionUrl('data:image/png;base64,xx')).toBe(true);
    expect(isAttachableVisionUrl('/api/media?key=x')).toBe(false);
  });

  it('resolves uploads and media-proxy, not only /api/media', () => {
    expect(needsLookVisionResolve('/api/media-proxy?url=https://x')).toBe(true);
    expect(needsLookVisionResolve('/generated/still.jpg')).toBe(true);
    expect(needsLookVisionResolve('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/posts/a.jpg')).toBe(true);
  });

  it('inlines Instagram-like URLs so vision does not fetch them', async () => {
    const rows = await inlineLookVisionDataUris([
      { url: 'https://scontent.cdninstagram.com/v/oil.jpg' },
    ]);
    expect(rows[0]?.visionUrl?.startsWith('data:image/')).toBe(true);
  });
});
