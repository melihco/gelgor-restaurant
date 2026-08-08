/**
 * Reel production recipe — SSOT for fal_reel motion/kurgu/audio policy.
 *
 * Resolve order (most specific wins):
 *   mission reel_motion_spec → template.design_spec.reel_recipe
 *   → brand motion_profile → slot.prompt_pack.reel_policy → sector/heuristic default
 *
 * Cover layout stays on brand_design_templates; this recipe is the production
 * personality matched with that cover (same slot → template pin model as posts).
 */

import type { ReelPacing } from '@/lib/sector-production-profile';
import type { BrandReelProductionParams } from '@/lib/brand-reel-motion-profile';
import type { ReelMontageStrategy } from '@/lib/reel-multi-production';
import {
  resolveReelArchetypeForProduction,
  reelArchetypeToRecipePartial,
} from '@/lib/reel-canva-archetypes';
import { catalogSlotPurposeKey } from '@/lib/sector-slot-pack';

export const REEL_RECIPE_VERSION = 1 as const;

export type ReelMotionMode = 'photo_plate' | 'locked_graphics' | 'hybrid';
export type ReelEditStyle =
  | 'single_lock'
  | 'implied_multi'
  | 'sequential_beats'
  | 'multi_ref';
export type ReelCamera =
  | 'static'
  | 'slow_push_in'
  | 'slow_pan'
  | 'parallax'
  | 'orbit_micro'
  | 'auto';
export type ReelOnCanvasDensity = 'hook_only' | 'hook_sub' | 'minimal';
export type ReelLogoPolicy = 'composite_only' | 'baked_allowed';
export type ReelHeadlinePolicy = 'verbatim' | 'shorten_ok';
export type ReelFidelityGate = 'strict' | 'standard';
export type ReelJob =
  | 'menu_highlight'
  | 'venue_mood'
  | 'event_tease'
  | 'social_proof'
  | 'craft_process'
  | 'offer'
  | 'generic';
export type ReelDurationSecs = 5 | 7 | 10 | 15;

export interface ReelRecipe {
  version: typeof REEL_RECIPE_VERSION;
  motionMode: ReelMotionMode;
  camera: ReelCamera;
  pace: ReelPacing | 'auto';
  durationSecs: ReelDurationSecs;
  editStyle: ReelEditStyle;
  beatCount: 1 | 2 | 3;
  beatRecipe: string;
  audioEnabled: boolean;
  audioMood: string | null;
  reelJob: ReelJob;
  onCanvasDensity: ReelOnCanvasDensity;
  logoPolicy: ReelLogoPolicy;
  headlinePolicy: ReelHeadlinePolicy;
  fidelityGate: ReelFidelityGate;
  /** Canva-level reel motion archetype (hook_reveal, product_hero, …). */
  reelArchetypeId: string | null;
  /** Cover layout canva id from design template / brief. */
  coverCanvaId: string | null;
}

export type ReelRecipePartial = Partial<ReelRecipe>;

const MOTION_MODES = new Set<ReelMotionMode>(['photo_plate', 'locked_graphics', 'hybrid']);
const EDIT_STYLES = new Set<ReelEditStyle>([
  'single_lock',
  'implied_multi',
  'sequential_beats',
  'multi_ref',
]);
const CAMERAS = new Set<ReelCamera>([
  'static',
  'slow_push_in',
  'slow_pan',
  'parallax',
  'orbit_micro',
  'auto',
]);
const JOBS = new Set<ReelJob>([
  'menu_highlight',
  'venue_mood',
  'event_tease',
  'social_proof',
  'craft_process',
  'offer',
  'generic',
]);
const DENSITIES = new Set<ReelOnCanvasDensity>(['hook_only', 'hook_sub', 'minimal']);
const LOGO_POLICIES = new Set<ReelLogoPolicy>(['composite_only', 'baked_allowed']);
const HEADLINE_POLICIES = new Set<ReelHeadlinePolicy>(['verbatim', 'shorten_ok']);
const FIDELITY = new Set<ReelFidelityGate>(['strict', 'standard']);
const PACES = new Set<string>(['slow_burn', 'mid_tempo', 'fast_cut', 'auto']);
const DURATIONS = new Set<number>([5, 7, 10, 15]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickEnum<T extends string>(value: unknown, allowed: Set<T>): T | undefined {
  const s = String(value ?? '').trim() as T;
  return allowed.has(s) ? s : undefined;
}

function pickDuration(value: unknown): ReelDurationSecs | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  return DURATIONS.has(n) ? (n as ReelDurationSecs) : undefined;
}

