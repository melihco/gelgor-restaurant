import { describe, expect, it } from 'vitest';
import {
  resolveArtifactPublishReady,
  resolveArtifactPublishReadyFromArtifact,
} from '@/lib/artifact-publish-ready';
import { isArtifactFeedReady } from '@/lib/weekly-publish-package';
import { stampFeedSlotPackMetadata } from '@/lib/feed-slot-pack';
import type { OutputArtifact } from '@/types';

function designedMeta(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    pipeline: 'fal_design',
    production_role: 'fal_designed_post',
    fal_designer_produced: true,
    fal_design_engine: 'gpt_image_designed',
    grafiker_pass: true,
    grafiker_score: 8,
    agency_produced: true,
    gallery_match_score: 72,
    ...extra,
  };
}

function artifact(
  meta: Record<string, unknown>,
  content: Record<string, unknown>,
): OutputArtifact {
  return {
    id: 'pub-cohere',
    title: String(content.headline ?? 'Kart'),
    contentUrl: '/api/media?key=x.jpg',
    createdAt: '2026-09-10T12:00:00.000Z',
    metadata: meta,
    content: JSON.stringify(content),
  } as OutputArtifact;
}

describe('publish öncesi caption + foto + şablon + headline', () => {
  it('dükkan: bal yazısı + yağ foto + yağ şablonu Akış’a düşmez', () => {
    const d = resolveArtifactPublishReady({
      meta: designedMeta({
        business_type: 'local_products_shop',
        catalog_slot_key: 'local_products_shop_product_hero_post',
        brand_design_template_match_quality: 'soft',
        brand_design_template_sample_headline: 'Erken Hasat Zeytinyağı',
        reference_photo_url: 'https://cdn.example.com/oil.jpg',
        gallery_photo_meta: {
          contentTags: ['olive oil', 'zeytinyağı', 'bottle'],
          description: 'Dark glass bottle of olive oil',
          suggestedAssetType: 'product_image',
          primarySubject: 'olive_oil',
          subjectConfidence: 1,
        },
      }),
      content: {
        kind: 'instagram_post',
        caption: 'Diken balımızı denediniz mi? Harika bir tat deneyimi sunuyor.',
        headline: 'Erken Hasat',
        design_overlay_headline: 'Erken Hasat',
      },
      format: 'post',
      designedVisualReady: true,
    });
    expect(d.ready).toBe(false);
    expect(d.blockFeed).toBe(true);
    expect(d.code).toBe('caption_design_incoherent');
  });

  it('dükkan: bal yazısı + bal foto + bal başlık + sert pin yayınlanır', () => {
    const d = resolveArtifactPublishReady({
      meta: designedMeta({
        business_type: 'local_products_shop',
        catalog_slot_key: 'local_products_shop_customer_favorite_post',
        brand_design_template_match_quality: 'hard',
        brand_design_template_sample_headline: 'Diken Balı',
        reference_photo_url: 'https://cdn.example.com/honey.jpg',
        gallery_photo_meta: {
          contentTags: ['honey', 'bal', 'jar'],
          description: 'Jar of raw honey on a wooden table',
          suggestedAssetType: 'product_image',
          primarySubject: 'honey',
          subjectConfidence: 1,
        },
      }),
      content: {
        kind: 'instagram_post',
        caption: 'Diken balımızı denediniz mi? Harika bir tat deneyimi sunuyor.',
        headline: 'Diken balımızı denediniz mi',
        design_overlay_headline: 'Diken balımızı denediniz mi',
      },
      format: 'post',
      designedVisualReady: true,
    });
    expect(d.code).toBe('ready');
    expect(d.blockFeed).toBe(false);
  });

  it('plaj: bakış paketi olsa da DJ yazısı + yemek foto Akış’a düşmez', () => {
    const d = resolveArtifactPublishReady({
      meta: designedMeta({
        business_type: 'beach_club',
        catalog_slot_key: 'beach_club_dj_night_teaser_post',
        brand_design_template_match_quality: 'hard',
        reference_photo_url: 'https://cdn.example.com/burger.jpg',
        gallery_photo_meta: {
          contentTags: ['food', 'burger', 'plate'],
          description: 'Plated burger with fries on a wooden table',
          suggestedAssetType: 'food_drink_photo',
          primarySubject: 'food',
          subjectConfidence: 1,
        },
        ...stampFeedSlotPackMetadata({
          slotJob: 'dj gecesi',
          photoUrl: 'https://cdn.example.com/dj.jpg',
          photoRole: 'venue',
          caption: 'Bu gece DJ seti ve beach party — dans için sahilde buluşalım.',
          headline: 'DJ Night bu gece',
          shellDirection: 'venue_ambiance',
          evidenceNote: 'DJ kabini, gece sahil',
        }),
      }),
      content: {
        kind: 'instagram_post',
        caption: 'Bu gece DJ seti ve beach party — dans için sahilde buluşalım.',
        headline: 'DJ Night',
        design_overlay_headline: 'DJ Night',
      },
      format: 'post',
      designedVisualReady: true,
    });
    expect(d.ready).toBe(false);
    expect(d.code).toBe('caption_design_incoherent');
  });

  it('plaj: DJ yazısı + yemek foto Akış’a düşmez', () => {
    const d = resolveArtifactPublishReady({
      meta: designedMeta({
        business_type: 'beach_club',
        catalog_slot_key: 'beach_club_dj_night_teaser_post',
        brand_design_template_match_quality: 'hard',
        reference_photo_url: 'https://cdn.example.com/burger.jpg',
        gallery_photo_meta: {
          contentTags: ['food', 'burger', 'plate'],
          description: 'Plated burger with fries on a wooden table',
          suggestedAssetType: 'food_drink_photo',
          primarySubject: 'food',
          subjectConfidence: 1,
        },
      }),
      content: {
        kind: 'instagram_post',
        caption: 'Bu gece DJ seti ve beach party — dans için sahilde buluşalım.',
        headline: 'DJ Night',
        design_overlay_headline: 'DJ Night',
      },
      format: 'post',
      designedVisualReady: true,
    });
    expect(d.ready).toBe(false);
    expect(d.code).toBe('caption_design_incoherent');
  });

  it('plaj: DJ yazısı + DJ foto + DJ başlık + DJ şablon yayınlanır', () => {
    const d = resolveArtifactPublishReady({
      meta: designedMeta({
        business_type: 'beach_club',
        catalog_slot_key: 'beach_club_dj_night_teaser_post',
        brand_design_template_match_quality: 'hard',
        brand_design_template_sample_headline: 'DJ Night',
        reference_photo_url: 'https://cdn.example.com/dj.jpg',
        gallery_photo_meta: {
          contentTags: ['dj', 'night', 'party', 'crowd'],
          description: 'DJ booth and dancing crowd at night beach party',
          suggestedAssetType: 'event_photo',
          primarySubject: 'dj',
          subjectConfidence: 1,
        },
      }),
      content: {
        kind: 'instagram_post',
        caption: 'Bu gece DJ seti ve beach party — dans için sahilde buluşalım.',
        headline: 'DJ Night',
        design_overlay_headline: 'DJ Night',
      },
      format: 'post',
      designedVisualReady: true,
    });
    expect(d.code).toBe('ready');
    expect(isArtifactFeedReady(artifact(
      designedMeta({
        business_type: 'beach_club',
        catalog_slot_key: 'beach_club_dj_night_teaser_post',
        brand_design_template_match_quality: 'hard',
        brand_design_template_sample_headline: 'DJ Night',
        reference_photo_url: 'https://cdn.example.com/dj.jpg',
        gallery_photo_meta: {
          contentTags: ['dj', 'night', 'party'],
          description: 'DJ booth at night beach party',
          suggestedAssetType: 'event_photo',
          primarySubject: 'dj',
          subjectConfidence: 1,
        },
      }),
      {
        kind: 'instagram_post',
        caption: 'Bu gece DJ seti ve beach party — dans için sahilde buluşalım.',
        headline: 'DJ Night',
        design_overlay_headline: 'DJ Night',
        imageUrl: '/api/media?key=dj.jpg',
      },
    ))).toBe(true);
    expect(d.blockFeed).toBe(false);
  });

  it('plaj: yemek yazısı + DJ başlık aynı kartta Akış’a düşmez', () => {
    const art = artifact(
      designedMeta({
        business_type: 'beach_club',
        catalog_slot_key: 'beach_club_sunset_golden_post',
        brand_design_template_match_quality: 'hard',
        brand_design_template_sample_headline: 'Şef Özel',
        reference_photo_url: 'https://cdn.example.com/dish.jpg',
        gallery_photo_meta: {
          contentTags: ['food', 'plate', 'dish'],
          description: 'Signature plated dish on a restaurant table',
          suggestedAssetType: 'food_drink_photo',
          primarySubject: 'food',
          subjectConfidence: 1,
        },
      }),
      {
        kind: 'instagram_post',
        caption: 'Mutfağımızın imza lezzetleri bugün sofranızda, mevsimin en taze ürünleriyle hazırlandı.',
        headline: 'DJ Night',
        design_overlay_headline: 'DJ Night',
      },
    );
    const d = resolveArtifactPublishReadyFromArtifact(art);
    expect(d.code).toBe('caption_design_incoherent');
    expect(isArtifactFeedReady(art)).toBe(false);
  });
});
