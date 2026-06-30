/**
 * Durable Production Factory — slot planning endpoint (no rendering).
 *
 * Returns the manifest slot descriptors for a mission so the Python factory can
 * upsert one durable `production_jobs` row per slot, then drain them individually
 * via `POST /api/auto-produce { slotBackfillPass, backfillSlotKeys }`.
 *
 * This re-uses the exact same idea-prep + plan phase + queue builder as the full
 * production path, so the planned slot set is identical to what production produces.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getNextjsInternalOrigin } from '@/lib/runtime-config';
import { assertWorkspaceMatchesRequestTenant } from '@/lib/tenant-production-guard';
import {
  mergeCalendarPlansForProduction,
  ensureWeeklyFormatCoverage,
} from '@/lib/mission-production-plan';
import { fetchProductionContext } from '../production-context';
import { runAutoProducePlanPhase } from '@/lib/auto-produce/plan-phase';
import { buildAutoProduceProductionQueue } from '@/lib/auto-produce/build-production-queue';
import type { ProductionSlotRole } from '@/lib/mission-production-manifest';

export const runtime = 'nodejs';
export const maxDuration = 120;

type SlotFormat = 'post' | 'story' | 'reel' | 'carousel';

function formatForSlotRole(role: ProductionSlotRole): SlotFormat {
  switch (role) {
    case 'organic_carousel':
      return 'carousel';
    case 'organic_story_still':
    case 'campaign_story_motion':
    case 'paid_ad_creative':
    case 'paid_ad_google_creative':
      return 'story';
    case 'organic_reel':
    case 'campaign_reel_motion':
      return 'reel';
    case 'organic_post':
    case 'designed_post':
    default:
      return 'post';
  }
}

interface PlanRequest {
  workspaceId: string;
  missionId?: string;
  nodeKey?: string;
  ideas?: Record<string, unknown>[];
  calendarPlans?: Record<string, unknown>[];
  feedDirectorReport?: Record<string, unknown> | null;
  productionPackage?: string | null;
  missionType?: string | null;
  missionTitle?: string | null;
  creativeBrief?: string | null;
  brandTheme?: Record<string, unknown> | null;
  brandName?: string | null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: PlanRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    workspaceId,
    missionId,
    nodeKey,
    ideas = [],
    calendarPlans = [],
    feedDirectorReport = null,
    productionPackage = null,
    missionType = null,
    missionTitle = null,
    creativeBrief = null,
    brandTheme = null,
    brandName = null,
  } = body;

  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }
  if (!missionId) {
    return NextResponse.json({ error: 'missionId required for slot planning' }, { status: 400 });
  }

  const tenantGuard = assertWorkspaceMatchesRequestTenant(req, workspaceId);
  if (tenantGuard) return tenantGuard;

  try {
    // ── Mirror route.ts idea prep so the planned slots match production ──────
    const alreadyScheduleOverlay = Array.isArray(ideas)
      && ideas.some((row) => (row as Record<string, unknown>).publish_schedule_day != null);
    let mergedIdeas: Record<string, unknown>[] = calendarPlans.length > 0 && ideas.length && !alreadyScheduleOverlay
      ? mergeCalendarPlansForProduction(ideas, calendarPlans)
      : ideas.map((idea, index) => ({
        ...idea,
        idea_index: typeof idea.idea_index === 'number' ? idea.idea_index : index,
        source_node: String(idea.source_node ?? 'content_ideation'),
      }));

    if (!mergedIdeas?.length) {
      return NextResponse.json({ error: 'No ideas provided' }, { status: 400 });
    }

    if (calendarPlans.length === 0 || alreadyScheduleOverlay || !ideas.length) {
      mergedIdeas = ensureWeeklyFormatCoverage(
        mergedIdeas,
        mergedIdeas,
      ) as Record<string, unknown>[];
    }

    // ── Brand context (sector + theme drive queue routing) ───────────────────
    const pctx = await fetchProductionContext(workspaceId, {
      brandName: brandName ?? undefined,
      creativeBrief: creativeBrief ?? undefined,
      baseUrl: getNextjsInternalOrigin(),
      productionSnapshot: null,
      brandThemeOverride: (brandTheme ?? undefined) as Record<string, unknown> | undefined,
    });
    if (!pctx) {
      return NextResponse.json({ error: 'Production context unavailable' }, { status: 500 });
    }

    const planOutcome = await runAutoProducePlanPhase({
      workspaceId,
      missionId,
      ideas: mergedIdeas as import('@/lib/auto-produce/plan-phase').ParsedIdeaLike[],
      feedDirectorReport,
      productionPackage,
      strategistMissionType: missionType,
      missionTitle,
      creativeBrief,
      brandBusinessType: pctx.brandBusinessType,
      brandTheme: pctx.brandTheme,
    });

    if (planOutcome.status === 'blocked') {
      return NextResponse.json(
        { error: 'plan_blocked', detail: planOutcome.body, slots: [] },
        { status: planOutcome.httpStatus },
      );
    }

    const { toProcess, maxIdeas, manifestMissionType, pkgLimits, productionProfile } = planOutcome.plan;

    const manifestQueue = buildAutoProduceProductionQueue({
      missionId,
      toProcess: toProcess as Record<string, unknown>[],
      feedDirectorReport,
      manifestMissionType,
      brandBusinessType: pctx.brandBusinessType,
      maxIdeas,
      productionProfile,
      packageSlug: pkgLimits.packageSlug,
    });

    const slots = manifestQueue.map((item) => {
      const role = item.assignment.slot_role;
      return {
        ideaIndex: item.ideaIndex,
        slotRole: role,
        format: formatForSlotRole(role),
        pipeline: item.assignment.pipeline,
        librarySlotKey: item.assignment.library_slot_key ?? null,
        backfillSlotKey: `${item.ideaIndex}:${role}`,
        sourceTrack: 'ideation',
      };
    });

    return NextResponse.json({
      workspaceId,
      missionId,
      nodeKey: nodeKey ?? null,
      manifestMissionType,
      packageSlug: pkgLimits.packageSlug,
      slotCount: slots.length,
      slots,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'plan failed';
    console.error('[auto-produce/plan] error:', message);
    return NextResponse.json({ error: message, code: 'plan_internal_error', slots: [] }, { status: 500 });
  }
}
