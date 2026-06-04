/**
 * Premium typography registry — shared by Remotion stories, SVG posters, and brand kits.
 *
 * Replaces generic Montserrat/Inter defaults with editorial display + refined body pairs.
 */

import type { FontPersonality } from './remotion-template-types';

/** Google Fonts CSS2 family specs (weights the engine uses). */
export const GOOGLE_FONT_SPECS: Record<string, string> = {
  'Playfair Display': 'Playfair+Display:ital,wght@0,400;0,600;0,700;0,900;1,400',
  'Cormorant Garamond': 'Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400',
  'DM Serif Display': 'DM+Serif+Display:ital,wght@0,400;1,400',
  'Fraunces': 'Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,900;1,9..144,400',
  'Libre Baskerville': 'Libre+Baskerville:ital,wght@0,400;0,700;1,400',
  'Lora': 'Lora:ital,wght@0,400;0,500;0,700;1,400',
  'Bodoni Moda': 'Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,600;0,6..96,900;1,6..96,400',
  'Inter': 'Inter:wght@300;400;500;600;700;800',
  'DM Sans': 'DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,400',
  'Sora': 'Sora:wght@400;500;600;700;800',
  'Manrope': 'Manrope:wght@400;500;600;700;800',
  'Outfit': 'Outfit:wght@300;400;500;600;700;800',
  'Space Grotesk': 'Space+Grotesk:wght@400;500;600;700',
  'Syne': 'Syne:wght@400;600;700;800',
  'Montserrat': 'Montserrat:wght@400;500;600;700;800;900',
  'Raleway': 'Raleway:wght@300;400;500;600;700;800',
  'Poppins': 'Poppins:wght@300;400;500;600;700;800',
  'Anton': 'Anton:wght@400',
  'Archivo Black': 'Archivo+Black:wght@400',
  'Oswald': 'Oswald:wght@400;500;600;700',
  'Bebas Neue': 'Bebas+Neue:wght@400',
  'Barlow Condensed': 'Barlow+Condensed:wght@400;600;700;800',
  'Roboto': 'Roboto:wght@300;400;500;700',
  'Roboto Condensed': 'Roboto+Condensed:wght@400;700',
  'Great Vibes': 'Great+Vibes:wght@400',
  'Allura': 'Allura:wght@400',
  'Source Serif 4': 'Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400',
};

export interface FontStackResult {
  hero: string;
  body: string;
  /** Unique Google Font family names to load before render. */
  families: string[];
}

function quote(name: string): string {
  return `'${name.replace(/'/g, "\\'")}'`;
}

function stack(...names: string[]): string {
  return names.map(quote).join(', ');
}

/** Pick brand heading when set; otherwise use curated premium default. */
function heroFont(
  brandFont: string | undefined,
  fallback: string,
  opts?: { honorExplicitBrand?: boolean },
): string {
  const b = (brandFont || '').trim();
  if (!b) return fallback;
  if (opts?.honorExplicitBrand) return b;
  const generic = new Set(['Montserrat', 'Inter', 'Arial', 'Roboto', 'Open Sans', 'Lato', 'Helvetica']);
  if (!generic.has(b)) return b;
  return fallback;
}

/**
 * Resolve CSS font-family stacks + families to preload for Remotion / resvg.
 */
