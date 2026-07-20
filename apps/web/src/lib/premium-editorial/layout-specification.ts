/**
 * Layer 3 — Composition & Layout Specification
 * Normalized 0–1 zones. Presets vary by family + aspect ratio + copy length.
 */

import {
  PREMIUM_EDITORIAL_PROMPT_VERSION,
  type CreativeDirectionBrief,
  type EditorialLayoutFamily,
  type LayoutSpecification,
  type NormalizedRect,
  type PremiumEditorialAspectRatio,
  type TextLayoutInput,
} from './types';
import { PREMIUM_MEDITERRANEAN_EDITORIAL_V1 } from './quality-preset';

export const EDITORIAL_LAYOUT_FAMILIES: readonly EditorialLayoutFamily[] = [
  'EditorialSplit',
  'AsymmetricHero',
  'SunsetForeground',
  'MaterialPanel',
  'CinematicNegativeSpace',
  'MagazineCover',
  'ProductRightTextLeft',
  'ProductLowerThird',
  'ImmersiveStory',
  'MinimalStillLife',
] as const;

function canvasFor(aspect: PremiumEditorialAspectRatio): {
  aspectRatio: PremiumEditorialAspectRatio;
  width: number;
  height: number;
} {
  if (aspect === '9:16') return { aspectRatio: aspect, width: 1080, height: 1920 };
  if (aspect === '1:1') return { aspectRatio: aspect, width: 1080, height: 1080 };
  return { aspectRatio: '4:5', width: 1080, height: 1350 };
}

function rect(x: number, y: number, width: number, height: number): NormalizedRect {
  return { x, y, width, height };
}

/** Base zone maps per family (4:5). Story/square remap in adaptZones. */
const FAMILY_ZONES_45: Record<EditorialLayoutFamily, Omit<
  LayoutSpecification,
  'family' | 'canvas' | 'promptArchitectureVersion' | 'negativeSpaceRatio'
