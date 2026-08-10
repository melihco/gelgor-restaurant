import { describe, expect, it } from 'vitest';
import {
  isDesignedVisualPipeline,
  resolveArtifactPublishReady,
  stampPublishReadyMetadata,
} from '@/lib/artifact-publish-ready';
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
