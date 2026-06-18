/**
 * Mission ideation + content_calendar → unified auto-produce plan.
 * Calendar drives format/schedule; ideation supplies headline, caption, hashtags.
 */
import { mergeMissionIdeationRecords } from '@/lib/parse-ideation-summary';
import { nodeHasOutput, nodeOutputArray } from '@/lib/mission-node-output';
import { calendarItemFormat, calendarItemHeadline } from '@/lib/content-calendar-artifact-link';
import { detectIdeaPackageFormat } from '@/lib/weekly-publish-package';
import { MISSION_WEEKLY_PACKAGE_COUNTS } from '@/lib/mission-production-manifest';
import { resolveIdeationHeadline } from '@/lib/production-idea-parse';

type MissionNode = {
  node_key?: string;
  output_summary?: string | null;
  output_payload?: unknown;
  status?: string;
  task_type?: string;
};

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

function ideationHeadline(idea: Record<string, unknown>): string {
  return resolveIdeationHeadline(idea);
}

function calendarFormatToContentType(fmt: string): string {
  const f = fmt.toLowerCase().replace(/^instagram_/, '');
  if (f.includes('reel')) return 'instagram_reel';
  if (f.includes('carousel')) return 'instagram_carousel';
  if (f.includes('story')) return 'instagram_story';
  if (f.includes('canvas') || f.includes('event')) return 'instagram_canvas';
  return 'instagram_post';
}

