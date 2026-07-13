import { describe, expect, it } from 'vitest';
import {
  compareArtifactsByProductionTime,
  resolveArtifactProductionTimeMs,
} from '@/lib/artifact-production-time';
import type { OutputArtifact } from '@/types';

function artifact(partial: Partial<OutputArtifact> & Pick<OutputArtifact, 'id' | 'createdAt'>): OutputArtifact {
  return {
    agentRunId: 'run',
    type: 'image',
    title: 'Test',
    content: '{}',
    mimeType: 'image/png',
    status: 'pending_review',
    ...partial,
  };
}

describe('resolveArtifactProductionTimeMs', () => {
  it('prefers metadata produced_at over createdAt', () => {
    const ms = resolveArtifactProductionTimeMs(artifact({
      id: 'a',
      createdAt: '2026-01-01T10:00:00.000Z',
      metadata: { produced_at: '2026-01-05T18:00:00.000Z' },
    }));
    expect(ms).toBe(Date.parse('2026-01-05T18:00:00.000Z'));
  });

  it('falls back to createdAt', () => {
    const ms = resolveArtifactProductionTimeMs(artifact({
      id: 'b',
      createdAt: '2026-02-01T12:00:00.000Z',
    }));
    expect(ms).toBe(Date.parse('2026-02-01T12:00:00.000Z'));
  });
});

describe('compareArtifactsByProductionTime', () => {
  it('orders newest production first', () => {
    const older = artifact({ id: 'old', createdAt: '2026-01-01T10:00:00.000Z' });
    const newer = artifact({ id: 'new', createdAt: '2026-01-10T10:00:00.000Z' });
    expect(compareArtifactsByProductionTime(newer, older)).toBeLessThan(0);
    expect([older, newer].sort(compareArtifactsByProductionTime).map((a) => a.id)).toEqual(['new', 'old']);
  });
});
