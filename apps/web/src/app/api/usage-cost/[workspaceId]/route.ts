import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const days = req.nextUrl.searchParams.get('days') ?? '7';
  const packageSlug = req.nextUrl.searchParams.get('package_slug');
  const crewQs = new URLSearchParams({ days });
  if (packageSlug) crewQs.set('package_slug', packageSlug);
  return proxyToCrewBackend(`/api/v1/usage-cost/${workspaceId}?${crewQs.toString()}`, {
    workspaceId,
    timeoutMs: 10_000,
  });
}
