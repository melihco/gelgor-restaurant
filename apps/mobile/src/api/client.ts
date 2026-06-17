import Constants from 'expo-constants';
import type { BrandProfileSnapshot, PlatformAdminOverview } from '@smartagency/contracts';

type LoginResponse = {
  token: string;
  tenantId: string;
  officeId: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
  };
};

function resolveBaseUrl(): string {
  const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;
  return String(extra?.apiBaseUrl || 'http://127.0.0.1:3000').replace(/\/$/, '');
}

export class SmartAgencyMobileClient {
  private readonly baseUrl = resolveBaseUrl();

  async login(email: string, password: string): Promise<LoginResponse> {
    const res = await fetch(`${this.baseUrl}/api/nexus-backend/api/security/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      throw new Error('Login failed');
    }
    return res.json() as Promise<LoginResponse>;
  }

  async getAdminOverview(token: string): Promise<PlatformAdminOverview | null> {
    const res = await fetch(`${this.baseUrl}/api/admin/platform/overview`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json() as Promise<PlatformAdminOverview>;
  }

  async getBrandSnapshot(workspaceId: string, token: string): Promise<BrandProfileSnapshot | null> {
    const res = await fetch(`${this.baseUrl}/api/brand-profile/${encodeURIComponent(workspaceId)}/snapshot`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json() as Promise<BrandProfileSnapshot>;
  }
}

export const mobileApiClient = new SmartAgencyMobileClient();
