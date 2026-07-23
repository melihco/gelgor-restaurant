/**
 * Catalog slot gallery hints — keep template library + production matching aligned.
 * Multi-tenant: beach_club + local_products_shop (no pilot UUID branches).
 */
import { describe, expect, it } from 'vitest';
import {
  blendCatalogMatchKeywords,
  filterGalleryUrlsByPreferredAssetTypes,
  isStrongIdeationCaption,
  photoMatchesPreferredAssetTypes,
  resolveCatalogSlotGalleryHints,
} from '@/lib/catalog-slot-gallery';
import { buildSlotGalleryMatchInput, pickGalleryPhotoForSlot } from '@/lib/gallery-first-production';
import type { GalleryPhotoMeta } from '@/lib/gallery-photo-matcher';
import type { ProductionAssignment } from '@/lib/mission-production-manifest';

const DJ = 'https://cdn.example.com/gallery/dj-night.jpg';
const FOOD = 'https://cdn.example.com/gallery/burger-plate.jpg';
const VENUE = 'https://cdn.example.com/gallery/terrace-sunset.jpg';
const HONEY = 'https://cdn.example.com/gallery/honey-jar.jpg';
const STORE = 'https://cdn.example.com/gallery/shop-shelf.jpg';

function beachGallery(): Record<string, GalleryPhotoMeta> {
  return {
    [DJ]: {
      contentTags: ['dj', 'crowd', 'night', 'party'],
      description: 'DJ booth and dancing crowd at a beach night party',
      suggestedAssetType: 'event_photo',
      bestFor: ['event_announcement'],
    },
    [FOOD]: {
      contentTags: ['burger', 'food', 'plate'],
      description: 'Burger and fries on a plate',
      suggestedAssetType: 'food_drink_photo',
    },
    [VENUE]: {
      contentTags: ['sunset', 'terrace', 'sea', 'ambiance'],
      description: 'Golden hour terrace overlooking the sea',
      suggestedAssetType: 'venue_reference',
    },
  };
}

function shopGallery(): Record<string, GalleryPhotoMeta> {
  return {
    [HONEY]: {
      contentTags: ['honey', 'jar', 'product'],
      description: 'Glass jar of artisanal honey on a wooden table',
      suggestedAssetType: 'product_image',
      primarySubject: 'honey',
    },
    [STORE]: {
      contentTags: ['shop', 'shelf', 'retail'],
      description: 'Local products shop shelves with packaged goods',
      suggestedAssetType: 'venue_reference',
    },
  };
}

function assignment(catalogSlotKey: string): ProductionAssignment {
  return {
    idea_index: 0,
    slot_role: 'fal_designed_post',
    pipeline: 'fal_design',
    copy_bundle_id: 'copy_a',
    publish_channel: 'instagram_organic',
    catalog_slot_key: catalogSlotKey,
  };
}

describe('resolveCatalogSlotGalleryHints', () => {
  it('resolves beach_club DJ slot with event preferred assets + keywords', () => {
    const hints = resolveCatalogSlotGalleryHints({
      sectorId: 'beach_club',
      catalogSlotKey: 'beach_club_dj_night_teaser_post',
    });
    expect(hints).toBeTruthy();
    expect(hints!.templateType).toBe('event_special');
    expect(hints!.preferredAssetTypes).toContain('event_photo');
    expect(hints!.matchKeywords.toLowerCase()).toMatch(/dj/);
  });

  it('resolves local_products_shop harvest slot with product-friendly assets', () => {
    const hints = resolveCatalogSlotGalleryHints({
      sectorId: 'local_products_shop',
      catalogSlotKey: 'local_products_shop_seasonal_harvest_post',
    });
    expect(hints).toBeTruthy();
    expect(hints!.matchKeywords.length).toBeGreaterThan(8);
    expect(hints!.preferredAssetTypes.length).toBeGreaterThan(0);
  });
});

describe('photoMatchesPreferredAssetTypes', () => {
  it('aliases venue_photo ↔ venue_reference and food_photo ↔ food_drink_photo', () => {
    expect(photoMatchesPreferredAssetTypes('venue_photo', ['venue_reference'])).toBe(true);
    expect(photoMatchesPreferredAssetTypes('food_photo', ['food_drink_photo'])).toBe(true);
    expect(photoMatchesPreferredAssetTypes('event_photo', ['venue_reference'])).toBe(false);
  });
});

describe('blendCatalogMatchKeywords', () => {
  it('does not inject slot tokens into a strong publish caption (caption SSOT)', () => {
    const caption = 'Bu gece sahilde buluşuyoruz — rezervasyon için DM atın.';
    expect(isStrongIdeationCaption(caption)).toBe(true);
    const blended = blendCatalogMatchKeywords({
      caption,
      matchKeywords: 'dj gece party night beach_club_dj_night_teaser_post',
      sampleHeadline: 'Bu Gece',
    });
    expect(blended).toBe(caption);
    expect(blended.toLowerCase()).not.toMatch(/\bdj\b/);
  });

  it('appends catalog tokens only for thin captions', () => {
    const blended = blendCatalogMatchKeywords({
      caption: 'Bu gece',
      matchKeywords: 'dj party night lineup',
      sampleHeadline: 'Bu Gece',
    });
    expect(blended).toContain('Bu gece');
    expect(blended.toLowerCase()).toMatch(/dj|party|night/);
  });

  it('falls back to sample + keywords when caption empty', () => {
    const blended = blendCatalogMatchKeywords({
      caption: '',
      matchKeywords: 'honey jar harvest',
      sampleHeadline: 'Hasat',
    });
    expect(blended).toContain('Hasat');
    expect(blended).toContain('honey');
  });
});

