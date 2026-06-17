/**
 * APO-8 — Mission üretim maliyeti özeti (artifact metadata.cost_usd_estimate).
 */
import type { OutputArtifact } from '@/types';
import { parseArtifactMissionId } from '@/lib/mission-feed-package';

export interface MissionProductionCostSummary {
  totalUsd: number;
  artifactCount: number;
  runwayUsd: number;
  remotionUsd: number;
  imageUsd: number;
  otherUsd: number;
  qualityTier: string | null;
}

function artifactCostUsd(meta: Record<string, unknown>): number {
  const raw = meta.cost_usd_estimate ?? meta.production_cost_usd;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function rendererBucket(meta: Record<string, unknown>): 'runway' | 'remotion' | 'image' | 'other' {
  const r = String(meta.renderer_executed ?? meta.pipeline ?? '').toLowerCase();
  if (r.includes('runway')) return 'runway';
  if (r.includes('remotion')) return 'remotion';
  if (r.includes('gpt') || r.includes('gallery') || r.includes('enhance') || r.includes('overlay')) {
    return 'image';
  }
  return 'other';
}

export function formatMissionCostUsd(total: number): string {
  if (total <= 0) return '—';
  if (total < 0.01) return '<$0.01';
  return `~$${total.toFixed(2)}`;
}

export function summarizeMissionProductionCost(
  artifacts: OutputArtifact[],
  missionId: string,
  brandTheme?: Record<string, unknown> | null,
): MissionProductionCostSummary | null {
  const missionArts = artifacts.filter((a) => parseArtifactMissionId(a) === missionId);
  if (!missionArts.length) return null;

  let totalUsd = 0;
  let runwayUsd = 0;
  let remotionUsd = 0;
  let imageUsd = 0;
  let otherUsd = 0;
  let counted = 0;

  for (const a of missionArts) {
    const meta = (a.metadata ?? {}) as Record<string, unknown>;
    if (meta.auto_produced !== true && meta.source !== 'auto-produce') continue;
    const cost = artifactCostUsd(meta);
    if (cost <= 0) continue;
    counted += 1;
    totalUsd += cost;
    const bucket = rendererBucket(meta);
    if (bucket === 'runway') runwayUsd += cost;
    else if (bucket === 'remotion') remotionUsd += cost;
    else if (bucket === 'image') imageUsd += cost;
    else otherUsd += cost;
  }

  const tier = String(
    brandTheme?.quality_tier ?? brandTheme?.qualityTier ?? '',
  ).trim() || null;

  return {
    totalUsd: Math.round(totalUsd * 1000) / 1000,
    artifactCount: counted,
    runwayUsd: Math.round(runwayUsd * 1000) / 1000,
    remotionUsd: Math.round(remotionUsd * 1000) / 1000,
    imageUsd: Math.round(imageUsd * 1000) / 1000,
    otherUsd: Math.round(otherUsd * 1000) / 1000,
    qualityTier: tier,
  };
}
