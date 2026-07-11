/**
 * content_calendar plan satırları ↔ mission artifact eşlemesi (APO-2 / P2).
 */
import type { OutputArtifact } from '@/types';
import { parseArtifactContent } from '@/lib/artifact-utils';
import {
  artifactProductionRole,
  type ProductionSlotRole,
} from '@/lib/mission-production-manifest';
import {
  getProductionBundleStatus,
  isBundleFailed,
  isBundleRendering,
  parseArtifactMissionId,
  resolveBrandedPostUrl,
  resolvePosterUrl,
  resolveStoryVideoUrl,
} from '@/lib/production-bundle';
import { resolveClientMediaUrl } from '@/lib/media-url';
import { publishScheduleFromMetadata } from '@/lib/feed-publish-schedule';

export type CalendarDeliveryStatus =
  | 'ready'
  | 'rendering'
  | 'failed'
  | 'missing'
  | 'pending'
  | 'unlinked';

export interface CalendarItemLink {
  itemIndex: number;
  status: CalendarDeliveryStatus;
  artifactId: string | null;
  headline: string;
  format: string;
  scheduleLabel: string | null;
  productionRole: ProductionSlotRole | null;
}

const DAY_ALIASES: Record<string, string> = {
  pzt: 'Mon', mon: 'Mon', monday: 'Mon',
  sal: 'Tue', tue: 'Tue', tuesday: 'Tue',
  çar: 'Wed', car: 'Wed', wed: 'Wed', wednesday: 'Wed',
  per: 'Thu', thu: 'Thu', thursday: 'Thu',
  cum: 'Fri', fri: 'Fri', friday: 'Fri',
  cmt: 'Sat', sat: 'Sat', saturday: 'Sat',
  paz: 'Sun', sun: 'Sun', sunday: 'Sun',
};

