import { normalizeBackendOrigin, resolveServerApiBaseUrl, resolveServerSignalrBaseUrl } from '@/lib/backend-origin';

export type RuntimePublicConfig = {
  apiUrl: string;
  signalrUrl: string;
  useDemoContext: boolean;
};

export function getServerRuntimePublicConfig(): RuntimePublicConfig {
  return {
    apiUrl: resolveServerApiBaseUrl(),
    signalrUrl: resolveServerSignalrBaseUrl(),
    useDemoContext: process.env.NEXT_PUBLIC_USE_DEMO_CONTEXT === 'true',
  };
}

declare global {
  interface Window {
    __SA_PUBLIC_CONFIG?: RuntimePublicConfig;
  }
}

export function getBrowserRuntimePublicConfig(): RuntimePublicConfig | null {
  if (typeof window === 'undefined') return null;
  return window.__SA_PUBLIC_CONFIG ?? null;
}

export function resolvePublicApiUrl(): string {
  const browser = getBrowserRuntimePublicConfig();
  if (browser?.apiUrl) return browser.apiUrl;
  return resolveServerApiBaseUrl();
}

export function resolvePublicSignalrUrl(): string {
  const browser = getBrowserRuntimePublicConfig();
  if (browser?.signalrUrl) return browser.signalrUrl;
  return resolveServerSignalrBaseUrl();
}

export function isLocalhostApiUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return url.includes('127.0.0.1') || url.includes('localhost');
  }
}
