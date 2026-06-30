import { NextRequest, NextResponse } from 'next/server';
import { cleanupOldBuckets } from './budget';
import {
  acquireMissionProductionLock,
  acquireProductionLock,
  releaseAllProductionLocks,
  releaseProductionLock,
} from '@/lib/production-in-process-lock';
import {
  assertAutonomousProductionAllowed,
  assertMissionBelongsToWorkspace,
  assertWorkspaceMatchesRequestTenant,
} from '@/lib/tenant-production-guard';
import {
  mergeCalendarPlansForProduction,
  ensureWeeklyFormatCoverage,
} from '@/lib/mission-production-plan';
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

  // Per-workspace concurrent production lock.
  // Two simultaneous auto-produce calls for the same brand would pick the same
  // gallery photos and templates → duplicate artifacts in the feed.
  const lockAcquired = await acquireProductionLock(workspaceId);
  if (!lockAcquired) {
    // #region agent log
    fetch('http://127.0.0.1:7345/ingest/99ae7570-1dee-4324-9824-f9c7b3143cc0', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'c5a590' }, body: JSON.stringify({ sessionId: 'c5a590', hypothesisId: 'H1', location: 'auto-produce/route.ts:409-workspace', message: 'workspace production lock denied', data: { workspaceId, missionId: missionId ?? null }, timestamp: Date.now(), runId: 'pre-fix' }) }).catch(() => {});
    // #endregion
    return NextResponse.json(
      { error: 'Bu marka için içerik üretimi zaten devam ediyor. Lütfen bekleyin.', code: 'production_in_progress' },
      { status: 409 },
    );
  }

  if (missionId) {
    if (!(await acquireMissionProductionLock(missionId))) {
      await releaseProductionLock(workspaceId);
      // #region agent log
      fetch('http://127.0.0.1:7345/ingest/99ae7570-1dee-4324-9824-f9c7b3143cc0', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'c5a590' }, body: JSON.stringify({ sessionId: 'c5a590', hypothesisId: 'H1', location: 'auto-produce/route.ts:409-mission', message: 'mission production lock denied', data: { workspaceId, missionId }, timestamp: Date.now(), runId: 'pre-fix' }) }).catch(() => {});
      // #endregion
      return NextResponse.json(
        { error: 'Bu misyon için Feed üretimi zaten devam ediyor.', code: 'mission_production_in_progress', produced: 0 },
        { status: 409 },
      );
    }
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

    // Mission Feed: format coverage when calendar merge was not applied above.
    if (missionId && (calendarPlans.length === 0 || alreadyScheduleOverlay || !ideas?.length)) {
      productionIdeas = ensureWeeklyFormatCoverage(
        productionIdeas as Record<string, unknown>[],
        productionIdeas as Record<string, unknown>[],
      ) as ParsedIdea[];
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
