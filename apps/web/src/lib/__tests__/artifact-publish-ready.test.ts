import { describe, expect, it } from 'vitest';
import {
  isDesignedVisualPipeline,
  decideArtifactPersist,
  persistIfPublishReady,
  resolveArtifactPublishReady,
  stampPublishReadyMetadata,
} from '@/lib/artifact-publish-ready';
import { stampFeedSlotPackMetadata } from '@/lib/feed-slot-pack';
import {
  filterFeedPublishableArtifacts,
  isArtifactFeedReady,
} from '@/lib/weekly-publish-package';
import type { OutputArtifact } from '@/types';

describe('isDesignedVisualPipeline', () => {
  it('flags fal_design / designed roles for beach_club and shop slots', () => {
    expect(isDesignedVisualPipeline('fal_design', 'fal_designed_post')).toBe(true);
    expect(isDesignedVisualPipeline('fal_only', 'fal_only_post')).toBe(true);
    expect(isDesignedVisualPipeline('gallery_photo', 'organic_post')).toBe(false);
  });

  it('flags premium_editorial campaign slots as designed', () => {
    expect(isDesignedVisualPipeline('premium_editorial', 'premium_editorial_campaign_post')).toBe(true);
    expect(isDesignedVisualPipeline('premium_editorial', 'premium_editorial_campaign_story')).toBe(true);
  });
});

