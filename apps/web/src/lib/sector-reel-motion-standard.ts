/**
 * Sector Runway / Reel motion standards — template-library pattern for reel production.
 *
 * - Onboarding seeds motion_profile from sector standard → persisted in brand_theme (DB).
 * - Runtime parse fills only unset fields when legacy brands lack reel keys.
 * - Brand Hub Reel Motion panel overrides with operatorOverride: true.
 */
import type { UnifiedCameraMotion } from './camera-motion';
import type {
  BrandMotionProfile,
  MotionStyle,
  StoryAudioMode,
} from './brand-motion-profile';
import {
  deriveMotionProfile,
  motionProfileToThemeJson,
  normalizeMotionProfile,
} from './brand-motion-profile';
import type { RunwayReelStrategy } from './reel-multi-production';
import { normalizeSectorId, type ReelPacing } from './sector-production-profile';

export type ReelDirectorVariant =
  | 'product_tvc'
  | 'venue_atmosphere'
  | 'digital_editorial';

export interface SectorReelMotionStandard {
  sectorId: string;
  label: string;
  motionStyle: MotionStyle;
  reelPace: ReelPacing;
  reelCameraMotion: UnifiedCameraMotion;
  reelStrategy: RunwayReelStrategy;
  productSpotlightReel: boolean;
  preferPurePhotoStories: number;
  storyAudioMode: StoryAudioMode;
  directorPromptVariant?: ReelDirectorVariant;
}

const DEFAULT_STANDARD: SectorReelMotionStandard = {
  sectorId: 'local_service_business',
  label: 'Genel hizmet',
  motionStyle: 'editorial',
  reelPace: 'mid_tempo',
  reelCameraMotion: 'slow_pan',
  reelStrategy: 'sequential',
  productSpotlightReel: false,
  preferPurePhotoStories: 0.72,
  storyAudioMode: 'music_and_voice',
  directorPromptVariant: 'venue_atmosphere',
};

