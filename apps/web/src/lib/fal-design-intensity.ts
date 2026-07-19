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
    desc: 'Fotoğraf odaklı modern editorial — scrim / found-surface / köşe tipografi',
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

  const fallback = legacyLevel ?? 'elegant_light';
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

/** Rank for clamp/ceiling — higher = more graphic energy. */
export const FAL_DESIGN_INTENSITY_RANK: Record<FalDesignIntensityLevel, number> = {
  photo_first: 1,
  elegant_light: 2,
  balanced: 3,
  designed: 4,
  bold_editorial: 5,
};

/**
 * Brand channel intensity as a ceiling: slot may propose higher energy, but never above brand.
 * Does not raise below-ceiling proposals (photo_first under elegant_light stays photo_first).
 */
export function clampDesignIntensityToCeiling(
  proposed: FalDesignIntensityLevel,
  ceiling: FalDesignIntensityLevel,
): FalDesignIntensityLevel {
  if (FAL_DESIGN_INTENSITY_RANK[proposed] <= FAL_DESIGN_INTENSITY_RANK[ceiling]) {
    return proposed;
  }
  return ceiling;
}

/**
 * Brand Hub "Tasarım yoğunluğu" ceiling for a channel.
 * Prefers fal_template_production.intensity (panel SSOT), else fal_design_intensity.
 */
