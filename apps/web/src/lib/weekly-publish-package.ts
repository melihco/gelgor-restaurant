import { parseArtifactContent, parseArtifactMetadata, resolveCarouselUrls } from '@/lib/artifact-utils';
import {
  dedupeFeedDisplayArtifacts,
  dedupeProductionBundles,
  getProductionBundleStatus,
  isBundleFailed,
  isBundleRendering,
  isProductionBundle,
  isProductionBundleStory,
  parseArtifactMissionId,
  resolveBrandedPostUrl,
  resolvePosterUrl,
  resolveStoryVideoUrl,
} from '@/lib/production-bundle';
import { nodeHasOutput, nodeOutputArray, nodeOutputObject } from '@/lib/mission-node-output';
import { buildMissionProductionIdeas } from '@/lib/mission-production-plan';
import { isPublishableMediaUrl } from '@/lib/media-url';
import {
  MISSION_WEEKLY_PACKAGE_COUNTS,
  type ProductionAssignment,
} from '@/lib/mission-production-manifest';
import type { OutputArtifact } from '@/types';
import type { MissionNodeProgress } from '@/types';

export type PackageFormat = 'story' | 'post' | 'reel' | 'carousel';

export type FormatDistribution = Record<PackageFormat, number>;

/** Map FD slot_role → weekly package format bucket. */
export function slotRoleToPackageFormat(role: string): PackageFormat {
  const r = role.toLowerCase();
  if (r.includes('reel')) return 'reel';
  if (r === 'organic_carousel') return 'carousel';
  if (r.includes('story')) return 'story';
  if (r.includes('post') || r.includes('ad')) return 'post';
  return 'post';
}

/** Authoritative plan counts — derived from production_assignments, not LLM format_distribution. */
export function deriveFormatDistributionFromAssignments(
  assignments: Array<{ slot_role?: string }> | null | undefined,
): FormatDistribution {
  const dist: FormatDistribution = { post: 0, story: 0, reel: 0, carousel: 0 };
  if (!assignments?.length) return dist;
  for (const a of assignments) {
    const role = String(a.slot_role ?? '').trim();
    if (!role) continue;
    dist[slotRoleToPackageFormat(role)] += 1;
  }
  return dist;
}

function distributionsMatch(a: FormatDistribution, b: Partial<FormatDistribution>): boolean {
  return (['post', 'story', 'reel', 'carousel'] as const).every(
    (k) => (a[k] ?? 0) === (b[k] ?? 0),
  );
}

/** Drop cohesion notes that contradict a full weekly slot plan. */
export function filterCohesionNotesForAssignments(
  notes: string[],
  planned: FormatDistribution,
): string[] {
  const hasPosts = planned.post > 0;
  const hasReels = planned.reel > 0;
  const hasCarousels = planned.carousel > 0;
  const hasFullVariety = hasPosts && hasReels && hasCarousels;

  return notes.filter((note) => {
    const lower = note.toLowerCase();
    if (
      /lack of posts|no posts|missing posts|without posts|0 post/i.test(lower)
      && hasPosts
    ) {
      return false;
    }
    if (
      /lack of reels|no reels|missing reels|without reels|0 reel|critically lacks.*reel/i.test(lower)
      && hasReels
    ) {
      return false;
    }
    if (
      /lack of carousel|no carousel|missing carousel|without carousel|0 carousel/i.test(lower)
      && hasCarousels
    ) {
      return false;
    }
    if (
      /lack of posts.*reels|posts, reels, and carousels|posts.*reels.*carousels weakens|critically lacks posts/i.test(lower)
      && hasFullVariety
    ) {
      return false;
    }
    if (/reduces format variety|weakens format variety/i.test(lower) && hasFullVariety) {
      return false;
    }
    return true;
  });
}

/** When LLM verdict contradicts assignments, prefer assignment-based summary. */
export function reconcileArtDirectorVerdict(
  verdict: string,
  planned: FormatDistribution,
  assignmentCount: number,
): string {
  const v = verdict.trim();
  if (!v) return v;
  const lacksFormats = /critically lacks|lack of posts|reduces format variety|weakens format variety/i.test(v);
  const plannedTotal = planned.post + planned.story + planned.reel + planned.carousel;
  if (
    lacksFormats
    && assignmentCount >= MISSION_WEEKLY_PACKAGE_COUNTS.total
    && planned.post > 0
    && planned.reel > 0
    && planned.carousel > 0
  ) {
    return [
      `Haftalık paket ${assignmentCount} slot ile planlandı`,
      `(${planned.story} story · ${planned.post} post · ${planned.carousel} carousel · ${planned.reel} reel).`,
      'Üretim durumu Feed sekmesinde takip edilir.',
    ].join(' ');
  }
  if (lacksFormats && plannedTotal > 0 && !distributionsMatch(planned, {})) {
    return v;
  }
  return v;
}

