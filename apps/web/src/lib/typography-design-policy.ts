/**
 * Typography design confirmation — multi-tenant SSOT for locked brand vibe.
 * Onboarding must confirm before Fal design-template generation; production
 * prefers confirmed vibe over caption heuristics and template snapshots.
 */

import {
  defaultTypographyVibeForSector,
  TYPOGRAPHY_VIBE_LABELS,
  type BrandDesignTypographyConfig,
  type TypographyVibe,
} from '@/types/brand-theme';

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
  return raw as Partial<BrandDesignTypographyConfig>;
}

export function isTypographyDesignConfirmed(
  theme: Record<string, unknown> | null | undefined,
): boolean {
  const cfg = readTypographyDesignConfig(theme);
  return Boolean(cfg && isKnownTypographyVibe(cfg.vibe) && cfg.confirmed_at);
}

export function resolveSuggestedTypographyConfig(
  theme: Record<string, unknown> | null | undefined,
  sector: string,
): BrandDesignTypographyConfig {
  const raw = readTypographyDesignConfig(theme);
  const suggestedVibe = defaultTypographyVibeForSector(sector);
  return {
    vibe: isKnownTypographyVibe(raw?.vibe) ? raw!.vibe! : suggestedVibe,
    text_effect: raw?.text_effect ?? 'gradient_stack',
    accent_color: raw?.accent_color,
    background_style: raw?.background_style ?? 'gradient_mesh',
    logo_treatment: raw?.logo_treatment ?? 'watermark',
    source: raw?.source,
    confirmed_at: raw?.confirmed_at,
  };
}

export function buildUserConfirmedTypographyPatch(
  config: BrandDesignTypographyConfig,
): BrandDesignTypographyConfig {
  return {
    ...config,
    source: 'user',
    confirmed_at: new Date().toISOString(),
  };
}
