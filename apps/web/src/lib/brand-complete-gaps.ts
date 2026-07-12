/**
 * Server-side orchestration for POST /api/brand-context/{id}/complete-gaps.
 * Python handles LLM fields; Next BFF runs gallery + Nexus sync steps.
 */
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import { getNextjsInternalOrigin } from '@/lib/runtime-config';
import { parseContentIntentSlugs } from '@/lib/content-pillars-sync';
import { buildCompanyProfilePatchFromPython } from '@/lib/sync-company-profile-from-python';
import { serverConfig } from '@/lib/server-config';
import {
  PRODUCTION_PROFILE_THRESHOLD,
} from '@/lib/brand-readiness';
import {
  buildUserConfirmedTypographyPatch,
  isTypographyDesignConfirmed,
  resolveSuggestedTypographyConfig,
} from '@/lib/typography-design-policy';
import { resolveAuthoritativeIndustry } from '@/lib/canonical-sector';
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

  // PPR repair — Fal production visual_dna + confirmed typography layers
  try {
    const origin = getNextjsInternalOrigin();
    const readinessRes = await fetch(`${origin}/api/brand-readiness/${tenantId}?refresh=1`, {
      headers: { 'X-Tenant-Id': tenantId, ...forwardHeaders },
      signal: AbortSignal.timeout(90_000),
    });
    const readiness = readinessRes.ok
      ? ((await readinessRes.json()) as {
        productionProfile?: { score?: number; missing?: Array<{ id: string }> };
      })
      : null;
    const pprScore = readiness?.productionProfile?.score ?? 100;
    const pprMissing = new Set(
      (readiness?.productionProfile?.missing ?? []).map((m) => m.id),
    );

    if (pprScore < PRODUCTION_PROFILE_THRESHOLD) {
      const needsVisualDna = pprMissing.has('production_visual_dna');
      const needsThemeLayers = pprMissing.has('production_theme_layers');

      if (needsVisualDna || needsThemeLayers) {
        const pdpRes = await fetchCrewBackendJson<{ ok?: boolean; profile?: { source?: string } }>(
          `/api/v1/brand-context/${tenantId}/production-design-profile/derive`,
          {
            method: 'POST',
            workspaceId: tenantId,
            timeoutMs: 180_000,
            headers: forwardHeaders,
            body: {},
          },
        );
        steps.push({
          id: 'production_design_profile',
          ok: pdpRes.ok,
          detail: pdpRes.ok
            ? (pdpRes.data?.profile?.source ?? 'derived')
            : (pdpRes.error ?? `HTTP ${pdpRes.status}`),
        });
      }

      if (needsThemeLayers) {
        const ctxRes = await fetchCrewBackendJson<Record<string, unknown>>(
          `/api/v1/brand-context/${tenantId}`,
          { workspaceId: tenantId, timeoutMs: 15_000, headers: forwardHeaders },
        );
        const sector = resolveAuthoritativeIndustry(ctxRes.data ?? {}) ?? 'general_business';
        const themeRes = await fetch(`${origin}/api/brand-context/${tenantId}/theme`, {
          headers: { 'X-Tenant-Id': tenantId, ...forwardHeaders },
          signal: AbortSignal.timeout(30_000),
        });
        const themeJson = themeRes.ok
          ? ((await themeRes.json()) as { theme?: Record<string, unknown> | null })
          : { theme: null };
        const theme = themeJson.theme ?? {};
        if (!isTypographyDesignConfirmed(theme)) {
          const suggested = resolveSuggestedTypographyConfig(theme, sector);
          const confirmed = buildUserConfirmedTypographyPatch(suggested);
          const putRes = await fetch(`${origin}/api/brand-context/${tenantId}/theme`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'X-Tenant-Id': tenantId,
              ...forwardHeaders,
            },
            body: JSON.stringify({
              theme: {
                ...theme,
                typographyDesign: confirmed,
              },
            }),
            signal: AbortSignal.timeout(45_000),
          });
          steps.push({
            id: 'typography_confirm',
            ok: putRes.ok,
            detail: putRes.ok ? confirmed.vibe : `HTTP ${putRes.status}`,
          });
        }
      }
    }
  } catch (err) {
    steps.push({
      id: 'ppr_repair',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  if (gapIds.has('discovery_low')) {
    try {
      const ctxRes = await fetchCrewBackendJson<Record<string, unknown>>(
        `/api/v1/brand-context/${tenantId}`,
        { workspaceId: tenantId, timeoutMs: 15_000, headers: forwardHeaders },
      );
      const ctx = ctxRes.ok ? ctxRes.data ?? {} : {};
      const websiteUrl = String(ctx.website_url ?? '').trim();
      const instagramHandle = String(ctx.instagram_handle ?? '').trim().replace(/^@/, '');
      const googleBusinessUrl = String(ctx.google_business_url ?? '').trim();
      if (websiteUrl || instagramHandle || googleBusinessUrl) {
        const analyzeRes = await fetchCrewBackendJson<Record<string, unknown>>(
          `/api/v1/brand-context/${tenantId}/analyze`,
          {
            method: 'POST',
            workspaceId: tenantId,
            timeoutMs: 300_000,
            headers: forwardHeaders,
            body: {
              website_url: websiteUrl || undefined,
              instagram_handle: instagramHandle || undefined,
              google_business_url: googleBusinessUrl || undefined,
              brand_name: String(ctx.business_name ?? ''),
            },
          },
        );
        steps.push({
          id: 'discovery_reanalyze',
          ok: analyzeRes.ok,
          detail: analyzeRes.ok ? 'brand_analyze_ok' : (analyzeRes.error ?? 'analyze_failed'),
        });
      } else {
        steps.push({
          id: 'discovery_reanalyze',
          ok: false,
          detail: 'Web sitesi veya Instagram bilgisi ekleyin (Kimlik)',
        });
      }
    } catch (err) {
      steps.push({
        id: 'discovery_reanalyze',
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
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
