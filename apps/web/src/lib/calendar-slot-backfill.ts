/**
 * Calendar → empty manifest slot backfill.
 *
 * After a mission production run, unused content_calendar rows can fill failed or
 * missing slots while preserving weekly format diversity.
 */
import type { ManifestProductionQueueItem } from '@/lib/auto-produce/build-production-queue';
import { calendarItemFormat, calendarItemHeadline } from '@/lib/content-calendar-artifact-link';
import {
  buildCalendarFalSceneHint,
  MAX_CALENDAR_PLANS_PER_MISSION,
  normalizeCalendarPlanToProductionIdea,
} from '@/lib/calendar-production-pack';
import { slotFormatFromAssignment } from '@/lib/gallery-first-production';
import {
  applyCalendarProductionEnrichment,
  parseCalendarPlanRecords,
} from '@/lib/mission-production-plan';
import { nodeOutputArray } from '@/lib/mission-node-output';
import type { ProductionAssignment } from '@/lib/mission-production-manifest';
import {
  findMissionSlotBackfillItems,
  missionSlotRunKey,
  type ProductionRunResultRow,
} from '@/lib/mission-slot-backfill';
import type { PackageFormat } from '@/lib/weekly-publish-package';

type MissionCalendarNode = {
  output_summary?: string | null;
  output_payload?: unknown;
  task_type?: string;
  status?: string;
};

export type CalendarSlotBackfillPlan = {
  slotKey: string;
  ideaIndex: number;
  planIndex: number;
  calendarIdea: Record<string, unknown>;
  assignmentOverrides: Partial<ProductionAssignment>;
};

