import { describe, expect, it, vi } from 'vitest';
import {
  isAttachableVisionUrl,
  isHotlinkBlockedVisionUrl,
  isLookModelVisionUrl,
  needsLookVisionResolve,
  inlineLookVisionDataUris,
  sniffLookImageMime,
} from '@/studio/look-urls';

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

  it('does not send shop Instagram or beach Wix hosts to the look model', () => {
    expect(isHotlinkBlockedVisionUrl('https://scontent.cdninstagram.com/v/oil.jpg')).toBe(true);
    expect(isHotlinkBlockedVisionUrl(
      'https://static.wixstatic.com/media/f894ab.jpg',
    )).toBe(true);
    expect(isHotlinkBlockedVisionUrl(
      'https://wixmp-fe53c9ff592a4da924211f23.wixmp.com/users/x/preview.jpg',
    )).toBe(true);
    expect(isLookModelVisionUrl('https://static.wixstatic.com/media/pier.jpg', true)).toBe(false);
    expect(isLookModelVisionUrl('https://cdn.example.com/oil.jpg', true)).toBe(true);
    expect(isLookModelVisionUrl('data:image/jpeg;base64,xx', false)).toBe(true);
    expect(isLookModelVisionUrl('https://cdn.example.com/oil.jpg', false)).toBe(false);
  });

  it('does not wrap leftover AVIF as a jpeg data URI', () => {
    const avif = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x1c]),
      Buffer.from('ftypavif', 'ascii'),
      Buffer.alloc(40, 1),
    ]);
    expect(sniffLookImageMime(avif)).toBe('image/avif');
  });
});
