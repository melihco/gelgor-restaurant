/**
 * fal.ai tasarım yoğunluğu — story / reel / post kanalları için 5 seviye.
 * Persisted: brand_theme.fal_design_intensity (JSONB)
 */

export type FalDesignIntensityLevel =
  | 'photo_first'
  | 'elegant_light'
  | 'balanced'
  | 'designed'
  | 'bold_editorial';

export type FalDesignChannel = 'story' | 'reel' | 'post';

export interface BrandFalDesignIntensityConfig {
  story?: FalDesignIntensityLevel;
  reel?: FalDesignIntensityLevel;
  post?: FalDesignIntensityLevel;
}

export const FAL_DESIGN_INTENSITY_LEVELS: FalDesignIntensityLevel[] = [
  'photo_first',
  'elegant_light',
  'balanced',
  'designed',
  'bold_editorial',
];

export const FAL_DESIGN_INTENSITY_LABELS: Record<
  FalDesignIntensityLevel,
  { tr: string; desc: string; level: number }
> = {
  photo_first: {
    tr: 'Fotoğraf öncelikli',
    desc: 'Neredeyse ham galeri — minimal overlay',
    level: 1,
  },
  elegant_light: {
    tr: 'Zarif / hafif',
    desc: 'İnce scrim, küçük headline — premium sade',
    level: 2,
  },
  balanced: {
    tr: 'Dengeli',
    desc: 'Galeri hero + marka renkli blok — mevcut standart',
    level: 3,
  },
  designed: {
    tr: 'Tasarlanmış',
    desc: 'Güçlü tipografi ve renk blokları — kampanya görünümü',
    level: 4,
  },
  bold_editorial: {
    tr: 'Cesur editoryal',
    desc: 'Maksimum tipografi yoğunluğu — poster etkisi',
    level: 5,
  },
};

export const FAL_DESIGN_CHANNEL_LABELS: Record<FalDesignChannel, string> = {
  story: 'Story',
  reel: 'Reels',
  post: 'Post',
};

function readThemeRecord(
  theme: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return theme && typeof theme === 'object' ? theme : {};
}

function mapLegacyTextOverlayDensity(
  density: string | undefined,
): FalDesignIntensityLevel | undefined {
  if (density === 'minimal') return 'elegant_light';
  if (density === 'dense') return 'bold_editorial';
  if (density === 'medium') return 'balanced';
  return undefined;
}

/** Resolve per-channel intensity with backward-compatible defaults. */
export function resolveFalDesignIntensityConfig(
  theme: Record<string, unknown> | null | undefined,
): Required<BrandFalDesignIntensityConfig> {
  const t = readThemeRecord(theme);
  const raw = (t.fal_design_intensity ?? t.falDesignIntensity) as
    Partial<BrandFalDesignIntensityConfig> | undefined;

  const typography = (t.typography ?? t.Typography) as Record<string, unknown> | undefined;
  const legacyLevel = mapLegacyTextOverlayDensity(
    String(typography?.text_overlay_density ?? typography?.textOverlayDensity ?? ''),
  );

  const fallback = legacyLevel ?? 'balanced';
  return {
    story: raw?.story ?? fallback,
    reel: raw?.reel ?? fallback,
    post: raw?.post ?? fallback,
  };
}

export function resolveFalDesignIntensityForChannel(
  theme: Record<string, unknown> | null | undefined,
  channel: FalDesignChannel,
): FalDesignIntensityLevel {
  const cfg = resolveFalDesignIntensityConfig(theme);
  return cfg[channel];
}

export interface FalDesignIntensityDirectives {
  /** Injected near top of prompt — overrides sector defaults. */
  priorityBlock: string;
  photoRules: string[];
  typographyAnchor: string;
  layoutNote: string;
  /** Hard layout prohibitions for this level. */
  forbiddenLayouts: string[];
}

