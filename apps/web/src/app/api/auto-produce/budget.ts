/**
 * Auto-produce budget — persisted via Python usage-cost API.
 * Daily cap: AUTO_PRODUCE_DAILY_BUDGET_USD (default $1.00) + piece count limit.
 */

const CREW_BACKEND = (process.env.CREW_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';
const AUTO_PRODUCE_MAX_DAILY = parseInt(process.env.AUTO_PRODUCE_MAX_DAILY || '7', 10);
const DAILY_BUDGET_USD = parseFloat(process.env.AUTO_PRODUCE_DAILY_BUDGET_USD || '1');
/** Runway cost per 5s clip (gen4_turbo) */
const RUNWAY_COST_USD = 0.10;
/** Auto-produce Runway is OFF by default — reels get still cover; manual Runway after review */
const AUTO_PRODUCE_RUNWAY = process.env.AUTO_PRODUCE_RUNWAY === 'true';
const AUTO_PRODUCE_MAX_REELS_DAILY = parseInt(process.env.AUTO_PRODUCE_MAX_REELS_DAILY || '2', 10);

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

/**
 * Check whether auto-produce may call Runway for this workspace today.
 * Default: disabled — operator triggers Runway manually from Mission Content Factory.
 */
export async function canAffordRunway(workspaceId: string): Promise<BudgetCheckResult> {
  if (!AUTO_PRODUCE_RUNWAY) {
    return {
      allowed: false,
      remaining: 0,
      reason: 'Otomatik reel kapalı — onay sonrası Mission Factory\'den manuel Runway kullanın',
    };
  }

  const reelsToday = getReelsProducedToday(workspaceId);
  if (reelsToday >= AUTO_PRODUCE_MAX_REELS_DAILY) {
    return {
      allowed: false,
      remaining: 0,
      reason: `Günlük otomatik reel limiti (${AUTO_PRODUCE_MAX_REELS_DAILY})`,
    };
  }

  const budget = await fetchBudgetCheck(workspaceId, RUNWAY_COST_USD);
  if (!budget.allowed || budget.remaining_usd < RUNWAY_COST_USD) {
    return {
      allowed: false,
      remaining: 0,
      reason: `Runway için yeterli bütçe yok ($${budget.remaining_usd.toFixed(2)} kaldı, $${RUNWAY_COST_USD} gerekli)`,
      spentTodayUsd: budget.spent_today_usd,
      dailyBudgetUsd: budget.daily_budget_usd,
      remainingUsd: budget.remaining_usd,
    };
  }

  return {
    allowed: true,
    remaining: AUTO_PRODUCE_MAX_REELS_DAILY - reelsToday,
    spentTodayUsd: budget.spent_today_usd,
    dailyBudgetUsd: budget.daily_budget_usd,
    remainingUsd: budget.remaining_usd,
  };
}

export { incrementReelCount, RUNWAY_COST_USD };

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

export async function canProduce(
  workspaceId: string,
  batchSize: number,
  estimatedBatchCostUsd = 0,
): Promise<BudgetCheckResult> {
  if (process.env.AUTO_PRODUCE_ENABLE === 'false') {
    return { allowed: false, remaining: 0, reason: 'Auto-produce disabled' };
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

  const summary = await getUsageStats(workspaceId);
  const todayArtifacts = summary?.daily_series?.find((d) => d.date === new Date().toISOString().slice(0, 10));
  const artifactCountToday = todayArtifacts?.artifact_count ?? 0;
  const remainingCount = AUTO_PRODUCE_MAX_DAILY - artifactCountToday;

  if (remainingCount <= 0) {
    return {
      allowed: false,
      remaining: 0,
      reason: `Günlük içerik limiti (${AUTO_PRODUCE_MAX_DAILY} parça)`,
      spentTodayUsd: budget.spent_today_usd,
      dailyBudgetUsd: budget.daily_budget_usd,
      remainingUsd: budget.remaining_usd,
    };
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
