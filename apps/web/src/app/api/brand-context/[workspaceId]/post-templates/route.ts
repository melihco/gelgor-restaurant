import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const includeArchived = req.nextUrl.searchParams.get('include_archived');
  const query = includeArchived ? `?include_archived=${encodeURIComponent(includeArchived)}` : '';
  return proxyToCrewBackend(`/api/v1/brand-context/${workspaceId}/post-templates${query}`, {
    method: 'GET',
    headers: { 'X-Tenant-Id': workspaceId },
    timeoutMs: 15_000,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const body = await req.json().catch(() => ({}));
  return proxyToCrewBackend(`/api/v1/brand-context/${workspaceId}/post-templates`, {
    method: 'POST',
    headers: { 'X-Tenant-Id': workspaceId },
    body,
    timeoutMs: 20_000,
  });
}
