/**
 * Mission ideation → auto-produce plan.
 * content_ideation = caption/headline base; content_calendar enriches matched ideas
 * AND every calendar plan is produced as its own row (additive: ideas + calendar).
 */
import {
  collectUniqueMissionIdeationIdeas,
} from '@/lib/parse-ideation-summary';
import { nodeHasOutput, nodeOutputArray } from '@/lib/mission-node-output';
import { calendarItemFormat, calendarItemHeadline } from '@/lib/content-calendar-artifact-link';
import { detectIdeaPackageFormat } from '@/lib/weekly-publish-package';
import { resolveWeeklyPackageGeometry } from '@/lib/package-weekly-geometry';
import type { PackageGeometry } from '@/lib/mission-production-manifest';
import { resolveIdeationHeadline } from '@/lib/production-idea-parse';
import {
  buildCalendarFalSceneHint,
  MAX_CALENDAR_PLANS_PER_MISSION,
  normalizeCalendarPlanToProductionIdea,
} from '@/lib/calendar-production-pack';
import {
  applyCalendarDesignLayoutToIdea,
  resolveCalendarDesignLayout,
} from '@/lib/calendar-design-layout';
import { normalizeCalendarPlanDesignLayout } from '@/lib/calendar-agent-schema';
import {
  linkPlanningItemsToArtifacts,
  resolvePlanningIdeaIndex,
  type CalendarItemLink,
} from '@/lib/content-calendar-artifact-link';
import { parseArtifactMissionId } from '@/lib/production-bundle';
import { filterFeedPublishableArtifacts } from '@/lib/weekly-publish-package';
import type { OutputArtifact } from '@/types';

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
  ).slice(0, MAX_CALENDAR_PLANS_PER_MISSION);
}

function parseCalendarPlanRecordsFromNode(node: MissionNode): Record<string, unknown>[] {
  return nodeOutputArray(
    node,
    ['plans', 'calendar', 'items', 'content_calendar', 'schedule'],
  ).slice(0, MAX_CALENDAR_PLANS_PER_MISSION);
}

