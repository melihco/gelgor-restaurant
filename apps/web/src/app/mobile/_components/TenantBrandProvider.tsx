'use client';

import { createContext, useContext } from 'react';
import { useTenantBrand } from '@/hooks/useTenantBrand';
import {
  emptyTenantBrandContext,
  type TenantBrandContext,
} from '@/lib/tenant-brand-context';
import { useWorkspaceStore } from '@/stores/workspace-store';

const TenantBrandCtx = createContext<TenantBrandContext>(emptyTenantBrandContext());

export function TenantBrandProvider({ children }: { children: React.ReactNode }) {
  const tenantId = useWorkspaceStore((s) => s.tenantId);
  const brand = useTenantBrand(tenantId);
  return (
    <TenantBrandCtx.Provider value={brand}>
      {children}
    </TenantBrandCtx.Provider>
  );
}

export function useTenantBrandContext(): TenantBrandContext {
  return useContext(TenantBrandCtx);
}
