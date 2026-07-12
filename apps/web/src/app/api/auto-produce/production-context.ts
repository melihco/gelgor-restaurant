/**
 * Production Context — single typed object that holds ALL brand + workspace data
 * required for content production.
 *
 * Design principles:
 * - Immutable after construction: all fields are set once by fetchProductionContext()
 * - Workspace-scoped: every field belongs to exactly one tenant
 * - Explicit: no hidden global state; all data flows through this object
 * - Tenant isolation: context is constructed per-request, never shared across workspaces
 *
 * Fetching is done in parallel where possible. Any individual fetch failure
 * degrades gracefully — the context is always valid, just less complete.
 */

import { getNextjsInternalOrigin } from '@/lib/runtime-config';
import { serverConfig } from '@/lib/server-config';
import { getBrandKit } from '@/lib/agency-brand-kits';
import { ensureBrandTemplateLibrary } from '@/lib/brand-template-library';
import { applyAgencyProductionThemeDefaults } from '@/lib/agency-production-defaults';
import { fetchBrandThemeForProduction, resolveProductionVisualStandard } from '@/lib/brand-theme-ai-settings';
import {
  isAiEnhanceEnabled,
  resolveAiEnhanceLevel,
} from '@/lib/ai-gallery-enhance';
import { resolveMissionVisualBrief } from '@/lib/brand-visual-pipeline';
import { resolveVisualSubject } from '@/lib/ai-visual-production-standard';
import { parseMotionProfileFromTheme } from '@/lib/brand-motion-profile';
import { resolveKitForSector } from '@/lib/story-template-registry';
import { tenantKitSeed } from '@/lib/tenant-template-seed';
import { resolveProductionLogoUrl } from '@/lib/brand-logo-production';
import { resolveCanonicalBrandName } from '@/lib/resolve-brand-name';
import { filterBrandGalleryUrls, parseBrandReferenceUrls } from '@/lib/gallery-upload';
import { resolveBrandProductionTokens } from '@/lib/brand-production-tokens';
import { resolveAnnouncementBrandKit } from '@/lib/announcement-brand-kit';
import type { BrandProductionTokens } from '@/lib/brand-production-tokens';
import type { AiVisualProductionStandard } from '@/lib/ai-visual-production-standard';
import type { AiEnhanceLevel } from '@/lib/ai-gallery-enhance';
import type { BrandTemplateLibrary } from '@/lib/brand-template-library';
import type { BrandProfileSnapshot, ProductionBrandContextSnapshot } from '@smartagency/contracts';
import {
  parseTenantLearningApiResponse,
  type TenantLearningSnapshot,
} from '@/lib/mission-production-telemetry';

const CREW_BACKEND = serverConfig.crewBackend.baseUrl;
const INTERNAL_KEY = serverConfig.internal.apiKey;

// ─── Core type ────────────────────────────────────────────────────────────────

/**
 * All brand + workspace data needed to produce content.
 * Constructed once per request. Never mutated after construction.
 * Every field is scoped to exactly one workspaceId.
 */
export interface ProductionContext {
  /** Workspace this context belongs to — ALL data is for this tenant only. */
  readonly workspaceId: string;

  // ── Brand identity ────────────────────────────────────────────────────────
  readonly brandName: string;
  readonly brandBusinessType: string;
  readonly brandLocation: string;
  readonly brandTone: string;
  readonly brandLogoUrl: string;

  // ── Raw brand context (Python DB) ─────────────────────────────────────────
  /** Full brand_context record from Python backend — keyed by workspaceId. */
  readonly raw: Record<string, unknown>;

  // ── Visual configuration ──────────────────────────────────────────────────
  /** Derived from brand_theme — null when Brand Hub not configured. */
  readonly brandTheme: Record<string, unknown> | null;
  /** Resolved brand production tokens (fonts, colors, overlay). */
  readonly tokens: BrandProductionTokens;
  /** Legacy slot library — typography prefs; routing uses catalog_slot_key SSOT. */
  readonly templateLibrary: BrandTemplateLibrary;
  /** Brand kit ID for this sector. */
  readonly kitId: string;
  /** true when agency defaults merged ai_photo_enhance for pilot/locked/service sector */
  readonly agencyProductionForced: boolean;

  // ── AI visual settings ────────────────────────────────────────────────────
  readonly aiPhotoEnhanceEnabled: boolean;
  readonly aiPhotoEnhanceLevel: AiEnhanceLevel;
  readonly aiVisualStandard: AiVisualProductionStandard;
  readonly resolvedVisualSubject: string;

  // ── Grading / LUT ────────────────────────────────────────────────────────
  readonly brandLutDirective: string | null;
  readonly brandGradingLook: string | null;
  readonly brandAntiPatterns: string[];

  // ── Vibe profile ─────────────────────────────────────────────────────────
  readonly hasVibe: boolean;
  readonly vibeProfile: Record<string, unknown> | null;