function normalizeCalendarDay(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) {
    const d = new Date(`${iso[1]}T12:00:00Z`);
    if (!Number.isNaN(d.getTime())) {
      return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] ?? s;
    }
  }
  const token = s.split(/[\s,·]/)[0]?.trim() ?? s;
  const map: Record<string, string> = {
    pzt: 'Mon', mon: 'Mon', monday: 'Mon',
    sal: 'Tue', tue: 'Tue', tuesday: 'Tue',
    çar: 'Wed', car: 'Wed', wed: 'Wed', wednesday: 'Wed',
    per: 'Thu', thu: 'Thu', thursday: 'Thu',
    cum: 'Fri', fri: 'Fri', friday: 'Fri',
    cmt: 'Sat', sat: 'Sat', saturday: 'Sat',
    paz: 'Sun', sun: 'Sun', sunday: 'Sun',
  };
  const key = token.toLowerCase();
  if (map[key]) return map[key]!;
  const cap = token.charAt(0).toUpperCase() + token.slice(1, 3);
  if (['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].includes(cap)) return cap;
  return token;
}

export function parseCalendarPlanRecords(
  outputSummary: string | null | undefined,
): Record<string, unknown>[] {
  if (!outputSummary?.trim()) return [];
  return nodeOutputArray(
    { output_summary: outputSummary },
    ['plans', 'calendar', 'items', 'content_calendar', 'schedule'],
  ).slice(0, 12);
}

function parseCalendarPlanRecordsFromNode(node: MissionNode): Record<string, unknown>[] {
  return nodeOutputArray(
    node,
    ['plans', 'calendar', 'items', 'content_calendar', 'schedule'],
  ).slice(0, 12);
}

function pickIdeationForCalendar(
  plan: Record<string, unknown>,
  planIndex: number,
  ideas: Record<string, unknown>[],
  used: Set<number>,
): { idea: Record<string, unknown> | null; index: number | null } {
  const ideaIdx = typeof plan.idea_index === 'number'
    ? plan.idea_index
    : typeof plan.source_idea_index === 'number'
      ? plan.source_idea_index
      : null;
  if (ideaIdx != null && ideaIdx >= 0 && ideaIdx < ideas.length && !used.has(ideaIdx)) {
    return { idea: ideas[ideaIdx]!, index: ideaIdx };
  }

  const calTitle = calendarItemHeadline(plan);
  if (calTitle) {
    for (let i = 0; i < ideas.length; i += 1) {
      if (used.has(i)) continue;
      if (headlinesMatch(calTitle, ideationHeadline(ideas[i]!))) {
        return { idea: ideas[i]!, index: i };
      }
    }
  }

  if (planIndex < ideas.length && !used.has(planIndex)) {
    return { idea: ideas[planIndex]!, index: planIndex };
  }

  for (let i = 0; i < ideas.length; i += 1) {
    if (!used.has(i)) return { idea: ideas[i]!, index: i };
  }
  return { idea: null, index: null };
}

function resolvePlanningCaption(
  idea: Record<string, unknown> | null,
  plan: Record<string, unknown>,
): string {
  const fromIdea = String(idea?.caption_draft ?? idea?.caption ?? '').trim();
  if (fromIdea) return fromIdea;
  const fromPlan = String(plan.caption_draft ?? plan.caption ?? '').trim();
  if (fromPlan) return fromPlan;
  const tagline = String(
    plan.tagline ?? plan.subline ?? idea?.tagline ?? idea?.subline ?? '',
  ).trim();
  const brief = String(
    plan.content_brief ?? plan.description ?? plan.brief ?? idea?.brief ?? '',
  ).trim();
  const parts = [tagline, brief].filter(Boolean);
  if (parts.length) return parts.join(' — ');
  return calendarItemHeadline(plan);
}

function mergePlanWithIdeation(
  plan: Record<string, unknown>,
  planIndex: number,
  idea: Record<string, unknown> | null,
  ideaIndex: number | null,
): Record<string, unknown> {
  const fmt = calendarItemFormat(plan);
  const calTitle = calendarItemHeadline(plan);
  const day = normalizeCalendarDay(plan.date ?? plan.day ?? plan.publish_day ?? plan.scheduled_day);
  const time = String(plan.time ?? plan.scheduled_time ?? plan.publish_time ?? '').trim();
  const caption = resolvePlanningCaption(idea, plan);
  const hashtags = idea?.hashtags ?? plan.hashtags ?? plan.hashtag_set ?? [];
  const headline = ideationHeadline(idea ?? {}) || calTitle;
  const subline = String(
    plan.tagline ?? plan.subline ?? idea?.tagline ?? idea?.subline ?? '',
  ).trim();
  const cta = String(idea?.cta ?? plan.cta_text ?? plan.cta ?? '').trim();
  const visualDirection = String(
    plan.visual_direction ?? plan.photo_mood ?? plan.visual_style ?? plan.visual_mood
    ?? idea?.visual_direction ?? idea?.photo_mood ?? '',
  ).trim();
  const postingSuggestion = String(
    idea?.posting_time_suggestion ?? idea?.postingTime ?? '',
  ).trim()
    || [plan.date, time].filter(Boolean).join(' ').trim()
    || undefined;

  return {
    ...(idea ?? {}),
    concept_title: headline,
    headline,
    title: headline,
    caption_draft: caption,
    caption,
    subline: subline || undefined,
    cta: cta || undefined,
    hashtags,
    content_type: calendarFormatToContentType(fmt),
    content_kind: calendarFormatToContentType(fmt),
    format: fmt,
    calendar_plan_index: planIndex,
    idea_index: ideaIndex ?? planIndex,
    source_node: 'content_calendar',
    publish_schedule_day: day,
    publish_schedule_time: time,
    publish_schedule_format: fmt,
    posting_time_suggestion: postingSuggestion,
    calendar_priority: plan.priority ?? plan.must_post ?? null,
    calendar_announcement_type: plan.announcement_type ?? plan.type ?? null,
    visual_direction: visualDirection || null,
    strategic_purpose: plan.strategic_purpose ?? idea?.strategic_purpose ?? null,
    template_use_case: plan.template_use_case ?? plan.announcement_type ?? idea?.template_use_case ?? null,
    event_details: {
      ...(typeof idea?.event_details === 'object' && idea?.event_details
        ? idea.event_details as Record<string, unknown>
        : {}),
      date: String(plan.date ?? '').trim() || undefined,
      time: time || undefined,
      tagline: subline || undefined,
      venue_area: String(plan.venue_area ?? '').trim() || undefined,
    },
    mood: plan.photo_mood ?? idea?.mood ?? undefined,
  };
}

/** Calendar-first plan: one feed output per calendar row, enriched from ideation. */
export function mergeIdeationWithCalendarPlans(
  ideationRecords: Record<string, unknown>[],
  calendarPlans: Record<string, unknown>[],
): Record<string, unknown>[] {
  if (calendarPlans.length === 0) return ideationRecords;

  const used = new Set<number>();
  const merged = calendarPlans.map((plan, planIndex) => {
    const { idea, index } = pickIdeationForCalendar(plan, planIndex, ideationRecords, used);
    if (index != null) used.add(index);
    return mergePlanWithIdeation(plan, planIndex, idea, index);
  });

  for (let i = 0; i < ideationRecords.length; i += 1) {
    if (used.has(i)) continue;
    const idea = ideationRecords[i]!;
    merged.push({
      ...idea,
      idea_index: i,
      source_node: 'content_ideation',
      content_type: idea.content_type ?? idea.content_kind ?? 'instagram_post',
    });
  }

  return merged;
}

type PackageFormat = 'story' | 'post' | 'reel' | 'carousel';

const FORMAT_TARGETS: Record<PackageFormat, number> = {
  story: MISSION_WEEKLY_PACKAGE_COUNTS.story,
  post: MISSION_WEEKLY_PACKAGE_COUNTS.post,
  carousel: MISSION_WEEKLY_PACKAGE_COUNTS.carousel,
  reel: MISSION_WEEKLY_PACKAGE_COUNTS.reel,
};

function contentTypeForFormat(fmt: PackageFormat): string {
  if (fmt === 'reel') return 'instagram_reel';
  if (fmt === 'carousel') return 'instagram_carousel';
  if (fmt === 'story') return 'instagram_story';
  return 'instagram_post';
}

function ideaTrackKey(idea: Record<string, unknown>): string {
  return `${ideationHeadline(idea)}|${detectIdeaPackageFormat(idea)}`;
}

function cloneIdeaForFormat(
  donor: Record<string, unknown>,
  fmt: PackageFormat,
  slotIndex: number,
): Record<string, unknown> {
  const headline = ideationHeadline(donor) || `Haftalık ${fmt} ${slotIndex + 1}`;
  return {
    ...donor,
    concept_title: headline,
    headline,
    title: headline,
    content_type: contentTypeForFormat(fmt),
    content_kind: contentTypeForFormat(fmt),
    format: fmt,
    source_node: 'format_backfill',
    manifest_slot_backfill: true,
  };
}

/**
 * P1-5 — Ensure 2 story + 2 post + 1 reel before manifest routing.
 * Calendar rows and ideation overflow backfill missing format buckets.
 */
export function ensureWeeklyFormatCoverage(
  primary: Record<string, unknown>[],
  pool: Record<string, unknown>[],
): Record<string, unknown>[] {
  const buckets: Record<PackageFormat, Record<string, unknown>[]> = {
    story: [],
    post: [],
    carousel: [],
    reel: [],
  };
  const usedKeys = new Set<string>();

  for (const idea of primary) {
    const fmt = detectIdeaPackageFormat(idea);
    if (buckets[fmt].length < FORMAT_TARGETS[fmt]) {
      buckets[fmt].push(idea);
      usedKeys.add(ideaTrackKey(idea));
    }
  }

  const pickDonor = (fmt: PackageFormat): Record<string, unknown> | null => {
    const sameFmt = pool.find(
      (idea) => detectIdeaPackageFormat(idea) === fmt && !usedKeys.has(ideaTrackKey(idea)),
    );
    if (sameFmt) return sameFmt;
    return pool.find((idea) => !usedKeys.has(ideaTrackKey(idea))) ?? null;
  };

  for (const fmt of ['story', 'post', 'carousel', 'reel'] as const) {
    while (buckets[fmt].length < FORMAT_TARGETS[fmt]) {
      const donor = pickDonor(fmt) ?? primary[0] ?? pool[0];
      if (!donor) break;
      const next = detectIdeaPackageFormat(donor) === fmt
        ? { ...donor }
        : cloneIdeaForFormat(donor, fmt, buckets[fmt].length);
      buckets[fmt].push(next);
      usedKeys.add(ideaTrackKey(next));
    }
  }

  return [
    ...buckets.story,
    ...buckets.post,
    ...buckets.carousel,
    ...buckets.reel,
  ]
    .slice(0, MISSION_WEEKLY_PACKAGE_COUNTS.total)
    .map((idea, index) => ({ ...idea, idea_index: index }));
}

export function buildMissionProductionIdeas(params: {
  nodes: MissionNode[];
  missionId?: string;
}): Record<string, unknown>[] {
  const ideationNodes = params.nodes.filter((n) => n.task_type === 'content_ideation');
  const calendarNodes = params.nodes.filter(
    (n) => n.task_type === 'content_calendar' && n.status === 'completed',
  );

  const ideationRecords = mergeMissionIdeationRecords(ideationNodes, params.missionId);
  const calendarPlans = calendarNodes.flatMap(parseCalendarPlanRecordsFromNode);
  const merged = mergeIdeationWithCalendarPlans(ideationRecords, calendarPlans);

  if (merged.length === 0) {
    return ensureWeeklyFormatCoverage(ideationRecords, ideationRecords);
  }

  const pool = [
    ...ideationRecords,
    ...calendarPlans.map((plan, planIndex) =>
      mergePlanWithIdeation(plan, planIndex, null, null),
    ),
  ];
  return ensureWeeklyFormatCoverage(merged, pool);
}

export function calendarNodesPending(nodes: MissionNode[]): boolean {
  const calendars = nodes.filter((n) => n.task_type === 'content_calendar');
  if (calendars.length === 0) return false;
  return calendars.some(
    (n) => n.status !== 'completed' || !nodeHasOutput(n),
  );
}

export function visualDesignNodesPending(nodes: MissionNode[]): boolean {
  const cards = nodes.filter((n) => n.task_type === 'visual_design_cards');
  if (cards.length === 0) return false;
  return cards.some(
    (n) => n.status !== 'completed' || !nodeHasOutput(n),
  );
}
