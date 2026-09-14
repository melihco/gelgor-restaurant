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

function restaurantAssignment(): ProductionAssignment {
  return {
    idea_index: 0,
    slot_role: 'fal_designed_post',
    pipeline: 'fal_design',
    copy_bundle_id: 'copy_a',
    publish_channel: 'instagram_organic',
    catalog_slot_key: 'restaurant_cafe_dining_ambiance_post',
    catalog_slot_label: 'bahçe ambiyans',
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

  it('shop: look headline that opens the caption is replaced by the writer instead of missing_headline', async () => {
    const OIL_B = 'https://cdn.example.com/gallery/early-harvest.jpg';
    const caption = 'Zeytinyağlarımızı deneyen herkesin beğenisini topluyor. Sofranıza bir damla yeter.';
    const gf = await resolveGalleryFirstForSlot({
      assignment: shopAssignment(),
      galleryPhotos: [OIL_B],
      galleryMeta: {
        [OIL_B]: {
          primarySubject: 'olive_oil',
          visibleLabelText: 'ERKEN HASAT ZEYTİNYAĞI',
          description: 'Early harvest olive oil tin',
          suggestedAssetType: 'product_image',
        },
      },
      excludeUrls: [],
      brandName: 'Dükkan',
      businessType: 'local_products_shop',
      language: 'Turkish',
      ideationCaption: caption,
      ideationHeadline: 'Herkesin beğenisini topluyor',
      lookFn: async (): Promise<FeedSlotLookResult> => ({
        ok: true,
        pack: {
          slotJob: 'ürün hero',
          photoUrl: OIL_B,
          photoRole: 'product_for_sale',
          caption,
          headline: 'Zeytinyağlarımızı deneyen herkesin beğenisini topluyor',
          shellDirection: 'product_hero',
          evidenceNote: "Etiket: 'Erken Hasat Zeytinyağı'",
        },
      }),
      writeHeadline: async (w) => {
        expect(w.caption).toBe(caption);
        return { headline: 'Zeytinyağı sofranıza', source: 'ai', rejected: [w.hint ?? ''] };
      },
    });
    expect(gf?.applied).toBe(true);
    expect(gf?.headline).toBe('Zeytinyağı sofranıza');
    expect(gf?.caption).toBe(caption);
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

  it('passes language and brand tone into the look', async () => {
    let seen: FeedSlotLookInput | null = null;
    await resolveGalleryFirstForSlot({
      assignment: beachAssignment(),
      galleryPhotos: [TABLE],
      galleryMeta: beachMeta(),
      excludeUrls: [],
      brandName: 'Yula',
      businessType: 'beach_club',
      language: 'English',
      brandTone: 'luxury',
      ideationCaption: 'The terrace holds the last light.',
      ideationHeadline: 'Last light on the terrace',
      lookFn: async (input): Promise<FeedSlotLookResult> => {
        seen = input;
        return { ok: false, issues: ['no_pick'] };
      },
    });
    expect(seen?.language).toBe('English');
    expect(seen?.brandTone).toBe('luxury');
  });

  it('shop: omitted language becomes Turkish for look', async () => {
    let seen: FeedSlotLookInput | null = null;
    await resolveGalleryFirstForSlot({
      assignment: shopAssignment(),
      galleryPhotos: [OIL],
      galleryMeta: shopMeta(),
      excludeUrls: [],
      brandName: 'Dükkan',
      businessType: 'local_products_shop',
      ideationCaption: 'Sızma zeytinyağımız raflarda.',
      lookFn: async (input): Promise<FeedSlotLookResult> => {
        seen = input;
        return { ok: false, issues: ['no_pick'] };
      },
    });
    expect(seen?.language).toBe('Turkish');
  });

  it('beach: language code en becomes English for look', async () => {
    let seen: FeedSlotLookInput | null = null;
    await resolveGalleryFirstForSlot({
      assignment: beachAssignment(),
      galleryPhotos: [TABLE],
      galleryMeta: beachMeta(),
      excludeUrls: [],
      brandName: 'Yula',
      businessType: 'beach_club',
      language: 'en',
      ideationCaption: 'The terrace holds the last light.',
      lookFn: async (input): Promise<FeedSlotLookResult> => {
        seen = input;
        return { ok: false, issues: ['no_pick'] };
      },
    });
    expect(seen?.language).toBe('English');
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

  it('shop: campaign story with a suffixed product word gets the same labeled shortlist as the post', () => {
    const HONEY = 'https://cdn.example.com/gallery/honey-jar.jpg';
    const OIL_B = 'https://cdn.example.com/gallery/early-harvest.jpg';
    const meta: Record<string, GalleryPhotoMeta> = {
      ...shopMeta(),
      [HONEY]: {
        primarySubject: 'honey',
        visibleLabelText: 'ÇİÇEK BALI',
        description: 'Honey jar on a wooden table',
        suggestedAssetType: 'product_image',
      },
      [OIL_B]: {
        primarySubject: 'olive_oil',
        visibleLabelText: 'ERKEN HASAT ZEYTİNYAĞI',
        description: 'Early harvest olive oil tin',
        suggestedAssetType: 'product_image',
      },
    };
    const base = {
      galleryPhotos: [HONEY, JAM, OIL, OIL_B],
      galleryMeta: meta,
      excludeUrls: [] as string[],
      brandName: 'Dükkan',
      businessType: 'local_products_shop',
      ideationCaption: 'Erken hasat zeytinyağlarımızı deneyen herkesin beğenisini topluyor.',
      ideationHeadline: 'Herkesin beğenisini topluyor',
    };
    const story = buildCaptionFitLookShortlist({
      ...base,
      assignment: {
        ...shopAssignment(),
        slot_role: 'campaign_story_motion',
        catalog_slot_key: 'premium_editorial_campaign_story',
        catalog_slot_label: 'kampanya hikâyesi',
      },
    });
    const post = buildCaptionFitLookShortlist({ ...base, assignment: shopAssignment() });
    expect(story.map((r) => r.url)).toContain(OIL_B);
    expect(story.map((r) => r.url)).not.toContain(HONEY);
    expect(story.map((r) => r.url)).not.toContain(JAM);
    expect(post.map((r) => r.url)).toEqual(story.map((r) => r.url));
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

  it('shop: R2 display URL binds WP analysis so look sees the label', async () => {
    const wp = 'https://shop.example.com/wp-content/uploads/sizma-bottle.jpg';
    const r2 = '/api/media?key=tenant/gallery/sizma-bottle.jpg';
    let seenLabel = '';
    const gf = await resolveGalleryFirstForSlot({
      assignment: shopAssignment(),
      galleryPhotos: [r2],
      galleryMeta: {
        [wp]: {
          primarySubject: 'olive_oil',
          visibleLabelText: 'NATUREL SIZMA ZEYTİNYAĞI',
          description: 'Labeled olive oil bottle on a shelf',
          suggestedAssetType: 'product_image',
        },
      },
      excludeUrls: [],
      brandName: 'Dükkan',
      businessType: 'local_products_shop',
      ideationCaption: 'Sızma zeytinyağımız raflarda, sofraya bir damla yeter.',
      ideationHeadline: 'Sızma Zeytinyağı',
      language: 'Turkish',
      adaptiveScene: true,
      lookFn: async (input: FeedSlotLookInput): Promise<FeedSlotLookResult> => {
        seenLabel = String(input.candidates[0]?.visibleLabelText ?? '');
        return {
          ok: true,
          pack: {
            slotJob: 'ürün hero',
            photoUrl: input.candidates[0]!.url,
            photoRole: 'product_for_sale',
            caption: 'Sızma zeytinyağımız raflarda. Sofraya bir damla yeter.',
            headline: 'Sızma zeytinyağımız raflarda',
            shellDirection: 'product_hero',
            evidenceNote: "Etiket: 'NATUREL SIZMA ZEYTİNYAĞI'",
          },
        };
      },
    });
    expect(seenLabel).toMatch(/SIZMA/);
    expect(gf?.applied).toBe(true);
    expect(gf?.photoUrl).toBe(r2);
  });

  it('beach: adaptive sunset does not seed an R2 lunch plate', () => {
    const site = 'https://club.example.com/uploads/lunch-plate.jpg';
    const r2 = '/api/media?key=tenant/gallery/lunch-plate.jpg';
    const shortlist = buildCaptionFitLookShortlist({
      assignment: beachAssignment(),
      galleryPhotos: [r2],
      galleryMeta: {
        [site]: {
          primarySubject: 'food',
          description: 'Öğle yemeği tabağı ve salata',
          suggestedAssetType: 'food_image',
        },
      },
      excludeUrls: [],
      brandName: 'Plaj',
      businessType: 'beach_club',
      ideationCaption: 'Gün batımında masada kal, altın saat kaçmasın.',
      ideationHeadline: 'Gün batımında masada kal',
      adaptiveScene: true,
    });
    expect(shortlist).toHaveLength(0);
  });

  it('shop: adaptive farm slot ranks a labeled bottle when the gallery has no farm still', () => {
    const FALLBACK = 'https://cdn.example.com/gallery/whatsapp-empty.jpg';
    const shortlist = buildCaptionFitLookShortlist({
      assignment: {
        idea_index: 3,
        slot_role: 'fal_designed_post',
        pipeline: 'fal_design',
        copy_bundle_id: 'copy_a',
        publish_channel: 'instagram_organic',
        catalog_slot_key: 'local_products_shop_farm_visit_story',
        catalog_slot_label: 'çiftlik ziyareti',
      },
      galleryPhotos: [OIL, JAM, FALLBACK],
      galleryMeta: {
        ...shopMeta(),
        [FALLBACK]: {
          description: 'Metadata fallback analysis for a brand gallery image. URL tokens suggest: content, whatsapp.',
          suggestedAssetType: 'brand_background',
        },
      },
      excludeUrls: [],
      brandName: 'Dükkan',
      businessType: 'local_products_shop',
      ideationCaption: 'Çiftlikte hasat günü, sızma zeytinyağı üretimde.',
      ideationHeadline: 'Hasat günü',
      adaptiveScene: true,
    });
    expect(shortlist.map((row) => row.url)).toContain(OIL);
    expect(shortlist.map((row) => row.url)).not.toContain(FALLBACK);
  });

  it('shop: without adaptive, a farm slot still prefers the unanalyzed interior leftover', () => {
    const FALLBACK = 'https://cdn.example.com/gallery/whatsapp-empty.jpg';
    const shortlist = buildCaptionFitLookShortlist({
      assignment: {
        idea_index: 3,
        slot_role: 'fal_designed_post',
        pipeline: 'fal_design',
        copy_bundle_id: 'copy_a',
        publish_channel: 'instagram_organic',
        catalog_slot_key: 'local_products_shop_farm_visit_story',
        catalog_slot_label: 'çiftlik ziyareti',
      },
      galleryPhotos: [OIL, FALLBACK],
      galleryMeta: {
        ...shopMeta(),
        [FALLBACK]: {
          description: 'Metadata fallback analysis for a brand gallery image. URL tokens suggest: content, whatsapp.',
          suggestedAssetType: 'brand_background',
        },
      },
      excludeUrls: [],
      brandName: 'Dükkan',
      businessType: 'local_products_shop',
      ideationCaption: 'Çiftlikte hasat günü.',
      ideationHeadline: 'Hasat günü',
    });
    expect(shortlist.map((row) => row.url)).toContain(FALLBACK);
  });

  it('beach: adaptive sunset slot does not seed a lunch plate when no terrace exists', () => {
    const shortlist = buildCaptionFitLookShortlist({
      assignment: beachAssignment(),
      galleryPhotos: [PLATE],
      galleryMeta: beachMeta(),
      excludeUrls: [],
      brandName: 'Plaj',
      businessType: 'beach_club',
      ideationCaption: 'Gün batımında masada kal, altın saat kaçmasın.',
      ideationHeadline: 'Gün batımında masada kal',
      adaptiveScene: true,
    });
    expect(shortlist).toHaveLength(0);
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

  it('shop: favorite slot keeps a labeled jar when the judge only hates the slot name', async () => {
    const gf = await resolveGalleryFirstForSlot({
      assignment: {
        ...shopAssignment(),
        catalog_slot_key: 'local_products_shop_customer_favorite_post',
        catalog_slot_label: 'müşteri favorisi',
      },
      galleryPhotos: [JAM],
      galleryMeta: shopMeta(),
      excludeUrls: [],
      brandName: 'Dükkan',
      businessType: 'local_products_shop',
      ideationCaption: 'Müşterilerimizin en sevdiği lezzetlerden biri: incir reçeli.',
      ideationHeadline: 'Müşterilerimizin en sevdiği lezzetlerden biri:',
      judgePackConsistency: async () => ({ ok: false }),
      lookFn: async () => ({
        ok: true,
        pack: {
          slotJob: 'müşteri favorisi',
          photoUrl: JAM,
          photoRole: 'product_for_sale',
          caption: 'İncir reçelimiz kavanozda. Kahvaltıya bir kaşık yeter.',
          headline: 'İncir reçelimiz kavanozda',
          shellDirection: 'product_hero',
          evidenceNote: "Etiket: 'İNCİR REÇELİ'",
        },
      }),
    });
    expect(gf?.applied).toBe(true);
    expect(gf?.pack?.caption).toMatch(/reçel/i);
  });

  it('beach: sunset slot withholds lunch copy on a pier still', async () => {
    const gf = await resolveGalleryFirstForSlot({
      assignment: beachAssignment(),
      galleryPhotos: [TABLE],
      galleryMeta: beachMeta(),
      excludeUrls: [],
      brandName: 'Plaj',
      businessType: 'beach_club',
      ideationCaption: 'Gün batımında masada kal, altın saat açık denizde.',
      ideationHeadline: 'Gün batımında masada kal',
      judgePackConsistency: async () => ({ ok: false }),
      lookFn: async () => ({
        ok: true,
        pack: {
          slotJob: 'gün batımı',
          photoUrl: TABLE,
          photoRole: 'venue',
          caption: 'Öğle tabağı hazır. Masada kalın ve gelin.',
          headline: 'Öğle tabağı hazır',
          shellDirection: 'venue_ambiance',
          evidenceNote: 'iskele, açık deniz ufku',
        },
      }),
    });
    expect(gf?.applied).toBe(false);
    expect(gf?.lookIssues).toContain('incoherent_pack');
    expect(gf?.pack?.caption).toMatch(/tabağı|tabagi/i);
  });

  it('shop: invented SKU caption does not call look or paint', async () => {
    let called = 0;
    const gf = await resolveGalleryFirstForSlot({
      assignment: {
        ...shopAssignment(),
        catalog_slot_key: 'local_products_shop_customer_favorite_post',
        catalog_slot_label: 'müşteri favorisi',
      },
      galleryPhotos: [JAM],
      galleryMeta: {
        ...shopMeta(),
        'https://cdn.example.com/gallery/diken-honey.jpg': {
          primarySubject: 'honey',
          visibleLabelText: 'DİKEN BALI',
          contentTags: ['honey', 'jar'],
          suggestedAssetType: 'product_image',
        },
      },
      excludeUrls: [],
      brandName: 'Dükkan',
      businessType: 'local_products_shop',
      ideationCaption: 'Doğal ve katkısız şam balımızı tadın! Müşterilerimiz çok seviyor.',
      ideationHeadline: 'Müşterilerimiz şam balını çok seviyor!',
      judgeProductClaim: async () => true,
      lookFn: async () => {
        called += 1;
        throw new Error('look must not run');
      },
    });
    expect(called).toBe(0);
    expect(gf?.applied).toBe(false);
    expect(gf?.lookIssues).toContain('invented_product_claim');
  });

  it('shop: labeled çam balı reaches look', async () => {
    const HONEY = 'https://cdn.example.com/gallery/pine-honey.jpg';
    let called = 0;
    const gf = await resolveGalleryFirstForSlot({
      assignment: {
        ...shopAssignment(),
        catalog_slot_key: 'local_products_shop_customer_favorite_post',
        catalog_slot_label: 'müşteri favorisi',
      },
      galleryPhotos: [HONEY],
      galleryMeta: {
        [HONEY]: {
          primarySubject: 'honey',
          visibleLabelText: 'ÇAM BALI PINE HONEY',
          contentTags: ['honey', 'jar'],
          suggestedAssetType: 'product_image',
        },
      },
      excludeUrls: [],
      brandName: 'Dükkan',
      businessType: 'local_products_shop',
      ideationCaption: 'Müşterilerimiz çam balını çok seviyor. Doğal çam balımız rafta.',
      ideationHeadline: 'Çam balı',
      lookFn: async (): Promise<FeedSlotLookResult> => {
        called += 1;
        return { ok: false, issues: ['no_pick'] };
      },
    });
    expect(called).toBe(1);
    expect(gf?.lookIssues ?? []).not.toContain('invented_product_claim');
  });

  it('restaurant: unlabeled garden does not invent serpme kahvaltı', async () => {
    const GARDEN = 'https://cdn.example.com/gallery/garden-tables.jpg';
    let called = 0;
    let judged: string | null = null;
    const gf = await resolveGalleryFirstForSlot({
      assignment: restaurantAssignment(),
      galleryPhotos: [GARDEN],
      galleryMeta: {
        [GARDEN]: {
          primarySubject: 'garden',
          contentTags: ['garden', 'table', 'turkish_breakfast'],
          suggestedAssetType: 'venue_reference',
        },
      },
      excludeUrls: [],
      brandName: 'Lokanta',
      businessType: 'restaurant_cafe',
      ideationCaption: 'Bu yaz bahçemizde sunulan serpme köy kahvaltımızla buluşun.',
      ideationHeadline: 'Serpme köy kahvaltımız',
      judgeProductClaim: async (_idea, inventory) => {
        judged = inventory;
        return Boolean(inventory.trim());
      },
      lookFn: async (): Promise<FeedSlotLookResult> => {
        called += 1;
        return { ok: false, issues: ['no_pick'] };
      },
    });
    expect(judged).toBe('');
    expect(called).toBe(1);
    expect(gf?.lookIssues ?? []).not.toContain('invented_product_claim');
  });

  it('shop: oil caption cannot look a honey jar even when look tries', async () => {
    const HONEY = 'https://cdn.example.com/gallery/flower-honey.jpg';
    const galleryMeta: Record<string, GalleryPhotoMeta> = {
      ...shopMeta(),
      [HONEY]: {
        primarySubject: 'honey',
        visibleLabelText: 'SÜZME ÇİÇEK BALI',
        description: 'Labeled flower honey jar',
        suggestedAssetType: 'product_image',
      },
    };
    const shortlist = buildCaptionFitLookShortlist({
      assignment: shopAssignment(),
      galleryPhotos: [HONEY, OIL],
      galleryMeta,
      excludeUrls: [],
      brandName: 'Dükkan',
      businessType: 'local_products_shop',
      ideationCaption: 'Bu yılın erken hasat zeytinyağı sofralarınızı süslüyor.',
      ideationHeadline: 'Erken Hasat Zeytinyağımız Burada!',
      subjectKey: 'olive_oil',
    });
    expect(shortlist.map((row) => row.url)).toContain(OIL);
    expect(shortlist.map((row) => row.url)).not.toContain(HONEY);

    const gf = await resolveGalleryFirstForSlot({
      assignment: shopAssignment(),
      galleryPhotos: [HONEY, OIL],
      galleryMeta,
      excludeUrls: [],
      brandName: 'Dükkan',
      businessType: 'local_products_shop',
      ideationCaption: 'Bu yılın erken hasat zeytinyağı sofralarınızı süslüyor.',
      ideationHeadline: 'Erken Hasat Zeytinyağımız Burada!',
      subjectKey: 'olive_oil',
      language: 'Turkish',
      lookFn: async (): Promise<FeedSlotLookResult> => ({
        ok: true,
        pack: {
          slotJob: 'ürün hero',
          photoUrl: HONEY,
          photoRole: 'product_for_sale',
          caption: 'Süzme çiçek balımız sofralarınızı süslüyor.',
          headline: 'Süzme çiçek balımız sofralarınızı süslüyor',
          shellDirection: 'product_hero',
          evidenceNote: "Etiket: 'SÜZME ÇİÇEK BALI'",
        },
      }),
    });
    expect(gf?.applied).toBe(false);
    expect(gf?.lookIssues).toContain('subject_conflict');
  });

  it('shop hours: wedding copy + only jars is empty shortlist, not an oil pick', async () => {
    const shortlist = buildCaptionFitLookShortlist({
      assignment: {
        idea_index: 5,
        slot_role: 'fal_designed_post',
        pipeline: 'fal_design',
        copy_bundle_id: 'copy_a',
        publish_channel: 'instagram_organic',
        catalog_slot_key: 'local_products_shop_weekend_hours_story',
        catalog_slot_label: 'hafta sonu saatleri',
      },
      galleryPhotos: [OIL, JAM],
      galleryMeta: shopMeta(),
      excludeUrls: [],
      brandName: 'Dükkan',
      businessType: 'local_products_shop',
      ideationCaption: 'Düğünlerimize gelin, tatmaya bekliyoruz!',
      ideationHeadline: 'Düğünlerimize gelin',
    });
    expect(shortlist).toHaveLength(0);

    const gf = await resolveGalleryFirstForSlot({
      assignment: {
        idea_index: 5,
        slot_role: 'fal_designed_post',
        pipeline: 'fal_design',
        copy_bundle_id: 'copy_a',
        publish_channel: 'instagram_organic',
        catalog_slot_key: 'local_products_shop_weekend_hours_story',
        catalog_slot_label: 'hafta sonu saatleri',
      },
      galleryPhotos: [OIL, JAM],
      galleryMeta: shopMeta(),
      excludeUrls: [],
      brandName: 'Dükkan',
      businessType: 'local_products_shop',
      ideationCaption: 'Düğünlerimize gelin, tatmaya bekliyoruz!',
      ideationHeadline: 'Düğünlerimize gelin',
      language: 'Turkish',
      judgeProductClaim: async () => false,
      lookFn: async () => {
        throw new Error('look must not run on empty shortlist');
      },
    });
    expect(gf?.applied).toBe(false);
    expect(gf?.lookIssues).toContain('empty_shortlist');
  });

  it('beach: place shortlist is not emptied by a missing product subject', () => {
    const shortlist = buildCaptionFitLookShortlist({
      assignment: beachAssignment(),
      galleryPhotos: [TABLE, PLATE],
      galleryMeta: beachMeta(),
      excludeUrls: [],
      brandName: 'Yula',
      businessType: 'beach_club',
      ideationCaption: 'The terrace holds the last light.',
      ideationHeadline: 'Last light on the terrace',
    });
    expect(shortlist.map((row) => row.url)).toContain(TABLE);
  });

  it('shop: EN honey caption shortlists the TR-labeled jar, not oil', () => {
    const HONEY = 'https://cdn.example.com/gallery/cicek-bali.jpg';
    const galleryMeta: Record<string, GalleryPhotoMeta> = {
      ...shopMeta(),
      [HONEY]: {
        visibleLabelText: 'SÜZME ÇİÇEK BALI',
        description: 'Etiketli cam kavanoz rafta.',
        suggestedAssetType: 'product_image',
      },
    };
    const shortlist = buildCaptionFitLookShortlist({
      assignment: shopAssignment(),
      galleryPhotos: [OIL, HONEY],
      galleryMeta,
      excludeUrls: [],
      brandName: 'Harbor Shop',
      businessType: 'local_products_shop',
      ideationCaption: 'Wildflower honey from the hills this week.',
      ideationHeadline: 'Wildflower honey',
      subjectKey: 'honey',
    });
    expect(shortlist[0]?.url).toBe(HONEY);
    expect(shortlist.map((row) => row.url)).not.toContain(OIL);
  });

  it('shop: early-harvest oil caption still shortlists a sızma bottle', () => {
    const galleryMeta: Record<string, GalleryPhotoMeta> = {
      ...shopMeta(),
      [JAM]: {
        ...shopMeta()[JAM],
        visibleLabelText: 'DATÇA DOĞAL LEZZET İNCİR REÇELİ',
      },
    };
    const shortlist = buildCaptionFitLookShortlist({
      assignment: {
        ...shopAssignment(),
        catalog_slot_key: 'local_products_shop_customer_favorite_post',
        catalog_slot_label: 'müşteri favorisi',
      },
      galleryPhotos: [OIL, JAM],
      galleryMeta,
      excludeUrls: [],
      brandName: 'Dükkan',
      businessType: 'local_products_shop',
      ideationCaption: 'Müşterilerimiz bunu çok seviyor. Erken hasat zeytinyağlarımızla yemeklerinize lezzet katın.',
      ideationHeadline: 'Erken hasat zeytinyağlarımızla yemeklerinize',
      subjectKey: 'olive_oil',
    });
    expect(shortlist.map((row) => row.url)).toContain(OIL);
    expect(shortlist).not.toHaveLength(0);
  });

  it('shop: range caption keeps oil and jam, not an empty list', () => {
    const HONEY = 'https://cdn.example.com/gallery/cicek-bali.jpg';
    const galleryMeta: Record<string, GalleryPhotoMeta> = {
      ...shopMeta(),
      [JAM]: {
        ...shopMeta()[JAM],
        visibleLabelText: 'DATÇA DOĞAL LEZZET İNCİR REÇELİ',
      },
      [HONEY]: {
        primarySubject: 'honey',
        visibleLabelText: 'SÜZME ÇİÇEK BALI',
        suggestedAssetType: 'product_image',
      },
    };
    const shortlist = buildCaptionFitLookShortlist({
      assignment: {
        ...shopAssignment(),
        catalog_slot_key: 'local_products_shop_product_range_carousel',
        catalog_slot_label: 'ürün yelpazesi',
      },
      galleryPhotos: [OIL, HONEY, JAM],
      galleryMeta,
      excludeUrls: [],
      brandName: 'Dükkan',
      businessType: 'local_products_shop',
      ideationCaption: 'Erken hasat zeytinyağları, özel bal çeşitleri ve lezzetli reçeller.',
      ideationHeadline: 'Ürün yelpazesi',
    });
    expect(shortlist.length).toBeGreaterThan(0);
    expect(shortlist.map((row) => row.url)).toContain(OIL);
  });

  it('shop: named çam idea does not shortlist a çiçek jar', () => {
    const PINE = 'https://cdn.example.com/gallery/pine-honey.jpg';
    const FLOWER = 'https://cdn.example.com/gallery/flower-honey.jpg';
    const galleryMeta: Record<string, GalleryPhotoMeta> = {
      ...shopMeta(),
      [PINE]: {
        primarySubject: 'honey',
        visibleLabelText: 'ÇAM BALI PINE HONEY',
        suggestedAssetType: 'product_image',
      },
      [FLOWER]: {
        primarySubject: 'honey',
        visibleLabelText: 'SÜZME ÇİÇEK BALI',
        suggestedAssetType: 'product_image',
      },
    };
    const shortlist = buildCaptionFitLookShortlist({
      assignment: {
        ...shopAssignment(),
        catalog_slot_key: 'local_products_shop_customer_favorite_post',
        catalog_slot_label: 'müşteri favorisi',
      },
      galleryPhotos: [FLOWER, PINE, OIL],
      galleryMeta,
      excludeUrls: [],
      brandName: 'Dükkan',
      businessType: 'local_products_shop',
      ideationCaption: 'Müşterilerimiz çam balını çok seviyor. Doğal çam balımız rafta.',
      ideationHeadline: 'Çam balı',
    });
    expect(shortlist.map((row) => row.url)).toEqual([PINE]);
  });

  it('shop: ambiance does not fall back to a labeled jar', () => {
    const shortlist = buildCaptionFitLookShortlist({
      assignment: {
        ...shopAssignment(),
        catalog_slot_key: 'local_products_shop_shop_ambiance_post',
        catalog_slot_label: 'dükkân ambiyansı',
      },
      galleryPhotos: [OIL, JAM],
      galleryMeta: shopMeta(),
      excludeUrls: [],
      brandName: 'Dükkan',
      businessType: 'local_products_shop',
      ideationCaption: 'Doğal lezzetlerimizin tadına bakmak için bekliyoruz.',
      ideationHeadline: 'Dükkânda bekliyoruz',
      adaptiveScene: true,
    });
    expect(shortlist).toHaveLength(0);
  });

  it('beach: EN terrace caption ranks the TR venue still over the plate', () => {
    const shortlist = buildCaptionFitLookShortlist({
      assignment: beachAssignment(),
      galleryPhotos: [PLATE, TABLE],
      galleryMeta: beachMeta(),
      excludeUrls: [],
      brandName: 'Yula',
      businessType: 'beach_club',
      ideationCaption: 'The terrace holds the last light. The sea stays open.',
      ideationHeadline: 'Last light on the terrace',
      subjectKey: 'venue',
    });
    expect(shortlist[0]?.url).toBe(TABLE);
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
