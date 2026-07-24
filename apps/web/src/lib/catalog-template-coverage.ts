/**
 * Catalog template hard-pin coverage — sector + tenant assignment driven.
 *
 * Measures how many enabled catalog slots (post/story/reel) have a bound
 * brand_design_templates row. Used for readiness telemetry and produce logs.
 * No tenant UUID / brand-name branches.
 */

import type { BrandActiveSlot, BrandActiveSlotSet } from '@/lib/brand-active-slot-resolver';

const PRODUCE_FORMATS = new Set(['post', 'story', 'reel']);

/** Minimum covered/enabled ratio for template hard-pin readiness. */
export const TEMPLATE_HARD_PIN_COVERAGE_MIN_RATIO = 0.5;

export type CatalogTemplateHardPinCoverage = {
  total: number;
  covered: number;
  missingKeys: string[];
  ratio: number;
  /** True when total=0 (no enabled produce slots) or ratio meets minimum. */
  sufficient: boolean;
};

function isProduceFormat(format: string): boolean {
  return PRODUCE_FORMATS.has(String(format).toLowerCase());
}

function coverageFromSlots(slots: BrandActiveSlot[]): CatalogTemplateHardPinCoverage {
  const total = slots.length;
  if (total === 0) {
    return { total: 0, covered: 0, missingKeys: [], ratio: 1, sufficient: true };
  }
  const missingKeys = slots.filter((s) => !s.hasTemplate).map((s) => s.slotKey);
  const covered = total - missingKeys.length;
  const ratio = covered / total;
  return {
    total,
    covered,
    missingKeys,
    ratio,
    sufficient: ratio >= TEMPLATE_HARD_PIN_COVERAGE_MIN_RATIO,
  };
}

/**
 * Coverage from resolved brand active slots (`hasTemplate` = catalog key bound).
 */
export function summarizeCatalogTemplateHardPinCoverage(
  activeSlots: BrandActiveSlotSet | null | undefined,
): CatalogTemplateHardPinCoverage {
  const slots = (activeSlots?.slots ?? []).filter(
    (s) => s.enabled && isProduceFormat(s.format),
  );
  return coverageFromSlots(slots);
}

/**
 * Template-row view for BRS when active-slot set is not loaded:
 * among unique catalog_slot_keys on active templates, count provisioned keys.
 */
export function summarizeTemplateRowsHardPinHealth(
  templates: Array<{
    status?: string | null;
    catalog_slot_key?: string | null;
    format?: string | null;
    design_spec?: { catalogSlotKey?: string } | null;
  }>,
): {
  activeCount: number;
  keyedCount: number;
  hardPinReadyKeys: number;
  ratio: number;
  sufficient: boolean;
} {
  const active = templates.filter((t) => String(t.status ?? 'active') !== 'archived');
  const byKey = new Map<string, boolean>();
  for (const t of active) {
    const key = String(
      t.catalog_slot_key
      ?? t.design_spec?.catalogSlotKey
      ?? '',
    ).trim();
    if (!key) continue;
    const ok = Boolean(t.format && isProduceFormat(t.format));
    byKey.set(key, (byKey.get(key) ?? false) || ok);
  }
  const keyedCount = byKey.size;
  const hardPinReadyKeys = [...byKey.values()].filter(Boolean).length;
  const ratio = keyedCount > 0 ? hardPinReadyKeys / keyedCount : 1;
  return {
    activeCount: active.length,
    keyedCount,
    hardPinReadyKeys,
    ratio,
    sufficient:
      active.length >= 3
      && (keyedCount === 0 || ratio >= TEMPLATE_HARD_PIN_COVERAGE_MIN_RATIO),
  };
}
