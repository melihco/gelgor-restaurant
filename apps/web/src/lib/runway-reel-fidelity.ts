/**
 * Runway image-to-video fidelity — keep motion subtle and anchor to the reference frame.
 * gen4_turbo only animates the first reference image; use sequential strategy for 2+ photos.
 */
import { normalizeCameraMotion, type UnifiedCameraMotion } from './camera-motion';
import {
  getSectorReelPacing,
  normalizeSectorId,
  type ReelPacing,
} from './sector-production-profile';
import type { MultiReelPhotoInput } from './reel-multi-production';

/** Appended to director prompts when not already present. */
export const RUNWAY_FIDELITY_DIRECTOR_RULES = `
REFERENCE FIDELITY (mandatory):
- Animate ONLY what is visible in the reference photo. Do not invent new objects, people, logos, or scenery.
- Preserve exact composition, subjects, identity, and layout. No morphing, no scene change, no style drift.
- Motion: subtle only — light shimmer, steam, liquid ripple, soft parallax, gentle focus breathing.
- Camera: locked-off or very slow drift (max 5% frame change). No whip pans, no dramatic reveals, no orbit unless explicitly requested.
- Match the caption story using ONLY elements already in the frame.
`.trim();

export function applyFidelityToDirectorPrompt(prompt: string): string {
  const p = prompt.trim();
  if (/preserve exact|do not invent|subtle only|reference photo/i.test(p)) {
    return p.length > 960 ? `${p.slice(0, 957).trimEnd()}…` : p;
  }
  const merged = `${p} ${RUNWAY_FIDELITY_DIRECTOR_RULES}`;
  return merged.length > 960 ? `${merged.slice(0, 957).trimEnd()}…` : merged;
}

export interface RunwayCameraFidelityInput {
  agentCamera?: string;
  vibeCamera?: string;
  mood?: string;
  /** reel_motion_spec.pace from ideation */
  reelPace?: string;
  /** brand_theme.motion_profile.reel_pace */
  brandReelPace?: string;
  /** vibeProfile.motion.pace */
  vibePace?: string;
  /** brand_theme.motion_profile.reel_camera_motion */
  brandCameraMotion?: string;
  sector?: string;
}

/** @deprecated Pass RunwayCameraFidelityInput object instead. */
export function resolveRunwayCameraMotionForFidelity(
  opts: RunwayCameraFidelityInput,
): UnifiedCameraMotion;

/** Legacy positional overload — kept for gradual migration. */
export function resolveRunwayCameraMotionForFidelity(opts: {
  agentCamera?: string;
  vibeCamera?: string;
  mood?: string;
  pace?: string;
  sector?: string;
  reelPace?: string;
}): UnifiedCameraMotion;

export function resolveRunwayCameraMotionForFidelity(
  opts: RunwayCameraFidelityInput & { pace?: string },
): UnifiedCameraMotion {
  const input: RunwayCameraFidelityInput = {
    agentCamera: opts.agentCamera,
    vibeCamera: opts.vibeCamera,
    mood: opts.mood,
    reelPace: opts.reelPace ?? opts.pace,
    vibePace: opts.vibePace ?? (opts.pace && !opts.reelPace ? opts.pace : undefined),
    sector: opts.sector,
  };
  return resolveRunwayCameraMotionForFidelityInternal(input);
}

const STATIC_PREFERRED_SECTORS = new Set([
  'beauty_wellness',
  'mental_health_clinic',
  'healthcare_clinic',
]);

/** Motions permitted at slow/medium pace without an explicit dynamic pace flag. */
const SLOW_PACE_ALLOWED: Partial<Record<string, ReadonlySet<UnifiedCameraMotion>>> = {
  restaurant_cafe: new Set(['orbit', 'slow_pan', 'dolly_in', 'dolly_out']),
  coffee_shop: new Set(['orbit', 'slow_pan', 'dolly_in']),
  fine_dining: new Set(['dolly_in', 'slow_pan', 'static']),
  bakery_patisserie: new Set(['dolly_in', 'slow_pan', 'orbit']),
  beach_club: new Set(['slow_pan', 'dolly_in', 'tilt_up']),
  hospitality: new Set(['dolly_in', 'slow_pan', 'tilt_up']),
  wedding_event: new Set(['dolly_in', 'slow_pan']),
  real_estate: new Set(['dolly_in', 'slow_pan', 'tilt_up']),
  fashion_boutique: new Set(['dolly_in', 'slow_pan', 'orbit']),
  jewelry_accessories: new Set(['dolly_in', 'static', 'slow_pan']),
  fitness_gym: new Set(['tracking', 'orbit', 'slow_pan', 'handheld']),
  nightclub: new Set(['tracking', 'slow_pan', 'handheld']),
  local_service_business: new Set(['dolly_in', 'slow_pan', 'orbit']),
  ecommerce_retail: new Set(['dolly_in', 'slow_pan', 'orbit']),
};

