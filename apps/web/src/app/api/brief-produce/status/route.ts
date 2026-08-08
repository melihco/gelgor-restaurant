/**
 * GET /api/brief-produce/status?jobId=
 *
 * Poll New Brief background job status (queued|running|complete|failed).
 * Tenant-scoped: X-Tenant-Id / workspace must match the stored job.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getBriefJobStatus } from '@/lib/brief-job-status';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const jobId = String(req.nextUrl.searchParams.get('jobId') ?? '').trim();
  if (!jobId) {
    return NextResponse.json({ error: 'jobId required' }, { status: 400 });
  }

  const record = await getBriefJobStatus(jobId);
  if (!record) {
    return NextResponse.json({ error: 'job_not_found', ok: false }, { status: 404 });
  }

  const tenantId = String(
    req.headers.get('X-Tenant-Id')
    ?? req.nextUrl.searchParams.get('workspaceId')
    ?? '',
  ).trim();
  if (tenantId && record.workspaceId && tenantId !== record.workspaceId) {
    return NextResponse.json({ error: 'forbidden', ok: false }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    jobId: record.jobId,
    workspaceId: record.workspaceId,
    status: record.status,
    produced: record.produced,
    ...(record.error ? { error: record.error } : {}),
    ...(record.catalogSlotKeys?.length ? { catalogSlotKeys: record.catalogSlotKeys } : {}),
    updatedAt: record.updatedAt,
  });
}
