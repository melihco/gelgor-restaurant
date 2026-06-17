import { NextRequest, NextResponse } from 'next/server';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import {
  assertPathTenantMatchesRequest,
  buildTenantForwardHeaders,
} from '@/lib/tenant-production-guard';
import { readBrandContextFromDb } from '@/lib/brand-context-db-fallback';
import { buildCompanyProfilePatchFromPython } from '@/lib/sync-company-profile-from-python';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NEXUS_API = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, '');

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const denied = assertPathTenantMatchesRequest(req, workspaceId);
  if (denied) return denied;

  let pyData: Record<string, unknown> | null = null;
  const pyRes = await fetchCrewBackendJson<Record<string, unknown>>(
    `/api/v1/brand-context/${workspaceId}`,
    { workspaceId, timeoutMs: 8_000 },
  );
  if (pyRes.ok && pyRes.data) {
    pyData = pyRes.data;
  } else {
    pyData = await readBrandContextFromDb(workspaceId);
  }
  if (!pyData) {
    return NextResponse.json(
      {
        ok: false,
        error: 'crew_backend_unreachable',
        message: pyRes.error ?? 'Python marka servisine ve veritabanına ulaşılamadı',
      },
      { status: 503 },
    );
  }

  const fwd = buildTenantForwardHeaders(req);
  const profileRes = await fetch(`${NEXUS_API}/api/setup/profile`, {
    headers: fwd,
    signal: AbortSignal.timeout(15_000),
  });
  const profile = profileRes.ok
    ? ((await profileRes.json().catch(() => ({}))) as Record<string, unknown>)
    : {};

  const patch = buildCompanyProfilePatchFromPython(profile, pyData);
  if (!patch) {
    return NextResponse.json({ ok: true, applied: [], message: 'Nexus profili zaten dolu' });
  }

  const merged = {
    ...profile,
    ...patch,
    defaultApprovalMode: profile.defaultApprovalMode ?? 'manual',
  };

  const saveRes = await fetch(`${NEXUS_API}/api/setup/profile`, {
    method: 'PUT',
    headers: { ...fwd, 'Content-Type': 'application/json' },
    body: JSON.stringify(merged),
    signal: AbortSignal.timeout(15_000),
  });

  if (!saveRes.ok) {
    const detail = await saveRes.text().catch(() => '');
    return NextResponse.json(
      { ok: false, error: 'nexus_save_failed', status: saveRes.status, detail: detail.slice(0, 300) },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    applied: Object.keys(patch),
    business_name: pyData.business_name,
  });
}
