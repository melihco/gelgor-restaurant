/**
 * Background music mux for produced reels/stories.
 *
 * fal.ai image-to-video returns silent MP4s, and the ffmpeg steps that trim and
 * concatenate beats strip audio outright (`-an`). A silent short-form video
 * reads as a slideshow ad rather than creator content, so the brand's chosen
 * track has to live *inside* the file — the mobile preview's separate `<audio>`
 * loop never reaches a download, a scheduler, or Instagram.
 *
 * Non-fatal by contract: every failure path returns the original URL, because a
 * silent reel still publishes while a thrown error loses the whole slot.
 */

import { resolveStoryMusicSource } from './story-audio-catalog';
import { resolveMediaFetchUrl } from './logo-compositor';

export interface ReelAudioMuxResult {
  videoUrl: string;
  audioApplied: boolean;
  trackId: string | null;
  /** Why the mux was skipped — for slot metadata, not user-facing copy. */
  skipReason?: string;
}

/** Music beds are long; fade the tail so a mid-phrase cut is not audible. */
const FADE_OUT_SECS = 0.8;
const MAX_VIDEO_SECS = 180;

/**
 * Social platforms normalise playback to roughly -14 LUFS, so a bed mastered
 * quieter than that just sounds thin. Catalog tracks vary in level, and a fixed
 * `volume=` multiplier inherited that spread — one measured render landed at
 * -28.6 LUFS, effectively inaudible on a phone speaker. Normalising per render
 * makes every track arrive at the same loudness instead.
 */
const TARGET_LUFS = -16;
/** Headroom below 0 dBFS; AAC encoding can overshoot a peak-limited master. */
const TARGET_TRUE_PEAK = -1.5;

