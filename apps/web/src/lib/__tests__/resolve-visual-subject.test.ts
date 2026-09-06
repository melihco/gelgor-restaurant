import { describe, expect, it } from 'vitest';
import { resolveAiVisualProductionStandard } from '../ai-visual-production-standard';
import {
  inferVisualSubjectFromGallery,
  inferVisualSubjectFromSlotKey,
  resolveAutoVisualSubject,
  resolveVisualSubjectForSlot,
  type GallerySubjectEvidence,
} from '../resolve-visual-subject';

function meta(
  entries: Array<GallerySubjectEvidence & { id: string }>,
): Record<string, GallerySubjectEvidence> {
  return Object.fromEntries(entries.map(({ id, ...rest }) => [id, rest]));
}

describe('resolveAutoVisualSubject / P3', () => {
  it('explicit product_hero wins over venue-heavy gallery', () => {
    const gallery = meta([
      { id: 'a', contentTags: ['beach', 'terrace', 'venue'], description: 'sunset terrace' },
      { id: 'b', contentTags: ['pool', 'interior'], description: 'club pool' },
      { id: 'c', contentTags: ['dining', 'ambiance'], description: 'restaurant' },
    ]);
    expect(
      resolveAutoVisualSubject('product_hero', 'beach_club', { galleryMeta: gallery }),
    ).toBe('product_hero');
  });

  it('beach_club + auto + venue gallery → venue_ambiance', () => {
    const gallery = meta([
      { id: 'a', contentTags: ['beach', 'terrace'], description: 'aegean terrace' },
      { id: 'b', contentTags: ['pool', 'club'], description: 'daybed pool' },
      { id: 'c', contentTags: ['dining', 'interior'], hasPeople: true },
    ]);
    expect(
      resolveAutoVisualSubject('auto', 'beach_club', { galleryMeta: gallery }),
    ).toBe('venue_ambiance');
  });

  it('local_products_shop + auto + product gallery → product_hero', () => {
    const gallery = meta([
      { id: 'a', contentTags: ['product', 'jar', 'packaging'], primarySubject: 'olive_oil', visibleLabelText: 'Zeytinyağı' },
      { id: 'b', contentTags: ['honey', 'bottle'], subjectFamily: 'honey' },
      { id: 'c', contentTags: ['flat-lay', 'ambalaj'], description: 'gift box packaging' },
    ]);
    expect(
      resolveAutoVisualSubject('auto', 'local_products_shop', { galleryMeta: gallery }),
    ).toBe('product_hero');
  });

  it('local_products_shop + auto + empty gallery → sector default product_hero', () => {
    expect(resolveAutoVisualSubject('auto', 'local_products_shop')).toBe('product_hero');
    expect(resolveAutoVisualSubject('auto', 'local_products_shop', { galleryMeta: {} })).toBe(
      'product_hero',
    );
  });

  it('beach_club + auto + no gallery → sector venue_ambiance', () => {
    expect(resolveAutoVisualSubject('auto', 'beach_club')).toBe('venue_ambiance');
  });

  it('thin gallery evidence does not override sector', () => {
    const gallery = meta([
      { id: 'only', contentTags: ['product', 'jar'], primarySubject: 'honey' },
    ]);
    // beach sector + single product photo → keep sector venue (need ≥2 analyzed)
    expect(
      resolveAutoVisualSubject('auto', 'beach_club', { galleryMeta: gallery }),
    ).toBe('venue_ambiance');
  });

  it('inferVisualSubjectFromGallery returns null for sparse meta', () => {
    expect(inferVisualSubjectFromGallery(null)).toBeNull();
    expect(inferVisualSubjectFromGallery({})).toBeNull();
  });

  it('shop ambiance / farm / hours stay venue even when the gallery is all jars', () => {
    const gallery = meta([
      { id: 'a', contentTags: ['product', 'jar', 'olive oil'], primarySubject: 'olive_oil' },
      { id: 'b', contentTags: ['honey', 'jar'], subjectFamily: 'honey' },
      { id: 'c', contentTags: ['jam', 'label'], visibleLabelText: 'Reçel' },
    ]);
    expect(inferVisualSubjectFromSlotKey('local_products_shop_shop_ambiance_post')).toBe(
      'venue_ambiance',
    );
    expect(inferVisualSubjectFromSlotKey('local_products_shop_farm_visit_story')).toBe(
      'venue_ambiance',
    );
    expect(inferVisualSubjectFromSlotKey('local_products_shop_weekend_hours_story')).toBe(
      'venue_ambiance',
    );
    expect(inferVisualSubjectFromSlotKey('local_products_shop_production_bts_story')).toBe(
      'venue_ambiance',
    );
    expect(
      resolveVisualSubjectForSlot({
        subject: 'auto',
        businessType: 'local_products_shop',
        catalogSlotKey: 'local_products_shop_shop_ambiance_post',
        galleryMeta: gallery,
      }),
    ).toBe('venue_ambiance');
    expect(
      resolveVisualSubjectForSlot({
        subject: 'product_hero',
        businessType: 'local_products_shop',
        catalogSlotKey: 'local_products_shop_farm_visit_story',
        galleryMeta: gallery,
      }),
    ).toBe('venue_ambiance');
  });

  it('product slots stay product_hero; beach sunset stays venue', () => {
    expect(inferVisualSubjectFromSlotKey('local_products_shop_product_hero_post')).toBe(
      'product_hero',
    );
    expect(inferVisualSubjectFromSlotKey('local_products_shop_new_arrival_story')).toBe(
      'product_hero',
    );
    expect(inferVisualSubjectFromSlotKey('beach_club_sunset_ambiance_post')).toBe(
      'venue_ambiance',
    );
    expect(inferVisualSubjectFromSlotKey('beach_club_cocktail_menu_post')).toBe(
      'product_hero',
    );
    expect(
      resolveVisualSubjectForSlot({
        subject: 'auto',
        businessType: 'beach_club',
        catalogSlotKey: 'beach_club_sunset_ambiance_post',
      }),
    ).toBe('venue_ambiance');
  });

  it('enhance-off noop: resolving subject does not enable visual standard', () => {
    const std = resolveAiVisualProductionStandard({
      ai_photo_enhance: false,
      ai_visual_subject: 'auto',
      visual_source_mode: 'gallery_only',
    });
    expect(std.enabled).toBe(false);
    const subject = resolveAutoVisualSubject(std.visualSubject, 'local_products_shop', {
      galleryMeta: meta([
        { id: 'a', contentTags: ['product', 'packaging'], primarySubject: 'olive_oil' },
        { id: 'b', contentTags: ['jar', 'label'], visibleLabelText: 'X' },
      ]),
    });
    expect(subject).toBe('product_hero');
    expect(std.enabled).toBe(false);
  });
});
