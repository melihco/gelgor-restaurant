import { describe, expect, it } from 'vitest';
import {
  resolveMissionContentProductionScope,
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
    expect(scope.requiredProductionCount).toBe(2);
    expect(scope.orphanCalendarCount).toBe(1);
    expect(scope.items.some((row) => row.headline === 'Orphan DJ Night')).toBe(true);
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
