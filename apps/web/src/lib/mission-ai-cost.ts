/**
 * Mission Hub — tam AI maliyet özeti (graph LLM + Feed üretimi).
 */
import type { OutputArtifact } from '@/types';
import {
  AI_UNIT_COST_USD,
  MISSION_FULL_CYCLE_ESTIMATE_USD,
  categoryLabel,
  formatUsd,
  sortedCategoryEntries,
} from '@/lib/ai-cost-catalog';
import {
  summarizeMissionProductionCost,
  type MissionProductionCostSummary,
} from '@/lib/mission-production-cost';

export interface MissionAiCostLine {
  key: string;
  label: string;
  usd: number;
  source: 'recorded' | 'estimated' | 'artifact';
}

export interface MissionAiCostSummary {
  totalUsd: number;
  lines: MissionAiCostLine[];
  artifactCount: number;
  feedBreakdown: MissionProductionCostSummary | null;
  isEstimate: boolean;
  minUsd: number;
  maxUsd: number;
}

const TASK_ESTIMATE: Record<string, { key: string; usd: number }> = {
  content_strategy: { key: 'content_strategy', usd: AI_UNIT_COST_USD.content_strategy ?? 0.20 },
  content_ideation: { key: 'content_ideation', usd: AI_UNIT_COST_USD.content_ideation ?? 1.00 },
  feed_cohesion_review: { key: 'feed_art_director', usd: AI_UNIT_COST_USD.feed_art_director ?? 0.45 },
};

function parsePerformanceCostBreakdown(
  perf: Record<string, unknown> | null | undefined,
): Record<string, number> {
  const raw = perf?.ai_cost_breakdown;
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k === 'total_usd' || k === 'updated_at') continue;
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}

function estimateFromNodes(
  nodes: Array<{ task_type?: string; status?: string }> | null | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!nodes?.length) return out;
  for (const n of nodes) {
    if (n.status !== 'completed') continue;
    const spec = TASK_ESTIMATE[n.task_type ?? ''];
    if (!spec) continue;
    out[spec.key] = (out[spec.key] ?? 0) + spec.usd;
  }
  return out;
}

export function buildMissionAiCostSummary(input: {
  missionId: string;
  artifacts: OutputArtifact[];
  performanceSummary?: Record<string, unknown> | null;
  nodes?: Array<{ task_type?: string; status?: string }> | null;
  categoryLabels?: Record<string, string> | null;
}): MissionAiCostSummary | null {
  const feedBreakdown = input.artifacts?.length
    ? summarizeMissionProductionCost(input.artifacts, input.missionId, null)
    : null;

  const recorded = parsePerformanceCostBreakdown(input.performanceSummary);
  const hasRecorded = Object.keys(recorded).length > 0;
  const estimated = hasRecorded ? {} : estimateFromNodes(input.nodes);
  const hasCompletedNodes = Boolean(input.nodes?.some((n) => n.status === 'completed'));

  const merged: Record<string, number> = { ...estimated, ...recorded };

  if (hasCompletedNodes || Object.keys(recorded).length > 0) {
    merged.mission_propose = merged.mission_propose ?? AI_UNIT_COST_USD.mission_propose ?? 0.28;
  }

  if (feedBreakdown && feedBreakdown.totalUsd > 0) {
    const existing = merged.auto_produce ?? 0;
    if (feedBreakdown.totalUsd > existing) {
      merged.auto_produce = feedBreakdown.totalUsd;
    }
  }

  const lines: MissionAiCostLine[] = sortedCategoryEntries(merged).map(([key, usd]) => ({
    key,
    label: categoryLabel(key, input.categoryLabels),
    usd,
    source: recorded[key] != null
      ? 'recorded'
      : key === 'auto_produce' && feedBreakdown?.totalUsd
        ? 'artifact'
        : 'estimated',
  }));

  let totalUsd = Math.round(
    lines.reduce((s, l) => s + l.usd, 0) * 1000,
  ) / 1000;

  if (totalUsd <= 0 && !hasCompletedNodes && !feedBreakdown?.artifactCount) {
    return null;
  }

  const minUsd = 1.5;
  const maxUsd = 3.6;
  const isEstimate = !hasRecorded && lines.every((l) => l.source === 'estimated');

  if (totalUsd <= 0 && hasCompletedNodes) {
    const estLines: MissionAiCostLine[] = sortedCategoryEntries(estimateFromNodes(input.nodes)).map(
      ([key, usd]) => ({
        key,
        label: categoryLabel(key, input.categoryLabels),
        usd,
        source: 'estimated' as const,
      }),
    );
    if (estLines.length) {
      lines.push(...estLines.filter((e) => !lines.some((l) => l.key === e.key)));
      totalUsd = Math.round(lines.reduce((s, l) => s + l.usd, 0) * 1000) / 1000;
    }
  }

  return {
    totalUsd: totalUsd > 0
      ? totalUsd
      : MISSION_FULL_CYCLE_ESTIMATE_USD - (AI_UNIT_COST_USD.mission_propose ?? 0.28),
    lines,
    artifactCount: feedBreakdown?.artifactCount ?? 0,
    feedBreakdown,
    isEstimate: isEstimate || totalUsd <= 0,
    minUsd,
    maxUsd,
  };
}

export function formatMissionAiCostRange(summary: MissionAiCostSummary): string {
  if (summary.isEstimate && summary.totalUsd <= 0) {
    return `${formatUsd(summary.minUsd)} – ${formatUsd(summary.maxUsd)}`;
  }
  return formatUsd(summary.totalUsd);
}
