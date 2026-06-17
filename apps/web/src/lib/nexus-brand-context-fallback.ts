import type { NextRequest } from 'next/server';
import { resolveServerApiBaseUrl } from '@/lib/backend-origin';

function str(v: unknown): string {
  return String(v ?? '').trim();
}

function parseJsonList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
  } catch {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
}

function forwardHeaders(req: NextRequest, workspaceId: string): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Tenant-Id': workspaceId,
  };
  const auth = req.headers.get('authorization');
  const user = req.headers.get('x-user-id');
  const office = req.headers.get('x-office-id');
  if (auth) headers.Authorization = auth;
  if (user) headers['X-User-Id'] = user;
  if (office) headers['X-Office-Id'] = office;
  return headers;
}

/**
 * When Python brand_context is unavailable, synthesize a compatible row from Nexus CompanyProfile.
 */
export async function fetchNexusBrandContextFallback(
  req: NextRequest,
  workspaceId: string,
): Promise<Record<string, unknown> | null> {
  const nexusApi = resolveServerApiBaseUrl();
  try {
    const res = await fetch(`${nexusApi}/api/setup/company-profile`, {
      headers: forwardHeaders(req, workspaceId),
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const profile = (await res.json()) as Record<string, unknown>;
    if (!profile || !str(profile.brandName)) return null;

    const referenceImageUrls = [
      ...parseJsonList(profile.brandImageUrls),
      str(profile.logoUrl),
    ].filter((url) => url.startsWith('http'));

    return {
      business_name: str(profile.brandName),
      business_type: str(profile.industry),
      location: str(profile.location),
      description: str(profile.description),
      brand_tone: str(profile.brandTone),
      target_audience: str(profile.targetAudience),
      campaign_goals: str(profile.campaignGoals),
      visual_style: str(profile.visualStyle),
      logo_url: str(profile.logoUrl) || undefined,
      website_url: str(profile.websiteUrl) || undefined,
      instagram_handle: str(profile.instagramHandle) || undefined,
      google_business_url: str(profile.googleBusinessUrl) || undefined,
      content_pillars: parseJsonList(profile.contentNeeds),
      reference_image_urls: [...new Set(referenceImageUrls)],
      website_summary: str(profile.description).slice(0, 2000),
      discovery_confidence: typeof profile.discoveryConfidence === 'number'
        ? profile.discoveryConfidence
        : undefined,
      brand_constitution_confirmed_at: profile.creativeProfileConfirmedAt ?? null,
      source: 'nexus_company_profile_fallback',
    };
  } catch {
    return null;
  }
}
