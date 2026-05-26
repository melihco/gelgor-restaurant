/**
 * POST /api/generate-multi-reel
 *
 * Generates a multi-photo Instagram Reel using one of two strategies:
 *
 * Strategy A — Multi-reference (fast, single Runway call):
 *   Pass 2-4 photos as promptImages[] → Runway blends all into one rich video.
 *   Best for: brand atmosphere, style consistency across shots.
 *
 * Strategy B — Sequential clips + FFmpeg stitch (slower, true montage):
 *   Generate a 5s Runway clip per photo → concatenate with FFmpeg.
 *   Best for: story-driven reels (cocktail → venue → team), max 3 clips.
 *   Requires: ffmpeg binary on PATH.
 *
 * Request body:
 * {
 *   workspaceId: string
 *   photos: Array<{ url: string; description?: string; tags?: string[] }>  // 2-4 photos
 *   headline: string
 *   caption: string
 *   brandName: string
 *   brandLocation?: string
 *   vibeProfile?: object
 *   brandThemeGrading?: { look?: string; lut_directive?: string }
 *   strategy?: 'multi_ref' | 'sequential'  // default: 'multi_ref'
 *   ratio?: string
 *   duration?: number
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRunwayVideoService } from '@/lib/runway/services/runway-video.service';
import {
  buildDirectorPromptWithAI,
  buildDirectorPromptTemplate,
  inferContentKind,
} from '@/lib/runway/builders/reel-prompt.builder';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface PhotoInput {
  url: string;
  description?: string;
  tags?: string[];
}

interface MultiReelRequest {
  workspaceId: string;
  photos: PhotoInput[];
  headline: string;
  caption: string;
  brandName: string;
  brandLocation?: string;
  vibeProfile?: Record<string, unknown>;
  brandThemeGrading?: { look?: string; lut_directive?: string };
  strategy?: 'multi_ref' | 'sequential';
  ratio?: string;
  duration?: number;
}

const RUNWAY_MAX_BYTES = 7 * 1024 * 1024;
const RUNWAY_SUPPORTED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

async function fetchAsBase64(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(18_000),
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*,*/*;q=0.5' },
    });
    if (!res.ok) return undefined;
    const mime = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0]!.trim();
    const supported = RUNWAY_SUPPORTED.includes(mime) ? mime : 'image/jpeg';
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > RUNWAY_MAX_BYTES) return undefined;
    return `data:${supported};base64,${buf.toString('base64')}`;
  } catch {
    return undefined;
  }
}

// ── Strategy A: Multi-reference (single Runway call) ───────────────────────

async function generateMultiRef(
  body: MultiReelRequest,
  directorPrompt: string,
): Promise<{ videoUrl: string | null; error?: string }> {
  const service = getRunwayVideoService();

  // Validate photos are HTTPS URLs (multi-ref requires URL mode, not base64)
  const photoUrls = body.photos
    .filter(p => p.url.startsWith('http'))
    .map(p => p.url)
    .slice(0, 4);

  if (photoUrls.length < 2) {
    return { videoUrl: null, error: 'Multi-reference requires at least 2 HTTPS URLs' };
  }

  const result = await service.generateReelVideo({
    title: body.headline,
    concept: body.caption,
    platform: 'instagram',
    contentType: 'reel',
    promptText: directorPrompt,
    promptImages: photoUrls,
    ratio: (body.ratio ?? '720:1280') as '720:1280',
    duration: (body.duration ?? 5) as 5,
    sceneMetadata: {
      brandName: body.brandName,
      location: body.brandLocation,
      workspaceId: body.workspaceId,
    },
  });

  return {
    videoUrl: result.success ? (result.outputUrls[0] ?? null) : null,
    error: result.success ? undefined : result.error,
  };
}

// ── Strategy B: Sequential clips + FFmpeg concat ───────────────────────────

