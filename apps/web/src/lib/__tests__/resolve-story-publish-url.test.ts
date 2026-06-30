import { describe, expect, it } from 'vitest';
import {
  resolveStoryPublishImageUrl,
  resolveStoryPublishVideoUrl,
  resolveStoryVideoUrl,
} from '@/lib/production-bundle';
import type { OutputArtifact } from '@/types';

function falStoryStillMisTagged(overrides: Partial<OutputArtifact> = {}): OutputArtifact {
  const still = '/api/media?key=sarn-beach%2Fimage%2F2026-06-27%2Fc501ec33-fb29-4bf7-9612-4ecb0500c9c8.png';
  return {
    id: 'story-1',
    title: 'Escape to the Beach!',
    status: 'pending_review',
    contentUrl: still,
    content: JSON.stringify({
      kind: 'instagram_story',
      contentType: 'story',
      imageUrl: still,
      videoUrl: still,
    }),
    metadata: {
      pipeline: 'fal_story',
      fal_designer_produced: true,
      production_track: 'fal_ai',
      production_role: 'fal_story_motion',
      imageUrl: still,
      videoUrl: still,
    },
    createdAt: new Date().toISOString(),
    ...overrides,
  } as OutputArtifact;
}

describe('resolveStoryPublishVideoUrl', () => {
  it('rejects PNG mis-tagged as videoUrl', () => {
    expect(resolveStoryVideoUrl(falStoryStillMisTagged())).toBeNull();
    expect(resolveStoryPublishVideoUrl(falStoryStillMisTagged())).toBeNull();
  });

  it('accepts real MP4 exports', () => {
    const artifact = falStoryStillMisTagged({
      contentUrl: 'https://v3b.fal.media/files/b/out.mp4',
      content: JSON.stringify({
        kind: 'instagram_story',
        videoUrl: 'https://v3b.fal.media/files/b/out.mp4',
        imageUrl: '/api/media?key=sarn-beach/still.png',
      }),
    });
    expect(resolveStoryPublishVideoUrl(artifact)).toBe('https://v3b.fal.media/files/b/out.mp4');
  });
});

describe('resolveStoryPublishImageUrl', () => {
  it('returns fal still when videoUrl is mis-tagged PNG', () => {
    const still = '/api/media?key=sarn-beach%2Fimage%2F2026-06-27%2Fc501ec33-fb29-4bf7-9612-4ecb0500c9c8.png';
    expect(resolveStoryPublishImageUrl(falStoryStillMisTagged())).toBe(still);
  });
});
