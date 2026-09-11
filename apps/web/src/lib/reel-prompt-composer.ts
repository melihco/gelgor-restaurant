/**
 * ReelPromptComposer — sectioned commercial motion brief for I2V.
 * Never asks the model to redesign the approved still.
 */

import { finalizeFalPrompt } from '@/lib/fal-prompt';
import type {
  ReelCreativeDirection,
  ReelShotPlan,
} from '@/lib/reel-creative-direction';

export const REEL_BASE_NEGATIVE_PROMPT = [
  'distorted geometry',
  'warped product',
  'altered packaging',
  'altered logo',
  'generated typography',
  'fake text',
  'object morphing',
  'duplicate objects',
  'flicker',
  'unstable frame',
  'unnatural physics',
  'rubbery motion',
  'excessive camera movement',
  'abrupt zoom',
  'camera shake',
  'oversaturated lighting',
  'low detail',
  'cartoon movement',
  'text distortion',
  'letter mutation',
  'rewritten text',
  'logo redraw',
  'logo morph',
  'composition change',
  'reframing',
  'particle storm',
  'neon flashes',
  'kinetic type',
].join(', ');

const CATEGORY_NEGATIVES: Record<ReelCreativeDirection['creativeIntent'], string[]> = {
  product: ['duplicate products', 'melting packaging', 'floating labels'],
  fashion: ['extra limbs', 'morphing body', 'warped garment logos'],
  food: ['melting plated food', 'exploding steam', 'invented garnish'],
  hospitality: ['invented architecture', 'moved furniture', 'fake signage'],
  automotive: ['warped bodywork', 'changed badge', 'melted reflections'],
  corporate: ['busy motion graphics', 'sticker pop-ins', 'UI hallucination'],
  beauty: ['warped skin', 'changed packaging shade', 'invented claims on pack'],
};

export function buildReelNegativePrompt(direction: ReelCreativeDirection): string {
  const extra = [...CATEGORY_NEGATIVES[direction.creativeIntent]];
  if (direction.preserveLogo) extra.push('fake brand mark', 'logo replacement');
  if (direction.preserveTypographySafeArea) extra.push('subtitle crawl', 'new captions');
  if (direction.motionIntensity <= 2) extra.push('fast motion', 'whip pan', 'heavy zoom');
  return [REEL_BASE_NEGATIVE_PROMPT, ...extra].join(', ');
}

function sanitizeCue(cue?: string | null): string {
  if (!cue) return '';
  return cue
    .replace(/animate this(?: image)?/gi, '')
    .replace(/make cinematic/gi, '')
    .replace(/create a dynamic video/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function cameraSpeed(direction: ReelCreativeDirection): string {
  if (direction.motionIntensity <= 1) return 'no camera travel';
  if (direction.motionIntensity === 2) return 'extremely slow — barely perceptible';
  if (direction.motionIntensity === 3) return 'slow and controlled';
  return 'moderate but stabilized; never abrupt';
}

export function composeReelPrompt(input: {
  direction: ReelCreativeDirection;
  shotPlan: ReelShotPlan;
  designerMotionCue?: string | null;
}): string {
  const { direction, shotPlan } = input;
  const cue = sanitizeCue(input.designerMotionCue);
  const duration = shotPlan.totalDuration;

  const compositionLock = [
    'Preserve the exact composition, product placement, framing and design hierarchy of the provided source image.',
    'Do not redesign the frame.',
    direction.preserveProductGeometry
      ? 'The product must remain geometrically identical to the source image.'
      : '',
    direction.preserveLogo
      ? 'Do not modify, recreate, morph or hallucinate logos or packaging.'
      : '',
    'Do not generate new text. Preserve clean areas reserved for typography.',
    'LOCKED LOGO: brand mark stays identical — same shape, colors, position.',
    'FROZEN TEXT: treat every letter and glyph as frozen pixels. Zero OCR rewrite. Zero gibberish.',
  ].filter(Boolean).join(' ');

  const commercialIntent =
    `Create a premium ${duration}-second vertical commercial. `
    + `Art direction is ${direction.visualStyle.replace(/_/g, ' ')} for a ${direction.creativeIntent} brief. `
    + `Motion intensity ${direction.motionIntensity} of 5. `
    + 'Controlled stillness is preferred over animating every object.';

  const openingHook = `Opening hook: ${direction.hookStrategy}`;

  const subjectMotion =
    `Subject motion: ${shotPlan.shots[0]?.subjectAction ?? 'hero remains stable'}. `
    + 'Do not animate every object in the frame.';

  const cameraMotion =
    `Camera motion: ${shotPlan.shots[0]?.cameraAction ?? 'very slow controlled push-in'}. `
    + `Speed: ${cameraSpeed(direction)}. `
    + 'How the camera moves is explicit; do not invent whip pans or handheld chaos.';

  const environmentMotion = `Environment motion: ${direction.backgroundMotion}.`;

  const lighting =
    `Lighting direction: ${direction.lightingMovement}.`
    + (cue ? ` Art-direction cue (light/photo only, never type): ${cue}.` : '');

  const lens =
    'Lens / cinematography: smooth stabilized cinema-camera movement, natural depth of field, '
    + `${direction.depthTreatment}. Premium editorial advertising aesthetic without redesigning the still.`;

  const motionQuality =
    'Motion quality: physically plausible, temporally stable, no rubbery deformation. '
    + 'Avoid exaggerated AI animation. Hierarchy is camera, then lighting, then environment, then subject.';

  const ending = `Ending hero frame: ${direction.endingStrategy}`;

  const shotBlock = shotPlan.shots.length > 1
    ? shotPlan.shots
      .map((shot) => (
        `Shot ${shot.order} (${shot.durationSeconds}s, ${shot.purpose}): `
        + `${shot.cameraAction}; ${shot.subjectAction}.`
      ))
      .join(' ')
    : 'Single continuous take — do not invent extra cuts.';

  const prompt = [
    compositionLock,
    commercialIntent,
    openingHook,
    subjectMotion,
    cameraMotion,
    environmentMotion,
    lighting,
    lens,
    motionQuality,
    ending,
    shotBlock,
    direction.negativeConstraints.join(' '),
  ].join(' ');

  return finalizeFalPrompt(prompt, { kind: 'video', label: 'reel-prompt-composer' });
}
