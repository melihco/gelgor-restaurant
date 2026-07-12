/**
 * Brand active slot resolver — production SSOT for tenant-enabled catalog slots.
 *
 * Hierarchy:
 *   tenant_slot_assignments (enabled) + production_slot_definitions
 *   → brand_design_templates (catalog_slot_key, has_template)
 *
 * Catalog update behavior:
 *   Production reads tenant assignments at request time (snapshot).
 *   New catalog slot definitions are NOT auto-enabled for existing tenants —
 *   only bootstrap/onboarding copies enabled_by_default. Operators and brands
 *   opt in via assignment upsert.
 */

import type { BrandDesignTemplateRecord } from '@/lib/brand-design-template-matcher';
import type { ProductionAssignment } from '@/lib/mission-production-manifest';
import type { PackageGeometry } from '@/lib/mission-production-manifest';
import type { ManifestProductionQueueItem } from '@/lib/production-pipeline-router';
import { resolveWeeklyPackageGeometry } from '@/lib/package-weekly-geometry';
import { detectIdeaPackageFormat } from '@/lib/weekly-publish-package';
import {
  fetchSectorSlotDefinitions,
  fetchTenantSlotAssignments,
  type ProductionSlotDefinition,
  type TenantSlotAssignment,
} from '@/lib/production-slot-catalog';
import {
  resolveBrandSlotFacilities,
  slotEnabledByFacilities,
  type BrandSlotFacilities,
} from '@/lib/sector-slot-pack';

export interface BrandActiveSlot {
  slotKey: string;
  labelTr: string;
  labelEn: string;
  format: ProductionSlotDefinition['format'];
  designTemplateType: string;
  librarySlotKey: string | null;
  slotRole: string;
  pipeline: string;
  priority: number;
  enabled: boolean;
  hasTemplate: boolean;
  templateId: string | null;
}

export interface BrandActiveSlotSet {
  sectorId: string;
  workspaceId: string;
  slots: BrandActiveSlot[];
  enabledSlotKeys: Set<string>;
  /** Slots suggested by catalog but not yet assigned (informational only). */
  unassignedCatalogKeys: string[];
}

export interface ResolveBrandActiveSlotKeysInput {
  workspaceId: string;
  sector: string;
  designTemplates?: Array<{
    id: string;
    catalog_slot_key?: string | null;
    design_spec?: { catalogSlotKey?: string };
    status?: string;
  }>;
  tenantAssignments?: TenantSlotAssignment[];
  sectorSlots?: ProductionSlotDefinition[];
  /** brand_theme.slot_facilities — opt-out disables optional-tagged slots. */
  slotFacilities?: BrandSlotFacilities | Record<string, unknown> | null;
}

function catalogKeyOfTemplate(template: {
  catalog_slot_key?: string | null;
  design_spec?: { catalogSlotKey?: string; [key: string]: unknown };
}): string | null {
  return template.catalog_slot_key
    ?? template.design_spec?.catalogSlotKey
    ?? null;
}

function buildTemplateIndex(
  templates: ResolveBrandActiveSlotKeysInput['designTemplates'],
): Map<string, { id: string }> {
  const map = new Map<string, { id: string }>();
  for (const template of templates ?? []) {
    if (template.status === 'archived') continue;
    const key = catalogKeyOfTemplate(template);
    if (key && !map.has(key)) {
      map.set(key, { id: template.id });
    }
  }
  return map;
}

function slotDefaultEnabled(
  slot: ProductionSlotDefinition,
  facilities: BrandSlotFacilities,
): boolean {
  if (!slot.enabled_by_default || slot.status !== 'active') return false;
  return slotEnabledByFacilities(slot.optional_tags, facilities);
}

function slotFromDefinition(
  slot: ProductionSlotDefinition,
  templateByKey: Map<string, { id: string }>,
  priority: number,
): BrandActiveSlot {
  const template = templateByKey.get(slot.slot_key);
  return {
    slotKey: slot.slot_key,
    labelTr: slot.label_tr,
    labelEn: slot.label_en,
    format: slot.format,
    designTemplateType: slot.design_template_type,
    librarySlotKey: slot.library_slot_key,
    slotRole: slot.slot_role,
    pipeline: slot.pipeline,
    priority,
    enabled: true,
    hasTemplate: Boolean(template),
    templateId: template?.id ?? null,
  };
}

/**
 * Synchronous resolver — SSOT when catalog rows are already loaded (tests + BFF).
 */
