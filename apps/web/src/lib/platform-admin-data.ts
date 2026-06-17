import type { NextRequest } from 'next/server';
import type { PlatformAdminOverview } from '@smartagency/contracts';

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

export async function loadPlatformAdminOverview(req: NextRequest): Promise<PlatformAdminOverview> {
  const security = await fetchJson<{
    userId: string;
    tenantId: string;
    tenantName: string;
    role: string;
    displayName: string;
    email: string;
    permissions: string[];
  }>(
    `${NEXUS_API}/api/security/me`,
    { headers: copyForwardHeaders(req), cache: 'no-store' },
    {
      userId: '',
      tenantId: req.headers.get('x-tenant-id') ?? '',
      tenantName: 'Unknown Tenant',
      role: 'unknown',
      displayName: 'Unknown User',
      email: '',
      permissions: [],
    },
  );

  const [operations, users, usage, subscription, productionSnapshot, missions, artifacts] = await Promise.all([
    fetchJson<any>(`${NEXUS_API}/api/operations/summary`, { headers: copyForwardHeaders(req), cache: 'no-store' }, { health: {} }),
    fetchJson<any[]>(`${NEXUS_API}/api/security/users`, { headers: copyForwardHeaders(req), cache: 'no-store' }, []),
    fetchJson<any>(`${NEXUS_API}/api/packages/usage`, { headers: copyForwardHeaders(req), cache: 'no-store' }, null),
    fetchJson<any>(`${NEXUS_API}/api/packages/subscription`, { headers: copyForwardHeaders(req), cache: 'no-store' }, null),
    fetchJson<Record<string, unknown>>(`${req.nextUrl.origin}/api/production-context/${security.tenantId}/snapshot`, { headers: copyForwardHeaders(req), cache: 'no-store' }, {}),
    fetchJson<any[]>(`${req.nextUrl.origin}/api/missions/${security.tenantId}?limit=20`, { headers: copyForwardHeaders(req), cache: 'no-store' }, []),
    fetchJson<any[]>(`${NEXUS_API}/api/artifacts?limit=100`, { headers: copyForwardHeaders(req, security.tenantId ? { 'X-Tenant-Id': security.tenantId } : undefined), cache: 'no-store' }, []),
  ]);

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
        workspaceId: security.tenantId,
        tenantId: security.tenantId,
        tenantName: security.tenantName,
        brandName: String(
          (productionSnapshot.brand as Record<string, unknown> | undefined)?.brandName
          ?? '',
        ),
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
