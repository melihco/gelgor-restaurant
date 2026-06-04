/**
 * Marka Detayı + brand_theme + brand_context → üretim tokenları.
 * Kampanya motion story, designed post ve reklam overlay'leri bu waterfall'ı kullanır.
 */
import {
  resolveAnnouncementBrandKit,
  type AnnouncementBrandKit,
} from '@/lib/announcement-brand-kit';
import { resolveTextOverlayPrefs } from '@/lib/brand-text-overlay-prefs';
import { resolveProductionStoryFonts } from '@/lib/premium-font-registry';
import type { FontPersonality } from '@/lib/remotion-template-types';

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

  const primaryColor =
    themePalette?.primary
    ?? ctxPrimary
    ?? vibePalette?.primary
    ?? announcementKit.primaryColor;

  const accentColor =
    themePalette?.accent
    ?? ctxAccent
    ?? vibePalette?.accent
    ?? announcementKit.accentColor;

  const headingRaw =
    themeTypo?.heading
    ?? vibeTypo?.heading
    ?? ctxFont
    ?? undefined;
  const bodyRaw =
    themeTypo?.body
    ?? vibeTypo?.body
    ?? undefined;

  if (themeTypo?.heading) sources.push('theme.typography.heading');
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
): Record<string, unknown> {
  return {
    ...props,
    fontFamily:       props.fontFamily       ?? tokens.headingFont,
    bodyFont:         props.bodyFont         ?? tokens.bodyFont,
    primaryColor:     props.primaryColor     ?? tokens.primaryColor,
    accentColor:      props.accentColor      ?? tokens.accentColor,
    headlineColor:    props.headlineColor    ?? tokens.headlineColor,
    subtitleColor:    props.subtitleColor    ?? tokens.subtitleColor,
    overlayOpacity:   props.overlayOpacity   ?? tokens.overlayOpacity,
    overlayColor:     props.overlayColor     ?? tokens.overlayColor,
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