export function resolveFeedDirectorFormatDistribution(
  report: FeedArtDirectorReport | Record<string, unknown> | null | undefined,
): FormatDistribution {
  const assignments = (report?.production_assignments ?? []) as Array<{ slot_role?: string }>;
  const fromAssignments = deriveFormatDistributionFromAssignments(assignments);
  if (assignments.length > 0) return fromAssignments;
  const raw = (report?.format_distribution ?? {}) as Record<string, number>;
  return {
    post: Number(raw.post ?? 0),
    story: Number(raw.story ?? 0),
    reel: Number(raw.reel ?? 0),
    carousel: Number(raw.carousel ?? 0),
  };
}

export function countPublishScheduleEntries(
  schedule: Record<string, unknown[]> | null | undefined,
): number {
  if (!schedule || typeof schedule !== 'object') return 0;
  let n = 0;
  for (const items of Object.values(schedule)) {
    if (Array.isArray(items)) n += items.length;
  }
  return n;
}

export interface FeedArtDirectorReport {
  feed_score?: number;
  theme_coherence?: number;
  recommended_order?: number[];
  flagged_ideas?: Array<{ index: number; reason?: string; severity?: 'warning' | 'error' }>;
  art_director_verdict?: string;
  /** Idea index that gets the hero Runway reel slot (budget-controlled) */
  hero_reel_index?: number;
  /** Suggested layout families for visual variety this week */
  recommended_layout_families?: string[];
  format_distribution?: Record<string, number>;
  /** APO-1 — per-idea production slot (Feed Art Director) */
  production_assignments?: ProductionAssignment[];
  manifest_coverage_pct?: number;
  /** APO-2 — suggested publish schedule keyed by day */
  publish_schedule?: Record<string, unknown[]>;
  /** APO-3 — son auto-produce PIS özeti (server pipeline) */
  production_pis?: {
    minScore?: number;
    avg?: number | null;
    checked?: number;
    skipped?: number;
    warnings?: Array<{
      idea_index: number;
      headline?: string;
      score: number;
      missing: string[];
      pipeline?: string;
    }>;
  };
}

export interface WeeklyPublishSelection {
  primary: OutputArtifact[];
  backup: OutputArtifact[];
  primaryIds: Set<string>;
  slots: {
    stories: OutputArtifact[];
    posts: OutputArtifact[];
    reels: OutputArtifact[];
    carousels: OutputArtifact[];
  };
  feedDirectorScore: number | null;
  selectionSource: 'feed_art_director' | 'heuristic';
}

/** Recommended weekly hero set (Mission Hub card) — Feed shows all publishable outputs. */
const TARGET = {
  story: MISSION_WEEKLY_PACKAGE_COUNTS.story,
  post: MISSION_WEEKLY_PACKAGE_COUNTS.post,
  reel: MISSION_WEEKLY_PACKAGE_COUNTS.reel,
  carousel: MISSION_WEEKLY_PACKAGE_COUNTS.carousel,
} as const;

function isHttpMediaUrl(url: string): boolean {
  return isPublishableMediaUrl(url);
}

/** Mission Hub auto-produce / Remotion bundle (source may become "remotion" after attach-video). */
function isMissionProductionArtifact(
  meta: Record<string, unknown>,
  content: Record<string, unknown>,
): boolean {
  const missionId = String(
    meta.mission_id ?? meta.missionId ?? content.mission_id ?? content.missionId ?? '',
  ).trim();
  if (!missionId) return false;
  return Boolean(
    meta.auto_produced === true
    || meta.production_bundle
    || meta.production_role
    || meta.source === 'auto-produce'
    || meta.source === 'remotion'
    || content.source === 'auto-produce'
    || content.source === 'remotion'
    || content.production_bundle,
  );
}

/** Remotion / designed slots — gallery still alone is not a finished deliverable. */
export function isPremiumMotionOrDesignedPipeline(
  pipeline: string,
  role: string,
): boolean {
  const p = pipeline.trim().toLowerCase();
  const r = role.trim().toLowerCase();
  if (p === 'remotion_story' || p === 'remotion_poster' || p === 'fal_design') return true;
  if (r === 'designed_post' || r === 'designed_typography' || r === 'fal_designed_post') return true;
  if (r.includes('story_motion') || r.includes('campaign_story')) return true;
  return false;
}

/** Remotion MP4 story — may show poster in Feed while render queue runs or after failure. */
export function isRemotionStoryPipeline(pipeline: string, role: string): boolean {
  const p = pipeline.trim().toLowerCase();
  const r = role.trim().toLowerCase();
  return p === 'remotion_story' || r.includes('story_motion') || r.includes('campaign_story');
}