function pickIdeationForCalendarStrict(
  plan: Record<string, unknown>,
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

  return { idea: null, index: null };
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

/** Schedule-only fields from a calendar row — does not replace caption/headline. */
export function calendarScheduleOverlayFields(
  plan: Record<string, unknown>,
  planIndex: number,
  ideaIndex: number,
): Record<string, unknown> {
  const fmt = calendarItemFormat(plan);
  const day = normalizeCalendarDay(plan.date ?? plan.day ?? plan.publish_day ?? plan.scheduled_day);
  const time = String(plan.time ?? plan.scheduled_time ?? plan.publish_time ?? '').trim();
  const postingSuggestion = [plan.date, time].filter(Boolean).join(' ').trim();

  return {
    calendar_plan_index: planIndex,
    calendar_linked_idea_index: ideaIndex,
    publish_schedule_day: day,
    publish_schedule_date: String(plan.date ?? '').trim().slice(0, 10) || undefined,
    publish_schedule_time: time || undefined,
    publish_schedule_format: fmt,
    calendar_priority: plan.priority ?? plan.must_post ?? null,
    calendar_announcement_type: plan.announcement_type ?? plan.type ?? null,
    ...(postingSuggestion ? { posting_time_suggestion: postingSuggestion } : {}),
  };
}

function mergeEventDetailsFromCalendar(
  idea: Record<string, unknown>,
  plan: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const subline = String(plan.tagline ?? plan.subline ?? '').trim();
  const time = String(plan.time ?? plan.scheduled_time ?? plan.publish_time ?? '').trim();
  const base = typeof idea.event_details === 'object' && idea.event_details
    ? { ...(idea.event_details as Record<string, unknown>) }
    : {};
  const merged = {
    ...base,
    date: String(plan.date ?? base.date ?? '').trim() || undefined,
    time: time || base.time,
    tagline: subline || base.tagline,
    venue_area: String(plan.venue_area ?? base.venue_area ?? '').trim() || undefined,
    artist_name: String(
      plan.artist_name ?? plan.dj_lineup ?? plan.lineup ?? plan.dj ?? base.artist_name ?? '',
    ).trim() || undefined,
  };
  return Object.values(merged).some(Boolean) ? merged : undefined;
}

function enrichIdeationWithCalendarPlan(
  idea: Record<string, unknown>,
  plan: Record<string, unknown>,
  planIndex: number,
  ideaIndex: number,
): Record<string, unknown> {
  const overlay = calendarScheduleOverlayFields(plan, planIndex, ideaIndex);
  const eventDetails = mergeEventDetailsFromCalendar(idea, plan);
  const calHeadline = calendarItemHeadline(plan);
  const tagline = String(plan.tagline ?? plan.subline ?? '').trim();
  const brief = String(
    plan.content_brief ?? plan.description ?? plan.brief ?? '',
  ).trim();
  /** Calendar rows may carry real publish copy — separate from the visual brief. */
  const planCaption = String(plan.caption_draft ?? plan.caption ?? '').trim();
  const mood = String(
    plan.photo_mood ?? plan.mood ?? plan.visual_direction ?? plan.visual_style ?? '',
  ).trim();
  const fmt = calendarItemFormat(plan);
  const announcement = String(
    plan.announcement_type ?? plan.type ?? plan.template_use_case ?? '',
  ).trim();
  const calendarSubjectKey = String(plan.subject_key ?? plan.subjectKey ?? '').trim();
  const ideationSubjectKey = String(idea.subject_key ?? idea.subjectKey ?? '').trim();
  const subjectKey = ideationSubjectKey || calendarSubjectKey || undefined;
  const ideationCaption = String(idea.caption_draft ?? idea.caption ?? '').trim();
  // Publish caption = ideation/calendar copy — NEVER the visual brief. The brief
  // ("1-2 sentences describing the visual concept") is a scene description for the
  // production pipeline and stays in content_brief / visual_production_spec only.
  const caption = ideationCaption
    || planCaption
    || [tagline, calHeadline].filter(Boolean).join(' — ');
  const ideationTitle = ideationHeadline(idea);
  const headline = ideationTitle || calHeadline;

  const existingVps = typeof idea.visual_production_spec === 'object' && idea.visual_production_spec
    ? { ...(idea.visual_production_spec as Record<string, unknown>) }
    : {};

  const enriched: Record<string, unknown> = {
    ...idea,
    ...overlay,
    calendar_enriched: true,
    planning_idea_index: ideaIndex,
    concept_title: headline,
    headline,
    title: headline,
    caption_draft: caption,
    caption,
    ...(subjectKey ? { subject_key: subjectKey } : {}),
    ...(brief ? { content_brief: brief } : {}),
    ...(tagline ? { tagline, subline: tagline } : {}),
    ...(mood ? { photo_mood: mood, mood, visual_direction: mood } : {}),
    content_type: calendarFormatToContentType(fmt),
    content_kind: calendarFormatToContentType(fmt),
    format: fmt,
    ...(eventDetails ? { event_details: eventDetails } : {}),
    ...(announcement
      ? {
          template_use_case: idea.template_use_case ?? announcement,
          calendar_announcement_type: announcement,
        }
      : {}),
    calendar_gallery_designed: true,
    visual_production_spec: {
      ...existingVps,
      treatment: existingVps.treatment ?? 'gallery_designed',
      announcement_type: announcement || existingVps.announcement_type,
      photo_mood: mood || existingVps.photo_mood,
      content_brief: brief || existingVps.content_brief,
    },
  };

  const normalizedPlan = normalizeCalendarPlanDesignLayout(plan);
  const layoutChannel = String(fmt).toLowerCase().includes('story') ? 'story' : 'post';
  const userLayoutFamily = String(
    normalizedPlan.design_layout_family ?? plan.design_layout_family ?? plan.designLayoutFamily ?? '',
  ).trim();
  const layout = resolveCalendarDesignLayout({
    announcementType: announcement,
    channel: layoutChannel,
    explicitLayoutFamily: normalizedPlan.design_layout_locked ? userLayoutFamily : undefined,
  });
  const withLayout = applyCalendarDesignLayoutToIdea(enriched, layout);
  withLayout.fal_design_hint = `${buildCalendarFalSceneHint(withLayout)} | layout:${layout.canvaArchetypeId}`;
  return withLayout;
}

export function isCalendarProductionDonor(idea: Record<string, unknown>): boolean {
  return String(idea.source_track ?? '') === 'calendar'
    || String(idea.source_node ?? '') === 'content_calendar'
    || idea.calendar_enriched === true;
}

/**
 * Link calendar plans onto ideation (1:1) and enrich with schedule/brief/mood/layout.
 * Enrich-only: unlinked calendar rows are telemetry orphans — never production donors.
 */
export function applyCalendarProductionEnrichment(
  ideationRecords: Record<string, unknown>[],
  calendarPlans: Record<string, unknown>[],
): {
  ideas: Record<string, unknown>[];
  linkedPlanIndices: Set<number>;
  /** Unlinked calendar rows (telemetry only — not produced). */
  orphanCalendarIdeas: Record<string, unknown>[];
  /**
   * @deprecated Empty — calendar no longer adds production twins.
   * Kept for call-site compatibility; always [].
   */
  calendarProductionIdeas: Array<{
    planIndex: number;
    idea: Record<string, unknown>;
    linkedIdeaIndex: number | null;
  }>;
} {
  const ideas: Record<string, unknown>[] = ideationRecords.map((idea, index) => ({
    ...idea,
    idea_index: index,
    planning_idea_index: index,
    source_node: String(idea.source_node ?? 'content_ideation'),
    content_type: idea.content_type ?? idea.content_kind ?? 'instagram_post',
  }));

  const linkedPlanIndices = new Set<number>();
  const orphanCalendarIdeas: Record<string, unknown>[] = [];

  if (calendarPlans.length === 0) {
    return {
      ideas,
      linkedPlanIndices,
      orphanCalendarIdeas,
      calendarProductionIdeas: [],
    };
  }

  const usedIdeation = new Set<number>();
  for (let planIndex = 0; planIndex < calendarPlans.length; planIndex += 1) {
    const plan = calendarPlans[planIndex]!;
    const calendarIdea = normalizeCalendarPlanToProductionIdea(plan, planIndex);
    if (!String(calendarIdea.headline ?? '').trim()) continue;

    const { index } = pickIdeationForCalendarStrict(plan, ideas, usedIdeation);
    if (index == null || index < 0 || index >= ideas.length) {
      orphanCalendarIdeas.push(calendarIdea);
      continue;
    }
    usedIdeation.add(index);
    linkedPlanIndices.add(planIndex);
    ideas[index] = enrichIdeationWithCalendarPlan(ideas[index]!, plan, planIndex, index);
  }

  return {
    ideas,
    linkedPlanIndices,
    orphanCalendarIdeas,
    calendarProductionIdeas: [],
  };
}

/**
 * Production pool = enriched ideation only (1 idea → 1 deliverable).
 * Calendar stamps schedule/brief onto ideas; never adds rows.
 */
export function mergeCalendarPlansForProduction(
  ideationRecords: Record<string, unknown>[],
  calendarPlans: Record<string, unknown>[],
  _packageSlug?: string | null,
): Record<string, unknown>[] {
  return buildContentProductionItemsFromRecords(ideationRecords, calendarPlans);
}

function buildContentProductionItemsFromRecords(
  ideationRecords: Record<string, unknown>[],
  calendarPlans: Record<string, unknown>[],
): Record<string, unknown>[] {
  const { ideas } = applyCalendarProductionEnrichment(
    ideationRecords.map((idea, index) => ({
      ...idea,
      idea_index: index,
      planning_idea_index: index,
    })),
    calendarPlans,
  );

  if (ideas.length === 0) {
    return ideationRecords.map((idea, index) => ({
      ...idea,
      idea_index: index,
      planning_idea_index: index,
      production_scope: 'ideation',
    }));
  }

  return ideas.map((idea, index) => ({
    ...idea,
    idea_index: index,
    planning_idea_index: resolvePlanningIdeaIndex(idea) ?? index,
    production_scope: 'ideation',
  }));
}

export interface MissionContentProductionScope {
  /** Completed content_calendar node with output exists on this mission. */
  hasCalendar: boolean;
  /** Rows to produce — one artifact per row. */
  items: Record<string, unknown>[];
  ideationItemCount: number;
  orphanCalendarCount: number;
  requiredProductionCount: number;
}

export interface MissionContentProductionStatus {
  hasCalendar: boolean;
  requiredTotal: number;
  readyRequired: number;
  scope: MissionContentProductionScope;
  links: CalendarItemLink[];
}

/**
 * Feed/factory completion target = idea_count (1 idea → 1 deliverable).
 * Calendar enriches ideas but must not change the count.
 */
export function resolveMissionProductionTargetCount(input: {
  hasCalendar: boolean;
  mergedItemCount: number;
  missionType?: string | null;
  packageSlug?: string | null;
}): number {
  if (input.mergedItemCount > 0) {
    return input.mergedItemCount;
  }
  return resolveWeeklyPackageGeometry(input.packageSlug ?? undefined).total;
}

export function resolveMissionContentProductionScope(params: {
  nodes: MissionNode[];
  missionId?: string;
}): MissionContentProductionScope {
  const ideationNodes = params.nodes.filter((n) => n.task_type === 'content_ideation');
  const calendarNodes = params.nodes.filter((n) => n.task_type === 'content_calendar');
  const hasCalendar = calendarNodes.some(
    (n) => n.status === 'completed' && nodeHasOutput(n),
  );

  const uniqueIdeation = collectUniqueMissionIdeationIdeas(ideationNodes, params.missionId);

  if (!hasCalendar) {
    const items = uniqueIdeation.map((idea, index) => ({
      ...idea,
      idea_index: index,
      planning_idea_index: index,
      production_scope: 'ideation',
    }));
    return {
      hasCalendar: false,
      items,
      ideationItemCount: items.length,
      orphanCalendarCount: 0,
      requiredProductionCount: items.length,
    };
  }

  const calendarPlans = calendarNodes
    .filter((n) => n.status === 'completed' && nodeHasOutput(n))
    .flatMap(parseCalendarPlanRecordsFromNode);

  const { ideas, orphanCalendarIdeas } = applyCalendarProductionEnrichment(
    uniqueIdeation,
    calendarPlans,
  );
  const items = ideas.map((idea, index) => ({
    ...idea,
    idea_index: index,
    planning_idea_index: resolvePlanningIdeaIndex(idea) ?? index,
    production_scope: 'ideation',
  }));

  return {
    hasCalendar: true,
    items,
    ideationItemCount: items.length,
    orphanCalendarCount: orphanCalendarIdeas.length,
    requiredProductionCount: items.length,
  };
}

/** Publish-ready artifact coverage per content production row (planning ↔ artifact link). */
export function summarizeMissionContentProductionStatus(input: {
  nodes: MissionNode[];
  missionId: string;
  artifacts: OutputArtifact[];
  missionInFlight?: boolean;
}): MissionContentProductionStatus {
  const scope = resolveMissionContentProductionScope({
    nodes: input.nodes,
    missionId: input.missionId,
  });
  const links = linkPlanningItemsToArtifacts(
    scope.items,
    input.artifacts,
    input.missionId,
    { missionInFlight: input.missionInFlight },
  );
  const publishReadyIds = new Set(
    filterFeedPublishableArtifacts(
      input.artifacts.filter((a) => parseArtifactMissionId(a) === input.missionId),
    ).map((a) => a.id),
  );
  const readyRequired = links.filter(
    (link) => link.status === 'ready' && link.artifactId && publishReadyIds.has(link.artifactId),
  ).length;

  return {
    hasCalendar: scope.hasCalendar,
    requiredTotal: scope.requiredProductionCount,
    readyRequired,
    scope,
    links,
  };
}

/**
 * @deprecated Prefer mergeCalendarPlansForProduction — schedule + brief enrichment.
 */
export function applyCalendarScheduleOverlay(
  ideationRecords: Record<string, unknown>[],
  calendarPlans: Record<string, unknown>[],
): Record<string, unknown>[] {
  return applyCalendarProductionEnrichment(ideationRecords, calendarPlans).ideas;
}

/**
 * @deprecated Replaced by applyCalendarScheduleOverlay (ideation SSOT + schedule link).
 */
export function mergeIdeationWithCalendarPlans(
  ideationRecords: Record<string, unknown>[],
  calendarPlans: Record<string, unknown>[],
): Record<string, unknown>[] {
  return applyCalendarScheduleOverlay(ideationRecords, calendarPlans);
}

type PackageFormat = 'story' | 'post' | 'reel' | 'carousel';

function formatTargetsForPlan(packageSlug?: string | null): Record<PackageFormat, number> {
  const geo = resolveWeeklyPackageGeometry(packageSlug);
  return {
    story: geo.story,
    post: geo.post,
    carousel: geo.carousel,
    reel: geo.reel,
  };
}

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
  const planningIdx = typeof donor.planning_idea_index === 'number'
    ? donor.planning_idea_index
    : typeof donor.calendar_linked_idea_index === 'number'
      ? donor.calendar_linked_idea_index
      : (donor.manifest_slot_backfill ? null : donor.idea_index);
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
    ...(typeof planningIdx === 'number' ? { planning_idea_index: planningIdx } : {}),
  };
}

