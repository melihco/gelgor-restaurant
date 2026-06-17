/**
 * Sprint 3 — aggregate artifact quality scorecards for Mission Hub transparency.
 */
import { buildProductionQualityScorecard } from '@/lib/production-quality-scorecard';
import { parseArtifactMissionId } from '@/lib/production-bundle';
import type { OutputArtifact } from '@/types';

export interface MissionArtifactQualitySummary {
  total: number;
  ok: number;
  warned: number;
  blocked: number;
  avgMatchScore: number | null;
  avgGrafikerScore: number | null;
  avgPisScore: number | null;
  publishability: {
    ready: number;
    rendering: number;
    failed: number;
    unknown: number;
  };
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

export function summarizeMissionArtifactQuality(
  artifacts: OutputArtifact[],
  missionId: string,
): MissionArtifactQualitySummary {
  const missionArts = artifacts.filter((a) => parseArtifactMissionId(a) === missionId);
  const summary: MissionArtifactQualitySummary = {
    total: missionArts.length,
    ok: 0,
    warned: 0,
    blocked: 0,
    avgMatchScore: null,
    avgGrafikerScore: null,
    avgPisScore: null,
    publishability: { ready: 0, rendering: 0, failed: 0, unknown: 0 },
  };

  const matchScores: number[] = [];
  const grafikerScores: number[] = [];
  const pisScores: number[] = [];

  for (const artifact of missionArts) {
    const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
    const card = buildProductionQualityScorecard(artifact, meta);
    if (card.overall === 'block') summary.blocked += 1;
    else if (card.overall === 'warn') summary.warned += 1;
    else summary.ok += 1;

    if (card.matchScore != null) matchScores.push(card.matchScore);
    if (card.grafikerScore != null) grafikerScores.push(card.grafikerScore);
    if (card.pisScore != null) pisScores.push(card.pisScore);
    summary.publishability[card.publishability] += 1;
  }

  summary.avgMatchScore = avg(matchScores);
  summary.avgGrafikerScore = avg(grafikerScores);
  summary.avgPisScore = avg(pisScores);
  return summary;
}

export function describeMissionArtifactQualityAlerts(
  summary: MissionArtifactQualitySummary,
): string[] {
  const alerts: string[] = [];
  if (summary.blocked > 0) {
    alerts.push(`${summary.blocked} içerik hard-block — onay öncesi foto/kalite kontrolü`);
  }
  if (summary.publishability.failed > 0) {
    alerts.push(`${summary.publishability.failed} render hatası — yeniden üret veya retry`);
  }
  if (summary.publishability.rendering > 0) {
    alerts.push(`${summary.publishability.rendering} içerik hâlâ render ediliyor`);
  }
  if (summary.avgMatchScore != null && summary.avgMatchScore < 40) {
    alerts.push(`Ortalama galeri eşleşmesi düşük (${summary.avgMatchScore}%)`);
  }
  if (summary.avgGrafikerScore != null && summary.avgGrafikerScore < 8) {
    alerts.push(`Ortalama Grafiker skoru düşük (${summary.avgGrafikerScore}/10)`);
  }
  return alerts;
}
