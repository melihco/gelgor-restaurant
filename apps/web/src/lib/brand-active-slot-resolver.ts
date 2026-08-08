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
import {
  publishChannelForRole,
  type ManifestProductionQueueItem,
} from '@/lib/production-pipeline-router';
import { resolveWeeklyPackageGeometry } from '@/lib/package-weekly-geometry';
import { detectIdeaPackageFormat } from '@/lib/weekly-publish-package';
import type { ProductionPipeline, ProductionSlotRole } from '@/lib/mission-production-manifest';
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
import { applyCatalogSlotVisualDefaults } from '@/lib/catalog-slot-visual-defaults';
import { hasTemplateSlotCreativeBrief } from '@/lib/slot-creative-customization';

/** Soft penalty per prior use of the same catalog slot (reuse pass only). */
const CATALOG_SLOT_REUSE_PENALTY = 22;
const CATALOG_SLOT_REUSE_PENALTY_CAP = 66;

/** Soft penalty when this catalog key appeared in recent produced artifacts. */
const CATALOG_SLOT_RECENT_PENALTY = 18;
const CATALOG_SLOT_RECENT_PENALTY_CAP = 54;

/**
 * Infer package format from catalog slot key suffix.
 * Prevents story keys (day_pass_story) from binding as reel_cover when pipeline drifted.
 */
export function inferFormatFromCatalogSlotKey(
  catalogSlotKey: string | null | undefined,
): BrandActiveSlot['format'] | null {
  const key = String(catalogSlotKey ?? '').trim().toLowerCase();
  if (!key) return null;
  if (key.endsWith('_reel') || key.includes('_reel_')) return 'reel';
  if (key.endsWith('_story') || key.includes('_story_')) return 'story';
  if (key.endsWith('_carousel') || key.includes('_carousel_')) return 'carousel';
  if (key.endsWith('_post') || key.includes('_post_')) return 'post';
  return null;
}

/**
 * Realign role/pipeline when catalog key format disagrees with the assignment.
 * Catalog key is SSOT for format — backfill/bindings must not leave fal_reel + *_story.
 */
export function alignAssignmentToCatalogSlotKey(
  assignment: ProductionAssignment,
  catalogSlotKey: string | null | undefined,
): ProductionAssignment {
  const key = String(catalogSlotKey ?? assignment.catalog_slot_key ?? '').trim();
  if (!key) return assignment;
  const format = inferFormatFromCatalogSlotKey(key);
  if (!format) {
    return { ...assignment, catalog_slot_key: key };
  }

  let slotRole = assignment.slot_role;
  let pipeline = assignment.pipeline;

  if (format === 'story') {
    if (
      pipeline === 'fal_reel'
      || pipeline === 'fal_only_reel'
      || String(slotRole).includes('reel')
    ) {
      pipeline = pipeline === 'fal_only_reel' ? 'fal_only_story' : 'fal_story';
    }
    if (
      !String(slotRole).includes('story')
      || String(slotRole).includes('reel')
    ) {
      slotRole = (pipeline === 'fal_only_story' ? 'fal_only_story' : 'campaign_story_motion') as ProductionSlotRole;
    }
  } else if (format === 'reel') {
    if (
      pipeline === 'fal_story'
      || pipeline === 'fal_only_story'
      || (String(slotRole).includes('story') && !String(slotRole).includes('reel'))
    ) {
      pipeline = pipeline === 'fal_only_story' ? 'fal_only_reel' : 'fal_reel';
    }
    if (!String(slotRole).includes('reel')) {
      slotRole = (pipeline === 'fal_only_reel' ? 'fal_only_reel' : 'fal_reel_motion') as ProductionSlotRole;
    }
  } else if (format === 'post') {
    if (
      pipeline === 'fal_reel'
      || pipeline === 'fal_story'
      || pipeline === 'fal_only_reel'
      || pipeline === 'fal_only_story'
    ) {
      // Keep designed-post track when a post catalog key lands on a video pipeline.
      pipeline = pipeline.startsWith('fal_only') ? 'fal_only_post' : 'fal_design';
    }
    if (String(slotRole).includes('reel') || String(slotRole).includes('story')) {
      slotRole = (pipeline === 'fal_only_post' ? 'fal_only_post' : 'fal_designed_post') as ProductionSlotRole;
    }
  }

  return {
    ...assignment,
    catalog_slot_key: key,
    slot_role: slotRole,
    pipeline,
    publish_channel: publishChannelForRole(slotRole),
  };
}

