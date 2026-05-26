import type { QueryClient } from '@tanstack/react-query';

let bridge: QueryClient | null = null;

export function registerQueryClient(client: QueryClient | null): void {
  bridge = client;
}

export function getQueryClientBridge(): QueryClient | null {
  return bridge;
}

/** Oturum / tenant değişince marka profili cache'ini temizle. */
export function invalidateTenantBrandQueries(tenantId: string): void {
  if (!bridge || !tenantId) return;
  void bridge.invalidateQueries({ queryKey: ['company-profile', tenantId] });
  void bridge.invalidateQueries({ queryKey: ['brand-context-data', tenantId] });
}