function pickBeatCount(value: unknown): 1 | 2 | 3 | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  if (n === 1 || n === 2 || n === 3) return n;
  return undefined;
}

/** Parse loose JSON (snake or camel) into a partial recipe. */
export function parseReelRecipePartial(raw: unknown): ReelRecipePartial {
  const obj = asRecord(raw);
  if (!obj) return {};

  const paceRaw = String(obj.pace ?? obj.reel_pace ?? obj.reelPace ?? '').trim();
  const pace = PACES.has(paceRaw) ? (paceRaw as ReelRecipe['pace']) : undefined;

  return {
    version: REEL_RECIPE_VERSION,
    motionMode: pickEnum(obj.motionMode ?? obj.motion_mode, MOTION_MODES),
    camera: pickEnum(obj.camera ?? obj.reel_camera ?? obj.reelCamera, CAMERAS),
    pace,
    durationSecs: pickDuration(obj.durationSecs ?? obj.duration_secs),
    editStyle: pickEnum(obj.editStyle ?? obj.edit_style, EDIT_STYLES),
    beatCount: pickBeatCount(obj.beatCount ?? obj.beat_count),
    beatRecipe: typeof (obj.beatRecipe ?? obj.beat_recipe) === 'string'
      ? String(obj.beatRecipe ?? obj.beat_recipe).slice(0, 80)
      : undefined,
    audioEnabled: typeof (obj.audioEnabled ?? obj.audio_enabled) === 'boolean'
      ? Boolean(obj.audioEnabled ?? obj.audio_enabled)
      : undefined,
    audioMood: (() => {
      const m = obj.audioMood ?? obj.audio_mood;
      if (m == null) return undefined;
      const s = String(m).trim();
      return s ? s.slice(0, 64) : null;
    })(),
    reelJob: pickEnum(obj.reelJob ?? obj.reel_job, JOBS),
    onCanvasDensity: pickEnum(
      obj.onCanvasDensity ?? obj.on_canvas_density,
      DENSITIES,
    ),
    logoPolicy: pickEnum(obj.logoPolicy ?? obj.logo_policy, LOGO_POLICIES),
    headlinePolicy: pickEnum(
      obj.headlinePolicy ?? obj.headline_policy,
      HEADLINE_POLICIES,
    ),
    fidelityGate: pickEnum(obj.fidelityGate ?? obj.fidelity_gate, FIDELITY),
    reelArchetypeId: (() => {
      const v = obj.reelArchetypeId ?? obj.reel_archetype_id;
      const s = typeof v === 'string' ? v.trim() : '';
      return s ? s.slice(0, 48) : undefined;
    })(),
    coverCanvaId: (() => {
      const v = obj.coverCanvaId ?? obj.cover_canva_id;
      const s = typeof v === 'string' ? v.trim() : '';
      return s ? s.slice(0, 64) : undefined;
    })(),
  };
}

export function extractReelPolicyFromPromptPack(
  promptPack: Record<string, unknown> | null | undefined,
): ReelRecipePartial {
  if (!promptPack) return {};
  const nested = promptPack.reel_policy ?? promptPack.reelPolicy;
  return parseReelRecipePartial(nested ?? null);
}

