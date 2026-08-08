import { describe, expect, it } from 'vitest';
import {
  falChannelFromCatalogSlotKey,
  resolveFalIntensityChannel,
  resolveFalVideoPipelineFromCatalog,
} from '../fal-catalog-format';

describe('fal-catalog-format', () => {
  it('infers story/reel/post from catalog keys (beach_club + local_products)', () => {
    expect(falChannelFromCatalogSlotKey('beach_club_day_pass_story')).toBe('story');
    expect(falChannelFromCatalogSlotKey('beach_club_event_aftermovie_reel')).toBe('reel');
    expect(falChannelFromCatalogSlotKey('local_products_shop_shelf_vitrine_post')).toBe('post');
  });

  it('catalog story key beats fal_reel pipeline drift', () => {
    expect(resolveFalVideoPipelineFromCatalog(
      'beach_club_day_pass_story',
      'fal_reel',
    )).toBe('fal_story');
    expect(resolveFalIntensityChannel({
      catalogSlotKey: 'beach_club_day_pass_story',
      pipeline: 'fal_only_reel',
      slotRole: 'fal_reel_motion',
    })).toBe('story');
  });

  it('catalog reel key beats fal_story pipeline drift', () => {
    expect(resolveFalVideoPipelineFromCatalog(
      'beach_club_event_aftermovie_reel',
      'fal_story',
    )).toBe('fal_reel');
    expect(resolveFalIntensityChannel({
      catalogSlotKey: 'local_products_shop_atelier_process_reel',
      pipeline: 'fal_only_story',
      slotRole: 'campaign_story_motion',
    })).toBe('reel');
  });
});
