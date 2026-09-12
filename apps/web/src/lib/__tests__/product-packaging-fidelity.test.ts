import { describe, expect, it } from 'vitest';
import {
  buildLockedPackPaintHead,
  composePackagingLockedPaintPrompt,
  ensurePackagingFidelityPrompt,
  expectsProductPackaging,
  isProductPackagingSector,
  packagingAwareTextConstraints,
  PRODUCT_PACKAGING_PRESERVE_BLOCK,
} from '../product-packaging-fidelity';
import { buildScratchCreativePromptLines, buildScratchVisualBrief } from '../scratch-visual-brief';

describe('product-packaging-fidelity', () => {
  it('detects product packaging sectors', () => {
    expect(isProductPackagingSector('local_products_shop')).toBe(true);
    expect(isProductPackagingSector('ecommerce_retail')).toBe(true);
    expect(isProductPackagingSector('beach_club')).toBe(false);
  });

  it('expects packaging from product_type even outside product sector', () => {
    expect(expectsProductPackaging({
      businessType: 'beach_club',
      productType: 'fig jam',
    })).toBe(true);
  });

  it('prepends packaging lock once', () => {
    const once = ensurePackagingFidelityPrompt('Change background only');
    expect(once.startsWith(PRODUCT_PACKAGING_PRESERVE_BLOCK.slice(0, 20))).toBe(true);
    expect(once).toMatch(/Change background only/);
    const twice = ensurePackagingFidelityPrompt(once);
    expect(twice).toBe(once);
  });

  it('shop + cafe: paint head keeps letter-identical overlay and no restage', () => {
    const shop = composePackagingLockedPaintPrompt('Boutique social-agency card', {
      headline: 'Yağın en sakin hali.',
    });
    expect(shop).toMatch(/letter-identical: "Yağın en sakin hali\."/);
    expect(shop).toMatch(/Do not restage/);
    expect(shop).toMatch(/CRITICAL PACKAGING FIDELITY/);
    expect(shop.indexOf(buildLockedPackPaintHead({ headline: 'Yağın en sakin hali.' }))).toBeGreaterThan(
      shop.indexOf('CRITICAL PACKAGING FIDELITY'),
    );

    const cafe = composePackagingLockedPaintPrompt('Venue card', {
      headline: 'İmza tabak bu akşam.',
      hasSubtitle: true,
    });
    expect(cafe).toMatch(/letter-identical: "İmza tabak bu akşam\."/);
    expect(cafe).toMatch(/second line is allowed only if already contracted/);
  });

  it('carves packaging exception into text constraints', () => {
    const product = packagingAwareTextConstraints(true).join('\n');
    expect(product).toMatch(/PACKAGING EXCEPTION/i);
    expect(product).not.toMatch(/Text must be completely absent/);

    const venue = packagingAwareTextConstraints(false).join('\n');
    expect(venue).toMatch(/NO TEXT IN IMAGE/i);
  });

  it('scratch prompt forbids fake labels on product briefs', () => {
    const brief = buildScratchVisualBrief({
      idea: {
        visual_direction: 'Hero jar on olive wood',
        product_type: 'fig jam',
      },
      headline: 'İncir Reçeli',
      assignment: { slot_role: 'product_reveal', catalog_slot_key: 'local_products_product_reveal_post' },
    });
    const lines = buildScratchCreativePromptLines({ brief }).join('\n');
    expect(lines).toMatch(/NEVER invent or approximate brand logos/i);
    expect(lines).toMatch(/blank unlabeled packaging/i);
  });
});
