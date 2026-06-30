import { describe, expect, it } from 'vitest';
import { resolvePublishImageUrl } from '@/lib/production-bundle';
import type { OutputArtifact } from '@/types';

function falPostArtifact(overrides: Partial<OutputArtifact> = {}): OutputArtifact {
  return {
    id: 'art-fal',
    title: 'Designed post',
    status: 'pending_review',
    contentUrl: '/api/media?key=sarn-beach%2Fimage%2F2026-06-27%2Fdesign.png',
    content: JSON.stringify({
      kind: 'instagram_post',
      contentType: 'post',
      imageUrl: '/api/media-proxy?url=https%3A%2F%2Fwww.sarnicbeach.com%2Fimages%2Fgaleri%2F51.jpg',
    }),
    metadata: {
      pipeline: 'fal_design',
      fal_designer_produced: true,
      production_track: 'fal_ai',
      imageUrl: '/api/media-proxy?url=https%3A%2F%2Fwww.sarnicbeach.com%2Fimages%2Fgaleri%2F51.jpg',
    },
    createdAt: new Date().toISOString(),
    ...overrides,
  } as OutputArtifact;
}

describe('resolvePublishImageUrl', () => {
  it('prefers fal R2 export over gallery proxy in metadata/content', () => {
    expect(resolvePublishImageUrl(falPostArtifact())).toBe(
      '/api/media?key=sarn-beach%2Fimage%2F2026-06-27%2Fdesign.png',
    );
  });

  it('prefers fal.media export over gallery proxy', () => {
    expect(resolvePublishImageUrl(falPostArtifact({
      contentUrl: 'https://v3b.fal.media/files/b/0a9fba42/JbSHh8vX2YHIoRSZt6OzB.jpg',
    }))).toBe('https://v3b.fal.media/files/b/0a9fba42/JbSHh8vX2YHIoRSZt6OzB.jpg');
  });

  it('matches real Sarnıç Meet Our Culinary Team artifact shape', () => {
    expect(resolvePublishImageUrl(falPostArtifact({
      contentUrl: '/api/media?key=sarn-beach%2Fimage%2F2026-06-27%2Fa35e16fd-0c46-4b76-a226-4007f888a9db.png',
      content: JSON.stringify({
        kind: 'instagram_post',
        imageUrl: '/api/media-proxy?url=https%3A%2F%2Fwww.sarnicbeach.com%2Fimages%2Fgaleri%2F24.jpg',
      }),
      metadata: {
        pipeline: 'fal_design',
        fal_designer_produced: true,
        production_track: 'fal_ai',
        imageUrl: '/api/media-proxy?url=https%3A%2F%2Fwww.sarnicbeach.com%2Fimages%2Fgaleri%2F24.jpg',
      },
    }))).toBe(
      '/api/media?key=sarn-beach%2Fimage%2F2026-06-27%2Fa35e16fd-0c46-4b76-a226-4007f888a9db.png',
    );
  });
});