  // ── Typography / motion ───────────────────────────────────────────────────
  readonly motionProfile: ReturnType<typeof parseMotionProfileFromTheme>;

  // ── Learning / mission brief ──────────────────────────────────────────────
  readonly tenantLearning: TenantLearningSnapshot;
  /** Markdown block injected into production prompts (empty when no learning). */
  readonly tenantLearningBrief: string;
  readonly missionVisualBrief: string;

  // ── Context struct for visual pipeline ───────────────────────────────────
  readonly brandCtxForVisual: BrandContextForVisual;
  readonly productionSnapshot: ProductionBrandContextSnapshot | null;
}

export interface BrandContextForVisual {
  business_name: string;
  business_type: string;
  description: string;
  brand_tone: string;
  visual_style: string;
  target_audience: string;
  location: string;
  website_summary: string;
  instagram_bio: string;
  brand_dna?: string | Record<string, unknown>;
  visual_dna?: string;
  logo_url?: string;
  brand_vibe_profile?: Record<string, unknown>;
  website_intelligence?: Record<string, unknown> | string | null;
  content_pillars: string[];
  default_ctas: string[];
  custom_rules: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJsonList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch { return []; }
  }
  return [];
}

async function fetchBrandContextRaw(workspaceId: string): Promise<Record<string, unknown>> {
  try {
    const r = await fetch(`${CREW_BACKEND}/api/v1/brand-context/${workspaceId}`, {
      headers: {
        'X-Internal-Api-Key': INTERNAL_KEY,
        'X-Tenant-Id': workspaceId,
      },
      signal: AbortSignal.timeout(5_000),
    });
    if (r.ok) return await r.json() as Record<string, unknown>;
  } catch { /* non-fatal */ }
  return {};
}

async function fetchProductionSnapshot(
  workspaceId: string,
  baseUrl?: string,
): Promise<ProductionBrandContextSnapshot | null> {
  const origin = baseUrl || getNextjsInternalOrigin();
  try {
    const r = await fetch(`${origin}/api/production-context/${workspaceId}/snapshot`, {
      headers: {
        'X-Tenant-Id': workspaceId,
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return null;
    return await r.json() as ProductionBrandContextSnapshot;
  } catch {
    return null;
  }
}

async function fetchTenantLearningSnapshot(workspaceId: string): Promise<TenantLearningSnapshot> {
  const url = `${CREW_BACKEND}/api/v1/brand-context/${workspaceId}/tenant-learning`;
  const headers = {
    'X-Internal-Api-Key': INTERNAL_KEY,
    'X-Tenant-Id': workspaceId,
  };

  const attempt = async (): Promise<{ data: unknown; ok: boolean }> => {
    try {
      const r = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(8_000),
      });
      const data = await r.json().catch(() => null);
      return { data, ok: r.ok };
    } catch {
      return { data: null, ok: false };
    }
  };

  let last = await attempt();
  if (!last.ok) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    last = await attempt();
  }

  const snapshot = parseTenantLearningApiResponse(last.data, last.ok);
  if (snapshot.status === 'fetch_failed') {
    console.warn(
      `[production-context] tenant learning fetch failed for ${workspaceId.slice(0, 8)} — prompts may miss approval history`,
    );
  }
  return snapshot;
}

// ─── Main factory ─────────────────────────────────────────────────────────────

/**
 * Fetch and build the complete ProductionContext for a workspace.
 *
 * - Fetches brand context + theme in parallel
 * - Any individual failure degrades gracefully
 * - Returns a fully typed, immutable context object
 * - NEVER throws — always returns a valid (possibly minimal) context
 */
