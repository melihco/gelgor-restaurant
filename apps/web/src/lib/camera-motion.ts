/**
 * Unified camera motion vocabulary (TS ↔ Python content_crew / video_production).
 */
export const UNIFIED_CAMERA_MOTIONS = [
  'static',
  'slow_pan',
  'dolly_in',
  'dolly_out',
  'orbit',
  'tracking',
  'handheld',
  'tilt_up',
  'tilt_down',
] as const;

export type UnifiedCameraMotion = (typeof UNIFIED_CAMERA_MOTIONS)[number];

const VALID = new Set<string>(UNIFIED_CAMERA_MOTIONS);

/** Legacy / agent aliases → unified motion */
export const CAMERA_MOTION_ALIASES: Record<string, UnifiedCameraMotion> = {
  slow_zoom_in: 'dolly_in',
  zoom_in: 'dolly_in',
  push_in: 'dolly_in',
  slow_push_in: 'dolly_in',
  slow_dolly_in: 'dolly_in',
  zoom: 'dolly_in',
  pan: 'slow_pan',
  drift_left: 'slow_pan',
  drift_right: 'slow_pan',
  pan_left: 'slow_pan',
  pan_right: 'slow_pan',
  aerial: 'tilt_up',
  crane_up: 'tilt_up',
  crane_down: 'tilt_down',
  pull_out: 'dolly_out',
  pull_back: 'dolly_out',
  push_out: 'dolly_out',
  orbit_shot: 'orbit',
  track: 'tracking',
  tracking_shot: 'tracking',
  handheld_shake: 'handheld',
};

export function normalizeCameraMotion(input?: string | null): UnifiedCameraMotion {
  const raw = (input ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!raw) return 'static';
  if (VALID.has(raw)) return raw as UnifiedCameraMotion;
  const alias = CAMERA_MOTION_ALIASES[raw];
  if (alias) return alias;
  for (const motion of UNIFIED_CAMERA_MOTIONS) {
    if (raw.includes(motion)) return motion;
  }
  const aliasKey = Object.keys(CAMERA_MOTION_ALIASES).find((k) => raw.includes(k));
  if (aliasKey) return CAMERA_MOTION_ALIASES[aliasKey]!;
  return 'static';
}
