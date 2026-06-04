/**
 * Per-tenant brand kit for announcement/event overlay templates.
 *
 * Waterfall (matches brand_theme_service ADR-001):
 *   brand_theme → brand_vibe_profile → Python brand_context manual fields
 *   → Nexus CompanyProfile (fonts/colors/logo) → sector defaults
 */

import { SAFE_FONTS } from '@/types/brand-theme';

export interface AnnouncementBrandKit {
  primaryColor: string;
  accentColor: string;
  textColor: string;
  /** Hero başlık rengi — Marka Kiti typography.headline_color */
  headlineColor: string;
  shadowColor: string;
  headingFontStack: string;
  bodyFontStack: string;
  logoUrl: string | null;
  brandName: string;
  themeSource: string;
}

const DEFAULT_KIT: AnnouncementBrandKit = {
  primaryColor: '#1a1a2e',
  accentColor: '#E8C87A',
  textColor: '#FFFFFF',        // crisp white — poster standard
  shadowColor: '#0d0d1a',
  headingFontStack: "'Bodoni Moda', 'Playfair Display', Georgia, 'Times New Roman', serif",
  bodyFontStack: "'Barlow Condensed', 'DM Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  logoUrl: null,
  brandName: '',
  themeSource: 'default',
};

const SERIF_FONTS = new Set([
  'Playfair Display', 'Lora', 'Cormorant Garamond', 'DM Serif Display',
  'Libre Baskerville', 'Fraunces', 'Source Serif 4',
]);

