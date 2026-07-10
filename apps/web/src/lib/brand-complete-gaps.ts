/**
 * Server-side orchestration for POST /api/brand-context/{id}/complete-gaps.
 * Python handles LLM fields; Next BFF runs gallery + Nexus sync steps.
 */
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import { getNextjsInternalOrigin } from '@/lib/runtime-config';
import { parseContentIntentSlugs } from '@/lib/content-pillars-sync';
import { buildCompanyProfilePatchFromPython } from '@/lib/sync-company-profile-from-python';
import { serverConfig } from '@/lib/server-config';
import type { BrandGapItem } from '@/lib/brand-gap-analysis';

export interface CompleteGapsStep {
  id: string;
  ok: boolean;
  detail?: string;
}

export interface CompleteGapsResult {
  ok: boolean;
  gapsBefore: BrandGapItem[];
  gapsAfter: BrandGapItem[];
  steps: CompleteGapsStep[];
  resolvedCount: number;
  error?: string;
}

async function postInternal(
  path: string,
  tenantId: string,
  headers: Record<string, string>,
  timeoutMs = 120_000,
): Promise<CompleteGapsStep> {
  const origin = getNextjsInternalOrigin();
  try {
    const res = await fetch(`${origin}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Id': tenantId,
        ...headers,
      },
      body: path.includes('analyze-coverage') ? JSON.stringify({ maxImages: 24 }) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { id: path.split('/').pop() ?? path, ok: false, detail: body.slice(0, 200) };
    }
    return { id: path.split('/').pop() ?? path, ok: true };
  } catch (err) {
    return {
      id: path.split('/').pop() ?? path,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runCompleteBrandGaps(
  tenantId: string,
  forwardHeaders: Record<string, string>,
): Promise<CompleteGapsResult> {
  const pyRes = await fetchCrewBackendJson<{
    ok?: boolean;
    gaps_before?: BrandGapItem[];
    gaps_after?: BrandGapItem[];
    steps?: CompleteGapsStep[];
    resolved_count?: number;
    error?: string;
  }>(`/api/v1/brand-context/${tenantId}/complete-gaps`, {
    method: 'POST',
    workspaceId: tenantId,
    timeoutMs: 300_000,
    headers: forwardHeaders,
  });

  const steps: CompleteGapsStep[] = pyRes.ok && pyRes.data?.steps
    ? [...pyRes.data.steps]
    : [];

  if (!pyRes.ok) {
    return {
      ok: false,
      gapsBefore: pyRes.data?.gaps_before ?? [],
      gapsAfter: pyRes.data?.gaps_after ?? [],
      steps,
      resolvedCount: 0,
      error: pyRes.error ?? 'Python complete-gaps failed',
    };
  }

  const gapIds = new Set((pyRes.data?.gaps_before ?? []).map((g) => g.id));

  if (gapIds.has('gallery_coverage_low')) {
    steps.push(await postInternal(
      `/api/brand-context/${tenantId}/enrich-gallery-tags`,
      tenantId,
      forwardHeaders,
      60_000,
    ));
    steps.push(await postInternal(
      `/api/gallery-intelligence/${tenantId}/analyze-coverage`,
      tenantId,
      forwardHeaders,
      300_000,
    ));
  }

  // Nexus CompanyProfile ↔ Python sync (description, contentNeeds, tone)
  const hydrateStep = await postInternal(
    `/api/brand-context/${tenantId}/hydrate-company-profile`,
    tenantId,
    forwardHeaders,
    60_000,
  );
  steps.push({ ...hydrateStep, id: 'hydrate_company_profile' });

  // Force-sync pillars when Python has them but Nexus contentNeeds is empty/stale
  try {
    const ctxRes = await fetchCrewBackendJson<Record<string, unknown>>(
      `/api/v1/brand-context/${tenantId}`,
      { workspaceId: tenantId, timeoutMs: 15_000, headers: forwardHeaders },
    );
    if (ctxRes.ok && ctxRes.data) {
      const pillars = parseContentIntentSlugs(ctxRes.data.content_pillars as string);
      if (pillars.length >= 2) {
        const nexusBase = serverConfig.nexus.baseUrl;
        const profileRes = await fetch(`${nexusBase}/api/setup/profile`, {
          headers: forwardHeaders,
          signal: AbortSignal.timeout(15_000),
        });
        const profile = profileRes.ok
          ? ((await profileRes.json().catch(() => ({}))) as Record<string, unknown>)
          : {};
        const patch = buildCompanyProfilePatchFromPython(profile, ctxRes.data);
        const nextNeeds = JSON.stringify(pillars);
        const merged = {
          ...profile,
          ...(patch ?? {}),
          contentNeeds: nextNeeds,
          defaultApprovalMode: profile.defaultApprovalMode ?? 'manual',
        };
        const saveRes = await fetch(`${nexusBase}/api/setup/profile`, {
          method: 'PUT',
          headers: { ...forwardHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify(merged),
          signal: AbortSignal.timeout(15_000),
        });
        steps.push({
          id: 'pillar_sync',
          ok: saveRes.ok,
          detail: saveRes.ok ? `${pillars.length} pillars` : `HTTP ${saveRes.status}`,
        });
      }
    }
  } catch (err) {
    steps.push({
      id: 'pillar_sync',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  if (gapIds.has('brand_theme_missing') || gapIds.has('template_library_incomplete')) {
    steps.push(await postInternal(
      `/api/brand-context/${tenantId}/theme/derive`,
      tenantId,
      forwardHeaders,
      120_000,
    ));
  }

  if (gapIds.has('discovery_low')) {
    steps.push({
      id: 'discovery_reanalyze',
      ok: false,
      detail: 'Marka analizini Marka Ayarları → Kimlik üzerinden yeniden çalıştırın (Apify)',
    });
  }

  const gapsBefore = pyRes.data?.gaps_before ?? [];
  const gapsAfterRes = await fetchCrewBackendJson<{ gaps?: BrandGapItem[] }>(
    `/api/v1/brand-context/${tenantId}/brand-gaps`,
    { workspaceId: tenantId, timeoutMs: 30_000, headers: forwardHeaders },
  );
  const gapsAfter = gapsAfterRes.ok && gapsAfterRes.data?.gaps
    ? gapsAfterRes.data.gaps
    : (pyRes.data?.gaps_after ?? []);

  const resolvedCount = Math.max(
    pyRes.data?.resolved_count ?? 0,
    gapsBefore.length - gapsAfter.length,
  );
  const okSteps = steps.filter((s) => s.ok).length;

  return {
    ok: Boolean(pyRes.data?.ok) || okSteps > 0,
    gapsBefore,
    gapsAfter,
    steps,
    resolvedCount,
  };
}