describe('resolveArtifactPublishReady', () => {
  it('beach_club: designed slot without fal visual is blocked from feed', () => {
    const d = resolveArtifactPublishReady({
      meta: {
        pipeline: 'fal_design',
        production_role: 'fal_designed_post',
        auto_produced: true,
        renderer_executed: 'gallery_raw',
        gallery_match_score: 72,
      },
      content: { kind: 'instagram_post', imageUrl: 'https://cdn.example.com/breakfast.jpg' },
      format: 'post',
      designedVisualReady: false,
    });
    expect(d.ready).toBe(false);
    expect(d.blockFeed).toBe(true);
    expect(d.code).toBe('not_ready');
  });

  it('local_products_shop: fal_designer_produced clears designed gate', () => {
    const d = resolveArtifactPublishReady({
      meta: {
        pipeline: 'fal_design',
        production_role: 'fal_designed_post',
        fal_designer_produced: true,
        fal_design_engine: 'gpt_image_designed',
        grafiker_pass: true,
        grafiker_score: 9,
        agency_produced: true,
        gallery_match_score: 70,
      },
      content: { kind: 'instagram_post' },
      format: 'post',
      designedVisualReady: true,
    });
    expect(d.ready).toBe(true);
    expect(d.blockFeed).toBe(false);
    expect(d.code).toBe('ready');
  });

  it('fal_only still ready when designedVisualReady=false (bundleReadyNow false)', () => {
    const d = resolveArtifactPublishReady({
      meta: {
        pipeline: 'fal_only_post',
        production_role: 'fal_designed_post',
        fal_designer_produced: true,
        fal_only: true,
        auto_produced: true,
        source: 'auto-produce',
      },
      content: {
        kind: 'instagram_post',
        imageUrl: '/api/media?key=tenant/image/x.jpg',
      },
      format: 'post',
      designedVisualReady: false,
    });
    expect(d.ready).toBe(true);
    expect(d.blockFeed).toBe(false);
    expect(d.code).toBe('ready');
  });

  it('recomputes stale not_ready stamp when fal visual flags exist', () => {
    const d = resolveArtifactPublishReady({
      meta: {
        pipeline: 'fal_only_post',
        production_role: 'fal_designed_post',
        fal_designer_produced: true,
        fal_only: true,
        publish_blocked: true,
        publish_ready: false,
        publish_block_code: 'not_ready',
        publish_block_reason: 'Tasarım henüz hazır değil',
      },
      content: {
        kind: 'instagram_post',
        imageUrl: '/api/media?key=tenant/image/x.jpg',
      },
      format: 'post',
    });
    expect(d.ready).toBe(true);
    expect(d.blockFeed).toBe(false);
    expect(d.code).toBe('ready');
  });

  it('carousel designed hero is feed-ready (shop + beach)', () => {
    for (const role of ['organic_carousel', 'organic_carousel'] as const) {
      const d = resolveArtifactPublishReady({
        meta: {
          pipeline: 'carousel_gallery',
          production_role: role,
          fal_designer_produced: true,
          fal_design_engine: 'gpt_image_designed',
          auto_produced: true,
          agency_produced: true,
          gallery_match_score: 70,
        },
        content: {
          kind: 'instagram_carousel',
          carousel_urls: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
        },
        format: 'carousel',
        designedVisualReady: true,
      });
      expect(d.ready).toBe(true);
      expect(d.blockFeed).toBe(false);
    }
  });

  it('unblocks premium_editorial not_ready when premium_composition was stamped', () => {
    const meta = {
      pipeline: 'premium_editorial',
      production_role: 'premium_editorial_campaign_post',
      fal_designer_produced: false,
      premium_composition: true,
      premium_composition_type: 'poster_design',
      premium_score: 85,
      agency_produced: true,
      auto_produced: true,
      source: 'auto-produce',
      mission_id: 'mission-1',
      publish_blocked: true,
      publish_ready: false,
      publish_block_code: 'not_ready',
      publish_block_reason: 'Tasarım henüz hazır değil',
      gallery_match_score: 71,
    };
    const d = resolveArtifactPublishReady({
      meta,
      content: {
        kind: 'instagram_post',
        imageUrl: '/api/media?key=tenant/image/x.jpg',
        mission_id: 'mission-1',
      },
      format: 'post',
    });
    expect(d.ready).toBe(true);
    expect(d.blockFeed).toBe(false);
    expect(d.code).toBe('ready');

    const artifact = {
      id: 'art-pe-1',
      title: 'Premium editorial',
      status: 'pending_review',
      contentUrl: '/api/media?key=tenant/image/x.jpg',
      content: JSON.stringify({
        kind: 'instagram_post',
        imageUrl: '/api/media?key=tenant/image/x.jpg',
        mission_id: 'mission-1',
        source: 'auto-produce',
      }),
      metadata: JSON.stringify(meta),
    } as OutputArtifact;
    expect(isArtifactFeedReady(artifact)).toBe(true);
    expect(filterFeedPublishableArtifacts([artifact])).toHaveLength(1);
  });

  it('recomputes stale quality_hard_block when current scorecard would pass (shop post)', () => {
    const meta = {
      pipeline: 'fal_design',
      production_role: 'fal_designed_post',
      fal_designer_produced: true,
      fal_design_engine: 'gpt_image_designed',
      grafiker_pass: true,
      grafiker_score: 9,
      agency_produced: true,
      auto_produced: true,
      source: 'auto-produce',
      mission_id: 'mission-shop',
      text_validated: false,
      publish_blocked: true,
      publish_ready: false,
      publish_block_code: 'quality_hard_block',
      publish_block_reason: 'Görseldeki metin doğrulanamadı veya yarım kaldı',
      gallery_match_score: 70,
    };
    const d = resolveArtifactPublishReady({
      meta,
      content: {
        kind: 'instagram_post',
        imageUrl: '/api/media?key=tenant/image/shop.jpg',
        mission_id: 'mission-shop',
        source: 'auto-produce',
      },
      format: 'post',
    });
    expect(d.ready).toBe(true);
    expect(d.blockFeed).toBe(false);

    const artifact = {
      id: 'art-shop-ambiance',
      title: 'Dükkan atmosferi',
      status: 'pending_review',
      contentUrl: '/api/media?key=tenant/image/shop.jpg',
      content: JSON.stringify({
        kind: 'instagram_post',
        imageUrl: '/api/media?key=tenant/image/shop.jpg',
        mission_id: 'mission-shop',
        source: 'auto-produce',
      }),
      metadata: JSON.stringify(meta),
    } as OutputArtifact;
    expect(isArtifactFeedReady(artifact)).toBe(true);
    expect(filterFeedPublishableArtifacts([artifact])).toHaveLength(1);
  });

  it('recomputes stale quality_hard_block for a beach designed post', () => {
    const meta = {
      pipeline: 'fal_design',
      production_role: 'fal_designed_post',
      fal_designer_produced: true,
      grafiker_pass: true,
      grafiker_score: 8,
      agency_produced: true,
      auto_produced: true,
      source: 'auto-produce',
      mission_id: 'mission-beach',
      text_validated: false,
      publish_blocked: true,
      publish_block_code: 'quality_hard_block',
      publish_block_reason: 'Görseldeki metin doğrulanamadı veya yarım kaldı',
      gallery_match_score: 68,
    };
    const artifact = {
      id: 'art-beach-sunset',
      title: 'Gün batımı',
      status: 'pending_review',
      contentUrl: '/api/media?key=tenant/image/sunset.jpg',
      content: JSON.stringify({
        kind: 'instagram_post',
        imageUrl: '/api/media?key=tenant/image/sunset.jpg',
        mission_id: 'mission-beach',
        source: 'auto-produce',
      }),
      metadata: JSON.stringify(meta),
    } as OutputArtifact;
    expect(resolveArtifactPublishReady({
      meta,
      content: { kind: 'instagram_post', source: 'auto-produce' },
      format: 'post',
    }).blockFeed).toBe(false);
    expect(isArtifactFeedReady(artifact)).toBe(true);
  });

  it('designed post with grafiker_pass false above the floor still reaches the feed', () => {
    const artifact = {
      id: 'art-shop-mid',
      title: 'Orta skor post',
      status: 'pending_review',
      contentUrl: '/api/media?key=tenant/image/mid.jpg',
      content: JSON.stringify({
        kind: 'instagram_post',
        imageUrl: '/api/media?key=tenant/image/mid.jpg',
        mission_id: 'mission-shop',
        source: 'auto-produce',
      }),
      metadata: JSON.stringify({
        pipeline: 'fal_design',
        production_role: 'fal_designed_post',
        fal_designer_produced: true,
        grafiker_pass: false,
        grafiker_score: 6,
        agency_produced: true,
        auto_produced: true,
        source: 'auto-produce',
        mission_id: 'mission-shop',
        gallery_match_score: 66,
      }),
    } as OutputArtifact;
    expect(isArtifactFeedReady(artifact)).toBe(true);
  });

  it('shop editorial: already-stamped typography fail stays off Akış', () => {
    const d = resolveArtifactPublishReady({
      meta: {
        pipeline: 'premium_editorial',
        production_role: 'premium_editorial_campaign_post',
        fal_designer_produced: true,
        grafiker_pass: false,
        grafiker_score: 5,
        typography_text_valid: false,
        publish_ready: true,
        publish_blocked: false,
        agency_produced: true,
        auto_produced: true,
      },
      content: { kind: 'instagram_post', imageUrl: 'https://cdn.example.com/clip-shop.jpg' },
      format: 'post',
      designedVisualReady: true,
    });
    expect(d.ready).toBe(false);
    expect(d.blockFeed).toBe(true);
    expect(d.code).toBe('quality_hard_block');
  });

  it('beach designed: already-stamped typography fail stays off Akış', () => {
    const d = resolveArtifactPublishReady({
      meta: {
        pipeline: 'fal_design',
        production_role: 'fal_designed_post',
        fal_designer_produced: true,
        grafiker_pass: false,
        grafiker_score: 5,
        typography_text_valid: false,
        publish_ready: true,
        publish_blocked: false,
        agency_produced: true,
        auto_produced: true,
      },
      content: { kind: 'instagram_post', imageUrl: 'https://cdn.example.com/clip-beach.jpg' },
      format: 'post',
      designedVisualReady: true,
    });
    expect(d.ready).toBe(false);
    expect(d.blockFeed).toBe(true);
    expect(d.code).toBe('quality_hard_block');
  });

  it('keeps a real typography fail off the feed after stamp recompute', () => {
    const d = resolveArtifactPublishReady({
      meta: {
        pipeline: 'fal_design',
        production_role: 'fal_designed_post',
        fal_designer_produced: true,
        grafiker_pass: false,
        grafiker_score: 6,
        typography_text_valid: false,
        text_validated: true,
        publish_blocked: true,
        publish_block_code: 'quality_hard_block',
      },
      content: { kind: 'instagram_post', imageUrl: 'https://cdn.example.com/cut.jpg' },
      format: 'post',
      designedVisualReady: true,
    });
    expect(d.ready).toBe(false);
    expect(d.code).toBe('quality_hard_block');
  });

  it('shop gallery carousel with slides reaches the feed after stale quality stamp', () => {
    const urls = [
      '/api/media?key=tenant/image/a.jpg',
      '/api/media?key=tenant/image/b.jpg',
      '/api/media?key=tenant/image/c.jpg',
      '/api/media?key=tenant/image/d.jpg',
    ];
    const artifact = {
      id: 'art-shop-carousel',
      title: 'Ürün yelpazesi',
      status: 'pending_review',
      contentUrl: urls[0],
      content: JSON.stringify({
        kind: 'instagram_carousel',
        imageUrl: urls[0],
        carousel_urls: urls,
        mission_id: 'mission-shop',
        source: 'auto-produce',
      }),
      metadata: JSON.stringify({
        pipeline: 'carousel_gallery',
        production_role: 'organic_carousel',
        auto_produced: true,
        source: 'auto-produce',
        mission_id: 'mission-shop',
        grafiker_score: 3,
        grafiker_pass: true,
        publish_blocked: true,
        publish_block_code: 'quality_hard_block',
        publish_block_reason: 'Tasarım kalitesi onay için yeterli değil',
        gallery_match_score: 70,
      }),
    } as OutputArtifact;
    expect(isArtifactFeedReady(artifact)).toBe(true);
  });

  it('hard-blocks grafiker fail even when a still exists', () => {
    const d = resolveArtifactPublishReady({
      meta: {
        pipeline: 'fal_design',
        production_role: 'fal_designed_post',
        fal_designer_produced: true,
        grafiker_pass: false,
        grafiker_score: 4,
      },
      content: { kind: 'instagram_post', imageUrl: 'https://cdn.example.com/bad.jpg' },
      format: 'post',
      designedVisualReady: true,
    });
    expect(d.ready).toBe(false);
    expect(d.code).toBe('quality_hard_block');
  });

  it('blocks reel without video', () => {
    const d = resolveArtifactPublishReady({
      meta: {
        pipeline: 'fal_only_reel',
        production_role: 'organic_reel',
        fal_designer_produced: true,
      },
      content: { kind: 'instagram_reel', imageUrl: 'https://cdn.example.com/still.jpg' },
      format: 'reel',
      hasPlayableVideo: false,
      designedVisualReady: true,
    });
    expect(d.ready).toBe(false);
    expect(d.code).toBe('reel_video_required');
  });

  it('blocks gallery_theme_mismatch', () => {
    const d = resolveArtifactPublishReady({
      meta: {
        pipeline: 'gallery_photo',
        production_role: 'organic_post',
        gallery_theme_mismatch: true,
      },
      content: { kind: 'instagram_post' },
      format: 'post',
    });
    expect(d.code).toBe('gallery_theme_mismatch');
    expect(d.blockFeed).toBe(true);
  });

  it('shop: adaptive identity + theme stamp is a restage gap, not an Akış hide', () => {
    const d = resolveArtifactPublishReady({
      meta: {
        pipeline: 'fal_design',
        production_role: 'fal_designed_post',
        fal_designer_produced: true,
        grafiker_score: 7,
        grafiker_pass: false,
        gallery_theme_mismatch: true,
        publish_blocked: true,
        publish_block_code: 'gallery_theme_mismatch',
        adaptive_scene: true,
        gallery_identity_seed: true,
        gallery_photo_meta: {
          visibleLabelText: 'NATUREL SIZMA ZEYTİNYAĞI',
          description: 'Labeled oil bottle',
          suggestedAssetType: 'product_image',
        },
        catalog_slot_key: 'local_products_shop_farm_visit_story',
        reference_photo_url: 'https://cdn.example.com/oil.jpg',
        business_type: 'local_products_shop',
      },
      content: {
        kind: 'instagram_post',
        caption: 'Çiftlikte hasat günü, üretimde iş başındayız. Sızma raflarda.',
        headline: 'Hasat günü iş başında',
        design_overlay_headline: 'Hasat günü iş başında',
      },
      format: 'post',
      designedVisualReady: true,
    });
    expect(d.ready).toBe(true);
    expect(d.blockFeed).toBe(false);
  });

  it('beach: adaptive identity + theme stamp still hides a DJ/food fight', () => {
    const d = resolveArtifactPublishReady({
      meta: {
        pipeline: 'fal_design',
        production_role: 'fal_designed_post',
        fal_designer_produced: true,
        grafiker_score: 8,
        adaptive_scene: true,
        gallery_identity_seed: true,
        gallery_theme_mismatch: true,
        business_type: 'beach_club',
        catalog_slot_key: 'beach_club_dj_night_teaser_post',
        reference_photo_url: 'https://cdn.example.com/burger.jpg',
        gallery_photo_meta: {
          contentTags: ['food', 'burger', 'plate'],
          description: 'Plated burger with fries on a wooden table',
          suggestedAssetType: 'food_drink_photo',
          primarySubject: 'food',
        },
      },
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

  it('shop: looked pack + leftover motto still publishes when the photo matches', () => {
    const d = resolveArtifactPublishReady({
      meta: {
        pipeline: 'fal_design',
        production_role: 'fal_designed_post',
        fal_designer_produced: true,
        grafiker_score: 8,
        grafiker_pass: true,
        business_type: 'local_products_shop',
        catalog_slot_key: 'local_products_shop_product_hero_post',
        brand_design_template_match_quality: 'soft',
        brand_design_template_sample_headline: 'Doğanın Mucizesi',
        reference_photo_url: 'https://cdn.example.com/oil.jpg',
        gallery_photo_meta: {
          contentTags: ['olive oil', 'zeytinyağı', 'bottle'],
          description: 'Labeled olive oil bottle',
          suggestedAssetType: 'product_image',
          primarySubject: 'olive_oil',
        },
        ...stampFeedSlotPackMetadata({
          slotJob: 'ürün hero',
          photoUrl: 'https://cdn.example.com/oil.jpg',
          photoRole: 'product_for_sale',
          caption: 'Sızma zeytinyağımız raflarda. Sofraya bir damla yeter.',
          headline: 'Sızma zeytinyağımız raflarda',
          shellDirection: 'product_hero',
          evidenceNote: 'Etiket: NATUREL SIZMA ZEYTİNYAĞI',
        }),
      },
      content: {
        kind: 'instagram_post',
        caption: 'Sızma zeytinyağımız raflarda. Sofraya bir damla yeter.',
        headline: 'Doğanın Mucizesi',
        design_overlay_headline: 'Doğanın Mucizesi',
      },
      format: 'post',
      designedVisualReady: true,
    });
    expect(d.ready).toBe(true);
    expect(d.blockFeed).toBe(false);
    expect(d.code).toBe('ready');
  });

  it('shop: produce-ready stamp is not re-scored by overlay/theme on Akış', () => {
    const d = resolveArtifactPublishReady({
      meta: {
        pipeline: 'fal_design',
        production_role: 'fal_designed_post',
        fal_designer_produced: true,
        grafiker_score: 6,
        grafiker_pass: false,
        publish_ready: true,
        publish_blocked: false,
        gallery_theme_mismatch: true,
        adaptive_scene: true,
      },
      content: {
        kind: 'instagram_post',
        caption: 'Çiftlikte hasat günü, üretimde iş başındayız.',
        headline: 'DJ Night',
        design_overlay_headline: 'DJ Night',
      },
      format: 'post',
      designedVisualReady: true,
    });
    expect(d.ready).toBe(true);
    expect(d.blockFeed).toBe(false);
  });

  it('shop: half pack is not publish-ready; full pack is', () => {
    const designed = {
      pipeline: 'fal_design',
      production_role: 'fal_designed_post',
      fal_designer_produced: true,
      fal_design_engine: 'gpt_image_designed',
      grafiker_pass: true,
      grafiker_score: 9,
      agency_produced: true,
      gallery_match_score: 70,
    };
    const full = resolveArtifactPublishReady({
      meta: {
        ...designed,
        ...stampFeedSlotPackMetadata({
          slotJob: 'ürün hero',
          photoUrl: 'https://cdn.example.com/oil.jpg',
          photoRole: 'product_for_sale',
          caption: 'Yağın en sakin hali. Natürel sızma.',
          headline: 'Yağın en sakin hali',
          shellDirection: 'product_hero',
          evidenceNote: 'Etiket: NATUREL SIZMA ZEYTİNYAĞI',
        }),
      },
      content: { kind: 'instagram_post' },
      format: 'post',
      designedVisualReady: true,
    });
    const half = resolveArtifactPublishReady({
      meta: { ...designed, feed_slot_pack_ok: false },
      content: { kind: 'instagram_post' },
      format: 'post',
      designedVisualReady: true,
    });
    expect(full.ready).toBe(true);
    expect(full.blockFeed).toBe(false);
    expect(half.ready).toBe(false);
    expect(half.blockFeed).toBe(true);
    expect(half.code).toBe('incomplete_pack');
  });

  it('beach: half pack hides; unstamped still and reel stay ready', () => {
    const designed = {
      pipeline: 'fal_design',
      production_role: 'fal_designed_post',
      fal_designer_produced: true,
      grafiker_pass: true,
      grafiker_score: 8,
      agency_produced: true,
      gallery_match_score: 68,
    };
    const half = resolveArtifactPublishReady({
      meta: {
        ...designed,
        ...stampFeedSlotPackMetadata({
          slotJob: 'gün batımı',
          photoUrl: 'https://cdn.example.com/lawn.jpg',
          photoRole: 'table_prop',
          caption: 'Gün batımında masada kal.',
          headline: 'Gün batımında masada kal',
          shellDirection: 'product_hero',
          evidenceNote: 'yazı yok, masa dekoru',
        }),
      },
      content: { kind: 'instagram_post' },
      format: 'post',
      designedVisualReady: true,
    });
    const old = resolveArtifactPublishReady({
      meta: designed,
      content: { kind: 'instagram_post' },
      format: 'post',
      designedVisualReady: true,
    });
    const reel = resolveArtifactPublishReady({
      meta: { pipeline: 'fal_reel', production_role: 'organic_reel' },
      content: { kind: 'instagram_reel', videoUrl: 'https://cdn.example.com/x.mp4' },
      format: 'reel',
      hasPlayableVideo: true,
    });
    expect(half.ready).toBe(false);
    expect(half.code).toBe('incomplete_pack');
    expect(old.ready).toBe(true);
    expect(reel.ready).toBe(true);
  });

  it('stampPublishReadyMetadata sets publish_blocked for feed filters', () => {
    const stamped = stampPublishReadyMetadata(
      { pipeline: 'fal_design' },
      {
        ready: false,
        blockFeed: true,
        reason: 'Tasarlanmış görsel gerekli',
        code: 'designed_visual_required',
      },
    );
    expect(stamped.publish_blocked).toBe(true);
    expect(stamped.publish_ready).toBe(false);
    expect(stamped.publish_block_code).toBe('designed_visual_required');
  });
});

describe('persistIfPublishReady', () => {
  const shopDesigned = {
    pipeline: 'fal_design',
    production_role: 'fal_designed_post',
    fal_designer_produced: true,
    fal_design_engine: 'gpt_image_designed',
    agency_produced: true,
    gallery_match_score: 70,
  };
  const beachDesigned = {
    pipeline: 'fal_design',
    production_role: 'fal_designed_post',
    fal_designer_produced: true,
    agency_produced: true,
    gallery_match_score: 68,
  };

  it('local_products_shop: grafiker 4 withholds persist', () => {
    const gate = persistIfPublishReady(resolveArtifactPublishReady({
      meta: { ...shopDesigned, grafiker_score: 4, grafiker_pass: false },
      content: { kind: 'instagram_post', imageUrl: 'https://cdn.example.com/oil.jpg' },
      format: 'post',
      designedVisualReady: true,
    }));
    expect(gate.persist).toBe(false);
    if (!gate.persist) {
      expect(gate.errorCode).toBe('quality_hard_block');
    }
  });

  it('local_products_shop: grafiker 9 persists; soft 6 also persists', () => {
    const ready = persistIfPublishReady(resolveArtifactPublishReady({
      meta: { ...shopDesigned, grafiker_score: 9, grafiker_pass: true },
      content: { kind: 'instagram_post' },
      format: 'post',
      designedVisualReady: true,
    }));
    const soft = persistIfPublishReady(resolveArtifactPublishReady({
      meta: { ...shopDesigned, grafiker_score: 6, grafiker_pass: false },
      content: { kind: 'instagram_post' },
      format: 'post',
      designedVisualReady: true,
    }));
    expect(ready.persist).toBe(true);
    expect(soft.persist).toBe(true);
  });

  it('shop editorial: typography fail withholds even without text_validated', () => {
    const type = persistIfPublishReady(resolveArtifactPublishReady({
      meta: {
        ...shopDesigned,
        pipeline: 'premium_editorial',
        production_role: 'premium_editorial_campaign_post',
        grafiker_score: 5,
        grafiker_pass: false,
        typography_text_valid: false,
      },
      content: { kind: 'instagram_post', imageUrl: 'https://cdn.example.com/editorial.jpg' },
      format: 'post',
      designedVisualReady: true,
    }));
    expect(type.persist).toBe(false);
    if (!type.persist) expect(type.errorCode).toBe('quality_hard_block');
  });

  it('beach_club: grafiker 3 withholds; typography fail withholds', () => {
    const broken = persistIfPublishReady(resolveArtifactPublishReady({
      meta: { ...beachDesigned, grafiker_score: 3, grafiker_pass: false },
      content: { kind: 'instagram_post', imageUrl: 'https://cdn.example.com/pier.jpg' },
      format: 'post',
      designedVisualReady: true,
    }));
    const type = persistIfPublishReady(resolveArtifactPublishReady({
      meta: {
        ...beachDesigned,
        grafiker_score: 6,
        grafiker_pass: false,
        typography_text_valid: false,
        text_validated: true,
      },
      content: { kind: 'instagram_post' },
      format: 'post',
      designedVisualReady: true,
    }));
    expect(broken.persist).toBe(false);
    expect(type.persist).toBe(false);
    if (!broken.persist) expect(broken.errorCode).toBe('quality_hard_block');
    if (!type.persist) expect(type.errorCode).toBe('quality_hard_block');
  });

  it('beach_club: publish-ready designed post persists', () => {
    const gate = persistIfPublishReady(resolveArtifactPublishReady({
      meta: { ...beachDesigned, grafiker_score: 8, grafiker_pass: true },
      content: { kind: 'instagram_post' },
      format: 'post',
      designedVisualReady: true,
    }));
    expect(gate.persist).toBe(true);
  });

  it('story guarantee: shop grafiker 3 withholds; beach 8 persists', () => {
    const shop = decideArtifactPersist({
      meta: {
        pipeline: 'fal_story',
        production_role: 'campaign_story_motion',
        fal_designer_produced: true,
        fal_design_engine: 'gpt_image_designed',
        grafiker_score: 3,
        grafiker_pass: false,
        mission_fal_story_guarantee: true,
      },
      content: { kind: 'instagram_story' },
      format: 'story',
      designedVisualReady: true,
    });
    const beach = decideArtifactPersist({
      meta: {
        pipeline: 'fal_story',
        production_role: 'organic_story_still',
        fal_designer_produced: true,
        grafiker_score: 8,
        grafiker_pass: true,
        mission_fal_story_guarantee: true,
      },
      content: { kind: 'instagram_story' },
      format: 'story',
      designedVisualReady: true,
    });
    expect(shop.persist.persist).toBe(false);
    if (!shop.persist.persist) expect(shop.persist.errorCode).toBe('quality_hard_block');
    expect(beach.persist.persist).toBe(true);
  });
});
