/**
 * Announcement / event overlay template library — agency catalog (200 layouts, 20 families).
 */

export type {
  AnnouncementContentFormat,
  AnnouncementUseCase,
  AnnouncementTemplateId,
  AnnouncementTemplateDefinition,
  AnnouncementLibraryPreferences,
  AnnouncementOverlayInput,
  LayoutFamily,
  TemplateCollection,
  PreviewHint,
} from './announcement-template-types';

import type {
  AnnouncementContentFormat,
  AnnouncementLibraryPreferences,
  AnnouncementOverlayInput,
  AnnouncementTemplateDefinition,
  AnnouncementTemplateId,
  AnnouncementUseCase,
} from './announcement-template-types';
import { applyPremiumPosterLayoutPatch } from './poster-quality';

import {
  getSectorCollection,
  isGenericAnnouncementDefaults,
  normalizeSectorId,
  SECTOR_COLLECTIONS,
  templatesForSectorPackage,
  type SectorCollectionPackage,
  type SectorId,
} from './announcement-sector-collections';

export {
  getSectorCollection,
  isGenericAnnouncementDefaults,
  normalizeSectorId,
  SECTOR_COLLECTIONS,
  templatesForSectorPackage,
  type SectorCollectionPackage,
  type SectorId,
};

import {
  getFavoriteTemplateIds,
  getFavoriteTemplates,
  getRecentTemplateIds,
  getRecentTemplates,
  getRecommendedTemplates,
  favoriteTemplateIds,
  isFavoriteTemplate,
  recordTemplateUsage,
  scoreTemplatesForContent,
  smartSelectTemplate,
  toggleFavoriteTemplate,
} from './announcement-template-intelligence';

export {
  favoriteTemplateIds,
  getFavoriteTemplateIds,
  getFavoriteTemplates,
  getRecentTemplateIds,
  getRecentTemplates,
  getRecommendedTemplates,
  isFavoriteTemplate,
  recordTemplateUsage,
  scoreTemplatesForContent,
  smartSelectTemplate,
  toggleFavoriteTemplate,
};

import { buildLayoutSvg } from './announcement-template-engine';
import {
  AGENCY_TEMPLATE_CATALOG,
  ANNOUNCEMENT_TEMPLATES,
  LEGACY_TEMPLATE_ALIASES,
  TEMPLATE_BY_ID,
  TEMPLATE_FAMILIES,
  TEMPLATE_COLLECTIONS,
  getTemplateDefinition,
  isValidTemplateId,
  normalizeTemplateId,
  resolveTemplateLayout,
} from './announcement-template-catalog';
import { pickFromPool } from './tenant-template-seed';

export {
  AGENCY_TEMPLATE_CATALOG,
  ANNOUNCEMENT_TEMPLATES,
  LEGACY_TEMPLATE_ALIASES,
  TEMPLATE_BY_ID,
  TEMPLATE_FAMILIES,
  TEMPLATE_COLLECTIONS,
  getTemplateDefinition,
  isValidTemplateId,
  normalizeTemplateId,
  resolveTemplateLayout,
};

export const DEFAULT_ANNOUNCEMENT_PREFERENCES: AnnouncementLibraryPreferences = {
  event: 'luxury_bottom',
  campaign: 'campaign_badge',
  announcement: 'editorial_left',
  defaultFormat: 'story',
};

/** One featured template per layout family — compact pickers */
export const FEATURED_TEMPLATE_IDS: AnnouncementTemplateId[] = TEMPLATE_FAMILIES.map(
  (f) => `agency_${f.id}_01`,
);

export function resolveFormatDimensions(format: AnnouncementContentFormat): { width: number; height: number } {
  if (format === 'story') return { width: 1080, height: 1920 };
  if (format === 'square') return { width: 1080, height: 1080 };
  return { width: 1080, height: 1350 };
}

export function buildAnnouncementOverlaySvg(opts: AnnouncementOverlayInput): Buffer {
  const templateId = normalizeTemplateId(opts.templateId);
  const rawLayout = opts.layout ?? resolveTemplateLayout(templateId);
  const layout = applyPremiumPosterLayoutPatch(rawLayout, opts.sector);
  const svg = buildLayoutSvg(opts, layout);
  return Buffer.from(svg);
}

export function getTemplateById(id: AnnouncementTemplateId): AnnouncementTemplateDefinition {
  return getTemplateDefinition(id) ?? TEMPLATE_BY_ID.get('luxury_bottom')!;
}