function normalizeHeadline(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function calendarPlanPackageFormat(plan: Record<string, unknown>): PackageFormat {
  const fmt = calendarItemFormat(plan);
  if (fmt.includes('reel')) return 'reel';
  if (fmt.includes('carousel')) return 'carousel';
  if (fmt.includes('story')) return 'story';
  return 'post';
}

/** Parse content_calendar plan rows from mission graph nodes. */
export function parseCalendarPlansFromMissionNodes(
  nodes: MissionCalendarNode[],
): Record<string, unknown>[] {
  return nodes
    .filter((n) => n.task_type === 'content_calendar' && n.status === 'completed')
    .flatMap((node) => nodeOutputArray(
      node,
      ['plans', 'calendar', 'items', 'content_calendar', 'schedule'],
    ))
    .slice(0, MAX_CALENDAR_PLANS_PER_MISSION);
}

export { parseCalendarPlanRecords };

export function collectUsedCalendarPlanIndices(
  rows: ProductionRunResultRow[],
): Set<number> {
  const used = new Set<number>();
  for (const row of rows) {
    if (!row.id || row.error) continue;
    const meta = row.metadata ?? {};
    const idx = meta.calendar_plan_index ?? meta.calendarPlanIndex;
    if (typeof idx === 'number' && idx >= 0) used.add(idx);
  }
  return used;
}

function buildCalendarAssignmentOverrides(
  plan: Record<string, unknown>,
  planIndex: number,
  assignment: ProductionAssignment,
): Partial<ProductionAssignment> {
  const idea = normalizeCalendarPlanToProductionIdea(plan, planIndex);
  return {
    fal_design_hint: buildCalendarFalSceneHint(idea),
    copy_bundle_id: assignment.copy_bundle_id ?? `calendar_backfill:${planIndex}`,
    rationale: `calendar_slot_backfill_${calendarPlanPackageFormat(plan)}`,
  };
}

export function buildCalendarBackfillIdea(
  slot: ManifestProductionQueueItem,
  plan: Record<string, unknown>,
  planIndex: number,
): Record<string, unknown> {
  const normalized = normalizeCalendarPlanToProductionIdea(plan, planIndex);
  const merged: Record<string, unknown> = {
    ...slot.idea,
    ...normalized,
    idea_index: slot.ideaIndex,
    calendar_plan_index: planIndex,
    calendar_slot_backfill: true,
    source_track: 'calendar',
    source_node: 'content_calendar',
  };
  merged.fal_design_hint = buildCalendarFalSceneHint(merged);
  return merged;
}

/**
 * Match unused calendar plans to empty/failed manifest slots.
 * Orphan calendar rows (no ideation link) are preferred over linked rows.
 */
export function matchCalendarPlansToEmptySlots(input: {
  queue: ManifestProductionQueueItem[];
  results: ProductionRunResultRow[];
  calendarPlans: Record<string, unknown>[];
  usedPlanIndices?: Set<number>;
  linkedPlanIndices?: Set<number>;
  ideationIdeas?: Record<string, unknown>[];
}): CalendarSlotBackfillPlan[] {
  const {
    queue,
    results,
    calendarPlans,
    usedPlanIndices: usedInput,
    linkedPlanIndices: linkedInput,
    ideationIdeas,
  } = input;

  if (!calendarPlans.length) return [];

  const emptySlots = findMissionSlotBackfillItems(queue, results);
  if (!emptySlots.length) return [];

  const usedPlans = new Set(usedInput ?? []);
  let linked = linkedInput;
  if (!linked && ideationIdeas?.length) {
    linked = applyCalendarProductionEnrichment(ideationIdeas, calendarPlans).linkedPlanIndices;
  }

  const availableIndices = calendarPlans
    .map((_, index) => index)
    .filter((index) => !usedPlans.has(index))
    .sort((a, b) => {
      const aOrphan = linked?.has(a) ? 1 : 0;
      const bOrphan = linked?.has(b) ? 1 : 0;
      if (aOrphan !== bOrphan) return aOrphan - bOrphan;
      return a - b;
    });

  const plans: CalendarSlotBackfillPlan[] = [];
  const usedHeadlines = new Set<string>();

  const pickPlanIndex = (
    slotFormat: PackageFormat,
    strictFormat: boolean,
  ): number | null => {
    return availableIndices.find((index) => {
      if (usedPlans.has(index)) return false;
      const plan = calendarPlans[index]!;
      if (strictFormat && calendarPlanPackageFormat(plan) !== slotFormat) return false;
      const headline = normalizeHeadline(calendarItemHeadline(plan));
      if (headline && usedHeadlines.has(headline)) return false;
      return true;
    }) ?? null;
  };

  for (const slot of emptySlots) {
    const slotFormat = slotFormatFromAssignment(slot.assignment);

    const planIndex = pickPlanIndex(slotFormat, true)
      ?? pickPlanIndex(slotFormat, false);

    if (planIndex == null) continue;

    const plan = calendarPlans[planIndex]!;
    usedPlans.add(planIndex);
    const headline = normalizeHeadline(calendarItemHeadline(plan));
    if (headline) usedHeadlines.add(headline);

    const slotKey = missionSlotRunKey(slot.ideaIndex, slot.assignment.slot_role);
    plans.push({
      slotKey,
      ideaIndex: slot.ideaIndex,
      planIndex,
      calendarIdea: buildCalendarBackfillIdea(slot, plan, planIndex),
      assignmentOverrides: buildCalendarAssignmentOverrides(
        plan,
        planIndex,
        slot.assignment,
      ),
    });

    const removeAt = availableIndices.indexOf(planIndex);
    if (removeAt >= 0) availableIndices.splice(removeAt, 1);
  }

  return plans;
}

export function applyCalendarBackfillToIdeas(
  ideas: Record<string, unknown>[],
  backfillPlans: CalendarSlotBackfillPlan[],
): Record<string, unknown>[] {
  const out = ideas.map((idea) => ({ ...idea }));
  for (const plan of backfillPlans) {
    if (plan.ideaIndex >= 0 && plan.ideaIndex < out.length) {
      out[plan.ideaIndex] = plan.calendarIdea;
    }
  }
  return out;
}

export function buildCalendarBackfillQueueItems(
  queue: ManifestProductionQueueItem[],
  backfillPlans: CalendarSlotBackfillPlan[],
): ManifestProductionQueueItem[] {
  const byKey = new Map(backfillPlans.map((p) => [p.slotKey, p]));
  return queue
    .filter((item) => byKey.has(missionSlotRunKey(item.ideaIndex, item.assignment.slot_role)))
    .map((item) => {
      const plan = byKey.get(missionSlotRunKey(item.ideaIndex, item.assignment.slot_role))!;
      return {
        ...item,
        idea: plan.calendarIdea,
        assignment: {
          ...item.assignment,
          ...plan.assignmentOverrides,
        },
      };
    });
}
