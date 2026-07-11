/**
 * Auto-produce budget — persisted via Python usage-cost API.
 * Daily cap: AUTO_PRODUCE_DAILY_BUDGET_USD (default $10.00) — raised to cover
 * full-quality production (fal.ai reels + Creatomate stories + GPT enhance).
 * Override: AUTO_PRODUCE_DAILY_BUDGET_USD env var.
 *
 * Package-aware limits: fetched from Nexus /api/packages/usage and cached 1h.
 * Starter=350/mo (~11/day), Growth=800/mo (~26/day), Performance=1820/mo (~60/day),
 * Executive=unlimited. Env var overrides act as operator ceilings on top.
 */

import { NEXUS_API, INTERNAL_KEY } from './nexus-client';
import { getCrewBackendBaseUrl } from '@/lib/crew-backend-url';
import { serverConfig } from '@/lib/server-config';

const CREW_BACKEND = getCrewBackendBaseUrl();
/** Operator ceiling for daily artifact count — package limits apply first. */
const AUTO_PRODUCE_MAX_DAILY = serverConfig.autoProduce.maxDaily;
/** Operator ceiling for per-HTTP-call mission drain batches (not ideation pool size). */
const MISSION_AUTO_PRODUCE_MAX_PER_RUN = serverConfig.autoProduce.maxPerRun;
const DAILY_BUDGET_USD = serverConfig.autoProduce.dailyBudgetUsd;
/** Operator ceiling for daily reels — package monthly reel limit applies first. */
const AUTO_PRODUCE_MAX_REELS_DAILY = serverConfig.autoProduce.maxReelsDaily;

// ── Package-aware limit resolution ────────────────────────────────────────────

interface PackageLimits {
  /** MonthlySocialContent / 30, rounded up. -1 = unlimited (Executive). */
  dailySocialContent: number;
  /** MonthlyReels. -1 = unlimited. */
  monthlyReels: number;
  isUnlimited: boolean;
  packageSlug: string | null;
}

const _limitsCache: Record<string, { limits: PackageLimits; expiresAt: number }> = {};

