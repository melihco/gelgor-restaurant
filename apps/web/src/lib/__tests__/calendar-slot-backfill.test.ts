import { describe, expect, it } from 'vitest';
import type { ManifestProductionQueueItem } from '@/lib/auto-produce/build-production-queue';
import {
  applyCalendarBackfillToIdeas,
  buildCalendarBackfillQueueItems,
  collectUsedCalendarPlanIndices,
  matchCalendarPlansToEmptySlots,
  type CalendarSlotBackfillPlan,
} from '@/lib/calendar-slot-backfill';
import type { ProductionRunResultRow } from '@/lib/mission-slot-backfill';

function queueItem(
  ideaIndex: number,
  slotRole: ManifestProductionQueueItem['assignment']['slot_role'],
  idea: Record<string, unknown> = {},
): ManifestProductionQueueItem {
  return {
    queueIndex: ideaIndex,
    ideaIndex,
    idea: { headline: `Idea ${ideaIndex}`, ...idea },
    assignment: {
      idea_index: ideaIndex,
      slot_role: slotRole,
      pipeline: slotRole.includes('reel') ? 'fal_reel' : 'gallery_photo',
      copy_bundle_id: `bundle:${ideaIndex}`,
      publish_channel: 'instagram_organic',
      rationale: 'test',
    },
  };
}

function readyRow(
  ideaIndex: number,
  slotRole: string,
  extraMeta: Record<string, unknown> = {},
): ProductionRunResultRow {
  return {
    id: `art-${ideaIndex}-${slotRole}`,
    title: 'Ready',
    imageUrl: 'https://cdn.example.com/photo.jpg',
    publishReady: true,
    metadata: {
      idea_index: ideaIndex,
      production_role: slotRole,
      ...extraMeta,
    },
  };
}

describe('calendar-slot-backfill', () => {
  const calendarPlans = [
    {
      event_name: 'Weekend Brunch',
      format: 'post',
      content_brief: 'Brunch menu spotlight.',
      announcement_type: 'venue_showcase',
    },
    {
      event_name: 'Sunset Reel',
      format: 'reel',
      content_brief: 'Golden hour reel energy.',
      announcement_type: 'venue_showcase',
    },
  ];

  it('matchCalendarPlansToEmptySlots is disabled under enrich-only production', () => {
    const queue = [
      queueItem(0, 'organic_post'),
      queueItem(1, 'organic_reel'),
    ];
    const results = [readyRow(0, 'organic_post')];

    const plans = matchCalendarPlansToEmptySlots({
      queue,
      results,
      calendarPlans,
      linkedPlanIndices: new Set([0]),
    });

    expect(plans).toEqual([]);
  });

  it('collectUsedCalendarPlanIndices reads artifact metadata', () => {
    const used = collectUsedCalendarPlanIndices([
      readyRow(0, 'organic_post', { calendar_plan_index: 2 }),
      { title: 'failed', imageUrl: '', error: 'x', metadata: { calendar_plan_index: 5 } },
    ]);
    expect([...used]).toEqual([2]);
  });

  it('buildCalendarBackfillQueueItems injects calendar brief while keeping slot role', () => {
    const queue = [queueItem(1, 'organic_reel')];
    const backfillPlans: CalendarSlotBackfillPlan[] = [{
      slotKey: '1:organic_reel',
      ideaIndex: 1,
      planIndex: 1,
      calendarIdea: {
        idea_index: 1,
        headline: 'Sunset Reel',
        calendar_plan_index: 1,
        calendar_slot_backfill: true,
        content_brief: 'Golden hour reel energy.',
      },
      assignmentOverrides: {
        fal_design_hint: 'venue showcase | brief: golden hour',
        rationale: 'calendar_slot_backfill_reel',
      },
    }];

    const next = buildCalendarBackfillQueueItems(queue, backfillPlans);
    expect(next).toHaveLength(1);
    expect(next[0]!.assignment.slot_role).toBe('organic_reel');
    expect(next[0]!.idea.headline).toBe('Sunset Reel');
  });

  it('applyCalendarBackfillToIdeas replaces idea rows by index', () => {
    const ideas = [
      { headline: 'A' },
      { headline: 'B' },
    ];
    const backfillPlans: CalendarSlotBackfillPlan[] = [{
      slotKey: '1:organic_reel',
      ideaIndex: 1,
      planIndex: 0,
      calendarIdea: { headline: 'Replaced', calendar_slot_backfill: true },
      assignmentOverrides: {},
    }];
    const out = applyCalendarBackfillToIdeas(ideas, backfillPlans);
    expect(out[0]?.headline).toBe('A');
    expect(out[1]?.headline).toBe('Replaced');
  });
});
