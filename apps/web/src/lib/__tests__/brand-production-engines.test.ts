import { describe, it, expect } from 'vitest';
import {
  resolveSlotShowcaseConfig,
  resolveProductionEngines,
  isLocalTypographyEnabledForBrand,
} from '../brand-production-engines';

describe('resolveSlotShowcaseConfig', () => {
  it('defaults to enabled with format filters for brands without config (any sector)', () => {
    for (const theme of [undefined, null, {}, { business_type: 'beach_club' }, { business_type: 'local_products_shop' }]) {
      const cfg = resolveSlotShowcaseConfig(theme as Record<string, unknown> | null | undefined);
      expect(cfg.enabled).toBe(true);
      expect(cfg.format_filters_enabled).toBe(true);
    }
  });

  it('respects a brand-level opt-out of the flip-card gallery', () => {
    const cfg = resolveSlotShowcaseConfig({
      production_engines: { showcase: { enabled: false } },
    });
    expect(cfg.enabled).toBe(false);
    // Unspecified sub-flag falls back to default.
    expect(cfg.format_filters_enabled).toBe(true);
  });

  it('allows disabling only the format filter chips', () => {
    const cfg = resolveSlotShowcaseConfig({
      production_engines: { showcase: { format_filters_enabled: false } },
    });
    expect(cfg.enabled).toBe(true);
    expect(cfg.format_filters_enabled).toBe(false);
  });

  it('reads the camelCase theme key too', () => {
    const cfg = resolveSlotShowcaseConfig({
      productionEngines: { showcase: { enabled: false, format_filters_enabled: false } },
    });
    expect(cfg.enabled).toBe(false);
    expect(cfg.format_filters_enabled).toBe(false);
  });
});

describe('resolveProductionEngines showcase defaults', () => {
  it('keeps other engine config intact when showcase is customised', () => {
    const engines = resolveProductionEngines({
      production_engines: { showcase: { enabled: false } },
    });
    expect(engines.fal.motion_plates_enabled).toBe(true);
    expect(engines.satori.local_typography_enabled).toBe(true);
    expect(engines.showcase?.enabled).toBe(false);
  });
});

describe('isLocalTypographyEnabledForBrand', () => {
  it('is unaffected by showcase config', () => {
    expect(isLocalTypographyEnabledForBrand({
      production_engines: { showcase: { enabled: false } },
    })).toBe(true);
    expect(isLocalTypographyEnabledForBrand({
      production_engines: { satori: { local_typography_enabled: false } },
    })).toBe(false);
  });
});
