/**
 * fal.ai logo integrity — post-production compositing of the official brand mark.
 *
 * AI models (Ideogram, GPT-image) must NOT redraw the logo. When a logo URL is
 * supplied we reserve placement space in prompts, then composite the exact asset
 * with sharp after generation.
 */

import type { FalLogoCanvasChannel } from './fal-caption-headline';
import {
  type FalLogoPosition,
  type ResolvedFalLogoPlacement,
  resolveFalLogoPlacement,
} from './fal-logo-placement';
import {
  compositeLogoOnPhoto,
  imageUrlToBuffer,
  resolveMediaFetchUrl,
  type LogoPlacement,
} from './logo-compositor';
import { persistEnhancedImageUrls } from './persist-enhanced-images';

export function falLogoPositionToCompositorPlacement(
  position: FalLogoPosition | null | undefined,
  channel: FalLogoCanvasChannel,
): LogoPlacement {
  if (position === 'top_left') return 'top_left';
  if (position === 'top_center') return 'top_center';
  if (position === 'top_right') return 'top_right';
  if (position === 'bottom_left') return 'bottom_left';
  if (position === 'bottom_center') return 'bottom_center';
  if (position === 'bottom_right') return 'bottom_right';
  return channel === 'reel' || channel === 'story' ? 'top_right' : 'bottom_right';
}

function resolveCompositorPlacement(
  placement: ResolvedFalLogoPlacement | null | undefined,
  channel: FalLogoCanvasChannel,
): LogoPlacement {
  if (placement?.position) {
    return falLogoPositionToCompositorPlacement(placement.position, channel);
  }
  if (placement?.zoneHint) {
    const inferred = resolveFalLogoPlacement({
      agentLogoZone: placement.zoneHint,
      channel,
    });
    if (inferred.position) {
      return falLogoPositionToCompositorPlacement(inferred.position, channel);
    }
  }
  return falLogoPositionToCompositorPlacement(null, channel);
}

function edgePaddingForChannel(
  channel: FalLogoCanvasChannel,
  placement: LogoPlacement,
  baseH: number,
): number {
  const base = Math.max(16, Math.round(baseH * 0.02));
  if (channel !== 'reel' && channel !== 'story') return base;
  if (placement === 'top_left' || placement === 'top_right' || placement === 'top_center') {
    return Math.max(base, Math.round(baseH * 0.12));
  }
  if (placement === 'bottom_left' || placement === 'bottom_right' || placement === 'bottom_center') {
    return Math.max(base, Math.round(baseH * 0.15));
  }
  return base;
}

/**
 * Composite the official logo file onto a designed frame URL.
 * Returns the original URL when compositing fails (non-fatal).
 */
export async function compositeOfficialLogoOnFrameUrl(input: {
  frameUrl: string;
  logoUrl: string;
  placement?: ResolvedFalLogoPlacement | null;
  channel?: FalLogoCanvasChannel;
  workspaceId?: string;
  sizePct?: number;
  opacity?: number;
}): Promise<{ imageUrl: string; logoApplied: boolean }> {
  const logoUrl = input.logoUrl.trim();
  const frameUrl = input.frameUrl.trim();
  if (!logoUrl || !frameUrl) {
    return { imageUrl: frameUrl, logoApplied: false };
  }

  const channel = input.channel ?? 'feed_post';
  const compositorPlacement = resolveCompositorPlacement(input.placement, channel);

  const frameBuffer = await imageUrlToBuffer(frameUrl);
  if (!frameBuffer) {
    console.warn('[fal-logo-composite] Could not read frame — skipping logo composite');
    return { imageUrl: frameUrl, logoApplied: false };
  }

  const sharp = (await import('sharp')).default;
  const meta = await sharp(frameBuffer).metadata();
  const baseH = meta.height ?? 1080;
  const padding = edgePaddingForChannel(channel, compositorPlacement, baseH);

  const result = await compositeLogoOnPhoto({
    baseImageBuffer: frameBuffer,
    logoUrl,
    placement: compositorPlacement,
    sizePct: input.sizePct ?? 10,
    opacity: input.opacity ?? 0.92,
    padding,
  });

  if (!result.logoApplied) {
    return { imageUrl: frameUrl, logoApplied: false };
  }

  const dataUrl = `data:image/jpeg;base64,${result.buffer.toString('base64')}`;
  const workspaceId = input.workspaceId?.trim() || 'shared';
  const persisted = await persistEnhancedImageUrls([dataUrl], workspaceId);
  const imageUrl = persisted[0] ?? dataUrl;

  console.log(
    `[fal-logo-composite] Official logo composited (${compositorPlacement}, channel=${channel})`,
  );
  return { imageUrl, logoApplied: true };
}

