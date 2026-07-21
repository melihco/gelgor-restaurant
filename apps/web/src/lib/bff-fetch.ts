import { getTenantBffHeaders } from '@/lib/runtime-config';

function mergeBffHeaders(
  workspaceId: string,
  init?: RequestInit,
): Headers {
  const headers = new Headers();
  const base = getTenantBffHeaders(workspaceId);
  for (const [k, v] of Object.entries(base)) {
    if (v != null && v !== '') headers.set(k, v);
  }
  if (init?.headers) {
    const extra = new Headers(init.headers);
    extra.forEach((v, k) => headers.set(k, v));
  }
  // Browser must set multipart boundary — never force JSON Content-Type on FormData.
  if (typeof FormData !== 'undefined' && init?.body instanceof FormData) {
    headers.delete('Content-Type');
  }
  return headers;
}

/** Fetch a tenant-scoped Next.js BFF route with session + X-Tenant-Id headers. */
export async function fetchTenantBff(
  path: string,
  workspaceId: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: mergeBffHeaders(workspaceId, init),
  });
}
