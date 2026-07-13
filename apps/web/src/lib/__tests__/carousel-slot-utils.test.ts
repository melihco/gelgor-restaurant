import { describe, it, expect } from 'vitest';
import { fillCarouselPhotoPool } from '@/app/api/auto-produce/handlers/slot-utils';

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
