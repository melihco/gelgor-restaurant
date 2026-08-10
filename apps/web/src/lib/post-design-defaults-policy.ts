/**
 * Map AI typography vibe → Brand Hub post_design_defaults.
 * Used on onboarding confirm, theme derive, and Hub empty-state suggestions.
 */

import {
  TYPOGRAPHY_VIBE_LABELS,
  type BrandPostDesignDefaults,
  type TypographyVibe,
} from '@/types/brand-theme';

function normalizeVibe(vibe: TypographyVibe | string | null | undefined): TypographyVibe {
  if (typeof vibe === 'string' && vibe in TYPOGRAPHY_VIBE_LABELS) {
    return vibe as TypographyVibe;
  }
  return 'retro_poster';
}

export function resolvePostDesignDefaultsFromVibe(
  vibe: TypographyVibe | string | null | undefined,
  opts?: { accentColor?: string | null },
): BrandPostDesignDefaults {
  const v = normalizeVibe(vibe);
  let font_preset: BrandPostDesignDefaults['font_preset'] = 'elegant_serif';
  let text_effect: BrandPostDesignDefaults['text_effect'] = 'soft_shadow';
  let logo_position: BrandPostDesignDefaults['logo_position'] = 'bottom_right';

  switch (v) {
    case 'neon_glow':
      font_preset = 'condensed_impact';
      text_effect = 'neon_3d';
      logo_position = 'top_center';
      break;
    case 'bubble_3d':
    case 'street_bold':
      font_preset = 'poster_3d';
      text_effect = 'extrude_3d';
      logo_position = 'top_left';
      break;
    case 'minimal_modern':
      font_preset = 'clean_sans';
      text_effect = 'soft_shadow';
      logo_position = 'top_left';
      break;
    case 'editorial_serif':
    case 'quiet_luxury':
    case 'warm_coastal':
    case 'anatolian_warm':
      font_preset = 'elegant_serif';
      text_effect = (v === 'editorial_serif' || v === 'quiet_luxury')
        ? 'editorial_outline'
        : 'soft_shadow';
      logo_position = 'bottom_right';
      break;
    case 'clinical_clean':
      font_preset = 'clean_sans';
      text_effect = 'soft_shadow';
      logo_position = 'top_left';
      break;
    case 'chrome_gradient':
      font_preset = 'condensed_impact';
      text_effect = 'gradient_stack';
      logo_position = 'top_left';
      break;
    case 'retro_poster':
      font_preset = 'sticker_pop';
      text_effect = 'soft_shadow';
      logo_position = 'top_left';
      break;
    case 'handwritten':
    default:
      font_preset = 'elegant_serif';
      text_effect = 'soft_shadow';
      logo_position = 'bottom_right';
      break;
  }

  return {
    font_preset,
    text_effect,
    logo_position,
    ...(opts?.accentColor ? { accent_color: opts.accentColor } : {}),
  };
}

/** True when Hub has an explicit operator/onboarding-saved post design block. */
export function hasSavedPostDesignDefaults(
  theme: Record<string, unknown> | null | undefined,
): boolean {
  if (!theme) return false;
  const raw = (theme.post_design_defaults ?? theme.postDesignDefaults) as
    | Record<string, unknown>
    | null
    | undefined;
  if (!raw || typeof raw !== 'object') return false;
  return Boolean(
    raw.font_preset
    || raw.fontPreset
    || raw.text_effect
    || raw.textEffect
    || raw.logo_position
    || raw.logoPosition,
  );
}