/** Canonical sector → Runway reel defaults (single source of truth in TS). */
export const SECTOR_REEL_MOTION_STANDARDS: Record<string, SectorReelMotionStandard> = {
  local_products_shop: {
    sectorId: 'local_products_shop',
    label: 'Yerel ürün / artisan',
    motionStyle: 'luxury',
    reelPace: 'slow_burn',
    reelCameraMotion: 'dolly_in',
    reelStrategy: 'sequential',
    productSpotlightReel: true,
    preferPurePhotoStories: 0.62,
    storyAudioMode: 'music_and_voice',
    directorPromptVariant: 'product_tvc',
  },
  handmade_product_brand: {
    sectorId: 'handmade_product_brand',
    label: 'El yapımı ürün',
    motionStyle: 'luxury',
    reelPace: 'slow_burn',
    reelCameraMotion: 'dolly_in',
    reelStrategy: 'sequential',
    productSpotlightReel: true,
    preferPurePhotoStories: 0.65,
    storyAudioMode: 'music_and_voice',
    directorPromptVariant: 'product_tvc',
  },
  ecommerce_retail: {
    sectorId: 'ecommerce_retail',
    label: 'E-ticaret',
    motionStyle: 'bold',
    reelPace: 'mid_tempo',
    reelCameraMotion: 'dolly_in',
    reelStrategy: 'sequential',
    productSpotlightReel: true,
    preferPurePhotoStories: 0.55,
    storyAudioMode: 'music_and_voice',
    directorPromptVariant: 'product_tvc',
  },
  fashion_boutique: {
    sectorId: 'fashion_boutique',
    label: 'Moda butik',
    motionStyle: 'luxury',
    reelPace: 'mid_tempo',
    reelCameraMotion: 'slow_pan',
    reelStrategy: 'sequential',
    productSpotlightReel: true,
    preferPurePhotoStories: 0.58,
    storyAudioMode: 'music_only',
    directorPromptVariant: 'product_tvc',
  },
  jewelry_accessories: {
    sectorId: 'jewelry_accessories',
    label: 'Mücevher / aksesuar',
    motionStyle: 'luxury',
    reelPace: 'slow_burn',
    reelCameraMotion: 'dolly_in',
    reelStrategy: 'single',
    productSpotlightReel: true,
    preferPurePhotoStories: 0.6,
    storyAudioMode: 'music_only',
    directorPromptVariant: 'product_tvc',
  },
  beach_club: {
    sectorId: 'beach_club',
    label: 'Beach club',
    motionStyle: 'bold',
    reelPace: 'mid_tempo',
    reelCameraMotion: 'slow_pan',
    reelStrategy: 'sequential',
    productSpotlightReel: false,
    preferPurePhotoStories: 0.82,
    storyAudioMode: 'music_only',
    directorPromptVariant: 'venue_atmosphere',
  },
  restaurant_cafe: {
    sectorId: 'restaurant_cafe',
    label: 'Restoran / kafe',
    motionStyle: 'editorial',
    reelPace: 'mid_tempo',
    reelCameraMotion: 'dolly_in',
    reelStrategy: 'sequential',
    productSpotlightReel: false,
    preferPurePhotoStories: 0.75,
    storyAudioMode: 'music_and_voice',
    directorPromptVariant: 'venue_atmosphere',
  },
  fine_dining: {
    sectorId: 'fine_dining',
    label: 'Fine dining',
    motionStyle: 'luxury',
    reelPace: 'slow_burn',
    reelCameraMotion: 'dolly_in',
    reelStrategy: 'single',
    productSpotlightReel: false,
    preferPurePhotoStories: 0.7,
    storyAudioMode: 'music_only',
    directorPromptVariant: 'venue_atmosphere',
  },
  hotel_resort: {
    sectorId: 'hotel_resort',
    label: 'Otel / resort',
    motionStyle: 'luxury',
    reelPace: 'slow_burn',
    reelCameraMotion: 'tilt_up',
    reelStrategy: 'sequential',
    productSpotlightReel: false,
    preferPurePhotoStories: 0.78,
    storyAudioMode: 'music_only',
    directorPromptVariant: 'venue_atmosphere',
  },
  hospitality: {
    sectorId: 'hospitality',
    label: 'Konaklama',
    motionStyle: 'luxury',
    reelPace: 'slow_burn',
    reelCameraMotion: 'dolly_in',
    reelStrategy: 'sequential',
    productSpotlightReel: false,
    preferPurePhotoStories: 0.76,
    storyAudioMode: 'music_only',
    directorPromptVariant: 'venue_atmosphere',
  },
  nightclub: {
    sectorId: 'nightclub',
    label: 'Gece kulübü',
    motionStyle: 'bold',
    reelPace: 'fast_cut',
    reelCameraMotion: 'tracking',
    reelStrategy: 'sequential',
    productSpotlightReel: false,
    preferPurePhotoStories: 0.68,
    storyAudioMode: 'music_only',
    directorPromptVariant: 'venue_atmosphere',
  },
  fitness_gym: {
    sectorId: 'fitness_gym',
    label: 'Fitness',
    motionStyle: 'bold',
    reelPace: 'fast_cut',
    reelCameraMotion: 'tracking',
    reelStrategy: 'sequential',
    productSpotlightReel: false,
    preferPurePhotoStories: 0.65,
    storyAudioMode: 'music_only',
    directorPromptVariant: 'venue_atmosphere',
  },
  real_estate: {
    sectorId: 'real_estate',
    label: 'Gayrimenkul',
    motionStyle: 'luxury',
    reelPace: 'slow_burn',
    reelCameraMotion: 'dolly_in',
    reelStrategy: 'sequential',
    productSpotlightReel: false,
    preferPurePhotoStories: 0.74,
    storyAudioMode: 'music_and_voice',
    directorPromptVariant: 'venue_atmosphere',
  },
  beauty_wellness: {
    sectorId: 'beauty_wellness',
    label: 'Güzellik / wellness',
    motionStyle: 'minimal',
    reelPace: 'slow_burn',
    reelCameraMotion: 'static',
    reelStrategy: 'single',
    productSpotlightReel: false,
    preferPurePhotoStories: 0.8,
    storyAudioMode: 'music_and_voice',
    directorPromptVariant: 'venue_atmosphere',
  },
  barber_salon: {
    sectorId: 'barber_salon',
    label: 'Berber / kuaför',
    motionStyle: 'editorial',
    reelPace: 'mid_tempo',
    reelCameraMotion: 'slow_pan',
    reelStrategy: 'sequential',
    productSpotlightReel: false,
    preferPurePhotoStories: 0.7,
    storyAudioMode: 'music_and_voice',
    directorPromptVariant: 'venue_atmosphere',
  },
  healthcare_clinic: {
    sectorId: 'healthcare_clinic',
    label: 'Sağlık kliniği',
    motionStyle: 'minimal',
    reelPace: 'slow_burn',
    reelCameraMotion: 'static',
    reelStrategy: 'single',
    productSpotlightReel: false,
    preferPurePhotoStories: 0.85,
    storyAudioMode: 'music_and_voice',
    directorPromptVariant: 'digital_editorial',
  },
  agency_services: {
    sectorId: 'agency_services',
    label: 'Ajans / dijital hizmet',
    motionStyle: 'minimal',
    reelPace: 'mid_tempo',
    reelCameraMotion: 'static',
    reelStrategy: 'single',
    productSpotlightReel: false,
    preferPurePhotoStories: 0.38,
    storyAudioMode: 'music_and_voice',
    directorPromptVariant: 'digital_editorial',
  },
  production_company: {
    sectorId: 'production_company',
    label: 'Prodüksiyon',
    motionStyle: 'editorial',
    reelPace: 'mid_tempo',
    reelCameraMotion: 'slow_pan',
    reelStrategy: 'sequential',
    productSpotlightReel: false,
    preferPurePhotoStories: 0.55,
    storyAudioMode: 'music_only',
    directorPromptVariant: 'digital_editorial',
  },
};

