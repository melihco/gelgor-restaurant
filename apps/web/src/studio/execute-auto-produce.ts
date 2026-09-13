import { NextResponse } from 'next/server';
import { cleanupOldBuckets } from '@/app/api/auto-produce/budget';
import {
  acquireProductionLocksForRun,
  releaseAllProductionLocks,
  resolveProductionLockLane,
} from '@/lib/production-in-process-lock';
import {
  assertAutonomousProductionAllowed,
  assertMissionBelongsToWorkspace,
  assertWorkspaceMatchesRequestTenant,
  isTrustedInternalRequest,
} from '@/lib/tenant-production-guard';
import {
  mergeCalendarPlansForProduction,
  ensureWeeklyFormatCoverage,
  isContentScopedProductionPool,
} from '@/lib/mission-production-plan';
import {
  loadBrandActiveSlotSet,
  resolveBrandProductionFormatTargets,
  stampIdeasWithBrandCatalogSlots,
} from '@/lib/brand-active-slot-resolver';
import { readBrandSlotFacilitiesFromTheme } from '@/lib/sector-slot-pack';
import { normalizeSectorId } from '@/lib/sector-production-profile';
import type { FeedArtDirectorReport } from '@/lib/weekly-publish-package';
import type { MissionProductionManifest } from '@/lib/mission-production-manifest';
import type { MissionVisualDesignCard } from '@/lib/mission-visual-design-cards';
import type { ProductionBrandContextSnapshot } from '@smartagency/contracts';
import { type ParsedIdea } from '@/app/api/auto-produce/caption-publish-resolver';
import { runProduction } from '@/app/api/auto-produce/production-loop';

export interface AutoProduceRequestBody {
  workspaceId: string;
  missionId?: string;
  nodeKey?: string;
  ideas: ParsedIdea[];
  visualDesignCards?: MissionVisualDesignCard[];
  calendarPlans?: Record<string, unknown>[];
  galleryAnalysis?: Record<string, unknown>;
  brandName?: string;
  productionSnapshot?: ProductionBrandContextSnapshot | null;
  brandTheme?: Record<string, unknown> | null;
  bundleCards?: boolean;
  feedDirectorReport?: FeedArtDirectorReport;
  missionType?: string;
  productionPackage?: MissionProductionManifest['missionType'];
  missionTitle?: string;
  creativeBrief?: string;
  skipArtifactDedupe?: boolean;
  slotBackfillPass?: boolean;
  backfillSlotKeys?: string[];
  gallerySlotAssignments?: Record<string, { url: string; score?: number | null }>;
  catalogSlotBindings?: Record<string, string>;
  adHocBrief?: boolean;
}

export type AutoProduceExecuteResult = {
  status: number;
  body: Record<string, unknown>;
};

/**
 * In-process auto-produce. Route and studio worker share this — no HTTP hop.
 */
