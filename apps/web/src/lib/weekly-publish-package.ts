import { parseArtifactContent, resolveCarouselUrls } from '@/app/mobile/_components/artifact-utils';
import {
  dedupeProductionBundles,
  getProductionBundleStatus,
  isBundleFailed,
  isBundleRendering,
  isProductionBundleStory,
  parseArtifactMissionId,
  resolveBrandedPostUrl,
  resolvePosterUrl,
  resolveStoryVideoUrl,
} from '@/lib/production-bundle';
import { isPublishableMediaUrl } from '@/lib/media-url';
import type { ProductionAssignment } from '@/lib/mission-production-manifest';
import type { OutputArtifact } from '@/types';
import type { MissionNodeProgress } from '@/types';

export type PackageFormat = 'story' | 'post' | 'reel' | 'carousel';

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
/** Aligns with MISSION_WEEKLY_PACKAGE_COUNTS — 3 story, 2 post, 1 carousel, 1 reel */
const TARGET = { story: 3, post: 2, reel: 1, carousel: 1 } as const;

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

/**
 * Feed / Outputs gate — show produced content when media + pipeline are ready.
 * Includes organic gallery, designed posters, Remotion stories, Runway reels, carousels.
 */
export function isArtifactFeedPublishable(artifact: OutputArtifact): boolean {
  let content: Record<string, unknown> = {};
  let meta: Record<string, unknown> = {};
  try {
    content = parseArtifactContent(artifact.content) as Record<string, unknown>;
    meta = (artifact.metadata ?? {}) as Record<string, unknown>;
    const src = String(content.source || meta.source || '');
    if (src === 'announcement_calendar') return false;
  } catch {
    return false;
  }

  const contentUrl = String(artifact.contentUrl ?? '').trim();
  const videoUrl = resolveStoryVideoUrl(artifact);
  const posterUrl = resolvePosterUrl(artifact);
  const brandedUrl = resolveBrandedPostUrl(artifact);
  const carouselUrls = resolveCarouselUrls(content, meta).filter(isHttpMediaUrl);
  const fmt = detectArtifactPackageFormat(artifact);
  const bundleStatus = getProductionBundleStatus(artifact);
  const isVideoUrl = /\.(mp4|mov|webm)(\?|$)/i.test(contentUrl);

  const missionProduction = isMissionProductionArtifact(meta, content);
  const autoProduced = Boolean(
    meta.auto_produced === true
    || meta.source === 'auto-produce'
    || content.source === 'auto-produce'
    || missionProduction,
  );
  if (autoProduced) {
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
    ];
    if (previewUrls.some((u) => typeof u === 'string' && isHttpMediaUrl(String(u).trim()))) {
      return true;
    }
  }

  if (isBundleFailed(artifact)) {
    return Boolean(
      posterUrl && isHttpMediaUrl(posterUrl),
    ) || Boolean(contentUrl && !isVideoUrl && isHttpMediaUrl(contentUrl));
  }

  if (bundleStatus === 'rendering' || isBundleRendering(artifact)) {
    const preview = posterUrl || brandedUrl
      || (contentUrl && !isVideoUrl ? contentUrl : '');
    if (preview && isHttpMediaUrl(preview)) return true;
    if (missionProduction && (posterUrl || contentUrl)) return true;
    if (!preview) return false;
  }

  if (fmt === 'carousel') {
    if (carouselUrls.length >= 2) return true;
    return Boolean(contentUrl && isHttpMediaUrl(contentUrl));
  }

  if (fmt === 'reel') {
    return Boolean(videoUrl && isHttpMediaUrl(videoUrl))
      || Boolean(isVideoUrl && isHttpMediaUrl(contentUrl));
  }

  if (fmt === 'story') {
    if (videoUrl && isHttpMediaUrl(videoUrl)) return true;
    if (posterUrl && isHttpMediaUrl(posterUrl)) return true;
    if (contentUrl && isHttpMediaUrl(contentUrl) && !isVideoUrl) return true;
    const pipeline = String(meta.pipeline ?? content.pipeline ?? '').trim();
    if (pipeline === 'remotion_story' && isProductionBundleStory(artifact)) return true;
    if (isProductionBundleStory(artifact) && bundleStatus === 'ready') return true;
    if (isProductionBundle(artifact) && (posterUrl || contentUrl)) return true;
    if (autoProduced && (posterUrl || contentUrl || videoUrl)) return true;
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

/** All deduped, publishable artifacts for Feed (no weekly cap, no backup hide). */
export function filterFeedPublishableArtifacts(artifacts: OutputArtifact[]): OutputArtifact[] {
  return dedupeProductionBundles(artifacts)
    .filter(isArtifactFeedPublishable)
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

function normalizeHeadline(raw: unknown): string {
  return String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function detectIdeaPackageFormat(idea: Record<string, unknown>): PackageFormat {
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
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const kind = String(content.kind || meta.kind || '').toLowerCase();
  const ct = String((artifact as { contentType?: string }).contentType || content.contentType || '').toLowerCase();
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
  const node = nodes.find((n) => n.task_type === 'feed_cohesion_review' && n.output_summary);
  return node ? parseFeedArtDirectorReport(node.output_summary) : null;
}

function extractJsonArray(raw: string): Record<string, unknown>[] | null {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed as Record<string, unknown>[] : null;
  } catch {
    return null;
  }
}

export function extractContentIdeationIdeas(
  nodes: MissionNodeProgress[],
): Record<string, unknown>[] {
  const node = nodes.find(
    (n) => n.task_type === 'content_ideation' && n.status === 'completed' && n.output_summary,
  );
  if (!node?.output_summary) return [];
  return extractJsonArray(node.output_summary) ?? [];
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
  return selectWeeklyPublishPackage(artifacts, missionId, {
    feedDirectorReport: extractFeedArtDirectorReport(nodes),
    ideas: extractContentIdeationIdeas(nodes),
  });
}

export function isPrimaryPublishArtifact(
  artifact: OutputArtifact,
  selection: WeeklyPublishSelection | null | undefined,
): boolean {
  if (!selection) return true;
  return selection.primaryIds.has(artifact.id);
}

/** @deprecated Use filterFeedPublishableArtifacts — shows all quality-produced outputs. */
export function filterFeedPrimaryArtifacts(
  artifacts: OutputArtifact[],
  _selectionsByMission?: Map<string, WeeklyPublishSelection>,
): OutputArtifact[] {
  return filterFeedPublishableArtifacts(artifacts);
}

export function formatWeeklyPackageSummary(selection: WeeklyPublishSelection): string {
  const parts: string[] = [];
  if (selection.slots.stories.length > 0) parts.push(`${selection.slots.stories.length} story`);
  if (selection.slots.posts.length > 0) parts.push(`${selection.slots.posts.length} post`);
  if (selection.slots.reels.length > 0) parts.push(`${selection.slots.reels.length} reel`);
  if (selection.slots.carousels.length > 0) parts.push(`${selection.slots.carousels.length} carousel`);
  return parts.join(' · ') || 'Paket seçiliyor…';
}
