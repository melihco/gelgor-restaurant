/**
 * design_spec.layout v1 — numeric shell document for brand design templates.
 *
 * Layout is a first-class document (canvas + panels + text/photo/logo slots).
 * Production compose path is deterministic_compose — Satori/sharp overlays on
 * the real gallery photo. Thumbnail is archive preview / QA ref, not a GPT
 * IMAGE-2 bake source. Legacy rows without `layout` dual-read from archetype.
 *
 * MULTI-TENANT: Seeds are keyed by CanvaArchetypeId only — never brand UUIDs.
 */

import {
  CANVA_ARCHETYPE_CATALOG,
  type CanvaArchetypeId,
} from '@/lib/canva-archetype-catalog';

/** Bump when archetype seed geometry changes so soft-pin archive rows re-seed. */
/** v3 — photo-led editorial: scrim/shape only; no opaque color_block hospitality defaults. */
export const DESIGN_SPEC_LAYOUT_VERSION = 3 as const;

export type DesignSpecAspectRatio = '4:5' | '9:16' | '1:1';

export type DesignSpecNormRect = {
  /** Normalized 0–1 from left */
  x: number;
  /** Normalized 0–1 from top */
  y: number;
  width: number;
  height: number;
};

export type DesignSpecTextRole = 'headline' | 'subtitle' | 'cta' | 'eyebrow' | 'meta';

export type DesignSpecPanelRole =
  | 'color_block'
  | 'frosted'
  | 'scrim'
  | 'shape'
  | 'ticket'
  | 'polaroid_frame'
  | 'banner'
  | 'wedge';

/** How a matched library shell should pin production (telemetry + future gates). */
export type DesignSpecPinMode = 'hard' | 'soft' | 'unlocked';

/**
 * Intended compose path.
 * - deterministic_compose — production SSOT (Satori/sharp from layout doc)
 * - hybrid_compose / gpt_edit_replica — legacy enums kept for stored JSON only
 */
export type DesignSpecRenderPath =
  | 'gpt_edit_replica'
  | 'hybrid_compose'
  | 'deterministic_compose';

export interface DesignSpecTextSlot {
  id: string;
  role: DesignSpecTextRole;
  zone: DesignSpecNormRect;
  maxLines: number;
  align: 'left' | 'center' | 'right';
  /** Inner pad as fraction of zone (default 0.08). */
  paddingNorm?: number;
}

export interface DesignSpecPanel {
  id: string;
  role: DesignSpecPanelRole;
  zone: DesignSpecNormRect;
}

export interface DesignSpecLayout {
  version: typeof DESIGN_SPEC_LAYOUT_VERSION;
  archetypeId: CanvaArchetypeId | string;
  canvas: {
    aspectRatio: DesignSpecAspectRatio;
    width: number;
    height: number;
  };
  safeArea: { top: number; right: number; bottom: number; left: number };
  panels: DesignSpecPanel[];
  textSlots: DesignSpecTextSlot[];
  photoSlot: DesignSpecNormRect;
  logoSlot: DesignSpecNormRect;
  pinMode: DesignSpecPinMode;
  renderPath: DesignSpecRenderPath;
  /** Prose provenance mirrored from archetype catalog. */
  layoutPattern?: string;
}

type ArchetypeSeed45 = Omit<
  DesignSpecLayout,
  'version' | 'archetypeId' | 'canvas' | 'layoutPattern' | 'pinMode' | 'renderPath'
>;

function r(x: number, y: number, width: number, height: number): DesignSpecNormRect {
  return { x, y, width, height };
}

function canvasFor(aspect: DesignSpecAspectRatio): DesignSpecLayout['canvas'] {
  if (aspect === '9:16') return { aspectRatio: '9:16', width: 1080, height: 1920 };
  if (aspect === '1:1') return { aspectRatio: '1:1', width: 1080, height: 1080 };
  return { aspectRatio: '4:5', width: 1080, height: 1350 };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function normalizeRect(raw: unknown): DesignSpecNormRect | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const x = Number(o.x);
  const y = Number(o.y);
  const width = Number(o.width);
  const height = Number(o.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0) return null;
  return {
    x: clamp01(x),
    y: clamp01(y),
    width: clamp01(width),
    height: clamp01(height),
  };
}

function fmtPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function fmtRect(zone: DesignSpecNormRect): string {
  return `x=${fmtPct(zone.x)} y=${fmtPct(zone.y)} w=${fmtPct(zone.width)} h=${fmtPct(zone.height)}`;
}

/** Base 4:5 geometry seeds for every Canva archetype. */
const ARCHETYPE_SEEDS_45: Record<CanvaArchetypeId, ArchetypeSeed45> = {
  frosted_quote_card: {
    safeArea: { top: 0.08, right: 0.08, bottom: 0.08, left: 0.08 },
    panels: [{ id: 'glass', role: 'frosted', zone: r(0.12, 0.28, 0.76, 0.38) }],
    textSlots: [
      { id: 'headline', role: 'headline', zone: r(0.18, 0.34, 0.64, 0.18), maxLines: 3, align: 'center', paddingNorm: 0.1 },
      { id: 'subtitle', role: 'subtitle', zone: r(0.2, 0.54, 0.6, 0.08), maxLines: 2, align: 'center' },
    ],
    photoSlot: r(0, 0, 1, 1),
    logoSlot: r(0.72, 0.88, 0.18, 0.06),
  },
  magazine_cover_drop: {
    safeArea: { top: 0.07, right: 0.07, bottom: 0.07, left: 0.07 },
    // Full-bleed photo; soft top scrim for masthead type only.
    panels: [
      { id: 'masthead_scrim', role: 'scrim', zone: r(0.06, 0.06, 0.55, 0.28) },
      { id: 'accent_rule', role: 'shape', zone: r(0.08, 0.32, 0.18, 0.008) },
    ],
    textSlots: [
      { id: 'eyebrow', role: 'eyebrow', zone: r(0.08, 0.07, 0.45, 0.05), maxLines: 1, align: 'left' },
      { id: 'headline', role: 'headline', zone: r(0.08, 0.12, 0.5, 0.16), maxLines: 3, align: 'left', paddingNorm: 0.08 },
      { id: 'subtitle', role: 'subtitle', zone: r(0.08, 0.78, 0.5, 0.08), maxLines: 2, align: 'left' },
    ],
    photoSlot: r(0, 0, 1, 1),
    logoSlot: r(0.72, 0.88, 0.18, 0.05),
  },
  split_feature_panel: {
    safeArea: { top: 0.07, right: 0.07, bottom: 0.07, left: 0.07 },
    // Type in left negative space + thin accent — no frosted paint card, no side slab.
    panels: [
      { id: 'type_scrim', role: 'scrim', zone: r(0.05, 0.22, 0.48, 0.48) },
      { id: 'accent_rule', role: 'shape', zone: r(0.1, 0.62, 0.2, 0.008) },
    ],
    textSlots: [
      { id: 'eyebrow', role: 'eyebrow', zone: r(0.1, 0.26, 0.4, 0.045), maxLines: 1, align: 'left' },
      { id: 'headline', role: 'headline', zone: r(0.1, 0.32, 0.42, 0.18), maxLines: 3, align: 'left', paddingNorm: 0.06 },
      { id: 'subtitle', role: 'subtitle', zone: r(0.1, 0.52, 0.4, 0.07), maxLines: 2, align: 'left' },
      { id: 'cta', role: 'cta', zone: r(0.1, 0.64, 0.28, 0.05), maxLines: 1, align: 'left' },
    ],
    photoSlot: r(0, 0, 1, 1),
    logoSlot: r(0.74, 0.88, 0.18, 0.06),
  },
  diagonal_brand_split: {
    safeArea: { top: 0.07, right: 0.07, bottom: 0.07, left: 0.07 },
    // Was opaque wedge — now soft left scrim + accent rule (Turunç-class).
    panels: [
      { id: 'type_scrim', role: 'scrim', zone: r(0.04, 0.06, 0.48, 0.4) },
      { id: 'accent_rule', role: 'shape', zone: r(0.08, 0.42, 0.22, 0.01) },
    ],
    textSlots: [
      { id: 'headline', role: 'headline', zone: r(0.07, 0.08, 0.4, 0.2), maxLines: 3, align: 'left', paddingNorm: 0.08 },
      { id: 'subtitle', role: 'subtitle', zone: r(0.07, 0.3, 0.36, 0.06), maxLines: 2, align: 'left' },
      { id: 'cta', role: 'cta', zone: r(0.07, 0.44, 0.28, 0.05), maxLines: 1, align: 'left' },
    ],
    photoSlot: r(0, 0, 1, 1),
    logoSlot: r(0.74, 0.88, 0.18, 0.06),
  },
  cinematic_full_bleed: {
    safeArea: { top: 0.08, right: 0.08, bottom: 0.1, left: 0.08 },
    panels: [
      { id: 'corner_scrim', role: 'scrim', zone: r(0.06, 0.68, 0.48, 0.22) },
      { id: 'accent_rule', role: 'shape', zone: r(0.08, 0.84, 0.16, 0.008) },
    ],
    textSlots: [
      { id: 'headline', role: 'headline', zone: r(0.08, 0.7, 0.42, 0.12), maxLines: 2, align: 'left', paddingNorm: 0.1 },
      { id: 'subtitle', role: 'subtitle', zone: r(0.08, 0.86, 0.36, 0.05), maxLines: 1, align: 'left' },
    ],
    photoSlot: r(0, 0, 1, 1),
    logoSlot: r(0.74, 0.08, 0.18, 0.06),
  },
  campaign_hero_block: {
    safeArea: { top: 0.07, right: 0.07, bottom: 0.07, left: 0.07 },
    // Full-bleed photo + soft top type zone (no opaque header slab).
    panels: [
      { id: 'top_scrim', role: 'scrim', zone: r(0, 0, 1, 0.36) },
      { id: 'accent_rule', role: 'shape', zone: r(0.35, 0.3, 0.3, 0.008) },
    ],
    textSlots: [
      { id: 'headline', role: 'headline', zone: r(0.08, 0.1, 0.84, 0.16), maxLines: 2, align: 'center', paddingNorm: 0.1 },
      { id: 'subtitle', role: 'subtitle', zone: r(0.12, 0.28, 0.76, 0.07), maxLines: 2, align: 'center' },
    ],
    photoSlot: r(0, 0, 1, 1),
    logoSlot: r(0.72, 0.88, 0.18, 0.06),
  },
  event_ticket_stub: {
    safeArea: { top: 0.07, right: 0.07, bottom: 0.07, left: 0.07 },
    // Event energy without ticket paint slabs — night scrim + accent.
    panels: [
      { id: 'top_scrim', role: 'scrim', zone: r(0.05, 0.06, 0.9, 0.28) },
      { id: 'accent_rule', role: 'shape', zone: r(0.1, 0.32, 0.2, 0.008) },
      { id: 'bottom_scrim', role: 'scrim', zone: r(0.05, 0.72, 0.9, 0.2) },
    ],
    textSlots: [
      { id: 'meta', role: 'meta', zone: r(0.1, 0.08, 0.5, 0.06), maxLines: 1, align: 'left' },
      { id: 'headline', role: 'headline', zone: r(0.1, 0.16, 0.8, 0.14), maxLines: 2, align: 'left', paddingNorm: 0.08 },
      { id: 'cta', role: 'cta', zone: r(0.1, 0.78, 0.4, 0.08), maxLines: 1, align: 'left' },
    ],
    photoSlot: r(0, 0, 1, 1),
    logoSlot: r(0.72, 0.88, 0.18, 0.05),
  },
  neon_night_promo: {
    safeArea: { top: 0.08, right: 0.08, bottom: 0.1, left: 0.08 },
    // Nightlife poster: full-bleed photo + bottom night gradient + accent rule
    // (no yellow paint slab covering half the frame).
    panels: [
      { id: 'night_scrim', role: 'scrim', zone: r(0, 0.42, 1, 0.58) },
      { id: 'accent_rule', role: 'shape', zone: r(0.08, 0.56, 0.12, 0.008) },
    ],
    textSlots: [
      { id: 'headline', role: 'headline', zone: r(0.08, 0.6, 0.8, 0.16), maxLines: 2, align: 'left', paddingNorm: 0.02 },
      { id: 'subtitle', role: 'subtitle', zone: r(0.08, 0.78, 0.55, 0.055), maxLines: 1, align: 'left' },
      { id: 'meta', role: 'meta', zone: r(0.08, 0.86, 0.4, 0.05), maxLines: 1, align: 'left' },
    ],
    photoSlot: r(0, 0, 1, 1),
    logoSlot: r(0.74, 0.88, 0.16, 0.06),
  },
  social_proof_banner: {
    safeArea: { top: 0.07, right: 0.07, bottom: 0.07, left: 0.07 },
    panels: [{ id: 'quote_scrim', role: 'scrim', zone: r(0.06, 0.08, 0.88, 0.28) }],
    textSlots: [
      { id: 'headline', role: 'headline', zone: r(0.1, 0.1, 0.8, 0.14), maxLines: 2, align: 'center', paddingNorm: 0.1 },
      { id: 'subtitle', role: 'subtitle', zone: r(0.14, 0.26, 0.72, 0.08), maxLines: 2, align: 'center' },
    ],
    photoSlot: r(0, 0, 1, 1),
    logoSlot: r(0.72, 0.88, 0.18, 0.06),
  },
  promo_price_stack: {
    safeArea: { top: 0.07, right: 0.07, bottom: 0.07, left: 0.07 },
    // Soft frosted offer plate — never opaque mustard paint slab.
    panels: [
      { id: 'offer_plate', role: 'frosted', zone: r(0.06, 0.14, 0.48, 0.5) },
      { id: 'accent_rule', role: 'shape', zone: r(0.1, 0.6, 0.2, 0.008) },
    ],
    textSlots: [
      { id: 'headline', role: 'headline', zone: r(0.1, 0.18, 0.4, 0.26), maxLines: 3, align: 'left', paddingNorm: 0.1 },
      { id: 'subtitle', role: 'subtitle', zone: r(0.1, 0.46, 0.38, 0.1), maxLines: 2, align: 'left' },
      { id: 'cta', role: 'cta', zone: r(0.1, 0.62, 0.32, 0.07), maxLines: 1, align: 'left' },
    ],
    photoSlot: r(0, 0, 1, 1),
    logoSlot: r(0.72, 0.08, 0.18, 0.06),
  },
  editorial_date_masthead: {
    safeArea: { top: 0.07, right: 0.07, bottom: 0.07, left: 0.07 },
    panels: [
      { id: 'masthead_scrim', role: 'scrim', zone: r(0.06, 0.06, 0.88, 0.24) },
      { id: 'accent_rule', role: 'shape', zone: r(0.1, 0.28, 0.18, 0.008) },
    ],
    textSlots: [
      { id: 'meta', role: 'meta', zone: r(0.1, 0.07, 0.6, 0.05), maxLines: 1, align: 'left' },
      { id: 'headline', role: 'headline', zone: r(0.1, 0.13, 0.8, 0.14), maxLines: 2, align: 'left', paddingNorm: 0.08 },
      { id: 'subtitle', role: 'subtitle', zone: r(0.1, 0.78, 0.55, 0.08), maxLines: 2, align: 'left' },
    ],
    photoSlot: r(0, 0, 1, 1),
    logoSlot: r(0.72, 0.88, 0.18, 0.05),
  },
  product_hero_card: {
    safeArea: { top: 0.08, right: 0.08, bottom: 0.08, left: 0.08 },
    // Product-led: soft edge scrims only — no header/footer sandwich bands.
    panels: [
      { id: 'top_scrim', role: 'scrim', zone: r(0.08, 0.05, 0.84, 0.12) },
      { id: 'bottom_scrim', role: 'scrim', zone: r(0.08, 0.82, 0.84, 0.12) },
    ],
    textSlots: [
      { id: 'headline', role: 'headline', zone: r(0.12, 0.06, 0.76, 0.09), maxLines: 1, align: 'center', paddingNorm: 0.1 },
      { id: 'subtitle', role: 'subtitle', zone: r(0.12, 0.84, 0.76, 0.07), maxLines: 1, align: 'center' },
    ],
    photoSlot: r(0, 0, 1, 1),
    logoSlot: r(0.74, 0.9, 0.16, 0.05),
  },
  graphic_shape_stack: {
    safeArea: { top: 0.07, right: 0.07, bottom: 0.07, left: 0.07 },
    panels: [
      { id: 'shape_a', role: 'shape', zone: r(0.08, 0.12, 0.5, 0.36) },
      { id: 'shape_b', role: 'shape', zone: r(0.42, 0.42, 0.48, 0.32) },
    ],
    textSlots: [
      { id: 'headline', role: 'headline', zone: r(0.12, 0.16, 0.42, 0.24), maxLines: 3, align: 'left', paddingNorm: 0.1 },
      { id: 'subtitle', role: 'subtitle', zone: r(0.46, 0.5, 0.4, 0.12), maxLines: 2, align: 'left' },
    ],
    photoSlot: r(0.2, 0.28, 0.6, 0.5),
    logoSlot: r(0.72, 0.88, 0.18, 0.06),
  },
  before_after_diptych: {
    safeArea: { top: 0.07, right: 0.07, bottom: 0.07, left: 0.07 },
    panels: [
      { id: 'left_label', role: 'banner', zone: r(0.06, 0.08, 0.4, 0.08) },
      { id: 'right_label', role: 'banner', zone: r(0.54, 0.08, 0.4, 0.08) },
    ],
    textSlots: [
      { id: 'headline', role: 'headline', zone: r(0.1, 0.78, 0.8, 0.1), maxLines: 2, align: 'center', paddingNorm: 0.08 },
      { id: 'meta', role: 'meta', zone: r(0.1, 0.09, 0.32, 0.05), maxLines: 1, align: 'left' },
    ],
    photoSlot: r(0.04, 0.18, 0.92, 0.56),
    logoSlot: r(0.72, 0.9, 0.18, 0.05),
  },
  location_pin_card: {
    safeArea: { top: 0.07, right: 0.07, bottom: 0.07, left: 0.07 },
    panels: [
      { id: 'info_scrim', role: 'scrim', zone: r(0.06, 0.62, 0.88, 0.26) },
    ],
    textSlots: [
      { id: 'headline', role: 'headline', zone: r(0.1, 0.64, 0.8, 0.1), maxLines: 2, align: 'left', paddingNorm: 0.08 },
      { id: 'subtitle', role: 'subtitle', zone: r(0.1, 0.75, 0.7, 0.06), maxLines: 2, align: 'left' },
      { id: 'cta', role: 'cta', zone: r(0.1, 0.82, 0.4, 0.05), maxLines: 1, align: 'left' },
    ],
    photoSlot: r(0, 0, 1, 1),
    logoSlot: r(0.72, 0.08, 0.18, 0.06),
  },
  polaroid_memory: {
    safeArea: { top: 0.08, right: 0.08, bottom: 0.08, left: 0.08 },
    panels: [{ id: 'polaroid', role: 'polaroid_frame', zone: r(0.14, 0.12, 0.72, 0.62) }],
    textSlots: [
      { id: 'headline', role: 'headline', zone: r(0.12, 0.78, 0.76, 0.1), maxLines: 2, align: 'center', paddingNorm: 0.1 },
      { id: 'subtitle', role: 'subtitle', zone: r(0.16, 0.88, 0.68, 0.06), maxLines: 1, align: 'center' },
    ],
    photoSlot: r(0.18, 0.16, 0.64, 0.48),
    logoSlot: r(0.74, 0.06, 0.16, 0.05),
  },
  noir_editorial: {
    safeArea: { top: 0.08, right: 0.08, bottom: 0.1, left: 0.08 },
    panels: [{ id: 'noir_wash', role: 'scrim', zone: r(0, 0.55, 1, 0.45) }],
    textSlots: [
      { id: 'headline', role: 'headline', zone: r(0.08, 0.6, 0.7, 0.16), maxLines: 2, align: 'left', paddingNorm: 0.1 },
      { id: 'subtitle', role: 'subtitle', zone: r(0.08, 0.78, 0.55, 0.08), maxLines: 2, align: 'left' },
    ],
    photoSlot: r(0.2, 0.08, 0.72, 0.52),
    logoSlot: r(0.74, 0.88, 0.16, 0.05),
  },
  gallery_carousel_tease: {
    safeArea: { top: 0.07, right: 0.07, bottom: 0.07, left: 0.07 },
    panels: [
      { id: 'cell_a', role: 'shape', zone: r(0.06, 0.18, 0.42, 0.52) },
      { id: 'cell_b', role: 'shape', zone: r(0.52, 0.18, 0.42, 0.52) },
    ],
    textSlots: [
      { id: 'headline', role: 'headline', zone: r(0.08, 0.74, 0.84, 0.12), maxLines: 2, align: 'center', paddingNorm: 0.08 },
      { id: 'cta', role: 'cta', zone: r(0.25, 0.88, 0.5, 0.06), maxLines: 1, align: 'center' },
    ],
    photoSlot: r(0.06, 0.18, 0.88, 0.52),
    logoSlot: r(0.72, 0.06, 0.18, 0.06),
  },
};

