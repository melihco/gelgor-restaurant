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
  /**
   * Found-surface typography — place type on real painted/flat photo regions
   * when available (intensity-aware priority vs invented brand panels).
   */
  foundSurfaceAnchor: string;
}

/**
 * Intensity-aware found-surface typography.
 * Levels 1–2: prefer real photo surfaces over invented scrims/blocks.
 * Levels 3–5: found surface OR intentional brand panel — never both stacked.
 */
export function resolveFoundSurfaceTypographyDirective(
  level: FalDesignIntensityLevel,
): string {
  const surfaces =
    'FOUND SURFACE = real flat photo region (painted wall/door/pillar, awning, menu board, fabric) with readable contrast.';

  switch (level) {
    case 'photo_first':
      return (
        `FOUND-SURFACE TYPOGRAPHY (L1 PRIORITY): ${surfaces} `
        + 'Seat headline INSIDE its bounds/axis (vertical band→vertical stack). '
        + 'Else thin bottom scrim only. NEVER invent a fake painted panel.'
      );
    case 'elegant_light':
      return (
        `FOUND-SURFACE TYPOGRAPHY (L2 PRIORITY): ${surfaces} `
        + 'Prefer found surface over large scrim; keep type inside edges. '
        + 'Fallback: soft scrim. FORBIDDEN: inventing opaque painted blocks.'
      );
    case 'designed':
    case 'bold_editorial':
      return (
        `FOUND-SURFACE TYPOGRAPHY (L4–5 OPTIONAL): ${surfaces} `
        + 'Brand graphic panels OK. If using a found surface, it is the sole text plate — do NOT stack a brand block on it.'
      );
    case 'balanced':
    default:
      return (
        `FOUND-SURFACE TYPOGRAPHY (L3 PREFERRED WHEN CLEAR): ${surfaces} `
        + 'Prefer found surface over floating overlay; else brand panel OR scrim. '
        + 'ONE text plate: found surface XOR brand panel — never both overlapping.'
      );
  }
}