describe('production pickGalleryPhotoForSlot — caption SSOT + catalog', () => {
  it('strong DJ caption + DJ slot picks event_photo (caption and slot agree)', () => {
    const meta = beachGallery();
    const photos = [FOOD, DJ, VENUE];
    const pick = pickGalleryPhotoForSlot({
      assignment: assignment('beach_club_dj_night_teaser_post'),
      galleryPhotos: photos,
      galleryMeta: meta,
      excludeUrls: [],
      brandName: 'Aqua Club',
      businessType: 'beach_club',
      sectorId: 'beach_club',
      catalogSlotKey: 'beach_club_dj_night_teaser_post',
      ideationCaption: 'Bu gece DJ seti ve beach party — dans için sahilde buluşalım.',
      ideationHeadline: 'DJ Night',
    });
    expect(pick?.url).toBe(DJ);
    expect(pick!.score).toBeGreaterThanOrEqual(28);
  });

  it('strong food caption wins over mismatched DJ catalog slot', () => {
    const meta = beachGallery();
    const photos = [DJ, FOOD, VENUE];
    const pick = pickGalleryPhotoForSlot({
      assignment: assignment('beach_club_dj_night_teaser_post'),
      galleryPhotos: photos,
      galleryMeta: meta,
      excludeUrls: [],
      brandName: 'Aqua Club',
      businessType: 'beach_club',
      sectorId: 'beach_club',
      catalogSlotKey: 'beach_club_dj_night_teaser_post',
      ideationCaption: 'İmza burgerimiz ve çıtır patates — öğle menüsü rafta.',
      ideationHeadline: 'Burger Time',
    });
    expect(pick?.url).toBe(FOOD);
  });

  it('thin caption + DJ slot still steers to event_photo via preferred pool', () => {
    const meta = beachGallery();
    const photos = [FOOD, DJ, VENUE];
    const pick = pickGalleryPhotoForSlot({
      assignment: assignment('beach_club_dj_night_teaser_post'),
      galleryPhotos: photos,
      galleryMeta: meta,
      excludeUrls: [],
      brandName: 'Aqua Club',
      businessType: 'beach_club',
      sectorId: 'beach_club',
      catalogSlotKey: 'beach_club_dj_night_teaser_post',
      ideationCaption: 'Bu gece',
      ideationHeadline: 'DJ',
    });
    expect(pick?.url).toBe(DJ);
  });

  it('local_products_shop harvest prefers product jar over empty shelf vibe when caption names honey', () => {
    const meta = shopGallery();
    const photos = [STORE, HONEY];
    const pick = pickGalleryPhotoForSlot({
      assignment: assignment('local_products_shop_seasonal_harvest_post'),
      galleryPhotos: photos,
      galleryMeta: meta,
      excludeUrls: [],
      brandName: 'Köy Pazarı',
      businessType: 'local_products_shop',
      sectorId: 'local_products_shop',
      catalogSlotKey: 'local_products_shop_seasonal_harvest_post',
      ideationCaption: 'Yeni sezon bal kavanozlarımız rafta. Doğal, süzme, köyden.',
      ideationHeadline: 'Sezon Balı',
      subjectKey: 'honey',
    });
    expect(pick?.url).toBe(HONEY);
  });

  it('buildSlotGalleryMatchInput keeps strong caption intact and still sets preferredAssetTypes', () => {
    const match = buildSlotGalleryMatchInput({
      assignment: assignment('beach_club_sunset_ambiance_post'),
      brandName: 'Aqua Club',
      businessType: 'beach_club',
      sectorId: 'beach_club',
      catalogSlotKey: 'beach_club_sunset_ambiance_post',
      ideationCaption: 'Gün batımında terasta altın saat — deniz manzarası eşliğinde.',
      ideationHeadline: 'Altın Saat',
    });
    expect(match.preferredAssetTypes?.length).toBeGreaterThan(0);
    expect(match.templateUseCase).toBeTruthy();
    expect(match.caption).toBe('Gün batımında terasta altın saat — deniz manzarası eşliğinde.');
  });
});

describe('filterGalleryUrlsByPreferredAssetTypes', () => {
  it('keeps only preferred (alias-aware) photos', () => {
    const filtered = filterGalleryUrlsByPreferredAssetTypes(
      [DJ, FOOD, VENUE],
      beachGallery(),
      ['venue_reference'],
    );
    expect(filtered).toEqual([VENUE]);
  });
});
