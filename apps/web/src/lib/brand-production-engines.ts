/**
 * Brand-level production engine config — Runway / Remotion / FAL routing.
 * Stored on brand_theme.production_engines (JSONB).
 */
import type { RemotionLayoutFamily } from './remotion-template-types';

export interface BrandFalEngineConfig {
  motion_plates_enabled: boolean;
  typography_design_enabled: boolean;
  /** Cost guard — max fal I2V motion plates per mission */
  max_motion_plates_per_mission: number;
  /** Max typography-design story replacements per mission */
  max_typography_per_mission: number;
}

export interface BrandRemotionEngineConfig {
  /** Families eligible for fal.ai I2V motion background (priority order) */
  premium_motion_families: RemotionLayoutFamily[];
  /** Families eligible for typography-design fallback when motion fails */
  typography_fallback_families: RemotionLayoutFamily[];
  /** Never use these families for locked brand story slots */
  blocked_story_families: RemotionLayoutFamily[];
}

export interface BrandRunwayEngineConfig {
  enabled: boolean;
}

export interface BrandProductionThroughputConfig {
  /** Factory drain batch size (1–5). Default 4. */
  factory_drain_batch?: number;
  /** Parallel Remotion renders (1–2). Auto 2 on 8+ CPU cores when unset. */
  remotion_max_concurrent?: number;
}

export interface BrandProductionEnginesConfig {
  fal: BrandFalEngineConfig;
  remotion: BrandRemotionEngineConfig;
  runway: BrandRunwayEngineConfig;
  throughput?: BrandProductionThroughputConfig;
}

/** Tier-1 — premium motion + strong story quality */
export const TIER1_STORY_FAMILIES: RemotionLayoutFamily[] = [
  'glassmorphism_showcase',
  'editorial_product_stage',
  'luxury_kinetic_type',
  'cinematic_center',
  'magazine_cover',
  'campaign_hero',
];

/** Tier-2 — solid Remotion, optional FAL typography fallback */
export const TIER2_STORY_FAMILIES: RemotionLayoutFamily[] = [
  'editorial_bottom',
  'bold_impact',
  'minimal_luxury',
  'asymmetric_editorial',
  'frosted_glass',
  'neon_night',
];

/** Tier-3 — deprioritize for product/food brands (casual / collage) */
export const TIER3_STORY_FAMILIES: RemotionLayoutFamily[] = [
  'polaroid_single',
  'polaroid_stack',
  'mosaic_pinterest',
  'diptych_collage',
  'location_pin',
  'vibe_fullscreen',
  'quote_card',
  'gallery_series',
  'bento_story',
];

export const STORY_FAMILY_LABELS: Partial<Record<RemotionLayoutFamily, { tr: string; tier: 1 | 2 | 3 }>> = {
  glassmorphism_showcase: { tr: 'Glassmorphism Showcase', tier: 1 },
  editorial_product_stage: { tr: 'Editorial Product Stage', tier: 1 },
  luxury_kinetic_type: { tr: 'Luxury Kinetic Type', tier: 1 },
  cinematic_center: { tr: 'Cinematic Center', tier: 1 },
  magazine_cover: { tr: 'Magazine Cover', tier: 1 },
  campaign_hero: { tr: 'Campaign Hero', tier: 1 },
  editorial_bottom: { tr: 'Editorial Bottom', tier: 2 },
  bold_impact: { tr: 'Bold Impact', tier: 2 },
  minimal_luxury: { tr: 'Minimal Luxury', tier: 2 },
  asymmetric_editorial: { tr: 'Asymmetric Editorial', tier: 2 },
  frosted_glass: { tr: 'Frosted Glass', tier: 2 },
  neon_night: { tr: 'Neon Night', tier: 2 },
  polaroid_single: { tr: 'Polaroid Tek', tier: 3 },
  polaroid_stack: { tr: 'Polaroid Stack', tier: 3 },
  mosaic_pinterest: { tr: 'Mosaic Pinterest', tier: 3 },
  diptych_collage: { tr: 'Diptych Collage', tier: 3 },
  location_pin: { tr: 'Location Pin', tier: 3 },
  vibe_fullscreen: { tr: 'Vibe Fullscreen', tier: 3 },
  quote_card: { tr: 'Quote Card', tier: 3 },
  gallery_series: { tr: 'Gallery Series', tier: 3 },
  bento_story: { tr: 'Bento Story', tier: 3 },
  event_ticket: { tr: 'Event Ticket', tier: 2 },
  noir_editorial: { tr: 'Noir Editorial', tier: 2 },
  split_panel: { tr: 'Split Panel', tier: 2 },
  editorial_left: { tr: 'Editorial Left', tier: 2 },
};