export async function executeAutoProduce(
  body: AutoProduceRequestBody,
  req?: import('next/server').NextRequest | null,
  opts?: { trustedInternal?: boolean },
): Promise<AutoProduceExecuteResult> {
  cleanupOldBuckets();

  const {
    workspaceId,
    missionId,
    nodeKey,
    ideas,
    visualDesignCards,
    calendarPlans = [],
    galleryAnalysis,
    brandName,
    productionSnapshot,
    brandTheme,
    bundleCards,
    feedDirectorReport,
    missionType: strategistMissionType,
    productionPackage,
    missionTitle,
    creativeBrief,
    skipArtifactDedupe,
    slotBackfillPass,
    backfillSlotKeys,
    gallerySlotAssignments,
    catalogSlotBindings,
    adHocBrief,
  } = body;

  if (!workspaceId) {
    return { status: 400, body: { error: 'workspaceId required' } };
  }

  if (req) {
    const tenantGuard = assertWorkspaceMatchesRequestTenant(req, workspaceId);
    if (tenantGuard) return responseToResult(tenantGuard);
    const qualityGuard = await assertAutonomousProductionAllowed(req, workspaceId);
    if (qualityGuard) return responseToResult(qualityGuard);
  }

  const lockLane = resolveProductionLockLane({
    backfillSlotKeys: Array.isArray(backfillSlotKeys) ? backfillSlotKeys : null,
    catalogSlotBindings: catalogSlotBindings ?? null,
  });

  if (skipArtifactDedupe) {
    await releaseAllProductionLocks(workspaceId, missionId, lockLane);
  }

  const internalCaller = Boolean(opts?.trustedInternal || (req && isTrustedInternalRequest(req)));
  const locks = await acquireProductionLocksForRun(workspaceId, missionId, {
    recoverStale: internalCaller || skipArtifactDedupe === true,
    lane: lockLane,
  });
  if (!locks.workspace) {
    return {
      status: 409,
      body: {
        error: 'Bu marka için içerik üretimi zaten devam ediyor. Lütfen bekleyin.',
        code: 'production_in_progress',
      },
    };
  }

  if (missionId && !locks.mission) {
    await releaseAllProductionLocks(workspaceId, missionId, lockLane);
    return {
      status: 409,
      body: {
        error: 'Bu misyon için Feed üretimi zaten devam ediyor.',
        code: 'mission_production_in_progress',
        produced: 0,
      },
    };
  }

  if (missionId && req) {
    const missionGuard = await assertMissionBelongsToWorkspace(workspaceId, missionId, {
      req,
      skipForInternal: true,
    });
    if (missionGuard) {
      await releaseAllProductionLocks(workspaceId, missionId, lockLane);
      return responseToResult(missionGuard);
    }
  }

  try {
    const alreadyScheduleOverlay = Array.isArray(ideas)
      && ideas.some((row) => (row as Record<string, unknown>).publish_schedule_day != null);
    let productionIdeas: ParsedIdea[] = calendarPlans.length > 0 && ideas?.length && !alreadyScheduleOverlay
      ? mergeCalendarPlansForProduction(
        ideas as Record<string, unknown>[],
        calendarPlans,
      ) as ParsedIdea[]
      : ((ideas as ParsedIdea[] | undefined)?.map((idea, index) => ({
        ...idea,
        idea_index: typeof idea.idea_index === 'number' ? idea.idea_index : index,
        source_node: String(idea.source_node ?? 'content_ideation'),
      })) ?? []);

    if (!productionIdeas?.length) {
      return { status: 400, body: { error: 'No ideas provided' } };
    }

    if (missionId) {
      const sector = normalizeSectorId(
        String(productionSnapshot?.brand?.businessType ?? ''),
      );
      let brandFormatTargets = null;
      let brandActiveSlots = null as Awaited<ReturnType<typeof loadBrandActiveSlotSet>> | null;
      if (sector) {
        try {
          brandActiveSlots = await loadBrandActiveSlotSet(
            workspaceId,
            sector,
            undefined,
            readBrandSlotFacilitiesFromTheme(brandTheme ?? null),
          );
          brandFormatTargets = resolveBrandProductionFormatTargets(
            brandActiveSlots,
            productionPackage ?? undefined,
          );
          productionIdeas = stampIdeasWithBrandCatalogSlots(
            productionIdeas as Record<string, unknown>[],
            brandActiveSlots,
          ) as ParsedIdea[];
        } catch {
          /* catalog unavailable — legacy package geometry */
        }
      }
      if (
        !isContentScopedProductionPool(productionIdeas as Record<string, unknown>[])
        && (calendarPlans.length === 0 || !ideas?.length)
      ) {
        productionIdeas = ensureWeeklyFormatCoverage(
          productionIdeas as Record<string, unknown>[],
          productionIdeas as Record<string, unknown>[],
          productionPackage ?? undefined,
          brandFormatTargets,
        ) as ParsedIdea[];
      }
    }

    const response = await runProduction({
      workspaceId, missionId, nodeKey, ideas: productionIdeas,
      visualDesignCards: visualDesignCards ?? [],
      galleryAnalysis: galleryAnalysis ?? null,
      brandNameOverride: brandName ?? null,
      productionSnapshot: productionSnapshot ?? null,
      brandThemeOverride: brandTheme ?? null,
      bundleCards,
      feedDirectorReport: (feedDirectorReport ?? null) as Record<string, unknown> | null,
      strategistMissionType: strategistMissionType ?? null,
      productionPackage: productionPackage ?? null,
      missionTitle: missionTitle ?? null,
      creativeBrief: creativeBrief ?? null,
      skipArtifactDedupe: skipArtifactDedupe === true,
      slotBackfillPass: slotBackfillPass === true,
      backfillSlotKeys: Array.isArray(backfillSlotKeys) ? backfillSlotKeys : undefined,
      calendarPlans: calendarPlans.length > 0 ? calendarPlans : undefined,
      gallerySlotAssignments: gallerySlotAssignments ?? undefined,
      catalogSlotBindings: catalogSlotBindings ?? undefined,
      adHocBrief: adHocBrief === true,
    });
    return responseToResult(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Auto-produce failed';
    console.error('[studio] Unhandled error:', message);
    return { status: 500, body: { error: message, code: 'auto_produce_internal_error' } };
  } finally {
    await releaseAllProductionLocks(workspaceId, missionId, lockLane);
  }
}

async function responseToResult(response: NextResponse): Promise<AutoProduceExecuteResult> {
  const status = response.status;
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status, body };
}
