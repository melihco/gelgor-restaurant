import { API_BASE_URL } from '@/lib/runtime-config';

function useBrowserBackendProxy(): boolean {
  return (
    typeof window !== 'undefined' &&
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_BROWSER_API_PROXY !== 'false'
  );
}

function getNexusHealthLiveUrl(): string {
  if (useBrowserBackendProxy()) {
    return '/nexus-health/live';
  }
  return `${API_BASE_URL.replace(/\/$/, '')}/health/live`;
}

/** Nexus (.NET) ayakta mı — SignalR negotiate öncesi hızlı kontrol */
export async function isNexusBackendReachable(): Promise<boolean> {
  try {
    const res = await fetch(getNexusHealthLiveUrl(), {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(4_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