export async function fetchProductionContext(
  workspaceId: string,
  overrides?: {
    brandName?: string;
    creativeBrief?: string | null;
    baseUrl?: string;
    productionSnapshot?: ProductionBrandContextSnapshot | null;
    /** Mission auto-produce: Python passes persisted brand_theme when crew fetch fails. */
    brandThemeOverride?: Record<string, unknown> | null;
  },
): Promise<ProductionContext> {
  // Fetch brand data + theme in parallel for speed
  const [rawBase, fetchedTheme, tenantLearning, productionSnapshot] = await Promise.all([
    fetchBrandContextRaw(workspaceId),
    fetchBrandThemeForProduction({
      workspaceId,
      crewBaseUrl: CREW_BACKEND,
      internalApiKey: INTERNAL_KEY,
      timeoutMs: 10_000,
    }).catch(() => null),
    fetchTenantLearningSnapshot(workspaceId),
    overrides?.productionSnapshot
      ? Promise.resolve(overrides.productionSnapshot)
      : fetchProductionSnapshot(workspaceId, overrides?.baseUrl),
  ]);
  const brandTheme = fetchedTheme || overrides?.brandThemeOverride
    ? {
        ...(fetchedTheme ?? {}),
        ...(overrides?.brandThemeOverride ?? {}),
      }
    : null;
  const brandSnapshot: BrandProfileSnapshot | null = productionSnapshot?.brand ?? null;

  const snapshotGalleryUrls = filterBrandGalleryUrls(
    brandSnapshot?.gallery.map((item) => String(item.url ?? '').trim()) ?? [],
  );
  const visualContextUrls = filterBrandGalleryUrls(
    productionSnapshot?.visualContext?.referenceImageUrls ?? [],
  );
  const resolvedReferenceUrls = snapshotGalleryUrls.length >= 3
    ? snapshotGalleryUrls
    : visualContextUrls.length >= 3
      ? visualContextUrls
      : filterBrandGalleryUrls(parseBrandReferenceUrls(rawBase.reference_image_urls));
  const raw: Record<string, unknown> = brandSnapshot
    ? {
        ...rawBase,
        business_name: brandSnapshot.brandName,
        business_type: brandSnapshot.businessType || rawBase.business_type || rawBase.industry || '',
        description: brandSnapshot.description ?? rawBase.description ?? '',
        target_audience: brandSnapshot.targetAudience ?? rawBase.target_audience ?? '',
        brand_tone: brandSnapshot.brandTone ?? rawBase.brand_tone ?? '',
        brand_dna: brandSnapshot.brandDna ?? rawBase.brand_dna,
        visual_dna: brandSnapshot.visualDna ?? rawBase.visual_dna ?? '',
        website_summary: brandSnapshot.websiteSummary ?? rawBase.website_summary ?? '',
        instagram_bio: brandSnapshot.instagramBio ?? rawBase.instagram_bio ?? '',
        location: brandSnapshot.location ?? rawBase.location ?? '',
        languages: brandSnapshot.languages?.length ? brandSnapshot.languages : rawBase.languages,
        reference_image_urls: resolvedReferenceUrls.length > 0
          ? resolvedReferenceUrls
          : rawBase.reference_image_urls,
        logo_url:
          brandSnapshot.gallery?.find((item) => item.kind === 'logo')?.url
          ?? rawBase.logo_url
          ?? '',
      }
    : rawBase;

  // ── Brand identity ─────────────────────────────────────────────────────
  const brandBusinessType = String(brandSnapshot?.businessType ?? raw.business_type ?? raw.industry ?? '');
  const brandLocation = String(brandSnapshot?.location ?? raw.location ?? '');
  const brandTone = String(brandSnapshot?.brandTone ?? raw.brand_tone ?? '');
  const brandLogoUrl = resolveProductionLogoUrl([
    brandSnapshot?.gallery?.find((item) => item.kind === 'logo')?.url,
    typeof raw.logo_url === 'string' ? raw.logo_url : String(raw.logo_url ?? ''),
  ], {
    websiteUrl: String(raw.website_url ?? ''),
  });
  const rawBrandName = String(
    overrides?.brandName
    ?? brandSnapshot?.brandName
    ?? resolveCanonicalBrandName(
      brandSnapshot ? { brandName: brandSnapshot.brandName } : null,
      raw,
    )
    ?? raw.business_name
    ?? '',
  ).trim();
  const brandName = rawBrandName
    .replace(/^Anasayfa\s*[-–|]\s*/i, '')
    .replace(/\s*[-–|]\s*Anasayfa$/i, '')
    .replace(/\s*\|\s*.+$/, '')
    .trim() || 'Brand';

  // ── Vibe ───────────────────────────────────────────────────────────────
  const vibeProfile = (
    raw.brand_vibe_profile ?? raw.brandVibeProfile
  ) as Record<string, unknown> | null | undefined ?? null;
  const hasVibe = Boolean(vibeProfile && Object.keys(vibeProfile).length > 0);

  // ── Template library & kit ─────────────────────────────────────────────
  const kitId = resolveKitForSector(brandBusinessType, tenantKitSeed(workspaceId));
  const templateLibrary = ensureBrandTemplateLibrary(brandTheme, {
    sector: brandBusinessType,
    kitId,
    tenantId: workspaceId,
  });

  const agencyDefaults = applyAgencyProductionThemeDefaults(brandTheme, {
    tenantId: workspaceId,
    sector: brandBusinessType,
    templateLibrary,
  });
  const productionBrandTheme = agencyDefaults.theme;
  if (agencyDefaults.forced) {
    console.log(
      `[production-context] Agency defaults applied workspace=${workspaceId} ` +
      `reasons=${agencyDefaults.reasons.join(',')}`,
    );
  }

  // ── AI visual settings ─────────────────────────────────────────────────
  const aiPhotoEnhanceEnabled = isAiEnhanceEnabled(productionBrandTheme);
  const aiPhotoEnhanceLevel = resolveAiEnhanceLevel(productionBrandTheme);
  const aiVisualStandard = resolveProductionVisualStandard(productionBrandTheme);
  const resolvedVisualSubject = resolveVisualSubject(
    aiVisualStandard.visualSubject,
    brandBusinessType,
  );

  // ── Grading / LUT ─────────────────────────────────────────────────────
  const themeGrading = (productionBrandTheme?.grading ?? productionBrandTheme?.Grading) as Record<string, unknown> | undefined;
  const brandLutDirective = (typeof themeGrading?.lut_directive === 'string' ? themeGrading.lut_directive : null);
  const brandGradingLook = (typeof themeGrading?.look === 'string' ? themeGrading.look : null);
  const brandAntiPatterns: string[] = (() => {
    const ap = productionBrandTheme?.anti_patterns ?? vibeProfile?.anti_patterns;
    return Array.isArray(ap) ? ap.map(String) : [];
  })();

  // ── Typography / motion ────────────────────────────────────────────────
  const typographyDensity = (
    (productionBrandTheme?.typography as Record<string, unknown>)?.text_overlay_density
    ?? (productionBrandTheme?.typography as Record<string, unknown>)?.textOverlayDensity
  ) as 'minimal' | 'medium' | 'dense' | undefined;
  const motionProfile = parseMotionProfileFromTheme(productionBrandTheme, {
    sector: brandBusinessType,
    languages: raw.languages ?? undefined,
    textOverlayDensity: typographyDensity,
    tenantId: workspaceId,
  });

  // ── Mission brief ──────────────────────────────────────────────────────
  const tenantLearningBrief = tenantLearning.prompt;
  const missionVisualBrief = resolveMissionVisualBrief(
    overrides?.creativeBrief,
    tenantLearningBrief,
  );

  // ── Brand tokens (fonts, colors, overlay) ─────────────────────────────
  const brandKitObj = getBrandKit(kitId);
  const tokens = resolveBrandProductionTokens({
    brandContext: raw,
    brandTheme: productionBrandTheme ?? brandTheme ?? null,
    vibeProfile: hasVibe ? vibeProfile : null,
    sector: brandBusinessType,
    kitHeading: brandKitObj?.headingFont,
    kitBody: brandKitObj?.bodyFont,
    // fontPersonality derived from kit motionStyle — brand editorial approach
    fontPersonality: (() => {
      const ms = brandKitObj?.motionStyle;
      if (ms === 'bold') return 'display_bold';
      if (ms === 'editorial' || ms === 'luxury') return 'serif_editorial';
      if (ms === 'minimal') return 'sans_modern';
      return 'brand';
    })(),
    brandName,
  });

  // ── Context struct for visual pipeline ────────────────────────────────
  const brandCtxForVisual: BrandContextForVisual = {
    business_name: brandName,
    business_type: brandBusinessType,
    description: String(brandSnapshot?.description ?? raw.description ?? ''),
    brand_tone: brandTone,
    visual_style: String(raw.visual_style ?? ''),
    target_audience: String(brandSnapshot?.targetAudience ?? raw.target_audience ?? ''),
    location: brandLocation,
    website_summary: String(brandSnapshot?.websiteSummary ?? raw.website_summary ?? ''),
    instagram_bio: String(brandSnapshot?.instagramBio ?? raw.instagram_bio ?? ''),
    brand_dna: (brandSnapshot?.brandDna ?? raw.brand_dna) as string | Record<string, unknown> | undefined,
    visual_dna: String(brandSnapshot?.visualDna ?? raw.visual_dna ?? ''),
    logo_url: brandLogoUrl || undefined,
    brand_vibe_profile: hasVibe ? (vibeProfile as Record<string, unknown>) : undefined,
    website_intelligence: (raw.website_intelligence ?? null) as
      Record<string, unknown> | string | null,
    content_pillars: parseJsonList(raw.content_pillars),
    default_ctas: parseJsonList(raw.default_ctas),
    custom_rules: String(raw.custom_rules ?? ''),
  };

  return Object.freeze({
    workspaceId,
    brandName,
    brandBusinessType,
    brandLocation,
    brandTone,
    brandLogoUrl,
    raw,
    brandTheme: productionBrandTheme ?? brandTheme ?? null,
    tokens,
    templateLibrary,
    kitId,
    agencyProductionForced: agencyDefaults.forced,
    aiPhotoEnhanceEnabled,
    aiPhotoEnhanceLevel,
    aiVisualStandard,
    resolvedVisualSubject,
    brandLutDirective,
    brandGradingLook,
    brandAntiPatterns,
    hasVibe,
    vibeProfile,
    motionProfile,
    tenantLearning,
    tenantLearningBrief,
    missionVisualBrief,
    brandCtxForVisual,
    productionSnapshot,
  } satisfies ProductionContext);
}

