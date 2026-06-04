import { NextRequest, NextResponse } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';
import {
  ensureBrandTemplateLibrary,
  libraryToCatalogTemplates,
  parseBrandTemplateLibraryFromTheme,
  patchLibrarySlot,
  type BrandTemplateLibrary,
} from '@/lib/brand-template-library';
import { resolveKitForSector } from '@/lib/remotion-template-registry';
import { tenantKitSeed } from '@/lib/tenant-template-seed';

export const runtime = 'nodejs';

async function loadTheme(workspaceId: string): Promise<Record<string, unknown> | null> {
  const res = await proxyToCrewBackend(`/api/v1/brand-context/${workspaceId}/theme`, {
    method: 'GET',
    headers: { 'X-Tenant-Id': workspaceId },
    timeoutMs: 15_000,
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return ((data as { theme?: Record<string, unknown> }).theme ?? null) as Record<string, unknown> | null;
}

/** GET — brand 5-slot template library + catalog entries for mobile UI. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }

  const theme = await loadTheme(workspaceId);
  const sector = String(
    theme?.business_type ?? theme?.industry ?? theme?.sector ?? 'general_business',
  );
  const kitId = resolveKitForSector(sector, tenantKitSeed(workspaceId));
  const library = ensureBrandTemplateLibrary(theme, { sector, kitId, tenantId: workspaceId });
  const saved = parseBrandTemplateLibraryFromTheme(theme);

  return NextResponse.json({
    library,
    locked: Boolean(saved?.locked),
    kitId,
    sector,
    storySlots: library.slots.filter((s) => s.format === 'story'),
    catalog: libraryToCatalogTemplates(library),
  });
}

/** PATCH — update one slot (story or post template id, enabled flag). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }

  let body: {
    slotKey?: string;
    storyTemplateId?: string;
    posterTemplateId?: string;
    enabled?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.slotKey) {
    return NextResponse.json({ error: 'slotKey required' }, { status: 400 });
  }

  const theme = await loadTheme(workspaceId) ?? {};
  const sector = String(theme.business_type ?? theme.industry ?? 'general_business');
  const kitId = resolveKitForSector(sector, tenantKitSeed(workspaceId));
  const current = ensureBrandTemplateLibrary(theme, { sector, kitId, tenantId: workspaceId });
  const next: BrandTemplateLibrary = patchLibrarySlot(current, body.slotKey, {
    storyTemplateId: body.storyTemplateId,
    posterTemplateId: body.posterTemplateId,
    enabled: body.enabled,
  });

  const res = await proxyToCrewBackend(`/api/v1/brand-context/${workspaceId}/theme`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': workspaceId },
    body: { theme: { ...theme, template_library: next } },
    timeoutMs: 20_000,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    return NextResponse.json({ error: err || 'Save failed' }, { status: res.status });
  }

  return NextResponse.json({ library: next, locked: true });
}
