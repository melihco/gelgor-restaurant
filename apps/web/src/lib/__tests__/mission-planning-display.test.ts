import { describe, expect, it } from 'vitest';
import { collectUniqueMissionIdeationIdeas } from '@/lib/parse-ideation-summary';
import {
  buildMissionPlanningDisplayIdeas,
  buildMissionProductionIdeas,
} from '@/lib/mission-production-plan';
import { countPlanningNodeResults } from '@/lib/mission-pipeline-transparency';

const singleIdeaNode = {
  node_key: 'weekly_content_ideation',
  task_type: 'content_ideation',
  status: 'completed',
  output_summary: JSON.stringify([
    {
      concept_title: 'Yeni Ürünlerimiz Geldi!',
      caption_draft: 'Yerel lezzetler seni bekliyor.',
      content_type: 'instagram_post',
    },
  ]),
};

describe('buildMissionPlanningDisplayIdeas', () => {
  it('shows unique ideation ideas without 16-slot format backfill', () => {
    const display = buildMissionPlanningDisplayIdeas({ nodes: [singleIdeaNode] });
    const production = buildMissionProductionIdeas({ nodes: [singleIdeaNode] });

    expect(display).toHaveLength(1);
    expect(display[0]?.concept_title).toBe('Yeni Ürünlerimiz Geldi!');
    expect(production.length).toBeGreaterThan(1);
  });

  it('dedupes repeated headlines across nodes', () => {
    const nodes = [
      singleIdeaNode,
      {
        ...singleIdeaNode,
        node_key: 'post_ideation',
        output_summary: JSON.stringify([
          {
            headline: 'Yeni Ürünlerimiz Geldi!',
            caption_draft: 'Duplicate headline should merge.',
            content_type: 'instagram_post',
          },
          {
            headline: 'Üretim Sürecimizi Keşfedin!',
            caption_draft: 'Emeğin ardındaki hikaye.',
            content_type: 'instagram_reel',
          },
        ]),
      },
    ];

    const unique = collectUniqueMissionIdeationIdeas(nodes);
    expect(unique).toHaveLength(2);
    expect(unique.map((i) => i.headline ?? i.concept_title)).toEqual([
      'Yeni Ürünlerimiz Geldi!',
      'Üretim Sürecimizi Keşfedin!',
    ]);
  });
});

describe('countPlanningNodeResults — content_strategy', () => {
  it('counts one strategy document, not pillar_mix rows', () => {
    const strategyNode = {
      task_type: 'content_strategy',
      status: 'completed',
      output_payload: {
        weekly_theme: 'Exciting Summer Nights at Sarnıç Beach',
        mission_brief: 'Highlight seafood menu and DJ nights.',
        pillar_mix: [
          { pillar: 'product/service value' },
          { pillar: 'event_announcement' },
          { pillar: 'social proof' },
          { pillar: 'conversion CTA' },
        ],
      },
    };

    expect(countPlanningNodeResults(strategyNode)).toBe(1);
  });
});
