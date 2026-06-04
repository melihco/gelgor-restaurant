import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const url = new URL(req.url);
  const fillEmptyOnly = url.searchParams.get('fill_empty_only') !== 'false';
  return proxyToCrewBackend(
    `/api/v1/brand-context/${workspaceId}/enrich-brand-kit-from-website?fill_empty_only=${fillEmptyOnly}`,
    { method: 'POST' },
  );
}
