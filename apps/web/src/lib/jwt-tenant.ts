/** Decode JWT payload (base64url) without verifying signature — client/middleware hint only. */
export function decodeJwtPayload(token: string): Record<string, string> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
    const json = atob(padded);
    return JSON.parse(json) as Record<string, string>;
  } catch {
    return null;
  }
}

export function extractTenantIdFromAuthHeader(authHeader: string | null | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  const claims = decodeJwtPayload(token);
  if (!claims) return null;
  const tenantId = claims['tenant_id'] || claims['tenantId'];
  return tenantId?.trim() || null;
}
