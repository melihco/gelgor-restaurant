/**
 * content_calendar plan satırları ↔ mission artifact eşlemesi (APO-2 / P2).
 */
import type { OutputArtifact } from '@/types';
import { parseArtifactContent } from '@/app/mobile/_components/artifact-utils';
import {
  artifactProductionRole,
  type ProductionSlotRole,
} from '@/lib/mission-production-manifest';
import {
  getProductionBundleStatus,
  isBundleFailed,
  isBundleRendering,
  parseArtifactMissionId,
  resolveStoryVideoUrl,
} from '@/lib/production-bundle';
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
    meta.headline ?? content.headline ?? content.title ?? '',
  ).trim();
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
    const calIdx = meta.calendar_plan_index;
    if (typeof calIdx === 'number' && calIdx === itemIndex) return a;
    const metaIdx = meta.idea_index ?? content.idea_index;
    if (typeof metaIdx === 'number' && metaIdx === ideaIdx) return a;
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
