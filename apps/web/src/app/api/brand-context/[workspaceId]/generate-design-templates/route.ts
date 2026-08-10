/**
 * POST /api/brand-context/{workspaceId}/generate-design-templates
 *
 * Onboarding step: generate a brand-consistent design-template set from the
 * brand's real gallery photos, corporate colors, logo and vibe (Fal.ai grounded
 * design), then persist it to the Python design-templates store so production
 * can re-use the recipes. Returns the generated set for the showcase UI.
 *
 * With `background: true`, validates quickly and returns 202; slot bootstrap +
 * template generation run after the response via Next.js `after()`.
 */
import { NextRequest, NextResponse, after } from 'next/server';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import { fetchGalleryContext } from '@/app/api/auto-produce/gallery-context';
import { fetchBrandProductionTokensForWorkspace } from '@/lib/brand-production-tokens';
import { resolveAuthoritativeIndustry } from '@/lib/canonical-sector';
import { getSectorImageNegativeGuards } from '@/lib/sector-production-profile';
import {
  generateBrandDesignTemplates,
  type GeneratedDesignTemplate,
} from '@/lib/brand-design-template-engine';
import { resolveFalTemplateProductionSettings } from '@/lib/fal-template-production-settings';
import { resolveOnboardingDesignPresetsFromCatalog } from '@/lib/catalog-design-template-presets';
import { distillBrandSoul } from '@/lib/fal-brand-input';
import {
  buildUserConfirmedTypographyPatch,
  isTypographyDesignConfirmed,
  resolvePostDesignDefaultsForTypography,
  resolveSuggestedTypographyConfig,
} from '@/lib/typography-design-policy';
import {
  ensureSlotCreativeBriefsForAssignments,
  persistSlotCreativeBriefsFromTemplates,
} from '@/lib/slot-creative-library-persist';
import { brsCache } from '@/lib/server-ttl-cache';
import {
  getDesignTemplateJobStatusByWorkspace,
  isDesignTemplateJobInFlight,
  setDesignTemplateJobStatus,
} from '@/lib/design-template-job-status';

export const runtime = 'nodejs';
// Generation runs up to ~10 GPT-image edits — allow a long window.
export const maxDuration = 600;

type GenerateBody = {
  limit?: number;
  concurrency?: number;
  locale?: string;
  /** false for partial/smoke runs so existing templates stay active */
  archiveExisting?: boolean;
  /** When true, return 202 and run generation via after() */
  background?: boolean;
};

type GenerateSuccess = {
  workspaceId: string;
  sector: string;
  typography_design_confirmed: boolean;
  generated: number;
  failed: number;
  persisted: boolean;
  persisted_count: number;
  persist_status: number;
  persist_error: { error: string; detail: unknown } | null;
  creative_briefs_seeded: number;
  creative_briefs_persisted: number;
  catalog: {
    source: string;
    enabled_slot_count: number;
    selected_slot_count: number;
    bootstrapped: boolean;
    production_settings: {
      preview_cap: number;
      concurrency: number;
      intensity: unknown;
    };
  };
  templates: GeneratedDesignTemplate[];
};

function parseMaybeJsonRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function parseMaybeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).filter(Boolean);
  }
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item ?? '').trim()).filter(Boolean);
  } catch {
    /* fall through */
  }
  return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
}

async function validateGenerationPrereqs(workspaceId: string): Promise<
  | { ok: true }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const [ctxRes, analysisRes] = await Promise.all([
    fetchCrewBackendJson<Record<string, unknown>>(
      `/api/v1/brand-context/${workspaceId}`,
      { workspaceId, timeoutMs: 15_000 },
    ),
    fetchCrewBackendJson<Record<string, unknown>>(
      `/api/v1/brand-context/${workspaceId}/gallery-analysis`,
      { workspaceId, timeoutMs: 20_000 },
    ),
  ]);

  if (!ctxRes.ok || !ctxRes.data) {
    return {
      ok: false,
      status: 502,
      body: { error: 'brand_context_unavailable', detail: ctxRes.error ?? null },
    };
  }

  const brandCtx = ctxRes.data;
  const galleryAnalysis = (analysisRes.ok ? analysisRes.data : null) ?? null;
  const sector = resolveAuthoritativeIndustry(brandCtx)
    || String(brandCtx.business_type ?? brandCtx.industry ?? '');
  const gctx = await fetchGalleryContext(
    workspaceId,
    brandCtx,
    galleryAnalysis as Record<string, unknown> | null,
    sector,
  );

  if (!gctx.hasPhotos) {
    return {
      ok: false,
      status: 422,
      body: {
        error: 'no_gallery_photos',
        message: 'Marka galerisinde kullanılabilir görsel yok.',
      },
    };
  }

  return { ok: true };
}

