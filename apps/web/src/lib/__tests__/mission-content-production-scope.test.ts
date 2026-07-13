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

  it('produces every ideation row plus every calendar plan (additive)', () => {
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
    // 2 ideation + 2 calendar = 4 (matched calendar is ALSO produced)
    expect(scope.requiredProductionCount).toBe(4);
    expect(scope.ideationItemCount).toBe(2);
    expect(scope.orphanCalendarCount).toBe(2);
    expect(scope.items.filter((row) => row.production_scope === 'calendar_plan')).toHaveLength(1);
    expect(scope.items.filter((row) => row.production_scope === 'calendar_orphan')).toHaveLength(1);
    expect(scope.items.some((row) => row.headline === 'Orphan DJ Night')).toBe(true);
  });

  it('sums 10 ideas + 12 calendar plans into production target', () => {
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
    expect(scope.requiredProductionCount).toBe(22);
    expect(scope.ideationItemCount).toBe(10);
    expect(scope.orphanCalendarCount).toBe(12);
  });
  it('appends orphan calendar rows when calendar node is completed', () => {
    const scope = resolveMissionContentProductionScope({
      nodes: [
        {
          task_type: 'content_ideation',
          status: 'completed',
          output_summary: JSON.stringify([
            { concept_title: 'Matched', caption_draft: 'x', content_type: 'instagram_post' },
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
    expect(scope.requiredProductionCount).toBe(3);
    expect(scope.orphanCalendarCount).toBe(2);
    expect(scope.items.some((row) => row.headline === 'Orphan DJ Night')).toBe(true);
  });
  it('resolveMissionProductionTargetCount uses merged pool when calendar present', () => {
    expect(
      resolveMissionProductionTargetCount({
        hasCalendar: true,
        mergedItemCount: 25,
        missionType: 'weekly_content',
      }),
    ).toBe(25);
    expect(
      resolveMissionProductionTargetCount({
        hasCalendar: false,
        mergedItemCount: 8,
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
