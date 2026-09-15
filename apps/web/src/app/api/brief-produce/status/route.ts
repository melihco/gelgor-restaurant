/**
 * GET /api/brief-produce/status?jobId=
 *
 * Poll New Brief background job status (queued|running|complete|failed).
 * Tenant-scoped: X-Tenant-Id / workspace must match the stored job.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getBriefJobStatus, setBriefJobStatus, type BriefJobStatusState } from '@/lib/brief-job-status';
import { isTrustedInternalRequest } from '@/lib/tenant-production-guard';

export const runtime = 'nodejs';

/**
 * POST — internal only (BullMQ worker): mark a brief job failed when the web
 * app could not be reached to run it. Never exposed to the browser.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isTrustedInternalRequest(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  let body: { jobId?: string; status?: BriefJobStatusState; error?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const jobId = String(body.jobId ?? '').trim();
  if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 });
  const existing = await getBriefJobStatus(jobId);
  if (!existing) return NextResponse.json({ error: 'job_not_found' }, { status: 404 });
  // Only a transport failure may be recorded from outside; terminal success is the route's.
  if (body.status !== 'failed') {
    return NextResponse.json({ error: 'only status=failed accepted' }, { status: 400 });
  }
  if (existing.status === 'complete') {
    return NextResponse.json({ ok: true, jobId, status: existing.status, ignored: true });
  }
  const record = await setBriefJobStatus({
    ...existing,
    status: 'failed',
    error: String(body.error ?? 'production worker could not reach the web app').slice(0, 300),
  });
  return NextResponse.json({ ok: true, jobId, status: record.status });
}

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
    ...(record.title ? { title: record.title } : {}),
    ...(record.outputType ? { outputType: record.outputType } : {}),
    ...(record.expectedArtifacts ? { expectedArtifacts: record.expectedArtifacts } : {}),
    ...(record.revisionOf ? { revisionOf: record.revisionOf, revisionRound: record.revisionRound } : {}),
    ...(record.executor ? { executor: record.executor } : {}),
    updatedAt: record.updatedAt,
  });
}