/** Infer sector/slot family defaults from catalog key + template type. */
export function inferReelPolicyFromSlotSignals(input: {
  catalogSlotKey?: string | null;
  templateType?: string | null;
  canvaArchetypeId?: string | null;
  sector?: string | null;
}): ReelRecipePartial {
  const purposeKey = catalogSlotPurposeKey(String(input.catalogSlotKey ?? ''));
  const key = `${purposeKey} ${input.templateType ?? ''} ${input.canvaArchetypeId ?? ''}`.toLowerCase();

  let reelJob: ReelJob = 'generic';
  if (/cocktail|menu|drink|food|tasting|sip|product.?hero|product_highlight|(?:^|\s|_)product(?:_|\s|$)/.test(key)) {
    reelJob = 'menu_highlight';
  } else if (/dj|party|night|teaser|launch|(?:^|\s|_)events?(?:_|\s|$)/.test(key)) {
    reelJob = 'event_tease';
  } else if (/guest|review|social.?proof|testimonial|happy.?customer/.test(key)) reelJob = 'social_proof';
  else if (/craft|behind|process|making|barista|chef|farm_visit/.test(key)) reelJob = 'craft_process';
  else if (/offer|promo|discount|deal/.test(key)) reelJob = 'offer';
  else if (/venue|atmosphere|ambiance|pool|beach|terrace|sunset/.test(key)) reelJob = 'venue_mood';

  const base: ReelRecipePartial = {
    version: REEL_RECIPE_VERSION,
    motionMode: 'photo_plate',
    logoPolicy: 'composite_only',
    headlinePolicy: 'verbatim',
    fidelityGate: 'strict',
    audioEnabled: false,
    reelJob,
    onCanvasDensity: 'hook_sub',
    durationSecs: 7,
    camera: 'slow_push_in',
    pace: 'mid_tempo',
    editStyle: 'single_lock',
    beatCount: 1,
    beatRecipe: 'detail→reveal',
  };

  switch (reelJob) {
    case 'menu_highlight':
      return {
        ...base,
        pace: 'slow_burn',
        camera: 'slow_push_in',
        editStyle: 'sequential_beats',
        beatCount: 2,
        beatRecipe: 'hook→product',
        onCanvasDensity: 'hook_only',
      };
    case 'venue_mood':
      return {
        ...base,
        pace: 'slow_burn',
        camera: 'slow_pan',
        editStyle: 'single_lock',
        beatRecipe: 'wide→detail',
        onCanvasDensity: 'minimal',
      };
    case 'event_tease':
      return {
        ...base,
        motionMode: 'hybrid',
        pace: 'fast_cut',
        camera: 'parallax',
        editStyle: 'sequential_beats',
        beatCount: 3,
        beatRecipe: 'hook→energy→cta',
        durationSecs: 10,
        onCanvasDensity: 'hook_sub',
        audioEnabled: true,
        audioMood: 'upbeat',
      };
    case 'social_proof':
      return {
        ...base,
        pace: 'mid_tempo',
        camera: 'parallax',
        editStyle: 'implied_multi',
        beatCount: 2,
        beatRecipe: 'moment→brand',
      };
    case 'craft_process':
      return {
        ...base,
        pace: 'mid_tempo',
        camera: 'orbit_micro',
        editStyle: 'sequential_beats',
        beatCount: 3,
        beatRecipe: 'hands→product→result',
        onCanvasDensity: 'hook_only',
      };
    case 'offer':
      return {
        ...base,
        pace: 'mid_tempo',
        camera: 'static',
        editStyle: 'single_lock',
        onCanvasDensity: 'hook_sub',
        durationSecs: 5,
      };
    default:
      return base;
  }
}

function brandParamsToPartial(params: BrandReelProductionParams | null | undefined): ReelRecipePartial {
  if (!params) return {};
  const cameraMap: Record<string, ReelCamera> = {
    static: 'static',
    slow_pan: 'slow_pan',
    dolly_in: 'slow_push_in',
    dolly_out: 'slow_push_in',
    orbit: 'orbit_micro',
    tracking: 'slow_pan',
    handheld: 'parallax',
    tilt_up: 'slow_pan',
  };
  const strategyMap: Record<ReelMontageStrategy, ReelEditStyle> = {
    single: 'single_lock',
    sequential: 'sequential_beats',
    multi_ref: 'multi_ref',
  };
  return {
    pace: (params.reelPacing as ReelPacing) || undefined,
    camera: params.cameraMotion ? cameraMap[params.cameraMotion] ?? 'auto' : undefined,
    editStyle: params.strategy ? strategyMap[params.strategy] : undefined,
    beatCount: params.strategy === 'sequential' ? 2 : params.strategy === 'multi_ref' ? 2 : 1,
  };
}

