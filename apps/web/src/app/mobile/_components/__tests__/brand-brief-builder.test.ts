import { describe, expect, it } from 'vitest';
import { buildBrandAwareBrief } from '../brand-brief-builder';
import type { CompanyProfile } from '@/types';

const baseProfile = {
  brandName: 'Yula Bodrum',
  industry: 'beach_club',
  location: 'Bodrum',
  templateFamilies: '["local_products_shop.product_highlight.post"]',
} as CompanyProfile;

describe('buildBrandAwareBrief', () => {
  it('does not inject template families or design-template lists', () => {
    const brief = buildBrandAwareBrief(baseProfile, 'content_ideation');
    expect(brief).toContain('Marka: Yula Bodrum');
    expect(brief).not.toContain('local_products_shop');
    expect(brief).not.toContain('Şablon aileleri');
    expect(brief).not.toContain('Onaylı tasarım şablonları');
  });
});