const DIRECTOR_VARIANT_LABELS: Record<ReelDirectorVariant, string> = {
  product_tvc: 'Ürün reklam filmi — gerçek galeri karelerinde TVC tarzı Runway motion',
  venue_atmosphere: 'Mekan atmosferi — venue galeri karelerinde ambient motion',
  digital_editorial: 'Dijital editorial — salon/UI karelerinde minimal stabil motion',
};

export function getSectorReelMotionStandard(sector?: string): SectorReelMotionStandard {
  const id = normalizeSectorId(sector ?? '');
  return SECTOR_REEL_MOTION_STANDARDS[id] ?? DEFAULT_STANDARD;
}

export function describeSectorReelMotionStandard(sector?: string): string {
  const std = getSectorReelMotionStandard(sector);
  const variant = std.directorPromptVariant
    ? DIRECTOR_VARIANT_LABELS[std.directorPromptVariant]
    : 'Standart fidelity';
  return `${std.label} · ${variant}`;
}

function reelFieldUnset(value: string | undefined): boolean {
  const v = String(value ?? '').trim();
  return !v || v === 'auto';
}

function motionProfileHasExplicitReelFields(raw: Record<string, unknown> | null | undefined): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const pace = String(raw.reel_pace ?? raw.reelPace ?? '').trim();
  const camera = String(raw.reel_camera_motion ?? raw.reelCameraMotion ?? '').trim();
  const strategy = String(raw.reel_strategy ?? raw.reelStrategy ?? '').trim();
  const spotlight = raw.product_spotlight_reel ?? raw.productSpotlightReel;
  return Boolean(
    (pace && pace !== 'auto')
    || (camera && camera !== 'auto')
    || (strategy && strategy !== 'auto')
    || spotlight != null,
  );
}