function resolveEffectivePaceBlob(input: RunwayCameraFidelityInput): string {
  const sectorPacing = input.sector ? getSectorReelPacing(input.sector) : '';
  return [
    input.reelPace,
    input.brandReelPace,
    input.vibePace,
    input.mood,
    sectorPacing,
  ]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase())
    .join(' ');
}

export function isDynamicReelPace(paceBlob: string): boolean {
  return /\b(dynamic|fast|energetic|fast_cut|party|dj|upbeat|130bpm|120bpm)\b/.test(paceBlob);
}

function resolveRunwayCameraMotionForFidelityInternal(
  input: RunwayCameraFidelityInput,
): UnifiedCameraMotion {
  const paceBlob = resolveEffectivePaceBlob(input);
  const dynamic = isDynamicReelPace(paceBlob);
  const sectorId = normalizeSectorId(input.sector);

  let motion: UnifiedCameraMotion;
  const agentRaw = (input.agentCamera ?? '').trim();
  const vibeRaw = (input.vibeCamera ?? '').trim();

  if (agentRaw) {
    motion = normalizeCameraMotion(agentRaw);
  } else if ((input.brandCameraMotion ?? '').trim()) {
    motion = normalizeCameraMotion(input.brandCameraMotion);
  } else if (vibeRaw) {
    motion = normalizeCameraMotion(vibeRaw);
  } else if (dynamic || /energy|party|night|event/.test(paceBlob)) {
    motion = 'slow_pan';
  } else {
    motion = 'static';
  }

  if (STATIC_PREFERRED_SECTORS.has(sectorId)) {
    if (motion === 'orbit' || motion === 'tracking' || motion === 'handheld') {
      return sectorId === 'mental_health_clinic' ? 'static' : 'slow_pan';
    }
    if (motion === 'dolly_in' && sectorId === 'mental_health_clinic') return 'slow_pan';
    return motion;
  }

  if (motion === 'orbit' || motion === 'tracking') {
    if (dynamic) return motion;
    const allowed = SLOW_PACE_ALLOWED[sectorId];
    if (allowed?.has(motion)) return motion;
    return 'slow_pan';
  }

  return motion;
}

/** Director hint from resolved reel pacing (brand / ideation / sector). */
export function reelPacingDirectorHint(input: {
  sector?: string | null;
  reelPace?: string;
  brandReelPace?: string;
}): string {
  const pacing = resolveEffectiveReelPace({
    reelPace: input.reelPace,
    brandReelPace: input.brandReelPace,
    sector: input.sector ?? undefined,
  });
  switch (pacing) {
    case 'fast_cut':
      return 'Pacing: fast-cut montage energy, 2–3 second visual beats, punchy transitions';
    case 'slow_burn':
      return 'Pacing: slow-burn cinematic, linger on hero details, minimal hard cuts';
    default:
      return 'Pacing: mid-tempo editorial flow, smooth and brand-safe motion';
  }
}

export function resolveEffectiveReelPace(input: {
  reelPace?: string;
  brandReelPace?: string;
  vibePace?: string;
  mood?: string;
  sector?: string;
}): string {
  const blob = resolveEffectivePaceBlob(input);
  if (input.reelPace?.trim()) return input.reelPace.trim();
  if (input.brandReelPace?.trim()) return input.brandReelPace.trim();
  if (input.vibePace?.trim()) return input.vibePace.trim();
  if (/\b(slow|dynamic|medium|fast)\b/.test(blob)) {
    const match = blob.match(/\b(slow|dynamic|medium|fast|fast_cut|slow_burn|mid_tempo)\b/);
    if (match?.[1]) return match[1];
  }
  return getSectorReelPacing(input.sector);
}

/** Per-photo prompt for sequential montage (each clip = one real gallery frame). */
export function buildSequentialClipDirectorPrompt(input: {
  basePrompt: string;
  clipIndex: number;
  totalClips: number;
  photo?: MultiReelPhotoInput;
  caption?: string;
}): string {
  const parts = [
    `Clip ${input.clipIndex + 1} of ${input.totalClips}.`,
    'This clip must match ONLY the attached reference frame.',
    input.photo?.description ? `Frame shows: ${input.photo.description.slice(0, 220)}.` : '',
    input.photo?.tags?.length ? `Tags: ${input.photo.tags.slice(0, 8).join(', ')}.` : '',
    input.caption ? `Story context: ${input.caption.slice(0, 120)}.` : '',
    applyFidelityToDirectorPrompt(input.basePrompt.slice(0, 520)),
  ].filter(Boolean);

  return parts.join(' ').slice(0, 960);
}

export type { ReelPacing };
