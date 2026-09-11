/**
 * Reel motion direction — domain models between the designed still and I2V.
 * The static creative is the source of truth. Video must not redesign it.
 */

export type ReelCreativeIntent =
  | 'product'
  | 'fashion'
  | 'food'
  | 'hospitality'
  | 'automotive'
  | 'corporate'
  | 'beauty';

export type ReelVisualStyle =
  | 'luxury_stillness'
  | 'editorial_restraint'
  | 'minimal_hold'
  | 'street_energy'
  | 'playful_depth'
  | 'corporate_still';

export type ReelMotionIntensity = 1 | 2 | 3 | 4 | 5;

export type ReelQualityPreset = 'ECONOMY' | 'STANDARD' | 'CAMPAIGN';

export type ReelCameraMovement =
  | 'locked'
  | 'slow_push_in'
  | 'slow_pan'
  | 'micro_orbit'
  | 'micro_parallax';

export type ReelSubjectMotion =
  | 'frozen'
  | 'fabric_breath'
  | 'steam_or_pour'
  | 'macro_highlight'
  | 'environmental_only';

export type ReelTransitionType = 'none' | 'cut' | 'dissolve';

export type ReelShotPurpose = 'hook' | 'hero' | 'final_hold';

export interface ReelCreativeDirection {
  creativeIntent: ReelCreativeIntent;
  visualStyle: ReelVisualStyle;
  motionIntensity: ReelMotionIntensity;
  cameraMovement: ReelCameraMovement;
  subjectMotion: ReelSubjectMotion;
  backgroundMotion: string;
  depthTreatment: string;
  lightingMovement: string;
  hookStrategy: string;
  endingStrategy: string;
  preserveComposition: boolean;
  preserveProductGeometry: boolean;
  preserveTypographySafeArea: boolean;
  preserveLogo: boolean;
  allowObjectTransformation: boolean;
  allowGeneratedText: boolean;
  shotCount: 1 | 2 | 3;
  negativeConstraints: string[];
  qualityPreset: ReelQualityPreset;
}

export interface ReelShot {
  order: number;
  durationSeconds: number;
  cameraAction: string;
  subjectAction: string;
  backgroundAction: string;
  lightingAction: string;
  transitionType: ReelTransitionType;
  purpose: ReelShotPurpose;
}

export interface ReelShotPlan {
  totalDuration: number;
  aspectRatio: '9:16';
  shots: ReelShot[];
  negativePrompt: string;
  providerHints: {
    preferSingleContinuousTake: boolean;
    qualityPreset: ReelQualityPreset;
  };
}

export interface ReelGenerationRequest {
  sourceImageUrl: string;
  creativeDirection: ReelCreativeDirection;
  shotPlan: ReelShotPlan;
  prompt: string;
  negativePrompt: string;
  duration: number;
  aspectRatio: '9:16';
  qualityPreset: ReelQualityPreset;
  missionId?: string | null;
  creativeId?: string | null;
  slotId?: string | null;
  brandId?: string | null;
}

export interface VideoGenerationCapabilities {
  supportsImageToVideo: boolean;
  supportsMultiShot: boolean;
  supportsStartEndFrame: boolean;
  supportsReferenceImages: boolean;
  supportsNegativePrompt: boolean;
  supportsElements: boolean;
  supportsNativeAudio: boolean;
  maxDurationSeconds: number;
}

export interface IVideoGenerationProvider {
  readonly id: string;
  capabilitiesFor(modelId: string): VideoGenerationCapabilities;
}

export const DEFAULT_REEL_MOTION_INTENSITY: ReelMotionIntensity = 2;

export const GENERIC_REEL_PROMPT_BANS = [
  'animate this image',
  'animate this',
  'make cinematic',
  'create a dynamic video',
] as const;