function resolveFfmpegBin(): string {
  const candidates = [
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
    'ffmpeg',
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
  return 'ffmpeg';
}

function ffmpegOverlayExpr(placement: LogoPlacement, padding: number): string {
  switch (placement) {
    case 'top_left':
      return `${padding}:${padding}`;
    case 'top_center':
      return `(main_w-overlay_w)/2:${padding}`;
    case 'top_right':
      return `main_w-overlay_w-${padding}:${padding}`;
    case 'bottom_left':
      return `${padding}:main_h-overlay_h-${padding}`;
    case 'bottom_center':
      return `(main_w-overlay_w)/2:main_h-overlay_h-${padding}`;
    case 'bottom_right':
    default:
      return `main_w-overlay_w-${padding}:main_h-overlay_h-${padding}`;
  }
}

/**
 * Burn the official logo onto a fal/Kling MP4 — pixel-perfect, unchanged.
 * Non-fatal: returns original videoUrl when ffmpeg or upload fails.
 */
export async function compositeOfficialLogoOnVideoUrl(input: {
  videoUrl: string;
  logoUrl: string;
  placement?: ResolvedFalLogoPlacement | null;
  channel?: FalLogoCanvasChannel;
  workspaceId?: string;
  sizePct?: number;
  opacity?: number;
}): Promise<{ videoUrl: string; logoApplied: boolean }> {
  const videoUrl = input.videoUrl.trim();
  const logoUrl = input.logoUrl.trim();
  if (!videoUrl || !logoUrl || !videoUrl.startsWith('http')) {
    return { videoUrl, logoApplied: false };
  }

  const channel = input.channel ?? 'reel';
  const compositorPlacement = resolveCompositorPlacement(input.placement, channel);
  const opacity = input.opacity ?? 0.92;
  const sizePct = input.sizePct ?? 10;

  const logoBuffer = await imageUrlToBuffer(logoUrl);
  if (!logoBuffer) {
    console.warn('[fal-logo-composite] Could not fetch logo for video overlay');
    return { videoUrl, logoApplied: false };
  }

  const { mkdtemp, writeFile, readFile, rm } = await import('fs/promises');
  const { join } = await import('path');
  const { tmpdir } = await import('os');
  const { spawn } = await import('child_process');

  const tmpDir = await mkdtemp(join(tmpdir(), 'fal-logo-video-'));
  const inputVideo = join(tmpDir, 'input.mp4');
  const logoPng = join(tmpDir, 'logo.png');
  const outputVideo = join(tmpDir, 'output.mp4');

  try {
    const videoFetchUrl = await resolveMediaFetchUrl(videoUrl);
    const videoRes = await fetch(videoFetchUrl, { signal: AbortSignal.timeout(120_000) });
    if (!videoRes.ok) {
      console.warn(`[fal-logo-composite] Video download failed ${videoRes.status}`);
      return { videoUrl, logoApplied: false };
    }
    await writeFile(inputVideo, Buffer.from(await videoRes.arrayBuffer()));

    const baseW = 1080;
    const baseH = 1920;
    const logoW = Math.max(48, Math.round((baseW * sizePct) / 100));
    const padding = edgePaddingForChannel(channel, compositorPlacement, baseH);

    const sharp = (await import('sharp')).default;
    const logoPrepared = await sharp(logoBuffer)
      .resize(logoW, undefined, { fit: 'inside', withoutEnlargement: false })
      .png()
      .toBuffer();
    await writeFile(logoPng, logoPrepared);

    const overlayExpr = ffmpegOverlayExpr(compositorPlacement, padding);
    const filter = `[1:v]format=rgba,colorchannelmixer=aa=${opacity.toFixed(2)}[logo];[0:v][logo]overlay=${overlayExpr}`;

    const ffmpegBin = resolveFfmpegBin();
    await new Promise<void>((resolve, reject) => {
      let stderr = '';
      const ff = spawn(ffmpegBin, [
        '-y',
        '-i', inputVideo,
        '-i', logoPng,
        '-filter_complex', filter,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '20',
        '-c:a', 'copy',
        outputVideo,
      ]);
      ff.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      ff.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg overlay exit ${code}: ${stderr.slice(-400)}`));
      });
      ff.on('error', reject);
    });

    const outBuffer = await readFile(outputVideo);
    const workspaceId = input.workspaceId?.trim() || 'shared';
    const { isR2Configured, generateStorageKey, uploadToR2 } = await import('@/lib/r2-storage');
    if (!isR2Configured()) {
      console.warn('[fal-logo-composite] R2 not configured — cannot persist logo-overlay video');
      return { videoUrl, logoApplied: false };
    }

    const key = generateStorageKey(workspaceId, 'reels', 'mp4');
    const uploaded = await uploadToR2(outBuffer, key, 'video/mp4');
    console.log(
      `[fal-logo-composite] Official logo burned onto video (${compositorPlacement}, channel=${channel})`,
    );
    return { videoUrl: uploaded.url, logoApplied: true };
  } catch (err) {
    console.warn(
      '[fal-logo-composite] Video logo overlay failed — using original:',
      err instanceof Error ? err.message : err,
    );
    return { videoUrl, logoApplied: false };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
