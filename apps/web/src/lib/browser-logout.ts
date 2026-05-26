import { apiClient } from '@/lib/api-client';
import { setSessionToken } from '@/lib/session-token';

/**
 * HttpOnly `sa_session` çerezini güvenilir şekilde silmek için önce Next BFF,
 * gerekirse doğrudan Nexus `logout` (proxy); sessionStorage JWT her durumda temizlenir.
 */
export async function logoutFromBrowser(): Promise<void> {
  setSessionToken(null);
  const bffRes = await fetch('/api/auth/logout-bff', {
    method: 'POST',
    credentials: 'include',
  }).catch(() => null);

  if (!bffRes?.ok) {
    try {
      await apiClient.logout();
    } catch {
      setSessionToken(null);
    }
  } else {
    setSessionToken(null);
  }
}
