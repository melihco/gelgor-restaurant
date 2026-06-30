'use client';

import { createContext, useContext, useEffect, useRef } from 'react';
import { useTenantBrand } from '@/hooks/useTenantBrand';
import { useActiveTenantId } from '@/hooks/useActiveTenantId';
import { invalidateTenantBrandQueries } from '@/lib/query-client-bridge';
import { useWorkspaceStore } from '@/stores/workspace-store';
import {
  emptyTenantBrandContext,
  type TenantBrandContext,
} from '@/lib/tenant-brand-context';

const TenantBrandCtx = createContext<TenantBrandContext>(emptyTenantBrandContext());

export function TenantBrandProvider({ children }: { children: React.ReactNode }) {
  const tenantId = useActiveTenantId();
  const prevTenantRef = useRef<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    const { tenantId: storeTenantId, setTenantFromSession } = useWorkspaceStore.getState();
    if (storeTenantId !== tenantId) {
      setTenantFromSession(tenantId);
    }
    if (prevTenantRef.current && prevTenantRef.current !== tenantId) {
      invalidateTenantBrandQueries(tenantId);
    }
    prevTenantRef.current = tenantId;
  }, [tenantId]);

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
