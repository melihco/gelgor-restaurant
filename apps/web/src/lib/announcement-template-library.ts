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
  const layout = opts.layout ?? resolveTemplateLayout(templateId);
  const svg = buildLayoutSvg(opts, layout);
  return Buffer.from(svg);
}

export function getTemplateById(id: AnnouncementTemplateId): AnnouncementTemplateDefinition {
  return getTemplateDefinition(id) ?? TEMPLATE_BY_ID.get('luxury_bottom')!;
}

export function templatesForUseCase(useCase: AnnouncementUseCase): AnnouncementTemplateDefinition[] {
  return AGENCY_TEMPLATE_CATALOG.filter((t) => t.useCases.includes(useCase));
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
