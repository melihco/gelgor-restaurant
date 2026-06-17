/**
 * Synchronous Feed reproduction — runs auto-produce inline (up to ~10 min).
 * Replaces fire-and-forget Python task so Mission Hub gets a real produced count.
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import {
  assertPathTenantMatchesRequest,
} from '@/lib/tenant-production-guard';
import type { MissionProductionManifest } from '@/lib/mission-production-manifest';
import {
  parseHubProductionPackage,
} from '@/lib/mission-production-prefs';
import {
  fetchGisScoreForWorkspace,
  resolveProductionProfile,
} from '@/lib/production-profile';
import { fetchPackageLimits } from '@/app/api/auto-produce/budget';
import { releaseAllProductionLocks } from '@/lib/production-in-process-lock';

function parseProductionPackage(
  raw: unknown,
): MissionProductionManifest['missionType'] | undefined {
  return parseHubProductionPackage(raw) ?? undefined;
}

export const runtime = 'nodejs';
export const maxDuration = 600;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; missionId: string }> },
) {
  const { workspaceId, missionId } = await params;
  const tenantGuard = assertPathTenantMatchesRequest(req, workspaceId);
  if (tenantGuard) return tenantGuard;

  let requestBody: { productionPackage?: string; force?: boolean } = {};
  try {
    requestBody = (await req.json()) as { productionPackage?: string; force?: boolean };
  } catch {
    /* PUT/empty body */
  }

  const force = req.nextUrl.searchParams.get('force') === '1'
    || req.nextUrl.searchParams.get('force') === 'true'
    || requestBody.force === true;

  if (force) {
    releaseAllProductionLocks(workspaceId, missionId);
  }

  const productionPackage =
    parseProductionPackage(requestBody.productionPackage)
    ?? 'weekly_content';

  const pkgLimits = await fetchPackageLimits(workspaceId);
  const gisScore = await fetchGisScoreForWorkspace(workspaceId, req.nextUrl.origin);
  const productionProfile = resolveProductionProfile({
    packageSlug: pkgLimits.packageSlug,
    gisScore,
    monthlyReels: pkgLimits.monthlyReels,
  });
  const upstream = await fetchCrewBackendJson<Record<string, unknown>>(
    `/api/v1/missions/${workspaceId}/${missionId}/reproduce-feed`,
    {
      method: 'PUT',
      workspaceId,
      timeoutMs: 580_000,
      body: {
        production_package: productionPackage,
        production_profile_tier: productionProfile.tier,
        force,
      },
    },
  );

  if (!upstream.ok) {
    const data = (upstream.data ?? {}) as Record<string, unknown>;
    return NextResponse.json(
      {
        error: String(data.error ?? data.detail ?? upstream.error ?? 'Feed üretimi başarısız'),
        code: data.code,
        produced: Number(data.produced ?? 0),
        pis: data.pis,
      },
      { status: upstream.status >= 400 ? upstream.status : 502 },
    );
  }

  const body = (upstream.data ?? {}) as Record<string, unknown>;
  const produced = Number(body.produced ?? 0);
  const publishReady = Number(body.publishReady ?? 0);
  const rendering = Number(body.rendering ?? 0);
  if (produced <= 0 && publishReady <= 0 && rendering <= 0) {
    return NextResponse.json(
      {
        error: String(
          body.error
          ?? body.message
          ?? 'Üretim tamamlandı ancak Feed\'e kaydedilen içerik yok.',
        ),
        produced,
        publishReady,
        rendering,
        total: Number(body.total ?? 0),
        results: body.results,
        pis: body.pis,
      },
      { status: 422 },
    );
  }

  if (produced <= 0 && (publishReady > 0 || rendering > 0)) {
    return NextResponse.json({
      ...body,
      message: String(
        body.message
        ?? `${rendering + publishReady} içerik render ediliyor — Feed'e kısa sürede düşecek.`,
      ),
    });
  }

  return NextResponse.json(body);
}

/** Legacy mobile client uses PUT — delegate here. */
export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ workspaceId: string; missionId: string }> },
) {
  return POST(req, ctx);
}
