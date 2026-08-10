/**
 * Platform admin Super Admin registry client — tenants, brands, users, audit, impersonate.
 */
import type {
  PlatformTenantPatch,
  PlatformTenantRegistryItem,
  PlatformTenantRegistryPage,
} from '@smartagency/contracts';
import { getRequestContextHeaders } from '@/lib/runtime-config';

export type AdminRegistryResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; status?: number };

function operatorHeaders(extra?: Record<string, string>): Record<string, string> {
  return { Accept: 'application/json', ...getRequestContextHeaders(), ...extra };
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { detail: text };
  }
}

function errorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    const o = data as { detail?: string; error?: string; title?: string };
    if (typeof o.detail === 'string' && o.detail.trim()) return o.detail;
    if (typeof o.error === 'string' && o.error.trim()) return o.error;
    if (typeof o.title === 'string' && o.title.trim()) return o.title;
  }
  return fallback;
}

async function adminGet<T>(url: string, timeoutMs = 20_000): Promise<AdminRegistryResult<T>> {
  try {
    const res = await fetch(url, {
      headers: operatorHeaders(),
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    const data = await parseJson(res);
    if (!res.ok) {
      return { ok: false, message: errorMessage(data, res.statusText), status: res.status };
    }
    return { ok: true, data: data as T };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'İstek başarısız' };
  }
}

async function adminSend<T>(
  url: string,
  method: 'POST' | 'PUT' | 'PATCH',
  body?: unknown,
  timeoutMs = 60_000,
): Promise<AdminRegistryResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: operatorHeaders({ 'Content-Type': 'application/json' }),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    const data = await parseJson(res);
    if (!res.ok) {
      return { ok: false, message: errorMessage(data, res.statusText), status: res.status };
    }
    return { ok: true, data: data as T };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'İstek başarısız' };
  }
}

export async function listAdminTenants(opts?: {
  q?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}): Promise<AdminRegistryResult<PlatformTenantRegistryPage>> {
  const params = new URLSearchParams();
  if (opts?.q?.trim()) params.set('q', opts.q.trim());
  if (opts?.isActive != null) params.set('isActive', String(opts.isActive));
  if (opts?.limit != null) params.set('limit', String(opts.limit));
  if (opts?.offset != null) params.set('offset', String(opts.offset));
  const qs = params.toString();
  return adminGet<PlatformTenantRegistryPage>(`/api/admin/tenants${qs ? `?${qs}` : ''}`);
}

export async function getAdminTenant(
  tenantId: string,
): Promise<AdminRegistryResult<PlatformTenantRegistryItem>> {
  return adminGet<PlatformTenantRegistryItem>(`/api/admin/tenants/${tenantId}`);
}

export async function patchAdminTenant(
  tenantId: string,
  patch: PlatformTenantPatch,
): Promise<AdminRegistryResult<PlatformTenantRegistryItem>> {
  const body: Record<string, unknown> = {};
  if (patch.name != null) body.name = patch.name;
  if (patch.plan != null) body.plan = patch.plan;
  if (patch.isActive != null) body.isActive = patch.isActive;
  if (patch.logoUrl !== undefined) body.logoUrl = patch.logoUrl;
  return adminSend<PlatformTenantRegistryItem>(`/api/admin/tenants/${tenantId}`, 'PATCH', body);
}

export async function suspendAdminTenant(
  tenantId: string,
): Promise<AdminRegistryResult<{ id: string; is_active: boolean }>> {
  return adminSend(`/api/admin/tenants/${tenantId}/suspend`, 'POST', {});
}

export async function reactivateAdminTenant(
  tenantId: string,
): Promise<AdminRegistryResult<{ id: string; is_active: boolean }>> {
  return adminSend(`/api/admin/tenants/${tenantId}/reactivate`, 'POST', {});
}

export async function bootstrapAdminTenant(
  body: Record<string, unknown>,
): Promise<AdminRegistryResult<unknown>> {
  return adminSend('/api/admin/tenants/bootstrap', 'POST', body, 90_000);
}

export async function bootstrapAdminPython(
  tenantId: string,
  body?: Record<string, unknown>,
): Promise<AdminRegistryResult<unknown>> {
  return adminSend(`/api/admin/tenants/${tenantId}/bootstrap-python`, 'POST', body ?? {}, 90_000);
}

