/**
 * BFF: Single scheduled template — get, update, delete.
 * GET    /api/brand-context/:workspaceId/scheduled-templates/:templateId
 * PATCH  /api/brand-context/:workspaceId/scheduled-templates/:templateId
 * DELETE /api/brand-context/:workspaceId/scheduled-templates/:templateId
 */

import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; templateId: string }> },
) {
  const { workspaceId, templateId } = await params;
  return proxyToCrewBackend(`/api/v1/scheduled-templates/${workspaceId}/${templateId}`);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; templateId: string }> },
) {
  const { workspaceId, templateId } = await params;
  const body = await req.json();
  return proxyToCrewBackend(`/api/v1/scheduled-templates/${workspaceId}/${templateId}`, {
    body,
    method: 'PATCH',
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; templateId: string }> },
) {
  const { workspaceId, templateId } = await params;
  return proxyToCrewBackend(`/api/v1/scheduled-templates/${workspaceId}/${templateId}`, {
    method: 'DELETE',
  });
}
