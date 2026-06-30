'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_TENANT_ID, getSessionTenantId } from '@/lib/runtime-config';

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
 * Read-only — workspace store sync lives in TenantBrandProvider.
 */
export function useActiveTenantId(): string | null {
  const [sessionTenantId, setSessionTenantId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? getSessionTenantId() : null,
  );

  useEffect(() => {
    const sync = () => setSessionTenantId(getSessionTenantId());
    sync();
    window.addEventListener('smartagency-auth-changed', sync);
    return () => window.removeEventListener('smartagency-auth-changed', sync);
  }, []);

  return (
    sessionTenantId
    ?? (process.env.NEXT_PUBLIC_USE_DEMO_CONTEXT === 'true' ? DEFAULT_TENANT_ID : null)
  );
}