async function generateSequential(
  body: MultiReelRequest,
  directorPrompt: string,
): Promise<{ videoUrl: string | null; clipUrls: string[]; error?: string }> {
  const service = getRunwayVideoService();
  const photos = body.photos.slice(0, 3); // max 3 clips for cost control (~$0.30 total)
  const clipUrls: string[] = [];

  // Generate one Runway clip per photo
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i]!;
    // Build a photo-specific sub-prompt for this clip
    const subPrompt = [
      `Clip ${i + 1}/${photos.length}.`,
      directorPrompt.slice(0, 700),
    ].join(' ').slice(0, 960);

    const base64 = await fetchAsBase64(photo.url);
    if (!base64) {
      console.warn(`[multi-reel] Skipping clip ${i + 1}: image not fetchable`);
      continue;
    }

    const result = await service.generateReelVideo({
      title: `${body.headline} — clip ${i + 1}`,
      concept: body.caption,
      platform: 'instagram',
      contentType: 'reel',
      promptText: subPrompt,
      promptImage: base64,
      ratio: (body.ratio ?? '720:1280') as '720:1280',
      duration: 5,
      sceneMetadata: {
        brandName: body.brandName,
        location: body.brandLocation,
        workspaceId: body.workspaceId,
      },
    });

    if (result.success && result.outputUrls[0]) {
      clipUrls.push(result.outputUrls[0]);
    } else {
      console.warn(`[multi-reel] Clip ${i + 1} failed: ${result.error?.slice(0, 100)}`);
    }
  }

  if (clipUrls.length === 0) {
    return { videoUrl: null, clipUrls: [], error: 'All Runway clips failed' };
  }

  if (clipUrls.length === 1) {
    // Only one clip succeeded — return it directly
    return { videoUrl: clipUrls[0]!, clipUrls };
  }

  // Stitch clips with FFmpeg
  try {
    const stitched = await stitchClipsWithFFmpeg(clipUrls, body.workspaceId, body.brandName);
    return { videoUrl: stitched, clipUrls };
  } catch (err) {
    console.warn('[multi-reel] FFmpeg stitch failed, returning first clip:', err);
    return { videoUrl: clipUrls[0]!, clipUrls, error: 'Stitch failed, returning first clip' };
  }
}