/** Prompt fragments injected into fal designer cards (GPT edit + Ideogram). */
export function resolveFalDesignIntensityDirectives(
  level: FalDesignIntensityLevel,
  mode: 'feed_post' | 'reel',
): FalDesignIntensityDirectives {
  const isVertical = mode === 'reel';
  const foundSurfaceAnchor = resolveFoundSurfaceTypographyDirective(level);

  switch (level) {
    case 'photo_first':
      return {
        priorityBlock:
          '═══ DESIGN INTENSITY: PHOTO-FIRST (level 1/5) ═══ This output must look like a premium gallery photograph with almost NO graphic design. The venue photo is the entire story.',
        photoRules: isVertical
          ? [
            'PHOTO HERO (MAXIMUM): The provided brand photo must fill 88–95% of the frame — full-bleed, edge-to-edge, natural colors unchanged.',
            'Text zone: prefer a found painted/flat surface in the photo; else bottom 8–12% thin scrim — omit text if neither works cleanly.',
          ]
          : [
            'PHOTO FIDELITY (MAXIMUM): Keep 88–95% of the frame as the ORIGINAL photograph — natural colors, exposure, and venue details unchanged.',
            'Text zone: found-surface first; else bottom corner / bottom 10% strip — tiny designed caption, max 5 words.',
          ],
        typographyAnchor:
          'Typography: ONE small tagline max — prefer letterforms seated on a real painted/flat photo surface; else thin translucent bottom scrim. Headline must NOT exceed 8% of frame height.',
        layoutNote:
          'Gallery-first editorial — the photograph IS the post. When type appears, it should feel integrated into a real surface, not glued on.',
        forbiddenLayouts: [
          'FORBIDDEN: top horizontal color band or header block covering more than 12% of frame height.',
          'FORBIDDEN: split-screen, diagonal panels, large solid-color zones, poster layouts, or campaign cards.',
          'FORBIDDEN: headline larger than 8% of frame height or placed in upper half of frame.',
          'FORBIDDEN: recoloring, blurring, or replacing any part of the gallery photograph.',
          'FORBIDDEN: inventing a fake painted panel or solid color plate that was not in the source photo.',
        ],
        foundSurfaceAnchor,
      };
    case 'elegant_light':
      return {
        priorityBlock:
          '═══ DESIGN INTENSITY: ELEGANT / LIGHT (level 2/5) ═══ Premium minimal overlay — photo leads, typography whispers.',
        photoRules: isVertical
          ? [
            'PHOTO HERO: Brand photo fills 72–82% of frame — lower two-thirds full-bleed, natural colors preserved.',
            'Text zone: found painted/flat surface preferred; else bottom 18–28% soft gradient scrim (40–55% opacity) — no solid opaque blocks.',
          ]
          : [
            'CANVAS: Instagram feed 4:5 (1080×1350) — NOT a 9:16 story frame.',
            'PHOTO FIDELITY: Keep 72–82% of the feed frame as the original photograph — crisp, authentic, unfiltered.',
            'Prefer found-surface headline placement; else localized soft gradient scrim in a corner or short lower band — never a tall story header.',
          ],
        typographyAnchor:
          'Headline: medium-small, refined display type — seat it on a found photo surface when available, else translucent scrim. Max 15% frame height. Premium, never loud.',
        layoutNote: isVertical
          ? 'Luxury minimal — generous breathing room; type integrates with real surfaces when present, otherwise whispers on soft scrim.'
          : 'Luxury minimal feed post on 4:5 — photo leads; never compose like a vertical story.',
        forbiddenLayouts: [
          'FORBIDDEN: solid opaque color blocks covering more than 25% of frame.',
          'FORBIDDEN: diagonal split layouts, poster-style upper bands, or neon campaign graphics.',
          ...(isVertical ? [] : ['FORBIDDEN: story-style tall upper panel or 9:16 composition on a 4:5 feed post.']),
          'FORBIDDEN: headline in top half of frame or larger than 15% frame height.',
          'FORBIDDEN: multiple competing text zones or layered graphic shapes.',
          'FORBIDDEN: inventing a fake painted wall/panel to host typography.',
        ],
        foundSurfaceAnchor,
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
            'CANVAS: Instagram feed 4:5 (1080×1350) — NOT a 9:16 story frame.',
            'PHOTO FIDELITY: Keep 45–60% of the feed frame as the ORIGINAL photograph — natural colors only.',
            'Prefer feed-native layouts: left/right editorial split, magazine corner lockup, or a short lower-third band (≤32% height). Avoid tall upper story panels.',
          ],
        typographyAnchor: isVertical
          ? 'Headline: bold designer display type on solid brand-color panel — high contrast, 25–35% frame height, upper zone. Optional: a clear found photo surface may replace the invented panel (one plate only).'
          : 'Headline: bold designer display type on a compact brand-color plate or side column — high contrast, 18–28% of frame height. Feed poster energy, not story stack.',
        layoutNote: isVertical
          ? 'Campaign-ready — clear graphic/text zone vs photo zone. Designer hierarchy, not a photo with a caption.'
          : 'Feed campaign card — designed hierarchy on 4:5. Look like an Instagram feed post, never a cropped story.',
        forbiddenLayouts: isVertical
          ? [
            'FORBIDDEN: photo occupying more than 50% of frame (photo must be supporting strip, not dominant).',
            'FORBIDDEN: tiny corner text on a full-bleed photo — that is level 1–2, not level 4.',
            'FORBIDDEN: random colors — use ONLY brand primary and accent for graphic zones.',
            'FORBIDDEN: stacking a brand color block over a found painted surface that already holds the headline.',
          ]
          : [
            'FORBIDDEN: story-style stacked layout (upper ≥45% solid panel + thin photo strip) on a 4:5 feed post.',
            'FORBIDDEN: rendering a 9:16 story canvas or letterboxing a story into the feed frame.',
            'FORBIDDEN: tiny corner text on a full-bleed photo — that is level 1–2, not level 4.',
            'FORBIDDEN: random colors — use ONLY brand primary and accent for graphic zones.',
            'FORBIDDEN: stacking a brand color block over a found painted surface that already holds the headline.',
          ],
        foundSurfaceAnchor,
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
            'CANVAS: Instagram feed 4:5 (1080×1350) — NOT a 9:16 story frame.',
            'PHOTO FIDELITY: Photo as a supporting accent (28–42%) — natural colors only; prefer side column, inset frame, or short lower band.',
            'Editorial feed poster: oversized headline with magazine-cover energy inside 4:5 — not a vertical story stack.',
          ],
        typographyAnchor: isVertical
          ? 'Headline: OVERSIZED all-caps display type — 35–50% of frame height, stacked lines, poster-level impact. Typography LEADS (brand panel or one found surface — not both).'
          : 'Headline: OVERSIZED display type — 28–40% of the 4:5 frame, stacked lines, magazine-cover impact. Typography leads without turning the post into a 9:16 story.',
        layoutNote: isVertical
          ? 'Bold editorial poster — viewer reads headline first, photo second. Maximum typographic presence.'
          : 'Bold editorial feed post — headline-first on 4:5, photo second. Never mimic Instagram Story proportions.',
        forbiddenLayouts: isVertical
          ? [
            'FORBIDDEN: photo occupying more than 38% of frame.',
            'FORBIDDEN: small or medium headline — must be poster-scale, dominant, upper-zone.',
            'FORBIDDEN: lowercase-only headline — use ALL CAPS or heavy display caps for impact.',
            'FORBIDDEN: balanced 50/50 photo-text split — typography must clearly dominate.',
            'FORBIDDEN: inventing a fake painted wall solely to host type when using a graphic panel layout.',
          ]
          : [
            'FORBIDDEN: story-style upper-panel stack that makes a 4:5 post read as 9:16.',
            'FORBIDDEN: rendering or padding to 9:16 story dimensions.',
            'FORBIDDEN: small or medium headline — must be poster-scale and dominant inside the feed frame.',
            'FORBIDDEN: lowercase-only headline — use ALL CAPS or heavy display caps for impact.',
            'FORBIDDEN: inventing a fake painted wall solely to host type when using a graphic panel layout.',
          ],
        foundSurfaceAnchor,
      };
    case 'balanced':
    default:
      return {
        priorityBlock:
          '═══ DESIGN INTENSITY: BALANCED (level 3/5) ═══ Gallery hero + brand graphic accent — current production standard.',
        photoRules: isVertical
          ? [
            'PHOTO HERO ZONE: Brand photo in lower 52–62% of frame — natural colors, faces, venue details unchanged.',
            'GRAPHIC ZONE: Upper 38–48% — found painted surface if clear, else brand-color panel or rounded badge with headline.',
          ]
          : [
            'CANVAS: Instagram feed 4:5 (1080×1350) — shorter than Stories; do NOT compose like a 9:16 story.',
            'PHOTO FIDELITY (CRITICAL): Keep 55–70% of the feed frame as the ORIGINAL photograph — natural colors unchanged.',
            'Typography placement: found-surface, corner lockup, side caption column, or short bottom scrim (≤28% height) — not a tall upper story band.',
          ],
        typographyAnchor: isVertical
          ? 'Headline on ONE text plate — prefer a clear found photo surface, else brand-color panel in upper zone — crisp, high-contrast, 18–25% frame height.'
          : 'Headline on ONE text plate — found surface, corner badge, or compact brand panel — crisp, high-contrast, 14–22% of the 4:5 frame height.',
        layoutNote: isVertical
          ? 'Balanced editorial — intentional hierarchy: designed text plate + authentic photo zone (found surface preferred when obvious).'
          : 'Balanced Instagram feed editorial on 4:5 — photo-led with a designed accent, never a cropped story layout.',
        forbiddenLayouts: isVertical
          ? [
            'FORBIDDEN: full-bleed photo with tiny corner text (that is level 1).',
            'FORBIDDEN: photo strip smaller than 45% (that is level 4–5).',
            'FORBIDDEN: global photo filters, orange/teal re-grading, or blurring photo pixels.',
            'FORBIDDEN: stacking found-surface type and a brand color panel on the same region.',
          ]
          : [
            'FORBIDDEN: story-style stacked layout (tall upper color band + thin lower photo) on a 4:5 feed post.',
            'FORBIDDEN: outputting or composing for 9:16 story dimensions.',
            'FORBIDDEN: full-bleed photo with tiny corner text (that is level 1).',
            'FORBIDDEN: photo share smaller than 50% (that is level 4–5).',
            'FORBIDDEN: global photo filters, orange/teal re-grading, or blurring photo pixels.',
            'FORBIDDEN: stacking found-surface type and a brand color panel on the same region.',
          ],
        foundSurfaceAnchor,
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

/** @deprecated Use resolveCalendarFalDesignIntensity — kept for backward imports. */
export const CALENDAR_GALLERY_DESIGN_INTENSITY: FalDesignIntensityLevel = 'photo_first';

/**
 * Announcement-type defaults for calendar / enriched ideation fal slots.
 * Sector-agnostic — tenant may still override via brand_theme.fal_design_intensity.
 */
export const CALENDAR_ANNOUNCEMENT_INTENSITY: Record<string, FalDesignIntensityLevel> = {
  product_reveal: 'photo_first',
  venue_showcase: 'photo_first',
  behind_the_scenes: 'photo_first',
  event_teaser: 'elegant_light',
  offer_campaign: 'designed',
  social_proof: 'elegant_light',
};

function normalizeAnnouncementKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * Resolve fal design intensity for a calendar row or calendar-enriched ideation slot.
 * Priority: announcement_type override → brand_theme.fal_design_intensity[channel].
 */
export function resolveCalendarFalDesignIntensity(input: {
  announcementType: string;
  channel: FalDesignChannel;
  brandTheme?: Record<string, unknown> | null;
}): { level: FalDesignIntensityLevel; source: string } {
  const fromTheme = resolveFalDesignIntensityForChannel(input.brandTheme, input.channel);
  const key = normalizeAnnouncementKey(input.announcementType);
  const override = key ? CALENDAR_ANNOUNCEMENT_INTENSITY[key] : undefined;
  if (override) {
    return { level: override, source: `announcement:${key}` };
  }
  return { level: fromTheme, source: `brand_theme.fal_design_intensity.${input.channel}` };
}

/** Extract announcement type from any production idea record (calendar or ideation). */
export function readIdeaAnnouncementType(idea: Record<string, unknown>): string {
  return String(
    idea.calendar_announcement_type
    ?? idea.template_use_case
    ?? idea.announcement_type
    ?? '',
  ).trim();
}

/**
 * Unified intensity resolver for fal pipeline handlers.
 * Explicit override wins; calendar/enriched rows use announcement routing.
 */
export function resolveSlotFalDesignIntensity(input: {
  idea?: Record<string, unknown>;
  channel: FalDesignChannel;
  brandTheme?: Record<string, unknown> | null;
  override?: FalDesignIntensityLevel;
  isCalendarTrack?: boolean;
}): { level: FalDesignIntensityLevel; source: string } {
  if (input.override) {
    return { level: input.override, source: 'explicit_override' };
  }
  const isCalendar = input.isCalendarTrack
    ?? (input.idea ? isCalendarTrackIdea(input.idea) : false);
  if (isCalendar && input.idea) {
    return resolveCalendarFalDesignIntensity({
      announcementType: readIdeaAnnouncementType(input.idea),
      channel: input.channel,
      brandTheme: input.brandTheme,
    });
  }
  return {
    level: resolveFalDesignIntensityForChannel(input.brandTheme, input.channel),
    source: `brand_theme.fal_design_intensity.${input.channel}`,
  };
}

function isCalendarTrackIdea(idea: Record<string, unknown>): boolean {
  if (idea.calendar_enriched === true) return true;
  if (idea.calendar_gallery_designed === true) return true;
  if (typeof idea.calendar_plan_index === 'number') return true;
  if (String(idea.source_track ?? '') === 'calendar') return true;
  if (String(idea.source_node ?? '') === 'content_calendar') return true;
  return false;
}

const PHOTO_FIRST_ARCHETYPES = new Set([
  'cinematic_full_bleed',
  'noir_editorial',
  'polaroid_memory',
  'location_pin_card',
]);

/** Prevent intensity rules from fighting photo-first archetypes (e.g. full-bleed + designed split). */
export function clampDesignIntensityForArchetype(
  level: FalDesignIntensityLevel,
  archetypeId?: string | null,
): FalDesignIntensityLevel {
  if (!archetypeId || !PHOTO_FIRST_ARCHETYPES.has(archetypeId)) return level;
  if (level === 'bold_editorial' || level === 'designed') return 'balanced';
  if (level === 'balanced') return 'elegant_light';
  return level;
}
