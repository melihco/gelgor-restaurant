/**
 * Marka paleti → brand_theme + brand_context + üretim tokenları senkronu.
 */
import type { BrandColorPalette } from './sector-color-presets';

export interface SyncBrandPaletteInput {
  tenantId: string;
  palette: BrandColorPalette;
  existingTheme?: Record<string, unknown> | null;
  description?: string;
}

export interface SyncBrandPaletteResult {
  ok: boolean;
  theme?: Record<string, unknown> | null;
  error?: string;
}

function normalizeHex(value: string, fallback: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match?.[1]) return fallback;
  let hex = match[1].toLowerCase();
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  return `#${hex}`;
}

/** Story / post Remotion — theme.palette + brand_context renk alanları */
export async function syncBrandPaletteToProduction(
  input: SyncBrandPaletteInput,
): Promise<SyncBrandPaletteResult> {
  const { tenantId, palette, existingTheme, description } = input;
  const primary = normalizeHex(palette.primary, '#1a1a1a');
  const accent = normalizeHex(palette.accent, '#c9a96e');
  const neutral = normalizeHex(palette.neutral, '#f5f5f5');
  const shadow = normalizeHex(palette.shadow, '#000000');

  const existingTypography = (existingTheme?.typography ?? {}) as Record<string, unknown>;

  const overlayExisting = (existingTheme?.overlay as Record<string, unknown>) ?? {};
  const themePayload = {
    theme: {
      workspace_id: tenantId,
      derived_at: new Date().toISOString(),
      source: 'manual_colors',
      palette: {
        primary,
        accent,
        neutral,
        shadow,
        description: description ?? palette.labelTr ?? 'Manuel renk paleti',
      },
      typography: existingTypography,
      composition: existingTheme?.composition ?? {},
      grading: existingTheme?.grading ?? {},
      overlay: {
        ...overlayExisting,
        color: shadow,
        opacity: typeof overlayExisting.opacity === 'number' ? overlayExisting.opacity : 0.28,
      },
      motion_profile: existingTheme?.motion_profile ?? existingTheme?.motionProfile ?? {},
      layout: existingTheme?.layout ?? {},
      caption_voice_rules: existingTheme?.caption_voice_rules ?? existingTheme?.captionVoiceRules ?? [],
      anti_patterns: existingTheme?.anti_patterns ?? existingTheme?.antiPatterns ?? [],
      contrast_valid: true,
    },
  };

  try {
    const [themeRes, ctxRes] = await Promise.all([
      fetch(`/api/brand-context/${tenantId}/theme`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
        body: JSON.stringify(themePayload),
      }),
      fetch(`/api/brand-context-data/${tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_primary_color: primary,
          brand_accent_color: accent,
        }),
      }),
    ]);

    if (!themeRes.ok) {
      return { ok: false, error: `theme HTTP ${themeRes.status}` };
    }

    const data = await themeRes.json() as { theme?: Record<string, unknown> | null };
    if (!ctxRes.ok) {
      return { ok: true, theme: data.theme ?? null, error: 'brand_context sync partial' };
    }

    return { ok: true, theme: data.theme ?? null };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'sync failed',
    };
  }
}

/** CompanyProfile alanları — brandColors / accentColors metin formatı */
export function paletteToProfileFields(palette: BrandColorPalette): {
  brandColors: string;
  accentColors: string;
} {
  return {
    brandColors: [palette.primary, palette.accent, palette.neutral, palette.shadow]
      .filter(Boolean)
      .join(', '),
    accentColors: palette.accent,
  };
}
