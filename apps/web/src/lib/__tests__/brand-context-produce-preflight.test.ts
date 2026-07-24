import { describe, expect, it } from 'vitest';
import {
  getBrandContextProducePreflight,
  httpStatusForBrandContextPreflight,
  isStubBrandName,
} from '@/lib/brand-context-produce-preflight';

function photos(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `https://cdn.example.com/p${i}.jpg`);
}

describe('getBrandContextProducePreflight', () => {
  it('beach_club: ready when constitution + gallery + real name', () => {
    const p = getBrandContextProducePreflight({
      brandName: 'Yula Bodrum',
      raw: {
        business_name: 'Yula Bodrum',
        business_type: 'beach_club',
        brand_constitution_confirmed_at: '2026-07-01T00:00:00Z',
        reference_image_urls: photos(8),
      },
    });
    expect(p.ok).toBe(true);
    expect(p.details.usablePhotoCount).toBe(8);
  });

  it('local_products_shop: blocks stub Brand name even with photos', () => {
    const p = getBrandContextProducePreflight({
      brandName: 'Brand',
      raw: {
        business_name: 'Brand',
        business_type: 'local_products_shop',
        brand_constitution_confirmed_at: '2026-07-01T00:00:00Z',
        reference_image_urls: photos(10),
      },
    });
    expect(p.ok).toBe(false);
    expect(p.code).toBe('brand_identity_stub');
    expect(httpStatusForBrandContextPreflight(p.code)).toBe(422);
  });

  it('blocks missing constitution', () => {
    const p = getBrandContextProducePreflight({
      brandName: 'Atölye Zeytin',
      raw: {
        business_name: 'Atölye Zeytin',
        reference_image_urls: photos(8),
      },
    });
    expect(p.code).toBe('brand_constitution_required');
  });

  it('blocks insufficient gallery', () => {
    const p = getBrandContextProducePreflight({
      brandName: 'Atölye Zeytin',
      raw: {
        business_name: 'Atölye Zeytin',
        brand_constitution_confirmed_at: '2026-07-01T00:00:00Z',
        reference_image_urls: photos(3),
      },
    });
    expect(p.code).toBe('brand_gallery_insufficient');
    expect(p.details.usablePhotoCount).toBe(3);
  });

  it('blocks empty mirror row (crew fetch failed)', () => {
    const p = getBrandContextProducePreflight({
      brandName: 'Yula Bodrum',
      raw: {},
    });
    expect(p.code).toBe('brand_context_unavailable');
    expect(httpStatusForBrandContextPreflight(p.code)).toBe(503);
  });
});

describe('isStubBrandName', () => {
  it('detects common stubs across locales', () => {
    expect(isStubBrandName('Brand')).toBe(true);
    expect(isStubBrandName('marka')).toBe(true);
    expect(isStubBrandName('Yula')).toBe(false);
  });
});
