import type { OutputArtifact } from '@/types';
import { parseArtifactContent, parseArtifactMetadata } from '@/lib/artifact-utils';

/** Best-effort production completion timestamp for feed/story ordering. */
export function resolveArtifactProductionTimeMs(artifact: OutputArtifact): number {
  const meta = parseArtifactMetadata(artifact.metadata);
  const content = parseArtifactContent(artifact.content);
  const candidates = [
    meta.produced_at,
    meta.producedAt,
    meta.production_completed_at,
    meta.productionCompletedAt,
    meta.auto_produced_at,
    meta.autoProducedAt,
    content.produced_at,
    content.producedAt,
    artifact.createdAt,
  ];
  for (const raw of candidates) {
    const ms = Date.parse(String(raw ?? '').trim());
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

/** Newest production first. */
export function compareArtifactsByProductionTime(a: OutputArtifact, b: OutputArtifact): number {
  return resolveArtifactProductionTimeMs(b) - resolveArtifactProductionTimeMs(a);
}