export interface CatalogSlotMatchOptions {
  /** Catalog keys used in recent artifacts (most recent first) — soft variety. */
  recentCatalogSlotKeys?: string[];
  /**
   * Plan/factory durable pins (`${ideaIndex}:${slot_role}`) — never rematch these
   * even when the catalog key is in recent history.
   */
  durablePreferredKeys?: Set<string>;
}

function recentCatalogSlotPenalty(
  slotKey: string,
  recentKeys: string[] | undefined,
): number {
  if (!recentKeys?.length) return 0;
  const idx = recentKeys.indexOf(slotKey);
  if (idx < 0) return 0;
  // Newer = stronger penalty (idx 0 most recent).
  const band = Math.max(1, 3 - Math.floor(idx / 4));
  return Math.min(CATALOG_SLOT_RECENT_PENALTY_CAP, band * CATALOG_SLOT_RECENT_PENALTY);
}

/** Stable idea-salted tie-break — avoids always picking the alphabetically first key. */
function catalogSlotTieBreakRank(slotKey: string, idea: Record<string, unknown>): number {
  const hay = ideaHaystack(idea).slice(0, 96);
  const seed = `${hay}|${slotKey}`;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

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
  /** From production_slot_definitions.prompt_pack — premium composition defaults, scene hints. */
  promptPack: Record<string, unknown>;
  /** From production_slot_definitions.match_signals — keywords / announcement_types. */
  matchSignals: Record<string, unknown>;
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
    design_spec?: { catalogSlotKey?: string; slot_creative_brief?: unknown; [key: string]: unknown };
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

/**
 * Index keyed shells that are hard-pin ready: active/approved + purpose brief.
 * Matches `findCatalogKeyHardMatch` so coverage telemetry equals produce reality.
 */
function buildTemplateIndex(
  templates: ResolveBrandActiveSlotKeysInput['designTemplates'],
): Map<string, { id: string }> {
  const map = new Map<string, { id: string }>();
  for (const template of templates ?? []) {
    const status = String(template.status ?? 'active').toLowerCase();
    if (status === 'archived' || status === 'draft') continue;
    if (status !== 'active' && status !== 'approved') continue;
    if (!hasTemplateSlotCreativeBrief(template.design_spec)) continue;
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
  customization?: Record<string, unknown> | null,
): BrandActiveSlot {
  const template = templateByKey.get(slot.slot_key);
  const basePack = (slot.prompt_pack && typeof slot.prompt_pack === 'object'
    ? slot.prompt_pack
    : {}) as Record<string, unknown>;
  const overlay = customization && typeof customization === 'object' && !Array.isArray(customization)
    ? customization
    : {};
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
    // Brand overlay (creative brief) wins over sector pack keys of the same name.
    promptPack: { ...basePack, ...overlay },
    matchSignals: (slot.match_signals && typeof slot.match_signals === 'object'
      ? slot.match_signals
      : {}) as Record<string, unknown>,
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
      slots.push(slotFromDefinition(
        slot,
        templateByKey,
        assignment.priority ?? slot.sort_order,
        assignment.customization,
      ));
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

/** Package format implied by a production role (assignment SSOT). */
export function formatFromSlotRole(role: string | null | undefined): BrandActiveSlot['format'] | null {
  const r = String(role ?? '').toLowerCase();
  if (!r) return null;
  if (r.includes('carousel')) return 'carousel';
  if (r.includes('reel')) return 'reel';
  if (r.includes('story') || r.includes('canvas')) return 'story';
  if (r.includes('post') || r.includes('ad') || r.includes('typography') || r.includes('showcase')) {
    return 'post';
  }
  return null;
}

function contentTypeForCatalogFormat(format: BrandActiveSlot['format']): string {
  if (format === 'story') return 'instagram_story';
  if (format === 'reel') return 'instagram_reel';
  if (format === 'carousel') return 'instagram_carousel';
  return 'instagram_post';
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

function scoreMatchSignals(
  slot: BrandActiveSlot,
  idea: Record<string, unknown>,
  announcement: string,
  hay: string,
): number {
  const signals = slot.matchSignals ?? {};
  let bonus = 0;

  const announcementTypes = Array.isArray(signals.announcement_types)
    ? signals.announcement_types
    : [];
  if (announcement && announcementTypes.length > 0) {
    for (const raw of announcementTypes) {
      const at = normalizeToken(String(raw ?? ''));
      if (!at) continue;
      if (announcement === at || announcement.includes(at) || at.includes(announcement)) {
        bonus += 28;
        break;
      }
    }
  }

  const keywords = Array.isArray(signals.keywords) ? signals.keywords : [];
  for (const raw of keywords) {
    const kw = normalizeToken(String(raw ?? ''));
    if (kw.length >= 3 && hay.includes(kw)) bonus += 14;
  }

  const signalDesignType = normalizeToken(String(signals.design_template_type ?? ''));
  if (signalDesignType) {
    const useCase = normalizeToken(String(idea.template_use_case ?? ''));
    if (useCase && (signalDesignType.includes(useCase.replace(/_post$/, '')) || useCase.includes(signalDesignType))) {
      bonus += 10;
    }
  }

  return bonus;
}

function scoreSlotForIdea(
  slot: BrandActiveSlot,
  idea: Record<string, unknown>,
  assignment?: ProductionAssignment,
  usageCount = 0,
  recentCatalogSlotKeys?: string[],
): number {
  let score = slot.priority;

  const fmt = detectIdeaPackageFormat(idea);
  const roleFmt = formatFromSlotRole(assignment?.slot_role);
  const formatMap: Record<string, BrandActiveSlot['format']> = {
    post: 'post',
    story: 'story',
    reel: 'reel',
    carousel: 'carousel',
  };
  // Assignment role wins when idea labels drift (e.g. reel idea stamped carousel).
  const targetFormat = roleFmt ?? formatMap[fmt];
  if (targetFormat && slot.format === targetFormat) score += 40;
  else if (targetFormat && slot.format !== targetFormat) return 0;

  const announcement = normalizeToken(
    String(idea.calendar_announcement_type ?? idea.announcement_type ?? idea.template_use_case ?? ''),
  );
  const hay = ideaHaystack(idea);
  const key = slot.slotKey;

  if (assignment?.catalog_slot_key && key === assignment.catalog_slot_key) {
    score += 60;
  }
  if (assignment?.library_slot_key && slot.librarySlotKey === assignment.library_slot_key) {
    score += 50;
  }
  if (assignment?.library_slot_key && key === assignment.library_slot_key) {
    score += 55;
  }
  if (assignment?.slot_role && slot.slotRole === assignment.slot_role) {
    score += 20;
  }

  const slotTokens = key.split('_');
  for (const token of slotTokens) {
    if (token.length >= 4 && hay.includes(token)) score += 8;
  }

  if (announcement) {
    // Event family: prefer specific shells (dj/private/calendar) over blanket *event* ties.
    if (/event|teaser|dj|night/.test(announcement)) {
      if (/dj|live_music|neon|night/.test(key)) score += 42;
      else if (/private_event|vip|guestlist/.test(key)) score += 38;
      else if (/events_calendar|event_announcement|calendar/.test(key)) score += 34;
      else if (key.includes('event')) score += 18;
    }
    if (key.includes('offer') && /offer|campaign|promo/.test(announcement)) score += 25;
    if (key.includes('social') && announcement.includes('social')) score += 25;
    if (key.includes('product') && /product|reveal|showcase/.test(announcement)) score += 20;
    if (key.includes('venue') && announcement.includes('venue')) score += 20;
    if (key.includes('pool') && /pool|havuz/.test(hay)) score += 30;
    if (key.includes('pool') && !/pool|havuz/.test(hay)) score -= 40;
  }

  if (/dj|live music|konser|party|gece/.test(hay)) {
    if (/dj|live_music|night|neon/.test(key)) score += 28;
  }
  if (/private|özel|wedding|düğün|vip/.test(hay)) {
    if (/private_event|vip|guestlist/.test(key)) score += 28;
  }

  score += scoreMatchSignals(slot, idea, announcement, hay);

  if (slot.designTemplateType) {
    const useCase = normalizeToken(String(idea.template_use_case ?? ''));
    if (useCase && slot.designTemplateType.includes(useCase.replace(/_post$/, ''))) score += 12;
  }

  // Soft reuse penalty — prefer unused peers; never beats a strong semantic match alone.
  if (usageCount > 0) {
    score -= Math.min(CATALOG_SLOT_REUSE_PENALTY_CAP, usageCount * CATALOG_SLOT_REUSE_PENALTY);
  }
  score -= recentCatalogSlotPenalty(key, recentCatalogSlotKeys);

  return score;
}

export interface CatalogSlotMatchInput {
  idea: Record<string, unknown>;
  assignment?: ProductionAssignment;
  activeSlots: BrandActiveSlotSet;
  /** Hard-skip these keys (prefer unused slots first). */
  usedSlotKeys?: Set<string>;
  /** Soft reuse penalty when allowing previously used slots. */
  slotUsageCounts?: Map<string, number>;
  /** Explicit catalog key from ideation/calendar — honored when enabled. */
  preferredCatalogSlotKey?: string | null;
  /** Soft variety — keys hard-pinned in recent artifacts (most recent first). */
  recentCatalogSlotKeys?: string[];
}

/**
 * Map a production idea to the best enabled catalog slot.
 * Falls back within the same format when the preferred/disabled slot is unavailable.
 * Never cross-format (reel key must not stamp a carousel idea unless preferred
 * catalog key explicitly wins — then role/pipeline are realigned on apply).
 */
export function matchIdeaToBrandCatalogSlot(
  input: CatalogSlotMatchInput,
): BrandActiveSlot | null {
  const {
    activeSlots, idea, assignment, usedSlotKeys, slotUsageCounts, recentCatalogSlotKeys,
  } = input;
  const preferred = input.preferredCatalogSlotKey
    ?? (idea.catalog_slot_key as string | undefined)
    ?? assignment?.catalog_slot_key;

  if (preferred && activeSlots.enabledSlotKeys.has(preferred)) {
    const exact = activeSlots.slots.find((s) => s.slotKey === preferred);
    if (exact && (!usedSlotKeys || !usedSlotKeys.has(exact.slotKey))) {
      // Explicit catalog pin always wins — applyCatalogSlotToAssignment realigns
      // slot_role/pipeline to the catalog row (fixes reel-key-on-carousel drift).
      return exact;
    }
  }

  let best: { slot: BrandActiveSlot; score: number; usage: number; recentIdx: number; tie: number } | null = null;
  for (const slot of activeSlots.slots) {
    if (usedSlotKeys?.has(slot.slotKey)) continue;
    const usage = slotUsageCounts?.get(slot.slotKey) ?? 0;
    const score = scoreSlotForIdea(slot, idea, assignment, usage, recentCatalogSlotKeys);
    if (score <= 0) continue;
    const recentIdx = recentCatalogSlotKeys?.indexOf(slot.slotKey) ?? -1;
    const tie = catalogSlotTieBreakRank(slot.slotKey, idea);
    if (
      !best
      || score > best.score
      || (score === best.score && usage < best.usage)
      || (score === best.score && usage === best.usage && (
        (recentIdx < 0 && best.recentIdx >= 0)
        || (recentIdx >= 0 && best.recentIdx >= 0 && recentIdx > best.recentIdx)
        || (recentIdx === best.recentIdx && tie < best.tie)
      ))
    ) {
      best = { slot, score, usage, recentIdx, tie };
    }
  }

  if (best) return best.slot;

  // Format-only fallback — same format only (never stamp a reel key onto a story).
  const fmt = detectIdeaPackageFormat(idea);
  const roleFmt = formatFromSlotRole(assignment?.slot_role);
  const formatMap: Record<string, BrandActiveSlot['format']> = {
    post: 'post',
    story: 'story',
    reel: 'reel',
    carousel: 'carousel',
  };
  const targetFormat = roleFmt ?? formatMap[fmt];
  if (!targetFormat) return null;

  let fallback: { slot: BrandActiveSlot; usage: number } | null = null;
  for (const slot of activeSlots.slots) {
    if (slot.format !== targetFormat) continue;
    if (usedSlotKeys?.has(slot.slotKey)) continue;
    const usage = slotUsageCounts?.get(slot.slotKey) ?? 0;
    if (!fallback || usage < fallback.usage) fallback = { slot, usage };
  }
  return fallback?.slot ?? null;
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
  opts?: CatalogSlotMatchOptions,
): Record<string, unknown>[] {
  const usage = new Map<string, number>();
  const recentCatalogSlotKeys = opts?.recentCatalogSlotKeys;
  return ideas.map((idea) => {
    const usedKeys = new Set(usage.keys());
    let matched = matchIdeaToBrandCatalogSlot({
      idea,
      activeSlots,
      usedSlotKeys: usedKeys,
      recentCatalogSlotKeys,
    });
    // Prefer unused first; if catalog is smaller than idea count, reuse with soft penalty.
    if (!matched && activeSlots.slots.length > 0) {
      matched = matchIdeaToBrandCatalogSlot({
        idea,
        activeSlots,
        slotUsageCounts: usage,
        recentCatalogSlotKeys,
      });
    }
    if (!matched) return idea;
    usage.set(matched.slotKey, (usage.get(matched.slotKey) ?? 0) + 1);
    const withVisuals = applyCatalogSlotVisualDefaults(idea, matched.promptPack);
    return {
      ...withVisuals,
      catalog_slot_key: matched.slotKey,
      catalog_slot_label: matched.labelTr,
    };
  });
}

/**
 * `catalog_slot_key` carries the full catalog identity (e.g.
 * `restaurant_cafe_event_announcement_story`). `library_slot_key` stays a
 * LEGACY Remotion/library key (`event_story`, `campaign_post`, …) so the
 * `LIBRARY_SLOT_TO_TEMPLATE_TYPES` routing and Remotion BTL lookup keep working.
 *
 * Catalog row is SSOT for role/pipeline/format — a `_reel` key must never keep
 * an `organic_carousel` assignment (Yula 76ddef0b drift).
 */
export function applyCatalogSlotToAssignment(
  assignment: ProductionAssignment,
  matched: BrandActiveSlot,
): ProductionAssignment {
  const slotRole = (matched.slotRole || assignment.slot_role) as ProductionSlotRole;
  const pipeline = (matched.pipeline || assignment.pipeline) as ProductionPipeline;
  return alignAssignmentToCatalogSlotKey(
    {
      ...assignment,
      catalog_slot_key: matched.slotKey,
      catalog_slot_label: matched.labelTr,
      library_slot_key: matched.librarySlotKey ?? assignment.library_slot_key ?? undefined,
      slot_role: slotRole,
      pipeline,
      publish_channel: publishChannelForRole(slotRole),
    },
    matched.slotKey,
  );
}

/**
 * Faz 5 — apply persisted production_jobs.slot_key bindings to a manifest queue.
 * Keys are `${ideaIndex}:${slot_role}`; bound items get the catalog key pinned on
 * both the idea and the assignment so the matcher honors it as preferred (a drain
 * pass then renders the exact template chosen at plan time — no re-match drift).
 */
export function applyCatalogSlotBindingsToQueue(
  queue: ManifestProductionQueueItem[],
  bindings: Record<string, string> | null | undefined,
): ManifestProductionQueueItem[] {
  if (!bindings || Object.keys(bindings).length === 0) return queue;
  return queue.map((item) => {
    const exactKey = `${item.ideaIndex}:${item.assignment.slot_role}`;
    let bound = bindings[exactKey];
    // Drain rebuild can drift slot_role before bindings apply — fall back to
    // the sole binding for this idea_index when exact role key misses.
    if (!bound) {
      const ideaPrefix = `${item.ideaIndex}:`;
      const ideaMatches = Object.entries(bindings).filter(([k]) => k.startsWith(ideaPrefix));
      if (ideaMatches.length === 1) bound = ideaMatches[0]![1];
    }
    if (!bound) return item;
    const assignment = alignAssignmentToCatalogSlotKey(
      { ...item.assignment, catalog_slot_key: bound },
      bound,
    );
    return {
      ...item,
      idea: { ...item.idea, catalog_slot_key: bound },
      assignment,
    };
  });
}

/**
 * Factory drain backfill: map plan-time `${ideaIndex}:${slot_role}` keys onto the
 * rebuilt manifest queue. Exact role match wins; when FD/catalog enrich drifted the
 * role, pin the planned role (+ catalog binding) onto that idea's row so result
 * `slotKey`s still match `production_jobs`.
 */
export function resolveSlotBackfillProductionLoop(
  queue: ManifestProductionQueueItem[],
  backfillSlotKeys: string[],
  catalogSlotBindings?: Record<string, string> | null,
): ManifestProductionQueueItem[] {
  if (!backfillSlotKeys.length) return [];

  const byExact = new Map<string, ManifestProductionQueueItem>();
  const byIdea = new Map<number, ManifestProductionQueueItem[]>();
  for (const item of queue) {
    const key = `${item.ideaIndex}:${item.assignment.slot_role}`;
    if (!byExact.has(key)) byExact.set(key, item);
    const list = byIdea.get(item.ideaIndex) ?? [];
    list.push(item);
    byIdea.set(item.ideaIndex, list);
  }

  const out: ManifestProductionQueueItem[] = [];
  const missing: string[] = [];
  const repaired: string[] = [];

  for (const plannedKey of backfillSlotKeys) {
    const exact = byExact.get(plannedKey);
    if (exact) {
      out.push(exact);
      continue;
    }

    const colon = plannedKey.indexOf(':');
    if (colon <= 0) {
      missing.push(plannedKey);
      continue;
    }
    const ideaIndex = Number.parseInt(plannedKey.slice(0, colon), 10);
    const plannedRole = plannedKey.slice(colon + 1).trim();
    if (!Number.isFinite(ideaIndex) || !plannedRole) {
      missing.push(plannedKey);
      continue;
    }

    const base = (byIdea.get(ideaIndex) ?? [])[0];
    if (!base) {
      missing.push(plannedKey);
      continue;
    }

    const catalogKey =
      catalogSlotBindings?.[plannedKey]
      ?? (typeof base.assignment.catalog_slot_key === 'string'
        ? base.assignment.catalog_slot_key
        : null)
      ?? (typeof base.idea.catalog_slot_key === 'string'
        ? base.idea.catalog_slot_key
        : null);

    repaired.push(`${plannedKey}←${base.ideaIndex}:${base.assignment.slot_role}`);
    const repairedAssignment = alignAssignmentToCatalogSlotKey(
      {
        ...base.assignment,
        slot_role: plannedRole as ProductionSlotRole,
        ...(catalogKey ? { catalog_slot_key: catalogKey } : {}),
      },
      catalogKey,
    );
    // Planned backfill role wins when catalog key is missing; otherwise catalog
    // format realignment (story/reel) is SSOT so day_pass_story never keeps fal_reel.
    const assignment = catalogKey
      ? repairedAssignment
      : {
          ...base.assignment,
          slot_role: plannedRole as ProductionSlotRole,
          publish_channel: publishChannelForRole(plannedRole as ProductionSlotRole),
        };
    out.push({
      ...base,
      idea: catalogKey
        ? { ...base.idea, catalog_slot_key: catalogKey }
        : { ...base.idea },
      assignment,
    });
  }

  if (repaired.length > 0 || missing.length > 0) {
    console.warn(
      `[auto-produce] Slot backfill key reconcile: repaired=${repaired.length} missing=${missing.length}`
        + (repaired.length ? ` repaired=[${repaired.join('; ')}]` : '')
        + (missing.length ? ` missing=[${missing.join(', ')}]` : ''),
    );
  }

  return out;
}

/**
 * Attach catalog_slot_key to each queue item.
 * Prefer unique enabled slots first; when the brand has fewer slots than ideas,
 * reuse the best-matching slot (soft penalty) rather than dropping rows.
 * Unmatched ideas keep their FD/inferred assignment so production count stays intact.
 */
export function enrichProductionQueueWithBrandSlots(
  queue: ManifestProductionQueueItem[],
  activeSlots: BrandActiveSlotSet,
  opts?: CatalogSlotMatchOptions,
): ManifestProductionQueueItem[] {
  const usage = new Map<string, number>();
  const out: ManifestProductionQueueItem[] = [];
  const recentCatalogSlotKeys = opts?.recentCatalogSlotKeys;
  const durablePreferredKeys = opts?.durablePreferredKeys;

  for (const item of queue) {
    const usedKeys = new Set(usage.keys());
    const durableKey = `${item.ideaIndex}:${item.assignment.slot_role}`;
    const isDurablePin = Boolean(durablePreferredKeys?.has(durableKey));
    const preferredKey = String(
      item.assignment.catalog_slot_key
      ?? (item.idea as Record<string, unknown>).catalog_slot_key
      ?? '',
    ).trim() || null;
    // Soft stamp / FD pick that already ran recently → re-score for variety.
    // Plan/factory durable bindings keep their exact shell.
    const rematchRecent = Boolean(
      !isDurablePin
      && preferredKey
      && recentCatalogSlotKeys?.includes(preferredKey),
    );
    const ideaForMatch = rematchRecent
      ? { ...(item.idea as Record<string, unknown>), catalog_slot_key: undefined }
      : (item.idea as Record<string, unknown>);
    const assignmentForMatch = rematchRecent
      ? { ...item.assignment, catalog_slot_key: undefined }
      : item.assignment;

    let matched = matchIdeaToBrandCatalogSlot({
      idea: ideaForMatch,
      assignment: assignmentForMatch,
      activeSlots,
      usedSlotKeys: usedKeys,
      recentCatalogSlotKeys,
      preferredCatalogSlotKey: rematchRecent ? null : preferredKey,
    });
    // Content packages often exceed enabled catalog size — rotate with soft penalty, never drop.
    if (!matched && activeSlots.slots.length > 0) {
      matched = matchIdeaToBrandCatalogSlot({
        idea: ideaForMatch,
        assignment: assignmentForMatch,
        activeSlots,
        slotUsageCounts: usage,
        recentCatalogSlotKeys,
        preferredCatalogSlotKey: rematchRecent ? null : preferredKey,
      });
    }
    if (!matched) {
      out.push(item);
      continue;
    }
    usage.set(matched.slotKey, (usage.get(matched.slotKey) ?? 0) + 1);
    const assignment = applyCatalogSlotToAssignment(item.assignment, matched);
    const ideaWithVisualDefaults = applyCatalogSlotVisualDefaults(
      item.idea as Record<string, unknown>,
      matched.promptPack,
    );
    out.push({
      ...item,
      idea: {
        ...ideaWithVisualDefaults,
        catalog_slot_key: matched.slotKey,
        catalog_slot_label: matched.labelTr,
        // Keep idea format fields in sync so rematch / detectIdeaPackageFormat
        // do not re-drift toward the old carousel/story label.
        format: matched.format,
        publish_schedule_format: matched.format,
        content_type: contentTypeForCatalogFormat(matched.format),
      },
      assignment,
    });
  }
  return out;
}

/**
 * Faz B — stamp coverage for a production queue. Used to warn when catalog-first
 * brands still have unbound slots (soft-match only → shared geometries).
 */
export function summarizeCatalogSlotStampCoverage(
  queue: Array<{
    idea?: Record<string, unknown>;
    assignment?: { catalog_slot_key?: string | null };
  }>,
): { total: number; stamped: number; missing: number } {
  let stamped = 0;
  for (const item of queue) {
    const key =
      item.assignment?.catalog_slot_key
      ?? (item.idea?.catalog_slot_key as string | undefined)
      ?? null;
    if (String(key ?? '').trim()) stamped += 1;
  }
  const total = queue.length;
  return { total, stamped, missing: Math.max(0, total - stamped) };
}

