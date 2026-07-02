import { NextRequest, NextResponse } from 'next/server';
import { mergeBrandProfileSnapshot } from '@/lib/brand-profile-snapshot';
import { mergeProductionBrandContextSnapshot } from '@/lib/production-brand-context';
import { readBrandContextFromDb } from '@/lib/brand-context-db-fallback';
import { fetchNexusBrandContextFallback } from '@/lib/nexus-brand-context-fallback';
import { resolveServerApiBaseUrl } from '@/lib/backend-origin';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import type { BrandProfileSnapshot } from '@smartagency/contracts';

export const runtime = 'nodejs';
export const maxDuration = 30;

const NEXUS_API = resolveServerApiBaseUrl();

function forwardHeaders(req: NextRequest, workspaceId: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Tenant-Id': workspaceId,
  };
  const auth = req.headers.get('authorization');
  const correlation = req.headers.get('x-correlation-id');
  const user = req.headers.get('x-user-id');
  const office = req.headers.get('x-office-id');
  if (auth) headers.Authorization = auth;
  if (correlation) headers['X-Correlation-Id'] = correlation;
  if (user) headers['X-User-Id'] = user;
  if (office) headers['X-Office-Id'] = office;
  return headers;
}

async function fetchCoreSnapshot(req: NextRequest, workspaceId: string): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(`${NEXUS_API}/api/setup/snapshot-core`, {
      headers: forwardHeaders(req, workspaceId),
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return {};
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function fetchBrandContextRow(
  req: NextRequest,
  workspaceId: string,
): Promise<Record<string, unknown>> {
  const crew = await fetchCrewBackendJson<Record<string, unknown>>(
    `/api/v1/brand-context/${workspaceId}`,
    { workspaceId, timeoutMs: 8_000 },
  );
  if (crew.ok && crew.data) return crew.data;
  const dbRow = await readBrandContextFromDb(workspaceId);
  if (dbRow) return dbRow;
  const nexusRow = await fetchNexusBrandContextFallback(req, workspaceId);
  if (nexusRow) return nexusRow;
  return crew.data ?? {};
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const [core, intelligence, brandContext] = await Promise.all([
    fetchCoreSnapshot(req, workspaceId),
    fetchCrewBackendJson<Record<string, unknown>>(
      `/api/v1/brand-context/${workspaceId}/snapshot`,
      { workspaceId, timeoutMs: 10_000 },
    ).then((res) => (res.ok && res.data ? res.data : {})),
    fetchBrandContextRow(req, workspaceId),
  ]);

  const brand = mergeBrandProfileSnapshot({
    workspaceId,
    core,
    intelligence,
    brandContext,
  });

  try {
    return NextResponse.json(
      mergeProductionBrandContextSnapshot({
        workspaceId,
        brand: brand as BrandProfileSnapshot,
        brandContext,
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'snapshot_merge_failed', message }, { status: 500 });
  }
}