export function templatesForUseCase(useCase: AnnouncementUseCase): AnnouncementTemplateDefinition[] {
  return AGENCY_TEMPLATE_CATALOG.filter((t) => t.useCases.includes(useCase));
}

/**
 * Returns the fixed template bundle used for auto-card production
 * (3 stories + 1 post per idea). Templates are varied to produce a diverse set
 * that covers different aesthetics from the same gallery photo.
 *
 * Bundle rules per use_case / template_use_case:
 *  - event / announcement → elegant story (luxury) + bold story (bold_caption) + minimal story (script) + editorial post
 *  - campaign / promo      → bold story + flush panel story + minimal story + campaign post
 *  - default               → same as announcement
 */
export interface AutoCardBundleSlot {
  format: 'story' | 'post';
  templateId: AnnouncementTemplateId;
  label: string;
}

const BUNDLE_EVENT_POOLS: Array<{ format: 'story' | 'post'; label: string; pool: AnnouncementTemplateId[] }> = [
  { format: 'story', label: 'Story — Lüks', pool: ['agency_luxury_bottom_01', 'agency_luxury_bottom_03', 'agency_luxury_bottom_05', 'agency_luxury_bottom_07'] },
  { format: 'story', label: 'Story — Bold', pool: ['agency_bold_caption_01', 'agency_bold_caption_02', 'agency_bold_caption_04', 'agency_bold_caption_06'] },
  { format: 'story', label: 'Story — Minimal', pool: ['agency_script_caption_01', 'agency_script_caption_03', 'agency_minimal_whisper_02', 'agency_minimal_whisper_05'] },
  { format: 'post', label: 'Post — Editoryal', pool: ['agency_editorial_left_01', 'agency_editorial_left_04', 'agency_editorial_left_07', 'agency_editorial_left_09'] },
];

const BUNDLE_CAMPAIGN_POOLS: Array<{ format: 'story' | 'post'; label: string; pool: AnnouncementTemplateId[] }> = [
  { format: 'story', label: 'Story — Bold', pool: ['agency_bold_caption_02', 'agency_bold_caption_05', 'agency_impact_vignette_01', 'agency_impact_vignette_04'] },
  { format: 'story', label: 'Story — Panel', pool: ['agency_flush_type_01', 'agency_flush_type_03', 'agency_offer_band_02', 'agency_offer_band_05'] },
  { format: 'story', label: 'Story — Lüks Alt', pool: ['agency_luxury_bottom_02', 'agency_luxury_bottom_04', 'agency_luxury_bottom_06', 'agency_luxury_bottom_08'] },
  { format: 'post', label: 'Post — Kampanya', pool: ['agency_campaign_badge_01', 'agency_campaign_badge_03', 'agency_campaign_badge_05', 'agency_offer_band_04'] },
];

/** @deprecated use pools — kept for reference */
const BUNDLE_EVENT: AutoCardBundleSlot[] = [
  { format: 'story', templateId: 'agency_luxury_bottom_01',   label: 'Story — Lüks' },
  { format: 'story', templateId: 'agency_bold_caption_01',    label: 'Story — Bold' },
  { format: 'story', templateId: 'agency_script_caption_01',  label: 'Story — Minimal' },
  { format: 'post',  templateId: 'agency_editorial_left_01',  label: 'Post — Editoryal' },
];

const BUNDLE_CAMPAIGN: AutoCardBundleSlot[] = [
  { format: 'story', templateId: 'agency_bold_caption_01',    label: 'Story — Bold' },
  { format: 'story', templateId: 'agency_flush_type_01',      label: 'Story — Panel' },
  { format: 'story', templateId: 'agency_luxury_bottom_04',   label: 'Story — Lüks Alt' },
  { format: 'post',  templateId: 'agency_campaign_badge_01',  label: 'Post — Kampanya' },
];

export function getAutoCardsBundle(useCase: AnnouncementUseCase, tenantId?: string): AutoCardBundleSlot[] {
  const pools = useCase === 'campaign' ? BUNDLE_CAMPAIGN_POOLS : BUNDLE_EVENT_POOLS;
  return pools.map((slot, index) => ({
    format: slot.format,
    label: slot.label,
    templateId: pickFromPool(slot.pool, tenantId, `announcement_bundle_${useCase}_${index}`, index),
  }));
}

