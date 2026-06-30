import { describe, expect, it } from 'vitest';
import {
  buildFeedArtifactViewModel,
  resolveFeedPreviewVideoUrl,
  resolveFeedProducedMedia,
  resolveFeedProducedStillUrl,
} from '@/lib/artifact-view-model';
import type { OutputArtifact } from '@/types';

function falArtifact(overrides: Partial<OutputArtifact> = {}): OutputArtifact {
  return {
    id: 'art-1',
    title: 'Summer Beats',
    status: 'pending_review',
    contentUrl: '/api/media?key=sarn-beach/fal/summer-beats.png',
    content: JSON.stringify({
      kind: 'post',
      imageUrl: '/api/media-proxy?url=https%3A%2F%2Fsarnicbeach.com%2Fgaleri%2Fphoto.jpg',
    }),
    metadata: {
      pipeline: 'fal_only_post',
      fal_designer_produced: true,
      production_track: 'fal_ai',
    },
    createdAt: new Date().toISOString(),
    ...overrides,
  } as OutputArtifact;
}

describe('resolveFeedProducedMedia', () => {
  it('prefers persisted fal export over gallery proxy in content.imageUrl', () => {
    expect(resolveFeedProducedStillUrl(falArtifact())).toBe(
      '/api/media?key=sarn-beach/fal/summer-beats.png',
    );
  });

  it('maps fal reel mp4 export to videoUrl', () => {
    expect(resolveFeedProducedMedia(falArtifact({
      contentUrl: '/api/media?key=sarn-beach/fal/summer-reel.mp4',
      content: JSON.stringify({
        kind: 'reel',
        videoUrl: '/api/media-proxy?url=https%3A%2F%2Fsarnicbeach.com%2Fgaleri%2Fphoto.jpg',
        imageUrl: '/api/media-proxy?url=https%3A%2F%2Fsarnicbeach.com%2Fgaleri%2Fphoto.jpg',
      }),
      metadata: {
        pipeline: 'fal_only_reel',
        fal_video_produced: true,
        production_track: 'fal_ai',
      },
    }))).toEqual({
      videoUrl: '/api/media?key=sarn-beach/fal/summer-reel.mp4',
      imageUrl: null,
    });
  });

  it('maps fal story still export to imageUrl', () => {
    expect(resolveFeedProducedMedia(falArtifact({
      contentUrl: '/api/media?key=sarn-beach/fal/story-still.png',
      content: JSON.stringify({
        kind: 'story',
        imageUrl: '/api/media-proxy?url=https%3A%2F%2Fsarnicbeach.com%2Fgaleri%2Fphoto.jpg',
      }),
      metadata: {
        pipeline: 'fal_only_story',
        fal_designer_produced: true,
        production_track: 'fal_ai',
      },
    }))).toEqual({
      imageUrl: '/api/media?key=sarn-beach/fal/story-still.png',
      videoUrl: null,
    });
  });

  it('ignores artifacts without persisted export in contentUrl', () => {
    expect(resolveFeedProducedStillUrl(falArtifact({
      contentUrl: '/api/media-proxy?url=https%3A%2F%2Fexample.com%2Fphoto.jpg',
    }))).toBeNull();
  });
});

describe('resolveFeedPreviewVideoUrl', () => {
  it('prefers contentUrl mp4 export for story/reel viewer', () => {
    expect(resolveFeedPreviewVideoUrl(falArtifact({
      contentUrl: '/api/media?key=sarn-beach/fal/reel.mp4',
      content: JSON.stringify({ kind: 'reel' }),
      metadata: {
        pipeline: 'fal_only_reel',
        fal_video_produced: true,
        videoUrl: '/api/media-proxy?url=https%3A%2F%2Fsarnicbeach.com%2Fgaleri%2Fphoto.jpg',
      },
    }))).toBe('/api/media?key=sarn-beach/fal/reel.mp4');
  });
});

describe('buildFeedArtifactViewModel', () => {
  it('uses fal contentUrl for feed preview image', () => {
    const vm = buildFeedArtifactViewModel(falArtifact());
    expect(vm.content.imageUrl).toBe('/api/media?key=sarn-beach/fal/summer-beats.png');
  });

  it('clears non-video videoUrl and still preview on reel slot', () => {
    const vm = buildFeedArtifactViewModel(falArtifact({
      content: JSON.stringify({
        kind: 'reel',
        videoUrl: '/api/media?key=sarn-beach/fal/reel-frame.png',
        imageUrl: '/api/media-proxy?url=https%3A%2F%2Fsarnicbeach.com%2Fgaleri%2Fphoto.jpg',
      }),
      metadata: {
        pipeline: 'fal_only_reel',
        fal_video_produced: true,
        production_track: 'fal_ai',
      },
    }));
    expect(vm.content.imageUrl).toBeNull();
    expect(vm.content.videoUrl).toBeNull();
  });

  it('does not expose fal reel PNG export as still preview', () => {
    expect(resolveFeedProducedStillUrl(falArtifact({
      contentUrl: '/api/media?key=sarn-beach/fal/reel-frame.png',
      content: JSON.stringify({ kind: 'reel' }),
      metadata: {
        pipeline: 'fal_only_reel',
        fal_designer_produced: true,
        production_track: 'fal_ai',
      },
    }))).toBeNull();
  });

  it('plays fal reel mp4 in feed reel preview', () => {
    const vm = buildFeedArtifactViewModel(falArtifact({
      contentUrl: '/api/media?key=sarn-beach/fal/reel.mp4',
      content: JSON.stringify({
        kind: 'reel',
        imageUrl: '/api/media-proxy?url=https%3A%2F%2Fsarnicbeach.com%2Fgaleri%2Fphoto.jpg',
      }),
      metadata: {
        pipeline: 'fal_only_reel',
        fal_video_produced: true,
        production_track: 'fal_ai',
      },
    }));
    expect(vm.content.videoUrl).toBe('/api/media?key=sarn-beach/fal/reel.mp4');
    expect(vm.content.imageUrl).toBeNull();
  });

  it('shows fal story still in story preview mode', () => {
    const vm = buildFeedArtifactViewModel(falArtifact({
      contentUrl: '/api/media?key=sarn-beach/fal/story.png',
      content: JSON.stringify({
        kind: 'story',
        imageUrl: '/api/media-proxy?url=https%3A%2F%2Fsarnicbeach.com%2Fgaleri%2Fphoto.jpg',
      }),
      metadata: {
        pipeline: 'fal_only_story',
        fal_designer_produced: true,
        production_track: 'fal_ai',
      },
    }));
    expect(vm.previewMode).toBe('story');
    expect(vm.content.imageUrl).toBe('/api/media?key=sarn-beach/fal/story.png');
    expect(vm.content.videoUrl).toBeNull();
  });
});
