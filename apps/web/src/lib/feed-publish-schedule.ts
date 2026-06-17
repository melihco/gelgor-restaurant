/**
 * Feed — yayın takvimi (calendar → FD → manifest default → artifact metadata).
 */
import type { OutputArtifact } from '@/types';
import {
  resolvePublishSlotForIdea,
  type FeedArtDirectorReport,
} from '@/lib/weekly-publish-package';
import { MISSION_WEEKLY_PACKAGE_COUNTS } from '@/lib/mission-production-manifest';

export type PublishScheduleSource = 'calendar' | 'feed_director' | 'manifest_default';

export interface ResolvedPublishSchedule {
  source: PublishScheduleSource;
  day: string;
  time: string;
  format: string;
  calendar_plan_index?: number;
  source_node?: string;
}

/** Weekly manifest slot order — 3 story, 2 post, 1 carousel, 1 reel. */
const MANIFEST_DEFAULT_SCHEDULE: Array<{ day: string; time: string; format: string }> = [
  { day: 'Mon', time: '09:00', format: 'story' },
  { day: 'Tue', time: '11:00', format: 'story' },
  { day: 'Wed', time: '18:00', format: 'story' },
  { day: 'Thu', time: '10:00', format: 'post' },
  { day: 'Fri', time: '14:00', format: 'post' },
  { day: 'Sat', time: '12:00', format: 'carousel' },
  { day: 'Sun', time: '19:00', format: 'reel' },
];

function normalizeScheduleFormat(raw: unknown): string {
  const f = String(raw ?? '').toLowerCase().replace(/^instagram_/, '');
  if (f.includes('reel')) return 'reel';
  if (f.includes('carousel')) return 'carousel';
  if (f.includes('story') || f.includes('canvas')) return 'story';
  if (f.includes('post') || f.includes('ad')) return 'post';
  return '';
}

function ideaScheduleFormat(
  idea: Record<string, unknown>,
  formatHint?: string,
): string {
  return normalizeScheduleFormat(formatHint)
    || normalizeScheduleFormat(idea.publish_schedule_format)
    || normalizeScheduleFormat(idea.format)
    || normalizeScheduleFormat(idea.content_type)
    || normalizeScheduleFormat(idea.content_kind)
    || 'post';
}

/**
 * Resolve publish schedule for one production idea.
 * Priority: calendar fields on idea → FD publish_schedule → manifest week template.
 */
export function resolvePublishSchedule(input: {
  idea: Record<string, unknown>;
  ideaIndex: number;
  feedDirectorReport?: FeedArtDirectorReport | Record<string, unknown> | null;
  formatHint?: string;
}): ResolvedPublishSchedule {
  const { idea, ideaIndex, feedDirectorReport, formatHint } = input;
  const calDay = String(idea.publish_schedule_day ?? '').trim();
  if (calDay) {
    return {
      source: 'calendar',
      day: calDay,
      time: String(idea.publish_schedule_time ?? '').trim() || '12:00',
      format: ideaScheduleFormat(idea, formatHint),
      calendar_plan_index: typeof idea.calendar_plan_index === 'number'
        ? idea.calendar_plan_index
        : ideaIndex,
      source_node: String(idea.source_node ?? 'content_calendar').trim() || 'content_calendar',
    };
  }

  const fdSlot = resolvePublishSlotForIdea(
    feedDirectorReport as FeedArtDirectorReport | null | undefined,
    ideaIndex,
  );
  if (fdSlot?.day) {
    return {
      source: 'feed_director',
      day: fdSlot.day,
      time: fdSlot.suggested_time || '12:00',
      format: normalizeScheduleFormat(fdSlot.format) || ideaScheduleFormat(idea, formatHint),
    };
  }

  const slotIndex = Math.max(
    0,
    Math.min(ideaIndex, MISSION_WEEKLY_PACKAGE_COUNTS.total - 1),
  );
  const fallback = MANIFEST_DEFAULT_SCHEDULE[slotIndex] ?? MANIFEST_DEFAULT_SCHEDULE[0]!;
  return {
    source: 'manifest_default',
    day: fallback.day,
    time: fallback.time,
    format: ideaScheduleFormat(idea, formatHint) || fallback.format,
  };
}

/** Flatten resolved schedule into artifact metadata fields. */
export function publishScheduleToMetadata(
  schedule: ResolvedPublishSchedule,
): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    publish_schedule_day: schedule.day,
    publish_schedule_time: schedule.time,
    publish_schedule_format: schedule.format,
    publish_schedule_source: schedule.source,
  };
  if (schedule.calendar_plan_index != null) {
    meta.calendar_plan_index = schedule.calendar_plan_index;
  }
  if (schedule.source_node) {
    meta.source_node = schedule.source_node;
  }
  return meta;
}

const DAY_ORDER: Record<string, number> = {
  Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  Pzt: 0, Sal: 1, Çar: 2, Per: 3, Cum: 4, Cmt: 5, Paz: 6,
};

const DAY_TR: Record<string, string> = {
  Mon: 'Pzt', Tue: 'Sal', Wed: 'Çar', Thu: 'Per', Fri: 'Cum', Sat: 'Cmt', Sun: 'Paz',
};

export function publishScheduleFromMetadata(
  meta: Record<string, unknown>,
): { day: string; time: string; format: string } | null {
  const day = String(meta.publish_schedule_day ?? '').trim();
  if (!day) return null;
  return {
    day,
    time: String(meta.publish_schedule_time ?? '').trim(),
    format: String(meta.publish_schedule_format ?? '').trim(),
  };
}

/** Human label — editorial recommendation only (Onayla = immediate Mertcafe publish). */
export function formatPublishScheduleLabel(meta: Record<string, unknown>): string | null {
  const slot = publishScheduleFromMetadata(meta);
  if (!slot) return null;
  const dayTr = DAY_TR[slot.day] ?? slot.day;
  const parts = ['Önerilen', dayTr];
  if (slot.time) parts.push(slot.time);
  if (slot.format) parts.push(slot.format);
  return parts.join(' · ');
}

/** Sort key — lower = earlier in week / day (unscheduled → end). */
export function publishScheduleSortKey(meta: Record<string, unknown>): number {
  const slot = publishScheduleFromMetadata(meta);
  if (!slot) return 999_999;
  const dayIdx = DAY_ORDER[slot.day] ?? 50;
  const [h = 0, m = 0] = slot.time.split(':').map((x) => parseInt(x, 10) || 0);
  return dayIdx * 10_000 + h * 60 + m;
}

export function compareArtifactsByPublishSchedule(a: OutputArtifact, b: OutputArtifact): number {
  const ma = (a.metadata ?? {}) as Record<string, unknown>;
  const mb = (b.metadata ?? {}) as Record<string, unknown>;
  return publishScheduleSortKey(ma) - publishScheduleSortKey(mb);
}

export function sortFeedArtifactsForDisplay(
  items: OutputArtifact[],
  opts?: { missionScoped?: boolean },
): OutputArtifact[] {
  const missionScoped = opts?.missionScoped ?? false;
  return [...items].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'pending_review' ? -1 : 1;
    }
    if (missionScoped) {
      const sched = compareArtifactsByPublishSchedule(a, b);
      if (sched !== 0) return sched;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}
