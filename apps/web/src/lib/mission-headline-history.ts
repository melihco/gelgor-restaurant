/**
 * Cross-mission headline history — 14-day dedupe for burned promo hooks
 * (e.g. "ücretsiz deneme" overuse on SaaS tenants like Kaçta).
 */

import { resolveIdeationHeadline } from '@/lib/production-idea-parse';
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

export interface RecentHeadlineHistory {
  /** Normalized headline keys from recent artifacts (14 days). */
  recentKeys: Set<string>;
  /** True when ücretsiz deneme / free trial appeared in the window. */
  freeTrialBurned: boolean;
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
  }

  return { recentKeys, freeTrialBurned, days };
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
      return { recentKeys: new Set(), freeTrialBurned: false, days: opts?.days ?? 14 };
    }
    const artifacts = (await res.json()) as Record<string, unknown>[];
    return buildRecentHeadlineHistory(Array.isArray(artifacts) ? artifacts : [], opts);
  } catch {
    return { recentKeys: new Set(), freeTrialBurned: false, days: opts?.days ?? 14 };
  }
}

function rotateIdeaAwayFromFreeTrial(
  idea: Record<string, unknown>,
  rotationIndex: number,
): Record<string, unknown> {
  const idx = rotationIndex % ROTATION_USE_CASES.length;
  const useCase = ROTATION_USE_CASES[idx]!;
  const newHeadline = ROTATION_HEADLINES_TR[useCase] ?? 'Yeni içerik';
  const out = { ...idea };
  out.template_use_case = useCase;
  out.headline = newHeadline;
  out.concept_title = newHeadline;
  out.idea_title = newHeadline;
  out.title = newHeadline;
  out.cross_mission_headline_rotated = true;
  out.rotated_from = 'free_trial_hook';
  return out;
}

/**
 * Block / rotate ücretsiz deneme hooks when burned in last 14 days;
 * cap duplicate free-trial headlines within the incoming idea batch.
 */
export function applyCrossMissionHeadlineDedupe(
  ideas: Record<string, unknown>[],
  history: RecentHeadlineHistory,
): Record<string, unknown>[] {
  if (!ideas.length) return ideas;

  let freeTrialSeenInBatch = false;
  let rotationIdx = 0;
  const out: Record<string, unknown>[] = [];

  for (const idea of ideas) {
    const headline = resolveIdeationHeadline(idea);
    const isTrial = containsFreeTrialHook(headline)
      || containsFreeTrialHook(String(idea.caption_draft ?? idea.caption ?? ''));

    if (history.freeTrialBurned && isTrial) {
      out.push(rotateIdeaAwayFromFreeTrial(idea, rotationIdx++));
      continue;
    }

    if (isTrial) {
      if (freeTrialSeenInBatch) {
        out.push(rotateIdeaAwayFromFreeTrial(idea, rotationIdx++));
        continue;
      }
      freeTrialSeenInBatch = true;
    }

    const key = strategistHeadlineKey(idea);
    if (key && history.recentKeys.has(key)) {
      out.push(rotateIdeaAwayFromFreeTrial(idea, rotationIdx++));
      continue;
    }

    out.push(idea);
  }

  return out;
}
