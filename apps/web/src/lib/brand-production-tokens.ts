/**
 * Marka Detayı + brand_theme + brand_context → üretim tokenları.
 * Kampanya motion story, designed post ve reklam overlay'leri bu waterfall'ı kullanır.
 */
import {
  resolveAnnouncementBrandKit,
  type AnnouncementBrandKit,
} from '@/lib/announcement-brand-kit';
import { resolveTextOverlayPrefs } from '@/lib/brand-text-overlay-prefs';
import { resolveSectorColorPreset } from '@/lib/sector-color-presets';
import { resolveProductionStoryFonts } from '@/lib/premium-font-registry';
import type { FontPersonality } from '@/lib/remotion-template-types';
import { resolveTemplateColorProps } from '@/lib/template-color-policy';

export interface BrandProductionTokens {
  headingFont: string;
  bodyFont: string;
  primaryColor: string;
  accentColor: string;
  textColor: string;
  shadowColor: string;
  headlineColor: string;
  subtitleColor: string;
  overlayColor: string;
  overlayOpacity: number;
  announcementKit: AnnouncementBrandKit;
  sources: string[];
}

function readPalette(obj: Record<string, unknown> | undefined) {
  if (!obj) return null;
  const palette = (obj.palette ?? obj) as Record<string, unknown>;
  const primary = typeof palette.primary === 'string' ? palette.primary : null;
  const accent = typeof palette.accent === 'string' ? palette.accent : null;
  const neutral = typeof palette.neutral === 'string' ? palette.neutral : null;
  const shadow = typeof palette.shadow === 'string' ? palette.shadow : null;
  if (!primary && !accent && !neutral) return null;
  return { primary, accent, neutral, shadow };
}

function readTypography(obj: Record<string, unknown> | undefined) {
  if (!obj) return null;
  const typo = (obj.typography ?? obj) as Record<string, unknown>;
  const heading =
    typo.heading_font ?? typo.headingFont ?? typo.headline_font ?? typo.headlineFont;
  const body = typo.body_font ?? typo.bodyFont ?? typo.body_personality;
  const headlineColor = parseHex(typo.headline_color ?? typo.headlineColor);
  if (!heading && !body && !headlineColor) return null;
  return { heading, body, headlineColor };
}

function readPostDesignFontPreset(theme: Record<string, unknown> | undefined): { heading?: string; body?: string; source?: string } {
  const raw = (theme?.post_design_defaults ?? theme?.postDesignDefaults) as Record<string, unknown> | undefined;
  const preset = typeof raw?.font_preset === 'string'
    ? raw.font_preset
    : typeof raw?.fontPreset === 'string'
      ? raw.fontPreset
      : '';
  switch (preset) {
    case 'poster_3d':
      return { heading: 'Anton', body: 'Inter', source: 'theme.post_design_defaults.poster_3d' };
    case 'sticker_pop':
      return { heading: 'Bangers', body: 'Nunito', source: 'theme.post_design_defaults.sticker_pop' };
    case 'condensed_impact':
      return { heading: 'Bebas Neue', body: 'Inter', source: 'theme.post_design_defaults.condensed_impact' };
    case 'elegant_serif':
      return { heading: 'Playfair Display', body: 'Lora', source: 'theme.post_design_defaults.elegant_serif' };
    case 'clean_sans':
      return { heading: 'Inter', body: 'DM Sans', source: 'theme.post_design_defaults.clean_sans' };
    default:
      return {};
  }
}

function readOverlay(theme: Record<string, unknown> | undefined) {
  const overlay = (theme?.overlay ?? theme?.Overlay) as Record<string, unknown> | undefined;
  const opacity = typeof overlay?.opacity === 'number'
    ? overlay.opacity
    : typeof overlay?.opacity === 'string'
      ? parseFloat(overlay.opacity)
      : null;
  const color = typeof overlay?.color === 'string' ? overlay.color : null;
  return { opacity, color };
}

