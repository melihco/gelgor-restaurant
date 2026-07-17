import { describe, expect, it } from 'vitest';
import {
  resolveMissionContentProductionScope,
  resolveMissionProductionTargetCount,
  summarizeMissionContentProductionStatus,
} from '@/lib/mission-production-plan';
import type { OutputArtifact } from '@/types';

describe('resolveMissionContentProductionScope', () => {
  it('uses ideation count only when content_calendar is absent', () => {
    const scope = resolveMissionContentProductionScope({
      nodes: [
        {
          task_type: 'content_ideation',
          status: 'completed',
          output_summary: JSON.stringify([
            { concept_title: 'Idea A', caption_draft: 'a', content_type: 'instagram_post' },
            { concept_title: 'Idea B', caption_draft: 'b', content_type: 'instagram_story' },
          ]),
        },
      ],
    });
    expect(scope.hasCalendar).toBe(false);
    expect(scope.requiredProductionCount).toBe(2);
    expect(scope.items).toHaveLength(2);
  });

  it('enriches ideation and does not produce calendar twins or orphans', () => {
    const scope = resolveMissionContentProductionScope({
      nodes: [
        {
          task_type: 'content_ideation',
          status: 'completed',
          output_summary: JSON.stringify([
            { concept_title: 'Matched', caption_draft: 'x', content_type: 'instagram_post' },
            { concept_title: 'Only Idea', caption_draft: 'y', content_type: 'instagram_story' },
          ]),
        },
        {
          task_type: 'content_calendar',
          status: 'completed',
          output_summary: JSON.stringify([
            { event_name: 'Matched', format: 'post', content_brief: 'Calendar brief' },
            { event_name: 'Orphan DJ Night', format: 'story', content_brief: 'DJ teaser' },
          ]),
        },
      ],
    });
    expect(scope.hasCalendar).toBe(true);
    expect(scope.requiredProductionCount).toBe(2);
    expect(scope.ideationItemCount).toBe(2);
    expect(scope.orphanCalendarCount).toBe(1);
    expect(scope.items.every((row) => row.production_scope === 'ideation')).toBe(true);
    expect(scope.items.some((row) => row.headline === 'Orphan DJ Night')).toBe(false);
    expect(scope.items.find((row) => String(row.concept_title ?? row.headline) === 'Matched')?.content_brief)
      .toBe('Calendar brief');
  });

  it('production target stays at ideation count when calendar has extras', () => {
    const ideas = Array.from({ length: 10 }, (_, i) => ({
      concept_title: `Idea ${i + 1}`,
      caption_draft: `caption ${i + 1}`,
      content_type: 'instagram_post',
    }));
    const plans = Array.from({ length: 12 }, (_, i) => ({
      event_name: i < 10 ? `Idea ${i + 1}` : `Calendar Extra ${i + 1}`,
      format: 'post',
      content_brief: `brief ${i + 1}`,
      idea_index: i < 10 ? i : undefined,
    }));
    const scope = resolveMissionContentProductionScope({
      nodes: [
        {
          task_type: 'content_ideation',
          status: 'completed',
          output_summary: JSON.stringify(ideas),
        },
        {
          task_type: 'content_calendar',
          status: 'completed',
          output_summary: JSON.stringify(plans),
        },
      ],
    });
    expect(scope.requiredProductionCount).toBe(10);
    expect(scope.ideationItemCount).toBe(10);
    expect(scope.orphanCalendarCount).toBe(2);
  });

  it('resolveMissionProductionTargetCount follows idea_count with or without calendar', () => {
    expect(
      resolveMissionProductionTargetCount({
        hasCalendar: true,
        mergedItemCount: 11,
        missionType: 'weekly_content',
      }),
    ).toBe(11);
    expect(
      resolveMissionProductionTargetCount({
        hasCalendar: false,
        mergedItemCount: 8,
        missionType: 'weekly_content',
      }),
    ).toBe(8);
    expect(
      resolveMissionProductionTargetCount({
        hasCalendar: false,
        mergedItemCount: 0,
        missionType: 'weekly_content',
      }),
    ).toBe(16);
  });
});

describe('summarizeMissionContentProductionStatus', () => {
  it('counts publish-ready artifacts linked by planning_idea_index', () => {
    const artifact = {
      id: 'art-1',
      title: 'Post',
      contentUrl: 'https://cdn.example.com/post.jpg',
      metadata: {
        mission_id: 'mission-1',
        planning_idea_index: 0,
        auto_produced: true,
      },
      content: {},
    } as OutputArtifact;

    const status = summarizeMissionContentProductionStatus({
      nodes: [
        {
          task_type: 'content_ideation',
          status: 'completed',
          output_summary: JSON.stringify([
            { concept_title: 'Ready idea', caption_draft: 'cap', content_type: 'instagram_post' },
          ]),
        },
      ],
      missionId: 'mission-1',
      artifacts: [artifact],
    });

    expect(status.requiredTotal).toBe(1);
    expect(status.readyRequired).toBe(1);
  });
});
