import { describe, it, expect } from 'vitest';
import { fillCarouselPhotoPool } from '@/app/api/auto-produce/handlers/slot-utils';
import { buildCarouselCoverPaintPrompt } from '@/app/api/auto-produce/handlers/image-generators';

describe('fillCarouselPhotoPool', () => {
  it('does not pad with unrelated gallery photos', () => {
    const honey = 'https://cdn.example.com/honey.jpg';
    const oilA = 'https://cdn.example.com/zeytinyagi-3lt-a.jpg';
    const oilB = 'https://cdn.example.com/zeytinyagi-3lt-b.jpg';
    const result = fillCarouselPhotoPool([honey], [honey], [oilA, oilB]);
    expect(result.carouselUrls).toEqual([honey]);
    expect(result.carouselGalleryUrls).toEqual([honey]);
  });
});

describe('buildCarouselCoverPaintPrompt', () => {
  it('locks slide 1 as the designed cover for shop + restaurant', () => {
    const shop = buildCarouselCoverPaintPrompt({
      headline: 'Datça balları raflarda',
      caption: 'Kekik ve çiçek balı bu hafta tadımda.',
      brandName: 'Yerel dükkan',
    });
    const resto = buildCarouselCoverPaintPrompt({
      headline: 'Şef tabağı',
      caption: 'Akşam menüsünden üç tadım.',
      brandName: 'Gel Gör',
    });
    for (const prompt of [shop, resto]) {
      expect(prompt).toMatch(/CAROUSEL COVER LOCK/);
      expect(prompt).toMatch(/4:5/);
      expect(prompt).toMatch(/Slides 2–N stay raw gallery/);
    }
    expect(shop).toContain('Datça balları raflarda');
    expect(resto).toContain('Şef tabağı');
  });
});
