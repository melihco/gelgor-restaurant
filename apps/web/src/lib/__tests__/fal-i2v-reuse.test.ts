import { describe, expect, it } from 'vitest';

import {
  isRawGalleryI2vArtifact,
  resolveArtifactI2vSourceKey,
  resolveArtifactPlayableVideo,
} from '../fal-i2v-reuse';

describe('fal-i2v-reuse', () => {
  it('accepts raw gallery I2V by motion type and renderer', () => {
    expect(isRawGalleryI2vArtifact(
      { i2v_motion_type: 'raw_gallery', runway_source: 'kling' },
      { videoUrl: 'https://cdn.example.com/a.mp4' },
      'https://cdn.example.com/a.mp4',
    )).toBe(true);

    expect(isRawGalleryI2vArtifact(
      { renderer_executed: 'fal_raw_i2v', runway_source: 'fal_video' },
      { videoUrl: '/api/media/tenant/v.mp4' },
      '/api/media/tenant/v.mp4',
    )).toBe(true);
  });

  it('rejects designed fal typography productions', () => {
    expect(isRawGalleryI2vArtifact(
      {
        fal_designer_produced: true,
        fal_design_engine: 'fal_ideogram_only',
        runway_source: 'kling',
        reference_photo_url: 'https://cdn.example.com/gallery/a.jpg',
        imageUrl: 'https://fal.media/designed.png',
      },
      { videoUrl: 'https://fal.media/video.mp4' },
      'https://fal.media/video.mp4',
    )).toBe(false);
  });

  it('resolves source image from i2v or reference fields', () => {
    const meta = { i2v_source_image_url: 'https://cdn.example.com/gallery/hero.jpg?w=1' };
    expect(resolveArtifactI2vSourceKey(meta, {})).toBe('https://cdn.example.com/gallery/hero.jpg');
  });

  it('prefers playable persisted video URLs', () => {
    const url = resolveArtifactPlayableVideo(
      { videoUrl: 'https://fal.media/ephemeral.mp4' },
      {},
      '/api/media/tenant/persisted.mp4',
    );
    expect(url).toBe('/api/media/tenant/persisted.mp4');
  });
});
