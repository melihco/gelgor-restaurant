/**
 * POST /api/brand-context/{workspaceId}/generate-design-templates
 *
 * Onboarding step: generate a brand-consistent design-template set from the
 * brand's real gallery photos, corporate colors, logo and vibe (Fal.ai grounded
 * design), then persist it to the Python design-templates store so production
 * can re-use the recipes. Returns the generated set for the showcase UI.
 */
import { NextRequest, NextResponse } from 'next/server';
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
import { isTypographyDesignConfirmed, resolveSuggestedTypographyConfig } from '@/lib/typography-design-policy';

export const runtime = 'nodejs';
// Generation runs up to ~10 GPT-image edits — allow a long window.
export const maxDuration = 600;

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const body = await req.json().catch(() => ({})) as {
    limit?: number;
    concurrency?: number;
    locale?: string;
    /** false for partial/smoke runs so existing templates stay active */
    archiveExisting?: boolean;
  };

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
    return NextResponse.json(
      { error: 'brand_context_unavailable', detail: ctxRes.error ?? null },
      { status: 502 },
    );
  }

  const brandCtx = ctxRes.data;
  const galleryAnalysis = (analysisRes.ok ? analysisRes.data : null) ?? null;
  const sector = resolveAuthoritativeIndustry(brandCtx)
    || String(brandCtx.business_type ?? brandCtx.industry ?? '');
  let brandTheme = (themeRes.ok && themeRes.data?.theme && typeof themeRes.data.theme === 'object')
    ? themeRes.data.theme
    : (typeof brandCtx.brand_theme === 'object' ? brandCtx.brand_theme as Record<string, unknown> : null);

  const typographyConfirmed = isTypographyDesignConfirmed(brandTheme);
  if (!typographyConfirmed) {
    const suggested = resolveSuggestedTypographyConfig(brandTheme, sector);
    brandTheme = {
      ...(brandTheme ?? {}),
      typography_design: suggested,
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
    return NextResponse.json(
      { error: 'no_gallery_photos', message: 'Marka galerisinde kullanılabilir görsel yok.' },
      { status: 422 },
    );
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
  }

  return NextResponse.json({
    workspaceId,
    sector,
    typography_design_confirmed: typographyConfirmed,
    generated: result.generated,
    failed: result.failed,
    persisted: persistRes.ok,
    persisted_count: persistRes.ok && Array.isArray(persistRes.data) ? persistRes.data.length : 0,
    persist_status: persistRes.status,
    persist_error: persistRes.ok ? null : {
      error: persistRes.error ?? 'persist_failed',
      detail: persistRes.data ?? null,
    },
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
  });
}