/** Prompt fragments injected into fal designer cards (GPT edit + Ideogram). */
export function resolveFalDesignIntensityDirectives(
  level: FalDesignIntensityLevel,
  mode: 'feed_post' | 'reel',
): FalDesignIntensityDirectives {
  const isVertical = mode === 'reel';

  switch (level) {
    case 'photo_first':
      return {
        priorityBlock:
          '═══ DESIGN INTENSITY: PHOTO-FIRST (level 1/5) ═══ This output must look like a premium gallery photograph with almost NO graphic design. The venue photo is the entire story.',
        photoRules: isVertical
          ? [
            'PHOTO HERO (MAXIMUM): The provided brand photo must fill 88–95% of the frame — full-bleed, edge-to-edge, natural colors unchanged.',
            'Text zone: bottom 8–12% ONLY — one small refined caption line OR omit text entirely. Photo pixels above that line stay 100% untouched.',
          ]
          : [
            'PHOTO FIDELITY (MAXIMUM): Keep 88–95% of the frame as the ORIGINAL photograph — natural colors, exposure, and venue details unchanged.',
            'Text zone: bottom corner or bottom 10% strip only — tiny designed caption, max 5 words.',
          ],
        typographyAnchor:
          'Typography: ONE small tagline max — refined custom letterforms on a thin translucent scrim at the bottom edge only. Headline must NOT exceed 8% of frame height.',
        layoutNote:
          'Gallery-first editorial — the photograph IS the post. Design is invisible; restraint is luxury.',
        forbiddenLayouts: [
          'FORBIDDEN: top horizontal color band or header block covering more than 12% of frame height.',
          'FORBIDDEN: split-screen, diagonal panels, large solid-color zones, poster layouts, or campaign cards.',
          'FORBIDDEN: headline larger than 8% of frame height or placed in upper half of frame.',
          'FORBIDDEN: recoloring, blurring, or replacing any part of the gallery photograph.',
        ],
      };
    case 'elegant_light':
      return {
        priorityBlock:
          '═══ DESIGN INTENSITY: ELEGANT / LIGHT (level 2/5) ═══ Premium minimal overlay — photo leads, typography whispers.',
        photoRules: isVertical
          ? [
            'PHOTO HERO: Brand photo fills 72–82% of frame — lower two-thirds full-bleed, natural colors preserved.',
            'Text zone: bottom 18–28% — soft gradient scrim (40–55% opacity) behind headline ONLY. No solid opaque blocks.',
          ]
          : [
            'PHOTO FIDELITY: Keep 72–82% of the frame as the original photograph — crisp, authentic, unfiltered.',
            'Add a localized soft gradient scrim in the lower third behind text — photo upper region stays fully visible.',
          ],
        typographyAnchor:
          'Headline: medium-small, refined display type on translucent scrim — max 15% frame height, bottom-aligned. Premium, never loud.',
        layoutNote:
          'Luxury minimal — generous breathing room, delicate hierarchy, photo always wins over graphics.',
        forbiddenLayouts: [
          'FORBIDDEN: solid opaque color blocks covering more than 25% of frame.',
          'FORBIDDEN: diagonal split layouts, poster-style upper bands, or neon campaign graphics.',
          'FORBIDDEN: headline in top half of frame or larger than 15% frame height.',
          'FORBIDDEN: multiple competing text zones or layered graphic shapes.',
        ],
      };
    case 'designed':
      return {
        priorityBlock:
          '═══ DESIGN INTENSITY: DESIGNED / CAMPAIGN (level 4/5) ═══ Strong designer layout — brand-color graphic zone + photo hero strip.',
        photoRules: isVertical
          ? [
            'PHOTO ZONE: Brand photo in lower 38–48% of frame — natural colors, venue unchanged, full width.',
            'DESIGN ZONE: Upper 52–62% — solid brand-color panel with bold headline, shapes, and campaign energy.',
          ]
          : [
            'PHOTO FIDELITY: Photo occupies lower 38–48% — authentic colors only.',
            'Upper zone: strong brand-color block or diagonal panel with bold headline — intentional campaign poster composition.',
          ],
        typographyAnchor:
          'Headline: bold designer display type on solid brand-color panel — high contrast, 25–35% frame height, upper zone.',
        layoutNote:
          'Campaign-ready — clear graphic/text zone vs photo zone. Designer hierarchy, not a photo with a caption.',
        forbiddenLayouts: [
          'FORBIDDEN: photo occupying more than 50% of frame (photo must be supporting strip, not dominant).',
          'FORBIDDEN: tiny corner text on a full-bleed photo — that is level 1–2, not level 4.',
          'FORBIDDEN: random colors — use ONLY brand primary and accent for graphic zones.',
        ],
      };
    case 'bold_editorial':
      return {
        priorityBlock:
          '═══ DESIGN INTENSITY: BOLD EDITORIAL (level 5/5) ═══ Poster-first — typography dominates, photo is accent.',
        photoRules: isVertical
          ? [
            'PHOTO ACCENT: Brand photo as a supporting strip in lower 22–35% of frame — natural colors, never recolored.',
            'EDITORIAL ZONE: Upper 65–78% — oversized ALL-CAPS headline, layered brand-color blocks, maximum typographic impact.',
          ]
          : [
            'PHOTO FIDELITY: Photo occupies 22–35% as supporting visual strip — natural colors only.',
            'Editorial poster: oversized headline fills upper zone, layered shapes, magazine-cover energy.',
          ],
        typographyAnchor:
          'Headline: OVERSIZED all-caps display type — 35–50% of frame height, stacked lines, poster-level impact. Typography LEADS.',
        layoutNote:
          'Bold editorial poster — viewer reads headline first, photo second. Maximum typographic presence.',
        forbiddenLayouts: [
          'FORBIDDEN: photo occupying more than 38% of frame.',
          'FORBIDDEN: small or medium headline — must be poster-scale, dominant, upper-zone.',
          'FORBIDDEN: lowercase-only headline — use ALL CAPS or heavy display caps for impact.',
          'FORBIDDEN: balanced 50/50 photo-text split — typography must clearly dominate.',
        ],
      };
    case 'balanced':
    default:
      return {
        priorityBlock:
          '═══ DESIGN INTENSITY: BALANCED (level 3/5) ═══ Gallery hero + brand graphic accent — current production standard.',
        photoRules: isVertical
          ? [
            'PHOTO HERO ZONE: Brand photo in lower 52–62% of frame — natural colors, faces, venue details unchanged.',
            'GRAPHIC ZONE: Upper 38–48% — brand-color panel or rounded badge with headline. Clear zone separation.',
          ]
          : [
            'PHOTO FIDELITY (CRITICAL): Keep 52–62% of the frame as the ORIGINAL photograph — natural colors unchanged.',
            'Upper zone: localized brand-color block or gradient scrim for headline — photo lower zone stays crisp.',
          ],
        typographyAnchor:
          'Headline on brand-color panel in upper zone — crisp, high-contrast, 18–25% frame height. Photo and design zones clearly separated.',
        layoutNote:
          'Balanced editorial — intentional hierarchy: designed upper zone + authentic photo lower zone.',
        forbiddenLayouts: [
          'FORBIDDEN: full-bleed photo with tiny corner text (that is level 1).',
          'FORBIDDEN: photo strip smaller than 45% (that is level 4–5).',
          'FORBIDDEN: global photo filters, orange/teal re-grading, or blurring photo pixels.',
        ],
      };
  }
}

/** Vertical 9:16 story/reel uses reel layout rules (lower photo zone). */
export function resolveFalDesignIntensityMode(
  aspectRatio: string | undefined,
  isReel: boolean,
): 'feed_post' | 'reel' {
  if (isReel || aspectRatio === '9:16') return 'reel';
  return 'feed_post';
}
