import { describe, it, expect } from 'vitest';
import { resolveArtifactSlotKeys } from '@/lib/production-slot-keys';

describe('resolveArtifactSlotKeys', () => {
  it('keeps catalog SSOT and Remotion alias separate (shop + beach)', () => {
    expect(resolveArtifactSlotKeys({
      catalogSlotKey: 'local_products_shop_harvest_post',
      librarySlotKey: 'editorial_story',
    })).toEqual({
      catalog_slot_key: 'local_products_shop_harvest_post',
      library_slot_key: 'editorial_story',
    });
    expect(resolveArtifactSlotKeys({
      catalogSlotKey: 'beach_club_sunset_story',
      librarySlotKey: null,
    })).toEqual({
      catalog_slot_key: 'beach_club_sunset_story',
    });
  });

  it('does not copy catalog into library when alias is missing', () => {
    expect(resolveArtifactSlotKeys({
      catalogSlotKey: 'restaurant_cafe_signature_dish_post',
    })).toEqual({
      catalog_slot_key: 'restaurant_cafe_signature_dish_post',
    });
  });
});