function parseFirstHex(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const match = raw.match(/#[0-9a-fA-F]{3,8}\b/);
  return match ? normalizeHex(match[0]) : null;
}

function normalizeHex(hex: string): string {
  const h = hex.trim();
  if (h.length === 4) {
    return `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`.toLowerCase();
  }
  return h.toLowerCase();
}

function hexLuminance(hex: string): number {
  const h = normalizeHex(hex).replace('#', '');
  if (h.length !== 6) return 0.5;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function pickTextColor(neutral: string | null, shadow: string | null): string {
  // Prefer explicit neutral when it's light enough (readable on dark overlay).
  // Fall back to pure white — maximum poster contrast.
  if (neutral && hexLuminance(neutral) > 0.55) return neutral;
  if (shadow && hexLuminance(shadow) > 0.55) return shadow;
  return '#FFFFFF'; // poster default: crisp white
}

function sanitizeFontName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.split(',')[0]?.trim() ?? '';
  if (!trimmed) return null;
  const match = SAFE_FONTS.find(
    (f) => f.toLowerCase() === trimmed.toLowerCase(),
  );
  return match ?? trimmed;
}

export function fontNameToStack(name: unknown, fallbackSerif = false): string {
  const safe = sanitizeFontName(name);
  if (!safe) {
    return fallbackSerif
      ? DEFAULT_KIT.headingFontStack
      : DEFAULT_KIT.bodyFontStack;
  }
  const isSerif = SERIF_FONTS.has(safe) || safe.toLowerCase().includes('serif');
  const generic = isSerif ? 'serif' : 'sans-serif';
  return `'${safe}', ${generic}`;
}

function readPalette(obj: Record<string, unknown> | undefined) {
  if (!obj) return null;
  const palette = (obj.palette ?? obj) as Record<string, unknown>;
  const primary = parseFirstHex(palette.primary);
  const accent = parseFirstHex(palette.accent);
  const neutral = parseFirstHex(palette.neutral);
  const shadow = parseFirstHex(palette.shadow);
  if (!primary && !accent && !neutral) return null;
  return { primary, accent, neutral, shadow };
}

function readTypography(obj: Record<string, unknown> | undefined) {
  if (!obj) return null;
  const typo = (obj.typography ?? obj) as Record<string, unknown>;
  const heading =
    typo.heading_font ?? typo.headingFont ?? typo.headline_font ?? typo.headlineFont;
  const body = typo.body_font ?? typo.bodyFont ?? typo.body_personality;
  const headlineColor = parseFirstHex(typo.headline_color ?? typo.headlineColor);
  if (!heading && !body && !headlineColor) return null;
  return { heading, body, headlineColor };
}

/** Script / brush başlık fontları — Marka Kiti seçiminde hero'ya uygulanır. */
export function brandHeadingUsesScriptStyle(headingFontStack: string): boolean {
  return /great vibes|allura|brush script|segoe script|pacifico|dancing script|sacramento|lobster/i.test(
    headingFontStack,
  );
}

export function resolveAnnouncementBrandKit(sources: {
  brandTheme?: Record<string, unknown> | null;
  brandContext?: Record<string, unknown> | null;
  companyProfile?: Record<string, unknown> | null;
  vibeProfile?: Record<string, unknown> | null;
  overrides?: Partial<AnnouncementBrandKit>;
}): AnnouncementBrandKit {
  const ctx = sources.brandContext ?? {};
  const profile = sources.companyProfile ?? {};
  const vibe = (sources.vibeProfile ?? ctx.brand_vibe_profile ?? ctx.brandVibeProfile) as
    | Record<string, unknown>
    | undefined;
  const theme = (sources.brandTheme ?? ctx.brand_theme ?? ctx.brandTheme) as
    | Record<string, unknown>
    | undefined;

  let source = 'default';
  let primary: string | null = null;
  let accent: string | null = null;
  let neutral: string | null = null;
  let shadow: string | null = null;
  let headingFont: string | null = null;
  let bodyFont: string | null = null;

  const themePalette = readPalette(theme ?? undefined);
  const vibePalette = readPalette(vibe ?? undefined);
  const themeTypo = readTypography(theme ?? undefined);
  const vibeTypo = readTypography(vibe ?? undefined);

  if (themePalette) {
    source = String(theme?.source ?? 'brand_theme');
    primary = themePalette.primary;
    accent = themePalette.accent;
    neutral = themePalette.neutral;
    shadow = themePalette.shadow;
  } else if (vibePalette) {
    source = 'vibe_profile';
    primary = vibePalette.primary;
    accent = vibePalette.accent;
    neutral = vibePalette.neutral;
    shadow = vibePalette.shadow;
  }

  if (themeTypo) {
    headingFont = sanitizeFontName(themeTypo.heading);
    bodyFont = sanitizeFontName(themeTypo.body);
    headlineColor = themeTypo.headlineColor ?? null;
  } else if (vibeTypo) {
    headingFont = sanitizeFontName(vibeTypo.heading);
    bodyFont = sanitizeFontName(vibeTypo.body);
    headlineColor = vibeTypo.headlineColor ?? null;
  }

  primary = primary
    ?? parseFirstHex(ctx.brand_primary_color ?? ctx.brandPrimaryColor)
    ?? parseFirstHex(profile.brandColors ?? profile.brand_colors)
    ?? DEFAULT_KIT.primaryColor;

  accent = accent
    ?? parseFirstHex(ctx.brand_accent_color ?? ctx.brandAccentColor)
    ?? parseFirstHex(profile.accentColors ?? profile.accent_colors)
    ?? DEFAULT_KIT.accentColor;

  shadow = shadow ?? primary;
  neutral = neutral ?? DEFAULT_KIT.textColor;

  const fontFromCtx = sanitizeFontName(ctx.brand_font_family ?? ctx.brandFontFamily);
  headingFont = headingFont
    ?? fontFromCtx
    ?? sanitizeFontName(profile.primaryFont ?? profile.primary_font);
  bodyFont = bodyFont
    ?? sanitizeFontName(profile.secondaryFont ?? profile.secondary_font)
    ?? fontFromCtx;

  const logoRaw =
    (typeof ctx.logo_url === 'string' && ctx.logo_url.startsWith('http') ? ctx.logo_url : null)
    ?? (typeof ctx.logoUrl === 'string' && ctx.logoUrl.startsWith('http') ? ctx.logoUrl : null)
    ?? (typeof profile.logoUrl === 'string' && profile.logoUrl.startsWith('http') ? profile.logoUrl : null)
    ?? (typeof profile.logo_url === 'string' && profile.logo_url.startsWith('http') ? profile.logo_url : null);

  const brandName = String(
    profile.brandName ?? profile.brand_name
    ?? ctx.business_name ?? ctx.businessName
    ?? sources.overrides?.brandName
    ?? '',
  ).trim();

  const baseText = pickTextColor(neutral, shadow);
  const kit: AnnouncementBrandKit = {
    primaryColor: primary,
    accentColor: accent,
    textColor: baseText,
    headlineColor: headlineColor ?? baseText,
    shadowColor: shadow ?? DEFAULT_KIT.shadowColor,
    headingFontStack: fontNameToStack(headingFont, true),
    bodyFontStack: fontNameToStack(bodyFont, false),
    logoUrl: logoRaw,
    brandName,
    themeSource: source,
  };

  if (sources.overrides) {
    return { ...kit, ...sources.overrides };
  }
  return kit;
}

export async function fetchTenantAnnouncementBrandKit(
  workspaceId: string,
): Promise<AnnouncementBrandKit> {
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

    return resolveAnnouncementBrandKit({
      brandContext: ctx as Record<string, unknown>,
      brandTheme: theme,
      vibeProfile: (ctx as Record<string, unknown>).brand_vibe_profile as Record<string, unknown> | undefined,
    });
  } catch {
    return { ...DEFAULT_KIT };
  }
}

/** Merge explicit client kit (preview) with tenant fetch */
export function mergeBrandKit(
  fetched: AnnouncementBrandKit,
  client?: Partial<AnnouncementBrandKit> | null,
): AnnouncementBrandKit {
  if (!client) return fetched;
  return resolveAnnouncementBrandKit({
    brandContext: {},
    overrides: { ...fetched, ...client },
  });
}
