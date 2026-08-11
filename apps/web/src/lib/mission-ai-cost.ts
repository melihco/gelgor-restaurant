/**
 * Mission Hub — tam AI maliyet özeti (graph LLM + Feed üretimi + cost_events ledger).
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
  type MissionProductionCostSummary as ArtifactFeedCostSummary,
} from '@/lib/mission-production-cost';
import type { MissionProductionCostSummary as LedgerCostSummary } from '@/lib/production-cost-types';

export interface MissionAiCostLine {
  key: string;
  label: string;
  usd: number;
  source: 'recorded' | 'estimated' | 'artifact' | 'ledger';
}

export interface MissionAiCostSummary {
  totalUsd: number;
  lines: MissionAiCostLine[];
  /** Provider slice from cost_events (openai / fal / ideogram …). */
  providerLines: MissionAiCostLine[];
  /** Scope slice: mission_graph / feed_slot / … */
  scopeLines: MissionAiCostLine[];
  artifactCount: number;
  feedBreakdown: ArtifactFeedCostSummary | null;
  ledger: LedgerCostSummary | null;
  isEstimate: boolean;
  minUsd: number;
  maxUsd: number;
}

const TASK_ESTIMATE: Record<string, { key: string; usd: number }> = {
  content_strategy: { key: 'content_strategy', usd: AI_UNIT_COST_USD.content_strategy ?? 0.20 },
  content_ideation: { key: 'content_ideation', usd: AI_UNIT_COST_USD.content_ideation ?? 1.00 },
  feed_cohesion_review: { key: 'feed_art_director', usd: AI_UNIT_COST_USD.feed_art_director ?? 0.45 },
};

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI (GPT / image)',
  fal: 'fal.ai (görsel / video)',
  fal_ai: 'fal.ai (görsel / video)',
  ideogram: 'Ideogram',
  luma: 'Luma',
  anthropic: 'Anthropic',
  elevenlabs: 'ElevenLabs',
  unknown: 'Diğer sağlayıcı',
};

const SCOPE_LABELS = {
  mission_graph: 'Mission graph (LLM)',
  feed_slot: 'Feed üretimi (slot)',
  integration: 'Entegrasyon',
  gallery: 'Galeri analizi',
  other: 'Diğer',
} as const;

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

function providerLabel(key: string): string {
  const k = key.toLowerCase();
  return PROVIDER_LABELS[k] ?? key;
}

function scopeLabel(key: string): string {
  return (SCOPE_LABELS as Record<string, string>)[key] ?? key;
}

function linesFromCategoryMap(
  map: Record<string, number> | null | undefined,
  source: MissionAiCostLine['source'],
  labels?: Record<string, string> | null,
): MissionAiCostLine[] {
  return sortedCategoryEntries(map).map(([key, usd]) => ({
    key,
    label: categoryLabel(key, labels),
    usd,
    source,
  }));
}

function buildLedgerCategoryLines(ledger: LedgerCostSummary): MissionAiCostLine[] {
  const rollup = ledger.rollup;
  if (!rollup) return [];
  const merged: Record<string, number> = {
    ...(rollup.graph_by_category ?? {}),
  };
  for (const [k, v] of Object.entries(rollup.feed_by_category ?? {})) {
    merged[k] = (merged[k] ?? 0) + v;
  }
  // Prefer human scopes when category maps are empty
  if (Object.keys(merged).length === 0) {
    if (rollup.mission_graph_usd > 0) merged.mission_graph = rollup.mission_graph_usd;
    if (rollup.feed_slot_usd > 0) merged.feed_slot = rollup.feed_slot_usd;
    if (rollup.gallery_usd > 0) merged.gallery = rollup.gallery_usd;
    if (rollup.integration_usd > 0) merged.integration = rollup.integration_usd;
    if (rollup.other_usd > 0) merged.other = rollup.other_usd;
  }
  return linesFromCategoryMap(merged, 'ledger', {
    mission_graph: SCOPE_LABELS.mission_graph,
    feed_slot: SCOPE_LABELS.feed_slot,
    gallery: SCOPE_LABELS.gallery,
    integration: SCOPE_LABELS.integration,
  });
}

export function buildMissionAiCostSummary(input: {
  missionId: string;
  artifacts: OutputArtifact[];
  performanceSummary?: Record<string, unknown> | null;
  nodes?: Array<{ task_type?: string; status?: string }> | null;
  categoryLabels?: Record<string, string> | null;
  /** cost_events rollup — preferred SSOT when present. */
  ledger?: LedgerCostSummary | null;
}): MissionAiCostSummary | null {
  const feedBreakdown = input.artifacts?.length
    ? summarizeMissionProductionCost(input.artifacts, input.missionId, null)
    : null;

  const ledger = input.ledger ?? null;
  const ledgerTotal = ledger && ledger.total_usd > 0 ? ledger.total_usd : 0;
  const rollup = ledger?.rollup ?? null;

  const providerLines: MissionAiCostLine[] = sortedCategoryEntries(rollup?.by_provider).map(
    ([key, usd]) => ({
      key: `provider:${key}`,
      label: providerLabel(key),
      usd,
      source: 'ledger' as const,
    }),
  );

  const scopeMap: Record<string, number> = {};
  if (rollup) {
    if (rollup.mission_graph_usd > 0) scopeMap.mission_graph = rollup.mission_graph_usd;
    if (rollup.feed_slot_usd > 0) scopeMap.feed_slot = rollup.feed_slot_usd;
    if (rollup.gallery_usd > 0) scopeMap.gallery = rollup.gallery_usd;
    if (rollup.integration_usd > 0) scopeMap.integration = rollup.integration_usd;
    if (rollup.other_usd > 0) scopeMap.other = rollup.other_usd;
  }
  const scopeLines: MissionAiCostLine[] = sortedCategoryEntries(scopeMap).map(([key, usd]) => ({
    key: `scope:${key}`,
    label: scopeLabel(key),
    usd,
    source: 'ledger' as const,
  }));

  if (ledgerTotal > 0) {
    const lines = buildLedgerCategoryLines(ledger!);
    return {
      totalUsd: Math.round(ledgerTotal * 1000) / 1000,
      lines: lines.length ? lines : scopeLines,
      providerLines,
      scopeLines,
      artifactCount: feedBreakdown?.artifactCount ?? 0,
      feedBreakdown,
      ledger,
      isEstimate: false,
      minUsd: 1.5,
      maxUsd: 3.6,
    };
  }

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
    providerLines,
    scopeLines,
    artifactCount: feedBreakdown?.artifactCount ?? 0,
    feedBreakdown,
    ledger,
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
