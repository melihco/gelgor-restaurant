import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const includeArchived = req.nextUrl.searchParams.get('include_archived');
  const templateType = req.nextUrl.searchParams.get('template_type');
  const query = new URLSearchParams();
  if (includeArchived) query.set('include_archived', includeArchived);
  if (templateType) query.set('template_type', templateType);
  const qs = query.toString() ? `?${query.toString()}` : '';
  return proxyToCrewBackend(`/api/v1/design-templates/${workspaceId}${qs}`, {
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
  return proxyToCrewBackend(`/api/v1/design-templates/${workspaceId}`, {
    method: 'POST',
    headers: { 'X-Tenant-Id': workspaceId },
    body,
    timeoutMs: 20_000,
  });
}
