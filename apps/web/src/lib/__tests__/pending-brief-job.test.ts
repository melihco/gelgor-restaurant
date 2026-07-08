import { describe, expect, it } from 'vitest';
import type { OutputArtifact } from '@/types';
import {
  countNewBriefArtifacts,
  isPendingBriefJobComplete,
  pendingBriefOutputLabel,
} from '../pending-brief-job';

function artifact(
  source: string,
  createdAt: string,
  status: OutputArtifact['status'] = 'pending_review',
): OutputArtifact {
  return {
    id: crypto.randomUUID(),
    agentRunId: 'run-1',
    type: 'image',
    mimeType: 'image/png',
    title: 'Test',
    content: '{}',
    contentUrl: undefined,
    status,
    createdAt,
    metadata: { source },
  };
}

describe('pending-brief-job', () => {
  const job = {
    id: 'job-1',
    title: 'Bahçede Kahvaltı',
    outputType: 'story' as const,
    count: 2,
    startedAt: Date.parse('2026-07-04T14:00:00.000Z'),
  };

  it('counts new_brief artifacts created after job start', () => {
    const artifacts = [
      artifact('auto-produce', '2026-07-04T13:59:00.000Z'),
      artifact('new_brief', '2026-07-04T14:00:05.000Z'),
      artifact('new_brief', '2026-07-04T14:00:10.000Z'),
    ];
    expect(countNewBriefArtifacts(artifacts, job)).toBe(2);
    expect(isPendingBriefJobComplete(artifacts, job)).toBe(true);
  });

  it('ignores unrelated sources and older artifacts', () => {
    const artifacts = [
      artifact('new_brief', '2026-07-04T13:58:00.000Z'),
      artifact('auto-produce', '2026-07-04T14:00:05.000Z'),
    ];
    expect(countNewBriefArtifacts(artifacts, job)).toBe(0);
    expect(isPendingBriefJobComplete(artifacts, job)).toBe(false);
  });

  it('labels output types for banner copy', () => {
    expect(pendingBriefOutputLabel('story')).toBe('story');
    expect(pendingBriefOutputLabel('reel')).toBe('reel');
    expect(pendingBriefOutputLabel('post')).toBe('gönderi');
  });
});