async function runGenerateDesignTemplates(
  workspaceId: string,
  body: GenerateBody,
): Promise<GenerateSuccess> {
  // ── Load brand context + gallery analysis + special days from Python ───────
  const [ctxRes, analysisRes, specialDaysRes, themeRes] = await Promise.all([
    fetchCrewBackendJson<Record<string, unknown>>(
      `/api/v1/brand-context/${workspaceId}`,
      { workspaceId, timeoutMs: 15_000 },
    ),
    fetchCrewBackendJson<Record<string, unknown>>(
      `/api/v1/brand-context/${workspaceId}/gallery-analysis`,
      { workspaceId, timeoutMs: 20_000 },
    ),
    fetchCrewBackendJson<{
      country_code?: string;
      days?: Array<{ name: string; theme_hint: string; mmdd: string; category: string; days_until: number }>;
    }>(
      `/api/v1/special-days/workspace/${workspaceId}?limit=4`,
      { workspaceId, timeoutMs: 15_000 },
    ),
    fetchCrewBackendJson<{ theme?: Record<string, unknown> }>(
      `/api/v1/brand-context/${workspaceId}/theme`,
      { workspaceId, timeoutMs: 15_000 },
    ),
  ]);

  if (!ctxRes.ok || !ctxRes.data) {
    throw new Error(`brand_context_unavailable:${ctxRes.error ?? 'unknown'}`);
  }

  const brandCtx = ctxRes.data;
  const galleryAnalysis = (analysisRes.ok ? analysisRes.data : null) ?? null;
  const sector = resolveAuthoritativeIndustry(brandCtx)
    || String(brandCtx.business_type ?? brandCtx.industry ?? '');
  let brandTheme = (themeRes.ok && themeRes.data?.theme && typeof themeRes.data.theme === 'object')
    ? themeRes.data.theme
    : (typeof brandCtx.brand_theme === 'object' ? brandCtx.brand_theme as Record<string, unknown> : null);

  const typographyConfirmed = isTypographyDesignConfirmed(brandTheme);
  const visualDnaForTypo = typeof brandCtx.visual_dna === 'string' ? brandCtx.visual_dna : null;
  let typographyUsedForGenerate = typographyConfirmed;
  if (!typographyConfirmed) {
    const suggested = resolveSuggestedTypographyConfig(brandTheme, sector, visualDnaForTypo);
    const confirmed = buildUserConfirmedTypographyPatch(suggested);
    brandTheme = {
      ...(brandTheme ?? {}),
      typography_design: confirmed,
      typographyDesign: confirmed,
    };
  }
  const themeAnti = Array.isArray(brandTheme?.anti_patterns)
    ? (brandTheme!.anti_patterns as string[])
    : [];
  const antiPatterns = [
    ...getSectorImageNegativeGuards(sector),
    ...themeAnti,
  ].map((item) => String(item).trim()).filter(Boolean).slice(0, 8);
  const brandName = String(brandCtx.business_name ?? 'Brand');
  const locale = body.locale
    ?? (String(brandCtx.languages ?? 'tr').split(/[,\s]/)[0] || 'tr');

  // Country special days (international + national) for event_special templates.
  const countryCode = specialDaysRes.ok ? specialDaysRes.data?.country_code : undefined;
  const specialDays = (specialDaysRes.ok ? specialDaysRes.data?.days ?? [] : []).map((d) => ({
    name: d.name,
    themeHint: d.theme_hint,
    mmdd: d.mmdd,
    category: d.category,
    daysUntil: d.days_until,
  }));

  // ── Resolve gallery + brand tokens in parallel ─────────────────────────────
  const [gctx, tokens] = await Promise.all([
    fetchGalleryContext(
      workspaceId,
      brandCtx,
      galleryAnalysis as Record<string, unknown> | null,
      sector,
    ),
    fetchBrandProductionTokensForWorkspace(workspaceId, { sector, brandName }),
  ]);

  if (!gctx.hasPhotos) {
    throw new Error('no_gallery_photos');
  }

  // ── Slot catalog bootstrap + catalog-driven presets (Faz 3) ─────────────────
  const productionSettings = resolveFalTemplateProductionSettings(brandTheme);
  const catalogPresets = await resolveOnboardingDesignPresetsFromCatalog(
    workspaceId,
    sector,
    { limit: body.limit ?? productionSettings.preview_cap },
  );
  console.log(
    `[generate-design-templates] catalog presets source=${catalogPresets.source} `
    + `sector=${catalogPresets.sectorId} enabled=${catalogPresets.enabledSlotCount} `
    + `selected=${catalogPresets.selectedSlotCount} bootstrapped=${catalogPresets.bootstrapped}`,
  );

  // Fill empty assignment.customization for every enabled slot before generate
  // so library shells are purpose-built (brand×slot), not generic/holiday chrome.
  const {
    byKey: slotCreativeByKey,
    assignments: slotAssignments,
    seededCount: slotCreativesSeeded,
  } = await ensureSlotCreativeBriefsForAssignments(workspaceId, {
    brandName,
    location: typeof brandCtx.location === 'string' ? brandCtx.location : undefined,
    visualDna: typeof brandCtx.visual_dna === 'string' ? brandCtx.visual_dna : undefined,
    brandTone: typeof brandCtx.brand_tone === 'string' ? brandCtx.brand_tone : undefined,
  });
  if (slotCreativesSeeded > 0) {
    console.log(
      `[generate-design-templates] seeded slot creative briefs: ${slotCreativesSeeded}`,
    );
  }

  // ── Generate ───────────────────────────────────────────────────────────────
  const result = await generateBrandDesignTemplates({
    workspaceId,
    sector,
    brandName,
    brandColors: { primary: tokens.primaryColor, accent: tokens.accentColor },
    logoUrl: typeof brandCtx.logo_url === 'string' ? brandCtx.logo_url : undefined,
    location: typeof brandCtx.location === 'string' ? brandCtx.location : undefined,
    locale,
    countryCode,
    specialDays,
    visualDnaTone: distillBrandSoul({
      visualDna: brandCtx.visual_dna as string | undefined,
      brandTone: brandCtx.brand_tone as string | undefined,
      brandDescription: brandCtx.description as string | undefined,
    }),
    brandIntelligence: {
      description: typeof brandCtx.description === 'string' ? brandCtx.description : undefined,
      brandTone: typeof brandCtx.brand_tone === 'string' ? brandCtx.brand_tone : undefined,
      visualDna: typeof brandCtx.visual_dna === 'string' ? brandCtx.visual_dna : undefined,
      visualStyle: typeof brandCtx.visual_style === 'string' ? brandCtx.visual_style : undefined,
      targetAudience: typeof brandCtx.target_audience === 'string' ? brandCtx.target_audience : undefined,
      campaignGoals: typeof brandCtx.campaign_goals === 'string' ? brandCtx.campaign_goals : undefined,
      contentPillars: parseMaybeStringArray(brandCtx.content_pillars),
      defaultCtas: parseMaybeStringArray(brandCtx.default_ctas),
      vibeProfile: parseMaybeJsonRecord(brandCtx.brand_vibe_profile),
      serviceProfile: parseMaybeJsonRecord(
        brandCtx.service_profile
        ?? brandTheme?.service_profile
        ?? brandTheme?.serviceProfile,
      ),
    },
    brandTheme,
    antiPatterns,
    galleryPhotoUrls: gctx.photos,
    galleryAnalysis: gctx.meta,
    concurrency: body.concurrency ?? productionSettings.concurrency,
    presets: catalogPresets.presets,
    templatePreviewMode: true,
    slotCreativeByKey,
  });

  // ── Persist (bulk upsert replaces prior auto-generated set) ────────────────
  const persistableTemplates = result.templates.filter((t) => Boolean(t.thumbnail_url));
  const persistRes = persistableTemplates.length > 0
    ? await fetchCrewBackendJson<GeneratedDesignTemplate[]>(
      `/api/v1/design-templates/${workspaceId}/bulk`,
      {
        workspaceId,
        method: 'POST',
        timeoutMs: 60_000,
        body: {
          templates: persistableTemplates,
          archive_existing: body.archiveExisting !== false,
        },
      },
    )
    : {
      ok: false,
      status: 422,
      data: null,
      error: 'no_persistable_template_previews',
    };

  if (!persistRes.ok) {
    console.warn(
      `[generate-design-templates] persist failed for ${workspaceId}:`,
      persistRes.error,
      persistRes.data,
    );
  } else {
    const { invalidateDesignTemplateCache } = await import('@/lib/brand-design-template-matcher');
    invalidateDesignTemplateCache(workspaceId);
    // Seal the vibe used for generation so PPR doesn't stay at "Typography vibe not confirmed".
    if (!typographyConfirmed) {
      const typo = (brandTheme?.typography_design ?? brandTheme?.typographyDesign) as
        | Parameters<typeof resolvePostDesignDefaultsForTypography>[0]
        | undefined;
      if (typo) {
        const postDefaults = resolvePostDesignDefaultsForTypography(typo);
        const sealRes = await fetchCrewBackendJson(
          `/api/v1/brand-context/${workspaceId}/theme`,
          {
            workspaceId,
            method: 'PUT',
            timeoutMs: 45_000,
            body: {
              theme: {
                ...(brandTheme ?? {}),
                typography_design: typo,
                post_design_defaults: postDefaults,
              },
            },
          },
        );
        typographyUsedForGenerate = sealRes.ok;
        if (!sealRes.ok) {
          console.warn(
            `[generate-design-templates] typography seal failed for ${workspaceId}:`,
            sealRes.error,
          );
        }
      }
    }
    brsCache.delete(workspaceId);
  }

  let creativeBriefsPersisted = 0;
  try {
    creativeBriefsPersisted = await persistSlotCreativeBriefsFromTemplates(
      workspaceId,
      result.templates,
      slotAssignments,
    );
  } catch (err) {
    console.warn(
      `[generate-design-templates] slot creative persist skipped for ${workspaceId}:`,
      err instanceof Error ? err.message : err,
    );
  }

  return {
    workspaceId,
    sector,
    typography_design_confirmed: typographyConfirmed || typographyUsedForGenerate,
    generated: result.generated,
    failed: result.failed,
    persisted: persistRes.ok,
    persisted_count: persistRes.ok && Array.isArray(persistRes.data) ? persistRes.data.length : 0,
    persist_status: persistRes.status,
    persist_error: persistRes.ok ? null : {
      error: persistRes.error ?? 'persist_failed',
      detail: persistRes.data ?? null,
    },
    creative_briefs_seeded: slotCreativesSeeded,
    creative_briefs_persisted: creativeBriefsPersisted,
    catalog: {
      source: catalogPresets.source,
      enabled_slot_count: catalogPresets.enabledSlotCount,
      selected_slot_count: catalogPresets.selectedSlotCount,
      bootstrapped: catalogPresets.bootstrapped,
      production_settings: {
        preview_cap: productionSettings.preview_cap,
        concurrency: productionSettings.concurrency,
        intensity: productionSettings.intensity,
      },
    },
    templates: persistRes.ok && persistRes.data ? persistRes.data : result.templates,
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const body = await req.json().catch(() => ({})) as GenerateBody;
  const background = body.background === true;

  if (background) {
    const existing = await getDesignTemplateJobStatusByWorkspace(workspaceId);
    if (isDesignTemplateJobInFlight(existing) && existing) {
      return NextResponse.json(
        {
          ok: true,
          queued: true,
          background: true,
          jobId: existing.jobId,
          workspaceId,
          reused: true,
        },
        { status: 202 },
      );
    }

    const prereq = await validateGenerationPrereqs(workspaceId);
    if (!prereq.ok) {
      return NextResponse.json(prereq.body, { status: prereq.status });
    }

    const jobId = crypto.randomUUID();
    await setDesignTemplateJobStatus({
      jobId,
      workspaceId,
      status: 'queued',
      generated: 0,
    });

    after(async () => {
      try {
        await setDesignTemplateJobStatus({
          jobId,
          workspaceId,
          status: 'running',
          generated: 0,
        });
        const result = await runGenerateDesignTemplates(workspaceId, body);
        if (result.generated === 0) {
          console.error(
            '[generate-design-templates] background job generated 0:',
            jobId,
            workspaceId,
          );
          await setDesignTemplateJobStatus({
            jobId,
            workspaceId,
            status: 'failed',
            generated: 0,
            error: 'Şablon üretilemedi',
          });
          return;
        }
        console.info(
          '[generate-design-templates] background job complete:',
          jobId,
          `generated=${result.generated}`,
        );
        await setDesignTemplateJobStatus({
          jobId,
          workspaceId,
          status: 'complete',
          generated: result.generated,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'background generation failed';
        console.error('[generate-design-templates] background job failed:', jobId, message);
        await setDesignTemplateJobStatus({
          jobId,
          workspaceId,
          status: 'failed',
          generated: 0,
          error: message,
        });
      }
    });

    return NextResponse.json(
      {
        ok: true,
        queued: true,
        background: true,
        jobId,
        workspaceId,
        reused: false,
      },
      { status: 202 },
    );
  }

  try {
    const result = await runGenerateDesignTemplates(workspaceId, body);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'generation_failed';
    if (message.startsWith('brand_context_unavailable')) {
      return NextResponse.json(
        { error: 'brand_context_unavailable', detail: message.split(':')[1] ?? null },
        { status: 502 },
      );
    }
    if (message === 'no_gallery_photos') {
      return NextResponse.json(
        {
          error: 'no_gallery_photos',
          message: 'Marka galerisinde kullanılabilir görsel yok.',
        },
        { status: 422 },
      );
    }
    console.error('[generate-design-templates] sync failed:', workspaceId, message);
    return NextResponse.json({ error: 'generation_failed', message }, { status: 500 });
  }
}
