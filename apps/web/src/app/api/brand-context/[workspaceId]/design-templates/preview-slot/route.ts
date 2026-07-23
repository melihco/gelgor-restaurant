/**
 * POST /api/brand-context/{workspaceId}/design-templates/preview-slot
 *
 * Per catalog slot: regenerate one template preview or compare intensity variants.
 * Optional persist updates the locked brand_design_templates row.
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import { fetchGalleryContext } from '@/app/api/auto-produce/gallery-context';
import { fetchBrandProductionTokensForWorkspace } from '@/lib/brand-production-tokens';
import { resolveAuthoritativeIndustry } from '@/lib/canonical-sector';
import { getSectorImageNegativeGuards } from '@/lib/sector-production-profile';
import { buildDesignPresetFromCatalogSlot } from '@/lib/catalog-design-template-presets';
import {
  generateSingleDesignTemplatePreset,
  type GeneratedDesignTemplate,
} from '@/lib/brand-design-template-engine';
import { resolveSectorSlotsWithPackFallback } from '@/lib/production-slot-catalog';
import {
  applyFalProductionOverridesToTheme,
  FAL_SLOT_COMPARE_INTENSITIES,
  intensityChannelForCatalogFormat,
  resolveFalTemplateProductionSettings,
  type BrandFalTemplateProductionConfig,
} from '@/lib/fal-template-production-settings';
import { FAL_DESIGN_INTENSITY_LABELS, type FalDesignIntensityLevel } from '@/lib/fal-design-intensity';
import { distillBrandSoul } from '@/lib/fal-brand-input';
import { isTypographyDesignConfirmed, resolveSuggestedTypographyConfig } from '@/lib/typography-design-policy';
import { invalidateDesignTemplateCache } from '@/lib/brand-design-template-matcher';
import type { ProductionSlotDefinition } from '@/lib/production-slot-catalog';

export const runtime = 'nodejs';
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

type PreviewMode = 'regenerate' | 'compare';

interface PreviewVariantResult {
  label: string;
  intensity: FalDesignIntensityLevel;
  thumbnail_url: string | null;
  design_spec: GeneratedDesignTemplate['design_spec'];
  generator: GeneratedDesignTemplate['design_spec']['generator'];
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const body = await req.json().catch(() => ({})) as {
    catalog_slot_key?: string;
    sector?: string;
    mode?: PreviewMode;
    persist?: boolean;
    template_id?: string;
    /** Brand Hub alt yazı toggle — when set, regenerate respects headline-only vs support. */
    show_subline?: boolean;
    parameter_overrides?: Partial<BrandFalTemplateProductionConfig>;
    compare_intensities?: FalDesignIntensityLevel[];
  };

  const catalogSlotKey = String(body.catalog_slot_key ?? '').trim();
  if (!catalogSlotKey) {
    return NextResponse.json({ error: 'catalog_slot_key_required' }, { status: 400 });
  }

  const mode: PreviewMode = body.mode === 'compare' ? 'compare' : 'regenerate';

  const [ctxRes, analysisRes, themeRes] = await Promise.all([
    fetchCrewBackendJson<Record<string, unknown>>(
      `/api/v1/brand-context/${workspaceId}`,
      { workspaceId, timeoutMs: 15_000 },
    ),
    fetchCrewBackendJson<Record<string, unknown>>(
      `/api/v1/brand-context/${workspaceId}/gallery-analysis`,
      { workspaceId, timeoutMs: 20_000 },
    ),
    fetchCrewBackendJson<{ theme?: Record<string, unknown> }>(
      `/api/v1/brand-context/${workspaceId}/theme`,
      { workspaceId, timeoutMs: 15_000 },
    ),
  ]);

  if (!ctxRes.ok || !ctxRes.data) {
    return NextResponse.json({ error: 'brand_context_unavailable' }, { status: 502 });
  }

  const brandCtx = ctxRes.data;
  const sector = body.sector
    || resolveAuthoritativeIndustry(brandCtx)
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

  const slotsRes = await fetchCrewBackendJson<ProductionSlotDefinition[]>(
    `/api/v1/slot-catalog/sectors/${encodeURIComponent(sector)}/slots?scope=visible&workspace_id=${encodeURIComponent(workspaceId)}`,
    { workspaceId, timeoutMs: 15_000 },
  );
  const dbSlots = slotsRes.ok && Array.isArray(slotsRes.data) ? slotsRes.data : [];
  // Match Brand Hub gallery: stale/partial DB catalogs still resolve pack slots
  // (e.g. beach_club_daybed_offer_post added after initial seed).
  const sectorSlots = resolveSectorSlotsWithPackFallback(sector, dbSlots);
  let slot = sectorSlots.find((s) => s.slot_key === catalogSlotKey) ?? null;

  if (!slot) {
    const oneRes = await fetchCrewBackendJson<ProductionSlotDefinition>(
      `/api/v1/slot-catalog/slots/${encodeURIComponent(catalogSlotKey)}`,
      { workspaceId, timeoutMs: 10_000 },
    );
    if (oneRes.ok && oneRes.data?.slot_key) {
      slot = oneRes.data;
    }
  }

  if (!slot) {
    return NextResponse.json({ error: 'catalog_slot_not_found', catalog_slot_key: catalogSlotKey }, { status: 404 });
  }

  const [gctx, tokens] = await Promise.all([
    fetchGalleryContext(
      workspaceId,
      brandCtx,
      (analysisRes.ok ? analysisRes.data : null) as Record<string, unknown> | null,
      sector,
    ),
    fetchBrandProductionTokensForWorkspace(workspaceId, { sector, brandName: String(brandCtx.business_name ?? 'Brand') }),
  ]);

  if (!gctx.hasPhotos) {
    return NextResponse.json({ error: 'no_gallery_photos' }, { status: 422 });
  }

  const themeAnti = Array.isArray(brandTheme?.anti_patterns)
    ? (brandTheme!.anti_patterns as string[])
    : [];
  const antiPatterns = [
    ...getSectorImageNegativeGuards(sector),
    ...themeAnti,
  ].map((item) => String(item).trim()).filter(Boolean).slice(0, 8);

  const preset = buildDesignPresetFromCatalogSlot(slot);
  const channel = intensityChannelForCatalogFormat(slot.format);
  const baseSettings = resolveFalTemplateProductionSettings(brandTheme);

  // Prefer a different gallery photo + craft family than the locked preview.
  let previousGalleryRef: string | null = null;
  let forceShowSubline: boolean | null =
    typeof body.show_subline === 'boolean' ? body.show_subline : null;
  if (body.template_id) {
    const existingRes = await fetchCrewBackendJson<{
      thumbnail_url?: string | null;
      design_spec?: Record<string, unknown> | null;
    }>(
      `/api/v1/design-templates/${workspaceId}/${body.template_id}`,
      { workspaceId, timeoutMs: 15_000 },
    );
    if (existingRes.ok && existingRes.data) {
      const spec = existingRes.data.design_spec;
      const ref = typeof spec?.galleryRef === 'string' ? spec.galleryRef.trim() : '';
      previousGalleryRef = ref || null;
      if (forceShowSubline === null && spec) {
        const raw = spec.showSubline ?? spec.show_subline;
        if (typeof raw === 'boolean') forceShowSubline = raw;
      }
    }
  }

  const engineBase = {
    workspaceId,
    sector,
    brandName: String(brandCtx.business_name ?? 'Brand'),
    brandColors: { primary: tokens.primaryColor, accent: tokens.accentColor },
    logoUrl: typeof brandCtx.logo_url === 'string' ? brandCtx.logo_url : undefined,
    location: typeof brandCtx.location === 'string' ? brandCtx.location : undefined,
    locale: String(brandCtx.languages ?? 'tr').split(/[,\s]/)[0] || 'tr',
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
    concurrency: 1,
  };

  const variants: PreviewVariantResult[] = [];
  let regenerateResult: GeneratedDesignTemplate | null = null;
  const layoutFamilySalt = `${mode}:${Date.now().toString(36)}`;
  const excludeGalleryUrls = previousGalleryRef ? [previousGalleryRef] : undefined;

  if (mode === 'compare') {
    const levels = (Array.isArray(body.compare_intensities) && body.compare_intensities.length
      ? body.compare_intensities
      : FAL_SLOT_COMPARE_INTENSITIES) as FalDesignIntensityLevel[];

    for (const level of levels) {
      const generated = await generateSingleDesignTemplatePreset(
        engineBase,
        preset,
        {
          productionOverrides: {
            ...(body.parameter_overrides ?? {}),
            intensity: {
              ...baseSettings.intensity,
              [channel]: level,
            },
          },
          excludeGalleryUrls,
          layoutFamilySalt: `${layoutFamilySalt}:${level}`,
          forceShowSubline,
        },
      );
      variants.push({
        label: FAL_DESIGN_INTENSITY_LABELS[level]?.tr ?? level,
        intensity: generated.design_spec.designIntensityLevel ?? level,
        thumbnail_url: generated.thumbnail_url,
        design_spec: generated.design_spec,
        generator: generated.design_spec.generator,
      });
    }
  } else {
    const generated = await generateSingleDesignTemplatePreset(
      engineBase,
      preset,
      {
        productionOverrides: body.parameter_overrides,
        excludeGalleryUrls,
        layoutFamilySalt,
        forceShowSubline,
      },
    );
    regenerateResult = generated;
    variants.push({
      label: 'Güncel parametreler',
      intensity: generated.design_spec.designIntensityLevel
        ?? baseSettings.intensity[channel],
      thumbnail_url: generated.thumbnail_url,
      design_spec: generated.design_spec,
      generator: generated.design_spec.generator,
    });
  }

  const producedCount = variants.filter((v) => Boolean(v.thumbnail_url)).length;
  if (producedCount === 0) {
    return NextResponse.json(
      {
        error: 'preview_generation_failed',
        message:
          'Slot görseli üretilemedi (OpenAI/Fal çıktı vermedi). Model kalitesi, API kotası ve galeri fotoğraflarını kontrol edin.',
        workspaceId,
        catalog_slot_key: catalogSlotKey,
        slot_label: slot.label_tr,
        mode,
        channel,
        variants,
        persisted: false,
      },
      { status: 502 },
    );
  }

  let persisted = false;
  let persistedTemplate: unknown = null;

  if (body.persist && variants[0]?.thumbnail_url) {
    const chosen = variants[0];
    const designSpec = {
      ...chosen.design_spec,
      catalogSlotKey: catalogSlotKey,
      previewRegeneratedAt: new Date().toISOString(),
    };

    if (body.template_id) {
      const patchRes = await fetchCrewBackendJson(
        `/api/v1/design-templates/${workspaceId}/${body.template_id}`,
        {
          workspaceId,
          method: 'PATCH',
          timeoutMs: 20_000,
          body: {
            thumbnail_url: chosen.thumbnail_url,
            design_spec: designSpec,
          },
        },
      );
      persisted = patchRes.ok;
      persistedTemplate = patchRes.ok ? patchRes.data : null;
    } else if (regenerateResult) {
      const createRes = await fetchCrewBackendJson<GeneratedDesignTemplate[]>(
        `/api/v1/design-templates/${workspaceId}/bulk`,
        {
          workspaceId,
          method: 'POST',
          timeoutMs: 20_000,
          body: {
            templates: [{
              template_type: regenerateResult.template_type,
              template_name: slot.label_tr,
              format: regenerateResult.format,
              thumbnail_url: regenerateResult.thumbnail_url,
              catalog_slot_key: catalogSlotKey,
              sector_category: sector,
              locale: engineBase.locale,
              design_spec: designSpec,
            }],
            archive_existing: false,
          },
        },
      );
      persisted = createRes.ok;
      persistedTemplate = createRes.ok && Array.isArray(createRes.data)
        ? createRes.data[0]
        : null;
    }

    // Next production must bind the fresh thumbnail immediately — not the
    // 60s-stale cached list.
    if (persisted) invalidateDesignTemplateCache(workspaceId);
  }

  return NextResponse.json({
    workspaceId,
    catalog_slot_key: catalogSlotKey,
    slot_label: slot.label_tr,
    mode,
    channel,
    variants,
    persisted,
    template: persistedTemplate,
    typography_confirmed: typographyConfirmed,
    production_settings: resolveFalTemplateProductionSettings(
      applyFalProductionOverridesToTheme(brandTheme, body.parameter_overrides),
    ),
  });
}
