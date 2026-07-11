/**
 * Sprint 3 — auto-produce planning phase.
 * Budget, ICS parse, production profile, Feed Director assignments, stack context.
 */
import { getNextjsInternalOrigin } from '@/lib/runtime-config';
import { canProduce } from '@/app/api/auto-produce/budget';
import { fetchPackageLimits } from '@/app/api/auto-produce/budget';
import {
  applyCrossMissionHeadlineDedupe,
  fetchRecentHeadlineHistory,
} from '@/lib/mission-headline-history';
import { computeBrandDynamics } from '@/lib/brand-dynamics';
import { resolveManifestMissionType } from '@/lib/mission-production-prefs';
import type { MissionProductionManifest } from '@/lib/mission-production-manifest';
import { resolveMissionRequiredSlotCount } from '@/lib/mission-production-manifest';
import {
  fetchGisScoreForWorkspace,
  isFeedDirectorFallback,
  resolveProductionProfile,
  shouldBlockProductionOnFdFallback,
  type ProductionProfile,
} from '@/lib/production-profile';
import {
  prepareMissionFdAssignments,
  type ManifestProductionQueueItem,
} from '@/lib/production-pipeline-router';
import {
  createProductionStackContext,
  inferHeroReelIndex,
  resolveMaxRunwayReelsPerMission,
  resolvePrimaryIndicesWithReport,
} from '@/lib/production-stack';
import { fetchRejectedLayoutFamilies } from '@/lib/layout-family-learning';
import { resolveGrafikerMaxRetries } from '@/lib/remotion-quality';
import {
  productionIdeasFromParsed,
  productionIdeaToRecord,
} from '@/lib/production-idea-parse';
import type { ProductionIdea } from '@/types/production-idea';
import type { ProductionPipelineRun } from '@/lib/auto-produce/pipeline-telemetry';
import { runPipelineStep } from '@/lib/auto-produce/pipeline-telemetry';

export interface ParsedIdeaLike {
  headline?: string;
  concept_title?: string;
  caption?: string;
  content_type?: string;
  content_kind?: string;
  [key: string]: unknown;
}

export interface AutoProducePlanContext {
  toProcess: ParsedIdeaLike[];
  productionIdeas: ProductionIdea[];
  maxIdeas: number;
  manifestMissionType: ReturnType<typeof resolveManifestMissionType>;
  pkgLimits: Awaited<ReturnType<typeof fetchPackageLimits>>;
  gisScore: number | null;
  productionProfile: ProductionProfile;
  grafikerMaxRetries: number;
  fdPrepared: ReturnType<typeof prepareMissionFdAssignments>;
  fdAssignments: ReturnType<typeof prepareMissionFdAssignments>['assignments'];
  manifestValidation: ReturnType<typeof prepareMissionFdAssignments>['validation'];
  fdProductionGate: ReturnType<typeof prepareMissionFdAssignments>['gate'];
  stackCtx: ReturnType<typeof createProductionStackContext>;
  primaryIdeaIndices: ReturnType<typeof resolvePrimaryIndicesWithReport>;
  maxRunwayReelsPerMission: number;
  hasOrganicReelAssignment: boolean;
  rejectedLayoutFamilies: string[];
  headlineHistory: Awaited<ReturnType<typeof fetchRecentHeadlineHistory>>;
  brandDynamics: ReturnType<typeof computeBrandDynamics> | null;
  pisScores: number[];
  pisWarnings: Array<{
    idea_index: number;
    headline: string;
    renderer: string;
    score: number;
    missing: string[];
    pipeline: string;
  }>;
  enhanceTraces: Array<{
    idea_index: number;
    headline: string;
    pipeline: string;
    applied: boolean;
    skip_reason?: string;
    api_failed?: boolean;
  }>;
}

export type AutoProducePlanOutcome =
  | { status: 'ready'; plan: AutoProducePlanContext }
  | { status: 'blocked'; httpStatus: number; body: Record<string, unknown> };

export interface AutoProducePlanInput {
  workspaceId: string;
  missionId?: string;
  ideas: ParsedIdeaLike[];
  /** Calendar-only backfill — ideation pool empty but additive calendar slots run. */
  calendarOnlySlotPass?: boolean;
  calendarIdeasCount?: number;
  feedDirectorReport: Record<string, unknown> | null;
  productionPackage: string | null;
  strategistMissionType: string | null;
  missionTitle: string | null;
  creativeBrief: string | null;
  brandBusinessType: string;
  brandTheme: Record<string, unknown> | null;
  brandName?: string | null;
  brandLocation?: string | null;
  brandDescription?: string | null;
  pipelineRun?: ProductionPipelineRun;
}