export async function fetchPackageLimits(workspaceId: string): Promise<PackageLimits> {
  const now = Date.now();
  const cached = _limitsCache[workspaceId];
  if (cached && cached.expiresAt > now) return cached.limits;

  try {
    const res = await fetch(`${NEXUS_API}/api/packages/usage`, {
      headers: { 'X-Tenant-Id': workspaceId },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data: {
      packageSlug?: string;
      monthlyOutputs?: { socialContent: number; reels: number } | null;
    } = await res.json();
    const socialContent = data.monthlyOutputs?.socialContent ?? -1;
    const reels = data.monthlyOutputs?.reels ?? -1;
    const limits: PackageLimits = {
      dailySocialContent: socialContent === -1 ? -1 : Math.max(5, Math.ceil(socialContent / 30)),
      monthlyReels: reels,
      isUnlimited: socialContent === -1,
      packageSlug: data.packageSlug?.trim() || null,
    };
    _limitsCache[workspaceId] = { limits, expiresAt: now + 60 * 60 * 1_000 };
    return limits;
  } catch {
    // Non-fatal: if Nexus is unreachable, fall through to env-var ceilings only.
    return { dailySocialContent: -1, monthlyReels: -1, isUnlimited: true, packageSlug: null };
  }
}

import { isProductionLimitsBypassed } from '@/lib/production-budget-policy';

export { isProductionLimitsBypassed };

/** In-process reel counter (resets on server restart; budget check is authoritative) */
const _reelCountByWorkspace: Record<string, { date: string; count: number }> = {};

function getReelsProducedToday(workspaceId: string): number {
  const today = new Date().toISOString().slice(0, 10);
  const entry = _reelCountByWorkspace[workspaceId];
  if (!entry || entry.date !== today) return 0;
  return entry.count;
}

function incrementReelCount(workspaceId: string): void {
  const today = new Date().toISOString().slice(0, 10);
  const entry = _reelCountByWorkspace[workspaceId];
  if (!entry || entry.date !== today) {
    _reelCountByWorkspace[workspaceId] = { date: today, count: 1 };
  } else {
    entry.count += 1;
  }
}

export { incrementReelCount };

export interface BudgetCheckResult {
  allowed: boolean;
  remaining: number;
  reason?: string;
  spentTodayUsd?: number;
  dailyBudgetUsd?: number;
  remainingUsd?: number;
}

async function fetchBudgetCheck(
  workspaceId: string,
  additionalCostUsd: number,
): Promise<{
  allowed: boolean;
  spent_today_usd: number;
  remaining_usd: number;
  daily_budget_usd: number;
  reason?: string | null;
}> {
  const qs = additionalCostUsd > 0 ? `?additional_cost_usd=${additionalCostUsd}` : '';
  const res = await fetch(
    `${CREW_BACKEND}/api/v1/usage-cost/${workspaceId}/budget-check${qs}`,
    {
      headers: {
        'X-Internal-Api-Key': INTERNAL_KEY,
        'X-Tenant-Id': workspaceId,
      },
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!res.ok) {
    return {
      allowed: true,
      spent_today_usd: 0,
      remaining_usd: DAILY_BUDGET_USD,
      daily_budget_usd: DAILY_BUDGET_USD,
    };
  }
  return res.json();
}

export type CanProduceOptions = {
  /** Mission Hub pipeline — skip the low manual daily artifact cap. */
  missionProduction?: boolean;
};

export async function canProduce(
  workspaceId: string,
  batchSize: number,
  estimatedBatchCostUsd = 0,
  options?: CanProduceOptions,
): Promise<BudgetCheckResult> {
  if (!serverConfig.autoProduce.enabled) {
    return { allowed: false, remaining: 0, reason: 'Auto-produce disabled' };
  }

  const missionProduction = options?.missionProduction === true;

  // Resolve effective daily cap: min(operator ceiling, package daily quota)
  const pkgLimits = await fetchPackageLimits(workspaceId);
  const packageDailyMax = pkgLimits.isUnlimited || pkgLimits.dailySocialContent === -1
    ? AUTO_PRODUCE_MAX_DAILY
    : pkgLimits.dailySocialContent;
  const effectiveDailyMax = Math.min(AUTO_PRODUCE_MAX_DAILY, packageDailyMax);
  const maxBatch = missionProduction ? MISSION_AUTO_PRODUCE_MAX_PER_RUN : effectiveDailyMax;

  if (isProductionLimitsBypassed()) {
    return {
      allowed: true,
      // Mission manifest planning uses the full merged ideation pool — not maxPerRun.
      remaining: missionProduction ? batchSize : Math.min(batchSize, maxBatch),
      spentTodayUsd: 0,
      dailyBudgetUsd: DAILY_BUDGET_USD,
      remainingUsd: DAILY_BUDGET_USD,
    };
  }

  const budget = await fetchBudgetCheck(workspaceId, estimatedBatchCostUsd);
  if (!budget.allowed) {
    return {
      allowed: false,
      remaining: 0,
      reason: budget.reason ?? `Günlük API bütçesi doldu ($${budget.spent_today_usd.toFixed(2)} / $${budget.daily_budget_usd.toFixed(2)})`,
      spentTodayUsd: budget.spent_today_usd,
      dailyBudgetUsd: budget.daily_budget_usd,
      remainingUsd: budget.remaining_usd,
    };
  }

  let remainingCount: number;
  if (missionProduction) {
    // Mission runs are the primary product — only USD wallet gates them.
    // Full ideation pool for manifest/slot planning; maxPerRun caps drain batches elsewhere.
    remainingCount = batchSize;
  } else {
    const summary = await getUsageStats(workspaceId);
    const todayArtifacts = summary?.daily_series?.find(
      (d) => d.date === new Date().toISOString().slice(0, 10),
    );
    const artifactCountToday = todayArtifacts?.artifact_count ?? 0;
    remainingCount = effectiveDailyMax - artifactCountToday;
    if (remainingCount <= 0) {
      return {
        allowed: false,
        remaining: 0,
        reason: `Günlük içerik limiti doldu (${effectiveDailyMax} parça — ${pkgLimits.isUnlimited ? 'operatör limiti' : 'paket limiti'})`,
        spentTodayUsd: budget.spent_today_usd,
        dailyBudgetUsd: budget.daily_budget_usd,
        remainingUsd: budget.remaining_usd,
      };
    }
  }

  const maxByBudget = estimatedBatchCostUsd > 0
    ? Math.floor(budget.remaining_usd / estimatedBatchCostUsd)
    : remainingCount;

  const remaining = Math.max(0, Math.min(remainingCount, maxByBudget || remainingCount));

  return {
    allowed: remaining > 0,
    remaining: Math.min(remaining, batchSize),
    spentTodayUsd: budget.spent_today_usd,
    dailyBudgetUsd: budget.daily_budget_usd,
    remainingUsd: budget.remaining_usd,
  };
}

export async function recordProduction(
  workspaceId: string,
  count: number,
  costEstimate: number,
): Promise<void> {
  if (costEstimate <= 0 && count <= 0) return;

  try {
    await fetch(`${CREW_BACKEND}/api/v1/usage-cost/${workspaceId}/record`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Api-Key': INTERNAL_KEY,
        'X-Tenant-Id': workspaceId,
      },
      body: JSON.stringify({
        amount_usd: Math.max(0.001, costEstimate),
        category: 'auto_produce',
        artifact_count: count,
        mission_count: 0,
      }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    /* non-fatal */
  }
}

export interface UsageStats {
  spent_today_usd: number;
  remaining_today_usd: number;
  daily_budget_usd: number;
  week_cost_usd: number;
  week_artifact_count: number;
  week_mission_count: number;
  category_totals: Record<string, number>;
  daily_series: { date: string; cost_usd: number; artifact_count: number; mission_count: number }[];
}

export async function getUsageStats(workspaceId: string): Promise<UsageStats | null> {
  try {
    const res = await fetch(`${CREW_BACKEND}/api/v1/usage-cost/${workspaceId}?days=7`, {
      headers: {
        'X-Internal-Api-Key': INTERNAL_KEY,
        'X-Tenant-Id': workspaceId,
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** @deprecated in-memory cleanup no longer needed */
export function cleanupOldBuckets(): void {
  /* no-op — costs persisted in PostgreSQL */
}
