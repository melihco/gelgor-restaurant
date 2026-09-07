import type { StudioFormat, StudioMotionStamp } from '@smartagency/contracts';

export function formatNeedsMotion(format: StudioFormat): boolean {
  return format === 'reel';
}

export function motionPolicyStamp(input: {
  format: StudioFormat;
  videoUrl?: string;
  audioMuxed?: boolean;
}): { ok: true; motion: StudioMotionStamp } | { ok: false; motion: StudioMotionStamp; error: string } {
  if (!formatNeedsMotion(input.format)) {
    return {
      ok: true,
      motion: { skipped: true, videoUrl: undefined, audioMuxed: undefined },
    };
  }
  const videoUrl = input.videoUrl?.trim();
  const motion: StudioMotionStamp = {
    skipped: false,
    videoUrl,
    audioMuxed: input.audioMuxed,
  };
  if (!videoUrl) {
    return { ok: false, motion, error: 'Reel video yok' };
  }
  return { ok: true, motion };
}
