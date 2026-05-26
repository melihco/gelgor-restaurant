/** Nexus login/register yanıtındaki JWT; Next proxy ile çerez güvenilir olmadığında API + SignalR için taşınır. */
const KEY = 'smartagency_sa_session_jwt';

export function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = sessionStorage.getItem(KEY);
    return v && v.trim().length > 0 ? v.trim() : null;
  } catch {
    return null;
  }
}

export function setSessionToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token && token.trim().length > 0) sessionStorage.setItem(KEY, token.trim());
    else sessionStorage.removeItem(KEY);
  } catch {
    /* quota / private mode */
  }
  window.dispatchEvent(new CustomEvent('smartagency-auth-changed'));
}
