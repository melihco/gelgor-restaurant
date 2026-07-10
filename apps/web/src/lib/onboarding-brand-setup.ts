/**
 * Deep onboarding brand setup — discovery, gallery vision, DNA, constitution.
 * Used by POST /api/onboarding/deep-brand-setup (server) and documented for Mission readiness.
 */

import type { PythonBrandAnalyzeResponse } from '@/types';
import {
  MIN_ACCEPT_SCORE,
  buildGalleryLookup,
  rankPhotosForContent,
  type GalleryPhotoMeta,
} from '@/lib/gallery-photo-matcher';
import { deriveBrandTemplateLibrary } from '@/lib/brand-template-library';
import { ensureSectorReelMotionInTheme } from '@/lib/sector-reel-motion-standard';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import { resolveAuthoritativeIndustry } from '@/lib/canonical-sector';

export interface DeepBrandSetupInput {
  origin: string;
  tenantId: string;
  companyName: string;
  websiteUrl?: string;
  instagramHandle?: string;
  googleBusinessUrl?: string;
  menuUrl?: string;
  headers?: Record<string, string>;
}

export interface DeepBrandSetupStep {
  id: string;
  ok: boolean;
  detail?: string;
}

export interface DeepBrandSetupResult {
  ok: boolean;
  steps: DeepBrandSetupStep[];
  brandAnalysis: PythonBrandAnalyzeResponse | null;
  gallery: {
    usable: number;
    analyzed: number;
    complete: boolean;
    calibration?: { tested: number; matched: number };
  };
  constitutionConfirmed: boolean;
  brandDnaRichness: string | null;
  productionReady: boolean;
  errors: string[];
  /** Canonical sector after service-profile derive (for Nexus + template kit). */
  authoritativeSector?: string;
}

function resolveSectorFromAnalysis(brand: PythonBrandAnalyzeResponse | null): string {
  const ctx = brand?.brand_context as Record<string, unknown> | undefined;
  const raw = String(
    brand?.inferred_industry
    ?? ctx?.business_type
    ?? ctx?.industry
    ?? 'general_business',
  ).trim();
  return raw || 'general_business';
}