export function resolveFontStack(
  personality: FontPersonality | string,
  brandFont?: string,
  bodyFont?: string,
  opts?: { honorExplicitBrand?: boolean },
): FontStackResult {
  const honor = opts?.honorExplicitBrand === true;
  switch (personality) {
    case 'serif_editorial': {
      const hero = heroFont(brandFont, 'Cormorant Garamond', { honorExplicitBrand: honor });
      const body = bodyFont || 'Libre Baskerville';
      return {
        hero: stack(hero, 'Cormorant Garamond', 'Playfair Display', 'Georgia', 'serif'),
        body: stack(body, 'Lora', 'Libre Baskerville', 'Georgia', 'serif'),
        families: [hero, body, 'Cormorant Garamond', 'Playfair Display'],
      };
    }
    case 'display_bold': {
      // Impact-level poster typography — nightclub, concert, festival, streetwear
      const hero = heroFont(brandFont, 'Anton', { honorExplicitBrand: honor });
      const body = bodyFont || 'Barlow Condensed';
      return {
        hero: stack(hero, 'Anton', 'Archivo Black', 'Oswald', 'Bebas Neue', 'Impact', 'sans-serif'),
        body: stack(body, 'Barlow Condensed', 'Oswald', 'Roboto Condensed', 'sans-serif'),
        families: [hero, body, 'Anton', 'Archivo Black', 'Oswald'],
      };
    }
    case 'poster_display': {
      // Premium poster quality: editorial serif headline + tight condensed body
      // Best for designed_post, designed posters, campaign hero
      const hero = heroFont(brandFont, 'Bodoni Moda', { honorExplicitBrand: honor });
      const body = bodyFont || 'Barlow Condensed';
      return {
        hero: stack(hero, 'Bodoni Moda', 'Playfair Display', 'Cormorant Garamond', 'Georgia', 'serif'),
        body: stack(body, 'Barlow Condensed', 'Oswald', 'DM Sans', 'sans-serif'),
        families: [hero, body, 'Bodoni Moda', 'Playfair Display'],
      };
    }
    case 'sans_modern': {
      const hero = heroFont(brandFont, 'Syne', { honorExplicitBrand: honor });
      const body = bodyFont || 'DM Sans';
      return {
        hero: stack(hero, 'Syne', 'Space Grotesk', 'Outfit', 'Helvetica Neue', 'sans-serif'),
        body: stack(body, 'DM Sans', 'Sora', 'Manrope', 'sans-serif'),
        families: [hero, body, 'Syne', 'Space Grotesk', 'DM Sans'],
      };
    }
    case 'script': {
      return {
        hero: stack('Great Vibes', 'Allura', 'Segoe Script', 'cursive'),
        body: stack(bodyFont || 'Cormorant Garamond', 'Lora', 'Georgia', 'serif'),
        families: ['Great Vibes', bodyFont || 'Cormorant Garamond'],
      };
    }
    case 'brand':
    default: {
      // Default brand editorial — DM Serif Display is cinematic yet legible at large sizes
      const hero = heroFont(brandFont, 'DM Serif Display', { honorExplicitBrand: honor });
      const body = bodyFont || 'Sora';
      return {
        hero: stack(hero, 'DM Serif Display', 'Fraunces', 'Cormorant Garamond', 'Georgia', 'serif'),
        body: stack(body, 'Sora', 'DM Sans', 'Manrope', 'sans-serif'),
        families: [hero, body, 'DM Serif Display', 'Fraunces'],
      };
    }
  }
}

/**
 * Sector-aware heading + body font defaults.
 * Goal: font pair should feel NATIVE to the sector — not generic.
 * Priority: editorial impact > legibility > uniqueness.
 */
export function defaultFontsForSector(sector: string): { heading: string; body: string } {
  const s = sector.toLowerCase().replace(/[\s-]+/g, '_');

  // ── Nightlife / Entertainment ────────────────────────────────────────────
  if (s.includes('night') || s.includes('club') || s.includes('disco') || s.includes('lounge_bar')) {
    return { heading: 'Anton', body: 'Barlow Condensed' };
  }
  if (s.includes('concert') || s.includes('festival') || s.includes('music') || s.includes('dj')) {
    return { heading: 'Archivo Black', body: 'Barlow Condensed' };
  }
  // ── Event / Entertainment Venue ─────────────────────────────────────────
  if (s.includes('event') || s.includes('theater') || s.includes('theatre') || s.includes('show') || s.includes('performance')) {
    return { heading: 'Playfair Display', body: 'Cormorant Garamond' };
  }
  if (s.includes('entertainment') || s.includes('eğlence') || s.includes('mekan')) {
    return { heading: 'Bodoni Moda', body: 'Barlow Condensed' };
  }
  // ── Luxury / Fine Dining ─────────────────────────────────────────────────
  if (s.includes('fine_dining') || s.includes('steak') || s.includes('wine') || s.includes('gourmet')) {
    return { heading: 'Cormorant Garamond', body: 'Libre Baskerville' };
  }
  if (s.includes('luxury') || s.includes('premium') || s.includes('lüks')) {
    return { heading: 'Bodoni Moda', body: 'Cormorant Garamond' };
  }
  // ── Restaurant / Cafe ───────────────────────────────────────────────────
  if (s.includes('restaurant') || s.includes('restoran') || s.includes('bistro') || s.includes('brasserie')) {
    return { heading: 'Playfair Display', body: 'Lora' };
  }
  if (s.includes('cafe') || s.includes('kahve') || s.includes('coffee') || s.includes('bakery') || s.includes('patisserie') || s.includes('pastry')) {
    return { heading: 'Fraunces', body: 'Lora' };
  }
  // ── Hotel / Resort / Wellness ────────────────────────────────────────────
  if (s.includes('hotel') || s.includes('resort') || s.includes('boutique_hotel')) {
    return { heading: 'Bodoni Moda', body: 'Manrope' };
  }
  if (s.includes('spa') || s.includes('wellness') || s.includes('yoga') || s.includes('pilates')) {
    return { heading: 'Cormorant Garamond', body: 'DM Sans' };
  }
  // ── Beach / Marina / Outdoor ─────────────────────────────────────────────
  if (s.includes('beach') || s.includes('pool') || s.includes('marina') || s.includes('yacht') || s.includes('boat')) {
    return { heading: 'Syne', body: 'Sora' };
  }
  // ── Fashion / Beauty ─────────────────────────────────────────────────────
  if (s.includes('fashion') || s.includes('moda') || s.includes('boutique') || s.includes('clothing')) {
    return { heading: 'Syne', body: 'Manrope' };
  }
  if (s.includes('beauty') || s.includes('salon') || s.includes('guzellik') || s.includes('nail') || s.includes('barber')) {
    return { heading: 'Fraunces', body: 'DM Sans' };
  }
  // ── Tech / Agency / Professional ─────────────────────────────────────────
  if (s.includes('tech') || s.includes('startup') || s.includes('agency') || s.includes('ajans') || s.includes('co_work')) {
    return { heading: 'Space Grotesk', body: 'DM Sans' };
  }
  if (s.includes('clinic') || s.includes('klinik') || s.includes('medical') || s.includes('dental')) {
    return { heading: 'DM Serif Display', body: 'Manrope' };
  }
  // ── Default: cinematic editorial ─────────────────────────────────────────
  return { heading: 'Fraunces', body: 'Sora' };
}

