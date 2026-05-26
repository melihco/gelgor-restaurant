'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_OFFICE_ID, DEFAULT_TENANT_ID } from '@/lib/runtime-config';

/**
 * Tek tenant / office bağlamı: JWT oturumundaki tenant ve kullanıcının seçtiği office (Brand Hub).
 * officeId localStorage’da kalır; tenantId oturum yüklendiğinde API ile hizalanır.
 */
export interface WorkspaceState {
  tenantId: string;
  officeId: string;
  setOfficeId: (officeId: string) => void;
  setTenantFromSession: (tenantId: string) => void;
  setWorkspace: (tenantId: string, officeId: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      tenantId: DEFAULT_TENANT_ID,
      officeId: DEFAULT_OFFICE_ID,
      setOfficeId: (officeId) =>
        set({ officeId: officeId.trim() || DEFAULT_OFFICE_ID }),
      setTenantFromSession: (tenantId) =>
        set({ tenantId: tenantId.trim() || DEFAULT_TENANT_ID }),
      setWorkspace: (tenantId, officeId) =>
        set({
          tenantId: tenantId.trim() || DEFAULT_TENANT_ID,
          officeId: officeId.trim() || DEFAULT_OFFICE_ID,
        }),
    }),
    {
      name: 'smartagency-workspace',
      // Persist both tenantId and officeId so that on page reload the correct
      // tenant is used immediately — without waiting for getCurrentUserSecurity().
      // AppShell still calls setTenantFromSession() after auth check to catch
      // any tenant changes (e.g., after switching accounts).
      partialize: (state) => ({ tenantId: state.tenantId, officeId: state.officeId }),
    },
  ),
);
