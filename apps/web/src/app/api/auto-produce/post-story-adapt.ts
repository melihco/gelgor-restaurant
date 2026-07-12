/**
 * Post → story format adaptation for empty mission story slots.
 *
 * When ideation is short or story production fails, reuse successfully produced
 * feed posts as story alternatives (same brief, different format — not duplicate spam).
 */
import { assignmentImpliesStoryFormat } from '@/lib/production-pipeline-router';
import type { ManifestProductionQueueItem } from '@/lib/auto-produce/build-production-queue';
import {
  findMissionSlotBackfillItems,
  missionSlotRunKey,
  type ProductionRunResultRow,
} from '@/lib/mission-slot-backfill';
import { missionStoryLibrarySlotKey } from '@/lib/mission-story-template';
import type { BrandTemplateLibrary } from '@/lib/brand-template-library';
import type { ProductionSlotRole } from '@/lib/mission-production-manifest';
import type { NexusClient } from './nexus-client';
import type { OutputArtifact } from '@/types';

/** Post slot roles eligible as story adaptation sources. */
const POST_ADAPT_SOURCE_ROLES = new Set<ProductionSlotRole>([
  'organic_post',
  'designed_post',
  'designed_typography',
  'fal_designed_post',
  'fal_only_post',
]);

export interface PostAdaptSource {
  artifactId: string;
  ideaIndex: number;
  headline: string;
  caption: string;
  imageUrl: string;
  referencePhotoUrl: string;
  mood?: string;
  treatment?: string;
  templateUseCase?: string;
  nodeKey?: string | null;
  missionId: string;
  productionRole: string;
  hashtags?: string[];
}

export interface StoryAdaptPlan {
  slot: ManifestProductionQueueItem;
  source: PostAdaptSource;
}

