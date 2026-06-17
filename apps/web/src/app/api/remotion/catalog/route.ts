/**
 * GET /api/remotion/catalog — template library + brand kits for UI & showcase.
 */
import { NextResponse } from 'next/server';
import { AGENCY_BRAND_KITS } from '@/lib/agency-brand-kits';
import { filterAgencyVibePicks } from '@/lib/agency-vibe-picks';
import {
  REMOTION_FAMILY_META,
  REMOTION_TEMPLATE_CATALOG,
} from '@/lib/remotion-template-catalog';
import {
  getTemplateEvaluation,
  listRegistrySummary,
} from '@/lib/remotion-template-registry';
import {
  deriveBrandTemplateLibrary,
  libraryToCatalogTemplates,
} from '@/lib/brand-template-library';
import { loadWorkspaceBrandTemplateLibrary } from '@/lib/brand-template-library-workspace';
import { resolveShowcasePresetLibrary } from '@/lib/showcase-preset-libraries';
import { getShowcasePreset, resolveShowcaseBrandKit } from '@/lib/brand-showcase-presets';
import { buildBrandFingerprint } from '@/lib/tenant-template-seed';
import {
  POSTER_FAMILY_META,
  POSTER_TEMPLATE_CATALOG,
  getPosterEvaluation,
} from '@/lib/poster-template-registry';

