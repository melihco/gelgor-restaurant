/**
 * Subscription plan quotas, list prices, and unit economics (USD API).
 * Mirrors PackagePlanCatalog.cs + token_billing_service.py OUTPUTS/GRANT.
 */

export interface PlanMonthlyOutputs {
  missions: number;
  socialContent: number;
  galleryAnalysis: number;
  reels: number;
  /** Meta reklam kreatifi (designed_post türevi) */
  metaAdCreatives: number;
  /** Google Ads kreatifi (designed_post türevi) */
  googleAdCreatives: number;
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
  /** Public list price (USD) */
  monthlyPriceUsd: number;
  monthlyPriceTry: number;
  quotas: PlanQuotaLimits;
  outputs: PlanMonthlyOutputs;
  outputHighlights: string[];
}

const UNLIMITED = -1;

/** USD/TRY for plan economics display. */
export const PLAN_USD_TRY_RATE = 32;

/**
 * Tuned API unit costs (USD) — aligned with idea_count production (~15 slots).
 * Kept slightly conservative so list prices still target ~200% profit on cost.
 *
 * Per mission (target mix):
 * - 4 post / 8 story / 1 carousel / 2 reel
 * - 1 Meta + 1 Google ad creative derivative
 */
export const PLAN_API_UNIT_COSTS = {
  missionPropose: 0.28,
  missionProductionCycle: 3.2,
  galleryVisionAnalysis: 0.04,
  standaloneReel: 0.3,
} as const;

export const PACKAGE_PLANS: Record<string, PlanSpec> = {
  starter: {
    slug: 'starter',
    name: 'Starter',
    monthlyPriceUsd: 156,
    monthlyPriceTry: 4_992,
    quotas: {
      agentRuns: 14,
      providerActions: 18,
      liveProviderActions: 0,
      llmTokens: 200_000,
      monthlyGrantTokens: 5_000,
    },
    outputs: {
      // 14 missions × (~15 fikir) — idea_count production
      missions: 14,
      socialContent: 210,
      galleryAnalysis: 40,
      reels: 14,
      metaAdCreatives: 14,
      googleAdCreatives: 14,
    },
    outputHighlights: [
      '14 misyon / ay',
      '~210 içerik (misyon başına ~15 fikir: 4 post · 8 story · 2 reel)',
      '14 Meta + 14 Google reklam kreatifi',
      '5.000 SA Kredi aylık',
    ],
  },
  growth: {
    slug: 'growth',
    name: 'Growth',
    monthlyPriceUsd: 312,
    monthlyPriceTry: 9_984,
    quotas: {
      agentRuns: 28,
      providerActions: 45,
      liveProviderActions: 8,
      llmTokens: 500_000,
      monthlyGrantTokens: 15_000,
    },
    outputs: {
      missions: 28,
      socialContent: 280,
      galleryAnalysis: 120,
      reels: 28,
      metaAdCreatives: 28,
      googleAdCreatives: 28,
    },
    outputHighlights: [
      '28 misyon / ay',
      '~280 içerik (misyon başına ~15 fikir: 4 post · 8 story · 2 reel)',
      '28 Meta + 28 Google reklam kreatifi',
      '15.000 SA Kredi aylık',
    ],
  },
  performance: {
    slug: 'performance',
    name: 'Performance',
    monthlyPriceUsd: 719,
    monthlyPriceTry: 23_008,
    quotas: {
      agentRuns: 65,
      providerActions: 140,
      liveProviderActions: 40,
      llmTokens: 1_000_000,
      monthlyGrantTokens: 40_000,
    },
    outputs: {
      missions: 65,
      socialContent: 650,
      galleryAnalysis: 250,
      reels: 65,
      metaAdCreatives: 65,
      googleAdCreatives: 65,
    },
    outputHighlights: [
      '65 misyon / ay',
      '~650 içerik + 65 reel (legacy plan)',
      '65 Meta + 65 Google reklam kreatifi',
      '40.000 SA Kredi aylık',
    ],
  },
  executive: {
    slug: 'executive',
    name: 'Executive',
    monthlyPriceUsd: 1562,
    monthlyPriceTry: 49_984,
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
      metaAdCreatives: UNLIMITED,
      googleAdCreatives: UNLIMITED,
    },
    outputHighlights: [
      'Sınırsız misyon ve provider aksiyon',
      'Sınırsız sosyal içerik üretimi',
      '150.000 SA Kredi aylık',
      'Öncelikli canlı yayın & CEO agent',
    ],
  },
};

const SLUG_ALIASES: Record<string, keyof typeof PACKAGE_PLANS> = {
  studio: 'starter',
  agency: 'growth',
  signature: 'performance',
  premium: 'performance',
  collective: 'executive',
};

function finiteCap(value: number, cap: number): number {
  return value < 0 ? cap : value;
}

/** Estimated API COGS if monthly output caps are fully utilized. */
export function estimatePlanMonthlyApiCostUsd(plan: PlanSpec): number {
  const missions = finiteCap(plan.outputs.missions, 20);
  const gallery = finiteCap(plan.outputs.galleryAnalysis, 300);

  const perMission =
    PLAN_API_UNIT_COSTS.missionPropose + PLAN_API_UNIT_COSTS.missionProductionCycle;
  let cost = missions * perMission + gallery * PLAN_API_UNIT_COSTS.galleryVisionAnalysis;

  return Math.round(cost * 100) / 100;
}

/** Gross margin % on list price if all outputs are consumed (API only). */
export function estimatePlanMarginOnRevenuePercent(plan: PlanSpec): number | null {
  if (plan.monthlyPriceUsd <= 0) return null;
  const cogs = estimatePlanMonthlyApiCostUsd(plan);
  return Math.round(((plan.monthlyPriceUsd - cogs) / plan.monthlyPriceUsd) * 1000) / 10;
}

export function getPlanSpec(slug: string | null | undefined): PlanSpec | null {
  if (!slug) return null;
  const key = slug.trim().toLowerCase();
  return PACKAGE_PLANS[key] ?? (SLUG_ALIASES[key] ? PACKAGE_PLANS[SLUG_ALIASES[key]!] ?? null : null);
}

export function formatOutputLimit(value: number): string {
  return value < 0 ? 'Sınırsız' : value.toLocaleString('tr-TR');
}

/** All known plan specs (incl. legacy / inactive for existing tenants). */
export const PACKAGE_PLAN_TIERS: PlanSpec[] = [
  PACKAGE_PLANS.starter!,
  PACKAGE_PLANS.growth!,
  PACKAGE_PLANS.performance!,
  PACKAGE_PLANS.executive!,
];

/** Plans offered for new purchase / upgrade in customer UI + PayTR. */
export const SELLABLE_PACKAGE_SLUGS = ['starter', 'growth'] as const;
export type SellablePackageSlug = (typeof SELLABLE_PACKAGE_SLUGS)[number];

export const SELLABLE_PACKAGE_PLAN_TIERS: PlanSpec[] = SELLABLE_PACKAGE_SLUGS.map(
  (slug) => PACKAGE_PLANS[slug]!,
);

export function isSellablePackageSlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  const key = slug.trim().toLowerCase();
  return (SELLABLE_PACKAGE_SLUGS as readonly string[]).includes(key);
}

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
