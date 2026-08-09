/**
 * Catalog template hard-pin coverage — sector + tenant assignment driven.
 *
 * Measures how many enabled catalog slots (post/story/reel) have a bound
 * brand_design_templates row. Used for readiness telemetry and produce logs.
 * No tenant UUID / brand-name branches.
 */

import type { BrandActiveSlot, BrandActiveSlotSet } from '@/lib/brand-active-slot-resolver';
import {
  hospitalityBucketsPresent,
  resolveDesignTemplateTypePolicy,
  type DesignTemplateTypePolicy,
} from '@/lib/design-template-type-policy';

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
type TemplateRowForCoverage = {
  status?: string | null;
  template_type?: string | null;
  catalog_slot_key?: string | null;
  format?: string | null;
  /** Index-friendly — BrandDesignTemplateRecord.design_spec uses `[key: string]: unknown`. */
  design_spec?: { [key: string]: unknown; catalogSlotKey?: unknown } | null;
};

function catalogSlotKeyFromTemplate(t: TemplateRowForCoverage): string {
  const fromSpec = t.design_spec?.catalogSlotKey;
  return String(
    t.catalog_slot_key
    ?? (typeof fromSpec === 'string' ? fromSpec : '')
    ?? '',
  ).trim();
}

export function summarizeTemplateRowsHardPinHealth(
  templates: TemplateRowForCoverage[],
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
    const key = catalogSlotKeyFromTemplate(t);
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

export type DesignTemplateTypeCoverage = {
  activeCount: number;
  keyedCount: number;
  distinctTypes: string[];
  typeCount: number;
  minDistinctTypes: number;
  hospitalityBuckets: string[];
  minHospitalityBuckets: number | null;
  policy: DesignTemplateTypePolicy;
  /** True when type floor (+ hospitality balance when applicable) is met. */
  sufficient: boolean;
};

/**
 * Distinct fal template_type coverage vs sector policy floor.
 */
export function summarizeDesignTemplateTypeCoverage(
  templates: TemplateRowForCoverage[],
  sector: string | null | undefined,
): DesignTemplateTypeCoverage {
  const policy = resolveDesignTemplateTypePolicy(sector);
  const active = templates.filter((t) => String(t.status ?? 'active') !== 'archived');
  const types = new Set<string>();
  let keyedCount = 0;
  for (const t of active) {
    const tt = String(t.template_type ?? '').trim().toLowerCase();
    if (tt) types.add(tt);
    if (catalogSlotKeyFromTemplate(t)) keyedCount += 1;
  }
  const distinctTypes = [...types].sort();
  const typeCount = distinctTypes.length;
  const buckets = hospitalityBucketsPresent(distinctTypes);
  const minBuckets = policy.minHospitalityBuckets ?? null;
  const typesOk = typeCount >= policy.minDistinctTypes;
  const bucketsOk = minBuckets == null || buckets.length >= minBuckets;
  // Empty library is not "sufficient" — production needs real shells.
  const sufficient = active.length > 0 && typesOk && bucketsOk;
  return {
    activeCount: active.length,
    keyedCount,
    distinctTypes,
    typeCount,
    minDistinctTypes: policy.minDistinctTypes,
    hospitalityBuckets: buckets,
    minHospitalityBuckets: minBuckets,
    policy,
    sufficient,
  };
}