const DEFAULT_ENGINES: BrandProductionEnginesConfig = {
  fal: {
    motion_plates_enabled: true,
    typography_design_enabled: true,
    max_motion_plates_per_mission: 3,
    max_typography_per_mission: 1,
  },
  remotion: {
    premium_motion_families: [...TIER1_STORY_FAMILIES, ...TIER2_STORY_FAMILIES.slice(0, 3)],
    typography_fallback_families: [
      'editorial_bottom', 'bold_impact', 'minimal_luxury', 'asymmetric_editorial',
      'campaign_hero', 'magazine_cover', 'cinematic_center',
    ],
    blocked_story_families: [...TIER3_STORY_FAMILIES],
  },
  runway: {
    enabled: false,
  },
  throughput: {
    factory_drain_batch: 4,
    remotion_max_concurrent: 2,
  },
};

function readEngines(theme: Record<string, unknown> | null | undefined): BrandProductionEnginesConfig {
  const raw = (theme?.production_engines ?? theme?.productionEngines) as
    Partial<BrandProductionEnginesConfig> | undefined;
  if (!raw) return DEFAULT_ENGINES;

  const fal: Partial<BrandFalEngineConfig> = raw.fal ?? {};
  const remotion: Partial<BrandRemotionEngineConfig> = raw.remotion ?? {};
  const runway: Partial<BrandRunwayEngineConfig> = raw.runway ?? {};
  const throughput: Partial<BrandProductionThroughputConfig> = raw.throughput ?? {};

  return {
    fal: {
      motion_plates_enabled: fal.motion_plates_enabled !== false,
      typography_design_enabled: fal.typography_design_enabled !== false,
      max_motion_plates_per_mission: fal.max_motion_plates_per_mission ?? DEFAULT_ENGINES.fal.max_motion_plates_per_mission,
      max_typography_per_mission: fal.max_typography_per_mission ?? DEFAULT_ENGINES.fal.max_typography_per_mission,
    },
    remotion: {
      premium_motion_families: (remotion.premium_motion_families?.length
        ? remotion.premium_motion_families
        : DEFAULT_ENGINES.remotion.premium_motion_families) as RemotionLayoutFamily[],
      typography_fallback_families: (remotion.typography_fallback_families?.length
        ? remotion.typography_fallback_families
        : DEFAULT_ENGINES.remotion.typography_fallback_families) as RemotionLayoutFamily[],
      blocked_story_families: (remotion.blocked_story_families?.length
        ? remotion.blocked_story_families
        : DEFAULT_ENGINES.remotion.blocked_story_families) as RemotionLayoutFamily[],
    },
    runway: {
      enabled: runway.enabled === true,
    },
    throughput: {
      factory_drain_batch: throughput.factory_drain_batch ?? DEFAULT_ENGINES.throughput?.factory_drain_batch,
      remotion_max_concurrent: throughput.remotion_max_concurrent ?? DEFAULT_ENGINES.throughput?.remotion_max_concurrent,
    },
  };
}

export function resolveProductionEngines(
  theme: Record<string, unknown> | null | undefined,
): BrandProductionEnginesConfig {
  return readEngines(theme);
}

export function isPremiumMotionFamily(
  family: string,
  theme: Record<string, unknown> | null | undefined,
): boolean {
  const engines = readEngines(theme);
  if (!engines.fal.motion_plates_enabled) return false;
  return engines.remotion.premium_motion_families.includes(family as RemotionLayoutFamily);
}

export function isTypographyFallbackFamily(
  family: string,
  theme: Record<string, unknown> | null | undefined,
): boolean {
  const engines = readEngines(theme);
  if (!engines.fal.typography_design_enabled) return false;
  return engines.remotion.typography_fallback_families.includes(family as RemotionLayoutFamily);
}

export function isBlockedStoryFamily(
  family: string,
  theme: Record<string, unknown> | null | undefined,
): boolean {
  const engines = readEngines(theme);
  return engines.remotion.blocked_story_families.includes(family as RemotionLayoutFamily);
}

export function defaultProductionEngines(): BrandProductionEnginesConfig {
  return DEFAULT_ENGINES;
}
