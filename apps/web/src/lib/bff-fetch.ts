import { getTenantBffHeaders } from '@/lib/runtime-config';

/** Fetch a tenant-scoped Next.js BFF route with session + X-Tenant-Id headers. */
export async function fetchTenantBff(
  path: string,
  workspaceId: string,
  init?: RequestInit,
): Promise<Response> {
  const extra = (init?.headers ?? {}) as Record<string, string>;
  return fetch(path, {
    ...init,
    headers: {
      ...getTenantBffHeaders(workspaceId),
      ...extra,
    },
  });
}
