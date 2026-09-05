import { describe, it, expect } from 'vitest';
import {
  isSlotPhotoNeedUnmet,
  resolveSlotPhotoNeed,
} from '@/lib/catalog-slot-photo-fit';

describe('catalog-slot-photo-fit', () => {
  it('maps hiring vs plated suffixes across shop and cafe', () => {
    expect(resolveSlotPhotoNeed('local_products_shop_hiring_open_role_post')).toBe('team');
    expect(resolveSlotPhotoNeed('beach_club_hiring_team_story')).toBe('team');
    expect(resolveSlotPhotoNeed('restaurant_cafe_signature_dish_post')).toBe('plated');
    expect(resolveSlotPhotoNeed('restaurant_cafe_kitchen_bts_story')).toBe('plated');
    expect(resolveSlotPhotoNeed('local_products_shop_harvest_post')).toBeNull();
    expect(resolveSlotPhotoNeed('restaurant_cafe_reservation_cta_post')).toBeNull();
  });

  it('fail-opens when gallery meta is empty', () => {
    expect(isSlotPhotoNeedUnmet('restaurant_cafe_signature_dish_post', {})).toBe(false);
    expect(isSlotPhotoNeedUnmet('local_products_shop_hiring_team_story', null)).toBe(false);
  });

  it('flags hiring slot + product bottle and plated slot + venue garden', () => {
    expect(isSlotPhotoNeedUnmet('local_products_shop_hiring_team_story', {
      suggestedAssetType: 'product_image',
      contentTags: ['bottle', 'oil'],
      description: 'Olive oil bottle',
    })).toBe(true);
    expect(isSlotPhotoNeedUnmet('restaurant_cafe_menu_highlight_post', {
      suggestedAssetType: 'venue_photo',
      contentTags: ['garden', 'terrace'],
      description: 'Garden seating',
    })).toBe(true);
    expect(isSlotPhotoNeedUnmet('restaurant_cafe_menu_highlight_post', {
      suggestedAssetType: 'food_drink_photo',
      contentTags: ['breakfast', 'plate'],
      description: 'Kahvaltı tabağı',
    })).toBe(false);
  });
});