function adaptSeedForAspect(
  seed: ArchetypeSeed45,
  aspect: DesignSpecAspectRatio,
): ArchetypeSeed45 {
  if (aspect === '4:5') return seed;
  if (aspect === '1:1') {
    return {
      ...seed,
      photoSlot: r(
        seed.photoSlot.x,
        Math.min(0.55, seed.photoSlot.y + 0.02),
        seed.photoSlot.width,
        Math.min(0.55, seed.photoSlot.height),
      ),
    };
  }
  // 9:16 — story/reel safe bands; keep relative panel roles but push type out of UI chrome.
  return {
    safeArea: { top: 0.12, right: 0.08, bottom: 0.15, left: 0.08 },
    panels: seed.panels.map((p, i) => ({
      ...p,
      zone: r(p.zone.x, Math.min(0.7, p.zone.y * 0.85 + 0.04), p.zone.width, Math.min(0.45, p.zone.height * 0.9)),
      id: p.id || `panel_${i}`,
    })),
    textSlots: seed.textSlots.map((t) => {
      if (t.role === 'headline') {
        return {
          ...t,
          zone: r(0.08, 0.12, 0.84, Math.max(0.1, Math.min(0.18, t.zone.height))),
        };
      }
      if (t.role === 'subtitle' || t.role === 'cta') {
        return {
          ...t,
          zone: r(0.1, Math.max(0.72, t.zone.y), 0.7, Math.min(0.1, t.zone.height)),
        };
      }
      return t;
    }),
    photoSlot: r(0.08, 0.28, 0.84, 0.42),
    logoSlot: r(0.68, 0.88, 0.22, 0.05),
  };
}

