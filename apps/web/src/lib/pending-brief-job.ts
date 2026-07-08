import type { OutputArtifact } from '@/types';

export type PendingBriefOutputType = 'story' | 'reel' | 'post';

export interface PendingBriefJob {
  id: string;
  title: string;
  outputType: PendingBriefOutputType;
  count: number;
  startedAt: number;
}

const START_SLACK_MS = 5_000;

export function countNewBriefArtifacts(
  artifacts: OutputArtifact[],
  job: PendingBriefJob,
): number {
  const since = job.startedAt - START_SLACK_MS;
  return artifacts.filter((artifact) => {
    const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
    if (meta.source !== 'new_brief') return false;
    return new Date(artifact.createdAt).getTime() >= since;
  }).length;
}

export function isPendingBriefJobComplete(
  artifacts: OutputArtifact[],
  job: PendingBriefJob,
): boolean {
  return countNewBriefArtifacts(artifacts, job) >= job.count;
}

export function pendingBriefOutputLabel(outputType: PendingBriefOutputType): string {
  switch (outputType) {
    case 'story': return 'story';
    case 'reel': return 'reel';
    default: return 'gönderi';
  }
}
