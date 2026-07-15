import type { QueryClient } from '@tanstack/react-query';

let bridge: QueryClient | null = null;

export function registerQueryClient(client: QueryClient | null): void {
  bridge = client;
}

export function getQueryClientBridge(): QueryClient | null {
  return bridge;
}

type InvalidateQueryKey = readonly unknown[];

export async function invalidateBrandContextWriteQueries(
  client: QueryClient,
  tenantId: string,
  extras: InvalidateQueryKey[] = [],
): Promise<void> {
  if (!tenantId) return;
  const keys: InvalidateQueryKey[] = [
    ['brand-context-data', tenantId],
    ['brand-readiness', tenantId],
    ['brand-gaps', tenantId],
    ['production-context-snapshot', tenantId],
    ...extras,
  ];
  await Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));
}

/** Feed, missions, billing — must not leak across tenant switches. */
export function clearSessionScopedQueries(): void {
  if (!bridge) return;
  void bridge.removeQueries({ queryKey: ['artifacts'] });
  void bridge.removeQueries({ queryKey: ['missions'] });
  void bridge.removeQueries({ queryKey: ['missions-list-feed'] });
  void bridge.removeQueries({ queryKey: ['usage-cost'] });
  void bridge.removeQueries({ queryKey: ['company-profile'] });
  void bridge.removeQueries({ queryKey: ['production-context-snapshot'] });
  void bridge.removeQueries({ queryKey: ['brand-theme-kit'] });
}

/** Oturum / tenant değişince marka profili cache'ini temizle. */
export function invalidateTenantBrandQueries(tenantId: string): void {
  if (!bridge || !tenantId) return;
  clearSessionScopedQueries();
  void bridge.invalidateQueries({ queryKey: ['company-profile', tenantId] });
  void invalidateBrandContextWriteQueries(bridge, tenantId);
}
