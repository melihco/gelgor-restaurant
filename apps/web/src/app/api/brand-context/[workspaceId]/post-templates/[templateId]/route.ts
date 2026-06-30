import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; templateId: string }> },
) {
  const { workspaceId, templateId } = await params;
  const body = await req.json().catch(() => ({}));
  return proxyToCrewBackend(`/api/v1/brand-context/${workspaceId}/post-templates/${templateId}`, {
    method: 'PATCH',
    headers: { 'X-Tenant-Id': workspaceId },
    body,
    timeoutMs: 20_000,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; templateId: string }> },
) {
  const { workspaceId, templateId } = await params;
  return proxyToCrewBackend(`/api/v1/brand-context/${workspaceId}/post-templates/${templateId}`, {
    method: 'DELETE',
    headers: { 'X-Tenant-Id': workspaceId },
    timeoutMs: 20_000,
  });
}
