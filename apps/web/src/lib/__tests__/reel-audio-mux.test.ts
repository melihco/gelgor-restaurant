import { describe, expect, it } from 'vitest';
import { muxBackgroundMusicOntoVideoUrl } from '../reel-audio-mux';
import { artifactCarriesEmbeddedAudio } from '@/hooks/useBrandStoryAudio';

/**
 * The mux runs ffmpeg on a produced file, so the encode itself is verified
 * against real media rather than here. These cover the guards that decide
 * whether it runs at all — each one has to hand back the original URL, because
 * a silent reel publishes while a thrown error loses the whole slot.
 */
describe('muxBackgroundMusicOntoVideoUrl guards', () => {
  it('keeps the original video when no track is selected', async () => {
    const res = await muxBackgroundMusicOntoVideoUrl({
      videoUrl: 'https://cdn.example.com/reel.mp4',
      trackId: null,
    });
    expect(res).toMatchObject({
      videoUrl: 'https://cdn.example.com/reel.mp4',
      audioApplied: false,
      skipReason: 'no_track',
    });
  });

  it('skips only URLs that cannot be fetched back', async () => {
    for (const videoUrl of ['data:video/mp4;base64,AAA', '', 'not-a-url']) {
      const res = await muxBackgroundMusicOntoVideoUrl({ videoUrl, trackId: 'deep house' });
      expect(res.audioApplied).toBe(false);
      expect(res.skipReason).toBe('no_remote_video');
      expect(res.videoUrl).toBe(videoUrl);
    }
  });

  it('accepts R2-backed media paths, which is how persisted reels arrive', async () => {
    // Live reels are stored as `/api/media?key=...`; rejecting them skipped the
    // only videos that had already been through post-production.
    const res = await muxBackgroundMusicOntoVideoUrl({
      videoUrl: '/api/media?key=tenant%2Freel%2F2026-08-24%2Fclip.mp4',
      trackId: 'deep house',
    });
    expect(res.skipReason).not.toBe('no_remote_video');
  });
});

describe('artifactCarriesEmbeddedAudio', () => {
  it('is true only for an explicit produce-time mux stamp', () => {
    expect(artifactCarriesEmbeddedAudio({ story_audio_muxed: true })).toBe(true);
    expect(artifactCarriesEmbeddedAudio({ storyAudioMuxed: true })).toBe(true);
    // A selected mood alone means the preview still has to score the video.
    expect(artifactCarriesEmbeddedAudio({ story_audio_mood: 'deep house' })).toBe(false);
    expect(
      artifactCarriesEmbeddedAudio({ story_audio_muxed: false, story_audio_mux_skip: 'ffmpeg_failed' }),
    ).toBe(false);
    expect(artifactCarriesEmbeddedAudio(null)).toBe(false);
    expect(artifactCarriesEmbeddedAudio(undefined)).toBe(false);
    // Truthy-but-not-true must not unmute a silent file.
    expect(artifactCarriesEmbeddedAudio({ story_audio_muxed: 'yes' })).toBe(false);
  });
});