function storyPreviewStillReady(
  artifact: OutputArtifact,
  posterUrl: string | null,
  contentUrl: string,
  isVideoUrl: boolean,
): boolean {
  if (posterUrl && isHttpMediaUrl(posterUrl)) return true;
  return Boolean(contentUrl && !isVideoUrl && isHttpMediaUrl(contentUrl));
}

function readArtifactPipelineRole(artifact: OutputArtifact): {
  pipeline: string;
  role: string;
  meta: Record<string, unknown>;
  content: Record<string, unknown>;
} {
  let content: Record<string, unknown> = {};
  let meta: Record<string, unknown> = {};
  try {
    content = parseArtifactContent(artifact.content) as Record<string, unknown>;
    meta = parseArtifactMetadata(artifact.metadata);
  } catch {
    /* empty */
  }
  return {
    pipeline: String(meta.pipeline ?? content.pipeline ?? '').trim(),
    role: String(meta.production_role ?? content.production_role ?? '').trim(),
    meta,
    content,
  };
}

/**
 * Feed / Outputs gate — show produced content when media + pipeline are ready.
 * Includes organic gallery, designed posters, Remotion stories, Runway reels, carousels.
 */
export function isArtifactFeedPublishable(artifact: OutputArtifact): boolean {
  const { pipeline, role, meta, content } = readArtifactPipelineRole(artifact);
  try {
    const src = String(content.source || meta.source || '');
    if (src === 'announcement_calendar') return false;
  } catch {
    return false;
  }

  if (meta.publish_blocked === true) return false;

  const contentUrl = String(artifact.contentUrl ?? '').trim();
  const videoUrl = resolveStoryVideoUrl(artifact);
  const posterUrl = resolvePosterUrl(artifact);
  const brandedUrl = resolveBrandedPostUrl(artifact);
  const carouselUrls = resolveCarouselUrls(content, meta).filter(isHttpMediaUrl);
  const fmt = detectArtifactPackageFormat(artifact);
  const bundleStatus = getProductionBundleStatus(artifact);
  const isVideoUrl = /\.(mp4|mov|webm)(\?|$)/i.test(contentUrl);
  const premiumPipeline = isPremiumMotionOrDesignedPipeline(pipeline, role);

  const missionProduction = isMissionProductionArtifact(meta, content);
  const autoProduced = Boolean(
    meta.auto_produced === true
    || meta.source === 'auto-produce'
    || content.source === 'auto-produce'
    || missionProduction,
  );
  const previewUrls = [
    contentUrl,
    posterUrl,
    brandedUrl,
    videoUrl,
    content.imageUrl,
    meta.imageUrl,
    meta.posterUrl,
    meta.poster_url,
    content.posterUrl,
    meta.reference_photo_url,
    content.reference_photo_url,
    meta.feed_preview_url,
    content.feed_preview_url,
  ];
  const hasPreviewStill = previewUrls.some(
    (u) => typeof u === 'string' && isHttpMediaUrl(String(u).trim()),
  );

  if (autoProduced && hasPreviewStill) {
    return true;
  }

  if (bundleStatus === 'rendering' || isBundleRendering(artifact)) {
    if (isRemotionStoryPipeline(pipeline, role)) {
      return storyPreviewStillReady(artifact, posterUrl, contentUrl, isVideoUrl);
    }
    if (premiumPipeline) return hasPreviewStill;
    return hasPreviewStill;
  }

  if (isBundleFailed(artifact)) {
    if (isRemotionStoryPipeline(pipeline, role)) {
      return storyPreviewStillReady(artifact, posterUrl, contentUrl, isVideoUrl);
    }
    if (premiumPipeline) return storyPreviewStillReady(artifact, posterUrl, contentUrl, isVideoUrl);
    return storyPreviewStillReady(artifact, posterUrl, contentUrl, isVideoUrl);
  }

  if (fmt === 'carousel') {
    if (carouselUrls.length >= 2) return true;
    return Boolean(contentUrl && isHttpMediaUrl(contentUrl));
  }

  if (fmt === 'reel') {
    if (videoUrl && isHttpMediaUrl(videoUrl)) return true;
    if (isVideoUrl && isHttpMediaUrl(contentUrl)) return true;
    if (isBundleRendering(artifact) && hasPreviewStill) return true;
    return false;
  }

  if (fmt === 'story') {
    const storyPipeline = String(meta.pipeline ?? content.pipeline ?? '').trim();
    if (videoUrl && isHttpMediaUrl(videoUrl)) return true;
    if (
      missionProduction
      || isProductionBundle(artifact)
      || storyPipeline === 'remotion_story'
      || isProductionBundleStory(artifact)
    ) {
      if (bundleStatus === 'ready') return Boolean(videoUrl && isHttpMediaUrl(videoUrl));
      return storyPreviewStillReady(artifact, posterUrl, contentUrl, isVideoUrl);
    }
    if (posterUrl && isHttpMediaUrl(posterUrl)) return true;
    if (contentUrl && isHttpMediaUrl(contentUrl) && !isVideoUrl) return true;
    return false;
  }

  if (fmt === 'post') {
    if (brandedUrl && isHttpMediaUrl(brandedUrl)) return true;
    if (contentUrl && isHttpMediaUrl(contentUrl) && !isVideoUrl) return true;
    const imageUrl = String(content.imageUrl || meta.imageUrl || '').trim();
    return isHttpMediaUrl(imageUrl);
  }

  return Boolean(
    (contentUrl && isHttpMediaUrl(contentUrl))
    || (videoUrl && isHttpMediaUrl(videoUrl)),
  );
}

