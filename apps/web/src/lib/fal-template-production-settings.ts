/**
 * fal.ai şablon üretimi — marka bazlı parametrik ayarlar (brand_theme.fal_template_production).
 *
 * Onboarding şablon galerisi + mission fal üretimi bu SSOT'u okur.
 */

import {
  resolveFalDesignIntensityConfig,
  type BrandFalDesignIntensityConfig,
  type FalDesignChannel,
  type FalDesignIntensityLevel,
} from '@/lib/fal-design-intensity';
import { ONBOARDING_CATALOG_TEMPLATE_CAP } from '@/lib/catalog-design-template-presets';
import type { LogoTreatment, TypographyBackgroundStyle } from '@/types/brand-theme';
import { readTypographyDesignConfig } from '@/lib/typography-design-policy';

export interface BrandFalTemplateProductionConfig {
  intensity: Required<BrandFalDesignIntensityConfig>;
  background_style: TypographyBackgroundStyle;
  prefer_gallery_photo: boolean;
  logo_treatment: LogoTreatment;
  preview_cap: number;
  concurrency: number;
}

export const FAL_TEMPLATE_BACKGROUND_LABELS: Record<
  TypographyBackgroundStyle,
  { tr: string; desc: string }
> = {
  photo_overlay: {
    tr: 'Fotoğraf üstü',
    desc: 'Galeri görseli hero — tipografi overlay',
  },
  gradient_mesh: {
    tr: 'Gradient mesh',
    desc: 'Marka renkli yumuşak gradient zemin',
  },
  solid_brand: {
    tr: 'Düz marka rengi',
    desc: 'Minimal düz renk blok + tipografi',
  },
  transparent: {
    tr: 'Şeffaf / sade',
    desc: 'Minimum zemin — tipografi odaklı',
  },
};

export const FAL_TEMPLATE_LOGO_LABELS: Record<LogoTreatment, { tr: string; desc: string }> = {
  watermark: { tr: 'Filigran', desc: 'İnce, köşede marka işareti' },
  badge: { tr: 'Rozet', desc: 'Küçük premium logo rozeti' },
  inline: { tr: 'Satır içi', desc: 'Kompozisyona entegre logo' },
  none: { tr: 'Logo yok', desc: 'Şablonda logo kullanma' },
};

const PREVIEW_CAP_MIN = 4;
const PREVIEW_CAP_MAX = 20;
const CONCURRENCY_MIN = 1;
const CONCURRENCY_MAX = 4;

function readThemeRecord(
  theme: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return theme && typeof theme === 'object' ? theme : {};
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

/** Resolve persisted fal template production config with backward-compatible fallbacks. */
export function resolveFalTemplateProductionSettings(
  theme: Record<string, unknown> | null | undefined,
): BrandFalTemplateProductionConfig {
  const t = readThemeRecord(theme);
  const raw = (t.fal_template_production ?? t.falTemplateProduction) as
    Partial<BrandFalTemplateProductionConfig> | undefined;
  const typography = readTypographyDesignConfig(theme);
  const intensity = resolveFalDesignIntensityConfig(theme);

  return {
    intensity: {
      story: raw?.intensity?.story ?? intensity.story,
      reel: raw?.intensity?.reel ?? intensity.reel,
      post: raw?.intensity?.post ?? intensity.post,
    },
    background_style:
      raw?.background_style
      ?? typography?.background_style
      ?? 'gradient_mesh',
    prefer_gallery_photo: raw?.prefer_gallery_photo ?? true,
    logo_treatment: raw?.logo_treatment ?? typography?.logo_treatment ?? 'watermark',
    preview_cap: clampInt(
      raw?.preview_cap,
      PREVIEW_CAP_MIN,
      PREVIEW_CAP_MAX,
      ONBOARDING_CATALOG_TEMPLATE_CAP,
    ),
    concurrency: clampInt(raw?.concurrency, CONCURRENCY_MIN, CONCURRENCY_MAX, 2),
  };
}

export function resolveFalTemplateIntensityForChannel(
  theme: Record<string, unknown> | null | undefined,
  channel: FalDesignChannel,
): FalDesignIntensityLevel {
  return resolveFalTemplateProductionSettings(theme).intensity[channel];
}

export function resolveFalTemplateBackgroundStyle(input: {
  theme: Record<string, unknown> | null | undefined;
  referencePhotoUrl?: string | null;
}): TypographyBackgroundStyle {
  const cfg = resolveFalTemplateProductionSettings(input.theme);
  if (input.referencePhotoUrl && cfg.prefer_gallery_photo) {
    return 'photo_overlay';
  }
  return cfg.background_style;
}

export function shouldProminentLogoInFalTemplate(
  theme: Record<string, unknown> | null | undefined,
  presetProminent?: boolean,
): boolean {
  const treatment = resolveFalTemplateProductionSettings(theme).logo_treatment;
  if (treatment === 'none') return false;
  if (treatment === 'badge' || treatment === 'inline') return true;
  return presetProminent ?? false;
}

export function buildFalTemplateProductionPatch(
  config: BrandFalTemplateProductionConfig,
): Record<string, unknown> {
  return {
    falTemplateProduction: {
      intensity: config.intensity,
      background_style: config.background_style,
      prefer_gallery_photo: config.prefer_gallery_photo,
      logo_treatment: config.logo_treatment,
      preview_cap: config.preview_cap,
      concurrency: config.concurrency,
    },
    falDesignIntensity: config.intensity,
  };
}

export const FAL_TEMPLATE_PREVIEW_CAP_OPTIONS = [8, 10, 12, 16, 20] as const;
export const FAL_TEMPLATE_CONCURRENCY_OPTIONS = [1, 2, 3, 4] as const;

/** Merge transient production overrides into brand_theme for preview generation. */
export function applyFalProductionOverridesToTheme(
  theme: Record<string, unknown> | null | undefined,
  overrides?: Partial<BrandFalTemplateProductionConfig>,
): Record<string, unknown> | null {
  if (!overrides || Object.keys(overrides).length === 0) {
    return theme ?? null;
  }
  const base = resolveFalTemplateProductionSettings(theme);
  return {
    ...(theme ?? {}),
    fal_template_production: {
      ...base,
      ...overrides,
      intensity: {
        ...base.intensity,
        ...(overrides.intensity ?? {}),
      },
    },
  };
}

export function intensityChannelForCatalogFormat(
  format: string,
): import('@/lib/fal-design-intensity').FalDesignChannel {
  if (format === 'reel' || format === 'reel_cover') return 'reel';
  if (format === 'story') return 'story';
  return 'post';
}

export const FAL_SLOT_COMPARE_INTENSITIES: import('@/lib/fal-design-intensity').FalDesignIntensityLevel[] = [
  'photo_first',
  'elegant_light',
  'balanced',
  'designed',
  'bold_editorial',
];
