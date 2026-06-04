/**
 * Runway image-to-video fidelity — keep motion subtle and anchor to the reference frame.
 * gen4_turbo only animates the first reference image; use sequential strategy for 2+ photos.
 */
import { normalizeCameraMotion, type UnifiedCameraMotion } from './camera-motion';
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

/**
 * Resolve camera for gallery-backed reels. Default static (best identity preservation).
 */
export function resolveRunwayCameraMotionForFidelity(opts: {
  agentCamera?: string;
  vibeCamera?: string;
  mood?: string;
  pace?: string;
}): UnifiedCameraMotion {
  const agentRaw = (opts.agentCamera ?? '').toLowerCase();
  const vibeRaw = (opts.vibeCamera ?? '').toLowerCase();
  const mood = (opts.mood ?? '').toLowerCase();
  const pace = (opts.pace ?? '').toLowerCase();

  if (agentRaw) {
    if (/orbit/.test(agentRaw)) {
      return pace.includes('dynamic') ? 'orbit' : 'slow_pan';
    }
    if (/track/.test(agentRaw)) {
      return pace.includes('dynamic') ? 'tracking' : 'slow_pan';
    }
    return normalizeCameraMotion(opts.agentCamera);
  }

  if (vibeRaw) {
    return normalizeCameraMotion(opts.vibeCamera);
  }

  if (pace.includes('dynamic') || mood.includes('energy') || mood.includes('party')) {
    return 'slow_pan';
  }

  return 'static';
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
