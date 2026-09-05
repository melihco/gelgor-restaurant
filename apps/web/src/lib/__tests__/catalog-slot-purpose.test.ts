import { describe, expect, it } from 'vitest';
import { captionHitsSlotPurpose, resolveSlotPurpose } from '@/lib/catalog-slot-purpose';

describe('catalog-slot-purpose', () => {
  it('resolves weekend hours and farm visit across two sectors', () => {
    const hours = resolveSlotPurpose('local_products_shop_weekend_hours_story');
    const farm = resolveSlotPurpose('restaurant_cafe_farm_to_table_story');
    expect(hours?.tokens).toEqual(expect.arrayContaining(['saat', 'açık']));
    expect(farm?.tokens).toEqual(expect.arrayContaining(['çiftlik', 'hasat']));
  });

  it('rejects atmosphere copy on weekend_hours and harvest sale on farm_visit', () => {
    expect(captionHitsSlotPurpose(
      'Dükkanımızda hoş bir atmosfer var! Sen de bu doğal lezzetleri keşfetmeye gel!',
      'local_products_shop_weekend_hours_story',
    )).toBe(false);
    expect(captionHitsSlotPurpose(
      'Hafta sonu 10-18 açığız.',
      'local_products_shop_weekend_hours_story',
    )).toBe(true);
    expect(captionHitsSlotPurpose(
      'Müşterilerimiz çam balımızı çok seviyor!',
      'local_products_shop_farm_visit_story',
    )).toBe(false);
    expect(captionHitsSlotPurpose(
      'Çiftlikte erken hasat başladı.',
      'restaurant_cafe_farm_to_table_story',
    )).toBe(true);
  });
});
