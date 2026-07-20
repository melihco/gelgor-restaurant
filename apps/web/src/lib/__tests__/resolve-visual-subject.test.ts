import { describe, expect, it } from 'vitest';
import { resolveAiVisualProductionStandard } from '../ai-visual-production-standard';
import {
  inferVisualSubjectFromGallery,
  resolveAutoVisualSubject,
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
