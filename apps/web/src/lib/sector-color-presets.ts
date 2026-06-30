/**
 * Sektör bazlı marka renk paletleri — story/post Remotion üretiminde varsayılan.
 * Marka Anayasası palet seçici + resolveBrandProductionTokens waterfall ile uyumlu.
 */
export interface BrandColorPalette {
  primary: string;
  accent: string;
  neutral: string;
  shadow: string;
  labelTr: string;
}

export const DEFAULT_BRAND_PALETTE: BrandColorPalette = {
  primary: '#1a2b4a',
  accent: '#c9a96e',
  neutral: '#f5f0e8',
  shadow: '#0a0a0f',
  labelTr: 'Ajans varsayılan',
};

const SECTOR_PALETTES: Record<string, BrandColorPalette> = {
  beach_club: {
    primary: '#1a2b4a',
    accent: '#f5a25d',
    neutral: '#f3f1e7',
    shadow: '#0d1b2a',
    labelTr: 'Beach & Deniz',
  },
  hotel_resort: {
    primary: '#1c1917',
    accent: '#d4a574',
    neutral: '#fafaf9',
    shadow: '#0f0e0d',
    labelTr: 'Otel & Resort',
  },
  fine_dining: {
    primary: '#1a1a1a',
    accent: '#c9a96e',
    neutral: '#f5f0e8',
    shadow: '#000000',
    labelTr: 'Fine Dining',
  },
  restaurant: {
    primary: '#212529',
    accent: '#ffc107',
    neutral: '#fff8e7',
    shadow: '#111111',
    labelTr: 'Restoran',
  },
  cafe_bakery: {
    primary: '#292524',
    accent: '#fcd34d',
    neutral: '#fffbeb',
    shadow: '#1c1917',
    labelTr: 'Kafe & Fırın',
  },
  coffee_shop: {
    primary: '#292524',
    accent: '#d4a574',
    neutral: '#faf7f2',
    shadow: '#1a1512',
    labelTr: 'Coffee Shop',
  },
  nightclub: {
    primary: '#0d1117',
    accent: '#e8c547',
    neutral: '#ffffff',
    shadow: '#000000',
    labelTr: 'Gece & Club',
  },
  rooftop_bar: {
    primary: '#0c4a6e',
    accent: '#38bdf8',
    neutral: '#f0f9ff',
    shadow: '#082f49',
    labelTr: 'Rooftop Bar',
  },
  beauty_salon: {
    primary: '#1a1218',
    accent: '#e8b4b8',
    neutral: '#fdf2f8',
    shadow: '#0f0a0d',
    labelTr: 'Güzellik Salonu',
  },
  barber_salon: {
    primary: '#0d1117',
    accent: '#e8c547',
    neutral: '#f5f5f5',
    shadow: '#000000',
    labelTr: 'Berber & Kuaför',
  },
  wellness_spa: {
    primary: '#134e4a',
    accent: '#86efac',
    neutral: '#ecfdf5',
    shadow: '#042f2e',
    labelTr: 'Spa & Wellness',
  },
  fashion_retail: {
    primary: '#18181b',
    accent: '#a78bfa',
    neutral: '#faf5ff',
    shadow: '#0f0f12',
    labelTr: 'Moda & Perakende',
  },
  retail: {
    primary: '#1c1917',
    accent: '#d4a574',
    neutral: '#fafaf9',
    shadow: '#0f0e0d',
    labelTr: 'Perakende',
  },
  fitness: {
    primary: '#14532d',
    accent: '#4ade80',
    neutral: '#f0fdf4',
    shadow: '#052e16',
    labelTr: 'Fitness',
  },
  real_estate: {
    primary: '#1e3a5f',
    accent: '#60a5fa',
    neutral: '#eff6ff',
    shadow: '#0f172a',
    labelTr: 'Gayrimenkul',
  },
  moving_logistics: {
    primary: '#1a2b4a',
    accent: '#38bdf8',
    neutral: '#f0f9ff',
    shadow: '#0c1929',
    labelTr: 'Nakliyat',
  },
};