export function resolveBrandDesignIntensityCeiling(
  theme: Record<string, unknown> | null | undefined,
  channel: FalDesignChannel,
): FalDesignIntensityLevel {
  const t = readThemeRecord(theme);
  const ftp = (t.fal_template_production ?? t.falTemplateProduction) as
    | { intensity?: Partial<BrandFalDesignIntensityConfig> }
    | undefined;
  const fromPanel = ftp?.intensity?.[channel];
  if (fromPanel && FAL_DESIGN_INTENSITY_LEVELS.includes(fromPanel)) {
    return fromPanel;
  }
  return resolveFalDesignIntensityForChannel(theme, channel);
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
        `CRAFT-ZONE TYPOGRAPHY (L4–5): Place type only inside painted craft zones (plate/rail/L/mat/scrim). `
        + 'Do not seat headlines on glassware/faces inside the photo window. Small accent shapes OK; FORBIDDEN: full-width opaque paint slabs that crush the photo window.'
      );
    case 'balanced':
    default:
      return (
        `CRAFT-ZONE TYPOGRAPHY (L3): Place type inside a light brand panel/scrim reserved before the photo window. `
        + `${surfaces} Only use a found surface if it sits inside the reserved craft zone — never type over the photo hero. `
        + 'ONE text plate; never paint over glassware/faces.'
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
          '═══ DESIGN INTENSITY: DESIGNED (level 4/5) ═══ REQUIRED graphic craft system — paint craft+type first, then contain the gallery photo in the leftover window. If the frame is only a photo with floating text, FAIL (that is level 1–2).',
        photoRules: isVertical
          ? [
            'COMPOSE: Paint craft zones + type first; photo window second (~55–75% of frame) with the FULL gallery photo contained — natural colors, venue unchanged.',
            'GRAPHIC SYSTEM (REQUIRED): corner plate, side rail, L-accent, diagonal soft cut, inset mat, or thin rule system — type lives only inside these zones.',
            'LAYOUT FAMILIES (pick ONE): asymmetric_corner_plate | magazine_cover_overlap | diagonal_soft_cut | side_rail_frame | l_shape_accent | inset_photo_frame — NEVER horizontal paint sandwich (solid header + photo + solid footer).',
          ]
          : [
            'CANVAS: Instagram feed 4:5 (1080×1350) — NOT a 9:16 story frame.',
            'COMPOSE: Paint craft zones + type first; contain the FULL gallery photo in the leftover window (~50–70%) — never paint over glassware/faces/product.',
            'GRAPHIC SYSTEM (REQUIRED): side rail, soft editorial split, corner plate, inset frame, or rule system. Floating centered text on full-bleed photo = FAIL.',
            'LAYOUT FAMILIES (pick ONE): magazine_cover_overlap | editorial_split_soft | side_rail_frame | asymmetric_corner_plate | inset_photo_frame — no tall opaque story headers.',
          ],
        typographyAnchor: isVertical
          ? 'Headline: bold custom-feel display locked into the craft zones — 18–28% frame height, asymmetric/magazine placement, high contrast — never on the photo window.'
          : 'Headline: bold designer display inside the craft zones — 16–24% frame height. Feed craft, not story sandwich.',
        layoutNote: isVertical
          ? 'Designed = boutique agency Story with a real layout system. Reject both Canva sandwiches AND plain photo+caption.'
          : 'Designed feed = intentional graphic hierarchy on 4:5. Reject Canva paint stacks AND plain photo+caption.',
        forbiddenLayouts: isVertical
          ? [
            'FORBIDDEN: photo + floating text only (no graphic system).',
            'FORBIDDEN: painting opaque plates over a full-bleed photo hero (glassware/faces covered).',
            'FORBIDDEN: horizontal sandwich — opaque header + photo + opaque footer/brand bar.',
            'FORBIDDEN: solid opaque block ≥35% used only to host centered white sans.',
            'FORBIDDEN: random off-brand colors — accents only from brand primary/accent.',
          ]
          : [
            'FORBIDDEN: photo + floating text only (no graphic system).',
            'FORBIDDEN: painting opaque plates over a full-bleed photo hero (glassware/faces covered).',
            'FORBIDDEN: story-style stacked layout (upper ≥40% solid panel + thin photo) on 4:5.',
            'FORBIDDEN: solid opaque header/footer bands as the primary composition.',
            'FORBIDDEN: random off-brand colors — accents only from brand primary/accent.',
          ],
        foundSurfaceAnchor,
      };
    case 'bold_editorial':
      return {
        priorityBlock:
          '═══ DESIGN INTENSITY: BOLD EDITORIAL (level 5/5) ═══ Magazine-cover craft — oversized type leads in reserved craft zones; contain the gallery photo in the leftover window (not a thin strip under a full-width paint brick).',
        photoRules: isVertical
          ? [
            'COMPOSE: Paint oversized type zones + accents first; contain the FULL gallery photo in the remaining window (~55–75%) — natural colors.',
            'LAYOUT FAMILIES (pick ONE): magazine_cover_overlap | diagonal_soft_cut | side_rail_frame | l_shape_accent | inset_photo_frame — NEVER opaque header/footer sandwich.',
            'Graphic accents: large type plates, thin bars, small color chips — not full-width paint slabs ≥40% that crush the photo window.',
          ]
          : [
            'CANVAS: Instagram feed 4:5 (1080×1350) — NOT a 9:16 story frame.',
            'COMPOSE: Oversized type in reserved craft zones; contain the FULL gallery photo in the leftover window (~50–70%) — natural colors.',
            'Editorial feed poster: magazine-cover energy inside 4:5 — not a vertical story paint stack.',
          ],
        typographyAnchor: isVertical
          ? 'Headline: OVERSIZED display (ALL CAPS or heavy display) — 28–42% frame height, stacked optical lines fully inside craft zones. Type leads; never cover the photo window.'
          : 'Headline: OVERSIZED display — 24–36% of the 4:5 frame, stacked lines inside craft zones; photo window stays clear.',
        layoutNote: isVertical
          ? 'Bold editorial = type-first magazine Story. Viewer reads headline in the craft system beside a contained photo window.'
          : 'Bold editorial feed — headline-first craft zones on 4:5 with a clear photo window, never mimic Instagram Story paint proportions.',
        forbiddenLayouts: isVertical
          ? [
            'FORBIDDEN: opaque header/footer sandwich with photo trapped in the middle.',
            'FORBIDDEN: solid paint slab ≥40% of frame as the only place for the headline.',
            'FORBIDDEN: painting oversized type over glassware/faces on a full-bleed underlay.',
            'FORBIDDEN: small or timid headline — must feel poster-scale.',
            'FORBIDDEN: lowercase-only timid UI type — use ALL CAPS or heavy display for impact.',
            'FORBIDDEN: shrinking the photo to a thin strip under a painted block.',
          ]
          : [
            'FORBIDDEN: story-style upper-panel stack that makes a 4:5 post read as 9:16.',
            'FORBIDDEN: rendering or padding to 9:16 story dimensions.',
            'FORBIDDEN: solid opaque header/footer sandwich as the composition.',
            'FORBIDDEN: painting oversized type over glassware/faces on a full-bleed underlay.',
            'FORBIDDEN: small or timid headline — must feel poster-scale.',
            'FORBIDDEN: lowercase-only timid UI type — use ALL CAPS or heavy display for impact.',
          ],
        foundSurfaceAnchor,
      };
    case 'balanced':
    default:
      return {
        priorityBlock:
          '═══ DESIGN INTENSITY: BALANCED (level 3/5) ═══ Modern editorial WITH craft — light graphic zones first, gallery photo contained in the leftover window. Plain photo+caption = FAIL.',
        photoRules: isVertical
          ? [
            'COMPOSE: Light craft zones + type first; contain the FULL gallery photo in the leftover window (~62–80%) — natural colors unchanged.',
            'CRAFT (REQUIRED, light): soft scrim plate, asymmetric corner accent (<20%), OR thin brand-color rules — pick ONE layout family.',
            'LAYOUT FAMILIES (pick ONE): corner_lockup | soft_scrim_plate | type_with_brand_rules | asymmetric_corner_plate | editorial_split_soft — NOT a solid upper color band sandwich.',
          ]
          : [
            'CANVAS: Instagram feed 4:5 (1080×1350) — do NOT compose like a 9:16 story.',
            'COMPOSE: Light craft zones + type first; contain the FULL gallery photo in the leftover window (~60–78%) — natural colors.',
            'CRAFT (REQUIRED, light): corner lockup, soft scrim plate, editorial soft split, or brand rules — not floating center caption alone.',
            'LAYOUT FAMILIES (pick ONE): corner_lockup | soft_scrim_plate | editorial_split_soft | type_with_brand_rules — never a tall opaque header stack.',
          ],
        typographyAnchor: isVertical
          ? 'Headline: refined display in the craft lockup — 14–22% frame height; high contrast; not timid watermark text.'
          : 'Headline: refined display in the craft lockup — 12–20% of the 4:5 frame; compact accent — not a painted header block.',
        layoutNote: isVertical
          ? 'Balanced = photo-led editorial with a designed accent system. Reject Canva sandwiches AND bare photo+text.'
          : 'Balanced feed editorial on 4:5 — photo-led craft, never cropped story paint stack or bare caption overlay.',
        forbiddenLayouts: isVertical
          ? [
            'FORBIDDEN: photo + floating text only with zero graphic craft.',
            'FORBIDDEN: flat opaque header band ≥30% with centered white sans only.',
            'FORBIDDEN: horizontal sandwich (header + photo + footer bars).',
            'FORBIDDEN: global photo filters or recoloring the venue photo.',
          ]
          : [
            'FORBIDDEN: photo + floating text only with zero graphic craft.',
            'FORBIDDEN: flat opaque header/footer band ≥30% with centered white sans only.',
            'FORBIDDEN: story-style stacked layout on a 4:5 feed post.',
            'FORBIDDEN: outputting or composing for 9:16 story dimensions.',
            'FORBIDDEN: global photo filters or recoloring the venue photo.',
            'FORBIDDEN: Canva sandwich (opaque header + photo + opaque footer).',
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
 * Sector-agnostic slot proposals — brand channel intensity clamps as a ceiling.
 */
/**
 * Per-slot intensity spread — brand DNA/vibe stay consistent; layout energy varies by role.
 * Most library slots must produce GRAPHIC craft (not photo+caption only).
 * photo_first reserved for true ambient BTS / gallery moments.
 */
export const CALENDAR_ANNOUNCEMENT_INTENSITY: Record<string, FalDesignIntensityLevel> = {
  product_reveal: 'designed',
  venue_showcase: 'balanced',
  behind_the_scenes: 'photo_first',
  event_teaser: 'designed',
  offer_campaign: 'designed',
  social_proof: 'balanced',
  event_announcement: 'bold_editorial',
  campaign_offer: 'designed',
  product_highlight: 'designed',
  daily_story: 'balanced',
  reel_cover: 'designed',
};

/** Craft layout families — graphic systems that are NOT Canva header/footer sandwiches. */
export const DESIGN_CRAFT_LAYOUT_FAMILIES = [
  'asymmetric_corner_plate',
  'magazine_cover_overlap',
  'diagonal_soft_cut',
  'side_rail_frame',
  'l_shape_accent',
  'type_with_brand_rules',
  'inset_photo_frame',
  'editorial_split_soft',
] as const;

export type DesignCraftLayoutFamily = (typeof DESIGN_CRAFT_LAYOUT_FAMILIES)[number];

const LAYOUT_FAMILY_BRIEF: Record<DesignCraftLayoutFamily, string> = {
  asymmetric_corner_plate:
    'Paint an asymmetric corner brand-color plate (<22% frame) with headline fully inside (≥8% padding); contain the FULL gallery photo in the remaining clear window — never paint over the photo.',
  magazine_cover_overlap:
    'Magazine cover energy: oversized display fully inside a brand-color plate/soft field with 1–2 thin rules; contain the FULL gallery photo in the leftover window beside/below the plate — never half-on/half-off the color field onto the photo.',
  diagonal_soft_cut:
    'Paint a soft diagonal brand-color wedge (≤28% frame) with type fully inside (≥8% padding); contain the FULL gallery photo in the remaining triangular/rect window — never a horizontal sandwich.',
  side_rail_frame:
    'Paint a vertical side rail (≤24% width) with stacked type fully inside; contain the FULL gallery photo in the remaining wide window.',
  l_shape_accent:
    'Paint an L-shaped brand accent (≤30% combined) with headline fully inside; contain the FULL gallery photo in the open rectangle of the L.',
  type_with_brand_rules:
    'Type-led craft: reserve a light plate/scrim for the headline + thin brand-color rules/chips; contain the FULL gallery photo in the leftover window — never opaque paint over glassware/faces.',
  inset_photo_frame:
    'Paint a brand-color mat with type fully on the mat (≥8% padding); contain the FULL gallery photo as an inset window inside the mat — photo never cropped or painted over.',
  editorial_split_soft:
    'Paint a soft brand field (~35–40%) with type fully inside; contain the FULL gallery photo in the remaining ~60–65% window — never straddling the photo edge.',
};

/** Deterministic per-slot layout family so library templates diversify. */
export function resolveDesignCraftLayoutFamily(seed?: string | null): DesignCraftLayoutFamily {
  const families = DESIGN_CRAFT_LAYOUT_FAMILIES;
  const raw = (seed ?? 'default').trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return families[hash % families.length]!;
}

export function describeDesignCraftLayoutFamily(family: DesignCraftLayoutFamily): string {
  return LAYOUT_FAMILY_BRIEF[family];
}

function normalizeAnnouncementKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * Resolve fal design intensity for a calendar / template-library slot.
 * Slot announcement proposes energy; brand channel intensity is a ceiling (never exceeded).
 */
export function resolveCalendarFalDesignIntensity(input: {
  announcementType: string;
  channel: FalDesignChannel;
  brandTheme?: Record<string, unknown> | null;
}): { level: FalDesignIntensityLevel; source: string } {
  const ceiling = resolveBrandDesignIntensityCeiling(input.brandTheme, input.channel);
  const key = normalizeAnnouncementKey(input.announcementType);
  const proposed = key ? CALENDAR_ANNOUNCEMENT_INTENSITY[key] : undefined;
  if (proposed) {
    const level = clampDesignIntensityToCeiling(proposed, ceiling);
    if (level !== proposed) {
      return {
        level,
        source: `announcement:${key}+ceiling:brand.${input.channel}`,
      };
    }
    return { level: proposed, source: `announcement:${key}` };
  }
  return { level: ceiling, source: `brand_theme.fal_design_intensity.${input.channel}` };
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
