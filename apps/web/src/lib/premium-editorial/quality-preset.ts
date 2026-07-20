import type { QualityPresetValues } from './types';
import { PREMIUM_EDITORIAL_QUALITY_PRESET } from './types';

export const PREMIUM_MEDITERRANEAN_EDITORIAL_V1: QualityPresetValues = {
  name: PREMIUM_EDITORIAL_QUALITY_PRESET,
  photographicRealism: 'very_high',
  compositionSophistication: 'very_high',
  typographyNegativeSpaceReadiness: 'very_high',
  luxuryLevel: 'refined_not_flashy',
  saturation: 'controlled',
  contrast: 'cinematic',
  warmth: 'medium_high',
  textureRealism: 'high',
  depthOfField: 'shallow_to_medium',
  visualClutter: 'low',
  symmetry: 'low',
  negativeSpaceMin: 0.3,
  negativeSpaceMax: 0.42,
  artificialGraphics: 'minimal',
  genericTemplateScoreTarget: 'near_zero',
};

export function resolveQualityPreset(
  name?: string | null,
): QualityPresetValues {
  void name;
  return PREMIUM_MEDITERRANEAN_EDITORIAL_V1;
}