const SECTOR_ALIASES: Array<{ match: RegExp; key: string }> = [
  { match: /beach|deniz|marina|yacht/i, key: 'beach_club' },
  { match: /hotel|resort|otel|konak/i, key: 'hotel_resort' },
  { match: /fine.?dining|gourmet|steak|wine_bar/i, key: 'fine_dining' },
  { match: /restaurant|restoran|bistro|brasserie/i, key: 'restaurant' },
  { match: /coffee|kahve|kafe|cafe|roast|espresso|latte/i, key: 'coffee_shop' },
  { match: /bakery|patisserie|fırın|firin|pastry|brunch/i, key: 'cafe_bakery' },
  { match: /night|club|disco|dj|gece/i, key: 'nightclub' },
  { match: /rooftop|skyline|cocktail/i, key: 'rooftop_bar' },
  { match: /beauty|güzellik|guzellik|salon|nail|estetik|cilt/i, key: 'beauty_salon' },
  { match: /barber|berber|kuaför|kuafor|hair/i, key: 'barber_salon' },
  { match: /spa|wellness|yoga|pilates/i, key: 'wellness_spa' },
  { match: /fashion|moda|boutique|giyim|butik/i, key: 'fashion_retail' },
  { match: /retail|perakende|mağaza|magaza|ecommerce/i, key: 'retail' },
  { match: /fitness|gym|spor/i, key: 'fitness' },
  { match: /real.?estate|gayrimenkul|emlak/i, key: 'real_estate' },
  { match: /nakliyat|nakliye|moving|logistics|lojistik/i, key: 'moving_logistics' },
];

export function resolveSectorPaletteKey(sector: string): string | null {
  const raw = sector.trim();
  if (!raw) return null;
  const norm = raw.toLowerCase().replace(/[\s-]+/g, '_');
  if (norm in SECTOR_PALETTES) return norm;
  for (const { match, key } of SECTOR_ALIASES) {
    if (match.test(raw) || match.test(norm)) return key;
  }
  return null;
}

export function resolveSectorColorPreset(sector: string): BrandColorPalette {
  const key = resolveSectorPaletteKey(sector);
  if (key && SECTOR_PALETTES[key]) return SECTOR_PALETTES[key]!;
  return DEFAULT_BRAND_PALETTE;
}

/** Sektör + popüler alternatifler — palet seçici chip listesi */
export function listPaletteOptionsForSector(sector: string): BrandColorPalette[] {
  const primary = resolveSectorColorPreset(sector);
  const keys = new Set<string>();
  const out: BrandColorPalette[] = [];

  const push = (p: BrandColorPalette, key?: string) => {
    const id = key ?? `${p.primary}-${p.accent}`;
    if (keys.has(id)) return;
    keys.add(id);
    out.push(p);
  };

  push(primary, resolveSectorPaletteKey(sector) ?? 'default');
  push(DEFAULT_BRAND_PALETTE, 'default');

  for (const k of ['hotel_resort', 'beach_club', 'nightclub', 'beauty_salon', 'coffee_shop']) {
    if (SECTOR_PALETTES[k]) push(SECTOR_PALETTES[k]!, k);
  }

  return out.slice(0, 6);
}

export function parseHexList(value: string): string[] {
  return [...value.matchAll(/#[0-9a-fA-F]{3,8}\b/gi)].map((m) => m[0]);
}

export function paletteFromProfileFields(input: {
  brandColors?: string;
  accentColors?: string;
  brandPrimary?: string;
  brandAccent?: string;
  themePalette?: Partial<BrandColorPalette> | null;
}): BrandColorPalette {
  const fromTheme = input.themePalette;
  if (fromTheme?.primary && fromTheme?.accent) {
    return {
      primary: fromTheme.primary,
      accent: fromTheme.accent,
      neutral: fromTheme.neutral ?? DEFAULT_BRAND_PALETTE.neutral,
      shadow: fromTheme.shadow ?? DEFAULT_BRAND_PALETTE.shadow,
      labelTr: 'Kayıtlı palet',
    };
  }

  const hexes = parseHexList(input.brandColors ?? '');
  const accentHex = parseHexList(input.accentColors ?? '')[0]
    ?? input.brandAccent
    ?? hexes[1];

  return {
    primary: hexes[0] ?? input.brandPrimary ?? DEFAULT_BRAND_PALETTE.primary,
    accent: accentHex ?? DEFAULT_BRAND_PALETTE.accent,
    neutral: hexes[2] ?? DEFAULT_BRAND_PALETTE.neutral,
    shadow: hexes[3] ?? DEFAULT_BRAND_PALETTE.shadow,
    labelTr: 'Marka renkleri',
  };
}