function missionSpecToPartial(raw: unknown): ReelRecipePartial {
  const obj = asRecord(raw);
  if (!obj) return {};
  const pace = String(obj.pace ?? '').trim();
  const camera = String(obj.camera_movement ?? obj.cameraMotion ?? obj.camera ?? '').trim().toLowerCase();
  const transition = String(obj.transition_style ?? obj.transitionStyle ?? '').trim().toLowerCase();
  const audioMood = String(obj.audio_mood ?? obj.audioMood ?? '').trim();

  let editStyle: ReelEditStyle | undefined;
  if (/montage|sequential|hard.?cut|multi/.test(transition)) editStyle = 'sequential_beats';
  else if (/blend|multi.?ref/.test(transition)) editStyle = 'multi_ref';

  let mappedCamera: ReelCamera | undefined;
  if (/static|lock/.test(camera)) mappedCamera = 'static';
  else if (/push|dolly|zoom.?in/.test(camera)) mappedCamera = 'slow_push_in';
  else if (/pan/.test(camera)) mappedCamera = 'slow_pan';
  else if (/orbit|rotate/.test(camera)) mappedCamera = 'orbit_micro';
  else if (/parallax|handheld/.test(camera)) mappedCamera = 'parallax';

  return {
    pace: PACES.has(pace) ? (pace as ReelRecipe['pace']) : undefined,
    camera: mappedCamera,
    editStyle,
    audioMood: audioMood ? audioMood.slice(0, 64) : undefined,
    audioEnabled: audioMood ? true : undefined,
  };
}

