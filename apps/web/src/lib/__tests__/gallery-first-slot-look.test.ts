import { describe, expect, it } from 'vitest';
import { resolveGalleryFirstForSlot } from '@/lib/gallery-first-production';
import type { GalleryPhotoMeta } from '@/lib/gallery-photo-matcher';
import type { ProductionAssignment } from '@/lib/mission-production-manifest';
import type { FeedSlotLookResult } from '@/lib/feed-slot-look';

const OIL = 'https://cdn.example.com/gallery/sizma-bottle.jpg';
const TABLE = 'https://cdn.example.com/gallery/sunset-table.jpg';

function shopAssignment(): ProductionAssignment {
  return {
    idea_index: 0,
    slot_role: 'fal_designed_post',
    pipeline: 'fal_design',
    copy_bundle_id: 'copy_a',
    publish_channel: 'instagram_organic',
    catalog_slot_key: 'local_products_shop_product_hero_post',
    catalog_slot_label: 'ürün hero',
  };
}

function beachAssignment(): ProductionAssignment {
  return {
    idea_index: 0,
    slot_role: 'fal_designed_post',
    pipeline: 'fal_design',
    copy_bundle_id: 'copy_a',
    publish_channel: 'instagram_organic',
    catalog_slot_key: 'beach_club_sunset_ambiance_story',
    catalog_slot_label: 'gün batımı',
  };
}

function reelAssignment(): ProductionAssignment {
  return {
    idea_index: 0,
    slot_role: 'organic_reel',
    pipeline: 'fal_reel',
    copy_bundle_id: 'copy_a',
    publish_channel: 'instagram_organic',
  };
}

describe('gallery-first — one look owns the pack', () => {
  it('shop: keeps the look caption, drops the early-harvest ideation sentence', async () => {
    const galleryMeta: Record<string, GalleryPhotoMeta> = {
      [OIL]: {
        primarySubject: 'olive_oil',
        visibleLabelText: 'NATUREL SIZMA ZEYTİNYAĞI',
        description: 'Labeled oil bottle',
        suggestedAssetType: 'product_image',
      },
    };
    const gf = await resolveGalleryFirstForSlot({
      assignment: shopAssignment(),
      galleryPhotos: [OIL],
      galleryMeta,
      excludeUrls: [],
      brandName: 'Dükkan',
      businessType: 'local_products_shop',
      ideationCaption: 'Erken hasat zeytinyağımız Datça’dan sofralarınıza gelir.',
      ideationHeadline: 'Erken Hasat Tadım',
      language: 'Turkish',
      lookFn: async (): Promise<FeedSlotLookResult> => ({
        ok: true,
        pack: {
          slotJob: 'ürün hero',
          photoUrl: OIL,
          photoRole: 'product_for_sale',
          caption: 'Sızma zeytinyağımız raflarda. Sofraya bir damla yeter.',
          headline: 'Sızma zeytinyağımız raflarda',
          shellDirection: 'product_hero',
          evidenceNote: 'Etiket: NATUREL SIZMA ZEYTİNYAĞI',
        },
      }),
    });
    expect(gf?.applied).toBe(true);
    expect(gf?.source).toBe('slot_look');
    expect(gf?.caption).toMatch(/Sızma/);
    expect(gf?.caption).not.toMatch(/Erken hasat/);
    expect(gf?.pack?.evidenceNote).toMatch(/SIZMA/);
  });

  it('shop: grounds a leaky look pack to the label before it reaches the feed', async () => {
    const galleryMeta: Record<string, GalleryPhotoMeta> = {
      [OIL]: {
        primarySubject: 'olive_oil',
        visibleLabelText: 'NATUREL SIZMA ZEYTİNYAĞI',
        description: 'Labeled oil bottle',
        suggestedAssetType: 'product_image',
      },
    };
    const gf = await resolveGalleryFirstForSlot({
      assignment: shopAssignment(),
      galleryPhotos: [OIL],
      galleryMeta,
      excludeUrls: [],
      brandName: 'Dükkan',
      businessType: 'local_products_shop',
      ideationCaption: 'Erken hasat zeytinyağımız Datça’dan sofralarınıza gelir.',
      ideationHeadline: 'Erken Hasat Tadım',
      language: 'Turkish',
      lookFn: async (): Promise<FeedSlotLookResult> => ({
        ok: true,
        pack: {
          slotJob: 'ürün hero',
          photoUrl: OIL,
          photoRole: 'product_for_sale',
          caption: 'Erken hasat zeytinyağımız Datça’dan sofralarınıza gelir.',
          headline: 'Erken hasat zeytinyağımız Datça’dan sofralarınıza gelir.',
          shellDirection: 'product_hero',
          evidenceNote: "Etiketlerde 'NATUREL SIZMA ZEYTİNYAĞI' yazıyor.",
        },
      }),
    });
    expect(gf?.applied).toBe(true);
    expect(gf?.caption.toLowerCase()).not.toMatch(/erken hasat/);
    expect(gf?.caption).toMatch(/sızma|sizma/i);
  });

  it('beach: fail-closes when the look cannot pack the sunset table', async () => {
    const galleryMeta: Record<string, GalleryPhotoMeta> = {
      [TABLE]: {
        description: 'Sunset table with unlabeled bottle',
        suggestedAssetType: 'venue_reference',
      },
    };
    const gf = await resolveGalleryFirstForSlot({
      assignment: beachAssignment(),
      galleryPhotos: [TABLE],
      galleryMeta,
      excludeUrls: [],
      brandName: 'Plaj',
      businessType: 'beach_club',
      ideationCaption: 'Check out our upcoming events this weekend.',
      ideationHeadline: 'Upcoming Events',
      language: 'Turkish',
      lookFn: async (): Promise<FeedSlotLookResult> => ({
        ok: false,
        issues: ['no_pick'],
      }),
    });
    expect(gf?.applied).toBe(false);
    expect(gf?.source).toBe('slot_look');
    expect(gf?.lookIssues).toContain('no_pick');
  });

  it('does not call the look on reels', async () => {
    let called = 0;
    const gf = await resolveGalleryFirstForSlot({
      assignment: reelAssignment(),
      galleryPhotos: [TABLE],
      galleryMeta: {
        [TABLE]: { description: 'Sunset terrace', suggestedAssetType: 'venue_reference' },
      },
      excludeUrls: [],
      brandName: 'Plaj',
      businessType: 'beach_club',
      ideationCaption: 'Gün batımında masada kal, altın saat kaçmasın ve gel.',
      ideationHeadline: 'Gün batımında masada kal',
      lookFn: async () => {
        called += 1;
        return { ok: false, issues: ['no_pick'] };
      },
    });
    expect(called).toBe(0);
    expect(gf?.source).not.toBe('slot_look');
  });
});
