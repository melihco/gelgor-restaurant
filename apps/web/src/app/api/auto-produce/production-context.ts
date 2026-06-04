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

import { getBrandKit } from '@/lib/agency-brand-kits';
import { ensureBrandTemplateLibrary } from '@/lib/brand-template-library';
import { fetchBrandThemeForProduction, resolveProductionVisualStandard } from '@/lib/brand-theme-ai-settings';
import {
  isAiEnhanceEnabled,
  resolveAiEnhanceLevel,
} from '@/lib/ai-gallery-enhance';
import { resolveMissionVisualBrief } from '@/lib/brand-visual-pipeline';
import { resolveVisualSubject } from '@/lib/ai-visual-production-standard';
import { parseMotionProfileFromTheme } from '@/lib/brand-motion-profile';
import { resolveKitForSector } from '@/lib/remotion-template-registry';
import { tenantKitSeed } from '@/lib/tenant-template-seed';
import { resolveCanonicalBrandName } from '@/lib/resolve-brand-name';
import { resolveBrandProductionTokens } from '@/lib/brand-production-tokens';
import { resolveAnnouncementBrandKit } from '@/lib/announcement-brand-kit';
import type { BrandProductionTokens } from '@/lib/brand-production-tokens';
import type { AiVisualProductionStandard } from '@/lib/ai-visual-production-standard';
import type { AiEnhanceLevel } from '@/lib/ai-gallery-enhance';
import type { BrandTemplateLibrary } from '@/lib/brand-template-library';

const CREW_BACKEND = (process.env.CREW_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';

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
  /** Remotion template library — 5 story slots from Marka Detayı. */
  readonly templateLibrary: BrandTemplateLibrary;
  /** Brand kit ID for this sector. */
  readonly kitId: string;

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
  readonly tenantLearningBrief: string;
  readonly missionVisualBrief: string;

  // ── Context struct for visual pipeline ───────────────────────────────────
  readonly brandCtxForVisual: BrandContextForVisual;
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

async function fetchTenantLearningBrief(workspaceId: string): Promise<string> {
  try {
    const r = await fetch(`${CREW_BACKEND}/api/v1/brand-context/${workspaceId}/tenant-learning`, {
      headers: {
        'X-Internal-Api-Key': INTERNAL_KEY,
        'X-Tenant-Id': workspaceId,
      },
      signal: AbortSignal.timeout(5_000),
    });
    if (r.ok) {
      const d = await r.json() as { prompt?: string };
      return d.prompt?.trim() ?? '';
    }
  } catch { /* non-fatal */ }
  return '';
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
  },
): Promise<ProductionContext> {
  // Fetch brand data + theme in parallel for speed
  const [raw, brandTheme, tenantLearningBrief] = await Promise.all([
    fetchBrandContextRaw(workspaceId),
    fetchBrandThemeForProduction({
      workspaceId,
      crewBaseUrl: CREW_BACKEND,
      internalApiKey: INTERNAL_KEY,
      timeoutMs: 20_000,
    }).catch(() => null),
    fetchTenantLearningBrief(workspaceId),
  ]);

  // ── Brand identity ─────────────────────────────────────────────────────
  const brandBusinessType = String(raw.business_type ?? raw.industry ?? '');
  const brandLocation = String(raw.location ?? '');
  const brandTone = String(raw.brand_tone ?? '');
  const brandLogoUrl = String(raw.logo_url ?? '');
  const rawBrandName = String(
    overrides?.brandName
    ?? resolveCanonicalBrandName(null, raw)
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

  // ── AI visual settings ─────────────────────────────────────────────────
  const aiPhotoEnhanceEnabled = isAiEnhanceEnabled(brandTheme);
  const aiPhotoEnhanceLevel = resolveAiEnhanceLevel(brandTheme);
  const aiVisualStandard = resolveProductionVisualStandard(brandTheme);
  const resolvedVisualSubject = resolveVisualSubject(
    aiVisualStandard.visualSubject,
    brandBusinessType,
  );

  // ── Grading / LUT ─────────────────────────────────────────────────────
  const themeGrading = (brandTheme?.grading ?? brandTheme?.Grading) as Record<string, unknown> | undefined;
  const brandLutDirective = (typeof themeGrading?.lut_directive === 'string' ? themeGrading.lut_directive : null);
  const brandGradingLook = (typeof themeGrading?.look === 'string' ? themeGrading.look : null);
  const brandAntiPatterns: string[] = (() => {
    const ap = brandTheme?.anti_patterns ?? vibeProfile?.anti_patterns;
    return Array.isArray(ap) ? ap.map(String) : [];
  })();

  // ── Template library & kit ─────────────────────────────────────────────
  const kitId = resolveKitForSector(brandBusinessType, tenantKitSeed(workspaceId));
  const templateLibrary = ensureBrandTemplateLibrary(brandTheme, {
    sector: brandBusinessType,
    kitId,
    tenantId: workspaceId,
  });

  // ── Typography / motion ────────────────────────────────────────────────
  const typographyDensity = (
    (brandTheme?.typography as Record<string, unknown>)?.text_overlay_density
    ?? (brandTheme?.typography as Record<string, unknown>)?.textOverlayDensity
  ) as 'minimal' | 'medium' | 'dense' | undefined;
  const motionProfile = parseMotionProfileFromTheme(brandTheme, {
    sector: brandBusinessType,
    languages: (raw.languages as string) ?? undefined,
    textOverlayDensity: typographyDensity,
  });

  // ── Mission brief ──────────────────────────────────────────────────────
  const missionVisualBrief = resolveMissionVisualBrief(
    overrides?.creativeBrief,
    tenantLearningBrief,
  );

  // ── Brand tokens (fonts, colors, overlay) ─────────────────────────────
  const brandKitObj = getBrandKit(kitId);
  const tokens = resolveBrandProductionTokens({
    brandContext: raw,
    brandTheme: brandTheme ?? null,
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
    description: String(raw.description ?? ''),
    brand_tone: brandTone,
    visual_style: String(raw.visual_style ?? ''),
    target_audience: String(raw.target_audience ?? ''),
    location: brandLocation,
    website_summary: String(raw.website_summary ?? ''),
    instagram_bio: String(raw.instagram_bio ?? ''),
    brand_dna: raw.brand_dna as string | Record<string, unknown> | undefined,
    visual_dna: String(raw.visual_dna ?? ''),
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
    brandTheme: brandTheme ?? null,
    tokens,
    templateLibrary,
    kitId,
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
    tenantLearningBrief,
    missionVisualBrief,
    brandCtxForVisual,
  } satisfies ProductionContext);
}