export function isCanvaArchetypeId(value: string | null | undefined): value is CanvaArchetypeId {
  if (!value) return false;
  return Object.prototype.hasOwnProperty.call(ARCHETYPE_SEEDS_45, value);
}

export function aspectRatioForTemplateFormat(
  format: 'story' | 'post' | 'reel' | 'reel_cover' | string | null | undefined,
): DesignSpecAspectRatio {
  if (format === 'story' || format === 'reel' || format === 'reel_cover') return '9:16';
  return '4:5';
}

/**
 * Seed a numeric layout document from archetype + slot format.
 * Sector-agnostic — same geometry for beach_club and local_products_shop.
 */
export function seedDesignSpecLayout(input: {
  archetypeId?: string | null;
  format?: string | null;
  pinMode?: DesignSpecPinMode;
  renderPath?: DesignSpecRenderPath;
  layoutPattern?: string | null;
}): DesignSpecLayout | null {
  const id = String(input.archetypeId ?? '').trim();
  if (!isCanvaArchetypeId(id)) return null;
  const aspect = aspectRatioForTemplateFormat(input.format);
  const catalog = CANVA_ARCHETYPE_CATALOG.find((a) => a.id === id);
  const adapted = adaptSeedForAspect(ARCHETYPE_SEEDS_45[id], aspect);
  return {
    version: DESIGN_SPEC_LAYOUT_VERSION,
    archetypeId: id,
    canvas: canvasFor(aspect),
    ...adapted,
    pinMode: input.pinMode ?? 'soft',
    renderPath: input.renderPath ?? 'deterministic_compose',
    layoutPattern: input.layoutPattern?.trim() || catalog?.layoutPattern,
  };
}

