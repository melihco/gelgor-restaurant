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
  'Baloo 2': 'Baloo+2:wght@400;500;600;700;800',
  'Unbounded': 'Unbounded:wght@400;500;600;700;800;900',
  'Plus Jakarta Sans': 'Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400',
  'Nunito': 'Nunito:ital,wght@0,400;0,600;0,700;0,800;1,400',
  'Bricolage Grotesque': 'Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800',
  'Newsreader': 'Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;0,6..72,700;1,6..72,400',

  // ── Premium additions ────────────────────────────────────────────────────────

  /** Trending 2024-26 editorial serif — luxury, hotel, fashion, fine dining */
  'Instrument Serif': 'Instrument+Serif:ital,wght@0,400;1,400',

  /** Magazine-quality readable serif — editorial bodies, campaign captions */
  'Spectral': 'Spectral:ital,wght@0,400;0,500;0,600;0,700;1,400',

  /** Roman capitals — fine dining, luxury events, black-tie occasions */
  'Cinzel': 'Cinzel:wght@400;600;700;900',

  /** Ultra-thin elegant display — haute couture, premium boutique */
  'Italiana': 'Italiana:wght@400',

  /** Condensed impact poster face — nightlife, concerts, festival headliners */
  'Big Shoulders Display': 'Big+Shoulders+Display:wght@400;600;700;800;900',

  /** Geometric fashion sans — fashion brands, clean retail, contemporary studio */
  'Josefin Sans': 'Josefin+Sans:ital,wght@0,300;0,400;0,600;0,700;1,400',

  /** Refined philosophical serif — wellness, spa, holistic, high-end clinic */
  'Philosopher': 'Philosopher:ital,wght@0,400;0,700;1,400',

  /** Expressive display serif — lifestyle, female-skewed brands, editorial blogs */
  'Yeseva One': 'Yeseva+One:wght@400',

  /** Classic vintage display — boutique hotel, bar, heritage brand, brasserie */
  'Forum': 'Forum:wght@400',

  /** Minimal fashion editorial body — runway shows, style editorials, lookbooks */
  'Tenor Sans': 'Tenor+Sans:wght@400',

  /** Sharp modern grotesque — tech-forward brands, creative agencies, startups */
  'Epilogue': 'Epilogue:wght@400;500;700;900',

  /** Techy futuristic condensed — DJ tech, esports, innovation brands */
  'Chakra Petch': 'Chakra+Petch:ital,wght@0,400;0,600;0,700;1,400',
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
      const hero = heroFont(brandFont, 'Big Shoulders Display', { honorExplicitBrand: honor });
      const body = bodyFont || 'Barlow Condensed';
      return {
        hero: stack(hero, 'Big Shoulders Display', 'Anton', 'Archivo Black', 'Oswald', 'Impact', 'sans-serif'),
        body: stack(body, 'Barlow Condensed', 'Oswald', 'Roboto Condensed', 'sans-serif'),
        families: [hero, body, 'Big Shoulders Display', 'Anton', 'Archivo Black'],
      };
    }
    case 'poster_display': {
      // Premium poster quality: editorial serif headline + tight condensed body
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
    case 'graphic_pop': {
      const hero = heroFont(brandFont, 'Baloo 2', { honorExplicitBrand: honor });
      const body = bodyFont || 'Nunito';
      return {
        hero: stack(hero, 'Baloo 2', 'Unbounded', 'Poppins', 'sans-serif'),
        body: stack(body, 'Nunito', 'Plus Jakarta Sans', 'DM Sans', 'sans-serif'),
        families: [hero, body, 'Baloo 2', 'Nunito'],
      };
    }
    case 'neo_grotesk': {
      const hero = heroFont(brandFont, 'Unbounded', { honorExplicitBrand: honor });
      const body = bodyFont || 'Plus Jakarta Sans';
      return {
        hero: stack(hero, 'Unbounded', 'Bricolage Grotesque', 'Space Grotesk', 'sans-serif'),
        body: stack(body, 'Plus Jakarta Sans', 'DM Sans', 'Manrope', 'sans-serif'),
        families: [hero, body, 'Unbounded', 'Plus Jakarta Sans'],
      };
    }
    case 'luxury_serif': {
      const hero = heroFont(brandFont, 'Instrument Serif', { honorExplicitBrand: honor });
      const body = bodyFont || 'Spectral';
      return {
        hero: stack(hero, 'Instrument Serif', 'Newsreader', 'Playfair Display', 'Cormorant Garamond', 'Georgia', 'serif'),
        body: stack(body, 'Spectral', 'Bricolage Grotesque', 'Manrope', 'DM Sans', 'sans-serif'),
        families: [hero, body, 'Instrument Serif', 'Newsreader', 'Spectral'],
      };
    }
    case 'fashion_editorial': {
      // Runway / editorial fashion — refined geometric + minimal body
      const hero = heroFont(brandFont, 'Josefin Sans', { honorExplicitBrand: honor });
      const body = bodyFont || 'Tenor Sans';
      return {
        hero: stack(hero, 'Josefin Sans', 'Italiana', 'Raleway', 'Helvetica Neue', 'sans-serif'),
        body: stack(body, 'Tenor Sans', 'Cormorant Garamond', 'Lora', 'serif'),
        families: [hero, body, 'Josefin Sans', 'Italiana', 'Tenor Sans'],
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
    return { heading: 'Big Shoulders Display', body: 'Barlow Condensed' };
  }
  if (s.includes('concert') || s.includes('festival') || s.includes('music') || s.includes('dj')) {
    return { heading: 'Big Shoulders Display', body: 'Barlow Condensed' };
  }
  // ── Event / Entertainment Venue ─────────────────────────────────────────
  if (s.includes('event') || s.includes('theater') || s.includes('theatre') || s.includes('show') || s.includes('performance')) {
    return { heading: 'Cinzel', body: 'Cormorant Garamond' };
  }
  if (s.includes('entertainment') || s.includes('eğlence') || s.includes('mekan')) {
    return { heading: 'Bodoni Moda', body: 'Barlow Condensed' };
  }
  // ── Luxury / Fine Dining ─────────────────────────────────────────────────
  if (s.includes('fine_dining') || s.includes('steak') || s.includes('wine') || s.includes('gourmet')) {
    return { heading: 'Cinzel', body: 'Spectral' };
  }
  if (s.includes('luxury') || s.includes('premium') || s.includes('lüks')) {
    return { heading: 'Cinzel', body: 'Cormorant Garamond' };
  }
  // ── Restaurant / Cafe ───────────────────────────────────────────────────
  if (s.includes('restaurant') || s.includes('restoran') || s.includes('bistro') || s.includes('brasserie')) {
    return { heading: 'Playfair Display', body: 'Lora' };
  }
  if (s.includes('cafe') || s.includes('kahve') || s.includes('coffee') || s.includes('bakery') || s.includes('patisserie') || s.includes('pastry') || s.includes('brunch')) {
    return { heading: 'Baloo 2', body: 'Nunito' };
  }
  // ── Hotel / Resort / Wellness ────────────────────────────────────────────
  if (s.includes('hotel') || s.includes('resort') || s.includes('boutique_hotel')) {
    return { heading: 'Instrument Serif', body: 'Spectral' };
  }
  if (s.includes('spa') || s.includes('wellness') || s.includes('yoga') || s.includes('pilates')) {
    return { heading: 'Philosopher', body: 'Spectral' };
  }
  // ── Beach / Marina / Outdoor ─────────────────────────────────────────────
  if (s.includes('beach') || s.includes('pool') || s.includes('marina') || s.includes('yacht') || s.includes('boat')) {
    return { heading: 'Syne', body: 'Sora' };
  }
  // ── Fashion / Beauty / Local retail ──────────────────────────────────────
  if (s.includes('barber') || s.includes('berber') || s.includes('kuaför') || s.includes('kuafor')) {
    return { heading: 'Unbounded', body: 'Barlow Condensed' };
  }
  if (s.includes('beauty') || s.includes('salon') || s.includes('guzellik') || s.includes('nail')) {
    return { heading: 'Yeseva One', body: 'Cormorant Garamond' };
  }
  if (s.includes('retail') || s.includes('perakende') || s.includes('boutique')) {
    return { heading: 'Josefin Sans', body: 'Plus Jakarta Sans' };
  }
  if (s.includes('fashion') || s.includes('moda') || s.includes('clothing')) {
    return { heading: 'Josefin Sans', body: 'Tenor Sans' };
  }
  // ── Tech / Agency / Professional ─────────────────────────────────────────
  if (s.includes('tech') || s.includes('startup') || s.includes('agency') || s.includes('ajans') || s.includes('co_work')) {
    return { heading: 'Epilogue', body: 'DM Sans' };
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
