/**
 * BFF: Brand scheduled templates — list + create.
 * GET  /api/brand-context/:workspaceId/scheduled-templates
 * POST /api/brand-context/:workspaceId/scheduled-templates
 */

import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  return proxyToCrewBackend(`/api/v1/scheduled-templates/${workspaceId}`);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const body = await req.json();
  return proxyToCrewBackend(`/api/v1/scheduled-templates/${workspaceId}`, {
    body,
    method: 'POST',
  });
}
