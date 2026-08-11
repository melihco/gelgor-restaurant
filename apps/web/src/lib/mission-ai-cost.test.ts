import { describe, expect, it } from 'vitest';
import { buildMissionAiCostSummary } from '@/lib/mission-ai-cost';
import type { MissionProductionCostSummary } from '@/lib/production-cost-types';

describe('buildMissionAiCostSummary', () => {
  it('prefers cost_events ledger total + provider/scope lines', () => {
    const ledger: MissionProductionCostSummary = {
      mission_id: 'm1',
      total_usd: 4.25,
      measured_usd: 3.8,
      estimated_usd: 0.45,
      event_count: 12,
      slot_count: 8,
      slots: [],
      rollup: {
        mission_graph_usd: 1.1,
        feed_slot_usd: 3.0,
        integration_usd: 0,
        gallery_usd: 0.15,
        other_usd: 0,
        total_usd: 4.25,
        measured_usd: 3.8,
        estimated_usd: 0.45,
        event_count: 12,
        slot_count: 8,
        graph_by_category: { content_ideation: 0.9 },
        feed_by_category: { auto_produce: 3.0 },
        by_provider: { openai: 2.1, fal: 2.0, ideogram: 0.15 },
      },
    };

    const summary = buildMissionAiCostSummary({
      missionId: 'm1',
      artifacts: [],
      ledger,
    });

    expect(summary).not.toBeNull();
    expect(summary!.isEstimate).toBe(false);
    expect(summary!.totalUsd).toBe(4.25);
    expect(summary!.providerLines.map((l) => l.label)).toEqual([
      'OpenAI (GPT / image)',
      'fal.ai (görsel / video)',
      'Ideogram',
    ]);
    expect(summary!.scopeLines.find((l) => l.key === 'scope:feed_slot')?.usd).toBe(3);
    expect(summary!.scopeLines.find((l) => l.key === 'scope:mission_graph')?.usd).toBe(1.1);
  });
});
