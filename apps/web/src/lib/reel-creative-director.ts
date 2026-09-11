/**
 * Deterministic ReelCreativeDirector — no extra LLM call.
 * Translates sector + brand motion + slot recipe into cinematography decisions.
 */

import { getSectorProfile } from '@/lib/sector-production-profile';
import type { MotionStyle } from '@/lib/brand-motion-profile';
import type { ReelRecipe } from '@/lib/reel-production-recipe';
import {
  DEFAULT_REEL_MOTION_INTENSITY,
  type ReelCameraMovement,
  type ReelCreativeDirection,
  type ReelCreativeIntent,
  type ReelGenerationRequest,
  type ReelMotionIntensity,
  type ReelQualityPreset,
  type ReelShot,
  type ReelShotPlan,
  type ReelSubjectMotion,
  type ReelVisualStyle,
} from '@/lib/reel-creative-direction';
import { buildReelNegativePrompt, composeReelPrompt } from '@/lib/reel-prompt-composer';

export interface ReelCreativeDirectorInput {
  sector?: string | null;
  slotRole?: string | null;
  catalogSlotKey?: string | null;
  headline?: string | null;
  recipe?: ReelRecipe | null;
  motionStyle?: MotionStyle | string | null;
  qualityPreset?: ReelQualityPreset | null;
  productionTier?: string | null;
  durationSecs?: number | null;
  hasLogo?: boolean;
  textHeavy?: boolean;
  logoHeavy?: boolean;
}

export interface IReelCreativeDirector {
  generate(input: ReelCreativeDirectorInput): Promise<ReelCreativeDirection>;
}

export function resolveReelQualityPreset(
  productionTier?: string | null,
  explicit?: ReelQualityPreset | null,
): ReelQualityPreset {
  if (explicit) return explicit;
  const t = String(productionTier ?? '').toLowerCase();
  if (t === 'economy' || t === 'starter') return 'ECONOMY';
  if (t === 'premium' || t === 'campaign') return 'CAMPAIGN';
  return 'STANDARD';
}

export function resolveReelCreativeIntent(
  sector?: string | null,
  catalogSlotKey?: string | null,
): ReelCreativeIntent {
  const blob = `${sector ?? ''} ${catalogSlotKey ?? ''}`.toLowerCase().replace(/[_-]+/g, ' ');
  if (/\b(auto|car|vehicle|automotive)\b/.test(blob)) return 'automotive';
  if (/\b(fashion|boutique|apparel|streetwear)\b/.test(blob)) return 'fashion';
  if (/\b(beauty|wellness|salon|barber|spa)\b/.test(blob)) return 'beauty';
  if (/\b(agency|corporate|saas|b2b|consult)\b/.test(blob)) return 'corporate';
  if (/\b(restaurant|cafe|food|bakery|dining|patisserie)\b/.test(blob)) return 'food';
  if (/\b(hotel|hospitality|travel|beach|club|venue|resort)\b/.test(blob)) return 'hospitality';
  try {
    const profile = getSectorProfile(sector);
    if (profile.defaultVisualSubject === 'product_closeup') return 'product';
    if (profile.defaultVisualSubject === 'venue_interior') return 'hospitality';
    if (profile.defaultVisualSubject === 'digital_ui') return 'corporate';
  } catch {
    /* sector unknown — fall through */
  }
  return 'product';
}

function clampIntensity(value: number): ReelMotionIntensity {
  const n = Math.round(value);
  if (n <= 1) return 1;
  if (n >= 5) return 5;
  return n as ReelMotionIntensity;
}

function cameraFromRecipe(
  recipe: ReelRecipe | null | undefined,
  intensity: ReelMotionIntensity,
): ReelCameraMovement {
  if (intensity <= 1) return 'locked';
  const camera = recipe?.camera;
  if (camera === 'static') return 'locked';
  if (camera === 'slow_pan') return 'slow_pan';
  if (camera === 'orbit_micro') return intensity >= 3 ? 'micro_orbit' : 'slow_push_in';
  if (camera === 'parallax') return 'micro_parallax';
  if (camera === 'slow_push_in' || camera === 'auto') return 'slow_push_in';
  return intensity >= 3 ? 'slow_push_in' : 'slow_push_in';
}

function visualStyleFromBrand(
  motionStyle: string | null | undefined,
  intent: ReelCreativeIntent,
): ReelVisualStyle {
  const style = String(motionStyle ?? '').toLowerCase();
  if (style === 'minimal') return 'minimal_hold';
  if (style === 'luxury') return 'luxury_stillness';
  if (style === 'playful') return 'playful_depth';
  if (style === 'bold') return 'street_energy';
  if (intent === 'corporate') return 'corporate_still';
  if (style === 'editorial') return 'editorial_restraint';
  if (intent === 'product' || intent === 'beauty') return 'luxury_stillness';
  return 'editorial_restraint';
}

