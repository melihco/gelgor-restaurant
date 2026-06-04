/**
 * Subscription plan quotas + monthly output promises (mirrors PackagePlanCatalog.cs).
 * Used by Usage & Plan / Settings / Billing UI.
 */

export interface PlanMonthlyOutputs {
  missions: number;
  socialContent: number;
  galleryAnalysis: number;
  reels: number;
}

export interface PlanQuotaLimits {
  agentRuns: number;
  providerActions: number;
  liveProviderActions: number;
  llmTokens: number;
  monthlyGrantTokens: number;
}

export interface PlanSpec {
  slug: string;
  name: string;
  /** Public list price (USD) — lowest tier is $79 */
  monthlyPriceUsd: number;
  monthlyPriceTry: number;
  quotas: PlanQuotaLimits;
  outputs: PlanMonthlyOutputs;
  outputHighlights: string[];
}

const UNLIMITED = -1;

/** USD/TRY for plan economics display (configurable via env later). */
export const PLAN_USD_TRY_RATE = 32;

export const PACKAGE_PLANS: Record<string, PlanSpec> = {
  starter: {
    slug: 'starter',
    name: 'Starter',
    monthlyPriceUsd: 79,
    monthlyPriceTry: 79 * PLAN_USD_TRY_RATE,
    quotas: {
      agentRuns: 50,
      providerActions: 60,
      liveProviderActions: 4,
      llmTokens: 800_000,
      monthlyGrantTokens: 20_000,
    },
    outputs: {
      missions: 50,
      socialContent: 350,
      galleryAnalysis: 160,
      reels: 4,
    },
    outputHighlights: [
      '50 tam misyon döngüsü / ay',
      '350 sosyal medya içeriği',
      '160 galeri fotoğraf analizi',
      '20.000 SA Kredi aylık',
    ],
  },
  growth: {
    slug: 'growth',
    name: 'Growth',
    monthlyPriceUsd: 149,
    monthlyPriceTry: 149 * PLAN_USD_TRY_RATE,
    quotas: {
      agentRuns: 120,
      providerActions: 180,
      liveProviderActions: 32,
      llmTokens: 2_000_000,
      monthlyGrantTokens: 60_000,
    },
    outputs: {
      missions: 120,
      socialContent: 800,
      galleryAnalysis: 480,
      reels: 16,
    },
    outputHighlights: [
      '120 tam misyon döngüsü / ay',
      '800 sosyal medya içeriği',
      '480 galeri analizi · 16 reel',
      '60.000 SA Kredi aylık',
    ],
  },
  performance: {
    slug: 'performance',
    name: 'Performance',
    monthlyPriceUsd: 249,
    monthlyPriceTry: 249 * PLAN_USD_TRY_RATE,
    quotas: {
      agentRuns: 260,
      providerActions: 560,
      liveProviderActions: 160,
      llmTokens: 4_000_000,
      monthlyGrantTokens: 160_000,
    },
    outputs: {
      missions: 260,
      socialContent: 1_820,
      galleryAnalysis: 1_000,
      reels: 32,
    },
    outputHighlights: [
      '260 tam misyon döngüsü / ay',
      '1.820 sosyal medya içeriği',
      '1.000 galeri · 32 Runway reel',
      '160.000 SA Kredi aylık',
    ],
  },
  executive: {
    slug: 'executive',
    name: 'Executive',
    monthlyPriceUsd: 499,
    monthlyPriceTry: 499 * PLAN_USD_TRY_RATE,
    quotas: {
      agentRuns: UNLIMITED,
      providerActions: UNLIMITED,
      liveProviderActions: UNLIMITED,
      llmTokens: UNLIMITED,
      monthlyGrantTokens: 150_000,
    },
    outputs: {
      missions: UNLIMITED,
      socialContent: UNLIMITED,
      galleryAnalysis: UNLIMITED,
      reels: UNLIMITED,
    },
    outputHighlights: [
      'Sınırsız misyon ve provider aksiyon',
      'Sınırsız sosyal içerik üretimi',
      '150.000 SA Kredi aylık',
      'Öncelikli canlı yayın & CEO agent',
    ],
  },
};

export function getPlanSpec(slug: string | null | undefined): PlanSpec | null {
  if (!slug) return null;
  return PACKAGE_PLANS[slug.trim().toLowerCase()] ?? null;
}

export function formatOutputLimit(value: number): string {
  return value < 0 ? 'Sınırsız' : value.toLocaleString('tr-TR');
}

/** Sorted tiers for Usage & Plan (lowest = $79 Starter). */
export const PACKAGE_PLAN_TIERS: PlanSpec[] = [
  PACKAGE_PLANS.starter,
  PACKAGE_PLANS.growth,
  PACKAGE_PLANS.performance,
  PACKAGE_PLANS.executive,
];

export function formatPlanMonthlyPrice(plan: PlanSpec): string {
  return `$${plan.monthlyPriceUsd}/ay · ${plan.monthlyPriceTry.toLocaleString('tr-TR')}₺`;
}

export function computePlanEconomics(
  monthlyPriceTry: number,
  monthCostUsd: number,
  monthBilledUsd: number,
): {
  revenueUsd: number;
  profitUsd: number;
  costProfitRatio: number | null;
  marginOnRevenuePercent: number | null;
} {
  const revenueUsd = monthlyPriceTry / PLAN_USD_TRY_RATE;
  const profitUsd = Math.max(0, revenueUsd - monthCostUsd);
  const costProfitRatio =
    profitUsd > 0.001 ? Math.round((monthCostUsd / profitUsd) * 100) / 100 : null;
  const marginOnRevenuePercent =
    revenueUsd > 0 ? Math.round(((revenueUsd - monthCostUsd) / revenueUsd) * 1000) / 10 : null;
  return {
    revenueUsd: Math.round(revenueUsd * 100) / 100,
    profitUsd: Math.round(profitUsd * 100) / 100,
    costProfitRatio,
    marginOnRevenuePercent,
  };
}
