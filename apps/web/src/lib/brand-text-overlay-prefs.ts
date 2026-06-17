/**
 * Per-brand text-on-photo preferences (from brand_theme.typography + overlay).
 * Drives poster SVG, Remotion tokens, and canvas compositor intensity.
 */

export type TextOverlayDensity = 'minimal' | 'medium' | 'dense';

export interface BrandTextOverlayPrefs {
  density: TextOverlayDensity;
  /** Scales template heroScale (minimal < 1 < dense). */
  heroScaleMultiplier: number;
  /** Target overlay opacity for gradients / scrims [0–1]. */
  overlayOpacity: number;
  /** Fraction of frame reserved for text (composition hint). */
  textSafeAreaFraction: number;
  /** Prefer bottom strip / panel layouts over center-heavy promo. */
  preferPhotoDominantLayouts: boolean;
  /** Canvas style index for composeBrandPhotoCard (MissionContentFactory). */
  canvasStyleIndex: number;
}

const DENSITY_DEFAULTS: Record<
  TextOverlayDensity,
  Omit<BrandTextOverlayPrefs, 'density' | 'overlayOpacity'> & { overlayOpacity: number }
> = {
  minimal: {
    heroScaleMultiplier: 0.72,
    overlayOpacity: 0.28,
    textSafeAreaFraction: 0.32,
    preferPhotoDominantLayouts: true,
    canvasStyleIndex: 0,
  },
  medium: {
    heroScaleMultiplier: 0.82,
    overlayOpacity: 0.52,
    textSafeAreaFraction: 0.36,
    preferPhotoDominantLayouts: true,
    canvasStyleIndex: 0,
  },
  dense: {
    heroScaleMultiplier: 1.05,
    overlayOpacity: 0.62,
    textSafeAreaFraction: 0.68,
    preferPhotoDominantLayouts: false,
    canvasStyleIndex: 3,
  },
};

function readDensity(theme?: Record<string, unknown> | null): TextOverlayDensity {
  const ty = (theme?.typography ?? theme?.Typography) as Record<string, unknown> | undefined;
  const raw = String(
    ty?.text_overlay_density ?? ty?.textOverlayDensity ?? theme?.text_overlay_density ?? '',
  ).toLowerCase();
  if (raw === 'minimal' || raw === 'light' || raw === 'low') return 'minimal';
  if (raw === 'dense' || raw === 'heavy' || raw === 'high') return 'dense';
  return 'medium';
}

function readOverlayOpacity(fallback: number, theme?: Record<string, unknown> | null): number {
  const ov = (theme?.overlay ?? theme?.Overlay) as Record<string, unknown> | undefined;
  const n = typeof ov?.opacity === 'number'
    ? ov.opacity
    : typeof ov?.opacity === 'string'
      ? parseFloat(ov.opacity)
      : NaN;
  if (!Number.isNaN(n)) return Math.min(0.75, Math.max(0.12, n));
  return fallback;
}

export function resolveTextOverlayPrefs(
  brandTheme?: Record<string, unknown> | null,
): BrandTextOverlayPrefs {
  const density = readDensity(brandTheme);
  const base = DENSITY_DEFAULTS[density];
  const overlayOpacity = readOverlayOpacity(base.overlayOpacity, brandTheme);
  const comp = (brandTheme?.composition ?? brandTheme?.Composition) as Record<string, unknown> | undefined;
  const safeFrac = typeof comp?.text_safe_area_fraction === 'number'
    ? comp.text_safe_area_fraction
    : typeof comp?.textSafeAreaFraction === 'number'
      ? comp.textSafeAreaFraction
      : base.textSafeAreaFraction;

  return {
    density,
    heroScaleMultiplier: base.heroScaleMultiplier,
    overlayOpacity,
    textSafeAreaFraction: Math.min(0.75, Math.max(0.22, safeFrac)),
    preferPhotoDominantLayouts: base.preferPhotoDominantLayouts,
    canvasStyleIndex: base.canvasStyleIndex,
  };
}

const CENTER_HEAVY_FAMILIES = new Set([
  'cinematic_center',
  'bold_impact',
  'vibe_fullscreen',
  'neon_night',
]);

/** Remotion SpecStory — fotoğrafı kapatmadan metni alt banda taşır. */
export function buildBrandTextOverlayLayoutPatch(
  spec: {
    family?: string;
    textZone?: string;
    gradientStart?: number;
    gradientEnd?: number;
    overlayOpacity?: number;
    heroScale?: number;
    heroWeight?: number;
    frostedCard?: boolean;
    vignette?: string;
    align?: string;
  },
  brandTheme?: Record<string, unknown> | null,
): Record<string, unknown> {
  const prefs = resolveTextOverlayPrefs(brandTheme);
  const centerHeavy =
    spec.textZone === 'center'
    || CENTER_HEAVY_FAMILIES.has(String(spec.family ?? ''));

  const patch: Record<string, unknown> = {
    overlayOpacity: Math.max(
      Number(spec.overlayOpacity ?? 0.5),
      prefs.overlayOpacity,
    ),
    heroScale: Number(spec.heroScale ?? 1) * prefs.heroScaleMultiplier,
    gradientStart: Math.max(Number(spec.gradientStart ?? 0.45), 0.48),
    gradientEnd: Math.max(Number(spec.gradientEnd ?? 0.82), 0.88),
  };

  if (prefs.density === 'dense' && !prefs.preferPhotoDominantLayouts) {
    return patch;
  }

  if (!centerHeavy && !prefs.preferPhotoDominantLayouts) {
    return patch;
  }

  // Fotoğraf önde: metin alt şerit / panel — ürün ve araç görünür kalır
  return {
    ...patch,
    family: CENTER_HEAVY_FAMILIES.has(String(spec.family ?? ''))
      ? 'editorial_bottom'
      : spec.family,
    textZone: 'bottom_center',
    align: 'center',
    gradientStart: Math.max(0.55, Number(spec.gradientStart ?? 0.45)),
    gradientEnd: Math.max(0.9, Number(spec.gradientEnd ?? 0.82)),
    overlayOpacity: Math.max(patch.overlayOpacity as number, 0.58),
    frostedCard: Boolean(spec.frostedCard),
    vignette: spec.vignette === 'none' ? 'soft' : spec.vignette,
    heroWeight: Math.max(Number(spec.heroWeight ?? 700), 800),
  };
}

export const DENSITY_LABELS_TR: Record<TextOverlayDensity, { title: string; hint: string }> = {
  minimal: {
    title: 'Min',
    hint: 'Ürün/fotoğraf önde — metin altta ince şerit',
  },
  medium: {
    title: 'Orta',
    hint: 'Dengeli kampanya görünümü',
  },
  dense: {
    title: 'Yoğun',
    hint: 'Büyük başlık, güçlü overlay',
  },
};