export function knownFontFamilies(): string[] {
  return Object.keys(GOOGLE_FONT_SPECS);
}

const GENERIC_FONTS = new Set([
  'Montserrat', 'Inter', 'Arial', 'Roboto', 'Open Sans', 'Lato', 'Helvetica',
  'Poppins', 'Raleway', 'Source Sans Pro', 'Nunito', 'Ubuntu',
]);

function cleanFontName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.split(',')[0]?.trim();
  return trimmed || undefined;
}

function isPremiumFont(name: string | undefined): name is string {
  return Boolean(name && !GENERIC_FONTS.has(name));
}

function firstFamilyFromStack(stack: string): string {
  const match = stack.match(/'([^']+)'/);
  return match?.[1] ?? 'Fraunces';
}

/**
 * Resolve heading + body Google Font families for Mission Hub / auto-produce stories.
 * Generic brand fonts (Montserrat, Inter…) are replaced with sector + kit + personality defaults.
 */
export function resolveProductionStoryFonts(input: {
  sector?: string;
  kitHeading?: string;
  kitBody?: string;
  brandHeading?: unknown;
  brandBody?: unknown;
  /** Marka Detayı → Ana Font (brand_context.brand_font_family) */
  brandFontFamily?: string;
  fontPersonality?: FontPersonality | string;
}): { heading: string; body: string } {
  const sectorDefaults = defaultFontsForSector(input.sector ?? '');
  const personality = input.fontPersonality ?? 'brand';

  const ctxFont = cleanFontName(input.brandFontFamily);
  const brandHeading = cleanFontName(input.brandHeading) ?? ctxFont;
  const brandBody = cleanFontName(input.brandBody);
  const kitHeading = cleanFontName(input.kitHeading);
  const kitBody = cleanFontName(input.kitBody);

  // Marka Detayı → Ana Font: always wins over template/sector defaults.
  const headingSeed =
    ctxFont
    ?? (isPremiumFont(brandHeading) ? brandHeading : undefined)
    ?? (isPremiumFont(kitHeading) ? kitHeading : undefined)
    ?? sectorDefaults.heading;

  const bodySeed =
    (isPremiumFont(brandBody) ? brandBody : undefined)
    ?? (isPremiumFont(kitBody) ? kitBody : undefined)
    ?? sectorDefaults.body;

  const honorExplicitBrand = Boolean(ctxFont || (isPremiumFont(brandHeading) && brandHeading));
  const stack = resolveFontStack(personality, headingSeed, bodySeed, { honorExplicitBrand });
  return {
    heading: honorExplicitBrand ? headingSeed! : firstFamilyFromStack(stack.hero),
    body: firstFamilyFromStack(stack.body),
  };
}