function subjectMotionFor(
  intent: ReelCreativeIntent,
  intensity: ReelMotionIntensity,
): ReelSubjectMotion {
  if (intensity <= 1) return 'frozen';
  if (intent === 'fashion') return 'fabric_breath';
  if (intent === 'food') return 'steam_or_pour';
  if (intent === 'beauty') return 'macro_highlight';
  if (intent === 'hospitality' || intent === 'corporate' || intent === 'automotive') {
    return 'environmental_only';
  }
  return 'frozen';
}

function resolveShotCount(
  preset: ReelQualityPreset,
  durationSecs: number,
): 1 | 2 | 3 {
  if (preset === 'ECONOMY' || durationSecs <= 6) return 1;
  if (preset === 'CAMPAIGN' && durationSecs >= 8) return 3;
  return 2;
}

export function generateReelCreativeDirection(
  input: ReelCreativeDirectorInput,
): ReelCreativeDirection {
  const intent = resolveReelCreativeIntent(input.sector, input.catalogSlotKey);
  const preset = resolveReelQualityPreset(input.productionTier, input.qualityPreset);
  const motionStyle = String(input.motionStyle ?? '').toLowerCase();
  const textHeavy = input.textHeavy === true;
  const logoHeavy = input.logoHeavy === true;
  const durationSecs = input.durationSecs && input.durationSecs > 0 ? input.durationSecs : 5;

  let intensity: ReelMotionIntensity = DEFAULT_REEL_MOTION_INTENSITY;
  if (motionStyle === 'minimal' || intent === 'corporate') intensity = 1;
  if (motionStyle === 'luxury') intensity = 2;
  if (motionStyle === 'playful' || motionStyle === 'bold') intensity = 3;
  if (preset === 'ECONOMY') intensity = clampIntensity(Math.min(intensity, 2));
  if (textHeavy || logoHeavy) intensity = 1;
  if (intent === 'product' && intensity > 2) intensity = 2;

  const visualStyle = visualStyleFromBrand(input.motionStyle, intent);
  const cameraMovement = cameraFromRecipe(input.recipe, intensity);
  const subjectMotion = subjectMotionFor(intent, intensity);
  const shotCount = resolveShotCount(preset, durationSecs);

  const whatMoves: string[] = [];
  if (cameraMovement !== 'locked') whatMoves.push('camera');
  whatMoves.push('studio lighting sweep');
  if (subjectMotion === 'steam_or_pour') whatMoves.push('physically plausible steam or pour only');
  if (subjectMotion === 'fabric_breath') whatMoves.push('tiny fabric / hair breath');
  if (subjectMotion === 'macro_highlight') whatMoves.push('material highlight travel');
  if (subjectMotion === 'environmental_only') whatMoves.push('distant environmental micro-motion');

  const whatDoesNotMove = [
    'approved composition and design hierarchy',
    'product geometry and packaging',
    'logo and brand marks',
    'typography and reserved type areas',
    'decorative slot graphics',
  ];

  return {
    creativeIntent: intent,
    visualStyle,
    motionIntensity: intensity,
    cameraMovement,
    subjectMotion,
    backgroundMotion:
      intensity <= 1
        ? 'none — hold the background still'
        : intensity === 2
          ? 'minimal physically plausible depth breath only'
          : 'soft parallax in far planes; no object birth or morph',
    depthTreatment:
      intensity <= 1
        ? 'keep existing depth; do not invent new planes'
        : 'subtle separation between foreground, subject and background',
    lightingMovement:
      intent === 'beauty' || intent === 'product'
        ? 'soft directional studio light slowly crosses the hero surface'
        : intent === 'hospitality'
          ? 'slow natural light shift; no neon pulses'
          : 'restrained key-light drift; no strobe',
    hookStrategy:
      intensity <= 1
        ? 'hold nearly still for the first 0.5s so the approved frame reads as a poster'
        : 'hold nearly still for approximately 0.3s, then begin the controlled camera move',
    endingStrategy:
      'finish on a clean stable hero frame with about one second of minimal movement for CTA and branding',
    preserveComposition: true,
    preserveProductGeometry: intent === 'product' || intent === 'food' || intent === 'beauty' || intent === 'automotive',
    preserveTypographySafeArea: true,
    preserveLogo: true,
    allowObjectTransformation: false,
    allowGeneratedText: false,
    shotCount,
    negativeConstraints: [
      `WHAT MOVES: ${whatMoves.join('; ')}.`,
      `WHAT DOES NOT MOVE: ${whatDoesNotMove.join('; ')}.`,
    ],
    qualityPreset: preset,
  };
}

