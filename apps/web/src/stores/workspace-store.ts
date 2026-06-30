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
  /** Logout / account switch — drop persisted tenant context. */
  clearWorkspaceSession: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      tenantId: DEFAULT_TENANT_ID,
      officeId: DEFAULT_OFFICE_ID,
      setOfficeId: (officeId) =>
        set({ officeId: officeId.trim() || DEFAULT_OFFICE_ID }),
      setTenantFromSession: (tenantId) =>
        set((state) => {
          const next = tenantId.trim() || DEFAULT_TENANT_ID;
          if (state.tenantId === next) return state;
          return { tenantId: next };
        }),
      setWorkspace: (tenantId, officeId) =>
        set({
          tenantId: tenantId.trim() || DEFAULT_TENANT_ID,
          officeId: officeId.trim() || DEFAULT_OFFICE_ID,
        }),
      clearWorkspaceSession: () =>
        set({
          tenantId: DEFAULT_TENANT_ID,
          officeId: DEFAULT_OFFICE_ID,
        }),
    }),
    {
      name: 'smartagency-workspace',
      // officeId only — tenantId always comes from JWT via useActiveTenantId / AppShell.
      partialize: (state) => ({ officeId: state.officeId }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<WorkspaceState>),
        tenantId: current.tenantId,
      }),
    },
  ),
);