> & { negativeSpaceRatio: number }> = {
  EditorialSplit: {
    safeArea: { top: 0.07, right: 0.07, bottom: 0.07, left: 0.07 },
    heroZone: rect(0.46, 0.18, 0.47, 0.68),
    headlineZone: rect(0.07, 0.1, 0.36, 0.28),
    bodyZone: rect(0.07, 0.4, 0.34, 0.14),
    ctaZone: rect(0.07, 0.72, 0.28, 0.08),
    logoZone: rect(0.72, 0.88, 0.2, 0.06),
    negativeSpaceRatio: 0.38,
    textContrastStrategy: 'light-on-dark',
    visualBalance: 'asymmetric',
    textBackgroundTreatment: 'natural-image-negative-space',
  },
  AsymmetricHero: {
    safeArea: { top: 0.07, right: 0.07, bottom: 0.07, left: 0.07 },
    heroZone: rect(0.38, 0.22, 0.55, 0.62),
    headlineZone: rect(0.07, 0.08, 0.42, 0.22),
    bodyZone: rect(0.07, 0.32, 0.36, 0.12),
    ctaZone: rect(0.07, 0.78, 0.3, 0.07),
    logoZone: rect(0.74, 0.89, 0.18, 0.05),
    negativeSpaceRatio: 0.36,
    textContrastStrategy: 'light-on-dark',
    visualBalance: 'asymmetric',
    textBackgroundTreatment: 'soft-scrim-left',
  },
  SunsetForeground: {
    safeArea: { top: 0.08, right: 0.08, bottom: 0.08, left: 0.08 },
    heroZone: rect(0.2, 0.28, 0.6, 0.5),
    headlineZone: rect(0.08, 0.08, 0.7, 0.16),
    bodyZone: rect(0.08, 0.7, 0.55, 0.1),
    ctaZone: rect(0.08, 0.82, 0.32, 0.07),
    logoZone: rect(0.72, 0.88, 0.18, 0.05),
    negativeSpaceRatio: 0.34,
    textContrastStrategy: 'light-on-dark',
    visualBalance: 'balanced',
    textBackgroundTreatment: 'sky-negative-space',
  },
  MaterialPanel: {
    safeArea: { top: 0.07, right: 0.07, bottom: 0.07, left: 0.07 },
    heroZone: rect(0.08, 0.2, 0.5, 0.62),
    headlineZone: rect(0.58, 0.18, 0.34, 0.28),
    bodyZone: rect(0.58, 0.48, 0.32, 0.14),
    ctaZone: rect(0.58, 0.72, 0.28, 0.08),
    logoZone: rect(0.08, 0.88, 0.18, 0.05),
    negativeSpaceRatio: 0.37,
    textContrastStrategy: 'dark-on-light',
    visualBalance: 'asymmetric',
    textBackgroundTreatment: 'material-panel',
  },
  CinematicNegativeSpace: {
    safeArea: { top: 0.08, right: 0.08, bottom: 0.08, left: 0.08 },
    heroZone: rect(0.42, 0.3, 0.5, 0.52),
    headlineZone: rect(0.08, 0.12, 0.4, 0.24),
    bodyZone: rect(0.08, 0.4, 0.32, 0.12),
    ctaZone: rect(0.08, 0.78, 0.28, 0.07),
    logoZone: rect(0.74, 0.88, 0.16, 0.05),
    negativeSpaceRatio: 0.42,
    textContrastStrategy: 'light-on-dark',
    visualBalance: 'asymmetric',
    textBackgroundTreatment: 'large-calm-void',
  },
  MagazineCover: {
    safeArea: { top: 0.07, right: 0.07, bottom: 0.07, left: 0.07 },
    heroZone: rect(0.15, 0.2, 0.7, 0.58),
    headlineZone: rect(0.08, 0.08, 0.84, 0.14),
    bodyZone: rect(0.12, 0.78, 0.6, 0.08),
    ctaZone: rect(0.12, 0.88, 0.3, 0.05),
    logoZone: rect(0.72, 0.88, 0.18, 0.05),
    negativeSpaceRatio: 0.32,
    textContrastStrategy: 'mixed',
    visualBalance: 'centered',
    textBackgroundTreatment: 'cover-masthead',
  },
  ProductRightTextLeft: {
    safeArea: { top: 0.07, right: 0.07, bottom: 0.07, left: 0.07 },
    heroZone: rect(0.48, 0.16, 0.45, 0.7),
    headlineZone: rect(0.07, 0.18, 0.38, 0.3),
    bodyZone: rect(0.07, 0.5, 0.36, 0.14),
    ctaZone: rect(0.07, 0.72, 0.3, 0.08),
    logoZone: rect(0.07, 0.88, 0.2, 0.05),
    negativeSpaceRatio: 0.36,
    textContrastStrategy: 'light-on-dark',
    visualBalance: 'asymmetric',
    textBackgroundTreatment: 'natural-image-negative-space',
  },
  ProductLowerThird: {
    safeArea: { top: 0.07, right: 0.07, bottom: 0.07, left: 0.07 },
    heroZone: rect(0.18, 0.12, 0.64, 0.55),
    headlineZone: rect(0.08, 0.68, 0.7, 0.12),
    bodyZone: rect(0.08, 0.8, 0.55, 0.08),
    ctaZone: rect(0.08, 0.9, 0.28, 0.05),
    logoZone: rect(0.74, 0.9, 0.18, 0.05),
    negativeSpaceRatio: 0.33,
    textContrastStrategy: 'light-on-dark',
    visualBalance: 'balanced',
    textBackgroundTreatment: 'lower-third-soft-scrim',
  },
  ImmersiveStory: {
    safeArea: { top: 0.1, right: 0.08, bottom: 0.12, left: 0.08 },
    heroZone: rect(0.12, 0.22, 0.76, 0.48),
    headlineZone: rect(0.08, 0.1, 0.84, 0.14),
    bodyZone: rect(0.1, 0.72, 0.7, 0.1),
    ctaZone: rect(0.1, 0.84, 0.4, 0.06),
    logoZone: rect(0.68, 0.9, 0.22, 0.05),
    negativeSpaceRatio: 0.34,
    textContrastStrategy: 'light-on-dark',
    visualBalance: 'centered',
    textBackgroundTreatment: 'story-safe-bands',
  },
  MinimalStillLife: {
    safeArea: { top: 0.08, right: 0.08, bottom: 0.08, left: 0.08 },
    heroZone: rect(0.28, 0.28, 0.44, 0.44),
    headlineZone: rect(0.08, 0.1, 0.5, 0.16),
    bodyZone: rect(0.08, 0.72, 0.45, 0.1),
    ctaZone: rect(0.08, 0.84, 0.28, 0.06),
    logoZone: rect(0.72, 0.88, 0.18, 0.05),
    negativeSpaceRatio: 0.4,
    textContrastStrategy: 'dark-on-light',
    visualBalance: 'asymmetric',
    textBackgroundTreatment: 'quiet-material-field',
  },
};

