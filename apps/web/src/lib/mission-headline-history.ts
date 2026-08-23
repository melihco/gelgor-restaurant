/**
 * Cross-mission headline history — 14-day dedupe for burned promo hooks
 * (e.g. "ücretsiz deneme" overuse on SaaS tenants like Kaçta).
 */

import {
  buildThemeClusterCounts,
  detectHeadlineThemeClusters,
  isThemeClusterBurned,
} from '@/lib/headline-theme-clusters';
import {
  rotationHeadlineForAvoidedClusters,
  type BrandDynamicsAngle,
} from '@/lib/brand-dynamics';
import { resolveIdeationHeadline } from '@/lib/production-idea-parse';
import { isInternalStrategyBriefing } from '@/lib/fal-caption-headline';
import { isLabelStyleHeadline } from '@/lib/production-headline-quality';
import { strategistHeadlineKey } from '@/lib/production-pipeline-router';

/** Free-trial / demo hook — max once per batch; block if produced in last 14 days. */
export const FREE_TRIAL_HOOK_RE =
  /ücretsiz\s*deneme|free\s*trial|deneme\s*fırsat|deneme\s*firsat/i;

const ROTATION_USE_CASES = [
  'social_proof',
  'educational_post',
  'behind_the_scenes',
  'product_highlight',
  'campaign_offer',
] as const;

const ROTATION_HEADLINES_TR: Record<string, string> = {
  social_proof: 'Müşteri başarı hikayesi',
  educational_post: 'Panel ipucu',
  behind_the_scenes: 'Perde arkası',
  product_highlight: 'Özellik vitrini',
  campaign_offer: 'Kampanya duyurusu',
};

/**
 * The agent's marketing headline is worth keeping through a theme rotation when
 * it can actually ship on canvas — i.e. it is not itself a planning label or an
 * internal briefing line.
 */
function hasPublishableIdeationHeadline(idea: Record<string, unknown>): boolean {
  const marketing = String(idea.headline ?? idea.hook ?? '').trim();
  if (marketing.length < 8) return false;
  return !isLabelStyleHeadline(marketing) && !isInternalStrategyBriefing(marketing);
}

export interface RecentHeadlineHistory {
  /** Normalized headline keys from recent artifacts (14 days). */
  recentKeys: Set<string>;
  /** True when ücretsiz deneme / free trial appeared in the window. */
  freeTrialBurned: boolean;
  /** Semantic theme cluster use counts (dj, seafood, full moon, …). */
  themeClusterCounts: Map<string, number>;
  /** Cluster ids at or above burn threshold in the window. */
  burnedThemeClusters: Set<string>;
  days: number;
}

function parseJsonRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function isRejectedReviewStatus(status: unknown): boolean {
  const s = String(status ?? '').toLowerCase();
  return s === '2' || s === 'rejected' || s === '3' || s.includes('revision');
}