/** Apply sector standard onto a derived profile — DB values win; legacy brands get fill-only. */
export function applySectorReelMotionDefaults(
  sector: string | undefined,
  profile: BrandMotionProfile,
): BrandMotionProfile {
  const std = getSectorReelMotionStandard(sector);
  const next: BrandMotionProfile = { ...profile };

  const hasPersistedReelConfig = !reelFieldUnset(profile.reelPace)
    || !reelFieldUnset(profile.reelCameraMotion)
    || !reelFieldUnset(profile.reelStrategy)
    || profile.productSpotlightReel != null;

  if (profile.operatorOverride || hasPersistedReelConfig) {
    if (reelFieldUnset(profile.reelPace)) next.reelPace = std.reelPace;
    if (reelFieldUnset(profile.reelCameraMotion)) next.reelCameraMotion = std.reelCameraMotion;
    if (reelFieldUnset(profile.reelStrategy)) next.reelStrategy = std.reelStrategy;
    if (profile.productSpotlightReel == null) next.productSpotlightReel = std.productSpotlightReel;
    return normalizeMotionProfile(next);
  }

  next.motionStyle = std.motionStyle;
  next.reelPace = std.reelPace;
  next.reelCameraMotion = std.reelCameraMotion;
  next.reelStrategy = std.reelStrategy;
  next.preferPurePhotoStories = std.preferPurePhotoStories;
  next.storyAudioMode = std.storyAudioMode;
  next.productSpotlightReel = std.productSpotlightReel;

  return normalizeMotionProfile(next);
}

export function resolveRunwayDirectorVariant(input: {
  sector?: string;
  productSpotlightReel?: boolean;
}): ReelDirectorVariant | undefined {
  const std = getSectorReelMotionStandard(input.sector);
  if (input.productSpotlightReel === true) return 'product_tvc';
  if (input.productSpotlightReel === false) {
    return std.directorPromptVariant === 'product_tvc' ? undefined : std.directorPromptVariant;
  }
  if (std.productSpotlightReel) return 'product_tvc';
  return std.directorPromptVariant;
}

/** Build full motion_profile JSON for onboarding persistence. */
export function buildOnboardingReelMotionProfile(
  sector: string,
  languages?: unknown,
  textOverlayDensity?: BrandMotionProfile['textDensity'],
): Record<string, unknown> {
  const derived = deriveMotionProfile({ sector, languages, textOverlayDensity });
  const withReel = applySectorReelMotionDefaults(sector, derived);
  return motionProfileToThemeJson({
    ...withReel,
    operatorOverride: false,
  });
}

/** Merge sector reel standard into theme when onboarding or derive — skip if operator locked. */
export function ensureSectorReelMotionInTheme(
  theme: Record<string, unknown> | null | undefined,
  sector: string,
  options?: { forceReseed?: boolean },
): Record<string, unknown> {
  const base = theme ?? {};
  const raw = (base.motion_profile ?? base.motionProfile) as Record<string, unknown> | undefined;
  if (raw?.operator_override || raw?.operatorOverride) {
    return base;
  }
  if (!options?.forceReseed && motionProfileHasExplicitReelFields(raw)) {
    return base;
  }

  const typography = base.typography as Record<string, unknown> | undefined;
  const density = typography?.text_overlay_density ?? typography?.textOverlayDensity;
  const motion_profile = buildOnboardingReelMotionProfile(
    sector,
    undefined,
    density as BrandMotionProfile['textDensity'] | undefined,
  );

  return {
    ...base,
    motion_profile: {
      ...(raw ?? {}),
      ...motion_profile,
      operator_override: false,
      reel_motion_standard_version: 1,
    },
  };
}

export function listSectorReelMotionStandardIds(): string[] {
  return Object.keys(SECTOR_REEL_MOTION_STANDARDS);
}
