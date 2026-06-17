import { NextRequest, NextResponse } from 'next/server';
import { mergeProductionBrandContextSnapshot } from '@/lib/production-brand-context';
import type { BrandProfileSnapshot } from '@smartagency/contracts';

export const runtime = 'nodejs';
export const maxDuration = 30;

async function fetchJson(
  url: string,
  headers: HeadersInit,
): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(url, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return {};
    return await res.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const headers: HeadersInit = {
    Accept: 'application/json',
    'X-Tenant-Id': workspaceId,
  };

  const auth = req.headers.get('authorization');
  const correlation = req.headers.get('x-correlation-id');
  const user = req.headers.get('x-user-id');
  const office = req.headers.get('x-office-id');
  if (auth) (headers as Record<string, string>).Authorization = auth;
  if (correlation) (headers as Record<string, string>)['X-Correlation-Id'] = correlation;
  if (user) (headers as Record<string, string>)['X-User-Id'] = user;
  if (office) (headers as Record<string, string>)['X-Office-Id'] = office;

  const [brand, brandContext] = await Promise.all([
    fetchJson(`${req.nextUrl.origin}/api/brand-profile/${workspaceId}/snapshot`, headers),
    fetchJson(`${req.nextUrl.origin}/api/brand-context-data/${workspaceId}`, headers),
  ]);

  try {
    return NextResponse.json(
      mergeProductionBrandContextSnapshot({
        workspaceId,
        brand: brand as unknown as BrandProfileSnapshot,
        brandContext,
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'snapshot_merge_failed', message }, { status: 500 });
  }
}