function mergePartial(...layers: ReelRecipePartial[]): ReelRecipePartial {
  const out: ReelRecipePartial = { version: REEL_RECIPE_VERSION };
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer)) {
      if (value === undefined) continue;
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

export function finalizeReelRecipe(partial: ReelRecipePartial): ReelRecipe {
  const defaults = inferReelPolicyFromSlotSignals({});
  const merged = mergePartial(defaults, partial);
  return {
    version: REEL_RECIPE_VERSION,
    motionMode: merged.motionMode ?? 'photo_plate',
    camera: merged.camera ?? 'slow_push_in',
    pace: merged.pace ?? 'mid_tempo',
    durationSecs: merged.durationSecs ?? 7,
    editStyle: merged.editStyle ?? 'single_lock',
    beatCount: merged.beatCount ?? 1,
    beatRecipe: merged.beatRecipe ?? 'detail→reveal',
    audioEnabled: merged.audioEnabled ?? false,
    audioMood: merged.audioMood ?? null,
    reelJob: merged.reelJob ?? 'generic',
    onCanvasDensity: merged.onCanvasDensity ?? 'hook_sub',
    logoPolicy: merged.logoPolicy ?? 'composite_only',
    headlinePolicy: merged.headlinePolicy ?? 'verbatim',
    fidelityGate: merged.fidelityGate ?? 'strict',
    reelArchetypeId: merged.reelArchetypeId ?? null,
    coverCanvaId: merged.coverCanvaId ?? null,
  };
}

/**
 * Production-time resolve. Layers listed least → most specific (last wins):
 * sector/slot heuristic → Canva reel archetype → slot prompt_pack → brand
 * → template recipe → mission.
 */
export function resolveReelProductionRecipe(input: {
  sector?: string | null;
  catalogSlotKey?: string | null;
  templateType?: string | null;
  canvaArchetypeId?: string | null;
  headline?: string | null;
  caption?: string | null;
  slotPromptPack?: Record<string, unknown> | null;
  templateRecipe?: unknown;
  brandReelParams?: BrandReelProductionParams | null;
  missionReelMotionSpec?: unknown;
}): ReelRecipe {
  const sectorSlot = inferReelPolicyFromSlotSignals({
    catalogSlotKey: input.catalogSlotKey,
    templateType: input.templateType,
    canvaArchetypeId: input.canvaArchetypeId,
    sector: input.sector,
  });
  const template = parseReelRecipePartial(input.templateRecipe);
  const archetype = resolveReelArchetypeForProduction({
    explicitReelArchetypeId: template.reelArchetypeId,
    canvaArchetypeId: input.canvaArchetypeId ?? template.coverCanvaId,
    caption: input.caption ?? undefined,
    headline: input.headline ?? undefined,
    sector: input.sector ?? undefined,
    catalogSlotKey: input.catalogSlotKey,
    templateType: input.templateType,
    reelJob: sectorSlot.reelJob ?? template.reelJob,
  });
  const archetypeLayer: ReelRecipePartial = {
    ...reelArchetypeToRecipePartial(archetype),
    coverCanvaId: input.canvaArchetypeId ?? template.coverCanvaId ?? archetype.preferredCoverCanvaIds[0] ?? null,
  };
  const slotPolicy = extractReelPolicyFromPromptPack(input.slotPromptPack);
  const brand = brandParamsToPartial(input.brandReelParams);
  const mission = missionSpecToPartial(input.missionReelMotionSpec);

  return finalizeReelRecipe(
    mergePartial(sectorSlot, archetypeLayer, slotPolicy, brand, template, mission, {
      reelArchetypeId: archetype.id,
      coverCanvaId: archetypeLayer.coverCanvaId,
    }),
  );
}

/** Seed recipe when generating a reel_cover template in the library. */
export function seedReelRecipeForTemplate(input: {
  catalogSlotKey?: string | null;
  templateType?: string | null;
  canvaArchetypeId?: string | null;
  sector?: string | null;
  brandReelParams?: BrandReelProductionParams | null;
  slotPromptPack?: Record<string, unknown> | null;
  headline?: string | null;
  caption?: string | null;
}): ReelRecipe {
  return resolveReelProductionRecipe({
    sector: input.sector,
    catalogSlotKey: input.catalogSlotKey,
    templateType: input.templateType,
    canvaArchetypeId: input.canvaArchetypeId,
    slotPromptPack: input.slotPromptPack,
    brandReelParams: input.brandReelParams,
    headline: input.headline,
    caption: input.caption,
  });
}

export function reelRecipeToJson(recipe: ReelRecipe): Record<string, unknown> {
  return {
    version: recipe.version,
    motion_mode: recipe.motionMode,
    camera: recipe.camera,
    pace: recipe.pace,
    duration_secs: recipe.durationSecs,
    edit_style: recipe.editStyle,
    beat_count: recipe.beatCount,
    beat_recipe: recipe.beatRecipe,
    audio_enabled: recipe.audioEnabled,
    audio_mood: recipe.audioMood,
    reel_job: recipe.reelJob,
    on_canvas_density: recipe.onCanvasDensity,
    logo_policy: recipe.logoPolicy,
    headline_policy: recipe.headlinePolicy,
    fidelity_gate: recipe.fidelityGate,
    reel_archetype_id: recipe.reelArchetypeId,
    cover_canva_id: recipe.coverCanvaId,
  };
}

/** Effective I2V path after hybrid/event softening. */
export function resolveEffectiveReelMotionMode(recipe: ReelRecipe): 'photo_plate' | 'locked_graphics' {
  if (recipe.motionMode === 'photo_plate') return 'photo_plate';
  if (recipe.motionMode === 'locked_graphics') {
    // Only sparse covers are safe for baked-text I2V; dense covers → photo_plate.
    if (recipe.onCanvasDensity === 'minimal' || recipe.onCanvasDensity === 'hook_only') {
      return 'locked_graphics';
    }
    return 'photo_plate';
  }
  // hybrid: event energy still prefers plate motion; cover stays designed still.
  return 'photo_plate';
}

export function buildReelRecipeMotionCue(recipe: ReelRecipe): string {
  const cameraBit =
    recipe.camera === 'slow_push_in'
      ? 'ultra-slow push-in on photo hero'
      : recipe.camera === 'slow_pan'
        ? 'ultra-slow lateral pan on photo zone'
        : recipe.camera === 'parallax'
          ? 'micro parallax between depth planes'
          : recipe.camera === 'orbit_micro'
            ? 'microscopic orbit around subject'
            : recipe.camera === 'static'
              ? 'locked frame — light breath only'
              : 'restrained editorial camera';

  const paceBit =
    recipe.pace === 'slow_burn'
      ? 'slow cinematic burn'
      : recipe.pace === 'fast_cut'
        ? 'mid-energy pulse without hard cuts inside I2V'
        : 'balanced editorial tempo';

  return `${paceBit}; ${cameraBit}; edit=${recipe.editStyle}; beats=${recipe.beatCount} (${recipe.beatRecipe})`.slice(0, 220);
}

/** Kling duration — Luma only supports 5s/9s; clamp sensibly. */
export function reelRecipeDurationForFal(recipe: ReelRecipe): number {
  if (recipe.durationSecs <= 5) return 5;
  if (recipe.durationSecs >= 10) return 10;
  return 5; // 7 → nearest safe Kling default until longer clips are validated
}
