import { getSessionToken } from '@/lib/session-token';
import { resolveServerApiBaseUrl, resolveServerSignalrBaseUrl } from '@/lib/backend-origin';
import {
  resolvePublicApiUrl,
  resolvePublicSignalrUrl,
} from '@/lib/runtime-public-config';
import { decodeJwtPayload } from '@/lib/jwt-tenant';

/** Server-side module init; browser code must call getApiBaseUrl(). */
export const API_BASE_URL = resolveServerApiBaseUrl();

export function getApiBaseUrl(): string {
  return resolvePublicApiUrl().replace(/\/$/, '');
}

/**
 * Tarayıcıda her zaman Next proxy kullan — CORS yok, Docker build-time NEXT_PUBLIC bake sorunu yok.
 * Route handler runtime'da NEXUS_API_URL / BACKEND_ORIGIN okur.
 */
function useBrowserBackendProxy(): boolean {
  if (typeof window === 'undefined') return false;
  return process.env.NEXT_PUBLIC_BROWSER_API_PROXY !== 'false';
}

/** REST isteği için tam URL. Browser proxy modunda `/api/nexus-backend/*` (runtime route handler). */
export function getApiFetchUrl(endpoint: string): string {
  const ep = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (!ep.startsWith('/api/')) {
    const base = getApiBaseUrl();
    return `${base}${ep}`;
  }
  if (useBrowserBackendProxy()) {
    const rest = ep.slice(5);
    return `/api/nexus-backend/${rest}`;
  }
  const base = getApiBaseUrl();
  return `${base}${ep}`;
}

export function getSignalRHubUrl(): string {
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_BROWSER_API_PROXY !== 'false') {
    return `/nexus-signalr/hubs/office`;
  }
  const base = resolvePublicSignalrUrl().replace(/\/$/, '');
  return `${base}/hubs/office`;
}

export const SIGNALR_BASE_URL = resolveServerSignalrBaseUrl();

/** Same-origin BFF calls from server route handlers (avoid public URL loopback on Render). */
export function getNextjsInternalOrigin(): string {
  const port = process.env.PORT?.trim();
  if (port && process.env.RENDER) {
    return `http://127.0.0.1:${port}`;
  }
  const raw = process.env.NEXTJS_INTERNAL_URL?.trim() || 'http://localhost:3000';
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  return withScheme.replace(/\/$/, '');
}

export const DEFAULT_TENANT_ID =
  process.env.NEXT_PUBLIC_TENANT_ID ||
  '00000000-0000-0000-0000-000000000001';

export const DEFAULT_USER_ID =
  process.env.NEXT_PUBLIC_USER_ID ||
  '00000000-0000-0000-0000-000000000001';

export const DEFAULT_OFFICE_ID =
  process.env.NEXT_PUBLIC_OFFICE_ID ||
  '00000000-0000-0000-0000-000000000002';

/** Tarayıcıda session JWT var mı veya demo başlıkları kullanılıyor mu (kimlik gerektiren API için). */
export function hasBrowserApiAuthContext(): boolean {
  if (typeof window === 'undefined') return false;
  if (process.env.NEXT_PUBLIC_USE_DEMO_CONTEXT === 'true') return true;
  return !!getSessionToken();
}

/** Active session tenant from JWT — matches what getRequestContextHeaders sends to Nexus. */
export function getSessionTenantId(): string | null {
  const jwt = typeof window !== 'undefined' ? getSessionToken() : null;
  if (!jwt) return null;
  const claims = decodeJwtPayload(jwt);
  if (!claims) return null;
  const raw = claims['tenant_id'] ?? claims['tenantId'];
  const tenantId =
    typeof raw === 'string' ? raw : raw != null ? String(raw) : null;
  return tenantId?.trim() || null;
}

export function getRequestContextHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Correlation-Id': createCorrelationId(),
  };

  const jwt = typeof window !== 'undefined' ? getSessionToken() : null;
  if (jwt) {
    headers.Authorization = `Bearer ${jwt}`;
    const claims = decodeJwtPayload(jwt);
    if (claims) {
      const tenantId = claims['tenant_id'] || claims['tenantId'];
      const userId = claims['sub'] || claims['userId'];
      const officeId = claims['office_id'] || claims['officeId'];
      if (tenantId) headers['X-Tenant-Id'] = tenantId;
      if (userId) headers['X-User-Id'] = userId;
      if (officeId) headers['X-Office-Id'] = officeId;
      return headers;
    }
  }

  if (process.env.NEXT_PUBLIC_USE_DEMO_CONTEXT === 'true') {
    headers['X-Tenant-Id'] = DEFAULT_TENANT_ID;
    headers['X-User-Id'] = DEFAULT_USER_ID;
    headers['X-Office-Id'] = DEFAULT_OFFICE_ID;
  }

  return headers;
}

/** Tenant-scoped Next BFF routes require X-Tenant-Id in production middleware. */
export function getTenantBffHeaders(workspaceId: string): Record<string, string> {
  const ws = workspaceId.trim();
  const headers = getRequestContextHeaders();
  if (ws) headers['X-Tenant-Id'] = ws;
  return headers;
}

function createCorrelationId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `corr-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