export const runtime = 'nodejs';

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const family = url.searchParams.get('family');
  const collection = url.searchParams.get('collection');
  const vibePicks = url.searchParams.get('vibe_picks') === '1';
  const kitId = url.searchParams.get('kitId');
  const kind = url.searchParams.get('kind') ?? 'all'; // story | poster | all
  const includeEvaluation = url.searchParams.get('evaluation') === '1';

  const workspaceId = url.searchParams.get('workspaceId') ?? url.searchParams.get('workspace');
  const presetKey = url.searchParams.get('preset');
  const sectorParam = url.searchParams.get('sector');
  const brandMode = url.searchParams.get('brand') === '1' || Boolean(kitId) || Boolean(workspaceId) || Boolean(presetKey);

  let brandLibrary = null;
  let usesSavedLibrary = false;
  let resolvedKitId = kitId ?? AGENCY_BRAND_KITS[0]?.id;

  if (workspaceId) {
    const loaded = await loadWorkspaceBrandTemplateLibrary(workspaceId);
    if (loaded) {
      brandLibrary = loaded.library;
      usesSavedLibrary = loaded.usesSavedLibrary;
      resolvedKitId = loaded.kitId;
    }
  }

  if (!brandLibrary && presetKey) {
    brandLibrary = resolveShowcasePresetLibrary(presetKey);
    if (brandLibrary) resolvedKitId = brandLibrary.kitId;
  }

  if (!brandLibrary && resolvedKitId) {
    const kitSector = AGENCY_BRAND_KITS.find((k) => k.id === resolvedKitId)?.sector ?? 'beach_club';
    const showcasePreset = presetKey ? getShowcasePreset(presetKey) : undefined;
    const kit = resolveShowcaseBrandKit({ kitId: resolvedKitId, presetKey: presetKey ?? undefined });
    const tenantId = workspaceId
      ?? (presetKey ? `showcase_${presetKey}` : undefined)
      ?? url.searchParams.get('diversify');
    const brandFingerprint = buildBrandFingerprint({
      tenantId: tenantId ?? undefined,
      brandName: kit.brandName ?? kit.name,
      primaryColor: kit.primaryColor,
      accentColor: kit.accentColor,
      headingFont: kit.headingFont,
      bodyFont: kit.bodyFont,
      motionStyle: kit.motionStyle,
    });
    brandLibrary = deriveBrandTemplateLibrary({
      kitId: resolvedKitId,
      sector: sectorParam ?? showcasePreset?.sector ?? kitSector,
      tenantId: tenantId ?? undefined,
      brandFingerprint,
    });
  }

  let templates = REMOTION_TEMPLATE_CATALOG;
  if (family) templates = templates.filter((t) => t.family === family);
  if (collection) templates = templates.filter((t) => t.collection === collection);
  if (vibePicks && collection === 'Agency') {
    templates = filterAgencyVibePicks(templates);
  }
  if (brandMode && brandLibrary) {
    templates = REMOTION_TEMPLATE_CATALOG.filter((t) =>
      brandLibrary.slots.some((s) => s.storyTemplateId === t.id),
    );
  } else if (kitId) {
    const kit = AGENCY_BRAND_KITS.find((k) => k.id === kitId);
    if (kit) {
      const allowed = new Set(kit.templateIds);
      templates = templates.filter((t) => allowed.has(t.id));
    }
  }

  const payload = templates.map((t) => ({
    kind: 'story' as const,
    id: t.id,
    family: t.family,
    collection: t.collection,
    nameTr: t.nameTr,
    nameEn: t.nameEn,
    descTr: t.descTr,
    tags: t.tags,
    bestFor: t.bestFor,
    legacyComposition: t.legacyComposition,
    sectors: t.sectors,
    status: t.status,
    formats: ['story'],
    ...(includeEvaluation ? { evaluation: getTemplateEvaluation(t) } : {}),
  }));

  let posters = POSTER_TEMPLATE_CATALOG;
  if (family) posters = posters.filter((t) => t.family === family);
  if (collection) posters = posters.filter((t) => t.collection === collection);
  if (brandMode && brandLibrary) {
    const posterIds = new Set(brandLibrary.slots.map((s) => s.posterTemplateId).filter(Boolean));
    posters = posters.filter((t) => posterIds.has(t.id));
  }

  const brandLibraryTemplates = brandLibrary ? libraryToCatalogTemplates(brandLibrary) : [];

  const posterPayload = posters.map((t) => ({
    kind: 'poster' as const,
    id: t.id,
    family: t.family,
    collection: t.collection,
    nameTr: t.nameTr,
    nameEn: t.nameEn,
    descTr: t.descTr,
    tags: t.tags,
    sectors: t.sectors,
    status: t.status,
    formats: t.formats,
    ...(includeEvaluation ? { evaluation: getPosterEvaluation(t) } : {}),
  }));

  const storySummary = listRegistrySummary();
  const displayTemplates = brandMode && brandLibraryTemplates.length
    ? brandLibraryTemplates
    : (kind === 'poster' ? posterPayload : kind === 'story' ? payload : [...payload, ...posterPayload]);

  return NextResponse.json({
    summary: {
      ...storySummary,
      posterCount: POSTER_TEMPLATE_CATALOG.length,
      posterFamilies: POSTER_FAMILY_META.length,
      totalTemplates: storySummary.templateCount + POSTER_TEMPLATE_CATALOG.length,
      brandLibrarySlots: 5,
      perBrandDesignCount: 5,
    },
    storyFamilies: REMOTION_FAMILY_META,
    posterFamilies: POSTER_FAMILY_META,
    families: REMOTION_FAMILY_META,
    templates: displayTemplates,
    brandLibrary: brandLibrary ?? undefined,
    brandLibraryTemplates,
    workspaceId: workspaceId ?? undefined,
    usesSavedLibrary: workspaceId ? usesSavedLibrary : undefined,
    presetKey: presetKey ?? undefined,
    premiumPreset: Boolean(presetKey && resolveShowcasePresetLibrary(presetKey)),
    storyTemplates: payload,
    posterTemplates: posterPayload,
    brandKits: AGENCY_BRAND_KITS.map((k) => ({
      id: k.id,
      name: k.name,
      sector: k.sector,
      locale: k.locale,
      primaryColor: k.primaryColor,
      accentColor: k.accentColor,
      headingFont: k.headingFont,
      motionStyle: k.motionStyle,
      templateCount: 5,
      librarySlotCount: 5,
    })),
    showcaseJobCount: AGENCY_BRAND_KITS.length * 5,
  });
}
