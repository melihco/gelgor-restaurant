import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

describe('canProduce mission ideation pool', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    process.env.AUTO_PRODUCE_BYPASS_LIMITS = 'false';
    process.env.NEXT_PUBLIC_AUTO_PRODUCE_BYPASS_LIMITS = 'false';
    process.env.MISSION_AUTO_PRODUCE_MAX_PER_RUN = '5';
    process.env.AUTO_PRODUCE_ENABLE = 'true';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns full batchSize for mission production (not maxPerRun cap)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/packages/usage')) {
          return new Response(
            JSON.stringify({
              packageSlug: 'agency',
              monthlyOutputs: { socialContent: 800, reels: 20 },
            }),
            { status: 200 },
          );
        }
        if (url.includes('/budget-check')) {
          return new Response(
            JSON.stringify({
              allowed: true,
              spent_today_usd: 0,
              remaining_usd: 50,
              daily_budget_usd: 50,
            }),
            { status: 200 },
          );
        }
        if (url.includes('/usage-cost/') && !url.includes('budget-check')) {
          return new Response(
            JSON.stringify({
              spent_today_usd: 0,
              remaining_today_usd: 50,
              daily_budget_usd: 50,
              week_cost_usd: 0,
              week_artifact_count: 0,
              week_mission_count: 0,
              category_totals: {},
              daily_series: [],
            }),
            { status: 200 },
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const { canProduce } = await import('@/app/api/auto-produce/budget');
    const result = await canProduce('ws-mission', 16, 0, { missionProduction: true });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(16);
  });

  it('still caps manual auto-produce by daily limits', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/packages/usage')) {
          return new Response(
            JSON.stringify({
              packageSlug: 'agency',
              monthlyOutputs: { socialContent: 800, reels: 20 },
            }),
            { status: 200 },
          );
        }
        if (url.includes('/budget-check')) {
          return new Response(
            JSON.stringify({
              allowed: true,
              spent_today_usd: 0,
              remaining_usd: 50,
              daily_budget_usd: 50,
            }),
            { status: 200 },
          );
        }
        if (url.includes('/usage-cost/') && !url.includes('budget-check')) {
          return new Response(
            JSON.stringify({
              spent_today_usd: 0,
              remaining_today_usd: 50,
              daily_budget_usd: 50,
              week_cost_usd: 0,
              week_artifact_count: 0,
              week_mission_count: 0,
              category_totals: {},
              daily_series: [],
            }),
            { status: 200 },
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const { canProduce } = await import('@/app/api/auto-produce/budget');
    const result = await canProduce('ws-manual', 16, 0);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(16);
  });
});
