import { NextRequest, NextResponse } from 'next/server';
import { cleanupOldBuckets } from './budget';
import {
  acquireProductionLocksForRun,
  releaseAllProductionLocks,
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
import { type ParsedIdea } from './caption-publish-resolver';
import { runProduction, type RunProductionParams } from './production-loop';

export const runtime = 'nodejs';
// Vercel Pro max; locally unlimited. Runway gen4 ~90s + multiple images + stories.
export const maxDuration = 600;

interface AutoProduceRequest {
  workspaceId: string;
  missionId?: string;
  nodeKey?: string;
  ideas: ParsedIdea[];
  visualDesignCards?: MissionVisualDesignCard[];
  calendarPlans?: Record<string, unknown>[];
  galleryAnalysis?: Record<string, unknown>;
  brandName?: string;
  productionSnapshot?: ProductionBrandContextSnapshot | null;
  /** Persisted brand_theme from Python — ensures AI settings survive crew fetch failures. */
  brandTheme?: Record<string, unknown> | null;
  /**
   * Bundle mode: after the primary artifact, auto-generate
   * Remotion story MP4 + poster stills for each idea.
   * Defaults to true when called from task_graph_executor.
   */
  bundleCards?: boolean;
  /** Feed Art Director report — runs before production in task_graph_executor */
  feedDirectorReport?: FeedArtDirectorReport;
  /** Strategist mission.type (seasonal, opportunity, …) */
  missionType?: string;
  /** Mission Hub production package — weekly_content | campaign | event | ads_focus */
  productionPackage?: MissionProductionManifest['missionType'];
  missionTitle?: string;
  creativeBrief?: string;
  /** Operator force reproduce — skip Feed dedupe against existing mission artifacts. */
  skipArtifactDedupe?: boolean;
  /** Durable Production Factory — produce only specific manifest slots. */
  slotBackfillPass?: boolean;
  /** Slot keys `${ideaIndex}:${slot_role}` to produce on a backfill pass. */
  backfillSlotKeys?: string[];
  /** Factory plan-phase gallery picks keyed by `${ideaIndex}::${slot_role}`. */
  gallerySlotAssignments?: Record<string, { url: string; score?: number | null }>;
  /** New Brief form — fal.ai art-director pipelines. */
  adHocBrief?: boolean;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  cleanupOldBuckets();

  let body: AutoProduceRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

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
    adHocBrief,
  } = body;
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }

  const tenantGuard = assertWorkspaceMatchesRequestTenant(req, workspaceId);
  if (tenantGuard) return tenantGuard;

  const qualityGuard = await assertAutonomousProductionAllowed(req, workspaceId);
  if (qualityGuard) return qualityGuard;

  // Operator force reproduce — clear stale in-process locks before retrying.
  if (skipArtifactDedupe) {
    await releaseAllProductionLocks(workspaceId, missionId);
  }

  // Per-workspace concurrent production lock (one brand at a time).
  // Internal factory callers may recover orphaned locks once after a 409 storm.
  const internalCaller = isTrustedInternalRequest(req);
  const locks = await acquireProductionLocksForRun(workspaceId, missionId, {
    recoverStale: internalCaller || skipArtifactDedupe === true,
  });
  if (!locks.workspace) {
    return NextResponse.json(
      { error: 'Bu marka için içerik üretimi zaten devam ediyor. Lütfen bekleyin.', code: 'production_in_progress' },
      { status: 409 },
    );
  }

  if (missionId && !locks.mission) {
    await releaseAllProductionLocks(workspaceId, missionId);
    return NextResponse.json(
      { error: 'Bu misyon için Feed üretimi zaten devam ediyor.', code: 'mission_production_in_progress', produced: 0 },
      { status: 409 },
    );
  }

  if (missionId) {
    const missionGuard = await assertMissionBelongsToWorkspace(workspaceId, missionId, {
      req,
      skipForInternal: true,
    });
    if (missionGuard) {
      await releaseAllProductionLocks(workspaceId, missionId);
      return missionGuard;
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
      return NextResponse.json({ error: 'No ideas provided' }, { status: 400 });
    }

    // Stamp brand catalog slots when available; weekly geometry pad only for
    // pure ideation weekly packages (never trim content-scoped additive pools).
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
      adHocBrief: adHocBrief === true,
    });
    // #region agent log
    try {
      const summary = await response.clone().json().catch(() => null) as Record<string, unknown> | null;
      const results = Array.isArray(summary?.results) ? summary.results as Array<Record<string, unknown>> : [];
      fetch('http://127.0.0.1:7345/ingest/99ae7570-1dee-4324-9824-f9c7b3143cc0', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'c5a590' },
        body: JSON.stringify({
          sessionId: 'c5a590',
          hypothesisId: 'H2',
          location: 'auto-produce/route.ts:POST',
          message: 'auto-produce response',
          data: {
            missionId,
            status: response.status,
            produced: summary?.produced,
            withheld: summary?.withheld,
            rendering: summary?.rendering,
            publishReady: summary?.publishReady,
            slotKeys: results.map((r) => r.slotKey).filter(Boolean),
            errors: results.filter((r) => r.error).map((r) => ({ slotKey: r.slotKey, error: String(r.error).slice(0, 120) })),
          },
          timestamp: Date.now(),
          runId: 'pre-fix',
        }),
      }).catch(() => {});
    } catch { /* noop */ }
    // #endregion
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Auto-produce failed';
    console.error('[auto-produce] Unhandled error:', message);
    return NextResponse.json({ error: message, code: 'auto_produce_internal_error' }, { status: 500 });
  } finally {
    // Always release — even if runProduction throws or times out
    await releaseAllProductionLocks(workspaceId, missionId);
  }
}