function adaptZonesForAspect(
  base: (typeof FAMILY_ZONES_45)[EditorialLayoutFamily],
  aspect: PremiumEditorialAspectRatio,
): (typeof FAMILY_ZONES_45)[EditorialLayoutFamily] {
  if (aspect === '4:5') return base;
  if (aspect === '1:1') {
    return {
      ...base,
      heroZone: rect(base.heroZone.x, Math.min(0.55, base.heroZone.y + 0.02), base.heroZone.width, Math.min(0.55, base.heroZone.height)),
    };
  }
  // 9:16 — prefer ImmersiveStory-like vertical breathing
  return {
    ...base,
    safeArea: { top: 0.1, right: 0.08, bottom: 0.12, left: 0.08 },
    heroZone: rect(0.1, 0.24, 0.8, 0.46),
    headlineZone: rect(0.08, 0.1, 0.84, Math.max(0.12, base.headlineZone.height * 0.7)),
    bodyZone: rect(0.1, 0.74, 0.7, 0.08),
    ctaZone: rect(0.1, 0.84, 0.4, 0.06),
    logoZone: rect(0.68, 0.9, 0.22, 0.05),
  };
}

export function selectLayoutFamily(opts: {
  preferred?: EditorialLayoutFamily | null;
  aspectRatio: PremiumEditorialAspectRatio;
  brief: CreativeDirectionBrief;
  text: Pick<TextLayoutInput, 'headline' | 'subheadline' | 'cta'>;
  attempt?: number;
}): EditorialLayoutFamily {
  if (opts.preferred && EDITORIAL_LAYOUT_FAMILIES.includes(opts.preferred)) {
    return opts.preferred;
  }

  const headlineLen = opts.text.headline.trim().length;
  const subLen = opts.text.subheadline.trim().length;
  const longCopy = headlineLen > 40 || subLen > 80;

  if (opts.aspectRatio === '9:16') {
    if (opts.attempt === 3) return 'CinematicNegativeSpace';
    return longCopy ? 'ImmersiveStory' : 'MagazineCover';
  }

  const byVariation: Partial<Record<string, EditorialLayoutFamily>> = {
    EditorialProductHero: 'ProductRightTextLeft',
    GoldenHourLifestyle: 'SunsetForeground',
    DarkLuxuryStillLife: 'MaterialPanel',
    MediterraneanTableScene: 'EditorialSplit',
    ArchitecturalHospitality: 'AsymmetricHero',
    MinimalMaterialStudy: 'MinimalStillLife',
    SunsetDining: 'SunsetForeground',
    CoastalRefreshment: 'CinematicNegativeSpace',
    ChefCraft: 'ProductLowerThird',
    SeasonalEditorial: 'MagazineCover',
  };

  let family = byVariation[opts.brief.creativeVariationKey] ?? 'AsymmetricHero';

  if (longCopy && (family === 'MinimalStillLife' || family === 'CinematicNegativeSpace')) {
    family = 'ProductRightTextLeft';
  }

  // Attempt 3 — safer simpler layout
  if (opts.attempt === 3) {
    family = longCopy ? 'ProductLowerThird' : 'CinematicNegativeSpace';
  }

  return family;
}

export function buildLayoutSpecification(opts: {
  family: EditorialLayoutFamily;
  aspectRatio: PremiumEditorialAspectRatio;
}): LayoutSpecification {
  const canvas = canvasFor(opts.aspectRatio);
  const base = FAMILY_ZONES_45[opts.family];
  const zones = adaptZonesForAspect(base, opts.aspectRatio);
  const ns = Math.min(
    PREMIUM_MEDITERRANEAN_EDITORIAL_V1.negativeSpaceMax,
    Math.max(PREMIUM_MEDITERRANEAN_EDITORIAL_V1.negativeSpaceMin, zones.negativeSpaceRatio),
  );

  return {
    family: opts.family,
    canvas,
    safeArea: zones.safeArea,
    heroZone: zones.heroZone,
    headlineZone: zones.headlineZone,
    bodyZone: zones.bodyZone,
    ctaZone: zones.ctaZone,
    logoZone: zones.logoZone,
    negativeSpaceRatio: ns,
    textContrastStrategy: zones.textContrastStrategy,
    visualBalance: zones.visualBalance,
    textBackgroundTreatment: zones.textBackgroundTreatment,
    promptArchitectureVersion: PREMIUM_EDITORIAL_PROMPT_VERSION,
  };
}

export function formatZone(label: string, z: NormalizedRect): string {
  return `${label}: x=${z.x.toFixed(2)} y=${z.y.toFixed(2)} w=${z.width.toFixed(2)} h=${z.height.toFixed(2)} (normalized 0–1)`;
}