function parseHex(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const m = raw.match(/#[0-9a-fA-F]{3,8}\b/);
  return m ? m[0] : null;
}

/**
 * Auto-generate a complementary accent from a primary colour when no accent is defined.
 *
 * Strategy: shift hue by 30–60° toward warm-gold/amber for dark primaries,
 * toward cool-teal for bright/warm primaries. This prevents the flat "same-hue" look
 * that occurs when primary === accent.
 */
function deriveComplementaryAccent(primaryHex: string): string {
  const h = primaryHex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return '#c9a96e';
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;

  // Convert to HSL
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return '#c9a96e'; // achromatic — default warm gold

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let hue = 0;
  if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) hue = ((b - r) / d + 2) / 6;
  else hue = ((r - g) / d + 4) / 6;
  const hDeg = hue * 360;

  // Determine accent hue shift: warm primaries (red/orange) get cool teal accent;
  // cool/neutral primaries (blue/navy/grey) get warm gold accent.
  const isWarm = (hDeg >= 0 && hDeg <= 50) || (hDeg >= 330 && hDeg <= 360);
  const isNeutral = s < 0.15;
  let accentHue: number;
  if (isNeutral) {
    accentHue = 42; // warm gold for achromatic / dark navy
  } else if (isWarm) {
    accentHue = (hDeg + 185) % 360; // complementary cool-teal
  } else {
    accentHue = 38 + ((hDeg * 0.06) % 18); // warm amber/gold range 38–56°
  }

  // Build accent: mid lightness (55%), moderate saturation (70%)
  const accentS = 0.70;
  const accentL = l < 0.35 ? 0.62 : 0.52; // brighter on dark bg
  const accentRgb = hslToRgb(accentHue / 360, accentS, accentL);
  return `#${accentRgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue2rgb(h + 1 / 3), hue2rgb(h), hue2rgb(h - 1 / 3)];
}

function subtitleFromTextColor(textColor: string): string {
  // Subtitle needs to feel like a deliberate step down in hierarchy, not just faded.
  // rgba(255,255,255,0.82) reads as intentional, not washed out.
  if (textColor === '#ffffff' || textColor === '#FFFFFF') return 'rgba(255,255,255,0.85)';
  if (textColor.startsWith('rgba')) return textColor;
  if (textColor.startsWith('#') && textColor.length === 7) {
    return `${textColor}e0`; // ~88% opacity — more visible than 'dd' (87%)
  }
  return 'rgba(255,255,255,0.85)';
}

/**
 * Tek kaynak: Marka Anayasası (theme.typography, palette, overlay) +
 * brand_context (brand_font_family, brand_primary/accent) + vibe fallback.
 */
export function resolveBrandProductionTokens(input: {
  brandContext?: Record<string, unknown> | null;
  brandTheme?: Record<string, unknown> | null;
  vibeProfile?: Record<string, unknown> | null;
  sector?: string;
  kitHeading?: string;
  kitBody?: string;
  fontPersonality?: FontPersonality | string;
  brandName?: string;
}): BrandProductionTokens {
  const ctx = input.brandContext ?? {};
  const theme = input.brandTheme ?? null;
  const vibe = (input.vibeProfile
    ?? ctx.brand_vibe_profile
    ?? ctx.brandVibeProfile) as Record<string, unknown> | undefined;

  const sources: string[] = [];

  const themePalette = readPalette(theme ?? undefined);
  const vibePalette = readPalette(vibe);
  const themeTypo = readTypography(theme ?? undefined);
  const vibeTypo = readTypography(vibe);
  const postDesignTypo = readPostDesignFontPreset(theme ?? undefined);
  const overlay = readOverlay(theme ?? undefined);
  const textPrefs = resolveTextOverlayPrefs(theme ?? undefined);

  const ctxPrimary = parseHex(ctx.brand_primary_color ?? ctx.brandPrimaryColor);
  const ctxAccent = parseHex(ctx.brand_accent_color ?? ctx.brandAccentColor);
  const ctxFont = typeof (ctx.brand_font_family ?? ctx.brandFontFamily) === 'string'
    ? String(ctx.brand_font_family ?? ctx.brandFontFamily).trim()
    : '';

  const announcementKit = resolveAnnouncementBrandKit({
    brandContext: ctx,
    brandTheme: theme,
    vibeProfile: vibe,
    overrides: input.brandName ? { brandName: input.brandName } : undefined,
  });

  if (themePalette?.primary) sources.push('theme.palette');
  else if (ctxPrimary) sources.push('brand_context.primary');
  else if (vibePalette?.primary) sources.push('vibe.palette');

  const sectorPalette = input.sector ? resolveSectorColorPreset(input.sector) : null;

  const primaryColor =
    themePalette?.primary
    ?? ctxPrimary
    ?? vibePalette?.primary
    ?? sectorPalette?.primary
    ?? announcementKit.primaryColor;

  const rawAccent =
    themePalette?.accent
    ?? ctxAccent
    ?? vibePalette?.accent
    ?? sectorPalette?.accent
    ?? announcementKit.accentColor;

  // If primary === accent (common when brands provide only one colour), derive a
  // complementary accent so gradient headline and panel treatments work properly.
  const accentIsSameAsPrimary = rawAccent && primaryColor
    && rawAccent.toLowerCase() === primaryColor.toLowerCase();
  const accentColor = accentIsSameAsPrimary
    ? deriveComplementaryAccent(primaryColor)
    : rawAccent;

  if (sectorPalette?.primary && !themePalette?.primary && !ctxPrimary && !vibePalette?.primary) {
    sources.push('sector.palette');
  }
  if (accentIsSameAsPrimary) sources.push('accent.derived');

  const headingRaw =
    postDesignTypo.heading
    ?? themeTypo?.heading
    ?? vibeTypo?.heading
    ?? ctxFont
    ?? undefined;
  const bodyRaw =
    postDesignTypo.body
    ?? themeTypo?.body
    ?? vibeTypo?.body
    ?? undefined;

  if (postDesignTypo.source) sources.push(postDesignTypo.source);
  else if (themeTypo?.heading) sources.push('theme.typography.heading');
  else if (vibeTypo?.heading) sources.push('vibe.typography.heading');
  else if (ctxFont) sources.push('brand_context.brand_font_family');

  const fonts = resolveProductionStoryFonts({
    sector: input.sector,
    kitHeading: input.kitHeading,
    kitBody: input.kitBody,
    brandHeading: headingRaw,
    brandBody: bodyRaw,
    brandFontFamily: ctxFont || undefined,
    fontPersonality: input.fontPersonality ?? 'brand',
  });

  // Text color: pure white gives maximum contrast for poster/story headlines.
  // Only use a tinted white if the brand explicitly defines a neutral text color.
  const rawText = announcementKit.textColor;
  const textColor = rawText === '#f5f0e8' || rawText === '#F5F0E8'
    ? '#FFFFFF'        // upgrade default cream to crisp white for poster impact
    : rawText;

  const headlineColor = themeTypo?.headlineColor
    ?? announcementKit.headlineColor
    ?? textColor;

  // Overlay opacity: brand theme + text_overlay_density (minimal = lighter scrim).
  const themeOpacity = overlay?.opacity != null && !Number.isNaN(overlay.opacity)
    ? overlay.opacity
    : textPrefs.overlayOpacity;
  const minOp = textPrefs.density === 'minimal' ? 0.18 : textPrefs.density === 'dense' ? 0.42 : 0.28;
  const maxOp = textPrefs.density === 'minimal' ? 0.52 : 0.78;
  const overlayOpacity = Math.min(maxOp, Math.max(minOp, themeOpacity));

  const overlayColor = overlay?.color ?? primaryColor ?? '#000000';

  const subtitleColor = subtitleFromTextColor(textColor);

  return {
    headingFont: fonts.heading,
    bodyFont: fonts.body,
    primaryColor,
    accentColor,
    textColor,
    shadowColor: announcementKit.shadowColor,
    headlineColor,
    subtitleColor,
    overlayColor,
    overlayOpacity,
    announcementKit,
    sources,
  };
}

/**
 * Story / poster Remotion props — apply brand tokens to render props.
 *
 * Tokens only fill in MISSING fields — explicit template values are never overwritten.
 * Typography: headline gets 900 weight, body 400. This is what separates a poster
 * from a basic text overlay.
 */
export function applyBrandTokensToRenderProps(
  props: Record<string, unknown>,
  tokens: BrandProductionTokens,
  slotTypography?: {
    headingFont?: string;
    bodyFont?: string;
    fontPersonality?: string;
    honorTemplateTypography?: boolean;
  },
): Record<string, unknown> {
  const headingFont = slotTypography?.headingFont ?? tokens.headingFont;
  const bodyFont = slotTypography?.bodyFont ?? tokens.bodyFont;
  const forceTemplateFonts = slotTypography?.honorTemplateTypography === true;
  const templateColors = resolveTemplateColorProps({
    templateId: typeof props.templateId === 'string' ? props.templateId : undefined,
    posterTemplateId: typeof props.posterTemplateId === 'string' ? props.posterTemplateId : undefined,
    tokens,
  });
  return {
    ...props,
    fontFamily:       forceTemplateFonts ? headingFont : (props.fontFamily ?? headingFont),
    bodyFont:         forceTemplateFonts ? bodyFont : (props.bodyFont ?? bodyFont),
    ...(slotTypography?.fontPersonality
      ? {
          fontPersonality: slotTypography.fontPersonality,
          honorTemplateTypography: slotTypography.honorTemplateTypography ?? true,
        }
      : {}),
    primaryColor:     props.primaryColor     ?? tokens.primaryColor,
    accentColor:      props.accentColor      ?? tokens.accentColor,
    headlineColor:    props.headlineColor    ?? templateColors.headlineColor ?? tokens.headlineColor,
    subtitleColor:    props.subtitleColor    ?? templateColors.subtitleColor ?? tokens.subtitleColor,
    categoryColor:    props.categoryColor    ?? templateColors.categoryColor,
    textColor:        props.textColor        ?? templateColors.textColor,
    overlayOpacity:   props.overlayOpacity   ?? tokens.overlayOpacity,
    overlayColor:     props.overlayColor     ?? templateColors.overlayColor ?? tokens.overlayColor,
    // Typography quality tokens — set if not already specified by template
    headlineFontWeight: props.headlineFontWeight ?? 900,
    bodyFontWeight:     props.bodyFontWeight     ?? 400,
    headlineLetterSpacing: props.headlineLetterSpacing ?? '-0.02em',
    bodyLetterSpacing:     props.bodyLetterSpacing     ?? '0.01em',
    // Text shadow for legibility on complex photo backgrounds
    textShadowColor:  props.textShadowColor  ?? (tokens.overlayColor === '#000000' ? 'rgba(0,0,0,0.55)' : tokens.shadowColor),
    textShadowBlur:   props.textShadowBlur   ?? 18,
  };
}

export async function fetchBrandThemeForWorkspace(
  workspaceId: string,
): Promise<Record<string, unknown> | null> {
  const crew = (process.env.CREW_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');
  const key = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';
  try {
    const themeRes = await fetch(`${crew}/api/v1/brand-context/${workspaceId}/theme`, {
      headers: {
        'X-Internal-Api-Key': key,
        'X-Tenant-Id': workspaceId,
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!themeRes.ok) return null;
    const themePayload = await themeRes.json() as { theme?: Record<string, unknown> | null };
    return themePayload.theme ?? null;
  } catch {
    return null;
  }
}

export async function fetchBrandProductionTokensForWorkspace(
  workspaceId: string,
  opts?: { sector?: string; brandName?: string },
): Promise<BrandProductionTokens> {
  const crew = (process.env.CREW_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');
  const key = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';
  const headers = {
    'X-Internal-Api-Key': key,
    'X-Tenant-Id': workspaceId,
  };

  try {
    const [ctxRes, themeRes] = await Promise.all([
      fetch(`${crew}/api/v1/brand-context/${workspaceId}`, {
        headers,
        signal: AbortSignal.timeout(8_000),
      }),
      fetch(`${crew}/api/v1/brand-context/${workspaceId}/theme`, {
        headers,
        signal: AbortSignal.timeout(8_000),
      }),
    ]);

    const ctx = ctxRes.ok ? await ctxRes.json() : {};
    const themePayload = themeRes.ok ? await themeRes.json() : {};
    const theme = (themePayload.theme ?? null) as Record<string, unknown> | null;
    const businessType = String(
      (ctx as Record<string, unknown>).business_type
      ?? (ctx as Record<string, unknown>).industry
      ?? '',
    );

    return resolveBrandProductionTokens({
      brandContext: ctx as Record<string, unknown>,
      brandTheme: theme,
      sector: opts?.sector ?? businessType,
      brandName: opts?.brandName
        ?? String((ctx as Record<string, unknown>).business_name ?? ''),
    });
  } catch {
    return resolveBrandProductionTokens({
      sector: opts?.sector,
      brandName: opts?.brandName,
    });
  }
}
