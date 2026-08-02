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
  desc: TYPOGRAPHY_VIBE_LABELS[id].en,
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

export function isTypographyDesignConfirmed(
  theme: Record<string, unknown> | null | undefined,
): boolean {
  const cfg = readTypographyDesignConfig(theme);
  return Boolean(cfg && isKnownTypographyVibe(cfg.vibe) && cfg.confirmed_at);
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