export function featuredTemplatesForUseCase(useCase: AnnouncementUseCase): AnnouncementTemplateDefinition[] {
  const featured = FEATURED_TEMPLATE_IDS
    .map((id) => TEMPLATE_BY_ID.get(id))
    .filter((t): t is AnnouncementTemplateDefinition => Boolean(t));
  const legacy = Object.keys(LEGACY_TEMPLATE_ALIASES)
    .map((id) => TEMPLATE_BY_ID.get(id))
    .filter((t): t is AnnouncementTemplateDefinition => Boolean(t && t.useCases.includes(useCase)));
  const merged = [...legacy];
  for (const t of featured) {
    if (t.useCases.includes(useCase) && !merged.some((m) => m.family === t.family)) {
      merged.push(t);
    }
  }
  return merged;
}

export function resolveTemplateForContent(
  useCase: AnnouncementUseCase,
  prefs?: Partial<AnnouncementLibraryPreferences> | null,
  sectorId?: string | null,
): AnnouncementTemplateId {
  const parsed = parseAnnouncementPreferences(prefs);
  const sector = sectorId ? getSectorCollection(sectorId) : null;
  if (sector && isGenericAnnouncementDefaults(parsed)) {
    return sector.defaultPreferences[useCase];
  }
  return parsed[useCase] ?? DEFAULT_ANNOUNCEMENT_PREFERENCES[useCase];
}

export function sectorDefaultPreferences(sectorId?: string | null): AnnouncementLibraryPreferences {
  return getSectorCollection(sectorId).defaultPreferences;
}

export function parseAnnouncementPreferences(raw: unknown): AnnouncementLibraryPreferences {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_ANNOUNCEMENT_PREFERENCES };
  const o = raw as Record<string, unknown>;
  const pick = (key: keyof AnnouncementLibraryPreferences, fallback: AnnouncementTemplateId): AnnouncementTemplateId => {
    const v = o[key];
    return typeof v === 'string' && isValidTemplateId(v) ? v : fallback;
  };
  const fmt = o.defaultFormat ?? o.default_format;
  const defaultFormat: AnnouncementContentFormat =
    fmt === 'post' || fmt === 'square' || fmt === 'story' ? fmt : DEFAULT_ANNOUNCEMENT_PREFERENCES.defaultFormat;

  return {
    event: pick('event', DEFAULT_ANNOUNCEMENT_PREFERENCES.event),
    campaign: pick('campaign', DEFAULT_ANNOUNCEMENT_PREFERENCES.campaign),
    announcement: pick('announcement', DEFAULT_ANNOUNCEMENT_PREFERENCES.announcement),
    defaultFormat,
  };
}

/** Infer use-case from content idea metadata */
export function inferAnnouncementUseCase(input: {
  templateUseCase?: string;
  strategicPurpose?: string;
  hasEventDetails?: boolean;
}): AnnouncementUseCase {
  const blob = `${input.templateUseCase ?? ''} ${input.strategicPurpose ?? ''}`.toLowerCase();
  if (input.hasEventDetails || blob.includes('event')) return 'event';
  if (blob.includes('campaign') || blob.includes('offer') || blob.includes('promo')) return 'campaign';
  return 'announcement';
}

export function sectorTemplatesForUseCase(
  sectorId: string | null | undefined,
  useCase: AnnouncementUseCase,
): AnnouncementTemplateDefinition[] {
  return templatesForSectorPackage(sectorId ?? '', useCase)
    .map((id) => TEMPLATE_BY_ID.get(id))
    .filter((t): t is AnnouncementTemplateDefinition => Boolean(t));
}

export function searchTemplates(
  query: string,
  useCase?: AnnouncementUseCase,
  family?: string,
  collection?: string,
  sectorId?: string | null,
  sectorPackOnly?: boolean,
): AnnouncementTemplateDefinition[] {
  const q = query.trim().toLowerCase();
  let list = useCase ? templatesForUseCase(useCase) : [...AGENCY_TEMPLATE_CATALOG];
  if (sectorPackOnly && sectorId) {
    const allowed = new Set(templatesForSectorPackage(sectorId, useCase));
    list = list.filter((t) => allowed.has(t.id));
  }
  if (family) list = list.filter((t) => t.family === family);
  if (collection) list = list.filter((t) => t.collection === collection);
  if (!q) return list;
  return list.filter((t) =>
    t.id.includes(q)
    || t.name.toLowerCase().includes(q)
    || t.nameTr.toLowerCase().includes(q)
    || t.tags.some((tag) => tag.includes(q))
    || (t.inspiration?.toLowerCase().includes(q) ?? false),
  );
}