export function buildReelShotPlan(
  direction: ReelCreativeDirection,
  durationSecs = 5,
): ReelShotPlan {
  const total = Math.max(5, Math.min(15, Math.round(durationSecs)));
  const shots: ReelShot[] = [];

  if (direction.shotCount === 1) {
    shots.push({
      order: 1,
      durationSeconds: total,
      cameraAction: describeCamera(direction),
      subjectAction: describeSubject(direction),
      backgroundAction: direction.backgroundMotion,
      lightingAction: direction.lightingMovement,
      transitionType: 'none',
      purpose: 'hero',
    });
  } else if (direction.shotCount === 2) {
    const hook = Math.min(2, Math.max(1, Math.round(total * 0.35)));
    shots.push(
      {
        order: 1,
        durationSeconds: hook,
        cameraAction: 'almost static hold, then begin the same camera language',
        subjectAction: describeSubject(direction),
        backgroundAction: direction.backgroundMotion,
        lightingAction: 'introduce the lighting sweep',
        transitionType: 'none',
        purpose: 'hook',
      },
      {
        order: 2,
        durationSeconds: total - hook,
        cameraAction: describeCamera(direction),
        subjectAction: describeSubject(direction),
        backgroundAction: direction.backgroundMotion,
        lightingAction: direction.lightingMovement,
        transitionType: 'cut',
        purpose: 'final_hold',
      },
    );
  } else {
    const hook = 2;
    const hero = Math.max(2, total - hook - 3);
    const hold = total - hook - hero;
    shots.push(
      {
        order: 1,
        durationSeconds: hook,
        cameraAction: 'detail reveal with almost no camera travel',
        subjectAction: describeSubject(direction),
        backgroundAction: 'hold',
        lightingAction: 'start the highlight travel',
        transitionType: 'none',
        purpose: 'hook',
      },
      {
        order: 2,
        durationSeconds: hero,
        cameraAction: describeCamera(direction),
        subjectAction: describeSubject(direction),
        backgroundAction: direction.backgroundMotion,
        lightingAction: direction.lightingMovement,
        transitionType: 'cut',
        purpose: 'hero',
      },
      {
        order: 3,
        durationSeconds: hold,
        cameraAction: direction.motionIntensity >= 3
          ? 'micro orbit settling into a locked hero'
          : 'lock the frame for the final hero hold',
        subjectAction: 'product and branding remain identical to the source image',
        backgroundAction: 'minimal',
        lightingAction: 'settle to a clean hero key light',
        transitionType: 'cut',
        purpose: 'final_hold',
      },
    );
  }

  return {
    totalDuration: total,
    aspectRatio: '9:16',
    shots,
    negativePrompt: buildReelNegativePrompt(direction),
    providerHints: {
      preferSingleContinuousTake: direction.shotCount === 1,
      qualityPreset: direction.qualityPreset,
    },
  };
}

function describeCamera(direction: ReelCreativeDirection): string {
  switch (direction.cameraMovement) {
    case 'locked':
      return 'locked tripod — no pan, tilt, zoom or reframing';
    case 'slow_pan':
      return 'very slow lateral pan across the existing frame, no reframing past the source crop';
    case 'micro_orbit':
      return 'microscopic orbit around the hero, amplitude tiny, product geometry unchanged';
    case 'micro_parallax':
      return 'micro parallax between existing depth planes only';
    default:
      return 'very slow controlled camera push-in on the existing hero';
  }
}

function describeSubject(direction: ReelCreativeDirection): string {
  switch (direction.subjectMotion) {
    case 'fabric_breath':
      return 'tiny natural fabric or hair movement only; body and product stay stable';
    case 'steam_or_pour':
      return 'optional physically plausible steam or pour; plated food and vessels stay identical';
    case 'macro_highlight':
      return 'subject stays still; only material highlights travel';
    case 'environmental_only':
      return 'hero subject stays still; only distant environment may breathe';
    default:
      return 'primary subject remains completely stable and geometrically identical to the source image';
  }
}

export function buildReelGenerationRequest(input: {
  sourceImageUrl: string;
  directorInput: ReelCreativeDirectorInput;
  designerMotionCue?: string | null;
  missionId?: string | null;
  creativeId?: string | null;
  slotId?: string | null;
  brandId?: string | null;
}): ReelGenerationRequest {
  const direction = generateReelCreativeDirection(input.directorInput);
  const duration = input.directorInput.durationSecs && input.directorInput.durationSecs > 0
    ? input.directorInput.durationSecs
    : 5;
  const shotPlan = buildReelShotPlan(direction, duration);
  return {
    sourceImageUrl: input.sourceImageUrl,
    creativeDirection: direction,
    shotPlan,
    prompt: composeReelPrompt({
      direction,
      shotPlan,
      designerMotionCue: input.designerMotionCue,
    }),
    negativePrompt: shotPlan.negativePrompt,
    duration,
    aspectRatio: '9:16',
    qualityPreset: direction.qualityPreset,
    missionId: input.missionId ?? null,
    creativeId: input.creativeId ?? null,
    slotId: input.slotId ?? null,
    brandId: input.brandId ?? null,
  };
}

export const defaultReelCreativeDirector: IReelCreativeDirector = {
  generate: async (input) => generateReelCreativeDirection(input),
};
