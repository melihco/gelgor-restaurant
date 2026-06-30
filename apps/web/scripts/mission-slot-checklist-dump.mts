import { readFileSync, writeFileSync } from 'fs';
import { buildMissionSlotChecklist } from '../src/lib/mission-slot-checklist.ts';
import { parseArtifactMetadata, parseArtifactContent } from '../src/lib/artifact-utils.ts';
import type { OutputArtifact } from '../src/types';

const missionId = process.argv[2] ?? '4d033224-c08c-43b6-abdc-54e2e74ab9be';
const artifactsPath = process.argv[3] ?? '/tmp/sarnic-mission-artifacts.json';
const missionPath = process.argv[4] ?? '/tmp/sarnic-mission.json';

const artifacts = JSON.parse(readFileSync(artifactsPath, 'utf8')) as OutputArtifact[];
const mission = JSON.parse(readFileSync(missionPath, 'utf8')) as {
  title?: string;
  type?: string;
  status?: string;
  nodes?: Array<{ node_key?: string; output_summary?: string }>;
};

const fdNode = mission.nodes?.find((n) => n.node_key === 'feed_cohesion_review');
const fdReport = fdNode?.output_summary ? JSON.parse(fdNode.output_summary) : {};
const assignments = fdReport.production_assignments ?? [];

const checklist = buildMissionSlotChecklist({
  missionId,
  missionType: mission.type,
  missionTitle: mission.title,
  assignments,
  artifacts,
  missionInFlight: mission.status !== 'completed',
});

function mediaHint(artifact: OutputArtifact | null): string {
  if (!artifact) return '—';
  const meta = parseArtifactMetadata(artifact.metadata);
  const content = parseArtifactContent(artifact.content);
  const url = String(artifact.contentUrl ?? '').trim();
  const video = String(content.videoUrl ?? meta.videoUrl ?? '').trim();
  const pipeline = String(meta.pipeline ?? '');
  const ext = url.match(/\.(mp4|png|jpg|webp)(\?|$)/i)?.[1]?.toUpperCase() ?? (url ? '?' : '—');
  const vidExt = video.match(/\.(mp4|png)(\?|$)/i)?.[1]?.toUpperCase();
  return [
    pipeline || meta.production_role,
    url ? `contentUrl.${ext}` : null,
    video ? `video.${vidExt ?? '?'}` : null,
    meta.fal_video_produced ? 'fal_video' : null,
  ].filter(Boolean).join(' · ');
}

const rows = checklist.items.map((item, idx) => {
  const artifact = item.artifactId
    ? artifacts.find((a) => a.id === item.artifactId) ?? null
    : null;
  return {
    slot: idx + 1,
    role: item.role,
    pipeline: item.pipeline,
    idea: item.ideaIndex,
    status: item.status,
    required: item.required,
    headline: item.headline?.slice(0, 48) ?? null,
    artifactId: item.artifactId?.slice(0, 8) ?? null,
    media: mediaHint(artifact),
  };
});

const summary = {
  missionId,
  title: mission.title,
  missionStatus: mission.status,
  fdAssignments: assignments.length,
  manifestCoverage: fdReport.manifest_coverage_pct,
  formatDistribution: fdReport.format_distribution,
  requiredTotal: checklist.requiredTotal,
  readyRequired: checklist.readyRequired,
  readyTotal: checklist.readyTotal,
  failedCount: checklist.failedCount,
  renderingCount: checklist.renderingCount,
  coveragePct: checklist.coveragePct,
};

writeFileSync('/tmp/sarnic-slot-checklist.json', JSON.stringify({ summary, rows }, null, 2));
console.log(JSON.stringify({ summary, rows }, null, 2));
