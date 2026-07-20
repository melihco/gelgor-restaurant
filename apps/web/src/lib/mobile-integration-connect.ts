import type { IntegrationProvider, IntegrationStatus } from '@/types';
import { apiClient } from '@/lib/api-client';

export type MobileIntegrationConnectKind =
  | 'google_oauth'
  | 'instagram_publish'
  | 'web_setup';

export interface MobileIntegrationConnectAction {
  kind: MobileIntegrationConnectKind;
  /** Google OAuth scope token — ads | analytics | search_console */
  googleScope?: string;
}

export const MOBILE_INTEGRATION_CONNECT: Record<
  IntegrationProvider,
  MobileIntegrationConnectAction | undefined
> = {
  GoogleBusiness: { kind: 'web_setup' },
  Instagram: { kind: 'instagram_publish' },
  GoogleAds: { kind: 'google_oauth', googleScope: 'ads' },
  GoogleAnalytics: { kind: 'google_oauth', googleScope: 'analytics' },
  Facebook: { kind: 'google_oauth', googleScope: 'ads' },
  SearchConsole: { kind: 'google_oauth', googleScope: 'search_console' },
  WhatsAppBusiness: undefined,
  Canva: undefined,
};

/** OAuth callback lands on /mobile so WebView returns to the customer app. */
export const MOBILE_GOOGLE_OAUTH_RETURN_PATH = '/mobile?integrations_oauth=1';

export function isSafeMobileOAuthReturnPath(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed.startsWith('/mobile')) return false;
  if (trimmed.includes('://') || trimmed.startsWith('//')) return false;
  return true;
}

export function mobileIntegrationConnectLabel(
  connected: boolean,
  status: IntegrationStatus | string,
): string | null {
  if (connected) return null;
  if (status === 'Expired') return 'Yenile';
  if (status === 'Error') return 'Tekrar dene';
  return 'Bağlan';
}

export class MobileIntegrationConnectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MobileIntegrationConnectError';
  }
}

export async function startMobileGoogleOAuth(scope: string): Promise<void> {
  const scopes = scope.trim();
  if (!scopes) {
    throw new MobileIntegrationConnectError('OAuth kapsamı tanımlı değil.');
  }
  try {
    const { authUrl } = await apiClient.getGoogleAuthUrl(
      scopes,
      MOBILE_GOOGLE_OAUTH_RETURN_PATH,
    );
    if (!authUrl?.trim()) {
      throw new MobileIntegrationConnectError('Google bağlantı adresi alınamadı.');
    }
    window.location.assign(authUrl);
  } catch (err) {
    if (err instanceof MobileIntegrationConnectError) throw err;
    throw new MobileIntegrationConnectError(
      'Google OAuth yapılandırması eksik. Yönetici Google:OAuth:ClientId ayarlamalı.',
    );
  }
}

export function openWebSetupIntegrations(): void {
  const url = `${window.location.origin}/setup`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function parseMobileIntegrationsOAuthReturn(
  search: string,
): { connected: string[]; shouldOpenSettings: boolean } {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const flag = params.get('integrations_oauth') === '1';
  const raw = params.get('google_connected') ?? '';
  const connected = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    connected,
    shouldOpenSettings: flag || connected.length > 0,
  };
}

export function clearMobileIntegrationsOAuthQuery(): void {
  if (typeof window === 'undefined') return;
  window.history.replaceState({}, '', '/mobile');
}

export const MOBILE_INTEGRATIONS_OAUTH_FLASH_KEY = 'sa_integrations_oauth_flash';

export function stashMobileIntegrationsOAuthFlash(message: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(MOBILE_INTEGRATIONS_OAUTH_FLASH_KEY, message);
}

export function consumeMobileIntegrationsOAuthFlash(): string | null {
  if (typeof window === 'undefined') return null;
  const msg = sessionStorage.getItem(MOBILE_INTEGRATIONS_OAUTH_FLASH_KEY);
  if (msg) sessionStorage.removeItem(MOBILE_INTEGRATIONS_OAUTH_FLASH_KEY);
  return msg;
}
