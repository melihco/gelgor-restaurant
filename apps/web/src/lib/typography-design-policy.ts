/**
 * Typography design confirmation — multi-tenant SSOT for locked brand vibe.
 * Onboarding must confirm before Fal design-template generation; production
 * prefers confirmed vibe over caption heuristics and template snapshots.
 */

import {
  TYPOGRAPHY_VIBE_LABELS,
  type BrandDesignTypographyConfig,
  type TypographyVibe,
} from '@/types/brand-theme';
import { resolveTypographyDesign } from '@/lib/production-design-policy';
import { resolvePostDesignDefaultsFromVibe } from '@/lib/post-design-defaults-policy';
import type { BrandPostDesignDefaults } from '@/types/brand-theme';

export const KNOWN_TYPOGRAPHY_VIBES = new Set<TypographyVibe>(
  Object.keys(TYPOGRAPHY_VIBE_LABELS) as TypographyVibe[],
);

export const TYPOGRAPHY_VIBE_ONBOARDING_OPTIONS: Array<{
  id: TypographyVibe;
  label: string;
  desc: string;
  emoji: string;
}> = (Object.keys(TYPOGRAPHY_VIBE_LABELS) as TypographyVibe[]).map((id) => ({
  id,
  label: TYPOGRAPHY_VIBE_LABELS[id].tr,
  desc: TYPOGRAPHY_VIBE_LABELS[id].desc,
  emoji: TYPOGRAPHY_VIBE_LABELS[id].emoji,
}));

export function isKnownTypographyVibe(value: unknown): value is TypographyVibe {
  return typeof value === 'string' && KNOWN_TYPOGRAPHY_VIBES.has(value as TypographyVibe);
}

export function readTypographyDesignConfig(
  theme: Record<string, unknown> | null | undefined,
): Partial<BrandDesignTypographyConfig> | null {
  if (!theme) return null;
  const raw = theme.typography_design ?? theme.typographyDesign;
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  // Theme BFF camelCases keys — accept both wire formats.
  const confirmedAt = obj.confirmed_at ?? obj.confirmedAt;
  return {
    ...(obj as Partial<BrandDesignTypographyConfig>),
    confirmed_at: typeof confirmedAt === 'string' ? confirmedAt : undefined,
    text_effect: (obj.text_effect ?? obj.textEffect) as BrandDesignTypographyConfig['text_effect'],
    accent_color: (obj.accent_color ?? obj.accentColor) as string | undefined,
    background_style: (obj.background_style ?? obj.backgroundStyle) as BrandDesignTypographyConfig['background_style'],
    logo_treatment: (obj.logo_treatment ?? obj.logoTreatment) as BrandDesignTypographyConfig['logo_treatment'],
  };
}

export function readCreativeIdentityConfirmedAt(
  theme: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!theme) return undefined;
  const raw = theme.creative_identity_confirmed_at ?? theme.creativeIdentityConfirmedAt;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

export function isTypographyDesignConfirmed(
  theme: Record<string, unknown> | null | undefined,
): boolean {
  const cfg = readTypographyDesignConfig(theme);
  if (!cfg || !isKnownTypographyVibe(cfg.vibe)) return false;
  if (cfg.confirmed_at) return true;
  // Onboarding stamps the identity clock even if nested confirmed_at was dropped.
  return Boolean(readCreativeIdentityConfirmedAt(theme));
}