export function resolveBrandActiveSlotKeys(
  input: ResolveBrandActiveSlotKeysInput,
): BrandActiveSlotSet {
  const sectorSlots = input.sectorSlots ?? [];
  const assignments = input.tenantAssignments ?? [];
  const templateByKey = buildTemplateIndex(input.designTemplates);
  const facilities = resolveBrandSlotFacilities(input.slotFacilities);

  const assignmentByKey = new Map(assignments.map((a) => [a.slot_key, a]));

  if (assignments.length > 0) {
    const slots: BrandActiveSlot[] = [];
    for (const assignment of assignments) {
      if (!assignment.enabled) continue;
      const slot = assignment.slot
        ?? sectorSlots.find((s) => s.slot_key === assignment.slot_key);
      if (!slot || slot.status !== 'active') continue;
      slots.push(slotFromDefinition(slot, templateByKey, assignment.priority ?? slot.sort_order));
    }
    slots.sort((a, b) => a.priority - b.priority || a.slotKey.localeCompare(b.slotKey));
    const enabledKeys = new Set(slots.map((s) => s.slotKey));
    const unassigned = sectorSlots
      .filter((s) => slotDefaultEnabled(s, facilities) && !assignmentByKey.has(s.slot_key))
      .map((s) => s.slot_key);
    return {
      sectorId: input.sector,
      workspaceId: input.workspaceId,
      slots,
      enabledSlotKeys: enabledKeys,
      unassignedCatalogKeys: unassigned,
    };
  }

  // No assignments — sector defaults filtered by brand facility hints.
  const defaults = sectorSlots.filter((s) => slotDefaultEnabled(s, facilities));
  const slots = defaults.map((slot) => slotFromDefinition(slot, templateByKey, slot.sort_order));
  return {
    sectorId: input.sector,
    workspaceId: input.workspaceId,
    slots,
    enabledSlotKeys: new Set(slots.map((s) => s.slotKey)),
    unassignedCatalogKeys: [],
  };
}

export async function loadBrandActiveSlotSet(
  workspaceId: string,
  sector: string,
  designTemplates?: ResolveBrandActiveSlotKeysInput['designTemplates'],
  slotFacilities?: BrandSlotFacilities | Record<string, unknown> | null,
): Promise<BrandActiveSlotSet> {
  const facilities = resolveBrandSlotFacilities(slotFacilities);
  const [assignments, sectorSlots] = await Promise.all([
    fetchTenantSlotAssignments(workspaceId),
    fetchSectorSlotDefinitions(workspaceId, sector, { facilities }),
  ]);
  return resolveBrandActiveSlotKeys({
    workspaceId,
    sector,
    designTemplates,
    tenantAssignments: assignments,
    sectorSlots,
    slotFacilities: facilities,
  });
}

export function isBrandCatalogSlotEnabled(
  slotSet: BrandActiveSlotSet,
  slotKey: string | null | undefined,
): boolean {
  if (!slotKey) return true;
  return slotSet.enabledSlotKeys.has(slotKey);
}

export function countActiveSlotsByFormat(
  slots: BrandActiveSlot[],
): Record<'post' | 'story' | 'reel' | 'carousel', number> {
  const counts = { post: 0, story: 0, reel: 0, carousel: 0 };
  for (const slot of slots) {
    if (slot.format in counts) {
      counts[slot.format as keyof typeof counts] += 1;
    }
  }
  return counts;
}

/**
 * Cap weekly package geometry by brand-enabled slot counts per format.
 */
export function resolveBrandProductionFormatTargets(
  slotSet: BrandActiveSlotSet,
  packageSlug?: string | null,
): PackageGeometry {
  const base = resolveWeeklyPackageGeometry(packageSlug);
  const byFormat = countActiveSlotsByFormat(slotSet.slots);
  const post = Math.min(base.post, byFormat.post);
  const story = Math.min(base.story, byFormat.story);
  const carousel = Math.min(base.carousel, byFormat.carousel);
  const reel = Math.min(base.reel, byFormat.reel);
  return {
    post,
    story,
    carousel,
    reel,
    total: post + story + carousel + reel,
  };
}

function normalizeToken(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_');
}

function ideaHaystack(idea: Record<string, unknown>): string {
  return [
    idea.headline,
    idea.concept_title,
    idea.caption,
    idea.caption_draft,
    idea.content_brief,
    idea.calendar_announcement_type,
    idea.announcement_type,
    idea.template_use_case,
    idea.visual_direction,
    idea.tagline,
  ].join(' ').toLowerCase();
}

function scoreSlotForIdea(
  slot: BrandActiveSlot,
  idea: Record<string, unknown>,
  assignment?: ProductionAssignment,
): number {
  let score = slot.priority;

  const fmt = detectIdeaPackageFormat(idea);
  const formatMap: Record<string, BrandActiveSlot['format']> = {
    post: 'post',
    story: 'story',
    reel: 'reel',
    carousel: 'carousel',
  };
  const targetFormat = formatMap[fmt];
  if (targetFormat && slot.format === targetFormat) score += 40;
  else if (targetFormat && slot.format !== targetFormat) return 0;

  const announcement = normalizeToken(
    String(idea.calendar_announcement_type ?? idea.announcement_type ?? idea.template_use_case ?? ''),
  );
  const hay = ideaHaystack(idea);

  if (assignment?.library_slot_key && slot.librarySlotKey === assignment.library_slot_key) {
    score += 50;
  }
  if (assignment?.slot_role && slot.slotRole === assignment.slot_role) {
    score += 20;
  }

  const slotTokens = slot.slotKey.split('_');
  for (const token of slotTokens) {
    if (token.length >= 4 && hay.includes(token)) score += 8;
  }

  if (announcement) {
    if (slot.slotKey.includes('event') && /event|teaser|dj|night/.test(announcement)) score += 25;
    if (slot.slotKey.includes('offer') && /offer|campaign|promo/.test(announcement)) score += 25;
    if (slot.slotKey.includes('social') && announcement.includes('social')) score += 25;
    if (slot.slotKey.includes('product') && /product|reveal|showcase/.test(announcement)) score += 20;
    if (slot.slotKey.includes('venue') && announcement.includes('venue')) score += 20;
    if (slot.slotKey.includes('pool') && /pool|havuz/.test(hay)) score += 30;
    if (slot.slotKey.includes('pool') && !/pool|havuz/.test(hay)) score -= 40;
  }

  if (slot.designTemplateType) {
    const useCase = normalizeToken(String(idea.template_use_case ?? ''));
    if (useCase && slot.designTemplateType.includes(useCase.replace(/_post$/, ''))) score += 12;
  }

  return score;
}