export async function putAdminTenantSubscription(
  tenantId: string,
  body: { packageId: string } & Record<string, unknown>,
): Promise<AdminRegistryResult<unknown>> {
  return adminSend(`/api/admin/tenants/${tenantId}/subscription`, 'PUT', body);
}

export async function listAdminTenantUsers(
  tenantId: string,
): Promise<AdminRegistryResult<unknown>> {
  return adminGet(`/api/admin/tenants/${tenantId}/users`);
}

export async function inviteAdminTenantUser(
  tenantId: string,
  body: Record<string, unknown>,
): Promise<AdminRegistryResult<unknown>> {
  return adminSend(`/api/admin/tenants/${tenantId}/users`, 'POST', body);
}

export async function updateAdminTenantUserRole(
  tenantId: string,
  userId: string,
  role: string,
): Promise<AdminRegistryResult<unknown>> {
  return adminSend(`/api/admin/tenants/${tenantId}/users/${userId}`, 'PUT', { role });
}

export async function updateAdminTenantUserActive(
  tenantId: string,
  userId: string,
  isActive: boolean,
): Promise<AdminRegistryResult<unknown>> {
  return adminSend(`/api/admin/tenants/${tenantId}/users/${userId}`, 'PUT', { is_active: isActive });
}

export async function listAdminTenantWorkspaces(
  tenantId: string,
): Promise<AdminRegistryResult<unknown>> {
  return adminGet(`/api/admin/tenants/${tenantId}/workspaces`);
}

export async function listAdminBrands(opts?: {
  source?: 'brands' | 'nexus' | 'tenants' | 'by_sector';
  q?: string;
  sector_id?: string;
  limit?: number;
  offset?: number;
}): Promise<AdminRegistryResult<unknown>> {
  const params = new URLSearchParams();
  if (opts?.source) params.set('source', opts.source);
  if (opts?.q?.trim()) params.set('q', opts.q.trim());
  if (opts?.sector_id) params.set('sector_id', opts.sector_id);
  if (opts?.limit != null) params.set('limit', String(opts.limit));
  if (opts?.offset != null) params.set('offset', String(opts.offset));
  const qs = params.toString();
  return adminGet(`/api/admin/brands${qs ? `?${qs}` : ''}`);
}

export async function impersonateAdminTenant(body: {
  tenantId: string;
  reason?: string;
}): Promise<AdminRegistryResult<{ accessToken?: string; token?: string } & Record<string, unknown>>> {
  return adminSend('/api/admin/impersonate', 'POST', {
    tenantId: body.tenantId,
    TenantId: body.tenantId,
    reason: body.reason,
  });
}

export async function listAdminAuditLogs(opts?: {
  tenantId?: string;
  limit?: number;
  offset?: number;
}): Promise<AdminRegistryResult<unknown>> {
  const params = new URLSearchParams();
  if (opts?.tenantId) params.set('tenantId', opts.tenantId);
  if (opts?.limit != null) params.set('limit', String(opts.limit));
  if (opts?.offset != null) params.set('offset', String(opts.offset));
  const qs = params.toString();
  return adminGet(`/api/admin/audit-logs${qs ? `?${qs}` : ''}`);
}

/** Tenant-scoped Nexus proxy (INTERNAL_API_KEY + X-Platform-Admin). */
export async function adminWorkspaceNexus<T = unknown>(
  tenantId: string,
  path: string,
  init?: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; timeoutMs?: number },
): Promise<AdminRegistryResult<T>> {
  const clean = path.replace(/^\/+/, '').replace(/^api\//i, '');
  const url = `/api/admin/workspace/${tenantId}/nexus/${clean}`;
  const method = init?.method ?? 'GET';
  if (method === 'GET' || method === 'DELETE') {
    try {
      const res = await fetch(url, {
        method,
        headers: operatorHeaders(),
        signal: AbortSignal.timeout(init?.timeoutMs ?? 20_000),
        cache: 'no-store',
      });
      const data = await parseJson(res);
      if (!res.ok) {
        return { ok: false, message: errorMessage(data, res.statusText), status: res.status };
      }
      return { ok: true, data: data as T };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'İstek başarısız' };
    }
  }
  return adminSend<T>(url, method, init?.body, init?.timeoutMs ?? 60_000);
}