/** Theme derive + locked 5-slot library + AI production defaults + gallery provision. */
async function finalizeProductionReadiness(
  origin: string,
  tenantId: string,
  sector: string,
  headers: Record<string, string>,
): Promise<DeepBrandSetupStep[]> {
  const out: DeepBrandSetupStep[] = [];

  const deriveRes = await postJson<{ ok?: boolean; source?: string }>(
    `${origin}/api/brand-context/${tenantId}/theme/derive`,
    {},
    headers,
    90_000,
  );
  out.push({
    id: 'theme_derive',
    ok: deriveRes.ok,
    detail: deriveRes.ok ? (deriveRes.data?.source ?? 'derived') : deriveRes.error,
  });

  let currentTheme: Record<string, unknown> = {};
  try {
    const themeRes = await fetch(`${origin}/api/brand-context/${tenantId}/theme`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (themeRes.ok) {
      const themeJson = (await themeRes.json()) as { theme?: Record<string, unknown> | null };
      currentTheme = themeJson.theme ?? {};
    }
  } catch {
    /* non-fatal */
  }

  const library = deriveBrandTemplateLibrary({ sector, tenantId });
  library.locked = true;

  const themeWithReelMotion = ensureSectorReelMotionInTheme(currentTheme, sector);

  const themePut = await fetch(`${origin}/api/brand-context/${tenantId}/theme`, {
    method: 'PUT',
    headers: { ...JSON_HEADERS, ...headers },
    body: JSON.stringify({
      theme: {
        ...themeWithReelMotion,
        template_library: { ...library, locked: true },
      },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  out.push({
    id: 'template_library_lock',
    ok: themePut.ok,
    detail: themePut.ok ? `5 slot locked (${library.kitId})` : `HTTP ${themePut.status}`,
  });

  out.push({
    id: 'reel_motion_standard_seed',
    ok: themePut.ok,
    detail: themePut.ok
      ? `sector=${sector} reel motion saved`
      : `HTTP ${themePut.status}`,
  });

  const aiRes = await fetch(`${origin}/api/brand-context/${tenantId}/theme/ai-settings`, {
    method: 'PATCH',
    headers: { ...JSON_HEADERS, ...headers },
    body: JSON.stringify({
      ai_photo_enhance: true,
      ai_photo_enhance_level: 'moderate',
      ai_enhance_gallery_selected: true,
      ai_use_brand_identity: true,
      ai_brief_drives_scene: true,
      ai_embed_logo: true,
      ai_enhance_formats: ['post', 'story', 'carousel', 'reel'],
      ai_visual_subject: 'auto',
    }),
    signal: AbortSignal.timeout(30_000),
  });
  out.push({
    id: 'ai_production_defaults',
    ok: aiRes.ok,
    detail: aiRes.ok ? 'enhance+logo+formats' : `HTTP ${aiRes.status}`,
  });

  const provisionRes = await postJson<{ provisioned?: number }>(
    `${origin}/api/brand-context/${tenantId}/provision-gallery`,
    { analyze: true, allowSynthetic: false },
    headers,
    180_000,
  );
  out.push({
    id: 'gallery_provision',
    ok: provisionRes.ok,
    detail: provisionRes.ok ? 'provisioned' : provisionRes.error,
  });

  return out;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function postJson<T>(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  timeoutMs = 180_000,
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...JSON_HEADERS, ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let data: T | null = null;
    try {
      data = text ? (JSON.parse(text) as T) : null;
    } catch {
      return { ok: false, status: res.status, data: null, error: `JSON parse failed (${text.length} bytes)` };
    }
    if (!res.ok) {
      const errBody = data as { error?: string; detail?: string; message?: string } | null;
      const errMsg =
        errBody?.error || errBody?.detail || errBody?.message || text.slice(0, 200) || `HTTP ${res.status}`;
      return { ok: false, status: res.status, data, error: errMsg };
    }
    return { ok: true, status: res.status, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, data: null, error: msg };
  }
}

/** Run gallery analyze-coverage until complete or max rounds. */
async function runGalleryCoverage(
  origin: string,
  tenantId: string,
  headers: Record<string, string>,
): Promise<{ usable: number; analyzed: number; complete: boolean }> {
  let usable = 0;
  let analyzed = 0;
  let complete = false;

  const rounds: Array<{ maxImages: number; tier: 'hero' | 'standard' }> = [
    { maxImages: 8, tier: 'hero' },
    { maxImages: 50, tier: 'standard' },
    { maxImages: 50, tier: 'standard' },
  ];

  for (const round of rounds) {
    const res = await postJson<{
      usable?: number;
      newlyAnalyzed?: number;
      alreadyAnalyzed?: number;
      complete?: boolean;
      remaining?: number;
    }>(
      `${origin}/api/gallery-intelligence/${tenantId}/analyze-coverage`,
      { maxImages: round.maxImages, tier: round.tier },
      headers,
      300_000,
    );
    if (res.data) {
      usable = res.data.usable ?? usable;
      analyzed = (res.data.alreadyAnalyzed ?? 0) + (res.data.newlyAnalyzed ?? 0);
      complete = Boolean(res.data.complete);
    }
    if (complete) break;
  }

  return { usable, analyzed, complete };
}

/** Validate caption↔photo matcher on a sample of gallery entries. */
async function calibrateCaptionMatching(
  origin: string,
  tenantId: string,
  companyName: string,
  industry: string,
  description: string,
  galleryMap: Record<string, GalleryPhotoMeta>,
  headers: Record<string, string>,
): Promise<{ tested: number; matched: number }> {
  const urls = Object.keys(galleryMap).filter((u) => {
    const m = galleryMap[u];
    return m?.description && (m.contentTags?.length ?? 0) > 0;
  });
  if (urls.length === 0) return { tested: 0, matched: 0 };

  const sample = urls.slice(0, 8);
  const gen = await postJson<{ suggestions?: Array<{ photoUrl: string; caption: string; headline: string }> }>(
    `${origin}/api/generate-captions-from-gallery`,
    {
      unusedPhotoUrls: sample,
      galleryAnalysis: galleryMap,
      brandName: companyName,
      brandDescription: description,
      industry,
      language: 'Turkish',
    },
    headers,
    90_000,
  );

  const suggestions = gen.data?.suggestions ?? [];
  const lookup = buildGalleryLookup(galleryMap, sample);
  let matched = 0;
  for (const s of suggestions) {
    const ranked = rankPhotosForContent(
      { caption: s.caption, headline: s.headline },
      sample,
      lookup,
      new Set(),
      galleryMap,
    );
    const top = ranked[0];
    if (top && top.score >= MIN_ACCEPT_SCORE && normalizeUrl(top.url) === normalizeUrl(s.photoUrl)) {
      matched += 1;
    }
  }
  return { tested: suggestions.length, matched };
}

function normalizeUrl(url: string): string {
  return url.split('?')[0] ?? url;
}

export async function runDeepBrandSetup(input: DeepBrandSetupInput): Promise<DeepBrandSetupResult> {
  const {
    origin,
    tenantId,
    companyName,
    websiteUrl = '',
    instagramHandle = '',
    googleBusinessUrl = '',
    menuUrl = '',
    headers = {},
  } = input;

  const steps: DeepBrandSetupStep[] = [];
  const errors: string[] = [];
  let brandAnalysis: PythonBrandAnalyzeResponse | null = null;
  let constitutionConfirmed = false;
  let brandDnaRichness: string | null = null;

  if (!websiteUrl && !instagramHandle && !menuUrl) {
    return {
      ok: false,
      steps,
      brandAnalysis: null,
      gallery: { usable: 0, analyzed: 0, complete: false },
      constitutionConfirmed: false,
      brandDnaRichness: null,
      productionReady: false,
      errors: ['Web sitesi, menü linki veya Instagram gerekli.'],
    };
  }

  // 1. Full brand discovery + Python persist
  const analyzeRes = await postJson<PythonBrandAnalyzeResponse>(
    `${origin}/api/brand-context/${tenantId}/analyze`,
    {
      website_url: websiteUrl,
      instagram_handle: instagramHandle.replace(/^@/, ''),
      google_business_url: googleBusinessUrl,
      menu_url: menuUrl,
      brand_name: companyName,
    },
    { ...headers, 'X-Onboarding-Analyze': '1', 'X-Skip-Cdn-Mirror': '1' },
    280_000,
  );

  const analyzeData = analyzeRes.data as PythonBrandAnalyzeResponse & { workspace_id?: string };
  const analyzeOk = analyzeRes.ok && (
    analyzeData?.success === true
    || Boolean(analyzeData?.brand_context?.workspace_id ?? analyzeData?.workspace_id)
  );

  if (!analyzeOk) {
    const msg = analyzeData?.message
      || analyzeData?.error
      || analyzeRes.error
      || `Marka analizi başarısız (${analyzeRes.status})`;
    errors.push(msg);
    steps.push({ id: 'brand_analyze', ok: false, detail: msg });
    return {
      ok: false,
      steps,
      brandAnalysis: analyzeData,
      gallery: { usable: 0, analyzed: 0, complete: false },
      constitutionConfirmed: false,
      brandDnaRichness: null,
      productionReady: false,
      errors,
    };
  }

  brandAnalysis = analyzeData;
  steps.push({
    id: 'brand_analyze',
    ok: true,
    detail: `confidence=${brandAnalysis.confidence}`,
  });

  // 2. Website brand kit (fonts/colors)
  await fetch(`${origin}/api/brand-context/${tenantId}/enrich-brand-kit`, {
    method: 'POST',
    headers,
  }).catch(() => null);
  steps.push({ id: 'brand_kit', ok: true });

  // 2b. Vision analysis on real gallery URLs only — do not inject Unsplash when website was provided.
  const refUrlsFromAnalysis = (() => {
    const raw = brandAnalysis?.reference_image_urls;
    if (Array.isArray(raw)) return raw.filter((u): u is string => typeof u === 'string');
    return [];
  })();
  const earlyProvisionRes = await postJson<{ provisioned?: number; usableCount?: number }>(
    `${origin}/api/brand-context/${tenantId}/provision-gallery`,
    { analyze: true, allowSynthetic: false },
    headers,
    180_000,
  );
  const earlyProvData = earlyProvisionRes.data as { usableCount?: number; message?: string } | null;
  steps.push({
    id: 'gallery_provision_early',
    ok: earlyProvisionRes.ok,
    detail: earlyProvisionRes.ok
      ? `${earlyProvData?.usableCount ?? 0} fotoğraf hazır`
      : earlyProvisionRes.error,
  });

  // 3. Deep gallery vision (hero + standard batches) — now uses CDN URLs
  const galleryStats = await runGalleryCoverage(origin, tenantId, headers);
  steps.push({
    id: 'gallery_coverage',
    ok: galleryStats.complete || galleryStats.analyzed >= 8,
    detail: `${galleryStats.analyzed}/${galleryStats.usable} analyzed`,
  });

  // 4. Load gallery map for calibration
  let galleryMap: Record<string, GalleryPhotoMeta> = {};
  try {
    const gRes = await fetch(`${origin}/api/brand-context/${tenantId}/gallery-analysis`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (gRes.ok) {
      galleryMap = (await gRes.json()) as Record<string, GalleryPhotoMeta>;
    }
  } catch {
    /* non-fatal */
  }

  let calibration: { tested: number; matched: number } | undefined;
  if (Object.keys(galleryMap).length > 0) {
    calibration = await calibrateCaptionMatching(
      origin,
      tenantId,
      companyName,
      brandAnalysis.inferred_industry || '',
      brandAnalysis.website_summary || '',
      galleryMap,
      headers,
    );
    steps.push({
      id: 'caption_calibration',
      ok: calibration.tested === 0 || calibration.matched >= Math.min(2, calibration.tested),
      detail: `${calibration.matched}/${calibration.tested} caption↔photo matches`,
    });
  }

  // 5. Visual DNA (venue/product aesthetic)
  const visualsRes = await fetch(`${origin}/api/brand-context/${tenantId}/analyze-visuals`, {
    method: 'POST',
    headers,
  }).catch(() => null);
  steps.push({
    id: 'visual_dna',
    ok: Boolean(visualsRes?.ok),
    detail: visualsRes?.ok ? 'ok' : 'skipped',
  });

  // 6a. Confirm constitution first (fast — no GPT wait)
  const confirmRes = await postJson<{ brand_constitution_confirmed_at?: string }>(
    `${origin}/api/brand-context/${tenantId}/confirm-constitution`,
    { auto_confirmed: true, synthesize_dna: false },
    headers,
    45_000,
  );

  constitutionConfirmed = Boolean(confirmRes.ok);
  if (!confirmRes.ok) {
    const detail = confirmRes.error || `HTTP ${confirmRes.status}`;
    errors.push(`Marka anayasası kaydı başarısız: ${detail}`);
  }
  steps.push({ id: 'constitution', ok: constitutionConfirmed });

  // 6c. Validated service profile — authoritative sector for template kit + prompts
  let authoritativeSector = resolveSectorFromAnalysis(brandAnalysis);
  if (constitutionConfirmed) {
    const spRes = await fetchCrewBackendJson<Record<string, unknown>>(
      `/api/v1/brand-context/${tenantId}/service-profile/derive`,
      { method: 'POST', workspaceId: tenantId, timeoutMs: 90_000 },
    );
    steps.push({
      id: 'service_profile',
      ok: spRes.ok,
      detail: spRes.ok
        ? String((spRes.data?.brand_service_profile as Record<string, unknown> | undefined)?.category ?? 'derived')
        : spRes.error ?? `HTTP ${spRes.status}`,
    });
    if (spRes.ok && spRes.data) {
      const resolved = resolveAuthoritativeIndustry(spRes.data);
      if (resolved) authoritativeSector = resolved;
    }
  } else {
    steps.push({ id: 'service_profile', ok: false, detail: 'constitution_not_confirmed' });
  }

  // 6d. Industry calendar — sync before production profile so sector type can be aligned
  if (constitutionConfirmed) {
    const calRes = await fetchCrewBackendJson<{ industry_type?: string }>(
      `/api/v1/brand-context/${tenantId}/industry-intelligence`,
      { method: 'POST', workspaceId: tenantId, timeoutMs: 120_000 },
    );
    steps.push({
      id: 'industry_calendar',
      ok: calRes.ok,
      detail: calRes.ok ? 'calendar refreshed' : calRes.error ?? `HTTP ${calRes.status}`,
    });

    // 6e. Production design profile — Scorpios-grade visual_dna + Fal theme layers
    const pdpRes = await fetchCrewBackendJson<{
      ok?: boolean;
      profile?: { source?: string; sector?: string };
    }>(
      `/api/v1/brand-context/${tenantId}/production-design-profile/derive`,
      { method: 'POST', workspaceId: tenantId, timeoutMs: 120_000 },
    );
    steps.push({
      id: 'production_design_profile',
      ok: pdpRes.ok,
      detail: pdpRes.ok
        ? `${pdpRes.data?.profile?.source ?? 'derived'} · ${pdpRes.data?.profile?.sector ?? authoritativeSector}`
        : pdpRes.error ?? `HTTP ${pdpRes.status}`,
    });
    if (!pdpRes.ok) {
      errors.push(`Üretim tasarım profili: ${pdpRes.error ?? pdpRes.status}`);
    }
  } else {
    steps.push({ id: 'industry_calendar', ok: false, detail: 'constitution_not_confirmed' });
    steps.push({ id: 'production_design_profile', ok: false, detail: 'constitution_not_confirmed' });
  }

  // 6b. Brand DNA synthesis (living anayasa prose) — non-fatal if slow/fails
  const dnaRes = await postJson<{ data_richness?: string }>(
    `${origin}/api/brand-context/${tenantId}/brand-dna`,
    {},
    headers,
    120_000,
  );
  if (dnaRes.ok) {
    brandDnaRichness = dnaRes.data?.data_richness ?? 'ok';
    steps.push({ id: 'brand_dna', ok: true, detail: brandDnaRichness });
  } else {
    steps.push({
      id: 'brand_dna',
      ok: false,
      detail: dnaRes.error || `HTTP ${dnaRes.status} (anayasa onaylı, DNA sonra tamamlanır)`,
    });
  }

  // 7. Production readiness — theme, locked templates, AI defaults, gallery URLs
  const sector = authoritativeSector;
  const productionSteps = constitutionConfirmed
    ? await finalizeProductionReadiness(origin, tenantId, sector, headers)
    : [];
  steps.push(...productionSteps);
  const productionCritical = new Set([
    'theme_derive',
    'template_library_lock',
    'reel_motion_standard_seed',
    'ai_production_defaults',
    'production_design_profile',
  ]);
  // gallery_provision is non-blocking (done early at step 2b; step 7 repeat ensures freshness)
  const productionReady = productionSteps.length > 0
    && productionSteps.filter((s) => productionCritical.has(s.id)).every((s) => s.ok)
    && earlyProvisionRes.ok;

  // 8. Brand design templates — Fal.ai-generated, brand-consistent design set
  //    grounded on real gallery photos + corporate colors + logo. Non-blocking:
  //    a failure here never blocks onboarding completion.
  if (productionReady) {
    const designRes = await postJson<{ generated?: number; failed?: number }>(
      `${origin}/api/brand-context/${tenantId}/generate-design-templates`,
      { locale: 'tr' },
      headers,
      290_000,
    );
    steps.push({
      id: 'design_templates',
      ok: designRes.ok,
      detail: designRes.ok
        ? `${designRes.data?.generated ?? 0} template üretildi`
        : designRes.error,
    });
  } else {
    steps.push({
      id: 'design_templates',
      ok: false,
      detail: 'production_not_ready',
    });
  }

  // DNA failure is non-blocking once constitution is confirmed
  const ok = errors.length === 0 && Boolean(brandAnalysis?.success) && constitutionConfirmed;

  return {
    ok,
    steps,
    brandAnalysis,
    gallery: { ...galleryStats, calibration },
    constitutionConfirmed,
    brandDnaRichness,
    productionReady,
    errors,
    authoritativeSector,
  };
}
