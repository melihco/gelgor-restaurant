import { NextRequest, NextResponse } from 'next/server';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import { extractTenantIdFromAuthHeader } from '@/lib/jwt-tenant';

const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';

export function isTrustedInternalRequest(req: NextRequest): boolean {
  const internal = req.headers.get('X-Internal-Api-Key')?.trim();
  return Boolean(internal && internal === INTERNAL_KEY);
}

/** Forward browser session tenant + JWT to same-origin BFF sub-requests. */
export function buildTenantForwardHeaders(req: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  const tenant =
    req.headers.get('X-Tenant-Id') ||
    req.headers.get('x-tenant-id') ||
    extractTenantIdFromAuthHeader(req.headers.get('Authorization'));
  if (tenant) headers['X-Tenant-Id'] = tenant;
  const auth = req.headers.get('Authorization');
  if (auth) headers['Authorization'] = auth;
  const user = req.headers.get('X-User-Id') || req.headers.get('x-user-id');
  const office = req.headers.get('X-Office-Id') || req.headers.get('x-office-id');
  if (user) headers['X-User-Id'] = user;
  if (office) headers['X-Office-Id'] = office;
  return headers;
}

/**
 * Ensures browser-originated production calls cannot target another tenant's workspace.
 * Python production stack and other trusted callers use X-Internal-Api-Key.
 */
export function assertWorkspaceMatchesRequestTenant(
  req: NextRequest,
  workspaceId: string,
): NextResponse | null {
  const ws = workspaceId.trim();
  if (!ws) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }

  if (isTrustedInternalRequest(req)) {
    return null;
  }

  const headerTenant = (
    req.headers.get('X-Tenant-Id') ||
    req.headers.get('x-tenant-id') ||
    extractTenantIdFromAuthHeader(req.headers.get('Authorization')) ||
    ''
  ).trim();

  if (!headerTenant) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'X-Tenant-Id required for production routes', code: 'tenant_required' },
        { status: 401 },
      );
    }
    return null;
  }

  if (headerTenant.toLowerCase() !== ws.toLowerCase()) {
    return NextResponse.json(
      {
        error: 'workspaceId does not match authenticated tenant',
        code: 'tenant_mismatch',
      },
      { status: 403 },
    );
  }

  return null;
}

/** Path param tenant/workspace id must match JWT tenant (unless internal). */
export function assertPathTenantMatchesRequest(
  req: NextRequest,
  pathTenantId: string,
): NextResponse | null {
  return assertWorkspaceMatchesRequestTenant(req, pathTenantId);
}

export interface BrandAlignmentGate {
  canAutoProduce: boolean;
  bas: number | null;
  canProposeMissions?: boolean;
}

export async function fetchBrandAlignmentGate(
  req: NextRequest,
  tenantId: string,
): Promise<BrandAlignmentGate | null> {
  try {
    const res = await fetch(`${req.nextUrl.origin}/api/brand-alignment/${tenantId}`, {
      headers: buildTenantForwardHeaders(req),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return {
      canAutoProduce: data.canAutoProduce === true,
      bas: typeof data.bas === 'number' ? data.bas : null,
      canProposeMissions: data.canProposeMissions === true,
    };
  } catch {
    return null;
  }
}

/**
 * BAS = min(BRS, GIS, CCS) standing scores all 100 — required for autonomous production.
 * Internal callers (mission executor) bypass this gate.
 */
export async function assertAutonomousProductionAllowed(
  req: NextRequest,
  workspaceId: string,
): Promise<NextResponse | null> {
  if (isTrustedInternalRequest(req)) {
    return null;
  }

  const gate = await fetchBrandAlignmentGate(req, workspaceId);
  if (!gate) {
    return NextResponse.json(
      { error: 'Quality gate unavailable', code: 'quality_gate_unavailable' },
      { status: 503 },
    );
  }
  if (!gate.canAutoProduce) {
    return NextResponse.json(
      {
        error: 'Otonom üretim için BAS=100 gerekli (BRS, GIS ve CCS tam puan).',
        code: 'quality_gate',
        bas: gate.bas,
      },
      { status: 403 },
    );
  }
  return null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Prevent cross-tenant missionId reuse (IDOR). Skipped for trusted internal callers. */
export async function assertMissionBelongsToWorkspace(
  workspaceId: string,
  missionId: string,
  opts?: { skipForInternal?: boolean; req?: NextRequest },
): Promise<NextResponse | null> {
  if (opts?.skipForInternal && opts.req && isTrustedInternalRequest(opts.req)) {
    return null;
  }

  const mid = missionId.trim();
  const ws = workspaceId.trim();
  if (!mid || !ws) {
    return NextResponse.json({ error: 'missionId and workspaceId required' }, { status: 400 });
  }
  if (!UUID_RE.test(mid) || !UUID_RE.test(ws)) {
    return NextResponse.json(
      { error: 'Invalid mission or workspace id format', code: 'invalid_mission_id' },
      { status: 400 },
    );
  }

  const res = await fetchCrewBackendJson<{ id?: string; workspace_id?: string }>(
    `/api/v1/missions/${ws}/${mid}`,
    { workspaceId: ws, method: 'GET', timeoutMs: 20_000 },
  );

  if (!res.ok) {
    if (res.status === 404) {
      return NextResponse.json(
        { error: 'Mission not found for this workspace', code: 'mission_not_found' },
        { status: 404 },
      );
    }
    if (res.status === 403) {
      return NextResponse.json(
        { error: 'Workspace access denied for mission', code: 'mission_tenant_mismatch' },
        { status: 403 },
      );
    }
    const detail = res.error ?? 'crew_unreachable';
    return NextResponse.json(
      {
        error: 'Mission verification failed — Crew backend unreachable or busy',
        code: 'mission_verify_failed',
        detail,
      },
      { status: 503 },
    );
  }

  const foundId = String(res.data?.id ?? '').trim();
  if (!foundId || foundId.toLowerCase() !== mid.toLowerCase()) {
    return NextResponse.json(
      { error: 'Mission not found for this workspace', code: 'mission_not_found' },
      { status: 404 },
    );
  }

  const missionWs = String(res.data?.workspace_id ?? ws).trim();
  if (missionWs && missionWs.toLowerCase() !== ws.toLowerCase()) {
    return NextResponse.json(
      { error: 'Mission belongs to a different workspace', code: 'mission_tenant_mismatch' },
      { status: 403 },
    );
  }

  return null;
}
