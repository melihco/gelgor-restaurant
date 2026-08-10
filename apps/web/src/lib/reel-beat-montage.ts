/**
 * Multi-beat reel montage — photo_plate I2V per gallery beat + ffmpeg concat.
 *
 * Used when reel_recipe.editStyle === sequential_beats and ≥2 photos exist.
 * Falls back to single-clip when ffmpeg/fal fails (non-fatal).
 */

import { spawn } from 'child_process';
import { mkdtemp, writeFile, readFile, rm, access } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { generateStoryMotionPlate, resolveMotionStyle } from '@/lib/fal-story-motion';
import { isUsableReelPhotoUrl } from '@/lib/reel-multi-production';
import { isR2Configured, generateStorageKey, uploadToR2 } from '@/lib/r2-storage';
import type { ReelRecipe } from '@/lib/reel-production-recipe';
import { applyVideoTierScopeToMontageStrategy } from '@/lib/video-tier-scope';
import { REEL_BEAT_MONTAGE_PHOTO_CAP } from '@/lib/mission-production-cost-guards';

function resolveFfmpegBin(): string {
  return '/opt/homebrew/bin/ffmpeg';
}

async function findFfmpeg(): Promise<string | null> {
  const candidates = [
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
    'ffmpeg',
  ];
  for (const c of candidates) {
    try {
      await access(c);
      return c;
    } catch {
      /* next */
    }
  }
  return resolveFfmpegBin();
}

function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const ff = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    ff.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`));
    });
  });
}

export function shouldRunReelBeatMontage(input: {
  recipe: ReelRecipe;
  photoUrls: string[];
  productionTier?: string | null;
}): boolean {
  if (input.recipe.editStyle !== 'sequential_beats' && input.recipe.editStyle !== 'multi_ref') {
    return false;
  }
  if (input.recipe.beatCount < 2) return false;
  const scoped = applyVideoTierScopeToMontageStrategy('sequential', input.productionTier);
  if (scoped === 'single') return false;
  const usable = input.photoUrls.filter(isUsableReelPhotoUrl);
  return usable.length >= 2;
}

export function pickReelBeatPhotoUrls(input: {
  primaryUrl: string;
  candidates: string[];
  beatCount: number;
}): string[] {
  const primary = input.primaryUrl.trim();
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (u: string) => {
    const t = u.trim();
    if (!t || !isUsableReelPhotoUrl(t) || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  push(primary);
  for (const c of input.candidates) {
    if (out.length >= input.beatCount) break;
    push(c);
  }
  return out.slice(0, Math.max(1, Math.min(REEL_BEAT_MONTAGE_PHOTO_CAP, input.beatCount)));
}

/**
 * Generate one I2V clip per beat photo, trim to even lengths, concat.
 * Returns null when montage cannot be completed (caller keeps single-clip video).
 */
export async function assembleReelBeatMontage(input: {
  photoUrls: string[];
  recipe: ReelRecipe;
  sector?: string;
  brandName?: string;
  mood?: string;
  designerMotionCue?: string;
  workspaceId?: string;
  timeoutMsPerBeat?: number;
}): Promise<{ videoUrl: string; beatCount: number; model: string } | null> {
  const urls = input.photoUrls.filter(isUsableReelPhotoUrl).slice(0, 3);
  if (urls.length < 2) return null;

  const beatSecs = Math.max(2, Math.min(5, Math.round(input.recipe.durationSecs / urls.length)));
  const style = resolveMotionStyle(input.sector, input.mood);
  const timeoutMs = input.timeoutMsPerBeat ?? 120_000;
  const clips: string[] = [];
  let lastModel = 'fal_video';

  for (let i = 0; i < urls.length; i++) {
    const photo = urls[i]!;
    try {
      const motion = await generateStoryMotionPlate({
        imageUrl: photo,
        sector: input.sector,
        brandName: input.brandName,
        mood: input.mood,
        style,
        timeoutMs,
        preserveExistingText: false,
        pipeline: 'fal_reel',
        designerMotionCue: [
          input.designerMotionCue,
          `Beat ${i + 1}/${urls.length} of ${input.recipe.beatRecipe}: photo-only motion, no text.`,
        ].filter(Boolean).join(' · ').slice(0, 220),
        durationSecs: 5,
      });
      clips.push(motion.videoUrl);
      lastModel = motion.model;
    } catch (err) {
      console.warn(
        `[reel-beat-montage] beat ${i + 1} I2V failed:`,
        err instanceof Error ? err.message : err,
      );
      // Need at least 2 successful clips
      if (clips.length === 0 && i === urls.length - 1) return null;
    }
  }

  if (clips.length < 2) return null;

  const ffmpeg = await findFfmpeg();
  if (!ffmpeg) {
    console.warn('[reel-beat-montage] ffmpeg missing — returning first clip only');
    return { videoUrl: clips[0]!, beatCount: 1, model: lastModel };
  }

  const tmpDir = await mkdtemp(join(tmpdir(), 'reel-beats-'));
  try {
    const trimmed: string[] = [];
    for (let i = 0; i < clips.length; i++) {
      const srcPath = join(tmpDir, `src-${i}.mp4`);
      const trimPath = join(tmpDir, `trim-${i}.mp4`);
      const res = await fetch(clips[i]!, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) continue;
      await writeFile(srcPath, Buffer.from(await res.arrayBuffer()));
      await runFfmpeg(ffmpeg, [
        '-y', '-i', srcPath,
        '-t', String(beatSecs),
        '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an',
        trimPath,
      ]);
      trimmed.push(trimPath);
    }
    if (trimmed.length < 2) return { videoUrl: clips[0]!, beatCount: 1, model: lastModel };

    const listPath = join(tmpDir, 'list.txt');
    await writeFile(
      listPath,
      trimmed.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'),
    );
    const outPath = join(tmpDir, 'montage.mp4');
    await runFfmpeg(ffmpeg, [
      '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an',
      outPath,
    ]);

    const buf = await readFile(outPath);
    if (!isR2Configured() || !input.workspaceId) {
      // Data URI fallback is too large for MP4 — return first clip
      console.warn('[reel-beat-montage] R2 not configured — cannot persist montage');
      return { videoUrl: clips[0]!, beatCount: 1, model: lastModel };
    }
    const key = generateStorageKey(input.workspaceId ?? 'shared', 'reel-multi', 'mp4');
    const uploaded = await uploadToR2(buf, key, 'video/mp4');
    if (!uploaded?.url) {
      return { videoUrl: clips[0]!, beatCount: 1, model: lastModel };
    }
    console.log(
      `[reel-beat-montage] assembled ${trimmed.length} beats (${beatSecs}s each) → ${uploaded.url.slice(0, 80)}`,
    );
    return { videoUrl: uploaded.url, beatCount: trimmed.length, model: lastModel };
  } catch (err) {
    console.warn(
      '[reel-beat-montage] assemble failed:',
      err instanceof Error ? err.message : err,
    );
    return clips[0] ? { videoUrl: clips[0], beatCount: 1, model: lastModel } : null;
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
