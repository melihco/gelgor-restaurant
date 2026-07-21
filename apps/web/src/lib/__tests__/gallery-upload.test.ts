import { describe, expect, it } from 'vitest';
import {
  filterGalleryAnalysisKeys,
  mergeBrandGalleryUrls,
} from '@/lib/gallery-upload';

describe('mergeBrandGalleryUrls', () => {
  it('unions refs with analysis keys so R2 uploads are not dropped', () => {
    const refs = [
      'https://gelgorrestaurant.com/images/hero-breakfast.jpg',
    ];
    const analysis = {
      '/api/media?key=tenant/image/2026-07-21/a.jpg': { description: 'plate' },
      '/api/media?key=tenant/image/2026-07-21/b.jpg': { description: 'terrace' },
      'https://gelgorrestaurant.com/images/hero-breakfast.jpg': { description: 'hero' },
    };
    const merged = mergeBrandGalleryUrls(refs, filterGalleryAnalysisKeys(analysis));
    expect(merged).toHaveLength(3);
    expect(merged.some((u) => u.includes('/api/media') && u.includes('a.jpg'))).toBe(true);
    expect(merged.some((u) => u.includes('/api/media') && u.includes('b.jpg'))).toBe(true);
  });

  it('dedupes the same R2 key across list variants', () => {
    const a = '/api/media?key=tenant%2Fimage%2Fx.jpg';
    const b = '/api/media?key=tenant/image/x.jpg';
    const merged = mergeBrandGalleryUrls([a], [b]);
    expect(merged).toHaveLength(1);
  });
});
