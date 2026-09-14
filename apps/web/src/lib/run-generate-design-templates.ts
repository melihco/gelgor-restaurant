/**
 * Design-template generation runner — kept out of the Next.js route file
 * because `route.ts` may only export HTTP handlers.
 */
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
import { compileBrandDesignConstitution } from '@/lib/brand-design-constitution';
import {
  mergeHouseFamilyIntoTheme,
  themeNeedsHouseFamilySeal,
} from '@/lib/house-layout-family';
import { distillBrandSoul } from '@/lib/fal-brand-input';
import {
  isTypographyDesignConfirmed,
  resolvePostDesignDefaultsForTypography,
  TYPOGRAPHY_NOT_CONFIRMED,
  typographyNotConfirmedResponse,
} from '@/lib/typography-design-policy';
import {
  ensureSlotCreativeBriefsForAssignments,
  persistSlotCreativeBriefsFromTemplates,
} from '@/lib/slot-creative-library-persist';
import { brsCache } from '@/lib/server-ttl-cache';
import {
  getProductionProviderPreflight,
  httpStatusForProviderPreflight,
} from '@/lib/production-provider-preflight';

export type GenerateBody = {
  limit?: number;
  concurrency?: number;
  locale?: string;
  /** false for partial/smoke runs so existing templates stay active */
  archiveExisting?: boolean;
  /**
   * Regenerate every enabled catalog slot (house identity change) instead of
   * the onboarding preview cap. Without it a capped run must never archive
   * shells it did not repaint.
   */
  fullLibrary?: boolean;
  /** When true, return 202 and run generation via after() */
  background?: boolean;
};

export type GenerateSuccess = {
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

export async function validateGenerationPrereqs(workspaceId: string): Promise<
  | { ok: true }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
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

  const themeFromApi = themeRes.ok && themeRes.data?.theme && typeof themeRes.data.theme === 'object'
    ? themeRes.data.theme
    : null;
  const themeFromCtx = typeof brandCtx.brand_theme === 'object' && brandCtx.brand_theme
    ? brandCtx.brand_theme as Record<string, unknown>
    : null;
  if (!isTypographyDesignConfirmed(themeFromApi ?? themeFromCtx)) {
    return {
      ok: false,
      status: 422,
      body: typographyNotConfirmedResponse(),
    };
  }

  const preflight = getProductionProviderPreflight();
  if (!preflight.ok) {
    return {
      ok: false,
      status: httpStatusForProviderPreflight(preflight.code),
      body: {
        error: preflight.code ?? 'provider_unavailable',
        message: preflight.reason
          ?? 'Görsel motor kotası yok — fallback yok, set üretilmez.',
      },
    };
  }

  return { ok: true };
}

export async function runGenerateDesignTemplates(
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
  if (!typographyConfirmed) {
    throw new Error(TYPOGRAPHY_NOT_CONFIRMED);
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

  const serviceProfile = parseMaybeJsonRecord(
    brandCtx.brand_service_profile
    ?? brandCtx.service_profile
    ?? brandTheme?.service_profile
    ?? brandTheme?.serviceProfile,
  );
  const constitution = compileBrandDesignConstitution({
    brandName,
    sector,
    location: typeof brandCtx.location === 'string' ? brandCtx.location : undefined,
    brandTheme,
    visualDna: typeof brandCtx.visual_dna === 'string' ? brandCtx.visual_dna : undefined,
    visualDnaTone: distillBrandSoul({
      visualDna: brandCtx.visual_dna as string | undefined,
      brandTone: brandCtx.brand_tone as string | undefined,
      brandDescription: brandCtx.description as string | undefined,
    }),
    brandTone: typeof brandCtx.brand_tone === 'string' ? brandCtx.brand_tone : undefined,
    vibeProfile: parseMaybeJsonRecord(brandCtx.brand_vibe_profile),
    serviceProfile,
    discoveryOutputs: brandCtx.discovery_outputs ?? brandCtx.discoveryOutputs,
    contentPillars: parseMaybeStringArray(brandCtx.content_pillars),
    defaultCtas: parseMaybeStringArray(brandCtx.default_ctas),
    antiPatterns,
    tokens: {
      headingFont: tokens.headingFont,
      bodyFont: tokens.bodyFont,
      primary: tokens.primaryColor,
      accent: tokens.accentColor,
    },
    referenceImageUrls: brandCtx.reference_image_urls ?? brandCtx.referenceImageUrls,
  });
  const shouldSealHouseFamily = themeNeedsHouseFamilySeal(
    brandTheme,
    constitution.signatureArchetypes,
  );
  if (shouldSealHouseFamily) {
    brandTheme = mergeHouseFamilyIntoTheme(brandTheme, constitution.signatureArchetypes);
  }

  // ── Slot catalog bootstrap + catalog-driven presets (Faz 3) ─────────────────
  const productionSettings = resolveFalTemplateProductionSettings(brandTheme);
  const catalogPresets = await resolveOnboardingDesignPresetsFromCatalog(
    workspaceId,
    sector,
    {
      limit: body.limit ?? (body.fullLibrary ? Number.MAX_SAFE_INTEGER : productionSettings.preview_cap),
      constitution,
      templateNeeds: constitution.templateNeeds,
    },
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
    antiPatterns: constitution.antiPatterns,
    signatureOfferings: constitution.signatureOfferings,
    composeMode: constitution.composeMode,
    headingFont: constitution.headingFont,
    typeEnergy: constitution.typeEnergy,
    layoutPackId: constitution.layoutPackId,
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
      serviceProfile,
    },
    brandTheme,
    antiPatterns,
    constitution,
    galleryPhotoUrls: gctx.photos,
    galleryAnalysis: gctx.meta,
    concurrency: body.concurrency ?? productionSettings.concurrency,
    presets: catalogPresets.presets,
    templatePreviewMode: true,
    slotCreativeByKey,
  });

  // ── Persist (bulk upsert replaces prior auto-generated set) ────────────────
  const persistableTemplates = result.templates.filter((t) => Boolean(t.thumbnail_url));
  // Archive the whole live set only when this run repainted every enabled slot.
  // A capped or partly failed run keeps the shells it did not repaint; the
  // backend still archives the colliding keys (archive_existing=false).
  const persistedKeys = new Set(
    persistableTemplates
      .map((t) => String((t as { catalog_slot_key?: string | null }).catalog_slot_key ?? '').trim())
      .filter(Boolean),
  );
  const coversEveryEnabledSlot = catalogPresets.enabledSlotCount > 0
    && persistedKeys.size >= catalogPresets.enabledSlotCount;
  const archiveExisting = body.archiveExisting !== false && coversEveryEnabledSlot;
  if (body.archiveExisting !== false && !archiveExisting) {
    console.warn(
      `[generate-design-templates] partial library run (${persistedKeys.size}/${catalogPresets.enabledSlotCount} slots) `
      + '— keeping shells that were not repainted (collision-only archive)',
    );
  }
  const persistRes = persistableTemplates.length > 0
    ? await fetchCrewBackendJson<GeneratedDesignTemplate[]>(
      `/api/v1/design-templates/${workspaceId}/bulk`,
      {
        workspaceId,
        method: 'POST',
        timeoutMs: 60_000,
        body: {
          templates: persistableTemplates,
          archive_existing: archiveExisting,
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
    // House family seal only — generate never stamps typography confirm.
    if (shouldSealHouseFamily) {
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
        if (!sealRes.ok) {
          console.warn(
            `[generate-design-templates] house-family seal failed for ${workspaceId}:`,
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
