/**
 * Parse content_ideation output_summary → auto-produce payload records.
 * Mirrors Python canvas_output_parser + production-idea-parse (ICS).
 */
import {
  parseProductionIdeas,
  productionIdeasFromParsed,
  productionIdeaToRecord,
} from '@/lib/production-idea-parse';
import { nodeHasOutput, nodeOutputArray } from '@/lib/mission-node-output';
import { extractObjectArrayFromSummary } from '@/lib/output-summary-array';
import { MISSION_WEEKLY_PACKAGE_COUNTS } from '@/lib/mission-production-manifest';
import {
  resolveWeeklyPackageGeometry,
} from '@/lib/package-weekly-geometry';

/** Default ideation target for Agency weekly package (16). */
export const MISSION_FEED_IDEATION_TARGET = MISSION_WEEKLY_PACKAGE_COUNTS.total;

export function resolveMissionFeedIdeationTarget(packageSlug?: string | null): number {
  return resolveWeeklyPackageGeometry(packageSlug).total;
}

type IdeationFormat = 'story' | 'post' | 'reel' | 'carousel';

function ideaFormatFromRecord(idea: Record<string, unknown>): IdeationFormat {
  const blob = [
    idea.content_type,
    idea.format,
    idea.content_kind,
  ].map((v) => String(v ?? '').toLowerCase()).join(' ');
  if (blob.includes('reel')) return 'reel';
  if (blob.includes('carousel')) return 'carousel';
  if (blob.includes('story')) return 'story';
  return 'post';
}

function ideaDedupeKey(idea: Record<string, unknown>): string {
  for (const field of ['concept_title', 'idea_title', 'headline', 'caption_draft']) {
    const v = String(idea[field] ?? '').trim().toLowerCase();
    if (v.length >= 8) return v.slice(0, 120);
  }
  return JSON.stringify(idea).slice(0, 200);
}

/** Merge multiple content_ideation nodes → weekly package (plan-aware format mix). */
export function mergeMissionIdeationRecords(
  nodes: Array<{
    node_key?: string;
    output_summary?: string | null;
    output_payload?: unknown;
    status?: string;
    task_type?: string;
  }>,
  missionId?: string,
  packageSlug?: string | null,
): Record<string, unknown>[] {
  const order = ['weekly_content_ideation', 'content_ideation', 'post_ideation', 'reel_ideation'];
  const completed = nodes
    .filter(
      (n) => n.task_type === 'content_ideation'
        && n.status === 'completed'
        && nodeHasOutput(n),
    )
    .sort((a, b) => {
      const ai = order.indexOf(a.node_key ?? '');
      const bi = order.indexOf(b.node_key ?? '');
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });

  const buckets: Record<IdeationFormat, Record<string, unknown>[]> = {
    story: [],
    post: [],
    carousel: [],
    reel: [],
  };
  const seen = new Set<string>();

  for (const node of completed) {
    const records = ideationRecordsFromNode(node, missionId);
    for (const idea of records) {
      const key = ideaDedupeKey(idea);
      if (seen.has(key)) continue;
      seen.add(key);
      const fmt = ideaFormatFromRecord(idea);
      buckets[fmt].push(idea);
    }
  }

  const geometry = resolveWeeklyPackageGeometry(packageSlug);
  const targets: Record<IdeationFormat, number> = {
    story: geometry.story,
    post: geometry.post,
    carousel: geometry.carousel,
    reel: geometry.reel,
  };
  const ideationTarget = geometry.total;
  const merged: Record<string, unknown>[] = [];
  for (const fmt of ['story', 'post', 'carousel', 'reel'] as const) {
    merged.push(...buckets[fmt].slice(0, targets[fmt]));
  }
  if (merged.length < ideationTarget) {
    for (const fmt of ['story', 'post', 'reel', 'carousel'] as const) {
      for (const idea of buckets[fmt]) {
        if (merged.length >= ideationTarget) break;
        if (!merged.includes(idea)) merged.push(idea);
      }
    }
  }
  return merged.slice(0, ideationTarget);
}

/** Unique ideation records from mission nodes — no manifest slot backfill (planning UI). */
export function collectUniqueMissionIdeationIdeas(
  nodes: Array<{
    node_key?: string;
    output_summary?: string | null;
    output_payload?: unknown;
    status?: string;
    task_type?: string;
  }>,
  missionId?: string,
): Record<string, unknown>[] {
  const order = ['weekly_content_ideation', 'content_ideation', 'post_ideation', 'reel_ideation'];
  const completed = nodes
    .filter(
      (n) => n.task_type === 'content_ideation'
        && n.status === 'completed'
        && nodeHasOutput(n),
    )
    .sort((a, b) => {
      const ai = order.indexOf(a.node_key ?? '');
      const bi = order.indexOf(b.node_key ?? '');
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });

  const seen = new Set<string>();
  const unique: Record<string, unknown>[] = [];

  for (const node of completed) {
    const records = ideationRecordsFromNode(node, missionId);
    for (const idea of records) {
      const key = ideaDedupeKey(idea);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(idea);
    }
  }

  return unique.map((idea, index) => ({ ...idea, idea_index: index }));
}

/** Normalised idea records for POST /api/auto-produce. Never throws. */
export function ideationRecordsFromSummary(
  outputSummary: string,
  missionId?: string,
): Record<string, unknown>[] {
  const fromSignal = parseProductionIdeas(outputSummary, missionId);
  if (fromSignal.length > 0) {
    return fromSignal.map(productionIdeaToRecord);
  }

  const raw = extractObjectArrayFromSummary(outputSummary);
  if (raw.length > 0) {
    return productionIdeasFromParsed(raw, missionId).map(productionIdeaToRecord);
  }

  return [];
}

export function ideationRecordsFromNode(
  node: { output_summary?: string | null; output_payload?: unknown },
  missionId?: string,
): Record<string, unknown>[] {
  const payloadItems = nodeOutputArray(node);
  if (payloadItems.length > 0) {
    return productionIdeasFromParsed(payloadItems, missionId).map(productionIdeaToRecord);
  }
  return ideationRecordsFromSummary(node.output_summary ?? '', missionId);
}