export function hasUsableDesignSpecLayout(
  layout: DesignSpecLayout | null | undefined,
): layout is DesignSpecLayout {
  if (!layout || layout.version !== DESIGN_SPEC_LAYOUT_VERSION) return false;
  if (!layout.photoSlot || !layout.logoSlot) return false;
  if (!Array.isArray(layout.textSlots) || layout.textSlots.length === 0) return false;
  const headline = layout.textSlots.find((t) => t.role === 'headline');
  return Boolean(headline?.zone);
}

/** Parse opaque JSONB / matcher bag into a validated layout (or null). */
export function parseDesignSpecLayout(raw: unknown): DesignSpecLayout | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (Number(o.version) !== DESIGN_SPEC_LAYOUT_VERSION) return null;

  const photoSlot = normalizeRect(o.photoSlot);
  const logoSlot = normalizeRect(o.logoSlot);
  if (!photoSlot || !logoSlot) return null;

  const canvasRaw = o.canvas && typeof o.canvas === 'object' && !Array.isArray(o.canvas)
    ? (o.canvas as Record<string, unknown>)
    : null;
  const aspectRaw = String(canvasRaw?.aspectRatio ?? '4:5');
  const aspect: DesignSpecAspectRatio =
    aspectRaw === '9:16' || aspectRaw === '1:1' || aspectRaw === '4:5'
      ? aspectRaw
      : '4:5';
  const fallbackCanvas = canvasFor(aspect);

  const safeRaw = o.safeArea && typeof o.safeArea === 'object' && !Array.isArray(o.safeArea)
    ? (o.safeArea as Record<string, unknown>)
    : null;

  const panels: DesignSpecPanel[] = Array.isArray(o.panels)
    ? o.panels
        .map((p, i): DesignSpecPanel | null => {
          if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
          const row = p as Record<string, unknown>;
          const zone = normalizeRect(row.zone);
          if (!zone) return null;
          const role = String(row.role ?? 'color_block') as DesignSpecPanelRole;
          return {
            id: String(row.id ?? `panel_${i}`),
            role,
            zone,
          };
        })
        .filter((p): p is DesignSpecPanel => Boolean(p))
    : [];

  const textSlots: DesignSpecTextSlot[] = Array.isArray(o.textSlots)
    ? o.textSlots
        .map((t, i): DesignSpecTextSlot | null => {
          if (!t || typeof t !== 'object' || Array.isArray(t)) return null;
          const row = t as Record<string, unknown>;
          const zone = normalizeRect(row.zone);
          if (!zone) return null;
          const role = String(row.role ?? 'headline') as DesignSpecTextRole;
          const alignRaw = String(row.align ?? 'left');
          const align = alignRaw === 'center' || alignRaw === 'right' ? alignRaw : 'left';
          const maxLines = Math.max(1, Math.min(6, Number(row.maxLines) || 2));
          return {
            id: String(row.id ?? `text_${i}`),
            role,
            zone,
            maxLines,
            align,
            ...(typeof row.paddingNorm === 'number' ? { paddingNorm: clamp01(row.paddingNorm) } : {}),
          };
        })
        .filter((t): t is DesignSpecTextSlot => Boolean(t))
    : [];

  if (textSlots.length === 0) return null;

  const pinRaw = String(o.pinMode ?? 'soft');
  const pinMode: DesignSpecPinMode =
    pinRaw === 'hard' || pinRaw === 'unlocked' ? pinRaw : 'soft';
  const pathRaw = String(o.renderPath ?? 'deterministic_compose');
  const renderPath: DesignSpecRenderPath =
    pathRaw === 'hybrid_compose' || pathRaw === 'gpt_edit_replica'
      ? pathRaw
      : 'deterministic_compose';

  const layout: DesignSpecLayout = {
    version: DESIGN_SPEC_LAYOUT_VERSION,
    archetypeId: String(o.archetypeId ?? ''),
    canvas: {
      aspectRatio: aspect,
      width: Number(canvasRaw?.width) || fallbackCanvas.width,
      height: Number(canvasRaw?.height) || fallbackCanvas.height,
    },
    safeArea: {
      top: clamp01(Number(safeRaw?.top ?? 0.07)),
      right: clamp01(Number(safeRaw?.right ?? 0.07)),
      bottom: clamp01(Number(safeRaw?.bottom ?? 0.07)),
      left: clamp01(Number(safeRaw?.left ?? 0.07)),
    },
    panels,
    textSlots,
    photoSlot,
    logoSlot,
    pinMode,
    renderPath,
    ...(typeof o.layoutPattern === 'string' ? { layoutPattern: o.layoutPattern } : {}),
  };

  return hasUsableDesignSpecLayout(layout) ? layout : null;
}

