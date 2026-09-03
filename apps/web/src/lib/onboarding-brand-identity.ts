/**
 * Onboarding visual-identity contract — font, logo, reference photos.
 *
 * Sector suggests a heading pair; the operator confirms (or changes) it.
 * Confirmed fonts beat sector font_preset so fifteen brands do not share
 * Playfair/Inter by default. No tenant UUID / brand-name branches.
 */

import { defaultFontsForSector, knownFontFamilies } from '@/lib/premium-font-registry';

export const ONBOARDING_MIN_REFERENCE_PHOTOS = 3;
export const ONBOARDING_MAX_REFERENCE_PHOTOS = 5;

export interface OnboardingHeadingFontOption {
  id: string;
  body: string;
  label: string;
  desc: string;
}

/** Compact picker — every family is already in the production Google Fonts registry. */
export const ONBOARDING_HEADING_FONTS: readonly OnboardingHeadingFontOption[] = [
  { id: 'Playfair Display', body: 'Lora', label: 'Editorial serif', desc: 'Restoran, dergi' },
  { id: 'Cormorant Garamond', body: 'Libre Baskerville', label: 'Klasik serif', desc: 'Otel, gurme' },
  { id: 'Instrument Serif', body: 'Spectral', label: 'Lüks editorial', desc: 'Butik, spa' },
  { id: 'Fraunces', body: 'Sora', label: 'Yumuşak serif', desc: 'Yerel, zanaat' },
  { id: 'Syne', body: 'Sora', label: 'Modern geometric', desc: 'Sahil, marina' },
  { id: 'Josefin Sans', body: 'Plus Jakarta Sans', label: 'Moda sans', desc: 'Perakende, güzellik' },
  { id: 'Unbounded', body: 'Barlow Condensed', label: 'Kalın display', desc: 'Gece, etkinlik' },
  { id: 'Cinzel', body: 'Cormorant Garamond', label: 'Antik başlık', desc: 'Lüks, davet' },
];

export function isKnownOnboardingHeadingFont(name: string | null | undefined): boolean {
  const n = String(name ?? '').trim();
  if (!n) return false;
  return ONBOARDING_HEADING_FONTS.some((o) => o.id === n) || knownFontFamilies().includes(n);
}

export function suggestOnboardingHeadingFont(sector: string): OnboardingHeadingFontOption {
  const pair = defaultFontsForSector(sector);
  const exact = ONBOARDING_HEADING_FONTS.find((o) => o.id === pair.heading);
  if (exact) return exact;
  const s = sector.toLowerCase().replace(/[\s-]+/g, '_');
  // beach_club also contains "club" — prefer coastal over nightlife.
  if (s.includes('beach') || s.includes('marina') || s.includes('pool')) {
    return ONBOARDING_HEADING_FONTS.find((o) => o.id === 'Syne')!;
  }
  if (s.includes('night') || s.includes('lounge') || s.includes('club')) {
    return ONBOARDING_HEADING_FONTS.find((o) => o.id === 'Unbounded')!;
  }
  if (s.includes('shop') || s.includes('product') || s.includes('retail')) {
    return ONBOARDING_HEADING_FONTS.find((o) => o.id === 'Fraunces')!;
  }
  return ONBOARDING_HEADING_FONTS[0]!;
}

export function resolveOnboardingHeadingOption(
  heading: string | null | undefined,
  sector: string,
): OnboardingHeadingFontOption {
  const n = String(heading ?? '').trim();
  const match = ONBOARDING_HEADING_FONTS.find((o) => o.id === n);
  return match ?? suggestOnboardingHeadingFont(sector);
}

export function isOnboardingFontConfirmed(theme: Record<string, unknown> | null | undefined): boolean {
  if (!theme || typeof theme !== 'object') return false;
  const typo = (theme.typography ?? theme.Typography) as Record<string, unknown> | undefined;
  const source = String(typo?.font_source ?? typo?.fontSource ?? theme.font_source ?? '').trim();
  if (source === 'onboarding') return true;
  return typo?.font_confirmed === true || typo?.fontConfirmed === true;
}

export function buildOnboardingIdentityThemePatch(input: {
  currentTheme: Record<string, unknown>;
  headingFont: string;
  bodyFont: string;
  typographyDesign: Record<string, unknown>;
  postDesignDefaults: Record<string, unknown>;
  palette: Record<string, unknown>;
}): Record<string, unknown> {
  const prevTypo = (
    input.currentTheme.typography && typeof input.currentTheme.typography === 'object'
      ? input.currentTheme.typography
      : {}
  ) as Record<string, unknown>;
  return {
    ...input.currentTheme,
    typography_design: input.typographyDesign,
    typographyDesign: input.typographyDesign,
    post_design_defaults: input.postDesignDefaults,
    postDesignDefaults: input.postDesignDefaults,
    palette: input.palette,
    typography: {
      ...prevTypo,
      heading_font: input.headingFont,
      headingFont: input.headingFont,
      body_font: input.bodyFont,
      bodyFont: input.bodyFont,
      font_source: 'onboarding',
      font_confirmed: true,
    },
    creative_identity_confirmed_at: new Date().toISOString(),
  };
}

export function buildOnboardingIdentityContextPatch(input: {
  logoUrl?: string;
  headingFont: string;
  primary: string;
  accent: string;
}): Record<string, string> {
  return {
    ...(input.logoUrl ? { logo_url: input.logoUrl } : {}),
    brand_font_family: input.headingFont,
    brand_primary_color: input.primary,
    brand_accent_color: input.accent,
  };
}

export function parseOnboardingRefUrls(raw: unknown): string[] {
  const asList = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value
      .map((u) => String(u ?? '').trim())
      .filter((u) => u.startsWith('http') || u.startsWith('/api/media'));
  };
  if (Array.isArray(raw)) return asList(raw);
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    return asList(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function referencePhotoAskCopy(existingCount: number): string {
  if (existingCount >= ONBOARDING_MIN_REFERENCE_PHOTOS) {
    return `${existingCount} referans fotoğraf var — istersen 2–3 tane daha yükle.`;
  }
  const need = ONBOARDING_MIN_REFERENCE_PHOTOS - existingCount;
  return existingCount > 0
    ? `${existingCount} fotoğraf var, ${need} referans daha önerilir.`
    : '3–5 mekan / ürün fotoğrafı yükle — üretim bunlardan tasarlar.';
}