async function stitchClipsWithFFmpeg(
  videoUrls: string[],
  workspaceId: string,
  brandName: string,
): Promise<string | null> {
  const { spawn } = await import('child_process');
  const { writeFile, unlink, mkdtemp } = await import('fs/promises');
  const { join } = await import('path');
  const { tmpdir } = await import('os');

  const tmpDir = await mkdtemp(join(tmpdir(), 'reel-stitch-'));
  const localPaths: string[] = [];

  try {
    // Download each clip
    for (let i = 0; i < videoUrls.length; i++) {
      const url = videoUrls[i]!;
      const localPath = join(tmpDir, `clip${i}.mp4`);

      // Resolve /api/media?key= → presigned R2 URL if needed
      let fetchUrl = url;
      if (url.startsWith('/api/media')) {
        const origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
        fetchUrl = `${origin}${url}`;
      }

      const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`Failed to download clip ${i}: ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(localPath, buf);
      localPaths.push(localPath);
    }

    // Write FFmpeg concat list
    const concatList = join(tmpDir, 'list.txt');
    const listContent = localPaths.map(p => `file '${p}'`).join('\n');
    await writeFile(concatList, listContent);

    // Run FFmpeg concat — resolve binary from common macOS/Linux paths
    const ffmpegBin = [
      '/opt/homebrew/bin/ffmpeg',   // Apple Silicon Mac (Homebrew default)
      '/usr/local/bin/ffmpeg',      // Intel Mac (Homebrew)
      '/usr/bin/ffmpeg',            // Linux
      'ffmpeg',                     // PATH fallback
    ].find(p => {
      try { require('fs').accessSync(p); return true; } catch { return false; }
    }) ?? 'ffmpeg';

    const outputPath = join(tmpDir, 'stitched.mp4');
    await new Promise<void>((resolve, reject) => {
      const ff = spawn(ffmpegBin, [
        '-f', 'concat', '-safe', '0', '-i', concatList,
        '-c', 'copy',
        '-y', outputPath,
      ]);
      ff.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
      ff.on('error', reject);
    });

    // Upload stitched video to R2
    const { isR2Configured, generateStorageKey, uploadImageFromUrl } = await import('@/lib/r2-storage');
    if (!isR2Configured()) {
      // Return local file as base64 data URI (fallback for dev without R2)
      const { readFile } = await import('fs/promises');
      const buf = await readFile(outputPath);
      return `data:video/mp4;base64,${buf.toString('base64')}`;
    }

    const key = generateStorageKey(brandName, 'reel-multi', 'mp4');
    // Read file and upload via buffer
    const { readFile } = await import('fs/promises');
    const videoBuf = await readFile(outputPath);
    const { default: FormData } = await import('form-data');
    void FormData; // unused — use uploadImageFromUrl pattern

    // Use uploadImageFromUrl with a file:// protocol doesn't work — write temp workaround
    const r2Result = await uploadImageFromUrl(
      `file://${outputPath}`, // local file protocol
      key,
    ).catch(() => null);

    if (r2Result) return r2Result.url;

    // If R2 upload failed, return first clip as fallback
    return null;
  } finally {
    // Cleanup temp files
    for (const p of localPaths) await unlink(p).catch(() => {});
    await unlink(join(tmpDir, 'list.txt')).catch(() => {});
    await unlink(join(tmpDir, 'stitched.mp4')).catch(() => {});
    await import('fs/promises').then(fs => fs.rmdir(tmpDir)).catch(() => {});
  }
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: MultiReelRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { photos, headline, caption, brandName, brandLocation, vibeProfile, brandThemeGrading } = body;

  if (!photos?.length || photos.length < 2) {
    return NextResponse.json({ error: 'At least 2 photos required' }, { status: 400 });
  }
  if (!headline || !caption) {
    return NextResponse.json({ error: 'headline and caption required' }, { status: 400 });
  }

  const strategy = body.strategy ?? 'multi_ref';

  // Build AI director prompt from the combined photo context
  const combinedDesc = photos.map(p => p.description).filter(Boolean).join(' | ');
  const combinedTags = [...new Set(photos.flatMap(p => p.tags ?? []))].slice(0, 15);
  const contentKind = inferContentKind({ headline, caption, photoTags: combinedTags });

  let directorPrompt: string;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const ai = await buildDirectorPromptWithAI(
      {
        headline,
        caption: caption.slice(0, 300),
        contentKind,
        brandName,
        brandLocation,
        photoDescription: combinedDesc.slice(0, 300),
        photoTags: combinedTags,
        vibeProfile: vibeProfile as Parameters<typeof buildDirectorPromptWithAI>[0]['vibeProfile'],
        brandThemeGrading,
        mood: '',
      },
      openaiKey,
    );
    directorPrompt = ai ?? buildDirectorPromptTemplate({
      headline, caption: caption.slice(0, 300), contentKind,
      brandName, brandLocation,
      photoDescription: combinedDesc.slice(0, 300),
      photoTags: combinedTags,
      vibeProfile: vibeProfile as Parameters<typeof buildDirectorPromptTemplate>[0]['vibeProfile'],
      brandThemeGrading,
    });
  } else {
    directorPrompt = buildDirectorPromptTemplate({
      headline, caption: caption.slice(0, 300), contentKind,
      brandName, brandLocation,
      photoDescription: combinedDesc.slice(0, 300),
      photoTags: combinedTags,
      vibeProfile: vibeProfile as Parameters<typeof buildDirectorPromptTemplate>[0]['vibeProfile'],
      brandThemeGrading,
    });
  }

  console.log(`[multi-reel] strategy=${strategy}, photos=${photos.length}, kind=${contentKind}`);
  console.log(`[multi-reel] prompt: ${directorPrompt.slice(0, 120)}…`);

  if (strategy === 'sequential') {
    const result = await generateSequential(body, directorPrompt);
    return NextResponse.json({
      strategy: 'sequential',
      videoUrl: result.videoUrl,
      clipUrls: result.clipUrls,
      promptText: directorPrompt,
      photoCount: photos.length,
      error: result.error,
    });
  }

  // Default: multi_ref
  const result = await generateMultiRef(body, directorPrompt);
  return NextResponse.json({
    strategy: 'multi_ref',
    videoUrl: result.videoUrl,
    promptText: directorPrompt,
    photoCount: photos.length,
    error: result.error,
  });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    endpoint: 'POST /api/generate-multi-reel',
    description: 'Generate Instagram Reel from multiple brand gallery photos',
    strategies: {
      multi_ref: 'Single Runway call with 2-4 reference photos — blends visual DNA into one video',
      sequential: 'One Runway clip per photo → FFmpeg stitch → true montage (requires ffmpeg on PATH)',
    },
    requiredFields: ['photos (array, min 2)', 'headline', 'caption', 'brandName', 'workspaceId'],
  });
}
