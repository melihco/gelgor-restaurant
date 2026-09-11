import { describe, expect, it } from 'vitest';
import type { ManifestProductionQueueItem } from '@/lib/auto-produce/build-production-queue';
import type { ProductionRunResultRow } from '@/lib/mission-slot-backfill';
import {
  artifactToProductionRunRow,
  collectPostAdaptSources,
  findEmptyStorySlotItems,
  planPostToStoryAdaptations,
} from '../post-story-adapt';
import type { OutputArtifact } from '@/types';

function queueItem(
  ideaIndex: number,
  slotRole: string,
  pipeline: string,
): ManifestProductionQueueItem {
  return {
    queueIndex: ideaIndex,
    ideaIndex,
    idea: { headline: `Idea ${ideaIndex}` },
    assignment: {
      idea_index: ideaIndex,
      slot_role: slotRole as never,
      pipeline: pipeline as never,
      copy_bundle_id: 'bundle-1',
      publish_channel: 'instagram_organic',
    },
  };
}

function postResult(ideaIndex: number, artifactId: string): ProductionRunResultRow {
  return {
    id: artifactId,
    title: `Post ${ideaIndex}`,
    imageUrl: `https://cdn.example/post-${ideaIndex}.jpg`,
    publishReady: true,
    slotKey: `${ideaIndex}:organic_post`,
    metadata: {
      contentType: 'post',
      production_role: 'organic_post',
      idea_index: ideaIndex,
      headline: `Headline ${ideaIndex}`,
      caption: `Caption ${ideaIndex}`,
      reference_photo_url: `https://cdn.example/ref-${ideaIndex}.jpg`,
    },
  };
}

function storyResult(ideaIndex: number, slotRole: string): ProductionRunResultRow {
  return {
    id: `story-${ideaIndex}`,
    title: `Story ${ideaIndex}`,
    imageUrl: `https://cdn.example/story-${ideaIndex}.jpg`,
    publishReady: true,
    slotKey: `${ideaIndex}:${slotRole}`,
    metadata: {
      contentType: 'story',
      production_role: slotRole,
      idea_index: ideaIndex,
    },
  };
}

describe('post-story-adapt', () => {
  it('collects successful post artifacts as adaptation sources', () => {
    const sources = collectPostAdaptSources([
      postResult(0, 'post-a'),
      postResult(1, 'post-b'),
      { title: 'fail', imageUrl: '', error: 'failed' },
      storyResult(2, 'organic_story_still'),
    ]);
    expect(sources).toHaveLength(2);
    expect(sources[0]?.artifactId).toBe('post-a');
    expect(sources[0]?.referencePhotoUrl).toContain('ref-0');
  });

  it('finds empty story slots when posts exist but stories do not', () => {
    const queue = [
      queueItem(0, 'organic_post', 'gallery_photo'),
      queueItem(0, 'organic_story_still', 'story_still'),
      queueItem(1, 'organic_post', 'gallery_photo'),
      queueItem(1, 'campaign_story_motion', 'remotion_story'),
    ];
    const results = [postResult(0, 'post-a'), postResult(1, 'post-b')];
    const empty = findEmptyStorySlotItems(queue, results);
    expect(empty).toHaveLength(2);
    expect(empty.map((s) => s.assignment.slot_role)).toEqual([
      'organic_story_still',
      'campaign_story_motion',
    ]);
  });

  it('plans adaptations preferring same idea_index post sources', () => {
    const emptyStorySlots = [
      queueItem(1, 'organic_story_still', 'story_still'),
      queueItem(0, 'campaign_story_motion', 'remotion_story'),
    ];
    const postSources = collectPostAdaptSources([
      postResult(0, 'post-a'),
      postResult(1, 'post-b'),
    ]);
    const plans = planPostToStoryAdaptations(emptyStorySlots, postSources);
    expect(plans).toHaveLength(2);
    expect(plans[0]?.source.ideaIndex).toBe(1);
    expect(plans[1]?.source.ideaIndex).toBe(0);
  });

  it('local_products_shop and beach_club: blocked posts are not adapt sources', () => {
    const shopBlocked: ProductionRunResultRow = {
      ...postResult(0, 'shop-hidden'),
      publishReady: false,
      metadata: {
        ...postResult(0, 'shop-hidden').metadata,
        production_role: 'fal_designed_post',
        grafiker_score: 3,
      },
    };
    const beachBlocked: ProductionRunResultRow = {
      ...postResult(1, 'beach-hidden'),
      publishReady: false,
      metadata: {
        ...postResult(1, 'beach-hidden').metadata,
        production_role: 'fal_designed_post',
        typography_text_valid: false,
        text_validated: true,
      },
    };
    const shopReady = postResult(2, 'shop-ok');
    expect(collectPostAdaptSources([shopBlocked, beachBlocked, shopReady])).toHaveLength(1);
    expect(collectPostAdaptSources([shopBlocked, beachBlocked])).toHaveLength(0);
  });

  it('artifactToProductionRunRow withholds shop quality_hard_block', () => {
    const artifact = {
      id: 'art-shop',
      title: 'Dükkan post',
      status: 'pending_review',
      contentUrl: 'https://cdn.example.com/oil.jpg',
      content: JSON.stringify({ kind: 'instagram_post', imageUrl: 'https://cdn.example.com/oil.jpg' }),
      metadata: JSON.stringify({
        pipeline: 'fal_design',
        production_role: 'fal_designed_post',
        fal_designer_produced: true,
        grafiker_score: 4,
        grafiker_pass: false,
        auto_produced: true,
        idea_index: 0,
      }),
    } as OutputArtifact;
    const row = artifactToProductionRunRow(artifact);
    expect(row.publishReady).toBe(false);
    expect(collectPostAdaptSources([row])).toHaveLength(0);
  });

  it('does not plan when story slots are already filled', () => {
    const queue = [
      queueItem(0, 'organic_post', 'gallery_photo'),
      queueItem(0, 'organic_story_still', 'story_still'),
    ];
    const results = [
      postResult(0, 'post-a'),
      storyResult(0, 'organic_story_still'),
    ];
    expect(findEmptyStorySlotItems(queue, results)).toHaveLength(0);
    expect(
      planPostToStoryAdaptations(findEmptyStorySlotItems(queue, results), collectPostAdaptSources(results)),
    ).toHaveLength(0);
  });
});