/**
 * Prefer persisted layout; else seed from archetype (dual-read for legacy rows).
 */
export function resolveDesignSpecLayout(input: {
  layout?: unknown;
  archetypeId?: string | null;
  format?: string | null;
  layoutPattern?: string | null;
  pinMode?: DesignSpecPinMode;
}): DesignSpecLayout | null {
  const parsed = parseDesignSpecLayout(input.layout);
  if (parsed) return parsed;
  return seedDesignSpecLayout({
    archetypeId: input.archetypeId,
    format: input.format,
    layoutPattern: input.layoutPattern,
    pinMode: input.pinMode,
  });
}

/** Compact numeric geometry block for replica / correction prompts. */
export function buildDesignSpecLayoutLockBlock(layout: DesignSpecLayout): string {
  const headline = layout.textSlots.find((t) => t.role === 'headline');
  const subtitle = layout.textSlots.find((t) => t.role === 'subtitle');
  const panelSummary = layout.panels.length
    ? layout.panels.map((p) => `${p.role}[${fmtRect(p.zone)}]`).join('; ')
    : 'none (photo-led)';
  return [
    '═══ LAYOUT DOCUMENT (NUMERIC AUTHORITY) ═══',
    `layout.version=${layout.version} archetype=${layout.archetypeId} canvas=${layout.canvas.width}×${layout.canvas.height} (${layout.canvas.aspectRatio})`,
    `pinMode=${layout.pinMode} renderPath=${layout.renderPath}`,
    layout.layoutPattern ? `pattern: ${layout.layoutPattern}` : '',
    `photoSlot: ${fmtRect(layout.photoSlot)}`,
    headline ? `headlineSlot: ${fmtRect(headline.zone)} maxLines=${headline.maxLines} align=${headline.align}` : '',
    subtitle ? `subtitleSlot: ${fmtRect(subtitle.zone)} maxLines=${subtitle.maxLines}` : 'subtitleSlot: none',
    `logoSlot: ${fmtRect(layout.logoSlot)} — keep empty for post composite; never over letters`,
    `panels: ${panelSummary}`,
    `safeArea: top=${fmtPct(layout.safeArea.top)} bottom=${fmtPct(layout.safeArea.bottom)} sides=${fmtPct(layout.safeArea.left)}`,
    'IMAGE 2 still shows craft finish — but panel ratios and type boxes MUST match these normalized slots.',
    'FORBIDDEN: inventing a different shell (e.g. bottom caption ribbon when document is a side split).',
  ].filter(Boolean).join('\n');
}

/** All seeded archetype ids — used by tests to prove catalog coverage. */
export function listSeededDesignSpecArchetypeIds(): CanvaArchetypeId[] {
  return Object.keys(ARCHETYPE_SEEDS_45) as CanvaArchetypeId[];
}
