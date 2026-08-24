import { afterEach, describe, expect, it, vi } from 'vitest';
import { muxBackgroundMusicOntoVideoUrl } from '../reel-audio-mux';
import { STORY_MUSIC_TRACKS } from '../story-music-tracks.generated';
import { artifactCarriesEmbeddedAudio } from '@/hooks/useBrandStoryAudio';

// The R2 guard runs before the track is fetched, so it has to pass for the
// track-loading branch to be reachable at all.
vi.mock('@/lib/r2-storage', () => ({
  isR2Configured: () => true,
  generateStorageKey: () => 'ws/reel/2026-08-24/test.mp4',
  uploadToR2: async () => ({ url: 'https://r2.example.com/test.mp4' }),
}));

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

describe('catalog track fetching', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refuses a track served as HTML instead of audio', async () => {
    // The catalog's own links return a download *page*; live, that markup was
    // written to track.mp3 and surfaced as a generic ffmpeg failure on four of
    // five reels. Anything that is not audio has to be rejected by name.
    const fetchMock = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.includes('/api/story-music/')) {
        return new Response('<!DOCTYPE html><html></html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      return new Response(new Uint8Array([0, 0, 0]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await muxBackgroundMusicOntoVideoUrl({
      videoUrl: 'https://cdn.example.com/reel.mp4',
      trackId: STORY_MUSIC_TRACKS[0]!.id,
    });
    expect(res.audioApplied).toBe(false);
    expect(res.skipReason).toBe('track_unavailable');
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/api/story-music/'))).toBe(true);
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