/**
 * Feed UI — final deliverable ready (not mid-render placeholder).
 * Gallery-only posts pass; Remotion stories need MP4; designed posts need branded PNG.
 */
export function isArtifactFeedDisplayReady(artifact: OutputArtifact): boolean {
  if (!isArtifactFeedPublishable(artifact)) return false;

  const { pipeline, role, meta, content } = readArtifactPipelineRole(artifact);
  const bundleStatus = getProductionBundleStatus(artifact);
  const rendering = isBundleRendering(artifact) || bundleStatus === 'rendering';
  if (rendering) {
    const poster = resolvePosterUrl(artifact);
    const contentUrl = String(artifact.contentUrl ?? '').trim();
    const isVideoUrl = /\.(mp4|mov|webm)(\?|$)/i.test(contentUrl);
    if (isRemotionStoryPipeline(pipeline, role)) {
      return storyPreviewStillReady(artifact, poster, contentUrl, isVideoUrl);
    }
    if (isPremiumMotionOrDesignedPipeline(pipeline, role)) return false;
    return storyPreviewStillReady(artifact, poster, contentUrl, isVideoUrl);
  }
  const fmt = detectArtifactPackageFormat(artifact);
  const status = getProductionBundleStatus(artifact);

  if (fmt === 'reel') {
    const videoUrl = resolveStoryVideoUrl(artifact);
    const contentUrl = String(artifact.contentUrl ?? '').trim();
    return Boolean(
      (videoUrl && isHttpMediaUrl(videoUrl))
      || (/\.(mp4|mov|webm)(\?|$)/i.test(contentUrl) && isHttpMediaUrl(contentUrl)),
    );
  }

  if (
    pipeline === 'remotion_story'
    || role.includes('story_motion')
    || role.includes('campaign_story')
  ) {
    const videoUrl = resolveStoryVideoUrl(artifact);
    if (videoUrl && isHttpMediaUrl(videoUrl)) return true;
    if (status === 'failed' || status === 'rendering') {
      const poster = resolvePosterUrl(artifact);
      const contentUrl = String(artifact.contentUrl ?? '').trim();
      const isVideoUrl = /\.(mp4|mov|webm)(\?|$)/i.test(contentUrl);
      return storyPreviewStillReady(artifact, poster, contentUrl, isVideoUrl);
    }
    return false;
  }

  if (pipeline === 'remotion_poster' || pipeline === 'fal_design' || role === 'designed_post' || role === 'designed_typography' || role === 'fal_designed_post') {
    if (status === 'failed') return false;
    if (meta.grafiker_pass === false) return false;
    if (status !== 'ready') {
      const poster = resolvePosterUrl(artifact);
      const contentUrl = String(artifact.contentUrl ?? '').trim();
      const isVideoUrl = /\.(mp4|mov|webm)(\?|$)/i.test(contentUrl);
      return storyPreviewStillReady(artifact, poster, contentUrl, isVideoUrl);
    }
    const branded = resolveBrandedPostUrl(artifact);
    const poster = resolvePosterUrl(artifact);
    if (branded && isHttpMediaUrl(branded) && (!poster || branded !== poster)) return true;
    const contentUrl = String(artifact.contentUrl ?? '').trim();
    const isVideoUrl = /\.(mp4|mov|webm)(\?|$)/i.test(contentUrl);
    return storyPreviewStillReady(artifact, poster, contentUrl, isVideoUrl);
  }

  return true;
}

/** Feed list — publishable and final media ready (no mid-render placeholders). */
export function isArtifactFeedReady(artifact: OutputArtifact): boolean {
  return isArtifactFeedPublishable(artifact) && isArtifactFeedDisplayReady(artifact);
}

