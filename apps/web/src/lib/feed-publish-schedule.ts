/**
 * Feed — yayın takvimi (calendar → FD → manifest default → artifact metadata).
 */
import type { OutputArtifact } from '@/types';
import { compareArtifactsByProductionTime } from '@/lib/artifact-production-time';
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

/** Weekly manifest fallback — 10 generated slots spread across a 7-day publish goal. */
const MANIFEST_DEFAULT_SCHEDULE: Array<{ day: string; time: string; format: string }> = [
  { day: 'Mon', time: '09:00', format: 'post' },
  { day: 'Mon', time: '19:00', format: 'story' },
  { day: 'Tue', time: '11:00', format: 'post' },
  { day: 'Wed', time: '12:00', format: 'carousel' },
  { day: 'Thu', time: '10:00', format: 'story' },
  { day: 'Fri', time: '14:00', format: 'post' },
  { day: 'Fri', time: '20:00', format: 'story' },
  { day: 'Sat', time: '12:00', format: 'post' },
  { day: 'Sat', time: '19:00', format: 'reel' },
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
      // Actual manifest slot (formatHint / assignment) wins over FD editorial guess —
      // one ideation row fans out to post + reel + carousel slots at the same idea_index.
      format: ideaScheduleFormat(idea, formatHint)
        || normalizeScheduleFormat(fdSlot.format),
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

/**
 * Display format for schedule chip — reconciles stale metadata with actual slot role.
 * (Multiple manifest slots share one idea_index; FD/calendar format can lag assignment.)
 */
export function resolveScheduleDisplayFormat(
  meta: Record<string, unknown>,
  kind?: string,
): string {
  const k = String(kind ?? '').toLowerCase();
  if (k === 'reel' || k === 'story' || k === 'carousel' || k === 'post') return k;

  const role = String(meta.production_role ?? '').toLowerCase();
  const pipeline = String(meta.pipeline ?? '').toLowerCase();
  if (role.includes('reel') || pipeline === 'fal_reel') return 'reel';
  if (role === 'organic_carousel' || pipeline === 'carousel_gallery') return 'carousel';
  if (role.includes('story') || pipeline.includes('story')) return 'story';

  return normalizeScheduleFormat(meta.publish_schedule_format) || 'post';
}

/** Human label — editorial recommendation only (Onayla = immediate Mertcafe publish). */
export function formatPublishScheduleLabel(
  meta: Record<string, unknown>,
  opts?: { kind?: string },
): string | null {
  const slot = publishScheduleFromMetadata(meta);
  if (!slot) return null;
  const dayTr = DAY_TR[slot.day] ?? slot.day;
  const displayFormat = resolveScheduleDisplayFormat(meta, opts?.kind);
  const parts = ['Önerilen', dayTr];
  if (slot.time) parts.push(slot.time);
  if (displayFormat) parts.push(displayFormat);
  return parts.join(' · ');
}

/** Short label for schedule button subtitle — e.g. "Pzt · 12:00" */
export function formatScheduleButtonSubtitle(meta: Record<string, unknown>): string | null {
  const suggestion = String(meta.posting_time_suggestion ?? '').trim();
  if (suggestion) {
    const short = suggestion.split('—')[0]?.trim() || suggestion;
    return short.slice(0, 48);
  }
  const slot = publishScheduleFromMetadata(meta);
  if (!slot) return null;
  const dayTr = DAY_TR[slot.day] ?? slot.day;
  return slot.time ? `${dayTr} · ${slot.time}` : dayTr;
}

/** Full scheduling hint for feed chips — ideation suggestion first, then structured calendar slot. */
export function formatFeedScheduleHint(
  meta: Record<string, unknown>,
  opts?: { kind?: string },
): string | null {
  const suggestion = String(meta.posting_time_suggestion ?? '').trim();
  if (suggestion) return suggestion.slice(0, 80);
  return formatPublishScheduleLabel(meta, opts);
}

const JS_WEEKDAY: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  Paz: 0, Pzt: 1, Sal: 2, Çar: 3, Per: 4, Cum: 5, Cmt: 6,
};

/** Next occurrence of metadata day+time as ISO (for schedule sheet default). */
export function resolveSuggestedScheduleISO(meta: Record<string, unknown>): string | null {
  const slot = publishScheduleFromMetadata(meta);
  if (!slot?.day) return null;
  const targetDay = JS_WEEKDAY[slot.day];
  if (targetDay === undefined) return null;
  const [hh = 12, mm = 0] = slot.time.split(':').map((x) => parseInt(x, 10) || 0);
  const now = new Date();
  const candidate = new Date(now);
  candidate.setHours(hh, mm, 0, 0);
  let daysAhead = (targetDay - candidate.getDay() + 7) % 7;
  if (daysAhead === 0 && candidate.getTime() <= now.getTime()) daysAhead = 7;
  candidate.setDate(candidate.getDate() + daysAhead);
  return candidate.toISOString();
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
    if (missionScoped) {
      const sched = compareArtifactsByPublishSchedule(a, b);
      if (sched !== 0) return sched;
    }
    return compareArtifactsByProductionTime(a, b);
  });
}
