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
  isProductionFormatVisualDna,
  PRODUCTION_PROFILE_THRESHOLD,
} from '@/lib/brand-readiness';
import {
  buildUserConfirmedTypographyPatch,
  isTypographyDesignConfirmed,
  resolvePostDesignDefaultsForTypography,
  resolveSuggestedTypographyConfig,
} from '@/lib/typography-design-policy';
import { buildSectorSyncPatch, resolveAuthoritativeIndustry } from '@/lib/canonical-sector';
import type { BrandGapItem } from '@/lib/brand-gap-analysis';
import { brsCache } from '@/lib/server-ttl-cache';

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
  body?: Record<string, unknown>,
): Promise<CompleteGapsStep> {
  const origin = getNextjsInternalOrigin();
  try {
    const payload = body
      ?? (path.includes('analyze-coverage') ? { maxImages: 24 } : undefined);
    const res = await fetch(`${origin}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Id': tenantId,
        ...headers,
      },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { id: path.split('/').pop() ?? path, ok: false, detail: text.slice(0, 200) };
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

  // Fal design template type coverage — generate additional shells (no archive)
  if (gapIds.has('template_type_coverage_low')) {
    try {
      const { loadBrandActiveSlotSet } = await import('@/lib/brand-active-slot-resolver');
      const { loadWorkspaceDesignTemplates } = await import('@/lib/brand-design-template-matcher');
      const { ensureKeyedDesignTemplatesForEnabledSlots } = await import(
        '@/lib/ensure-keyed-design-templates'
      );
      const { resolveAuthoritativeIndustry: resolveIndustry } = await import('@/lib/canonical-sector');
      const ctxRes = await fetchCrewBackendJson<Record<string, unknown>>(
        `/api/v1/brand-context/${tenantId}`,
        { workspaceId: tenantId, timeoutMs: 20_000, headers: forwardHeaders },
      );
      const businessType = String(
        (ctxRes.ok ? resolveIndustry(ctxRes.data ?? {}) : null)
        ?? (ctxRes.data as { business_type?: string } | undefined)?.business_type
        ?? 'general_business',
      );
      let templates = await loadWorkspaceDesignTemplates(tenantId);
      const activeSlots = await loadBrandActiveSlotSet(
        tenantId,
        businessType,
        templates,
        null,
      );
      const keyed = await ensureKeyedDesignTemplatesForEnabledSlots({
        workspaceId: tenantId,
        enabledSlots: activeSlots.slots.filter((s) => s.enabled),
        activeTemplates: templates,
      });
      steps.push({
        id: 'ensure_keyed_templates',
        ok: true,
        detail: `cloned=${keyed.cloned}`,
      });
      if (keyed.cloned > 0) {
        templates = await loadWorkspaceDesignTemplates(tenantId);
      }
      const { summarizeDesignTemplateTypeCoverage } = await import(
        '@/lib/catalog-template-coverage'
      );
      let typeCov = summarizeDesignTemplateTypeCoverage(templates, businessType);
      if (!typeCov.sufficient) {
        const gen = await postInternal(
          `/api/brand-context/${tenantId}/generate-design-templates`,
          tenantId,
          forwardHeaders,
          240_000,
          { archiveExisting: false },
        );
        steps.push({ ...gen, id: 'generate_design_templates' });
      } else {
        steps.push({
          id: 'generate_design_templates',
          ok: true,
          detail: `types_sufficient=${typeCov.typeCount}`,
        });
      }
    } catch (err) {
      steps.push({
        id: 'template_type_coverage',
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Visual identity enrich when vibe missing (even if PPR already passes)
  if (gapIds.has('vibe_profile_missing')) {
    try {
      const { runVisualIdentityEnrich } = await import('@/lib/visual-identity-enrich');
      const vibeEnrich = await runVisualIdentityEnrich(tenantId, forwardHeaders, {
        force: true,
        timeoutMs: 240_000,
      });
      steps.push({
        id: 'visual_identity_enrich',
        ok: vibeEnrich.ok,
        detail: vibeEnrich.detail,
      });
      if (vibeEnrich.ok) {
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
    } catch (err) {
      steps.push({
        id: 'visual_identity_enrich',
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // PPR repair — sector sync, Fal visual_dna, confirmed typography / theme layers
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

    // Sector / SP alignment — always reconcile when flagged (even if score ≥ threshold)
    if (pprMissing.has('sector_consistency') || gapIds.has('sector_sp_mismatch')) {
      const ctxRes = await fetchCrewBackendJson<Record<string, unknown>>(
        `/api/v1/brand-context/${tenantId}`,
        { workspaceId: tenantId, timeoutMs: 15_000, headers: forwardHeaders },
      );
      const syncPatch = ctxRes.ok && ctxRes.data
        ? buildSectorSyncPatch(ctxRes.data)
        : null;
      if (syncPatch) {
        const body: Record<string, unknown> = {};
        if (syncPatch.business_type) body.business_type = syncPatch.business_type;
        if (syncPatch.brand_service_profile) {
          body.brand_service_profile = syncPatch.brand_service_profile;
        }
        const patchRes = await fetchCrewBackendJson<Record<string, unknown>>(
          `/api/v1/brand-context/${tenantId}`,
          {
            method: 'PATCH',
            workspaceId: tenantId,
            timeoutMs: 30_000,
            headers: forwardHeaders,
            body,
          },
        );
        steps.push({
          id: 'sector_sync',
          ok: patchRes.ok,
          detail: patchRes.ok ? syncPatch.detail : (patchRes.error ?? `HTTP ${patchRes.status}`),
        });

        if (patchRes.ok && syncPatch.rebuildIndustryCalendar) {
          const calRes = await fetchCrewBackendJson<{ industry_type?: string }>(
            `/api/v1/brand-context/${tenantId}/industry-intelligence`,
            {
              method: 'POST',
              workspaceId: tenantId,
              timeoutMs: 180_000,
              headers: forwardHeaders,
              body: {},
            },
          );
          steps.push({
            id: 'industry_calendar_after_sector',
            ok: calRes.ok,
            detail: calRes.ok
              ? (calRes.data?.industry_type ?? 'rebuilt')
              : (calRes.error ?? 'calendar_rebuild_skipped'),
          });
        }

        // Refresh Nexus CompanyProfile.industry from authoritative Python sector
        steps.push({
          ...(await postInternal(
            `/api/brand-context/${tenantId}/hydrate-company-profile`,
            tenantId,
            forwardHeaders,
            60_000,
          )),
          id: 'hydrate_after_sector_sync',
        });
      } else {
        steps.push({
          id: 'sector_sync',
          ok: true,
          detail: 'already_aligned',
        });
      }
    }

    const sectorJustSynced = steps.some(
      (s) => s.id === 'sector_sync' && s.ok && s.detail !== 'already_aligned',
    );
    const needsPprRepair = pprScore < PRODUCTION_PROFILE_THRESHOLD
      || pprMissing.has('production_visual_dna')
      || pprMissing.has('production_theme_layers')
      || pprMissing.has('service_profile')
      || sectorJustSynced;

    if (needsPprRepair) {
      const needsVisualDna = pprMissing.has('production_visual_dna') || sectorJustSynced;
      const needsThemeLayers = pprMissing.has('production_theme_layers') || sectorJustSynced;

      if (
        (needsVisualDna || needsThemeLayers)
        && !steps.some((s) => s.id === 'visual_identity_enrich')
      ) {
        const { runVisualIdentityEnrich } = await import('@/lib/visual-identity-enrich');
        const vibeEnrich = await runVisualIdentityEnrich(tenantId, forwardHeaders, {
          timeoutMs: 240_000,
        });
        steps.push({
          id: 'visual_identity_enrich',
          ok: vibeEnrich.ok,
          detail: vibeEnrich.detail,
        });
      }

      if (
        (needsVisualDna || needsThemeLayers || pprMissing.has('service_profile'))
        && !steps.some((s) => s.id === 'production_design_profile')
      ) {
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
        const sector = resolveAuthoritativeIndustry(ctxRes.data ?? {}) || 'general_business';
        const themeRes = await fetch(`${origin}/api/brand-context/${tenantId}/theme`, {
          headers: { 'X-Tenant-Id': tenantId, ...forwardHeaders },
          signal: AbortSignal.timeout(30_000),
        });
        const themeJson = themeRes.ok
          ? ((await themeRes.json()) as { theme?: Record<string, unknown> | null })
          : { theme: null };
        const theme = themeJson.theme ?? {};
        if (!isTypographyDesignConfirmed(theme)) {
          const dna = typeof (ctxRes.data as { visual_dna?: string } | undefined)?.visual_dna === 'string'
            ? String((ctxRes.data as { visual_dna?: string }).visual_dna)
            : null;
          const suggested = resolveSuggestedTypographyConfig(theme, sector, dna);
          const confirmed = buildUserConfirmedTypographyPatch(suggested);
          const postDefaults = resolvePostDesignDefaultsForTypography(confirmed);
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
                typography_design: confirmed,
                postDesignDefaults: postDefaults,
                post_design_defaults: postDefaults,
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

        // Analyze can wipe production visual_dna / typography confirmedAt.
        // Re-seal sector, PDP, and typography so PPR does not regress after rediscovery.
        if (analyzeRes.ok) {
          let afterCtx = await fetchCrewBackendJson<Record<string, unknown>>(
            `/api/v1/brand-context/${tenantId}`,
            { workspaceId: tenantId, timeoutMs: 15_000, headers: forwardHeaders },
          );
          const resealPatch = afterCtx.ok && afterCtx.data
            ? buildSectorSyncPatch(afterCtx.data)
            : null;
          if (resealPatch) {
            const body: Record<string, unknown> = {};
            if (resealPatch.business_type) body.business_type = resealPatch.business_type;
            if (resealPatch.brand_service_profile) {
              body.brand_service_profile = resealPatch.brand_service_profile;
            }
            const resealRes = await fetchCrewBackendJson<Record<string, unknown>>(
              `/api/v1/brand-context/${tenantId}`,
              {
                method: 'PATCH',
                workspaceId: tenantId,
                timeoutMs: 30_000,
                headers: forwardHeaders,
                body,
              },
            );
            steps.push({
              id: 'sector_reseal_after_discovery',
              ok: resealRes.ok,
              detail: resealRes.ok
                ? resealPatch.detail
                : (resealRes.error ?? `HTTP ${resealRes.status}`),
            });
          }

          const dnaAfter = typeof afterCtx.data?.visual_dna === 'string'
            ? String(afterCtx.data.visual_dna)
            : '';
          if (!isProductionFormatVisualDna(dnaAfter)) {
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
              id: 'production_design_profile_after_discovery',
              ok: pdpRes.ok,
              detail: pdpRes.ok
                ? (pdpRes.data?.profile?.source ?? 'derived')
                : (pdpRes.error ?? `HTTP ${pdpRes.status}`),
            });
            afterCtx = await fetchCrewBackendJson<Record<string, unknown>>(
              `/api/v1/brand-context/${tenantId}`,
              { workspaceId: tenantId, timeoutMs: 15_000, headers: forwardHeaders },
            );
          }

          const origin = getNextjsInternalOrigin();
          const themeRes = await fetch(`${origin}/api/brand-context/${tenantId}/theme`, {
            headers: { 'X-Tenant-Id': tenantId, ...forwardHeaders },
            signal: AbortSignal.timeout(30_000),
          });
          const themeJson = themeRes.ok
            ? ((await themeRes.json()) as { theme?: Record<string, unknown> | null })
            : { theme: null };
          const theme = themeJson.theme ?? {};
          if (!isTypographyDesignConfirmed(theme)) {
            const sector = resolveAuthoritativeIndustry(afterCtx.data ?? {}) || 'general_business';
            const dna = typeof afterCtx.data?.visual_dna === 'string'
              ? String(afterCtx.data.visual_dna)
              : null;
            const suggested = resolveSuggestedTypographyConfig(theme, sector, dna);
            const confirmed = buildUserConfirmedTypographyPatch(suggested);
            const postDefaults = resolvePostDesignDefaultsForTypography(confirmed);
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
                  typography_design: confirmed,
                  postDesignDefaults: postDefaults,
                  post_design_defaults: postDefaults,
                },
              }),
              signal: AbortSignal.timeout(45_000),
            });
            steps.push({
              id: 'typography_reseal_after_discovery',
              ok: putRes.ok,
              detail: putRes.ok ? confirmed.vibe : `HTTP ${putRes.status}`,
            });
          }
        }
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

  brsCache.delete(tenantId);

  return {
    ok: Boolean(pyRes.data?.ok) || okSteps > 0,
    gapsBefore,
    gapsAfter,
    steps,
    resolvedCount,
  };
}