function normalizeDayToken(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  if (DAY_ALIASES[t]) return DAY_ALIASES[t];
  const cap = t.charAt(0).toUpperCase() + t.slice(1, 3);
  if (['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].includes(cap)) return cap;
  return null;
}

function normalizeHeadline(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function headlinesMatch(a: string, b: string): boolean {
  const na = normalizeHeadline(a);
  const nb = normalizeHeadline(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 8 && nb.length >= 8 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

export function calendarItemHeadline(item: Record<string, unknown>): string {
  return String(
    item.event_name ?? item.title ?? item.headline ?? item.concept_title ?? item.theme ?? '',
  ).trim();
}

export function calendarItemFormat(item: Record<string, unknown>): string {
  return String(item.format ?? item.content_type ?? item.content_kind ?? 'post')
    .toLowerCase()
    .replace(/^instagram_/, '');
}

function calendarScheduleKey(item: Record<string, unknown>): string | null {
  const dayRaw = String(item.day ?? item.publish_day ?? item.scheduled_day ?? item.date ?? '').trim();
  const day = normalizeDayToken(dayRaw.split(/[\s,]/)[0] ?? dayRaw) ?? normalizeDayToken(dayRaw);
  const time = String(item.time ?? item.scheduled_time ?? item.publish_time ?? '').trim();
  const fmt = calendarItemFormat(item);
  if (!day && !time) return null;
  return `${day ?? ''}|${time}|${fmt}`;
}

function artifactScheduleKey(meta: Record<string, unknown>, content: Record<string, unknown>): string | null {
  const slot = publishScheduleFromMetadata(meta);
  const fmt = String(
    meta.publish_schedule_format
    ?? content.kind
    ?? content.content_type
    ?? 'post',
  ).toLowerCase().replace(/^instagram_/, '');
  if (!slot) return null;
  return `${slot.day}|${slot.time}|${fmt}`;
}

function artifactHeadline(meta: Record<string, unknown>, content: Record<string, unknown>): string {
  return String(
    meta.ideation_headline
    ?? content.ideation_headline
    ?? meta.headline
    ?? content.headline
    ?? content.title
    ?? '',
  ).trim();
}

/** Stable index into Mission Hub ideation cards (before format-slot reindex). */
export function resolvePlanningIdeaIndex(
  idea: Record<string, unknown>,
): number | null {
  if (typeof idea.planning_idea_index === 'number' && Number.isFinite(idea.planning_idea_index)) {
    return idea.planning_idea_index;
  }
  if (typeof idea.calendar_linked_idea_index === 'number' && Number.isFinite(idea.calendar_linked_idea_index)) {
    return idea.calendar_linked_idea_index;
  }
  if (idea.manifest_slot_backfill === true || idea.source_node === 'format_backfill') {
    return null;
  }
  const idx = idea.idea_index;
  if (typeof idx === 'number' && Number.isFinite(idx) && idx >= 0 && idx < 1000) {
    return idx;
  }
  return null;
}

function artifactPlanningIdeaIndex(
  meta: Record<string, unknown>,
  content: Record<string, unknown>,
): number | null {
  if (typeof meta.planning_idea_index === 'number') return meta.planning_idea_index;
  if (typeof content.planning_idea_index === 'number') return content.planning_idea_index;
  if (typeof meta.calendar_linked_idea_index === 'number') return meta.calendar_linked_idea_index;
  if (typeof content.calendar_linked_idea_index === 'number') return content.calendar_linked_idea_index;
  return null;
}

function resolveCalendarArtifactStatus(
  artifact: OutputArtifact,
  format: string,
): CalendarDeliveryStatus {
  if (isBundleFailed(artifact)) return 'failed';
  if (isBundleRendering(artifact)) return 'rendering';
  const bundle = getProductionBundleStatus(artifact);
  if (bundle === 'rendering') return 'rendering';

  const fmt = format.toLowerCase();
  if (fmt.includes('reel')) {
    return resolveStoryVideoUrl(artifact) || /\.(mp4|mov|webm)/i.test(String(artifact.contentUrl ?? ''))
      ? 'ready'
      : bundle ? 'rendering' : 'missing';
  }
  if (fmt.includes('story')) {
    if (resolveStoryVideoUrl(artifact)) return 'ready';
    const url = String(artifact.contentUrl ?? '').trim();
    if (url && !/\.(mp4|mov|webm)/i.test(url)) return 'ready';
    return bundle ? 'rendering' : 'missing';
  }
  const url = String(artifact.contentUrl ?? '').trim();
  return url ? 'ready' : 'missing';
}

function matchArtifactToCalendarItem(
  item: Record<string, unknown>,
  itemIndex: number,
  artifacts: OutputArtifact[],
  usedIds: Set<string>,
  missionId: string,
): OutputArtifact | null {
  const headline = calendarItemHeadline(item);
  const fmt = calendarItemFormat(item);
  const schedKey = calendarScheduleKey(item);
  const ideaIdx = typeof item.idea_index === 'number'
    ? item.idea_index
    : typeof item.day === 'number' && item.day >= 0
      ? item.day - 1
      : itemIndex;

  const missionArts = artifacts.filter((a) => {
    if (usedIds.has(a.id)) return false;
    return parseArtifactMissionId(a) === missionId;
  });

  for (const a of missionArts) {
    const meta = (a.metadata ?? {}) as Record<string, unknown>;
    const content = parseArtifactContent(a.content) as Record<string, unknown>;
    const planningIdx = artifactPlanningIdeaIndex(meta, content);
    if (planningIdx != null && planningIdx === itemIndex) return a;
    const calIdx = meta.calendar_plan_index;
    if (typeof calIdx === 'number' && calIdx === itemIndex) return a;
    // Legacy: production slot index — skip when stable planning index is stored.
    if (planningIdx == null) {
      const metaIdx = meta.idea_index ?? content.idea_index;
      if (typeof metaIdx === 'number' && metaIdx === ideaIdx) return a;
    }
  }

  if (schedKey) {
    const bySched = missionArts.find((a) => {
      const meta = (a.metadata ?? {}) as Record<string, unknown>;
      const content = parseArtifactContent(a.content) as Record<string, unknown>;
      return artifactScheduleKey(meta, content) === schedKey;
    });
    if (bySched) return bySched;
  }

  if (headline) {
    const byHeadline = missionArts.find((a) => {
      const meta = (a.metadata ?? {}) as Record<string, unknown>;
      const content = parseArtifactContent(a.content) as Record<string, unknown>;
      return headlinesMatch(headline, artifactHeadline(meta, content));
    });
    if (byHeadline) return byHeadline;
  }

  return null;
}

/** Mission Hub planning cards — thumbnail for linked produced artifact. */
export function resolveArtifactHubPreviewUrl(artifact: OutputArtifact): string | null {
  const content = parseArtifactContent(artifact.content) as Record<string, unknown>;
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const isVideoUrl = (url: string) => /\.(mp4|mov|webm)(\?|$)/i.test(url);

  const branded = resolveBrandedPostUrl(artifact);
  const poster = resolvePosterUrl(artifact);
  const video = resolveStoryVideoUrl(artifact);
  const contentUrl = String(artifact.contentUrl ?? '').trim();

  const stillCandidates = [
    branded,
    poster,
    meta.imageUrl,
    content.imageUrl,
    meta.feed_preview_url,
    content.feed_preview_url,
    meta.reference_photo_url,
    content.reference_photo_url,
    !video && contentUrl && !isVideoUrl(contentUrl) ? contentUrl : null,
  ];

  for (const candidate of stillCandidates) {
    const url = String(candidate ?? '').trim();
    if (!url || isVideoUrl(url)) continue;
    return resolveClientMediaUrl(url) ?? url;
  }

  if (video) {
    return resolveClientMediaUrl(video) ?? video;
  }

  return null;
}

export function planningItemReferenceUrl(item: Record<string, unknown>): string | null {
  const raw = String(
    item.photo_url
    ?? item.background_reference_url
    ?? item.reference_photo_url
    ?? '',
  ).trim();
  if (!raw || /\.(mp4|mov|webm)(\?|$)/i.test(raw)) return null;
  return resolveClientMediaUrl(raw) ?? raw;
}

export function planningItemHeadline(item: Record<string, unknown>, fallbackIndex: number): string {
  return String(
    item.concept_title
    ?? item.conceptTitle
    ?? item.idea_title
    ?? item.title
    ?? item.headline
    ?? item.event_name
    ?? item.theme
    ?? `Plan ${fallbackIndex + 1}`,
  ).trim();
}

/** content_ideation / visual_design_cards ↔ produced artifact (same matcher as calendar). */
export function linkPlanningItemsToArtifacts(
  items: unknown[],
  artifacts: OutputArtifact[],
  missionId: string,
  opts?: { missionInFlight?: boolean },
): CalendarItemLink[] {
  return linkCalendarItemsToArtifacts(items, artifacts, missionId, opts);
}

export function linkCalendarItemsToArtifacts(
  items: unknown[],
  artifacts: OutputArtifact[],
  missionId: string,
  opts?: { missionInFlight?: boolean },
): CalendarItemLink[] {
  const inFlight = opts?.missionInFlight ?? false;
  const used = new Set<string>();

  return items.map((raw, itemIndex) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const headline = calendarItemHeadline(item) || `Plan ${itemIndex + 1}`;
    const format = calendarItemFormat(item);
    const day = String(item.date ?? item.day ?? '').trim();
    const time = String(item.time ?? '').trim();
    const scheduleLabel = [day, time, format].filter(Boolean).join(' · ') || null;

    const artifact = matchArtifactToCalendarItem(item, itemIndex, artifacts, used, missionId);
    if (artifact) used.add(artifact.id);

    const meta = (artifact?.metadata ?? {}) as Record<string, unknown>;
    const status: CalendarDeliveryStatus = artifact
      ? resolveCalendarArtifactStatus(artifact, format)
      : inFlight
        ? 'pending'
        : 'missing';

    return {
      itemIndex,
      status,
      artifactId: artifact?.id ?? null,
      headline,
      format,
      scheduleLabel,
      productionRole: artifact ? artifactProductionRole(meta) : null,
    };
  });
}

export const CALENDAR_STATUS_TR: Record<CalendarDeliveryStatus, string> = {
  ready: 'Feed\'de',
  rendering: 'Render',
  failed: 'Hata',
  missing: 'Eksik',
  pending: 'Üretiliyor',
  unlinked: '—',
};