function resolveBin(name: string): string {
  const candidates = [
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`,
    name,
  ];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    for (const candidate of candidates) {
      try {
        fs.accessSync(candidate);
        return candidate;
      } catch {
        /* try next */
      }
    }
  } catch {
    /* fall through */
  }
  return name;
}

async function probeDurationSecs(binPath: string, filePath: string): Promise<number | null> {
  const { spawn } = await import('child_process');
  return new Promise<number | null>((resolve) => {
    let out = '';
    const proc = spawn(binPath, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    proc.stdout?.on('data', (chunk: Buffer) => { out += chunk.toString(); });
    proc.on('close', () => {
      const secs = Number.parseFloat(out.trim());
      resolve(Number.isFinite(secs) && secs > 0 ? secs : null);
    });
    proc.on('error', () => resolve(null));
  });
}

async function readTrackBytes(trackId: string): Promise<{ bytes: Buffer; ext: string } | null> {
  const source = resolveStoryMusicSource(trackId);
  if (!source) return null;

  if (source.type === 'remote') {
    const url = source.track.url;
    if (!url) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return null;
    const ext = url.split('?')[0]?.split('.').pop()?.toLowerCase();
    return {
      bytes: Buffer.from(await res.arrayBuffer()),
      ext: ext && ext.length <= 4 ? ext : 'mp3',
    };
  }

  // Legacy tracks ship in the web bundle rather than the remote catalog.
  const { readFile } = await import('fs/promises');
  const { join } = await import('path');
  const rel = source.track.relativePath.replace(/^\//, '');
  try {
    return {
      bytes: await readFile(join(process.cwd(), 'public', rel)),
      ext: rel.split('.').pop()?.toLowerCase() || 'mp3',
    };
  } catch {
    return null;
  }
}

/**
 * Burn the brand's background track into a produced video.
 *
 * The track is looped to cover the clip, cut to the video's exact length and
 * faded out, so montage reels of any beat count come back with a full bed.
 */
export async function muxBackgroundMusicOntoVideoUrl(input: {
  videoUrl: string;
  trackId: string | null | undefined;
  workspaceId?: string;
  /** Override the loudness target; reels have no dialogue to duck against. */
  targetLufs?: number;
}): Promise<ReelAudioMuxResult> {
  const videoUrl = (input.videoUrl || '').trim();
  const trackId = (input.trackId || '').trim();
  // R2-backed videos arrive as `/api/media?key=...`, which `resolveMediaFetchUrl`
  // turns into an internal absolute URL. Requiring `http` here skipped exactly
  // the reels that had already been persisted — the ones most worth scoring.
  const fetchable = videoUrl.startsWith('http') || videoUrl.startsWith('/');
  if (!videoUrl || !fetchable) {
    return { videoUrl, audioApplied: false, trackId: null, skipReason: 'no_remote_video' };
  }
  if (!trackId) {
    return { videoUrl, audioApplied: false, trackId: null, skipReason: 'no_track' };
  }

  const { isR2Configured } = await import('@/lib/r2-storage');
  if (!isR2Configured()) {
    return { videoUrl, audioApplied: false, trackId, skipReason: 'r2_unconfigured' };
  }

  const { mkdtemp, writeFile, readFile, rm } = await import('fs/promises');
  const { join } = await import('path');
  const { tmpdir } = await import('os');
  const { spawn } = await import('child_process');

  const tmpDir = await mkdtemp(join(tmpdir(), 'reel-audio-'));
  try {
    const track = await readTrackBytes(trackId);
    if (!track) {
      return { videoUrl, audioApplied: false, trackId, skipReason: 'track_unavailable' };
    }

    const fetchUrl = await resolveMediaFetchUrl(videoUrl);
    const videoRes = await fetch(fetchUrl, { signal: AbortSignal.timeout(120_000) });
    if (!videoRes.ok) {
      return { videoUrl, audioApplied: false, trackId, skipReason: `video_fetch_${videoRes.status}` };
    }

    const inputVideo = join(tmpDir, 'input.mp4');
    const inputAudio = join(tmpDir, `track.${track.ext}`);
    const outputVideo = join(tmpDir, 'output.mp4');
    await writeFile(inputVideo, Buffer.from(await videoRes.arrayBuffer()));
    await writeFile(inputAudio, track.bytes);

    const ffprobeBin = resolveBin('ffprobe');
    const duration = await probeDurationSecs(ffprobeBin, inputVideo);
    if (duration != null && duration > MAX_VIDEO_SECS) {
      return { videoUrl, audioApplied: false, trackId, skipReason: 'video_too_long' };
    }

    const targetLufs = Math.max(-30, Math.min(-8, input.targetLufs ?? TARGET_LUFS));
    const filters = [
      `loudnorm=I=${targetLufs}:TP=${TARGET_TRUE_PEAK}:LRA=11`,
    ];
    if (duration != null) {
      const fade = Math.min(FADE_OUT_SECS, Math.max(0.2, duration / 4));
      filters.push(`afade=t=out:st=${Math.max(0, duration - fade).toFixed(2)}:d=${fade.toFixed(2)}`);
    }

    const ffmpegBin = resolveBin('ffmpeg');
    await new Promise<void>((resolve, reject) => {
      let stderr = '';
      const ff = spawn(ffmpegBin, [
        '-y',
        '-i', inputVideo,
        // Loop the bed so a short track still covers the whole clip.
        '-stream_loop', '-1', '-i', inputAudio,
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-af', filters.join(','),
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '160k',
        '-ar', '44100',
        // Video length wins. `-shortest` alone has been unreliable against an
        // infinite `-stream_loop`, so cap with `-t` whenever the probe succeeded.
        ...(duration != null ? ['-t', duration.toFixed(3)] : []),
        '-shortest',
        '-movflags', '+faststart',
        outputVideo,
      ]);
      // A hung encode would hold the production slot open indefinitely.
      const killTimer = setTimeout(() => {
        ff.kill('SIGKILL');
        reject(new Error('ffmpeg audio mux timed out'));
      }, 180_000);
      ff.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      ff.on('close', (code) => {
        clearTimeout(killTimer);
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg audio mux exit ${code}: ${stderr.slice(-400)}`));
      });
      ff.on('error', (err) => {
        clearTimeout(killTimer);
        reject(err);
      });
    });

    const outBuffer = await readFile(outputVideo);
    const workspaceId = input.workspaceId?.trim() || 'shared';
    const { generateStorageKey, uploadToR2 } = await import('@/lib/r2-storage');
    const key = generateStorageKey(workspaceId, 'reel', 'mp4');
    const uploaded = await uploadToR2(outBuffer, key, 'video/mp4');

    console.log(
      `[reel-audio-mux] track "${trackId}" muxed (${duration?.toFixed(1) ?? '?'}s @ ${targetLufs} LUFS)`,
    );
    return { videoUrl: uploaded.url, audioApplied: true, trackId };
  } catch (err) {
    console.warn(
      '[reel-audio-mux] mux failed — publishing silent video:',
      err instanceof Error ? err.message : err,
    );
    return { videoUrl, audioApplied: false, trackId, skipReason: 'ffmpeg_failed' };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
