import { NextRequest, NextResponse } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';
import { mergeBrandProfileSnapshot } from '@/lib/brand-profile-snapshot';
import { resolveServerApiBaseUrl } from '@/lib/backend-origin';

export const runtime = 'nodejs';
export const maxDuration = 30;

const NEXUS_API = resolveServerApiBaseUrl();

function forwardHeaders(req: NextRequest, workspaceId: string): HeadersInit {
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
    });
    if (!res.ok) return {};
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function fetchIntelligenceSnapshot(workspaceId: string): Promise<Record<string, unknown>> {
  const proxied = await proxyToCrewBackend(`/api/v1/brand-context/${workspaceId}/snapshot`, {
    workspaceId,
    timeoutMs: 10_000,
  });
  try {
    if (proxied.status !== 200) return {};
    return await proxied.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const [core, intelligence] = await Promise.all([
    fetchCoreSnapshot(req, workspaceId),
    fetchIntelligenceSnapshot(workspaceId),
  ]);

  const snapshot = mergeBrandProfileSnapshot({
    workspaceId,
    core,
    intelligence,
  });

  return NextResponse.json(snapshot);
}
