'use client';

import { useEffect, useRef, useState } from 'react';
import { DEFAULT_TENANT_ID, getSessionTenantId } from '@/lib/runtime-config';
import { invalidateTenantBrandQueries } from '@/lib/query-client-bridge';
import { useWorkspaceStore } from '@/stores/workspace-store';

/** Effective tenant for API + feed — JWT wins, then demo default, then store. */
export function resolveActiveTenantId(storeTenantId?: string | null): string | null {
  if (typeof window !== 'undefined') {
    const session = getSessionTenantId();
    if (session) return session;
    if (process.env.NEXT_PUBLIC_USE_DEMO_CONTEXT === 'true') return DEFAULT_TENANT_ID;
    return null;
  }
  const stored = storeTenantId?.trim();
  return stored || null;
}

/**
 * Single tenant source for feed, brand, and artifact queries.
 * Keeps workspace store aligned with JWT so UI headers match API data.
 */
export function useActiveTenantId(): string | null {
  const storeTenantId = useWorkspaceStore((s) => s.tenantId);
  const setTenantFromSession = useWorkspaceStore((s) => s.setTenantFromSession);
  const [sessionTenantId, setSessionTenantId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? getSessionTenantId() : null,
  );
  const prevActiveRef = useRef<string | null>(null);

  useEffect(() => {
    const sync = () => setSessionTenantId(getSessionTenantId());
    sync();
    window.addEventListener('smartagency-auth-changed', sync);
    return () => window.removeEventListener('smartagency-auth-changed', sync);
  }, []);

  const activeTenantId =
    sessionTenantId
    ?? (process.env.NEXT_PUBLIC_USE_DEMO_CONTEXT === 'true' ? DEFAULT_TENANT_ID : null)
    ?? null;

  // Keep workspace store aligned when session is authoritative.
  const effectiveTenantId =
    activeTenantId
    ?? (process.env.NEXT_PUBLIC_USE_DEMO_CONTEXT === 'true' ? storeTenantId : null);

  useEffect(() => {
    if (!effectiveTenantId) return;
    if (storeTenantId !== effectiveTenantId) {
      setTenantFromSession(effectiveTenantId);
    }
    if (prevActiveRef.current && prevActiveRef.current !== effectiveTenantId) {
      invalidateTenantBrandQueries(effectiveTenantId);
    }
    prevActiveRef.current = effectiveTenantId;
  }, [effectiveTenantId, storeTenantId, setTenantFromSession]);

  return effectiveTenantId;
}