/** All deduped, feed-ready artifacts (no weekly cap, no backup hide). */
export function filterFeedPublishableArtifacts(artifacts: OutputArtifact[]): OutputArtifact[] {
  return dedupeProductionBundles(artifacts)
    .filter(isArtifactFeedReady)
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

/** Feed UI — show every distinct production run with preview media (includes in-progress renders). */
export function filterFeedDisplayArtifacts(artifacts: OutputArtifact[]): OutputArtifact[] {
  return dedupeFeedDisplayArtifacts(artifacts)
    .filter(isArtifactFeedPublishable)
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

/**
 * Mission-scoped Feed — all publish-ready outputs for this mission (includes reproduce runs).
 */
export function filterMissionFeedArtifacts(
  artifacts: OutputArtifact[],
  missionId: string,
): OutputArtifact[] {
  return filterFeedDisplayArtifacts(
    artifacts.filter((a) => parseArtifactMissionId(a) === missionId),
  );
}

function normalizeHeadline(raw: unknown): string {
  return String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function detectIdeaPackageFormat(idea: Record<string, unknown>): PackageFormat {
  const calendarFmt = String(
    idea.publish_schedule_format
    ?? (idea.calendar_enriched === true ? idea.format : '')
    ?? '',
  ).toLowerCase();
  if (calendarFmt.includes('story') || calendarFmt.includes('canvas')) return 'story';
  if (calendarFmt.includes('reel')) return 'reel';
  if (calendarFmt.includes('carousel')) return 'carousel';
  if (calendarFmt.includes('post')) return 'post';

  const ct = String(
    idea.content_type || idea.content_kind || idea.format || 'post',
  ).toLowerCase();
  if (ct.includes('story') || ct.includes('canvas') || ct.includes('event')) return 'story';
  if (ct.includes('reel')) return 'reel';
  if (ct.includes('carousel')) return 'carousel';
  return 'post';
}

export function detectArtifactPackageFormat(artifact: OutputArtifact): PackageFormat {
  const content = parseArtifactContent(artifact.content);
  const meta = parseArtifactMetadata(artifact.metadata);
  const role = String(meta.production_role ?? content.production_role ?? '').trim().toLowerCase();
  if (role.includes('carousel')) return 'carousel';
  if (role.includes('reel') || role === 'fal_reel_motion' || role === 'fal_only_reel' || role === 'organic_reel') {
    return 'reel';
  }
  if (
    role.includes('story')
    || role === 'campaign_story_motion'
    || role === 'organic_story_still'
    || role === 'fal_story_motion'
    || role === 'fal_only_story'
  ) {
    return 'story';
  }
  if (
    role === 'organic_post'
    || role === 'designed_post'
    || role === 'designed_typography'
    || role === 'fal_designed_post'
    || role === 'fal_only_post'
  ) {
    return 'post';
  }
  const kind = String(content.kind || meta.kind || '').toLowerCase();
  const ct = String((artifact as { contentType?: string }).contentType || content.contentType || meta.contentType || '').toLowerCase();
  if (kind.includes('story') || kind.includes('canvas') || ct.includes('story') || ct.includes('canvas')) {
    return 'story';
  }
  if (kind.includes('reel') || ct.includes('reel')) return 'reel';
  if (kind.includes('carousel') || ct.includes('carousel')) return 'carousel';
  if (kind.includes('event') || kind.includes('announcement')) return 'story';
  return 'post';
}

export function parseFeedArtDirectorReport(raw: string | null | undefined): FeedArtDirectorReport | null {
  if (!raw?.trim()) return null;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned) as FeedArtDirectorReport;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function extractFeedArtDirectorReport(
  nodes: MissionNodeProgress[],
): FeedArtDirectorReport | null {
  const node = nodes.find((n) => n.task_type === 'feed_cohesion_review' && nodeHasOutput(n));
  const parsed = nodeOutputObject(node);
  return parsed as FeedArtDirectorReport | null;
}

/** Feed Art Director publish_schedule entry for one idea index. */
export function resolvePublishSlotForIdea(
  report: FeedArtDirectorReport | null | undefined,
  ideaIndex: number,
): { day: string; suggested_time: string; format: string } | null {
  const schedule = report?.publish_schedule;
  if (!schedule || typeof schedule !== 'object') return null;
  for (const [day, items] of Object.entries(schedule)) {
    if (!Array.isArray(items)) continue;
    for (const raw of items) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const idx = item.index;
      if (typeof idx === 'number' && idx === ideaIndex) {
        return {
          day,
          suggested_time: String(item.suggested_time ?? item.time ?? '').trim(),
          format: String(item.format ?? '').trim(),
        };
      }
    }
  }
  return null;
}

function findArtifactForAssignment(
  missionId: string,
  assignment: ProductionAssignment,
  missionArtifacts: OutputArtifact[],
  usedIds: Set<string>,
): OutputArtifact | undefined {
  const ideaIdx = assignment.idea_index;
  const role = assignment.slot_role;

  const matchesRole = (artifact: OutputArtifact): boolean => {
    if (usedIds.has(artifact.id)) return false;
    const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
    const artifactRole = String(meta.production_role ?? '');
    if (artifactRole !== role) return false;
    if (typeof ideaIdx !== 'number') return true;
    const content = parseArtifactContent(artifact.content) as Record<string, unknown>;
    const metaIdx = meta.idea_index ?? content.idea_index;
    return typeof metaIdx !== 'number' || metaIdx === ideaIdx;
  };

  // Prefer exact manifest slot (production_role ± idea_index) — one ideation row fans out
  // to many slots; idea_index alone would return the wrong pipeline artifact.
  for (const artifact of missionArtifacts) {
    if (!matchesRole(artifact)) continue;
    return artifact;
  }

  for (const artifact of missionArtifacts) {
    if (usedIds.has(artifact.id)) continue;
    const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
    const artifactRole = String(meta.production_role ?? '');
    if (artifactRole === role) return artifact;
    if (role === 'campaign_story_motion' && isProductionBundleStory(artifact)) return artifact;
    if (role === 'organic_post' && artifactRole === 'organic_carousel') return artifact;
  }

  const byIndex = missionArtifacts.filter((a) => {
    if (usedIds.has(a.id)) return false;
    const meta = (a.metadata ?? {}) as Record<string, unknown>;
    const content = parseArtifactContent(a.content) as Record<string, unknown>;
    const metaIdx = meta.idea_index ?? content.idea_index;
    return typeof metaIdx === 'number' && typeof ideaIdx === 'number' && metaIdx === ideaIdx;
  });
  if (byIndex.length) {
    byIndex.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return byIndex[0];
  }

  return undefined;
}

/**
 * Mission Feed package: one artifact per Feed Art Director production_assignment.
 * Falls back to format pools when FD did not assign.
 */
export function selectWeeklyPublishPackageByAssignments(
  artifacts: OutputArtifact[],
  missionId: string,
  options?: {
    feedDirectorReport?: FeedArtDirectorReport | null;
    ideas?: Record<string, unknown>[];
  },
): WeeklyPublishSelection {
  const missionArtifacts = dedupeProductionBundles(
    artifacts.filter((a) => parseArtifactMissionId(a) === missionId),
  );
  const report = options?.feedDirectorReport ?? null;
  const assignments = report?.production_assignments ?? [];
  if (!assignments.length) {
    return selectWeeklyPublishPackage(artifacts, missionId, options);
  }

  const usedIds = new Set<string>();
  const primary: OutputArtifact[] = [];
  for (const assignment of assignments) {
    const art = findArtifactForAssignment(missionId, assignment, missionArtifacts, usedIds);
    if (art) {
      usedIds.add(art.id);
      primary.push(art);
    }
  }

  if (primary.length === 0) {
    return selectWeeklyPublishPackage(artifacts, missionId, options);
  }

  const backup = missionArtifacts.filter((a) => !usedIds.has(a.id));
  const slots = { stories: [] as OutputArtifact[], posts: [] as OutputArtifact[], reels: [] as OutputArtifact[], carousels: [] as OutputArtifact[] };
  for (const a of primary) {
    const fmt = detectArtifactPackageFormat(a);
    if (fmt === 'story') slots.stories.push(a);
    else if (fmt === 'reel') slots.reels.push(a);
    else if (fmt === 'carousel') slots.carousels.push(a);
    else slots.posts.push(a);
  }

  return {
    primary,
    backup,
    primaryIds: new Set(primary.map((a) => a.id)),
    slots,
    feedDirectorScore: typeof report?.feed_score === 'number' ? report.feed_score : null,
    selectionSource: 'feed_art_director',
  };
}

export function extractContentIdeationIdeas(
  nodes: MissionNodeProgress[],
): Record<string, unknown>[] {
  const merged = buildMissionProductionIdeas({ nodes });
  if (merged.length > 0) return merged;
  const node = nodes.find(
    (n) => n.task_type === 'content_ideation' && n.status === 'completed' && nodeHasOutput(n),
  );
  return nodeOutputArray(node);
}

function scoreIdeaIndex(index: number, report: FeedArtDirectorReport | null | undefined): number {
  let score = 50;
  const order = report?.recommended_order;
  if (order?.length) {
    const rank = order.indexOf(index);
    if (rank >= 0) score += (order.length - rank) * 12;
    else score -= 8;
  }
  const flag = report?.flagged_ideas?.find((f) => f.index === index);
  if (flag?.severity === 'error') score -= 1000;
  if (flag?.severity === 'warning') score -= 20;
  return score;
}

function resolveArtifactForIdea(
  ideaIndex: number,
  idea: Record<string, unknown>,
  artifacts: OutputArtifact[],
): OutputArtifact | undefined {
  const headline = normalizeHeadline(
    idea.headline || idea.concept_title || idea.title,
  );
  for (const artifact of artifacts) {
    const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
    const content = parseArtifactContent(artifact.content);
    const idx = meta.idea_index ?? content.idea_index;
    if (typeof idx === 'number' && idx === ideaIndex) return artifact;
    const artHeadline = normalizeHeadline(meta.headline || content.headline || artifact.title);
    if (headline && artHeadline === headline) return artifact;
  }
  return undefined;
}

function artifactQualityBonus(artifact: OutputArtifact): number {
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  let bonus = 0;
  if (typeof meta.grafiker_score === 'number') bonus += meta.grafiker_score * 4;
  if (meta.grafiker_pass === true) bonus += 5;
  if (isProductionBundleStory(artifact) && resolveStoryVideoUrl(artifact)) bonus += 8;
  if (String(meta.publish_package || '') === 'primary') bonus += 3;
  return bonus;
}

export function preselectPrimaryIdeaIndices(
  ideas: Record<string, unknown>[],
  report?: FeedArtDirectorReport | null,
): Set<number> {
  type Candidate = { index: number; format: PackageFormat; score: number };
  const candidates: Candidate[] = ideas.map((idea, i) => ({
    index: i,
    format: detectIdeaPackageFormat(idea),
    score: scoreIdeaIndex(i, report ?? null),
  }));
  const byScore = (a: Candidate, b: Candidate) => b.score - a.score || a.index - b.index;
  const storyPool = candidates.filter((c) => c.format === 'story').sort(byScore);
  const postPool = candidates
    .filter((c) => c.format === 'post' || c.format === 'carousel')
    .sort(byScore);
  const reelPool = candidates.filter((c) => c.format === 'reel').sort(byScore);
  const carouselPool = candidates.filter((c) => c.format === 'carousel').sort(byScore);
  const indices = [
    ...storyPool.slice(0, TARGET.story).map((c) => c.index),
    ...postPool.slice(0, TARGET.post).map((c) => c.index),
    ...reelPool.slice(0, TARGET.reel).map((c) => c.index),
    ...carouselPool.slice(0, TARGET.carousel).map((c) => c.index),
  ];
  return new Set(indices);
}

/**
 * Select weekly publish package: 3 story + 1 post + (optional) 1 reel.
 * Uses Feed Art Director recommended_order when available; falls back to format heuristics.
 */
export function selectWeeklyPublishPackage(
  artifacts: OutputArtifact[],
  missionId: string,
  options?: {
    feedDirectorReport?: FeedArtDirectorReport | null;
    ideas?: Record<string, unknown>[];
  },
): WeeklyPublishSelection {
  const missionArtifacts = dedupeProductionBundles(
    artifacts.filter((a) => parseArtifactMissionId(a) === missionId),
  );

  const report = options?.feedDirectorReport ?? null;
  const ideas = options?.ideas ?? [];
  const selectionSource = report?.recommended_order?.length ? 'feed_art_director' : 'heuristic';

  type Candidate = {
    index: number;
    format: PackageFormat;
    artifact: OutputArtifact;
    score: number;
  };

  const candidates: Candidate[] = [];

  if (ideas.length > 0) {
    for (let i = 0; i < ideas.length; i++) {
      const idea = ideas[i]!;
      const artifact = resolveArtifactForIdea(i, idea, missionArtifacts);
      if (!artifact) continue;
      candidates.push({
        index: i,
        format: detectIdeaPackageFormat(idea),
        artifact,
        score: scoreIdeaIndex(i, report) + artifactQualityBonus(artifact),
      });
    }
  }

  if (candidates.length === 0) {
    for (let i = 0; i < missionArtifacts.length; i++) {
      const artifact = missionArtifacts[i]!;
      candidates.push({
        index: i,
        format: detectArtifactPackageFormat(artifact),
        artifact,
        score: 50 + artifactQualityBonus(artifact),
      });
    }
  }

  const byScore = (a: Candidate, b: Candidate) => b.score - a.score || a.index - b.index;

  const storyPool = candidates.filter((c) => c.format === 'story').sort(byScore);
  const postPool = candidates
    .filter((c) => c.format === 'post' || c.format === 'carousel')
    .sort(byScore);
  const reelPool = candidates.filter((c) => c.format === 'reel').sort(byScore);
  const carouselPool = candidates.filter((c) => c.format === 'carousel').sort(byScore);

  const slotStories = storyPool.slice(0, TARGET.story).map((c) => c.artifact);
  const slotPosts = postPool.slice(0, TARGET.post).map((c) => c.artifact);
  const slotReels = reelPool.slice(0, TARGET.reel).map((c) => c.artifact);
  const slotCarousels = carouselPool.slice(0, TARGET.carousel).map((c) => c.artifact);

  const primary = [...slotStories, ...slotPosts, ...slotReels, ...slotCarousels];
  const primaryIds = new Set(primary.map((a) => a.id));
  const backup = missionArtifacts.filter((a) => !primaryIds.has(a.id));

  return {
    primary,
    backup,
    primaryIds,
    slots: { stories: slotStories, posts: slotPosts, reels: slotReels, carousels: slotCarousels },
    feedDirectorScore: typeof report?.feed_score === 'number' ? report.feed_score : null,
    selectionSource,
  };
}

export function buildWeeklySelectionFromMissionNodes(
  artifacts: OutputArtifact[],
  missionId: string,
  nodes: MissionNodeProgress[],
): WeeklyPublishSelection {
  const report = extractFeedArtDirectorReport(nodes);
  const ideas = extractContentIdeationIdeas(nodes);
  if (report?.production_assignments?.length) {
    return selectWeeklyPublishPackageByAssignments(artifacts, missionId, {
      feedDirectorReport: report,
      ideas,
    });
  }
  return selectWeeklyPublishPackage(artifacts, missionId, {
    feedDirectorReport: report,
    ideas,
  });
}

export function isPrimaryPublishArtifact(
  artifact: OutputArtifact,
  selection: WeeklyPublishSelection | null | undefined,
): boolean {
  if (!selection) return true;
  return selection.primaryIds.has(artifact.id);
}

/**
 * Mission-scoped Feed — one publish-ready artifact per manifest assignment (max ~7).
 * @deprecated Feed UI uses filterMissionFeedArtifacts to show all production runs.
 */
export function filterMissionPrimaryFeedArtifacts(
  artifacts: OutputArtifact[],
  missionId: string,
  nodes?: MissionNodeProgress[],
): OutputArtifact[] {
  const missionPublishable = filterFeedPublishableArtifacts(
    artifacts.filter((a) => parseArtifactMissionId(a) === missionId),
  );
  const selection = nodes?.length
    ? buildWeeklySelectionFromMissionNodes(missionPublishable, missionId, nodes)
    : selectWeeklyPublishPackage(missionPublishable, missionId);
  return selection.primary.filter(isArtifactFeedReady);
}

/** @deprecated Prefer filterMissionPrimaryFeedArtifacts when mission filter is active. */
export function filterFeedPrimaryArtifacts(
  artifacts: OutputArtifact[],
  _selectionsByMission?: Map<string, WeeklyPublishSelection>,
): OutputArtifact[] {
  return filterFeedPublishableArtifacts(artifacts);
}

export function formatWeeklyPackageTarget(): string {
  const parts: string[] = [];
  if (TARGET.story > 0) parts.push(`${TARGET.story} story`);
  if (TARGET.post > 0) parts.push(`${TARGET.post} post`);
  if (TARGET.carousel > 0) parts.push(`${TARGET.carousel} carousel`);
  if (TARGET.reel > 0) parts.push(`${TARGET.reel} reel`);
  return parts.join(' · ');
}

export function formatWeeklyPackageSummary(
  selection: WeeklyPublishSelection,
  opts?: { producedOverride?: number; targetOverride?: number },
): string {
  const parts: string[] = [];
  let motionStories = 0;
  let stillStories = 0;
  let posts = 0;
  let designed = 0;
  let carousels = 0;
  let reels = 0;

  for (const a of selection.primary) {
    const meta = (a.metadata ?? {}) as Record<string, unknown>;
    const role = String(meta.production_role ?? '');
    if (role === 'campaign_story_motion') motionStories += 1;
    else if (role === 'organic_story_still') stillStories += 1;
    else if (role === 'organic_post') posts += 1;
    else if (role === 'designed_post') designed += 1;
    else if (role === 'organic_carousel') carousels += 1;
    else if (role.includes('reel')) reels += 1;
    else {
      const fmt = detectArtifactPackageFormat(a);
      if (fmt === 'story') motionStories += 1;
      else if (fmt === 'reel') reels += 1;
      else if (fmt === 'carousel') carousels += 1;
      else posts += 1;
    }
  }

  const storyTotal = motionStories + stillStories;
  if (storyTotal > 0) parts.push(`${storyTotal} story`);
  if (posts > 0) parts.push(`${posts} post`);
  if (designed > 0) parts.push(`${designed} tasarım`);
  if (carousels > 0) parts.push(`${carousels} carousel`);
  if (reels > 0) parts.push(`${reels} reel`);

  if (parts.length === 0) {
    if (selection.slots.stories.length > 0) parts.push(`${selection.slots.stories.length} story`);
    if (selection.slots.posts.length > 0) parts.push(`${selection.slots.posts.length} post`);
    if (selection.slots.reels.length > 0) parts.push(`${selection.slots.reels.length} reel`);
    if (selection.slots.carousels.length > 0) parts.push(`${selection.slots.carousels.length} carousel`);
  }

  const produced = opts?.producedOverride ?? selection.primary.length;
  const target = opts?.targetOverride ?? MISSION_WEEKLY_PACKAGE_COUNTS.total;
  const summary = parts.join(' · ') || 'Paket seçiliyor…';
  if (produced > 0 && produced < target) {
    return `${summary} (${produced}/${target})`;
  }
  return summary || 'Paket seçiliyor…';
}
