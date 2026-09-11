import { describe, expect, it } from 'vitest';
import {
  buildCaptionFitLookShortlist,
  resolveGalleryFirstForSlot,
} from '@/lib/gallery-first-production';
import type { GalleryPhotoMeta } from '@/lib/gallery-photo-matcher';
import type { ProductionAssignment } from '@/lib/mission-production-manifest';
import type { FeedSlotLookInput, FeedSlotLookResult } from '@/lib/feed-slot-look';

const OIL = 'https://cdn.example.com/gallery/sizma-bottle.jpg';
const JAM = 'https://cdn.example.com/gallery/fig-jam-jar.jpg';
const TABLE = 'https://cdn.example.com/gallery/sunset-table.jpg';
const PLATE = 'https://cdn.example.com/gallery/lunch-plate.jpg';

function shopMeta(): Record<string, GalleryPhotoMeta> {
  return {
    [OIL]: {
      primarySubject: 'olive_oil',
      visibleLabelText: 'NATUREL SIZMA ZEYTİNYAĞI',
      description: 'Labeled olive oil bottle on a shelf',
      suggestedAssetType: 'product_image',
    },
    [JAM]: {
      primarySubject: 'fig_jam',
      subjectFamily: 'jam',
      visibleLabelText: 'İNCİR REÇELİ',
      description: 'Fig jam jar with a handwritten label',
      suggestedAssetType: 'product_image',
    },
  };
}

function beachMeta(): Record<string, GalleryPhotoMeta> {
  return {
    [TABLE]: {
      primarySubject: 'venue',
      description: 'Gün batımı terası, şemsiyeler ve açık deniz ufku',
      suggestedAssetType: 'venue_reference',
    },
    [PLATE]: {
      primarySubject: 'food',
      description: 'Öğle yemeği tabağı ve salata',
      suggestedAssetType: 'food_image',
    },
  };
}

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

  it('shop: jam caption ranks the jar over a forced oil bottle', async () => {
    const shortlist = buildCaptionFitLookShortlist({
      assignment: shopAssignment(),
      galleryPhotos: [OIL, JAM],
      galleryMeta: shopMeta(),
      excludeUrls: [],
      brandName: 'Dükkan',
      businessType: 'local_products_shop',
      ideationCaption: 'İncir reçelimiz kavanozda, kahvaltıya bir kaşık yeter.',
      ideationHeadline: 'İncir Reçeli',
      forcedPhotoUrl: OIL,
    });
    expect(shortlist[0]?.url).toBe(JAM);
    expect(shortlist.map((row) => row.url)).not.toContain(OIL);

    let seen: string[] = [];
    const gf = await resolveGalleryFirstForSlot({
      assignment: shopAssignment(),
      galleryPhotos: [OIL, JAM],
      galleryMeta: shopMeta(),
      excludeUrls: [],
      brandName: 'Dükkan',
      businessType: 'local_products_shop',
      ideationCaption: 'İncir reçelimiz kavanozda, kahvaltıya bir kaşık yeter.',
      ideationHeadline: 'İncir Reçeli',
      language: 'Turkish',
      forcedPhotoUrl: OIL,
      lookFn: async (input: FeedSlotLookInput): Promise<FeedSlotLookResult> => {
        expect(input.catalogSlotKey).toBe('local_products_shop_product_hero_post');
        seen = input.candidates.map((c) => c.url);
        return {
          ok: true,
          pack: {
            slotJob: 'ürün hero',
            photoUrl: input.candidates[0]!.url,
            photoRole: 'product_for_sale',
            caption: 'İncir reçelimiz kavanozda. Kahvaltıya bir kaşık yeter.',
            headline: 'İncir reçelimiz kavanozda',
            shellDirection: 'product_hero',
            evidenceNote: "Etiket: 'İNCİR REÇELİ'",
          },
        };
      },
    });
    expect(seen[0]).toBe(JAM);
    expect(gf?.applied).toBe(true);
    expect(gf?.photoUrl).toBe(JAM);
  });

  it('shop: a used jam still is excluded so the next slot can take the oil', () => {
    const shortlist = buildCaptionFitLookShortlist({
      assignment: shopAssignment(),
      galleryPhotos: [OIL, JAM],
      galleryMeta: shopMeta(),
      excludeUrls: [JAM],
      brandName: 'Dükkan',
      businessType: 'local_products_shop',
      ideationCaption: 'Sızma zeytinyağımız raflarda, sofraya bir damla yeter.',
      ideationHeadline: 'Sızma Zeytinyağı',
      forcedPhotoUrl: JAM,
    });
    expect(shortlist.map((row) => row.url)).toContain(OIL);
    expect(shortlist.map((row) => row.url)).not.toContain(JAM);
  });

  it('shop: place slot sees unanalyzed shop photo even when caption is jam', () => {
    const SHOP = 'https://cdn.example.com/gallery/whatsapp-interior.jpg';
    const shortlist = buildCaptionFitLookShortlist({
      assignment: {
        idea_index: 2,
        slot_role: 'fal_designed_post',
        pipeline: 'fal_design',
        copy_bundle_id: 'copy_a',
        publish_channel: 'instagram_organic',
        catalog_slot_key: 'local_products_shop_market_day_post',
        catalog_slot_label: 'pazar günü',
      },
      galleryPhotos: [OIL, JAM, SHOP],
      galleryMeta: {
        ...shopMeta(),
        [SHOP]: {
          description: 'Metadata fallback analysis for a brand gallery image. URL tokens suggest: content, whatsapp.',
          suggestedAssetType: 'brand_background',
        },
      },
      excludeUrls: [],
      brandName: 'Dükkan',
      businessType: 'local_products_shop',
      ideationCaption: 'Doğal reçeller ile yaz sonu pikniği. İncir kavanozda, bir kaşık yeter.',
      ideationHeadline: 'Yaz sonu pikniği',
    });
    expect(shortlist.map((row) => row.url)).toContain(SHOP);
    expect(shortlist.map((row) => row.url)).not.toContain(JAM);
  });

  it('beach: place slot keeps the terrace when the weekly caption is a lunch plate', () => {
    const shortlist = buildCaptionFitLookShortlist({
      assignment: beachAssignment(),
      galleryPhotos: [PLATE, TABLE],
      galleryMeta: beachMeta(),
      excludeUrls: [],
      brandName: 'Plaj',
      businessType: 'beach_club',
      ideationCaption: 'Öğle tabağımızda mevsim salata, deniz kenarında bir öğün.',
      ideationHeadline: 'Öğle tabağı',
    });
    expect(shortlist.map((row) => row.url)).toContain(TABLE);
    expect(shortlist.map((row) => row.url)).not.toContain(PLATE);
  });

  it('beach: sunset caption ranks the terrace over a forced lunch plate', () => {
    const shortlist = buildCaptionFitLookShortlist({
      assignment: beachAssignment(),
      galleryPhotos: [PLATE, TABLE],
      galleryMeta: beachMeta(),
      excludeUrls: [],
      brandName: 'Plaj',
      businessType: 'beach_club',
      ideationCaption: 'Gün batımında masada kal, altın saat kaçmasın ve gel.',
      ideationHeadline: 'Gün batımında masada kal',
      forcedPhotoUrl: PLATE,
    });
    expect(shortlist[0]?.url).toBe(TABLE);
    expect(shortlist.map((row) => row.url)).not.toContain(PLATE);
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
