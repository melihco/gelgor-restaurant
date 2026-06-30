import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';

/**
 * GET /api/brand-context/{workspaceId}/special-days
 *
 * Returns the upcoming special days for the brand's resolved country + sector
 * (international shared rows unioned with the country calendar). Powers the
 * onboarding event-template generation and special-day previews.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const withinDays = req.nextUrl.searchParams.get('within_days');
  const limit = req.nextUrl.searchParams.get('limit');
  const query = new URLSearchParams();
  if (withinDays) query.set('within_days', withinDays);
  if (limit) query.set('limit', limit);
  const qs = query.toString() ? `?${query.toString()}` : '';
  return proxyToCrewBackend(
    `/api/v1/special-days/workspace/${workspaceId}${qs}`,
    {
      method: 'GET',
      headers: { 'X-Tenant-Id': workspaceId },
      timeoutMs: 15_000,
    },
  );
}