function metaString(meta: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function metaNumber(meta: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

function parseArtifactContent(content: string | null | undefined): Record<string, unknown> {
  if (!content) return {};
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function isStoryFormatQueueItem(item: ManifestProductionQueueItem): boolean {
  return assignmentImpliesStoryFormat(item.assignment.slot_role)
    || item.assignment.pipeline === 'remotion_story'
    || item.assignment.pipeline === 'story_still';
}

function isPostAdaptSourceRow(row: ProductionRunResultRow): boolean {
  if (!row.id || row.error) return false;
  const meta = row.metadata ?? {};
  if (meta.format_adaptation === 'post_to_story') return false;
  if (meta.adapted_from_artifact_id) return false;

  const role = String(meta.production_role ?? meta.productionRole ?? '');
  if (POST_ADAPT_SOURCE_ROLES.has(role as ProductionSlotRole)) return true;

  const fmt = String(meta.contentType ?? meta.kind ?? '').toLowerCase();
  return fmt === 'post' && Boolean(row.imageUrl?.trim());
}

export function artifactToProductionRunRow(artifact: OutputArtifact): ProductionRunResultRow {
  const meta = (typeof artifact.metadata === 'object' && artifact.metadata
    ? artifact.metadata
    : {}) as Record<string, unknown>;
  const content = parseArtifactContent(artifact.content);
  const imageUrl = String(
    meta.imageUrl
    ?? content.imageUrl
    ?? artifact.contentUrl
    ?? '',
  ).trim();
  const role = String(meta.production_role ?? meta.productionRole ?? '');
  const ideaIdx = metaNumber(meta, 'idea_index', 'ideaIndex') ?? -1;

  return {
    id: artifact.id,
    title: artifact.title ?? '',
    imageUrl,
    error: undefined,
    publishReady: meta.bundle_status !== 'rendering' && meta.bundle_status !== 'failed',
    rendering: meta.bundle_status === 'rendering',
    slotKey: ideaIdx >= 0 && role ? `${ideaIdx}:${role}` : undefined,
    metadata: meta,
  };
}

export function collectPostAdaptSources(rows: ProductionRunResultRow[]): PostAdaptSource[] {
  const out: PostAdaptSource[] = [];
  for (const row of rows) {
    if (!isPostAdaptSourceRow(row)) continue;
    const meta = row.metadata ?? {};
    const ideaIndex = metaNumber(meta, 'idea_index', 'ideaIndex') ?? -1;
    if (ideaIndex < 0) continue;

    const referencePhotoUrl = metaString(
      meta,
      'reference_photo_url',
      'referencePhotoUrl',
      'selected_gallery_url',
    ) || row.imageUrl;

    out.push({
      artifactId: row.id!,
      ideaIndex,
      headline: metaString(meta, 'headline', 'ideation_headline') || row.title,
      caption: metaString(meta, 'caption', 'caption_draft', 'ideation_caption'),
      imageUrl: row.imageUrl,
      referencePhotoUrl,
      mood: metaString(meta, 'mood') || undefined,
      treatment: metaString(meta, 'treatment') || undefined,
      templateUseCase: metaString(meta, 'template_use_case', 'templateUseCase') || undefined,
      nodeKey: metaString(meta, 'node_key', 'nodeKey') || null,
      missionId: metaString(meta, 'mission_id', 'missionId'),
      productionRole: String(meta.production_role ?? meta.productionRole ?? ''),
      hashtags: Array.isArray(meta.hashtags)
        ? meta.hashtags.map((h) => String(h))
        : undefined,
    });
  }
  return out;
}

export function findEmptyStorySlotItems(
  queue: ManifestProductionQueueItem[],
  results: ProductionRunResultRow[],
): ManifestProductionQueueItem[] {
  const backfill = findMissionSlotBackfillItems(queue, results);
  return backfill.filter(isStoryFormatQueueItem);
}

export function planPostToStoryAdaptations(
  emptyStorySlots: ManifestProductionQueueItem[],
  postSources: PostAdaptSource[],
  opts?: {
    /** Artifact ids already used as adaptation sources this mission. */
    usedSourceArtifactIds?: Set<string>;
    /** Slot keys already filled by a prior post_to_story pass. */
    usedAdaptSlotKeys?: Set<string>;
  },
): StoryAdaptPlan[] {
  if (!emptyStorySlots.length || !postSources.length) return [];

  const usedSources = new Set(opts?.usedSourceArtifactIds ?? []);
  const usedSlots = new Set(opts?.usedAdaptSlotKeys ?? []);
  const plans: StoryAdaptPlan[] = [];

  const pickSourceForSlot = (
    slot: ManifestProductionQueueItem,
    pool: PostAdaptSource[],
  ): PostAdaptSource | null => {
    const sameIdea = pool.find(
      (p) => p.ideaIndex === slot.ideaIndex && !usedSources.has(p.artifactId),
    );
    if (sameIdea) return sameIdea;

    for (const p of pool) {
      if (!usedSources.has(p.artifactId)) return p;
    }
    return null;
  };

  for (const slot of emptyStorySlots) {
    const slotKey = missionSlotRunKey(slot.ideaIndex, slot.assignment.slot_role);
    if (usedSlots.has(slotKey)) continue;

    const source = pickSourceForSlot(slot, postSources);
    if (!source) break;

    usedSources.add(source.artifactId);
    usedSlots.add(slotKey);
    plans.push({ slot, source });
  }

  return plans;
}

export interface PostStoryAdaptContext {
  workspaceId: string;
  missionId: string;
  nodeKey?: string | null;
  queue: ManifestProductionQueueItem[];
  runResults: ProductionRunResultRow[];
  persistedArtifacts?: OutputArtifact[];
  templateLibrary: BrandTemplateLibrary;
  brandBusinessType: string;
  brandName: string;
  nexusClient: NexusClient;
}

export interface PostStoryAdaptOutcome {
  attempted: boolean;
  adapted: number;
  results: ProductionRunResultRow[];
  costEstimate: number;
}

export async function deriveStoriesFromPostsForEmptySlots(
  ctx: PostStoryAdaptContext,
): Promise<PostStoryAdaptOutcome> {
  const persistedRows = (ctx.persistedArtifacts ?? []).map(artifactToProductionRunRow);
  const seenIds = new Set<string>();
  const mergedResults: ProductionRunResultRow[] = [];
  for (const row of [...ctx.runResults, ...persistedRows]) {
    if (row.id) {
      if (seenIds.has(row.id)) continue;
      seenIds.add(row.id);
    }
    mergedResults.push(row);
  }

  const emptyStorySlots = findEmptyStorySlotItems(ctx.queue, mergedResults);
  const postSources = collectPostAdaptSources(mergedResults);

  const usedAdaptSources = new Set<string>();
  for (const row of mergedResults) {
    const meta = row.metadata ?? {};
    const fromId = metaString(meta, 'adapted_from_artifact_id', 'adaptedFromArtifactId');
    if (fromId) usedAdaptSources.add(fromId);
  }

  const plans = planPostToStoryAdaptations(emptyStorySlots, postSources, {
    usedSourceArtifactIds: usedAdaptSources,
  });

  if (!plans.length) {
    return {
      attempted: false,
      adapted: 0,
      results: [],
      costEstimate: 0,
    };
  }

  const results: ProductionRunResultRow[] = [];
  let costEstimate = 0;
  let storyOrdinal = 0;

  for (const { slot, source } of plans) {
    const assignment = slot.assignment;
    const photoUrl = source.referencePhotoUrl || source.imageUrl;
    if (!photoUrl) continue;

    const effectiveFmt = 'story';
    const effectiveKind = 'instagram_story';
    const headline = source.headline || ctx.brandName;
    const caption = source.caption || headline;
    const storySlotKey = assignment.library_slot_key
      ?? missionStoryLibrarySlotKey(ctx.templateLibrary, storyOrdinal);
    const persistUrl = source.imageUrl || photoUrl;

    const metadata: Record<string, unknown> = {
      auto_produced: true,
      source: 'auto-produce',
      format_adaptation: 'post_to_story',
      adapted_from_artifact_id: source.artifactId,
      adapted_from_role: source.productionRole,
      assignment_rationale: 'post_format_adaptation',
      contentType: effectiveFmt,
      kind: effectiveKind,
      platform: 'instagram',
      headline,
      caption: caption.slice(0, 2200),
      mission_id: ctx.missionId,
      node_key: ctx.nodeKey ?? source.nodeKey ?? null,
      idea_index: slot.ideaIndex,
      production_role: assignment.slot_role,
      pipeline: assignment.pipeline,
      publish_channel: assignment.publish_channel,
      copy_bundle_id: assignment.copy_bundle_id,
      library_slot_key: storySlotKey,
      publish_package: 'primary',
      publish_priority: 'extended',
      reference_photo_url: photoUrl,
      imageUrl: persistUrl,
      gallery_sourced: true,
      cost_usd_estimate: 0.002,
      ...(source.mood ? { mood: source.mood } : {}),
      ...(source.treatment ? { treatment: source.treatment } : {}),
    };

    const contentJson = JSON.stringify({
      kind: effectiveKind,
      contentType: effectiveFmt,
      caption,
      hashtags: source.hashtags ?? [],
      headline,
      imageUrl: persistUrl,
      reference_photo_url: photoUrl,
      idea_index: slot.ideaIndex,
      mission_id: ctx.missionId,
      format_adaptation: 'post_to_story',
      adapted_from_artifact_id: source.artifactId,
    });

    const saved = await ctx.nexusClient.saveArtifact(ctx.workspaceId, {
      title: `${headline} — Story`,
      contentUrl: persistUrl,
      content: contentJson,
      platform: 'instagram',
      contentType: effectiveFmt,
      metadata,
    });

    if (!saved.id || saved.error) {
      results.push({
        title: headline,
        imageUrl: persistUrl,
        error: saved.error ?? 'post_story_adapt_save_failed',
        metadata,
      });
      continue;
    }

    costEstimate += 0.002;
    results.push({
      id: saved.id,
      title: `${headline} — Story`,
      imageUrl: persistUrl,
      error: saved.error,
      publishReady: true,
      rendering: false,
      slotKey: missionSlotRunKey(slot.ideaIndex, assignment.slot_role),
      metadata,
    });

    storyOrdinal += 1;
    console.log(
      `[auto-produce] Post→story adapt: slot ${assignment.slot_role} `
      + `← post ${source.productionRole} (${source.artifactId.slice(0, 8)}) `
      + `"${headline.slice(0, 40)}"`,
    );
  }

  return {
    attempted: results.length > 0,
    adapted: results.filter((r) => r.id && !r.error).length,
    results,
    costEstimate,
  };
}
