/**
 * GET /api/tenant-learning/{workspaceId}
 * Tenant approval/rejection learning prompt for production (MT-10).
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const res = await fetchCrewBackendJson<{
    prompt?: string;
    has_learning?: boolean;
    approved_count?: number;
    rejected_count?: number;
  }>(`/api/v1/brand-context/${workspaceId}/tenant-learning`, {
    workspaceId,
    timeoutMs: 10_000,
  });

  if (!res.ok) {
    return NextResponse.json(
      { prompt: '', has_learning: false, approved_count: 0, rejected_count: 0 },
      { status: res.status === 404 ? 404 : 200 },
    );
  }

  return NextResponse.json(res.data ?? { prompt: '', has_learning: false });
}
