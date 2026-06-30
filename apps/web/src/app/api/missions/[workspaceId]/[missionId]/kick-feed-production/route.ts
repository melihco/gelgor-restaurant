import { NextRequest, NextResponse } from 'next/server';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import { assertPathTenantMatchesRequest } from '@/lib/tenant-production-guard';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; missionId: string }> },
) {
  const { workspaceId, missionId } = await params;
  const tenantGuard = assertPathTenantMatchesRequest(req, workspaceId);
  if (tenantGuard) return tenantGuard;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    /* empty body */
  }

  const upstream = await fetchCrewBackendJson<Record<string, unknown>>(
    `/api/v1/missions/${workspaceId}/${missionId}/kick-feed-production`,
    {
      method: 'PUT',
      workspaceId,
      timeoutMs: 8_000,
      body,
    },
  );

  if (upstream.ok) {
    return NextResponse.json(upstream.data ?? {
      accepted: true,
      mission_id: missionId,
      message: "Feed üretimi arka planda başlatıldı. Gönderiler hazır oldukça Feed'e düşer.",
    }, { status: upstream.status === 202 ? 202 : 200 });
  }

  // The Python endpoint schedules production in the background. During local dev,
  // DB/compile pressure can make this acknowledgement slower than the UI can wait.
  if (upstream.status === 503 && String(upstream.error ?? '').toLowerCase().includes('time')) {
    return NextResponse.json({
      accepted: true,
      mission_id: missionId,
      message: "Feed üretimi arka planda devam ediyor. Gönderiler hazır oldukça Feed'e düşer.",
    }, { status: 202 });
  }

  return NextResponse.json(
    {
      error: String(
        (upstream.data as { detail?: unknown; error?: unknown } | null)?.detail
        ?? (upstream.data as { error?: unknown } | null)?.error
        ?? upstream.error
        ?? 'Feed üretimi başlatılamadı.',
      ),
      detail: upstream.data,
    },
    { status: upstream.status >= 400 ? upstream.status : 502 },
  );
}