export async function runAutoProducePlanPhase(
  input: AutoProducePlanInput,
): Promise<AutoProducePlanOutcome> {
  const {
    workspaceId,
    missionId,
    ideas,
    calendarOnlySlotPass = false,
    calendarIdeasCount = 0,
    feedDirectorReport,
    productionPackage,
    strategistMissionType,
    missionTitle,
    creativeBrief,
    brandBusinessType,
    brandTheme,
    brandName,
    brandLocation,
    brandDescription,
    pipelineRun,
  } = input;

  const budget = pipelineRun
    ? await runPipelineStep(
      pipelineRun,
      'budget_check',
      () => canProduce(workspaceId, ideas.length, 0, {
        missionProduction: Boolean(missionId),
      }),
    )
    : await canProduce(workspaceId, ideas.length, 0, {
      missionProduction: Boolean(missionId),
    });

  if (!budget || !budget.allowed) {
    return {
      status: 'blocked',
      httpStatus: 429,
      body: {
        error: budget?.reason ?? 'Production budget blocked',
        produced: 0,
        code: missionId ? 'mission_production_budget_blocked' : 'production_budget_blocked',
        budget: {
          spentTodayUsd: budget?.spentTodayUsd,
          dailyBudgetUsd: budget?.dailyBudgetUsd,
          remainingUsd: budget?.remainingUsd,
        },
      },
    };
  }

  const maxIdeas = budget.remaining;
  const planIdeaPool = missionId ? ideas : ideas.slice(0, maxIdeas);
  const headlineHistory = await fetchRecentHeadlineHistory(workspaceId, {
    days: 14,
    excludeMissionId: missionId ?? undefined,
  });
  const brandDynamics = computeBrandDynamics({
    businessType: brandBusinessType,
    brandName: brandName ?? undefined,
    brandDescription: brandDescription ?? undefined,
    location: brandLocation ?? undefined,
    themeClusterCounts: Object.fromEntries(headlineHistory.themeClusterCounts),
  });
  const rawSlice = applyCrossMissionHeadlineDedupe(
    planIdeaPool as Record<string, unknown>[],
    headlineHistory,
    { mandatoryAngles: brandDynamics.mandatoryAngles },
  );
  if (headlineHistory.burnedThemeClusters.size > 0) {
    console.log(
      `[auto-produce] Cross-mission theme dedupe: burned clusters=${[...headlineHistory.burnedThemeClusters].join(', ')}`,
    );
  }
  if (headlineHistory.freeTrialBurned) {
    console.log(
      `[auto-produce] Cross-mission dedupe: ücretsiz deneme burned in last ${headlineHistory.days}d — rotating promo hooks`,
    );
  }

  const productionIdeas = productionIdeasFromParsed(rawSlice, missionId);
  const toProcess = productionIdeas.map((pi) => productionIdeaToRecord(pi) as ParsedIdeaLike);
  console.log(`[auto-produce] ICS parsed=${productionIdeas.length} ideas (ProductionIdea)`);

  const manifestMissionType = resolveManifestMissionType({
    hubPackage: (productionPackage ?? null) as MissionProductionManifest['missionType'] | null,
    missionType: strategistMissionType ?? null,
    title: missionTitle,
    creativeBrief,
  });

  const pkgLimits = await fetchPackageLimits(workspaceId);
  const routeBaseUrl = getNextjsInternalOrigin();
  const gisScore = await fetchGisScoreForWorkspace(workspaceId, routeBaseUrl);
  const productionProfile = resolveProductionProfile({
    packageSlug: pkgLimits.packageSlug,
    gisScore,
    brandTheme,
    monthlyReels: pkgLimits.monthlyReels,
  });
  const requiredSlotTarget = resolveMissionRequiredSlotCount({
    missionType: manifestMissionType,
    requireCampaignReel: manifestMissionType === 'campaign',
    productionProfile,
    packageSlug: pkgLimits.packageSlug,
    contentItemCount: productionIdeas.length,
  });
  if (missionId && productionIdeas.length < requiredSlotTarget) {
    console.warn(
      `[auto-produce] Mission ${missionId} has only ${productionIdeas.length}/${requiredSlotTarget} ideas — ` +
      'production slot target may be incomplete (check ideation merge or content_ideation count).',
    );
  }

  const grafikerMaxRetries = resolveGrafikerMaxRetries(productionProfile.grafikerMaxRetries);

  const fdPrepared = prepareMissionFdAssignments({
    missionId,
    report: feedDirectorReport ?? null,
    ideas: toProcess as Record<string, unknown>[],
    manifestMissionType,
    sector: brandBusinessType,
    productionProfile,
    packageSlug: pkgLimits.packageSlug,
    requireCampaignReel: manifestMissionType === 'campaign',
    blockedHeadlineKeys: headlineHistory.recentKeys,
  });

  if (
    missionId
    && feedDirectorReport
    && isFeedDirectorFallback(feedDirectorReport)
    && shouldBlockProductionOnFdFallback(productionProfile)
  ) {
    return {
      status: 'blocked',
      httpStatus: 422,
      body: {
        error: 'Feed Art Director kullanılamadı — heuristik routing engellendi (premium/economy profil).',
        code: 'fd_fallback_blocked',
        productionProfile: productionProfile.tier,
        produced: 0,
      },
    };
  }

  if (
    missionId
    && !fdPrepared.gate.allowed
    && !(calendarOnlySlotPass && calendarIdeasCount > 0 && fdPrepared.gate.code === 'fd_no_ideas')
  ) {
    return {
      status: 'blocked',
      httpStatus: 422,
      body: {
        error: fdPrepared.gate.message ?? 'Feed Art Director doğrulaması başarısız',
        code: fdPrepared.gate.code ?? 'fd_validation_blocked',
        productionProfile: productionProfile.tier,
        manifestCoverage: fdPrepared.gate.coveragePct,
        assignments: fdPrepared.gate.assignmentCount,
        requiredSlots: fdPrepared.gate.requiredSlots,
        filledRequired: fdPrepared.gate.filledRequired,
        produced: 0,
      },
    };
  }

  if (fdPrepared.gate.warnOnly && fdPrepared.gate.warnings.length > 0) {
    console.warn(`[auto-produce] FD gate warnings: ${fdPrepared.gate.warnings.join('; ')}`);
  }

  const fdAssignments = fdPrepared.assignments;
  const hasOrganicReelAssignment = fdAssignments.some((a) => a.slot_role === 'organic_reel');
  const rejectedLayoutFamilies = await fetchRejectedLayoutFamilies(workspaceId);
  if (rejectedLayoutFamilies.length > 0) {
    console.log(
      `[auto-produce] APO-8 layout rotation — skip families: ${rejectedLayoutFamilies.join(', ')}`,
    );
  }

  const stackCtx = createProductionStackContext(feedDirectorReport ?? null, {
    assignments: fdAssignments,
    ideas: toProcess as Record<string, unknown>[],
    blockedLayoutFamilies: rejectedLayoutFamilies,
  });
  if (stackCtx.heroReelIndex === null && toProcess.length > 0) {
    stackCtx.heroReelIndex = inferHeroReelIndex(toProcess as Record<string, unknown>[]);
  }

  const primaryIdeaIndices = resolvePrimaryIndicesWithReport(
    toProcess as Record<string, unknown>[],
    feedDirectorReport ?? null,
  );
  const allIdeasAreReels =
    toProcess.length > 0 &&
    toProcess.every((idea) => String((idea as Record<string, unknown>).content_type ?? '').includes('reel'));
  const maxRunwayReelsPerMission = productionProfile.allowRunwayReels
    ? allIdeasAreReels
      ? Math.min(toProcess.length, 3)
      : resolveMaxRunwayReelsPerMission(brandTheme, pkgLimits.monthlyReels, {
          // Sprint 6 — Mission importance auto-promotion
          missionTitle,
          creativeBrief,
          strategistMissionType,
        })
    : resolveMaxRunwayReelsPerMission(brandTheme, pkgLimits.monthlyReels, {
        missionTitle,
        creativeBrief,
        strategistMissionType,
      });
  if (!allIdeasAreReels && maxRunwayReelsPerMission >= 2) {
    console.log(`[auto-produce] Mission importance detected — hero reel cap promoted to ${maxRunwayReelsPerMission}`);
  }

  if (!productionProfile.allowRunwayReels) {
    console.log(`[auto-produce] Runway disabled — package reel quota is 0 (${productionProfile.tier})`);
  }
  if (productionProfile.requireDesignedVisuals) {
    console.log(
      `[auto-produce] Production route: remotion+grafiker (Marky kapalı, grafiker_retries=${grafikerMaxRetries})`,
    );
  }
  if (feedDirectorReport || fdAssignments.length > 0) {
    const assignCount = (feedDirectorReport as Record<string, unknown>)?.production_assignments
      ? ((feedDirectorReport as Record<string, unknown>).production_assignments as unknown[]).length
      : fdAssignments.length;
    console.log(
      `[auto-produce] Production Stack: manifest=${manifestMissionType} ` +
      `feed_score=${(feedDirectorReport as Record<string, unknown>)?.feed_score ?? 'n/a'} ` +
      `profile=${productionProfile.tier} gis=${gisScore ?? 'n/a'} ` +
      `hero_reel=${stackCtx.heroReelIndex ?? 'n/a'} max_runway=${maxRunwayReelsPerMission} ` +
      `assignments=${assignCount} manifest_cov=${(feedDirectorReport as Record<string, unknown>)?.manifest_coverage_pct ?? fdPrepared.validation.coveragePct}% ` +
      `slot_fill=${fdPrepared.validation.filledRequired}/${fdPrepared.validation.requiredSlots} ` +
      `layouts=${String(((feedDirectorReport as Record<string, unknown>)?.recommended_layout_families as string[] | undefined)?.slice(0, 4).join(',') ?? '')}`,
    );
  }

  return {
    status: 'ready',
    plan: {
      toProcess,
      productionIdeas,
      maxIdeas,
      manifestMissionType,
      pkgLimits,
      gisScore,
      productionProfile,
      grafikerMaxRetries,
      fdPrepared,
      fdAssignments,
      manifestValidation: fdPrepared.validation,
      fdProductionGate: fdPrepared.gate,
      stackCtx,
      primaryIdeaIndices,
      maxRunwayReelsPerMission,
      hasOrganicReelAssignment,
      rejectedLayoutFamilies,
      headlineHistory,
      brandDynamics,
      pisScores: [],
      pisWarnings: [],
      enhanceTraces: [],
    },
  };
}

/** Re-export for queue builder consumers */
export type { ManifestProductionQueueItem };
