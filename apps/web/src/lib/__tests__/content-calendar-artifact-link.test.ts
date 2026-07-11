import { describe, expect, it } from 'vitest';
import type { OutputArtifact } from '@/types';
import { linkPlanningItemsToArtifacts } from '@/lib/content-calendar-artifact-link';

const MISSION_ID = 'mission-meon-1';

function artifact(
  id: string,
  meta: Record<string, unknown>,
): OutputArtifact {
  return {
    id,
    title: String(meta.ideation_headline ?? 'Artifact'),
    content: JSON.stringify({ idea_index: meta.idea_index }),
    contentUrl: 'https://cdn.example.com/a.jpg',
    status: 'pending_review',
    createdAt: new Date().toISOString(),
    metadata: { mission_id: MISSION_ID, auto_produced: true, ...meta },
  } as OutputArtifact;
}

describe('linkPlanningItemsToArtifacts — planning_idea_index', () => {
  const planningIdeas = [
    { headline: 'Hayallerindeki düğün hikayesini yakalayalım!', idea_index: 0 },
    { headline: 'Bu yaz düğün tarihinizi hemen ayırtın!', idea_index: 1 },
    { headline: 'Bodrum\'un en güzel mekanları', idea_index: 2 },
  ];

  it('links by planning_idea_index when production slot index differs', () => {
    const arts = [
      artifact('a1', {
        idea_index: 5,
        planning_idea_index: 1,
        ideation_headline: 'Bu yaz düğün tarihinizi hemen ayırtın!',
      }),
      artifact('a2', {
        idea_index: 6,
        planning_idea_index: 0,
        ideation_headline: 'Hayallerindeki düğün hikayesini yakalayalım!',
      }),
    ];
    const links = linkPlanningItemsToArtifacts(planningIdeas, arts, MISSION_ID);
    expect(links[0]?.artifactId).toBe('a2');
    expect(links[1]?.artifactId).toBe('a1');
    expect(links[2]?.artifactId).toBeNull();
  });

  it('does not double-assign the same artifact to two planning cards', () => {
    const arts = [
      artifact('only', { idea_index: 0, planning_idea_index: 1, ideation_headline: 'Bu yaz düğün tarihinizi hemen ayırtın!' }),
    ];
    const links = linkPlanningItemsToArtifacts(planningIdeas, arts, MISSION_ID);
    expect(links.filter((l) => l.artifactId === 'only')).toHaveLength(1);
    expect(links[1]?.artifactId).toBe('only');
  });
});
