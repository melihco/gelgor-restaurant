/**
 * Mission slot completion pass — post→story adapt + calendar→empty-slot backfill.
 *
 * Factory drain produces slots one-by-one (slotBackfillPass) and skips the
 * completion logic at the end of a full runProduction. Call this when the
 * factory queue is idle but manifest slots are still missing artifacts.
 */
import { NextRequest, NextResponse } from 'next/server';
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
import { mergeCalendarPlansForProduction } from '@/lib/mission-production-plan';
import type { FeedArtDirectorReport } from '@/lib/weekly-publish-package';
import type { MissionProductionManifest } from '@/lib/mission-production-manifest';
import type { MissionVisualDesignCard } from '@/lib/mission-visual-design-cards';
import type { ProductionBrandContextSnapshot } from '@smartagency/contracts';
import { runProduction } from '../production-loop';
import type { ParsedIdea } from '../caption-publish-resolver';

export const runtime = 'nodejs';
export const maxDuration = 600;

interface CompletionPassRequest {
  workspaceId: string;
  missionId: string;
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
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: CompletionPassRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { workspaceId, missionId } = body;
  if (!workspaceId || !missionId) {
    return NextResponse.json({ error: 'workspaceId and missionId required' }, { status: 400 });
  }

  const tenantGuard = assertWorkspaceMatchesRequestTenant(req, workspaceId);
  if (tenantGuard) return tenantGuard;

  const qualityGuard = await assertAutonomousProductionAllowed(req, workspaceId);
  if (qualityGuard) return qualityGuard;

  const lockAcquired = await acquireProductionLock(workspaceId);
  if (!lockAcquired) {
    return NextResponse.json(
      { error: 'Production in progress', code: 'production_in_progress' },
      { status: 409 },
    );
  }

  if (!(await acquireMissionProductionLock(missionId))) {
    await releaseProductionLock(workspaceId);
    return NextResponse.json(
      { error: 'Mission production in progress', code: 'mission_production_in_progress' },
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

  try {
    const calendarPlans = body.calendarPlans?.length
      ? body.calendarPlans
      : [];
    const ideas = (body.ideas ?? []).map((idea, index) => ({
      ...idea,
      idea_index: typeof idea.idea_index === 'number' ? idea.idea_index : index,
    })) as ParsedIdea[];

    const productionIdeas = calendarPlans.length > 0 && ideas.length
      ? mergeCalendarPlansForProduction(
        ideas as Record<string, unknown>[],
        calendarPlans,
      ) as ParsedIdea[]
      : ideas;

    if (!productionIdeas.length) {
      return NextResponse.json({ error: 'No ideas provided' }, { status: 400 });
    }

    console.log(
      `[auto-produce] Completion pass start mission=${missionId.slice(0, 8)} `
      + `ideas=${productionIdeas.length} calendar=${calendarPlans.length}`,
    );

    return await runProduction({
      workspaceId,
      missionId,
      nodeKey: body.nodeKey,
      ideas: productionIdeas,
      visualDesignCards: body.visualDesignCards ?? [],
      galleryAnalysis: body.galleryAnalysis ?? null,
      brandNameOverride: body.brandName ?? null,
      productionSnapshot: body.productionSnapshot ?? null,
      brandThemeOverride: body.brandTheme ?? null,
      bundleCards: body.bundleCards,
      feedDirectorReport: (body.feedDirectorReport ?? null) as Record<string, unknown> | null,
      strategistMissionType: body.missionType ?? null,
      productionPackage: body.productionPackage ?? null,
      missionTitle: body.missionTitle ?? null,
      creativeBrief: body.creativeBrief ?? null,
      calendarPlans: calendarPlans.length > 0 ? calendarPlans : undefined,
      completionPassOnly: true,
    });
  } finally {
    await releaseAllProductionLocks(workspaceId, missionId);
  }
}