function artifactCreatedAt(artifact: Record<string, unknown>): Date | null {
  const raw =
    artifact.createdAt
    ?? artifact.CreatedAt
    ?? artifact.created_at
    ?? artifact.Created_At;
  if (!raw) return null;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function extractHeadlineFromArtifactRecord(
  artifact: Record<string, unknown>,
): string {
  if (isRejectedReviewStatus(artifact.reviewStatus ?? artifact.ReviewStatus)) {
    return '';
  }
  const meta = parseJsonRecord(artifact.metadata ?? artifact.Metadata);
  const content = parseJsonRecord(artifact.content ?? artifact.Content);
  const headline = String(
    meta.headline
    ?? content.headline
    ?? meta.ideation_headline
    ?? content.ideation_headline
    ?? artifact.title
    ?? artifact.Title
    ?? '',
  ).trim();
  return headline;
}

export function containsFreeTrialHook(text: string): boolean {
  return FREE_TRIAL_HOOK_RE.test(text);
}

export function buildRecentHeadlineHistory(
  artifacts: Record<string, unknown>[],
  opts?: { days?: number; excludeMissionId?: string },
): RecentHeadlineHistory {
  const days = opts?.days ?? 14;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const recentKeys = new Set<string>();
  const headlineTexts: string[] = [];
  let freeTrialBurned = false;

  for (const artifact of artifacts) {
    if (opts?.excludeMissionId) {
      const meta = parseJsonRecord(artifact.metadata ?? artifact.Metadata);
      const content = parseJsonRecord(artifact.content ?? artifact.Content);
      const mid = String(
        meta.missionId ?? meta.mission_id ?? content.missionId ?? content.mission_id ?? '',
      );
      if (mid && mid === opts.excludeMissionId) continue;
    }

    const created = artifactCreatedAt(artifact);
    if (created && created.getTime() < cutoff) continue;

    const headline = extractHeadlineFromArtifactRecord(artifact);
    if (!headline) continue;

    const key = strategistHeadlineKey({ headline });
    if (key) recentKeys.add(key);
    if (containsFreeTrialHook(headline)) freeTrialBurned = true;
    headlineTexts.push(headline);
    const caption = String(
      parseJsonRecord(artifact.content ?? artifact.Content).caption
      ?? parseJsonRecord(artifact.metadata ?? artifact.Metadata).caption
      ?? '',
    ).trim();
    if (caption) headlineTexts.push(caption);
  }

  const themeClusterCounts = buildThemeClusterCounts(headlineTexts);
  const burnedThemeClusters = new Set<string>();
  for (const [clusterId, count] of themeClusterCounts) {
    if (isThemeClusterBurned(clusterId, themeClusterCounts)) {
      burnedThemeClusters.add(clusterId);
    }
  }

  return { recentKeys, freeTrialBurned, themeClusterCounts, burnedThemeClusters, days };
}

export async function fetchRecentHeadlineHistory(
  workspaceId: string,
  opts?: { days?: number; excludeMissionId?: string },
  nexusApi = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, ''),
  internalKey = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key',
): Promise<RecentHeadlineHistory> {
  try {
    const res = await fetch(`${nexusApi}/api/artifacts`, {
      headers: {
        'X-Tenant-Id': workspaceId,
        'X-Internal-Api-Key': internalKey,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return emptyHeadlineHistory(opts?.days);
    }
    const artifacts = (await res.json()) as Record<string, unknown>[];
    return buildRecentHeadlineHistory(Array.isArray(artifacts) ? artifacts : [], opts);
  } catch {
    return emptyHeadlineHistory(opts?.days);
  }
}

function emptyHeadlineHistory(days?: number): RecentHeadlineHistory {
  return {
    recentKeys: new Set(),
    freeTrialBurned: false,
    themeClusterCounts: new Map(),
    burnedThemeClusters: new Set(),
    days: days ?? 14,
  };
}

/**
 * Two ideas in one batch touching the same theme are not a repeat — they carry
 * their own captions and headlines. Vary the design angle, but keep the copy;
 * a burned or already-published theme still has to be re-pitched.
 */
const SOFT_ROTATION_REASONS = new Set(['theme_cluster_batch_dup']);

function rotateIdea(
  idea: Record<string, unknown>,
  rotationIndex: number,
  reason: string,
  mandatoryAngles?: BrandDynamicsAngle[],
): Record<string, unknown> {
  const dynamic = mandatoryAngles?.length
    ? rotationHeadlineForAvoidedClusters([], mandatoryAngles, rotationIndex)
    : null;
  const idx = rotationIndex % ROTATION_USE_CASES.length;
  const useCase = dynamic?.useCase ?? ROTATION_USE_CASES[idx]!;
  // Rotation labels are planning angles (context-signal hooks like
  // "Yaz sezonu / serinletici menü", or "Perde arkası") — they steer the brief,
  // they are never publishable on-canvas copy.
  const angleLabel = dynamic?.headline ?? ROTATION_HEADLINES_TR[useCase] ?? 'Yeni içerik';
  const out = { ...idea };
  out.template_use_case = useCase;
  out.rotation_angle_label = angleLabel;
  out.cross_mission_headline_rotated = true;
  out.rotated_from = reason;
  if (dynamic?.angleId) out.brand_dynamics_angle_id = dynamic.angleId;

  // Overwriting a caption-coherent agent headline with a planning label makes
  // the label fail the on-canvas quality gate downstream, which then paints a
  // truncated caption prefix. Keep the copy whenever the rotation is only about
  // spreading design angles across a batch.
  const keepCopy = SOFT_ROTATION_REASONS.has(reason)
    && hasPublishableIdeationHeadline(idea);
  if (!keepCopy) {
    // A burned theme still has to move off the angle, but `angleLabel` is a
    // brief hook ("Dolunay temalı gece etkinliği / özel menü"), not copy — and
    // hooks are not sector-scoped, so writing one in can hand a jam shop a
    // nightlife line. Clear the copy fields instead and let the caption-driven
    // chain write the overlay; the angle survives in `rotation_angle_label`.
    delete out.headline;
    delete out.concept_title;
    delete out.idea_title;
    delete out.title;
    out.theme_rotation_suppressed_copy = true;
  }
  return out;
}

function ideaMatchesBurnedThemeCluster(
  idea: Record<string, unknown>,
  burned: Set<string>,
): string[] {
  const headline = resolveIdeationHeadline(idea);
  const caption = String(idea.caption_draft ?? idea.caption ?? '');
  const clusters = detectHeadlineThemeClusters(`${headline} ${caption}`);
  return clusters.filter((c) => burned.has(c));
}

/**
 * Block / rotate ücretsiz deneme hooks when burned in last 14 days;
 * cap duplicate free-trial headlines within the incoming idea batch.
 */
export function applyCrossMissionHeadlineDedupe(
  ideas: Record<string, unknown>[],
  history: RecentHeadlineHistory,
  opts?: { mandatoryAngles?: BrandDynamicsAngle[] },
): Record<string, unknown>[] {
  if (!ideas.length) return ideas;

  let freeTrialSeenInBatch = false;
  const batchThemeCounts = new Map<string, number>();
  let rotationIdx = 0;
  const out: Record<string, unknown>[] = [];

  for (const idea of ideas) {
    const headline = resolveIdeationHeadline(idea);
    const isTrial = containsFreeTrialHook(headline)
      || containsFreeTrialHook(String(idea.caption_draft ?? idea.caption ?? ''));

    if (history.freeTrialBurned && isTrial) {
      out.push(rotateIdea(idea, rotationIdx++, 'free_trial_hook', opts?.mandatoryAngles));
      continue;
    }

    if (isTrial) {
      if (freeTrialSeenInBatch) {
        out.push(rotateIdea(idea, rotationIdx++, 'free_trial_batch_dup', opts?.mandatoryAngles));
        continue;
      }
      freeTrialSeenInBatch = true;
    }

    const key = strategistHeadlineKey(idea);
    if (key && history.recentKeys.has(key)) {
      out.push(rotateIdea(idea, rotationIdx++, 'headline_key_dup', opts?.mandatoryAngles));
      continue;
    }

    const burnedHits = ideaMatchesBurnedThemeCluster(idea, history.burnedThemeClusters);
    if (burnedHits.length > 0) {
      out.push(rotateIdea(
        idea,
        rotationIdx++,
        `theme_cluster:${burnedHits[0]}`,
        opts?.mandatoryAngles,
      ));
      continue;
    }

    const ideaClusters = detectHeadlineThemeClusters(
      `${headline} ${String(idea.caption_draft ?? idea.caption ?? '')}`,
    );
    const batchDup = ideaClusters.some(
      (c) => (batchThemeCounts.get(c) ?? 0) >= 1,
    );
    if (batchDup) {
      out.push(rotateIdea(idea, rotationIdx++, 'theme_cluster_batch_dup', opts?.mandatoryAngles));
      continue;
    }
    for (const c of ideaClusters) {
      batchThemeCounts.set(c, (batchThemeCounts.get(c) ?? 0) + 1);
    }

    out.push(idea);
  }

  return out;
}
