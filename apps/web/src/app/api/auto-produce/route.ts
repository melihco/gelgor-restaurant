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
  ensureWeeklyFormatCoverage,
  mergeIdeationWithCalendarPlans,
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
    releaseAllProductionLocks(workspaceId, missionId);
  }

  // Per-workspace concurrent production lock.
  // Two simultaneous auto-produce calls for the same brand would pick the same
  // gallery photos and templates → duplicate artifacts in the feed.
  const lockAcquired = acquireProductionLock(workspaceId);
  if (!lockAcquired) {
    return NextResponse.json(
      { error: 'Bu marka için içerik üretimi zaten devam ediyor. Lütfen bekleyin.', code: 'production_in_progress' },
      { status: 409 },
    );
  }

  if (missionId) {
    if (!acquireMissionProductionLock(missionId)) {
      releaseProductionLock(workspaceId);
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
      releaseAllProductionLocks(workspaceId, missionId);
      return missionGuard;
    }
  }

  try {
    const alreadyCalendarMerged = Array.isArray(ideas)
      && ideas.some((row) => String((row as Record<string, unknown>).source_node ?? '') === 'content_calendar');
    let mergedIdeas: ParsedIdea[] | undefined = calendarPlans.length > 0 && ideas?.length && !alreadyCalendarMerged
      ? mergeIdeationWithCalendarPlans(
        ideas as Record<string, unknown>[],
        calendarPlans,
      ) as ParsedIdea[]
      : (ideas as ParsedIdea[] | undefined);

    if (!mergedIdeas?.length) {
      return NextResponse.json({ error: 'No ideas provided' }, { status: 400 });
    }

    // Mission Feed: reproduce-feed ile aynı 2S+2P+1R normalizasyonu (Python path dahil).
    if (missionId) {
      const ideaPool = [
        ...(Array.isArray(ideas) ? ideas as Record<string, unknown>[] : []),
        ...calendarPlans,
      ];
      mergedIdeas = ensureWeeklyFormatCoverage(
        mergedIdeas as Record<string, unknown>[],
        ideaPool.length > 0 ? ideaPool : mergedIdeas as Record<string, unknown>[],
      ) as ParsedIdea[];
    }

    const response = await runProduction({
      workspaceId, missionId, nodeKey, ideas: mergedIdeas,
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
    });
    // #region agent log
    try {
      const summary = await response.clone().json().catch(() => null) as Record<string, unknown> | null;
      fetch('http://127.0.0.1:7345/ingest/99ae7570-1dee-4324-9824-f9c7b3143cc0', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '343d1c' },
        body: JSON.stringify({
          sessionId: '343d1c',
          hypothesisId: 'H5',
          location: 'auto-produce/route.ts:POST',
          message: 'auto-produce response',
          data: {
            missionId,
            status: response.status,
            produced: summary?.produced,
            withheld: summary?.withheld,
            rendering: summary?.rendering,
            publishReady: summary?.publishReady,
            error: summary?.error,
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
    releaseAllProductionLocks(workspaceId, missionId);
  }
}
