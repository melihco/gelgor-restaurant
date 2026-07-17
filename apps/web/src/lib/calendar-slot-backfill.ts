/**
 * Calendar → empty manifest slot backfill.
 *
 * Disabled: calendar is enrich-only (1 idea → 1 deliverable). Unused calendar rows
 * must not invent extra production donors.
 */
import type { ManifestProductionQueueItem } from '@/lib/auto-produce/build-production-queue';
import { calendarItemFormat } from '@/lib/content-calendar-artifact-link';
import {
  buildCalendarFalSceneHint,
  MAX_CALENDAR_PLANS_PER_MISSION,
  normalizeCalendarPlanToProductionIdea,
} from '@/lib/calendar-production-pack';
import { parseCalendarPlanRecords } from '@/lib/mission-production-plan';
import { nodeOutputArray } from '@/lib/mission-node-output';
import type { ProductionAssignment } from '@/lib/mission-production-manifest';
import {
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
 * Disabled under enrich-only / idea_count production — always returns [].
 */
export function matchCalendarPlansToEmptySlots(_input: {
  queue: ManifestProductionQueueItem[];
  results: ProductionRunResultRow[];
  calendarPlans: Record<string, unknown>[];
  usedPlanIndices?: Set<number>;
  linkedPlanIndices?: Set<number>;
  ideationIdeas?: Record<string, unknown>[];
}): CalendarSlotBackfillPlan[] {
  return [];
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
