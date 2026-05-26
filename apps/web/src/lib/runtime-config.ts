import { getSessionToken } from '@/lib/session-token';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050';

/**
 * Tarayıcıda `next dev` iken Nexus REST çağrılarını Next üzerinden proxylemek için (CORS / "Failed to fetch").
 * Prod veya explicit `NEXT_PUBLIC_BROWSER_API_PROXY=false` iken doğrudan `NEXT_PUBLIC_API_URL` kullanılır.
 * Uzun Crew çağrıları için `next.config.ts` içinde `experimental.proxyTimeout` değerinin yüksek olması gerekir.
 */
function useBrowserBackendProxy(): boolean {
  return (
    typeof window !== 'undefined' &&
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_BROWSER_API_PROXY !== 'false'
  );
}

/** REST isteği için tam URL. `/api/canva/*` gibi endpoint'ler doğrudan Next route'ına gider burada değişmez — .NET hep `/api/.../` ile kullanılıyor. */
export function getApiFetchUrl(endpoint: string): string {
  const ep = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (!ep.startsWith('/api/')) {
    const base = API_BASE_URL.replace(/\/$/, '');
    return `${base}${ep}`;
  }
  if (useBrowserBackendProxy()) {
    const rest = ep.slice(5);
    return `/api/nexus-backend/${rest}`;
  }
  const base = API_BASE_URL.replace(/\/$/, '');
  return `${base}${ep}`;
}

export const SIGNALR_BASE_URL =
  process.env.NEXT_PUBLIC_SIGNALR_URL || API_BASE_URL;

/**
 * Tarayıcı + dev proxy modunda SignalR'i Next rewrites ile aynı origin'e alır (/nexus-signalr/* → Nexus).
 * Aksi halde negotiate fetch cross-origin'e düşer (cookie/session, port, güvenilir bağlantı).
 */
export function getSignalRHubUrl(): string {
  if (typeof window !== 'undefined' && useBrowserBackendProxy()) {
    return `/nexus-signalr/hubs/office`;
  }
  const base = SIGNALR_BASE_URL.replace(/\/$/, '');
  return `${base}/hubs/office`;
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

/** Decode JWT payload (base64url) without verifying signature — client-side only. */
function decodeJwtPayload(token: string): Record<string, string> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    // Convert base64url → base64, then add required padding for atob.
    // Without padding atob throws when payload length % 4 !== 0.
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
    const json = atob(padded);
    return JSON.parse(json) as Record<string, string>;
  } catch {
    return null;
  }
}

export function getRequestContextHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Correlation-Id': createCorrelationId(),
  };

  const jwt = typeof window !== 'undefined' ? getSessionToken() : null;
  if (jwt) {
    headers.Authorization = `Bearer ${jwt}`;
    // Extract tenant/user/office from JWT claims — real session takes priority over demo values
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

  // Fallback: demo context when no real session exists (dev/testing without login)
  if (process.env.NEXT_PUBLIC_USE_DEMO_CONTEXT === 'true') {
    headers['X-Tenant-Id'] = DEFAULT_TENANT_ID;
    headers['X-User-Id'] = DEFAULT_USER_ID;
    headers['X-Office-Id'] = DEFAULT_OFFICE_ID;
  }

  return headers;
}

function createCorrelationId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `corr-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
