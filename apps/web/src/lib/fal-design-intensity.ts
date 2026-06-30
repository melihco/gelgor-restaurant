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
  photoRules: string[];
  typographyAnchor: string;
  layoutNote: string;
}

/** Prompt fragments injected into fal designer cards (GPT edit + Ideogram). */
export function resolveFalDesignIntensityDirectives(
  level: FalDesignIntensityLevel,
  mode: 'feed_post' | 'reel',
): FalDesignIntensityDirectives {
  const isReel = mode === 'reel';

  switch (level) {
    case 'photo_first':
      return {
        photoRules: isReel
          ? [
            'PHOTO HERO (MAXIMUM): Use the provided brand photo for 85–95% of the frame — natural colors unchanged.',
            'Typography: one small, refined caption line only — no large blocks, no heavy scrims.',
          ]
          : [
            'PHOTO FIDELITY (MAXIMUM): Keep 85–95% of the frame as the ORIGINAL photograph — natural colors unchanged.',
            'Typography: minimal corner caption or tiny brand mark only — no poster blocks.',
          ],
        typographyAnchor: 'When text appears: premium designed display letterforms (custom type, subtle panel/scrim) — small footprint but NEVER plain system sans or default white overlay text.',
        layoutNote: 'Editorial restraint — gallery-first, design-second — but still agency-grade social typography.',
      };
    case 'elegant_light':
      return {
        photoRules: isReel
          ? [
            'PHOTO HERO: Use the brand photo for 65–75% of the frame — lower zone, natural colors preserved.',
            'Add a soft gradient scrim behind text only — never global filters on photo pixels.',
          ]
          : [
            'PHOTO FIDELITY: Keep 65–75% of the frame as the original photograph — natural exposure and colors.',
            'Add a localized, soft scrim behind headline only — photo region stays crisp.',
          ],
        typographyAnchor: 'Headline on a subtle translucent panel — refined, premium, never loud.',
        layoutNote: 'Luxury minimal layout — generous negative space, delicate hierarchy.',
      };
    case 'designed':
      return {
        photoRules: isReel
          ? [
            'PHOTO HERO ZONE: Brand photo in lower 35–50% — natural colors, faces, venue unchanged.',
            'Upper zone: strong brand-color graphic panel with bold headline — designer campaign look.',
          ]
          : [
            'PHOTO FIDELITY: Keep 35–50% of the frame as the original photograph — authentic colors.',
            'Compose a strong brand-color block or diagonal panel for headline — campaign poster energy.',
          ],
        typographyAnchor: 'Anchor headline on a solid or diagonal brand-color panel — high contrast, designer-grade.',
        layoutNote: 'Campaign-ready layout — bold hierarchy, intentional color blocks.',
      };
    case 'bold_editorial':
      return {
        photoRules: isReel
          ? [
            'PHOTO ACCENT: Brand photo as a supporting hero strip (25–40% of frame) — never recolor pixels.',
            'Dominant designed zone: oversized typography, layered blocks, maximum editorial impact.',
          ]
          : [
            'PHOTO FIDELITY: Photo occupies 25–40% as a supporting visual — natural colors only.',
            'Editorial poster treatment: oversized headline, layered shapes, maximum typographic presence.',
          ],
        typographyAnchor: 'Oversized headline dominates — layered editorial blocks, poster-level impact.',
        layoutNote: 'Bold editorial poster — typography leads, photo supports.',
      };
    case 'balanced':
    default:
      return {
        photoRules: isReel
          ? [
            'PHOTO HERO ZONE: Use the provided brand photo as the hero visual in the lower 45–55% of the frame — natural colors, faces, and venue details unchanged.',
            'Do NOT blur, replace, or globally recolor the photo. No full-frame cinematic filters on photo pixels.',
          ]
          : [
            'PHOTO FIDELITY (CRITICAL): Keep 50–70% of the frame as the ORIGINAL photograph — natural colors, exposure, people, and venue details unchanged.',
            'Do NOT recolor, blur, replace, or re-render the photo. No full-image orange/teal filters or cinematic re-grading on photo pixels.',
          ],
        typographyAnchor: isReel
          ? 'Anchor the headline on a solid brand-color panel or diagonal block — crisp, high-contrast, designer-grade.'
          : 'Add a localized gradient scrim or solid color block behind text only — keep the photo region crisp and authentic.',
        layoutNote: 'Editorial layout, balanced negative space, intentional hierarchy, social-media-ready.',
      };
  }
}