export interface CatalogSlotMatchInput {
  idea: Record<string, unknown>;
  assignment?: ProductionAssignment;
  activeSlots: BrandActiveSlotSet;
  usedSlotKeys?: Set<string>;
  /** Explicit catalog key from ideation/calendar — honored when enabled. */
  preferredCatalogSlotKey?: string | null;
}

/**
 * Map a production idea to the best enabled catalog slot.
 * Falls back within the same format when the preferred/disabled slot is unavailable.
 */
export function matchIdeaToBrandCatalogSlot(
  input: CatalogSlotMatchInput,
): BrandActiveSlot | null {
  const { activeSlots, idea, assignment, usedSlotKeys } = input;
  const preferred = input.preferredCatalogSlotKey
    ?? (idea.catalog_slot_key as string | undefined)
    ?? assignment?.catalog_slot_key;

  if (preferred && activeSlots.enabledSlotKeys.has(preferred)) {
    const exact = activeSlots.slots.find((s) => s.slotKey === preferred);
    if (exact && (!usedSlotKeys || !usedSlotKeys.has(exact.slotKey))) {
      return exact;
    }
  }

  let best: { slot: BrandActiveSlot; score: number } | null = null;
  for (const slot of activeSlots.slots) {
    if (usedSlotKeys?.has(slot.slotKey)) continue;
    const score = scoreSlotForIdea(slot, idea, assignment);
    if (score <= 0) continue;
    if (!best || score > best.score) best = { slot, score };
  }

  if (best) return best.slot;

  // Format-only fallback — any unused enabled slot of matching format.
  const fmt = detectIdeaPackageFormat(idea);
  const formatMap: Record<string, BrandActiveSlot['format']> = {
    post: 'post',
    story: 'story',
    reel: 'reel',
    carousel: 'carousel',
  };
  const targetFormat = formatMap[fmt];
  return activeSlots.slots.find(
    (s) => s.format === targetFormat && !usedSlotKeys?.has(s.slotKey),
  ) ?? activeSlots.slots.find((s) => !usedSlotKeys?.has(s.slotKey)) ?? null;
}

export function filterDesignTemplatesToActiveSlots(
  templates: BrandDesignTemplateRecord[],
  activeSlots: BrandActiveSlotSet,
): BrandDesignTemplateRecord[] {
  return templates.filter((template) => {
    const key = catalogKeyOfTemplate(template);
    if (!key) return true;
    return activeSlots.enabledSlotKeys.has(key);
  });
}

export function stampIdeasWithBrandCatalogSlots(
  ideas: Record<string, unknown>[],
  activeSlots: BrandActiveSlotSet,
): Record<string, unknown>[] {
  const used = new Set<string>();
  return ideas.map((idea) => {
    const matched = matchIdeaToBrandCatalogSlot({ idea, activeSlots, usedSlotKeys: used });
    if (!matched) return idea;
    used.add(matched.slotKey);
    return {
      ...idea,
      catalog_slot_key: matched.slotKey,
      catalog_slot_label: matched.labelTr,
    };
  });
}

/** Attach catalog_slot_key to each queue item; drop rows with no enabled slot match. */
export function enrichProductionQueueWithBrandSlots(
  queue: ManifestProductionQueueItem[],
  activeSlots: BrandActiveSlotSet,
): ManifestProductionQueueItem[] {
  const used = new Set<string>();
  const out: ManifestProductionQueueItem[] = [];

  for (const item of queue) {
    const matched = matchIdeaToBrandCatalogSlot({
      idea: item.idea,
      assignment: item.assignment,
      activeSlots,
      usedSlotKeys: used,
    });
    if (!matched) continue;
    used.add(matched.slotKey);
    out.push({
      ...item,
      idea: {
        ...item.idea,
        catalog_slot_key: matched.slotKey,
        catalog_slot_label: matched.labelTr,
      },
      assignment: {
        ...item.assignment,
        catalog_slot_key: matched.slotKey,
        library_slot_key: item.assignment.library_slot_key ?? matched.librarySlotKey ?? undefined,
      },
    });
  }
  return out;
}
