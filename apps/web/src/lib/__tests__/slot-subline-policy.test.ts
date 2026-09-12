import { describe, expect, it } from 'vitest';
import {
  catalogSlotAllowsOnCanvasCta,
  isSublineEnabledForProduction,
  resolveOnCanvasCta,
  resolveSlotSublineForRender,
  showSublineFromSampleCopy,
} from '../slot-subline-policy';

describe('slot-subline-policy', () => {
  it('defaults to off for every brand when the slot is not a CTA job', () => {
    expect(isSublineEnabledForProduction({})).toBe(false);
    expect(resolveSlotSublineForRender('Hemen İncele', {
      catalogSlotKey: 'local_products_shop_customer_favorite_post',
    })).toBeUndefined();
    expect(resolveSlotSublineForRender('Hemen İncele', {
      catalogSlotKey: 'beach_club_sunset_ambiance_story',
    })).toBeUndefined();
  });

  it('shop favorite stays off even when the template asks for a subline', () => {
    expect(resolveSlotSublineForRender('Hemen İncele', {
      catalogSlotKey: 'local_products_shop_customer_favorite_post',
      matchedShowSubline: true,
    })).toBeUndefined();
  });

  it('opts in reservation / booking CTA slots across two sectors', () => {
    expect(catalogSlotAllowsOnCanvasCta('restaurant_cafe_reservation_cta_post')).toBe(true);
    expect(catalogSlotAllowsOnCanvasCta('beach_club_booking_cta_story')).toBe(true);
    expect(resolveSlotSublineForRender('Yer ayırt', {
      catalogSlotKey: 'restaurant_cafe_reservation_cta_post',
    })).toBe('Yer ayırt');
    expect(resolveSlotSublineForRender('Liste', {
      catalogSlotKey: 'beach_club_booking_cta_story',
    })).toBe('Liste');
  });

  it('opts in when the slot pack sets onCanvasCta', () => {
    expect(resolveOnCanvasCta({
      catalogSlotKey: 'local_products_shop_product_hero_post',
      onCanvasCta: true,
    })).toBe(true);
    expect(resolveSlotSublineForRender('Ürünü incele', {
      catalogSlotKey: 'local_products_shop_product_hero_post',
      onCanvasCta: true,
    })).toBe('Ürünü incele');
  });

  it('suppresses subline when library slot showSubline is false', () => {
    expect(isSublineEnabledForProduction({
      catalogSlotKey: 'restaurant_cafe_reservation_cta_post',
      librarySlot: { showSubline: false },
    })).toBe(false);
    expect(resolveSlotSublineForRender('Destek satırı', {
      catalogSlotKey: 'restaurant_cafe_reservation_cta_post',
      librarySlot: { showSubline: false },
    })).toBeUndefined();
  });

  it('suppresses subline when design template showSubline is false', () => {
    expect(resolveSlotSublineForRender('Serinletici yaz', {
      catalogSlotKey: 'beach_club_booking_cta_story',
      matchedShowSubline: false,
    })).toBeUndefined();
    expect(resolveSlotSublineForRender('Serinletici yaz', {
      catalogSlotKey: 'beach_club_booking_cta_story',
      designSpec: { showSubline: false },
    })).toBeUndefined();
  });

  it('derives persist flag from sample subtitle', () => {
    expect(showSublineFromSampleCopy('')).toBe(false);
    expect(showSublineFromSampleCopy('Sınırlı süre')).toBe(true);
  });
});