export function extractThemeHexColor(raw: unknown, fallback: string): string {
  const text = String(raw ?? '').trim();
  const match = text.match(/#([0-9a-fA-F]{6})\b/);
  return match ? `#${match[1]}` : fallback;
}

export function readThemePaletteColors(
  theme: Record<string, unknown> | null | undefined,
): { primary: string; accent: string; neutral: string; shadow: string } {
  const palette = (theme?.palette && typeof theme.palette === 'object'
    ? theme.palette
    : {}) as Record<string, unknown>;
  return {
    primary: extractThemeHexColor(palette.primary, '#1a1a1a'),
    accent: extractThemeHexColor(palette.accent, '#4f8ef7'),
    neutral: extractThemeHexColor(palette.neutral, '#f5f5f5'),
    shadow: extractThemeHexColor(palette.shadow, '#111111'),
  };
}

/** Hub / Şablonlar confirm — locks vibe + palette without a second onboarding step. */
export function buildHubTypographyConfirmThemePatch(input: {
  currentTheme: Record<string, unknown>;
  typography: BrandDesignTypographyConfig;
  palette: { primary: string; accent: string; neutral: string; shadow: string };
}): Record<string, unknown> {
  const confirmed = buildUserConfirmedTypographyPatch({
    ...input.typography,
    accent_color: input.palette.accent,
  });
  const existingPost = input.currentTheme.post_design_defaults
    ?? input.currentTheme.postDesignDefaults;
  const postDefaults = existingPost && typeof existingPost === 'object'
    ? existingPost
    : resolvePostDesignDefaultsForTypography(confirmed);
  const prevPalette = (input.currentTheme.palette && typeof input.currentTheme.palette === 'object'
    ? input.currentTheme.palette
    : {}) as Record<string, unknown>;
  const confirmedAt = confirmed.confirmed_at ?? new Date().toISOString();
  return {
    ...input.currentTheme,
    typography_design: confirmed,
    typographyDesign: confirmed,
    post_design_defaults: postDefaults,
    postDesignDefaults: postDefaults,
    palette: {
      ...prevPalette,
      primary: input.palette.primary,
      accent: input.palette.accent,
      neutral: input.palette.neutral,
      shadow: input.palette.shadow,
    },
    creative_identity_confirmed_at: confirmedAt,
    creativeIdentityConfirmedAt: confirmedAt,
  };
}

/** HTTP / runner error when a full template set is requested without confirm. */
export const TYPOGRAPHY_NOT_CONFIRMED = 'typography_not_confirmed';

export function typographyNotConfirmedResponse(): {
  error: typeof TYPOGRAPHY_NOT_CONFIRMED;
  message: string;
} {
  return {
    error: TYPOGRAPHY_NOT_CONFIRMED,
    message: 'Renk ve tipografi onayı olmadan şablon seti üretilmez.',
  };
}

/**
 * DNA-aware suggestion — same policy as Python PDP / production-design-policy.
 * Never invents gradient_stack + gradient_mesh when DNA says warm/handwritten.
 */
export function resolveSuggestedTypographyConfig(
  theme: Record<string, unknown> | null | undefined,
  sector: string,
  visualDna?: string | null,
): BrandDesignTypographyConfig {
  const raw = readTypographyDesignConfig(theme);
  const dna = typeof visualDna === 'string' && visualDna.trim()
    ? visualDna
    : typeof theme?.visual_dna === 'string'
      ? theme.visual_dna
      : typeof theme?.visualDna === 'string'
        ? theme.visualDna
        : '';
  const palette = (theme?.palette && typeof theme.palette === 'object'
    ? theme.palette
    : {}) as Record<string, unknown>;
  const accent = typeof (raw?.accent_color ?? palette.accent) === 'string'
    ? String(raw?.accent_color ?? palette.accent)
    : undefined;
  const policy = resolveTypographyDesign({
    sector,
    visualDna: dna,
    accentColor: accent,
  });

  return {
    vibe: isKnownTypographyVibe(raw?.vibe) ? raw!.vibe! : policy.vibe,
    text_effect: raw?.text_effect ?? policy.text_effect,
    accent_color: raw?.accent_color ?? policy.accent_color,
    background_style: raw?.background_style ?? policy.background_style,
    logo_treatment: raw?.logo_treatment ?? policy.logo_treatment,
    source: raw?.source,
    confirmed_at: raw?.confirmed_at,
  };
}

/** Pair Hub post_design_defaults with a typography config (onboarding confirm). */
export function resolvePostDesignDefaultsForTypography(
  typography: Pick<BrandDesignTypographyConfig, 'vibe' | 'accent_color' | 'text_effect'>,
): BrandPostDesignDefaults {
  const mapped = resolvePostDesignDefaultsFromVibe(typography.vibe, {
    accentColor: typography.accent_color,
  });
  // Prefer typography text_effect when already DNA-aligned (soft_shadow etc.).
  if (typography.text_effect) {
    return { ...mapped, text_effect: typography.text_effect };
  }
  return mapped;
}

export function buildUserConfirmedTypographyPatch(
  config: BrandDesignTypographyConfig,
): BrandDesignTypographyConfig {
  const confirmedAt = new Date().toISOString();
  return {
    ...config,
    source: 'user',
    confirmed_at: confirmedAt,
    // Persist camelCase twin so Next theme JSON round-trips still count as confirmed.
    confirmedAt,
  } as BrandDesignTypographyConfig & { confirmedAt: string };
}
