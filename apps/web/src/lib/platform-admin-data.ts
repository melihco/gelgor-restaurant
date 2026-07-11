import type { NextRequest } from 'next/server';
import type { PlatformAdminOverview } from '@smartagency/contracts';
import {
  type PlatformAdminUser,
  resolvePlatformAdminTenantId,
} from '@/lib/platform-admin-auth';

const NEXUS_API = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, '');

function copyForwardHeaders(req: NextRequest, extra?: Record<string, string>): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  const auth = req.headers.get('authorization');
  const tenant = req.headers.get('x-tenant-id');
  const user = req.headers.get('x-user-id');
  const office = req.headers.get('x-office-id');
  const correlation = req.headers.get('x-correlation-id');
  if (auth) headers.Authorization = auth;
  if (tenant) headers['X-Tenant-Id'] = tenant;
  if (user) headers['X-User-Id'] = user;
  if (office) headers['X-Office-Id'] = office;
  if (correlation) headers['X-Correlation-Id'] = correlation;
  return { ...headers, ...(extra ?? {}) };
}

function tenantScopedHeaders(req: NextRequest, tenantId: string): HeadersInit {
  return copyForwardHeaders(req, tenantId ? { 'X-Tenant-Id': tenantId } : undefined);
}

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  fallback: T,
): Promise<T> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

function mergeSecurityProfile(
  req: NextRequest,
  authUser: PlatformAdminUser | undefined,
  fromApi: {
    userId: string;
    tenantId: string;
    tenantName: string;
    role: string;
    displayName: string;
    email: string;
    permissions: string[];
  },
  tenantId: string,
) {
  const apiOk =
    Boolean(fromApi.tenantId?.trim()) &&
    fromApi.tenantName.trim().toLowerCase() !== 'unknown tenant';

  if (apiOk) return fromApi;

  if (authUser?.tenantId) {
    return {
      userId: authUser.userId || fromApi.userId,
      tenantId: authUser.tenantId,
      tenantName: authUser.tenantName || fromApi.tenantName,
      role: authUser.role || fromApi.role,
      displayName: authUser.displayName || fromApi.displayName,
      email: authUser.email || fromApi.email,
      permissions: authUser.permissions?.length ? authUser.permissions : fromApi.permissions,
    };
  }

  return {
    userId: fromApi.userId,
    tenantId: tenantId || fromApi.tenantId,
    tenantName:
      fromApi.tenantName && fromApi.tenantName !== 'Unknown Tenant'
        ? fromApi.tenantName
        : tenantId
          ? `Workspace ${tenantId.slice(0, 8)}…`
          : 'Unknown Tenant',
    role: fromApi.role || 'unknown',
    displayName: fromApi.displayName || 'Unknown User',
    email: fromApi.email || '',
    permissions: fromApi.permissions ?? [],
  };
}

export async function loadPlatformAdminOverview(
  req: NextRequest,
  authUser?: PlatformAdminUser,
): Promise<PlatformAdminOverview> {
  const tenantId = resolvePlatformAdminTenantId(req, authUser);
  const scopedHeaders = tenantScopedHeaders(req, tenantId);

  const securityFromApi = await fetchJson<{
    userId: string;
    tenantId: string;
    tenantName: string;
    role: string;
    displayName: string;
    email: string;
    permissions: string[];
  }>(
    `${NEXUS_API}/api/security/me`,
    { headers: scopedHeaders, cache: 'no-store' },
    {
      userId: authUser?.userId ?? '',
      tenantId,
      tenantName: authUser?.tenantName ?? 'Unknown Tenant',
      role: authUser?.role ?? 'unknown',
      displayName: authUser?.displayName ?? 'Unknown User',
      email: authUser?.email ?? '',
      permissions: authUser?.permissions ?? [],
    },
  );

  const security = mergeSecurityProfile(req, authUser, securityFromApi, tenantId);
  const effectiveTenantId = security.tenantId || tenantId;

  const [operations, users, usage, subscription, productionSnapshot, missions, artifacts] = await Promise.all([
    fetchJson<any>(`${NEXUS_API}/api/operations/summary`, { headers: scopedHeaders, cache: 'no-store' }, { health: {} }),
    fetchJson<any[]>(`${NEXUS_API}/api/security/users`, { headers: scopedHeaders, cache: 'no-store' }, []),
    fetchJson<any>(`${NEXUS_API}/api/packages/usage`, { headers: scopedHeaders, cache: 'no-store' }, null),
    fetchJson<any>(`${NEXUS_API}/api/packages/subscription`, { headers: scopedHeaders, cache: 'no-store' }, null),
    fetchJson<Record<string, unknown>>(
      `${req.nextUrl.origin}/api/production-context/${effectiveTenantId}/snapshot`,
      { headers: scopedHeaders, cache: 'no-store' },
      {},
    ),
    fetchJson<any[]>(
      `${req.nextUrl.origin}/api/missions/${effectiveTenantId}?limit=20`,
      { headers: scopedHeaders, cache: 'no-store' },
      [],
    ),
    fetchJson<any[]>(
      `${NEXUS_API}/api/artifacts?limit=100`,
      { headers: tenantScopedHeaders(req, effectiveTenantId), cache: 'no-store' },
      [],
    ),
  ]);

  const brandName = String(
    (productionSnapshot.brand as Record<string, unknown> | undefined)?.brandName
    ?? (productionSnapshot.brand as Record<string, unknown> | undefined)?.brand_name
    ?? '',
  );

  return {
    generatedAt: new Date().toISOString(),
    currentUser: security,
    health: {
      agentRuns24h: Number(operations?.health?.agentRuns24h ?? 0),
      failedAgentRuns24h: Number(operations?.health?.failedAgentRuns24h ?? 0),
      executionJobs24h: Number(operations?.health?.executionJobs24h ?? 0),
      failedExecutionJobs24h: Number(operations?.health?.failedExecutionJobs24h ?? 0),
      tokensUsed24h: Number(operations?.health?.tokensUsed24h ?? 0),
      providerFailureRate: Number(operations?.health?.providerFailureRate ?? 0),
    },
    usage: {
      tokenWallet: usage?.tokens ?? undefined,
      agentRuns: usage?.agentRuns ?? undefined,
      providerActions: usage?.providerActions ?? undefined,
      dailyAiCost: { amount: Number(operations?.health?.tokensUsed24h ?? 0), currency: 'TOKENS' },
      monthlyAiCost: subscription?.currentPeriodEnd
        ? { amount: Number(usage?.tokens?.used ?? 0), currency: 'TOKENS' }
        : undefined,
    },
    tenants: [
      {
        workspaceId: effectiveTenantId,
        tenantId: effectiveTenantId,
        tenantName: security.tenantName || brandName || `Workspace ${effectiveTenantId.slice(0, 8)}…`,
        brandName: brandName || null,
        packageName: subscription?.packageName ?? null,
        status: String(subscription?.status ?? 'active'),
        usersCount: users.length,
        artifactsCount: artifacts.length,
        activeMissionsCount: missions.filter((mission) => mission?.status === 'in_flight').length,
        lastActivityAt: operations?.generatedAt ?? null,
      },
    ],
  };
}
