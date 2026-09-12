import { describe, expect, it } from 'vitest';
import {
  isEditorChromeGalleryUrl,
  isStockGalleryPhotoUrl,
  stripStockGalleryUrls,
} from '@/lib/media-url';

describe('gallery chrome vs venue urls', () => {
  it('drops Wix editor chrome and keeps a real Wix venue photo', () => {
    const chrome = 'https://static.parastorage.com/services/editor-elements/sloppyframe.png';
    const stock = 'https://static.wixstatic.com/media/11062b_abc.jpg';
    const venue = 'https://static.wixstatic.com/media/f894ab_real-venue~mv2.jpg';
    expect(isEditorChromeGalleryUrl(chrome)).toBe(true);
    expect(isStockGalleryPhotoUrl(stock)).toBe(true);
    expect(isStockGalleryPhotoUrl(venue)).toBe(false);
    expect(stripStockGalleryUrls([chrome, stock, venue])).toEqual([venue]);
  });

  it('still strips Unsplash for both shop and beach galleries', () => {
    expect(isStockGalleryPhotoUrl('https://images.unsplash.com/photo-shop')).toBe(true);
    expect(isStockGalleryPhotoUrl('https://images.unsplash.com/photo-beach')).toBe(true);
  });
});
