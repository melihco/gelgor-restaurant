import { describe, expect, it } from 'vitest';
import {
  isSafeMobileOAuthReturnPath,
  mobileIntegrationConnectLabel,
  parseMobileIntegrationsOAuthReturn,
  MOBILE_GOOGLE_OAUTH_RETURN_PATH,
} from '../mobile-integration-connect';

describe('mobile-integration-connect', () => {
  it('allows only /mobile return paths', () => {
    expect(isSafeMobileOAuthReturnPath('/mobile?integrations_oauth=1')).toBe(true);
    expect(isSafeMobileOAuthReturnPath('/setup')).toBe(false);
    expect(isSafeMobileOAuthReturnPath('https://evil.test/mobile')).toBe(false);
    expect(isSafeMobileOAuthReturnPath('//evil.test/mobile')).toBe(false);
  });

  it('uses mobile return path constant', () => {
    expect(MOBILE_GOOGLE_OAUTH_RETURN_PATH).toBe('/mobile?integrations_oauth=1');
  });

  it('labels connect button by status', () => {
    expect(mobileIntegrationConnectLabel(true, 'Connected')).toBeNull();
    expect(mobileIntegrationConnectLabel(false, 'Disconnected')).toBe('Bağlan');
    expect(mobileIntegrationConnectLabel(false, 'Expired')).toBe('Yenile');
    expect(mobileIntegrationConnectLabel(false, 'Error')).toBe('Tekrar dene');
  });

  it('parses oauth return query', () => {
    expect(parseMobileIntegrationsOAuthReturn('?integrations_oauth=1')).toEqual({
      connected: [],
      shouldOpenSettings: true,
    });
    expect(parseMobileIntegrationsOAuthReturn('?google_connected=Google%20Ads,Google%20Analytics%204')).toEqual({
      connected: ['Google Ads', 'Google Analytics 4'],
      shouldOpenSettings: true,
    });
    expect(parseMobileIntegrationsOAuthReturn('')).toEqual({
      connected: [],
      shouldOpenSettings: false,
    });
  });
});
