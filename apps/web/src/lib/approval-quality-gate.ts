/**
 * Faz 4 — Approval soft gate: hard block vs warn-only quality signals.
 * Sprint 3: delegates to production-quality-scorecard.
 */
import { buildProductionQualityScorecard } from '@/lib/production-quality-scorecard';
import type { OutputArtifact } from '@/types';

export interface ApprovalQualityGate {
  hardBlock: boolean;
  hardBlockReason: string | null;
  softWarnings: string[];
}

export function resolveApprovalQualityGate(
  artifact: OutputArtifact,
  meta: Record<string, unknown>,
): ApprovalQualityGate {
  const scorecard = buildProductionQualityScorecard(artifact, meta);
  return {
    hardBlock: scorecard.hardBlock,
    hardBlockReason: scorecard.hardBlockReason,
    softWarnings: scorecard.softWarnings,
  };
}
