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
    imageUrl: 'https://cdn.example/photo.jpg',
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
    {
      event_name: 'DJ Night Story',
      format: 'story',
      content_brief: 'Beach DJ teaser.',
      announcement_type: 'event_teaser',
    },
    {
      event_name: 'Weekend Brunch Encore',
      format: 'post',
      content_brief: 'Duplicate headline should not reuse.',
      announcement_type: 'offer_campaign',
    },
  ];

  it('matches reel calendar row to empty reel slot by format', () => {
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

    expect(plans).toHaveLength(1);
    expect(plans[0]!.slotKey).toBe('1:organic_reel');
    expect(plans[0]!.planIndex).toBe(1);
    expect(plans[0]!.calendarIdea.headline).toBe('Sunset Reel');
    expect(plans[0]!.calendarIdea.calendar_slot_backfill).toBe(true);
  });

  it('skips used calendar indices but can relax format for remaining empty slots', () => {
    const queue = [queueItem(2, 'organic_post')];
    const results: ProductionRunResultRow[] = [];

    const plans = matchCalendarPlansToEmptySlots({
      queue,
      results,
      calendarPlans,
      usedPlanIndices: new Set([0, 3]),
      linkedPlanIndices: new Set([0, 1, 2, 3]),
    });

    expect(plans).toHaveLength(1);
    expect(plans[0]!.planIndex).toBe(1);
    expect(plans[0]!.calendarIdea.headline).toBe('Sunset Reel');
  });

  it('prefers orphan calendar rows over linked rows for empty slots', () => {
    const queue = [queueItem(3, 'organic_story_still')];
    const results: ProductionRunResultRow[] = [];
    const orphanOnlyPlans = [
      ...calendarPlans,
      {
        event_name: 'Orphan Beach Party',
        format: 'story',
        content_brief: 'Orphan story row with no ideation link.',
        announcement_type: 'event_teaser',
      },
    ];

    const plans = matchCalendarPlansToEmptySlots({
      queue,
      results,
      calendarPlans: orphanOnlyPlans,
      linkedPlanIndices: new Set([0, 1, 2, 3]),
    });

    expect(plans).toHaveLength(1);
    expect(plans[0]!.planIndex).toBe(4);
    expect(plans[0]!.calendarIdea.headline).toBe('Orphan Beach Party');
  });

  it('does not assign the same calendar headline to two empty slots', () => {
    const queue = [
      queueItem(4, 'organic_post'),
      queueItem(5, 'designed_post'),
    ];
    const results: ProductionRunResultRow[] = [];
    const duplicateHeadlinePlans = [
      {
        event_name: 'Same Headline Drop',
        format: 'post',
        content_brief: 'First post variant.',
      },
      {
        title: 'Same Headline Drop',
        format: 'post',
        content_brief: 'Second post variant — same headline.',
      },
    ];

    const plans = matchCalendarPlansToEmptySlots({
      queue,
      results,
      calendarPlans: duplicateHeadlinePlans,
    });

    expect(plans).toHaveLength(1);
    expect(plans[0]!.planIndex).toBe(0);
  });

  it('collectUsedCalendarPlanIndices reads artifact metadata', () => {
    const used = collectUsedCalendarPlanIndices([
      readyRow(0, 'organic_post', { calendar_plan_index: 2 }),
      { title: 'failed', imageUrl: '', error: 'x', metadata: { calendar_plan_index: 5 } },
    ]);
    expect([...used]).toEqual([2]);
  });

  it('falls back to any unused calendar row when format has no strict match', () => {
    const queue = [queueItem(6, 'fal_reel_motion')];
    const results: ProductionRunResultRow[] = [];
    const postOnlyPlans = [
      {
        event_name: 'Menu Spotlight',
        format: 'post',
        content_brief: 'Weekly menu hero post.',
        announcement_type: 'product_reveal',
      },
    ];

    const plans = matchCalendarPlansToEmptySlots({
      queue,
      results,
      calendarPlans: postOnlyPlans,
    });

    expect(plans).toHaveLength(1);
    expect(plans[0]!.slotKey).toBe('6:fal_reel_motion');
    expect(plans[0]!.planIndex).toBe(0);
    expect(plans[0]!.calendarIdea.headline).toBe('Menu Spotlight');
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

    const items = buildCalendarBackfillQueueItems(queue, backfillPlans);
    expect(items).toHaveLength(1);
    expect(items[0]!.assignment.slot_role).toBe('organic_reel');
    expect(items[0]!.idea.content_brief).toBe('Golden hour reel energy.');
    expect(items[0]!.assignment.fal_design_hint).toContain('golden hour');
  });

  it('applyCalendarBackfillToIdeas patches only matched idea indices', () => {
    const ideas = [
      { idea_index: 0, headline: 'Keep me' },
      { idea_index: 1, headline: 'Replace me' },
    ];
    const patched = applyCalendarBackfillToIdeas(ideas, [{
      slotKey: '1:organic_reel',
      ideaIndex: 1,
      planIndex: 1,
      calendarIdea: { idea_index: 1, headline: 'Sunset Reel', calendar_plan_index: 1 },
      assignmentOverrides: {},
    }]);
    expect(patched[0]?.headline).toBe('Keep me');
    expect(patched[1]?.headline).toBe('Sunset Reel');
  });
});