/** True when the pool is already ideation+calendar content-scoped (must not trim). */
export function isContentScopedProductionPool(
  ideas: Record<string, unknown>[],
): boolean {
  return ideas.some((row) => {
    const scope = String(row.production_scope ?? '').trim();
    if (scope === 'ideation' || scope === 'calendar_plan' || scope === 'calendar_orphan') {
      return true;
    }
    return row.publish_schedule_day != null
      || row.calendar_plan_index != null
      || row.calendar_enriched === true
      || String(row.source_track ?? '') === 'calendar';
  });
}

/**
 * Production pool is idea_count-scoped — do not pad/clone to weekly geometry.
 * Kept as a pass-through for call-site compatibility.
 */
export function ensureWeeklyFormatCoverage(
  primary: Record<string, unknown>[],
  _pool: Record<string, unknown>[],
  _packageSlug?: string | null,
  _brandFormatTargets?: PackageGeometry | null,
): Record<string, unknown>[] {
  return primary.map((idea, index) => {
    const planningIdx = typeof idea.planning_idea_index === 'number'
      ? idea.planning_idea_index
      : typeof idea.calendar_linked_idea_index === 'number'
        ? idea.calendar_linked_idea_index
        : (idea.manifest_slot_backfill ? undefined : idea.idea_index);
    return {
      ...idea,
      idea_index: index,
      ...(typeof planningIdx === 'number' ? { planning_idea_index: planningIdx } : {}),
    };
  });
}

/** Planning UI — one card per distinct ideation idea (no slot format backfill). */
export function buildMissionPlanningDisplayIdeas(params: {
  nodes: MissionNode[];
  missionId?: string;
}): Record<string, unknown>[] {
  const ideationNodes = params.nodes.filter((n) => n.task_type === 'content_ideation');
  return collectUniqueMissionIdeationIdeas(ideationNodes, params.missionId);
}

export function buildMissionProductionIdeas(params: {
  nodes: MissionNode[];
  missionId?: string;
  packageSlug?: string | null;
}): Record<string, unknown>[] {
  return resolveMissionContentProductionScope({
    nodes: params.nodes,
    missionId: params.missionId,
  }).items;
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
