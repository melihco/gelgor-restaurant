import { describe, expect, it } from 'vitest';
import { allowsCaptionScratchGalleryFallback } from '@/lib/sector-production-profile';

describe('allowsCaptionScratchGalleryFallback', () => {
  it('never allows scratch when the brand has real gallery photos', () => {
    expect(allowsCaptionScratchGalleryFallback('local_products_shop', true)).toBe(false);
    expect(allowsCaptionScratchGalleryFallback('beauty_wellness', true)).toBe(false);
  });

  it('blocks scratch for product/venue brands that should stay gallery-grounded', () => {
    expect(allowsCaptionScratchGalleryFallback('local_products_shop', false)).toBe(false);
    expect(allowsCaptionScratchGalleryFallback('beach_club', false)).toBe(false);
  });

  it('allows scratch for caption-driven sectors without brand photos', () => {
    expect(allowsCaptionScratchGalleryFallback('beauty_wellness', false)).toBe(true);
    expect(allowsCaptionScratchGalleryFallback('moving_logistics', false)).toBe(true);
  });
});
