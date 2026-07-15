import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';
import { invalidateDesignTemplateCache } from '@/lib/brand-design-template-matcher';

export const runtime = 'nodejs';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; templateId: string }> },
) {
  const { workspaceId, templateId } = await params;
  const body = await req.json().catch(() => ({}));
  invalidateDesignTemplateCache(workspaceId);
  return proxyToCrewBackend(`/api/v1/design-templates/${workspaceId}/${templateId}`, {
    method: 'PATCH',
    headers: { 'X-Tenant-Id': workspaceId },
    body,
    timeoutMs: 15_000,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; templateId: string }> },
) {
  const { workspaceId, templateId } = await params;
  invalidateDesignTemplateCache(workspaceId);
  return proxyToCrewBackend(`/api/v1/design-templates/${workspaceId}/${templateId}`, {
    method: 'DELETE',
    headers: { 'X-Tenant-Id': workspaceId },
    timeoutMs: 15_000,
  });
}
