/**
 * Brand-level reel motion defaults — stored on brand_theme.motion_profile.
 * Priority at production time: ideation reel_motion_spec → brand → vibe → sector.
 */
import { normalizeCameraMotion, type UnifiedCameraMotion } from './camera-motion';
import type { BrandMotionProfile, MotionStyle } from './brand-motion-profile';
import type { ReelMontageStrategy } from './reel-multi-production';
import {
  getSectorReelPacing,
  type ReelPacing,
} from './sector-production-profile';

export type BrandReelPace = ReelPacing | 'auto';

export interface BrandReelProductionParams {
  reelPace: string;
  reelPacing: ReelPacing;
  cameraMotion?: UnifiedCameraMotion;
  strategy?: ReelMontageStrategy;
}

export const MOTION_STYLE_REEL_DEFAULTS: Record<
  MotionStyle,
  { reelPacing: ReelPacing; cameraMotion: UnifiedCameraMotion }
> = {
  minimal: { reelPacing: 'slow_burn', cameraMotion: 'static' },
  editorial: { reelPacing: 'mid_tempo', cameraMotion: 'slow_pan' },
  luxury: { reelPacing: 'slow_burn', cameraMotion: 'dolly_in' },
  bold: { reelPacing: 'mid_tempo', cameraMotion: 'orbit' },
  playful: { reelPacing: 'mid_tempo', cameraMotion: 'handheld' },
};

export const REEL_PACE_OPTIONS: { id: ReelPacing; label: string; desc: string }[] = [
  { id: 'slow_burn', label: 'Slow burn', desc: 'Sinematik, tek klipte yavaş tempo' },
  { id: 'mid_tempo', label: 'Mid tempo', desc: 'Editorial akış, dengeli montaj' },
  { id: 'fast_cut', label: 'Fast cut', desc: 'Hızlı kesimler, çoklu foto montaj' },
];

export const REEL_CAMERA_OPTIONS: { id: UnifiedCameraMotion; label: string }[] = [
  { id: 'static', label: 'Statik' },
  { id: 'slow_pan', label: 'Yavaş pan' },
  { id: 'dolly_in', label: 'Dolly in' },
  { id: 'dolly_out', label: 'Dolly out' },
  { id: 'orbit', label: 'Orbit' },
  { id: 'tracking', label: 'Tracking' },
  { id: 'handheld', label: 'Handheld' },
  { id: 'tilt_up', label: 'Tilt up' },
];

function normalizeReelPacing(value: string | undefined | null): ReelPacing | null {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'fast_cut' || /\bfast.?cut\b/.test(v)) return 'fast_cut';
  if (v === 'slow_burn' || /\bslow.?burn\b/.test(v)) return 'slow_burn';
  if (v === 'mid_tempo' || /\bmid.?tempo\b/.test(v)) return 'mid_tempo';
  if (/\b(fast|dynamic|energetic|party)\b/.test(v)) return 'fast_cut';
  if (/\b(slow|cinematic|calm|ambient)\b/.test(v)) return 'slow_burn';
  if (/\b(medium|editorial|mid)\b/.test(v)) return 'mid_tempo';
  return null;
}

export function parseBrandReelFieldsFromMotionRaw(
  raw: Record<string, unknown> | null | undefined,
): Partial<Pick<BrandMotionProfile, 'reelPace' | 'reelCameraMotion' | 'reelStrategy'>> {
  if (!raw || typeof raw !== 'object') return {};
  const pace = String(raw.reel_pace ?? raw.reelPace ?? '').trim();
  const camera = String(raw.reel_camera_motion ?? raw.reelCameraMotion ?? '').trim();
  const strategy = String(raw.reel_strategy ?? raw.reelStrategy ?? '').trim() as ReelMontageStrategy;
  return {
    reelPace: pace && pace !== 'auto' ? pace : undefined,
    reelCameraMotion: camera && camera !== 'auto' ? camera : undefined,
    reelStrategy: strategy === 'single' || strategy === 'sequential' || strategy === 'multi_ref'
      ? strategy
      : undefined,
  };
}

/** Resolve tenant-level reel defaults from motion profile + sector fallback. */
export function resolveBrandReelProductionParams(
  motionProfile: BrandMotionProfile,
  sector: string,
): BrandReelProductionParams {
  const sectorPacing = getSectorReelPacing(sector);
  const stylePreset = MOTION_STYLE_REEL_DEFAULTS[motionProfile.motionStyle] ?? MOTION_STYLE_REEL_DEFAULTS.editorial;

  const explicitPacing = normalizeReelPacing(motionProfile.reelPace);
  const reelPacing = explicitPacing
    ?? (motionProfile.operatorOverride ? stylePreset.reelPacing : sectorPacing);

  const reelPace = motionProfile.reelPace?.trim()
    && motionProfile.reelPace !== 'auto'
    ? motionProfile.reelPace.trim()
    : reelPacing;

  let cameraMotion: UnifiedCameraMotion | undefined;
  if (motionProfile.reelCameraMotion?.trim() && motionProfile.reelCameraMotion !== 'auto') {
    cameraMotion = normalizeCameraMotion(motionProfile.reelCameraMotion);
  } else if (motionProfile.operatorOverride) {
    cameraMotion = stylePreset.cameraMotion;
  }

  return {
    reelPace,
    reelPacing,
    cameraMotion,
    strategy: motionProfile.reelStrategy && motionProfile.reelStrategy !== 'auto'
      ? motionProfile.reelStrategy
      : undefined,
  };
}

export function brandReelFieldsToThemeJson(
  profile: Pick<BrandMotionProfile, 'reelPace' | 'reelCameraMotion' | 'reelStrategy'>,
): Record<string, unknown> {
  return {
    reel_pace: profile.reelPace ?? 'auto',
    reel_camera_motion: profile.reelCameraMotion ?? 'auto',
    reel_strategy: profile.reelStrategy ?? 'auto',
  };
}

export function describeBrandReelPolicy(
  motionProfile: BrandMotionProfile,
  sector: string,
): string {
  const params = resolveBrandReelProductionParams(motionProfile, sector);
  const paceLabel = REEL_PACE_OPTIONS.find((o) => o.id === params.reelPacing)?.label ?? params.reelPace;
  const cameraLabel = params.cameraMotion
    ? REEL_CAMERA_OPTIONS.find((o) => o.id === params.cameraMotion)?.label ?? params.cameraMotion
    : 'Otomatik';
  const strategy = params.strategy ?? 'Otomatik';
  return `${paceLabel} · Kamera: ${cameraLabel} · Strateji: ${strategy}`;
}
