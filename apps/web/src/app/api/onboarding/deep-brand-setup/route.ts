import { NextRequest, NextResponse } from 'next/server';
import { runDeepBrandSetup } from '@/lib/onboarding-brand-setup';
import { buildTenantForwardHeaders, assertPathTenantMatchesRequest } from '@/lib/tenant-production-guard';
import { getNextjsInternalOrigin } from '@/lib/runtime-config';

export const runtime = 'nodejs';
export const maxDuration = 600;

/**
 * POST /api/onboarding/deep-brand-setup
 * Full post-signup pipeline: analyze → gallery vision → visual DNA → Brand DNA → constitution.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const tenantId = String(body.tenantId ?? '').trim();
  const companyName = String(body.companyName ?? body.brandName ?? '').trim();
  const websiteUrl = String(body.websiteUrl ?? '').trim();
  const instagramHandle = String(body.instagramHandle ?? '').replace(/^@/, '').trim();
  const googleBusinessUrl = String(body.googleBusinessUrl ?? '').trim();

  const menuUrl = String(body.menuUrl ?? body.menu_url ?? '').trim();

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
  }
  if (!companyName) {
    return NextResponse.json({ error: 'companyName required' }, { status: 400 });
  }

  const tenantGuard = assertPathTenantMatchesRequest(req, tenantId);
  if (tenantGuard) return tenantGuard;

  const result = await runDeepBrandSetup({
    origin: getNextjsInternalOrigin(),
    tenantId,
    companyName,
    websiteUrl: websiteUrl || undefined,
    instagramHandle: instagramHandle || undefined,
    googleBusinessUrl: googleBusinessUrl || undefined,
    menuUrl: menuUrl || undefined,
    headers: buildTenantForwardHeaders(req),
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
