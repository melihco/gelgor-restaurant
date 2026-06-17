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

export const MISSION_FEED_IDEATION_TARGET = 7;

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

/** Merge multiple content_ideation nodes → weekly package (3 story, 2 post, 1 carousel, 1 reel). */
export function mergeMissionIdeationRecords(
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

  const targets: Record<IdeationFormat, number> = { story: 3, post: 2, carousel: 1, reel: 1 };
  const merged: Record<string, unknown>[] = [];
  for (const fmt of ['story', 'post', 'carousel', 'reel'] as const) {
    merged.push(...buckets[fmt].slice(0, targets[fmt]));
  }
  if (merged.length < MISSION_FEED_IDEATION_TARGET) {
    for (const fmt of ['story', 'post', 'reel', 'carousel'] as const) {
      for (const idea of buckets[fmt]) {
        if (merged.length >= MISSION_FEED_IDEATION_TARGET) break;
        if (!merged.includes(idea)) merged.push(idea);
      }
    }
  }
  return merged.slice(0, MISSION_FEED_IDEATION_TARGET);
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
