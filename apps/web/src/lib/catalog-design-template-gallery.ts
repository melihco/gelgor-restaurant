/**
 * Fal şablon galerisi — DB slot kataloğu ↔ brand_design_templates eşlemesi.
 */

import type { BrandDesignTemplateRow } from '@/lib/fal-archetype-gallery';
import { DESIGN_TEMPLATE_TYPE_LABELS } from '@/lib/fal-archetype-gallery';
import type { ProductionSlotDefinition, TenantSlotAssignment } from '@/lib/production-slot-catalog';
import {
  facilityHintForSlot,
  isOptionalCatalogSlot,
  resolveBrandSlotFacilities,
  slotEnabledByFacilities,
  type BrandSlotFacilities,
} from '@/lib/sector-slot-pack';

export type CatalogGalleryFormatFilter = 'all' | 'post' | 'story' | 'reel';

export interface CatalogDesignGalleryRow {
  slotKey: string;
  labelTr: string;
  labelEn: string;
  format: ProductionSlotDefinition['format'];
  designTemplateType: string;
  librarySlotKey: string | null;
  enabled: boolean;
  priority: number;
  template: BrandDesignTemplateRow | null;
  matchSource: 'catalog_key' | 'template_type' | null;
  optionalTags?: string[];
  isOptional?: boolean;
  facilityHint?: string | null;
}

function catalogKeyOf(template: BrandDesignTemplateRow): string | null {
  const specKey = (template as BrandDesignTemplateRow & { design_spec?: { catalogSlotKey?: string } })
    .design_spec?.catalogSlotKey;
  return template.catalog_slot_key ?? specKey ?? null;
}

export function catalogGalleryFormatMatches(
  row: CatalogDesignGalleryRow,
  filter: CatalogGalleryFormatFilter,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'reel') return row.format === 'reel';
  return row.format === filter;
}

export function resolveCatalogSlotsForGallery(
  sectorSlots: ProductionSlotDefinition[],
  assignments?: TenantSlotAssignment[],
): ProductionSlotDefinition[] {
  if (!assignments?.length) {
    return [...sectorSlots]
      .filter((s) => s.enabled_by_default)
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  const assignmentByKey = new Map(assignments.map((a) => [a.slot_key, a]));
  return sectorSlots
    .map((slot) => {
      const assignment = assignmentByKey.get(slot.slot_key);
      if (!assignment?.enabled) return null;
      return {
        slot,
        priority: assignment.priority ?? slot.sort_order,
      };
    })
    .filter((row): row is { slot: ProductionSlotDefinition; priority: number } => Boolean(row))
    .sort((a, b) => a.priority - b.priority || a.slot.sort_order - b.slot.sort_order)
    .map((row) => row.slot);
}

/** Brand Hub — all sector slots with assignment enabled state (for toggle UI). */
export function resolveAllCatalogSlotsForBrandHub(
  sectorSlots: ProductionSlotDefinition[],
  assignments?: TenantSlotAssignment[],
  slotFacilities?: BrandSlotFacilities | Record<string, unknown> | null,
): Array<{ slot: ProductionSlotDefinition; enabled: boolean; priority: number; isOptional: boolean; facilityHint: string | null }> {
  const assignmentByKey = new Map(assignments?.map((a) => [a.slot_key, a]) ?? []);
  const facilities = resolveBrandSlotFacilities(slotFacilities);
  return [...sectorSlots]
    .filter((s) => s.status === 'active')
    .map((slot) => {
      const assignment = assignmentByKey.get(slot.slot_key);
      const facilityOk = slotEnabledByFacilities(slot.optional_tags, facilities);
      const defaultEnabled = slot.enabled_by_default && facilityOk;
      const enabled = assignment ? assignment.enabled : defaultEnabled;
      const optionalTags = slot.optional_tags ?? [];
      return {
        slot,
        enabled,
        priority: assignment?.priority ?? slot.sort_order,
        isOptional: isOptionalCatalogSlot(optionalTags),
        facilityHint: facilityHintForSlot(optionalTags),
      };
    })
    .sort((a, b) => a.priority - b.priority || a.slot.sort_order - b.slot.sort_order);
}

export function buildCatalogDesignGalleryRows(input: {
  slots: ProductionSlotDefinition[];
  templates: BrandDesignTemplateRow[];
  /** Per-slot enabled flags — when omitted, rows default to enabled. */
  slotEnabledByKey?: Map<string, boolean>;
}): CatalogDesignGalleryRow[] {
  const activeTemplates = input.templates.filter((t) => t.status !== 'archived');
  const byCatalogKey = new Map<string, BrandDesignTemplateRow>();
  const byType = new Map<string, BrandDesignTemplateRow[]>();
  const claimedIds = new Set<string>();

  for (const template of activeTemplates) {
    const key = catalogKeyOf(template);
    if (key && !byCatalogKey.has(key)) {
      byCatalogKey.set(key, template);
    }
    const typeList = byType.get(template.template_type) ?? [];
    typeList.push(template);
    byType.set(template.template_type, typeList);
  }

  const rows: CatalogDesignGalleryRow[] = input.slots.map((slot, index) => {
    let template: BrandDesignTemplateRow | null = null;
    let matchSource: CatalogDesignGalleryRow['matchSource'] = null;

    const catalogMatch = byCatalogKey.get(slot.slot_key);
    if (catalogMatch && !claimedIds.has(catalogMatch.id)) {
      template = catalogMatch;
      matchSource = 'catalog_key';
      claimedIds.add(catalogMatch.id);
    } else {
      const typeCandidates = byType.get(slot.design_template_type) ?? [];
      const fallback = typeCandidates.find((t) => !claimedIds.has(t.id));
      if (fallback) {
        template = fallback;
        matchSource = 'template_type';
        claimedIds.add(fallback.id);
      }
    }

    return {
      slotKey: slot.slot_key,
      labelTr: slot.label_tr,
      labelEn: slot.label_en,
      format: slot.format,
      designTemplateType: slot.design_template_type,
      librarySlotKey: slot.library_slot_key,
      enabled: input.slotEnabledByKey?.get(slot.slot_key) ?? true,
      priority: slot.sort_order ?? index,
      template,
      matchSource,
      optionalTags: slot.optional_tags,
      isOptional: isOptionalCatalogSlot(slot.optional_tags),
      facilityHint: facilityHintForSlot(slot.optional_tags),
    };
  });

  return rows;
}

export function collectOrphanDesignTemplates(
  templates: BrandDesignTemplateRow[],
  rows: CatalogDesignGalleryRow[],
): BrandDesignTemplateRow[] {
  const claimed = new Set(
    rows.map((r) => r.template?.id).filter((id): id is string => Boolean(id)),
  );
  return templates.filter((t) => t.status !== 'archived' && !claimed.has(t.id));
}

export function galleryRowTitle(row: CatalogDesignGalleryRow): string {
  return row.labelTr || row.labelEn || row.slotKey;
}

export function galleryRowSubtitle(row: CatalogDesignGalleryRow): string {
  const typeMeta = DESIGN_TEMPLATE_TYPE_LABELS[row.designTemplateType];
  return typeMeta?.desc ?? typeMeta?.tr ?? row.designTemplateType;
}

export function galleryCoverageSummary(rows: CatalogDesignGalleryRow[]): {
  slotCount: number;
  previewCount: number;
  missingCount: number;
} {
  const slotCount = rows.length;
  const previewCount = rows.filter((r) => Boolean(r.template?.thumbnail_url)).length;
  return {
    slotCount,
    previewCount,
    missingCount: Math.max(0, slotCount - previewCount),
  };
}
