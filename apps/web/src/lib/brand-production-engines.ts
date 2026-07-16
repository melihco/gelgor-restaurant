/**
 * Brand-level production engine config — Satori / FAL routing.
 * Stored on brand_theme.production_engines (JSONB).
 */

export interface BrandFalEngineConfig {
  motion_plates_enabled: boolean;
  typography_design_enabled: boolean;
  /** Cost guard — max fal I2V motion plates per mission */
  max_motion_plates_per_mission: number;
  /** Max typography-design story replacements per mission */
  max_typography_per_mission: number;
}

export interface BrandProductionThroughputConfig {
  /** Factory drain batch size (1–5); read by the Python factory drainer. */
  factory_drain_batch?: number;
}

/** Local Satori typography — gallery photo + brand font/color overlay (text-heavy slots). */
export interface BrandSatoriEngineConfig {
  /** When false, text-heavy slots fall back to fal/gpt-image even if LOCAL_TYPOGRAPHY_ENABLED. */
  local_typography_enabled: boolean;
}

/** Mission Hub "Üretilen içerikler" flip-card gallery — per-brand UI config. */
export interface BrandSlotShowcaseConfig {
  /** Hide the flip-card gallery in the mission detail sheet when false. */
  enabled: boolean;
  /** Show the format filter chips (Tümü / Post / Story / …). */
  format_filters_enabled: boolean;
}

export interface BrandProductionEnginesConfig {
  fal: BrandFalEngineConfig;
  satori: BrandSatoriEngineConfig;
  showcase?: BrandSlotShowcaseConfig;
  throughput?: BrandProductionThroughputConfig;
}

const DEFAULT_ENGINES: BrandProductionEnginesConfig = {
  fal: {
    motion_plates_enabled: true,
    typography_design_enabled: true,
    max_motion_plates_per_mission: 3,
    max_typography_per_mission: 1,
  },
  satori: {
    local_typography_enabled: true,
  },
  showcase: {
    enabled: true,
    format_filters_enabled: true,
  },
  throughput: {
    factory_drain_batch: 4,
  },
};

function readEngines(theme: Record<string, unknown> | null | undefined): BrandProductionEnginesConfig {
  const raw = (theme?.production_engines ?? theme?.productionEngines) as
    Partial<BrandProductionEnginesConfig> | undefined;
  if (!raw) return DEFAULT_ENGINES;

  const fal: Partial<BrandFalEngineConfig> = raw.fal ?? {};
  const satori: Partial<BrandSatoriEngineConfig> = raw.satori ?? {};
  const showcase: Partial<BrandSlotShowcaseConfig> = raw.showcase ?? {};
  const throughput: Partial<BrandProductionThroughputConfig> = raw.throughput ?? {};

  return {
    fal: {
      motion_plates_enabled: fal.motion_plates_enabled !== false,
      typography_design_enabled: fal.typography_design_enabled !== false,
      max_motion_plates_per_mission: fal.max_motion_plates_per_mission ?? DEFAULT_ENGINES.fal.max_motion_plates_per_mission,
      max_typography_per_mission: fal.max_typography_per_mission ?? DEFAULT_ENGINES.fal.max_typography_per_mission,
    },
    satori: {
      local_typography_enabled: satori.local_typography_enabled !== false,
    },
    showcase: {
      enabled: showcase.enabled !== false,
      format_filters_enabled: showcase.format_filters_enabled !== false,
    },
    throughput: {
      factory_drain_batch: throughput.factory_drain_batch ?? DEFAULT_ENGINES.throughput?.factory_drain_batch,
    },
  };
}

export function resolveProductionEngines(
  theme: Record<string, unknown> | null | undefined,
): BrandProductionEnginesConfig {
  return readEngines(theme);
}

export function defaultProductionEngines(): BrandProductionEnginesConfig {
  return DEFAULT_ENGINES;
}

/** Brand-level opt-in/out for Satori local typography (global flag still required). */
export function isLocalTypographyEnabledForBrand(
  theme: Record<string, unknown> | null | undefined,
): boolean {
  return readEngines(theme).satori.local_typography_enabled !== false;
}

/** Mission Hub flip-card showcase config for a brand (defaults: enabled + filters on). */
export function resolveSlotShowcaseConfig(
  theme: Record<string, unknown> | null | undefined,
): BrandSlotShowcaseConfig {
  const engines = readEngines(theme);
  return engines.showcase ?? { enabled: true, format_filters_enabled: true };
}
