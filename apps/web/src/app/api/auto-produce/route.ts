import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { canProduce, recordProduction, cleanupOldBuckets, canAffordRunway, incrementReelCount } from './budget';
import {
  type PostTypeBucket,
  fetchUsedGalleryImages,
  getExcludeUrlsForPostType,
  isGalleryUrlUsedForPostType,
  kindToPostType,
  markGalleryUrlUsedForPostType,
  normalizeGalleryUrl,
} from '@/lib/gallery-usage-tracker';
import { fetchRecentTemplateIds } from '@/lib/template-usage-tracker';
import {
  matchPhotoToContent,
  resolveBestGalleryUrl,
  enrichGalleryAnalysis,
  type GalleryPhotoMeta,
} from '@/lib/gallery-photo-matcher';
import { shouldAutoProduceEnhanceGallery, shouldPreserveVenuePhotos, shouldUpscaleSmallGalleryPhoto } from '@/lib/venue-photo-policy';
import {
  filterReachableGalleryUrls,
  filterUsableGalleryPhotoUrls,
  isUsableGalleryPhotoUrl,
  probeGalleryImageUrl,
  toFeedPreviewUrl,
  probeMediaUrl,
} from '@/lib/media-url';
import { mergeSectorGallerySeed, SYNTHETIC_GALLERY_MIN } from '@/lib/sector-gallery-seed';
import { resolveCanonicalBrandName } from '@/lib/resolve-brand-name';
import {
  assertAutonomousProductionAllowed,
  assertMissionBelongsToWorkspace,
  assertWorkspaceMatchesRequestTenant,
} from '@/lib/tenant-production-guard';
import { harmonizeCaptionAndCta } from '@/lib/cta-localization';
import {
  isAiEnhanceEnabled,
  multiGalleryPhotoCount,
  resolveAiEnhanceLevel,
  shouldUseMultiGalleryPhotos,
} from '@/lib/ai-gallery-enhance';
import {
  buildAiVisualStandardMetadata,
  resolveMissionVisualBrief,
  resolveVisualPipelineSteps,
  runGptImageEnhanceForIdea,
} from '@/lib/brand-visual-pipeline';
import { resolveVisualSubject } from '@/lib/ai-visual-production-standard';
import { missionTemplateIdeaIndex } from '@/lib/mission-remotion-story';
import { missionStoryLibrarySlotKey } from '@/lib/mission-story-template';
import { normalizeHashtags, resolveCarouselUrls } from '@/app/mobile/_components/artifact-utils';
import { detectIdeaPackageFormat, type FeedArtDirectorReport } from '@/lib/weekly-publish-package';
import {
  parseProductionAssignments,
  resolveProductionAssignment,
  shouldRenderRemotionPoster,
  shouldRenderRemotionStory,
  validateManifestAgainstAssignments,
} from '@/lib/production-pipeline-router';
import type { MissionProductionManifest, ProductionSlotRole } from '@/lib/mission-production-manifest';
import { resolveManifestMissionType } from '@/lib/mission-production-prefs';
import {
  productionIdeasFromParsed,
  productionIdeaToRecord,
} from '@/lib/production-idea-parse';
import type { ProductionIdea } from '@/types/production-idea';
import {
  auditRendererPayload,
  buildEventCardPayload,
  buildPayloadForIntegrityCheck,
  buildReelPayload,
  gatePromptIntegrity,
  PIS_PRODUCTION_MIN_SCORE,
  resolveProductionRenderer,
  type ReelPayload,
  type RendererBrandContext,
  type RendererGalleryMeta,
} from '@/lib/renderer-payload';
import {
  buildCreativeTrace,
  buildRunwayDirectorExtra,
  buildSceneBriefPromptBlock,
  createProductionStackContext,
  fetchProductSceneBrief,
  inferHeroReelIndex,
  resolveLayoutFamilyForAssignment,
  resolvePrimaryIndicesWithReport,
  resolveMaxRunwayReelsPerMission,
  shouldProduceRunwayForIdea,
  shouldSkipIdeaForProduction,
  type ProductSceneBrief,
} from '@/lib/production-stack';
import type { RemotionLayoutFamily } from '@/lib/remotion-template-types';
import {
  allowedCompositionsForDirector,
  parseMotionProfileFromTheme,
  resolveContentIntent,
  resolveGallerySeriesLayout,
} from '@/lib/brand-motion-profile';
import { resolveKitForSector } from '@/lib/remotion-template-registry';
import { tenantKitSeed } from '@/lib/tenant-template-seed';
import {
  ensureBrandTemplateLibrary,
  resolveProductionTemplate,
  resolveBrandStoryProductionTemplate,
  resolveStoryCompositionForBrandTemplate,
} from '@/lib/brand-template-library';
import { getBrandKit } from '@/lib/agency-brand-kits';
import { getRemotionTemplate } from '@/lib/remotion-template-catalog';
import {
  applyBrandTokensToRenderProps,
  resolveBrandProductionTokens,
} from '@/lib/brand-production-tokens';
import { renderRemotionBrandStill, renderRemotionBrandStillResult } from '@/lib/remotion-brand-kit';
import {
  fetchBrandThemeForProduction,
  resolveProductionVisualStandard,
} from '@/lib/brand-theme-ai-settings';
import { auditPosterOverlayCopy, resolvePosterOverlayCopy } from '@/lib/poster-copy';
import type { StoryCompositionId } from '@/remotion/types';
import {
  buildMultiReelPhotoInputs,
  callGenerateMultiReel,
  estimateRunwayReelCostUsd,
  maxPhotosForStrategy,
  resolveRunwayReelStrategy,
  type MultiReelPhotoInput,
  type RunwayReelStrategy,
} from '@/lib/reel-multi-production';
import { normalizeCameraMotion } from '@/lib/camera-motion';
import { resolveRunwayCameraMotionForFidelity } from '@/lib/runway-reel-fidelity';
import { fetchProductionContext } from './production-context';
import { fetchGalleryContext, triggerGalleryAnalysisIfNeeded } from './gallery-context';

export const runtime = 'nodejs';
// Vercel Pro max; locally unlimited. Runway gen4 ~90s + multiple images + stories.
export const maxDuration = 600;

const NEXUS_API = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, '');
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';

/**
 * Per-workspace production lock — prevents two concurrent auto-produce calls for
 * the same brand from picking the same gallery photos or creating duplicate artifacts.
 *
 * In-process only (single Node.js instance). For multi-instance deployments,
 * replace with a Redis-based lock using the Python usage-cost API.
 */
const _workspaceProductionLock = new Map<string, boolean>();

function acquireProductionLock(workspaceId: string): boolean {
  if (_workspaceProductionLock.get(workspaceId)) return false;
  _workspaceProductionLock.set(workspaceId, true);
  return true;
}

function releaseProductionLock(workspaceId: string): void {
  _workspaceProductionLock.delete(workspaceId);
}

interface ParsedIdea {
  headline?: string;
  concept_title?: string;
  title?: string;
  caption_draft?: string;
  caption?: string;
  hashtags?: string[] | string;
  content_type?: string;
  content_kind?: string;
  selected_gallery_url?: string;
  visual_production_spec?: { selected_gallery_url?: string; image_edit_prompt?: string; treatment?: string };
  reel_motion_spec?: { camera_movement?: string; pace?: string; transition_style?: string; audio_mood?: string };
  treatment?: string;
  product_type?: string;
  subject?: string;
  visual_direction?: string;
  strategic_purpose?: string;
  template_use_case?: string;
  cta?: string;
  call_to_action?: string;
  posting_time_suggestion?: string;
  mood?: string;
  /** Structured event details for event/canvas announcement overlay */
  event_details?: {
    artist_name?: string;
    date?: string;
    time?: string;
    venue_name?: string;
    venue_area?: string;
    tagline?: string;
    cta_text?: string;
  };
}

interface AutoProduceRequest {
  workspaceId: string;
  missionId?: string;
  nodeKey?: string;
  ideas: ParsedIdea[];
  galleryAnalysis?: Record<string, unknown>;
  brandName?: string;
  /**
   * Bundle mode: after the primary artifact, auto-generate
   * Remotion story MP4 + poster stills for each idea.
   * Defaults to true when called from task_graph_executor.
   */
  bundleCards?: boolean;
  /** Feed Art Director report — runs before production in task_graph_executor */
  feedDirectorReport?: FeedArtDirectorReport;
  /** Strategist mission.type (seasonal, opportunity, …) */
  missionType?: string;
  /** Mission Hub production package — weekly_content | campaign | event | ads_focus */
  productionPackage?: MissionProductionManifest['missionType'];
  missionTitle?: string;
  creativeBrief?: string;
}

function getField(idea: ParsedIdea, ...keys: (keyof ParsedIdea)[]): string {
  for (const k of keys) {
    const v = idea[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

// normalizeHashtags is imported from artifact-utils below


function detectContentKind(idea: ParsedIdea): string {
  const ct = (idea.content_type || idea.content_kind || 'post').toLowerCase();
  if (ct.includes('story')) return 'instagram_story';
  if (ct.includes('reel')) return 'instagram_reel';
  if (ct.includes('carousel')) return 'instagram_carousel';
  if (ct.includes('canvas') || ct.includes('event') || ct.includes('announcement')) return 'instagram_canvas';
  return 'instagram_post';
}

/** Nexus OutputArtifact.ContentUrl is varchar(1000) — never persist base64 carousel frames there. */
const NEXUS_CONTENT_URL_MAX = 1000;

function nexusPersistableContentUrl(url: string, fallbackUrls: string[] = []): string {
  const candidates = [url, ...fallbackUrls].filter((u) => typeof u === 'string' && u.trim().length > 0);
  for (const u of candidates) {
    if (!u.startsWith('data:') && u.length <= NEXUS_CONTENT_URL_MAX) return u;
  }
  const http = candidates.find((u) => u.startsWith('http') && u.length <= NEXUS_CONTENT_URL_MAX);
  return http ?? candidates.find((u) => u.startsWith('http'))?.slice(0, NEXUS_CONTENT_URL_MAX) ?? url.slice(0, NEXUS_CONTENT_URL_MAX);
}

/** Gallery-only: never generate images from scratch in auto-produce (default true). */
const GALLERY_ONLY = process.env.AUTO_PRODUCE_GALLERY_ONLY !== 'false';
/**
 * AI color grade on gallery photos — OFF by default.
 * Remotion story templates apply brand design over original photos.
 * Only enable for non-story posts if explicitly set: AUTO_PRODUCE_SUBTLE_ENHANCE=true
 */
const SUBTLE_ENHANCE = shouldAutoProduceEnhanceGallery();

const GALLERY_EXCLUDE_PATTERNS = [
  'logo', 'icon', 'banner', 'footer', 'menu.', 'harita', 'map', 'franchise',
];

function parseBrandGalleryPhotos(
  brandCtx: Record<string, unknown>,
  galleryAnalysis: Record<string, unknown>,
): { candidateUrls: string[]; meta: Record<string, GalleryPhotoMeta> } {
  const meta = galleryAnalysis as Record<string, GalleryPhotoMeta>;
  let refs: string[] = [];
  const raw = brandCtx.reference_image_urls;
  if (Array.isArray(raw)) {
    refs = raw.filter((u): u is string => typeof u === 'string' && u.startsWith('http'));
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        refs = parsed.filter((u): u is string => typeof u === 'string' && u.startsWith('http'));
      }
    } catch { /* ignore */ }
  }

  refs = filterUsableGalleryPhotoUrls(
    refs.filter(u => !GALLERY_EXCLUDE_PATTERNS.some(p => u.toLowerCase().includes(p))),
  );

  const analysisKeys = Object.keys(meta).filter(u => u.startsWith('http') && isUsableGalleryPhotoUrl(u));
  let candidateUrls = refs.length > 0 ? refs : analysisKeys;

  const sector = String(brandCtx.business_type ?? brandCtx.industry ?? '');
  if (candidateUrls.length < SYNTHETIC_GALLERY_MIN) {
    const { urls } = mergeSectorGallerySeed(candidateUrls, sector, SYNTHETIC_GALLERY_MIN);
    candidateUrls = urls;
  }

  return { candidateUrls, meta };
}

/**
 * Pick best gallery photo for caption — staged fallback, never generative.
 * 1) Respect post-type usage exclusions + semantic score
 * 2) Relax to batch-only exclusions + bestEffort
 * 3) Any gallery photo (bestEffort) before giving up
 */
function pickGalleryPhotoForIdea(
  caption: string,
  headline: string,
  mood: string,
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
  candidateUrls: string[],
  typeExcludeUrls: string[],
  batchExcludeUrls: string[],
  contentType?: string,
  agentUrl?: string | null,
  businessType?: string,
): string | null {
  if (!candidateUrls.length) return null;

  const input = { caption, headline, mood, contentType, businessType };
  const displayUrls = candidateUrls;

  const tryPick = (excludeUrls: string[], bestEffort = false): string | null => {
    const resolved = resolveBestGalleryUrl(
      input,
      candidateUrls,
      galleryAnalysis,
      agentUrl,
      { excludeUrls, displayUrls },
    );
    if (resolved) return resolved.url;

    const match = matchPhotoToContent(input, candidateUrls, galleryAnalysis, {
      excludeUrls,
      displayUrls,
      bestEffort,
    });
    return match?.url ?? null;
  };

  return (
    tryPick(typeExcludeUrls, false)
    ?? tryPick(typeExcludeUrls, true)
    ?? tryPick(batchExcludeUrls, true)
    ?? tryPick([], true)
  );
}

/** Pick 1–2 extra gallery photos for multi-photo story layouts (excludes primary). */
function pickSupplementaryGalleryPhotos(
  caption: string,
  headline: string,
  mood: string,
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
  candidateUrls: string[],
  primaryUrl: string,
  batchExcludeUrls: string[],
  count: number,
  contentType?: string,
  businessType?: string,
): string[] {
  const extras: string[] = [];
  const exclude = [...batchExcludeUrls, primaryUrl];

  for (let i = 0; i < count; i++) {
    const url = pickGalleryPhotoForIdea(
      caption,
      headline,
      mood,
      galleryAnalysis,
      candidateUrls,
      exclude,
      exclude,
      contentType,
      null,
      businessType,
    );
    if (!url || exclude.includes(url)) break;
    extras.push(url);
    exclude.push(url);
  }
  return extras;
}

async function generateVibeImage(opts: {
  workspaceId: string;
  headline: string;
  caption: string;
  contentType: string;
  brandName: string;
  location?: string;
  businessType?: string;
  referenceImageUrl?: string;
  agentImageEditPrompt?: string;
  /** BrandTheme grading directive — color look applied to the image */
  lutDirective?: string;
  /** Anti-patterns to avoid — injected as NEVER directives */
  antiPatterns?: string[];
  // ── Full brand context for richer prompt ──────────────────────────────
  brandTone?: string;
  brandDescription?: string;
  targetAudience?: string;
  visualStyle?: string;
  visualDna?: string;
  /** Vibe profile from brand constitution (Instagram reference DNA) */
  vibeProfile?: Record<string, unknown> | null;
  logoUrl?: string;
  /** Reference images for brand consistency (when available) */
  referenceImageUrls?: string[];
}): Promise<string | null> {
  if (shouldPreserveVenuePhotos() && opts.referenceImageUrl) {
    // Exception: if the photo is too small for Instagram quality, AI upscale it.
    // Check width via a quick HEAD+sharp probe (best-effort, skip on error).
    try {
      const baseUrl = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';
      const proxyUrl = `${baseUrl}/api/media-proxy?url=${encodeURIComponent(opts.referenceImageUrl)}`;
      const probeRes = await fetch(proxyUrl, { signal: AbortSignal.timeout(8_000) });
      if (probeRes.ok) {
        const sharpModule = await import('sharp');
        const buf = Buffer.from(await probeRes.arrayBuffer());
        const meta = await sharpModule.default(buf).metadata();
        const w = meta.width ?? 1080;
        if (!shouldUpscaleSmallGalleryPhoto(w)) {
          return opts.referenceImageUrl;
        }
        console.log(`[auto-produce] small gallery photo ${w}px → AI upscale`);
      } else {
        return opts.referenceImageUrl;
      }
    } catch {
      return opts.referenceImageUrl;
    }
    // Falls through to AI enhance below
  }
  try {
    const baseUrl = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';
    const lutSuffix = opts.lutDirective
      ? ` Apply grading: ${opts.lutDirective}.`
      : '';
    const antiPatternSuffix = opts.antiPatterns?.length
      ? ` NEVER: ${opts.antiPatterns.slice(0, 3).join('; ')}.`
      : '';
    // Enhancement prompt: when reference image exists, preserve scene and apply brand grading
    const enhancePrompt = opts.agentImageEditPrompt
      || [
          'Apply agency-grade color grading to this brand photo.',
          'PRESERVE: every architectural element, person, object, and composition stays exactly in place.',
          'DO NOT move, add, or remove anything from the scene.',
          'APPLY: brand palette colors in lighting, ambient tone, and color grade.',
          opts.lutDirective ? `Grading look: ${opts.lutDirective}.` : 'Warm editorial grading, premium feel.',
          opts.antiPatterns?.length ? `NEVER: ${opts.antiPatterns.slice(0, 3).join('; ')}.` : '',
        ].filter(Boolean).join(' ');

    const body: Record<string, unknown> = {
      // ── Content ──────────────────────────────────────────────────────────
      title:        opts.headline,
      caption:      opts.caption,
      contentType:  opts.contentType,
      // ── Brand identity ────────────────────────────────────────────────
      brandName:    opts.brandName,
      location:     opts.location,
      industry:     opts.businessType,
      description:  opts.brandDescription,
      brandTone:    opts.brandTone,
      targetAudience: opts.targetAudience,
      visualStyle:  opts.visualStyle,
      visualDna:    opts.visualDna,
      workspaceId:  opts.workspaceId,
      logoUrl:      opts.logoUrl,
      // ── Reference images for consistency ─────────────────────────────
      referenceImageUrls: opts.referenceImageUrls?.length
        ? opts.referenceImageUrls
        : opts.referenceImageUrl ? [opts.referenceImageUrl] : undefined,
      // ── Vibe profile (brand constitution → Instagram DNA) ────────────
      // Field name matches InstagramImageInput.brandVibeProfile
      brandVibeProfile: opts.vibeProfile ?? undefined,
      // ── Enhancement vs generation ────────────────────────────────────
      enhanceMode:    Boolean(opts.referenceImageUrl),
      enhanceContext: opts.referenceImageUrl ? enhancePrompt : undefined,
      // ── Anti-patterns: merge into vibeProfile.anti_patterns (how the image route reads them)
      // If we have a vibe profile, inject anti-patterns there; otherwise pass as top-level field
      ...(opts.antiPatterns?.length && !opts.vibeProfile ? {
        brandVibeProfile: { anti_patterns: opts.antiPatterns } as Record<string, unknown>,
      } : {}),
    };
    const res = await fetch(`${baseUrl}/api/generate-instagram-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.warn('[auto-produce] vibe image gen failed', res.status, err.slice(0, 120));
      return null;
    }
    const data = await res.json();
    return (data.imageUrl as string) ?? null;
  } catch (err) {
    console.warn('[auto-produce] vibe image gen error', err);
    return null;
  }
}

/**
 * Generate an agency-level Reel video via Runway Gen4 Turbo.
 * - Builds a cinematic English prompt from vibe DNA + content brief
 * - Passes the best-matching gallery photo as the input frame
 * - Returns the R2-persisted video URL (or null on failure)
 */
/**
 * Build a GPT-image-1 "designed card" prompt for an event/campaign announcement.
 * The card is a full-bleed Instagram composition with:
 *  - Brand vibe palette as background gradient or color wash
 *  - Event title as hero typography
 *  - Supporting detail line (date, CTA, etc.)
 *  - Brand name anchor at bottom
 * All visual directives come directly from the extracted brand_vibe_profile.
 */
function buildEventCanvasPrompt(opts: {
  headline: string;
  caption: string;
  brandName: string;
  location?: string;
  vibeProfile?: Record<string, unknown>;
  mood?: string;
}): string {
  const vibe = opts.vibeProfile ?? {};
  const palette = (vibe.palette as Record<string, string> | undefined) ?? {};
  const typography = (vibe.typography as Record<string, string> | undefined) ?? {};
  const composition = (vibe.composition as Record<string, string> | undefined) ?? {};
  const grading = (vibe.grading as Record<string, string> | undefined) ?? {};
  const sourceAccounts: string[] = Array.isArray(vibe.source_accounts) ? vibe.source_accounts : [];
  const antiPatterns: string[] = Array.isArray(vibe.anti_patterns) ? vibe.anti_patterns : [];

  const primary = palette.primary ?? '#1A2B4A';
  const accent = palette.accent ?? '#E8C87A';
  const neutral = palette.neutral ?? '#F5F0E8';
  const paletteDesc = palette.palette_description ?? '';

  const headlineFont = typography.headline_font ?? typography.heading_personality ?? typography.headline_style ?? 'elegant serif';
  const bodyFont = typography.body_font ?? typography.body_personality ?? typography.body_style ?? 'clean sans-serif';
  const letterSpacing = typography.letter_spacing ?? typography.text_overlay_density ?? 'wide tracking';
  const typographyNotes = typography.notes ?? typography.typography_role ?? '';

  const framingRules = composition.framing_rules ?? 'minimalist, generous whitespace';
  const gradingLook = grading.look ?? 'golden_hour';

  const lines = [
    `Instagram event announcement card for ${opts.brandName}${opts.location ? ` · ${opts.location}` : ''}.`,
    `This is a DESIGNED TYPOGRAPHY CARD — no real photographs, only graphic design elements.`,
    ``,
    `═══ VISUAL CANVAS ═══`,
    `Background: full-bleed color wash using brand palette.`,
    `Primary background color: ${primary}.`,
    `Accent color for graphic elements and borders: ${accent}.`,
    `Text color: ${neutral} or high-contrast variant.`,
    paletteDesc ? `Palette mood: ${paletteDesc}.` : '',
    `Color grading inspiration: ${gradingLook} — apply as subtle gradient overlay if needed.`,
    ``,
    `═══ TYPOGRAPHY LAYOUT ═══`,
    `Headline (hero text, largest element): "${opts.headline}"`,
    `  Font style: ${headlineFont}, ${letterSpacing}.`,
    `Body/supporting text: pull the key detail or CTA from this caption — "${opts.caption.slice(0, 120)}"`,
    `  Font style: ${bodyFont}.`,
    typographyNotes ? `Typography notes: ${typographyNotes}.` : '',
    `Brand anchor (bottom of card): "${opts.brandName}"${opts.location ? ` · ${opts.location}` : ''} — small, refined.`,
    ``,
    `═══ COMPOSITION ═══`,
    `Format: 4:5 portrait (1080×1350px equivalent), social-media native.`,
    `Layout rule: ${framingRules}.`,
    `Generous whitespace — let the typography breathe.`,
    `Subtle graphic accent: thin line, geometric shape, or botanical element in ${accent}.`,
    sourceAccounts.length ? `Aesthetic reference quality: ${sourceAccounts.map(a => '@' + a).join(', ')} — refined, editorial.` : '',
    opts.mood ? `Mood: ${opts.mood}.` : '',
    ``,
    `═══ STRICT RULES ═══`,
    `DO NOT: add photographs of people, food, or real locations.`,
    `DO NOT: use generic stock-style gradients (blue-to-purple, etc.).`,
    antiPatterns.length ? `AVOID: ${antiPatterns.join(', ')}.` : '',
    `DO: use only the brand palette colors listed above.`,
    `DO: keep it editorial, minimal, premium — agency-grade graphic design.`,
    `Result: a scroll-stopping event announcement that feels like it came from a luxury brand studio.`,
  ].filter(Boolean);

  return lines.join('\n');
}

/**
 * Sync Remotion still — gallery photo + auto-selected poster/story template.
 */
async function generateMarkyLayerCard(opts: {
  workspaceId: string;
  headline: string;
  caption: string;
  brandName: string;
  location?: string;
  businessType?: string;
  mood?: string;
  vibeProfile?: Record<string, unknown>;
  referenceImageUrl: string;
  contentTypeFmt: 'post' | 'story';
  templateUseCase?: string;
  strategicPurpose?: string;
  ideaIndex?: number;
  brandTheme?: Record<string, unknown> | null;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  usedTemplateIds?: string[];
  baseUrl?: string;
  eventDetails?: {
    artistName?: string;
    date?: string;
    time?: string;
    venueArea?: string;
    tagline?: string;
    ctaText?: string;
  };
}): Promise<string | null> {
  const ev = opts.eventDetails ?? {};
  const displayHeadline = ev.artistName
    ? [ev.artistName, ev.date].filter(Boolean).join(' · ')
    : opts.headline;
  const subtitle = ev.tagline ?? opts.caption;

  return renderRemotionBrandStill({
    workspaceId: opts.workspaceId,
    photoUrl: opts.referenceImageUrl,
    headline: displayHeadline.trim() || opts.headline,
    caption: subtitle,
    brandName: opts.brandName,
    location: opts.location,
    sector: opts.businessType,
    mood: opts.mood,
    templateUseCase: opts.templateUseCase,
    contentType: opts.contentTypeFmt,
    ideaIndex: opts.ideaIndex ?? 0,
    brandTheme: opts.brandTheme,
    logoUrl: opts.logoUrl,
    primaryColor: opts.primaryColor,
    accentColor: opts.accentColor,
    usedTemplateIds: opts.usedTemplateIds,
    eventDate: ev.date,
    eventTime: ev.time,
    cta: ev.ctaText,
    baseUrl: opts.baseUrl,
  });
}

/**
 * Pick up to `count` gallery photos semantically matching the content.
 * Returns raw gallery URLs (no AI edit when venue preservation is on).
 */
async function generateVibeCarousel(opts: {
  workspaceId: string;
  headline: string;
  caption: string;
  brandName: string;
  location?: string;
  businessType?: string;
  mood?: string;
  galleryAnalysis: Record<string, GalleryPhotoMeta>;
  candidateUrls: string[];
  excludeUrls: string[];
  count: number;
}): Promise<{ enhancedUrls: string[]; galleryUrls: string[] }> {
  const baseUrl = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';

  // Caption-matched selection: score ALL candidates against caption+headline
  // so every carousel slide is relevant to the content, not just sequential.
  const { matchPhotoToContent, buildGalleryLookup, MIN_ACCEPT_SCORE } = await import('@/lib/gallery-photo-matcher');
  const { buildGalleryLookup: _buildLookup } = await import('@/lib/gallery-photo-matcher');

  const localUsed = [...opts.excludeUrls];
  const candidates = opts.candidateUrls.filter(
    (u) => !localUsed.some((ex) => normalizeGalleryUrl(ex) === normalizeGalleryUrl(u))
      && !u.toLowerCase().includes('logo') && !u.toLowerCase().includes('icon'),
  );

  // Build match input from caption + headline
  const matchInput = {
    caption: opts.caption,
    headline: opts.headline,
    mood: opts.mood ?? '',
    contentType: 'carousel',
  };

  // Score all candidates and sort by match quality (best first)
  const scored = candidates
    .map((url) => {
      const result = matchPhotoToContent(matchInput, [url], opts.galleryAnalysis, {});
      return { url, score: result?.score ?? 0 };
    })
    .filter((r) => r.score >= 0) // keep all even low-score (carousel needs variety)
    .sort((a, b) => b.score - a.score);

  // Take top count, ensuring diversity (skip near-duplicates by base URL)
  const picked: string[] = [];
  for (const { url } of scored) {
    if (picked.length >= opts.count) break;
    const base = normalizeGalleryUrl(url);
    if (picked.some((p) => normalizeGalleryUrl(p) === base)) continue;
    picked.push(url);
    localUsed.push(url);
  }

  // Fill remaining slots from gallery pool if not enough scored results
  if (picked.length < opts.count) {
    for (const url of candidates) {
      if (picked.length >= opts.count) break;
      const base = normalizeGalleryUrl(url);
      if (picked.some((p) => normalizeGalleryUrl(p) === base)) continue;
      picked.push(url);
    }
  }

  if (!picked.length) return { enhancedUrls: [], galleryUrls: [] };

  if (shouldPreserveVenuePhotos()) {
    return { enhancedUrls: picked.slice(0, opts.count), galleryUrls: picked.slice(0, opts.count) };
  }

  const enhanced = (await Promise.all(
    picked.slice(0, opts.count).map(async (refUrl, idx) => {
      // Slide 1: vibe-enhanced hero. Slides 2+: raw gallery (same quality, $0 extra)
      if (idx > 0) return refUrl;
      try {
        const body: Record<string, unknown> = {
          title:           opts.headline,
          caption:         opts.caption,
          contentType:     'post',
          brandName:       opts.brandName,
          location:        opts.location,
          businessType:    opts.businessType,
          workspaceId:     opts.workspaceId,
          referenceImageUrls: [refUrl],
          enhanceMode:     true,
          enhanceContext:  'Apply subtle color grading only. Preserve the venue photo exactly — do not replace the scene.',
        };
        const res = await fetch(`${baseUrl}/api/generate-instagram-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(90_000),
        });
        if (!res.ok) return refUrl; // fallback to raw on failure
        const data = await res.json();
        return (data.imageUrl as string) ?? refUrl;
      } catch {
        return refUrl;
      }
    }))
  ).filter(Boolean) as string[];

  return { enhancedUrls: enhanced, galleryUrls: picked.slice(0, opts.count) };
}

/** Map Sprint-4 `buildReelPayload` → `/api/generate-reel` body (single-photo path). */
function reelPayloadToGenerateReelBody(
  reel: ReelPayload,
  extras: {
    workspaceId?: string;
    businessType?: string;
    vibeProfile?: Record<string, unknown>;
    photoDescription?: string;
    photoTags?: string[];
    brandThemeGrading?: { look?: string; lut_directive?: string };
    referenceImageUrl?: string;
    additionalPhotoUrls?: string[];
    cameraMotion?: string;
    agentVisualDirection?: string;
  },
): Record<string, unknown> {
  const allPhotoUrls = [
    extras.referenceImageUrl,
    ...(extras.additionalPhotoUrls ?? []),
  ].filter((u): u is string => typeof u === 'string' && u.startsWith('http'));

  const body: Record<string, unknown> = {
    title: reel.title,
    caption: reel.caption,
    concept: reel.concept,
    platform: reel.platform,
    contentType: reel.contentType,
    visualStyle: reel.visualStyle,
    cameraMotion: extras.cameraMotion ?? reel.cameraMotion,
    brandTone: reel.brandTone,
    duration: reel.duration,
    ratio: reel.ratio,
    sceneMetadata: {
      ...reel.sceneMetadata,
      businessType: extras.businessType,
      workspaceId: extras.workspaceId,
      ...(extras.agentVisualDirection
        ? { agentVisualDirection: extras.agentVisualDirection.slice(0, 400) }
        : {}),
    },
    photoDescription: extras.photoDescription,
    photoTags: extras.photoTags,
    vibeProfile: extras.vibeProfile
      ? {
          grading: (extras.vibeProfile.grading as Record<string, unknown>) ?? {},
          palette: (extras.vibeProfile.palette as Record<string, unknown>) ?? {},
          motion: (extras.vibeProfile.motion as Record<string, unknown>) ?? {},
          composition: (extras.vibeProfile.composition as Record<string, unknown>) ?? {},
        }
      : undefined,
    brandThemeGrading: extras.brandThemeGrading,
  };

  if (allPhotoUrls.length >= 2) {
    body.promptImages = allPhotoUrls.slice(0, 4);
  } else if (reel.promptImage) {
    body.promptImage = reel.promptImage;
  }
  return body;
}

async function renderEventCardFromPayload(
  prodIdea: ProductionIdea,
  brand: RendererBrandContext,
  gallery: RendererGalleryMeta,
  opts: { workspaceId: string; vibeProfile?: Record<string, unknown> },
): Promise<string | null> {
  const baseUrl = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';
  const payload = buildEventCardPayload(prodIdea, brand, gallery, { workspaceId: opts.workspaceId });
  if (!payload.photoUrl?.startsWith('http')) return null;
  try {
    const res = await fetch(`${baseUrl}/api/generate-event-card`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        photoUrl: payload.photoUrl,
        contentType: payload.contentType,
        templateId: payload.templateId,
        brandName: payload.brandName,
        location: payload.location,
        workspaceId: payload.workspaceId,
        eventName: payload.eventName,
        tagline: payload.tagline,
        date: payload.date,
        enhancePhoto: payload.enhancePhoto,
        vibeProfile: opts.vibeProfile,
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.warn('[auto-produce] event-card failed', res.status, err.slice(0, 120));
      return null;
    }
    const data = await res.json() as { imageUrl?: string };
    const url = data.imageUrl;
    if (url) console.log('[auto-produce] event-card (buildEventCardPayload):', prodIdea.headline.slice(0, 40));
    return url ?? null;
  } catch (err) {
    console.warn('[auto-produce] event-card error', err);
    return null;
  }
}

async function generateRunwayReel(opts: {
  workspaceId: string;
  headline: string;
  caption: string;
  brandName: string;
  location?: string;
  businessType?: string;
  mood?: string;
  /** Agent-specified camera movement from reel_motion_spec (e.g. "slow_push_in", "orbit") */
  cameraMotion?: string;
  /** Agent image_edit_prompt from VPS — injected into Runway director prompt */
  agentImageEditPrompt?: string;
  referenceImageUrl?: string;
  /** 2-3 additional gallery photos for multi-reference mode — Runway blends all into one video */
  additionalPhotoUrls?: string[];
  vibeProfile?: Record<string, unknown>;
  /** Gallery photo description from gallery_analysis — feeds AI director prompt */
  photoDescription?: string;
  /** Gallery photo content tags — feed content-kind inference */
  photoTags?: string[];
  /** BrandTheme grading for director prompt color injection */
  brandThemeGrading?: { look?: string; lut_directive?: string };
  transitionStyle?: string;
  treatment?: string;
  templateUseCase?: string;
  photos?: MultiReelPhotoInput[];
  strategy?: RunwayReelStrategy;
  galleryMeta?: Record<string, { description?: string; contentTags?: string[]; tags?: string[] }>;
  /** APO-3 — when set, single-reel path uses buildReelPayload + PIS gate */
  productionIdea?: ProductionIdea;
  /** MT-10 — approved/rejected learning snippet */
  tenantLearningBrief?: string;
}): Promise<string | null> {
  try {
    const baseUrl = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';

    const photoInputs: MultiReelPhotoInput[] = opts.photos?.length
      ? opts.photos
      : buildMultiReelPhotoInputs(
          [opts.referenceImageUrl, ...(opts.additionalPhotoUrls ?? [])].filter(
            (u): u is string => typeof u === 'string' && u.length > 0,
          ),
          opts.galleryMeta ?? {},
          normalizeGalleryUrl,
        );

    const runwayStrategy = opts.strategy ?? resolveRunwayReelStrategy({
      photoCount: photoInputs.length,
      transitionStyle: opts.transitionStyle,
      treatment: opts.treatment,
      templateUseCase: opts.templateUseCase,
      mood: opts.mood,
      contentType: 'reel',
    });

    const vibeEarly = opts.vibeProfile ?? {};
    const vibeMotionEarly = (vibeEarly.motion as Record<string, string> | undefined) ?? {};
    const cameraMotion = resolveRunwayCameraMotionForFidelity({
      agentCamera: opts.cameraMotion,
      vibeCamera: vibeMotionEarly.camera_movement,
      mood: opts.mood,
      pace: vibeMotionEarly.pace,
    });

    if (runwayStrategy !== 'single' && photoInputs.length >= 2) {
      const montageStrategy: 'sequential' | 'multi_ref' =
        runwayStrategy === 'multi_ref' ? 'multi_ref' : 'sequential';
      const limit = maxPhotosForStrategy(runwayStrategy);
      console.log(`[auto-produce] Multi-reel ${montageStrategy}: ${Math.min(photoInputs.length, limit)} photos`);
      const multi = await callGenerateMultiReel(baseUrl, {
        workspaceId: opts.workspaceId,
        photos: photoInputs.slice(0, limit),
        headline: opts.headline || `${opts.brandName} Reel`,
        caption: opts.caption.slice(0, 300),
        brandName: opts.brandName,
        brandLocation: opts.location,
        vibeProfile: opts.vibeProfile,
        brandThemeGrading: opts.brandThemeGrading,
        strategy: montageStrategy,
        ratio: '720:1280',
        duration: 5,
        agentVisualDirection: opts.agentImageEditPrompt?.slice(0, 400),
        cameraMotion,
      });
      if (multi.videoUrl) {
        console.log(`[auto-produce] Multi-reel produced (${multi.strategy}):`, multi.videoUrl.slice(0, 80));
        return multi.videoUrl;
      }
      console.warn('[auto-produce] Multi-reel failed, falling back to single:', multi.error?.slice(0, 120));
    }

    // Build a vibe-aware cinematic concept from the vibe DNA
    const vibe = opts.vibeProfile ?? {};
    const grading = (vibe.grading as Record<string, string> | undefined) ?? {};
    const composition = (vibe.composition as Record<string, string> | undefined) ?? {};
    const sourceAccounts: string[] = Array.isArray(vibe.source_accounts) ? vibe.source_accounts : [];

    const vibeCinema = [
      grading.look ? `${grading.look} color grade` : 'golden hour color grade',
      grading.lut_directive ? grading.lut_directive : '',
      composition.framing_rules ? composition.framing_rules : 'subject in lower-third, expansive sky or sea',
    ].filter(Boolean).join(', ');

    const antiPatterns: string[] = Array.isArray(vibe.anti_patterns) ? vibe.anti_patterns : [];

    const concept = [
      `${opts.brandName || 'Brand'} — ${opts.headline}`,
      opts.location ? `Location: ${opts.location}` : '',
      opts.mood ? `Mood: ${opts.mood}` : '',
      // Agent's image_edit_prompt from VPS provides specific visual direction for this idea
      opts.agentImageEditPrompt ? `Visual direction: ${opts.agentImageEditPrompt.slice(0, 200)}` : '',
      `Cinematic style: ${vibeCinema}`,
      sourceAccounts.length ? `Aesthetic reference: ${sourceAccounts.map(a => '@' + a).join(', ')} quality` : '',
      antiPatterns.length ? `Avoid: ${antiPatterns.join(', ')}` : '',
    ].filter(Boolean).join('. ');

    let body: Record<string, unknown>;

    if (opts.productionIdea && runwayStrategy === 'single') {
      const brandCtx: RendererBrandContext = {
        brandName: opts.brandName,
        location: opts.location,
        businessType: opts.businessType,
        vibeProfile: opts.vibeProfile,
        themeGrading: opts.brandThemeGrading
          ? {
              look: opts.brandThemeGrading.look,
              lutDirective: opts.brandThemeGrading.lut_directive,
            }
          : undefined,
        visualStyle: grading.look || '',
        brandTone: opts.businessType || 'lifestyle',
        missionBrief: opts.tenantLearningBrief,
      };
      const gallery: RendererGalleryMeta = {
        photoUrl: opts.referenceImageUrl ?? null,
        description: opts.photoDescription,
        tags: opts.photoTags,
      };
      const reelPayload = buildReelPayload(opts.productionIdea, brandCtx, gallery, {
        cameraMotion,
      });
      body = reelPayloadToGenerateReelBody(reelPayload, {
        workspaceId: opts.workspaceId,
        businessType: opts.businessType,
        vibeProfile: opts.vibeProfile,
        photoDescription: opts.photoDescription,
        photoTags: opts.photoTags,
        brandThemeGrading: opts.brandThemeGrading,
        referenceImageUrl: opts.referenceImageUrl,
        additionalPhotoUrls: opts.additionalPhotoUrls,
        cameraMotion,
        agentVisualDirection: opts.agentImageEditPrompt,
      });
      const pis = gatePromptIntegrity('runway', body, PIS_PRODUCTION_MIN_SCORE);
      if (!pis.pass) {
        console.warn(
          `[auto-produce] Runway PIS skip (${pis.score}%): ${pis.missing.join(', ')}`,
        );
        return null;
      }
      console.log(`[auto-produce] Runway body via buildReelPayload (PIS ${pis.score}%)`);
    } else {
      const palette = (vibe.palette as Record<string, string> | undefined) ?? {};
      const paletteDesc = palette.palette_description ?? '';
      const derivedVisualStyle = grading.look || paletteDesc || 'warm';
      const derivedBrandTone = paletteDesc || (opts.businessType || 'lifestyle');

      body = {
        title: opts.headline || `${opts.brandName} Reel`,
        caption: opts.caption,
        concept,
        platform: 'instagram',
        contentType: 'reel',
        visualStyle: derivedVisualStyle,
        cameraMotion,
        brandTone: derivedBrandTone,
        duration: 5,
        ratio: '720:1280',
        sceneMetadata: {
          brandName: opts.brandName,
          location: opts.location,
          businessType: opts.businessType,
          workspaceId: opts.workspaceId,
          ...(opts.agentImageEditPrompt
            ? { agentVisualDirection: opts.agentImageEditPrompt.slice(0, 400) }
            : {}),
        },
        photoDescription: opts.photoDescription,
        photoTags: opts.photoTags,
        vibeProfile: opts.vibeProfile
          ? {
              grading: (opts.vibeProfile.grading as Record<string, unknown>) ?? {},
              palette: (opts.vibeProfile.palette as Record<string, unknown>) ?? {},
              motion: (opts.vibeProfile.motion as Record<string, unknown>) ?? {},
              composition: (opts.vibeProfile.composition as Record<string, unknown>) ?? {},
            }
          : undefined,
        brandThemeGrading: opts.brandThemeGrading,
      };

      const allPhotoUrls = [
        opts.referenceImageUrl,
        ...(opts.additionalPhotoUrls ?? []),
      ].filter((u): u is string => typeof u === 'string' && u.startsWith('http'));

      if (allPhotoUrls.length >= 2) {
        body.promptImages = allPhotoUrls.slice(0, 4);
        console.log(`[auto-produce] Multi-reference reel: ${allPhotoUrls.length} photos`);
      } else if (opts.referenceImageUrl) {
        body.promptImage = opts.referenceImageUrl;
      }
    }

    const res = await fetch(`${baseUrl}/api/generate-reel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(240_000), // Runway gen4_turbo ~60-90s
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.warn('[auto-produce] Runway reel failed', res.status, err.slice(0, 200));
      return null;
    }

    const data = await res.json();
    const videoUrl = (data.videoUrl ?? data.outputUrls?.[0]) as string | undefined;
    if (videoUrl) {
      console.log('[auto-produce] Runway reel produced:', videoUrl.slice(0, 80));
    }
    return videoUrl ?? null;
  } catch (err) {
    console.warn('[auto-produce] Runway reel error', err);
    return null;
  }
}

/** PATCH existing production bundle with Remotion PNG poster (1 idea = 1 artifact). */
async function attachPosterToProductionBundle(opts: {
  nexusApi: string;
  internalKey: string;
  workspaceId: string;
  artifactId: string;
  imageUrl: string;
  referencePhotoUrl: string;
  compositionId: string;
  posterTemplateId: string;
  renderMs?: number;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${opts.nexusApi}/api/artifacts/${opts.artifactId}/attach-image`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Id': opts.workspaceId,
        'X-Internal-Api-Key': opts.internalKey,
      },
      body: JSON.stringify({
        imageUrl: opts.imageUrl,
        contentType: 'instagram_post',
        productionBundle: true,
        compositionId: opts.compositionId,
        posterTemplateId: opts.posterTemplateId,
        referencePhotoUrl: opts.referencePhotoUrl,
        renderMs: opts.renderMs ?? null,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `Nexus ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

/** PATCH existing production bundle with Remotion MP4 (1 idea = 1 artifact). */
async function attachVideoToProductionBundle(opts: {
  nexusApi: string;
  internalKey: string;
  workspaceId: string;
  artifactId: string;
  videoUrl: string;
  posterUrl: string;
  compositionId: string;
  grafikerScore: number | null;
  grafikerPass: boolean;
  renderMs?: number;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${opts.nexusApi}/api/artifacts/${opts.artifactId}/attach-video`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Id': opts.workspaceId,
        'X-Internal-Api-Key': opts.internalKey,
      },
      body: JSON.stringify({
        videoUrl: opts.videoUrl,
        posterUrl: opts.posterUrl,
        compositionId: opts.compositionId,
        grafikerScore: opts.grafikerScore,
        grafikerPass: opts.grafikerPass,
        renderMs: opts.renderMs ?? null,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `Nexus ${res.status}: ${text.slice(0, 200)}` };
    }
        return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

/** Mark production bundle failed; attach reachable gallery still so Feed preview is not broken. */
async function markProductionBundleFailed(opts: {
  nexusApi: string;
  internalKey: string;
  workspaceId: string;
  artifactId: string;
  error: string;
  posterUrl?: string | null;
  contentType?: string;
}): Promise<void> {
  try {
    await fetch(`${opts.nexusApi}/api/artifacts/${opts.artifactId}/bundle-status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Id': opts.workspaceId,
        'X-Internal-Api-Key': opts.internalKey,
      },
      body: JSON.stringify({ status: 'failed', error: opts.error.slice(0, 300) }),
    });
  } catch {
    /* best-effort */
  }

  const rawPoster = opts.posterUrl?.trim();
  if (!rawPoster) return;
  const preview = toFeedPreviewUrl(rawPoster) ?? rawPoster;
  if (!(await probeMediaUrl(preview))) return;

  try {
    const res = await fetch(`${opts.nexusApi}/api/artifacts/${opts.artifactId}/attach-image`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Id': opts.workspaceId,
        'X-Internal-Api-Key': opts.internalKey,
      },
      body: JSON.stringify({
        imageUrl: preview,
        contentType: opts.contentType ?? 'instagram_story',
        productionBundle: true,
        referencePhotoUrl: rawPoster,
      }),
    });
    if (res.ok) {
      console.log(
        `[auto-produce] Failed bundle → gallery still: ${opts.artifactId.slice(0, 8)}`,
      );
    }
  } catch {
    /* best-effort */
  }
}

async function saveArtifactToNexus(
  workspaceId: string,
  params: { title: string; contentUrl: string; content: string; platform: string; contentType: string; metadata: Record<string, unknown> },
): Promise<{ id?: string; error?: string }> {
  try {
    const res = await fetch(`${NEXUS_API}/api/artifacts/creative`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Id': workspaceId,
        'X-Internal-Api-Key': INTERNAL_KEY,
      },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { error: `Nexus ${res.status}: ${text.slice(0, 200)}` };
    }
    const data = await res.json();
    return { id: data.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' };
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  cleanupOldBuckets();

  let body: AutoProduceRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    workspaceId,
    missionId,
    nodeKey,
    ideas,
    galleryAnalysis,
    brandName,
    bundleCards,
    feedDirectorReport,
    missionType: strategistMissionType,
    productionPackage,
    missionTitle,
    creativeBrief,
  } = body;
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }

  const tenantGuard = assertWorkspaceMatchesRequestTenant(req, workspaceId);
  if (tenantGuard) return tenantGuard;

  const qualityGuard = await assertAutonomousProductionAllowed(req, workspaceId);
  if (qualityGuard) return qualityGuard;

  // Per-workspace concurrent production lock.
  // Two simultaneous auto-produce calls for the same brand would pick the same
  // gallery photos and templates → duplicate artifacts in the feed.
  const lockAcquired = acquireProductionLock(workspaceId);
  if (!lockAcquired) {
    return NextResponse.json(
      { error: 'Bu marka için içerik üretimi zaten devam ediyor. Lütfen bekleyin.', code: 'production_in_progress' },
      { status: 409 },
    );
  }

  if (missionId) {
    const missionGuard = await assertMissionBelongsToWorkspace(workspaceId, missionId, {
      req,
      skipForInternal: true,
    });
    if (missionGuard) {
      releaseProductionLock(workspaceId);
      return missionGuard;
    }
  }

  if (!ideas?.length) {
    releaseProductionLock(workspaceId);
    return NextResponse.json({ error: 'No ideas provided' }, { status: 400 });
  }

  // ── Phase 1: Build brand production context ────────────────────────────────
  // All brand data fetched in parallel, tenant-isolated by workspaceId.
  // Any individual failure degrades gracefully — context is always valid.
  // ─────────────────────────────────────────────────────────────────────────
  let response: NextResponse;
  try {
    response = await runProduction({
      workspaceId, missionId, nodeKey, ideas,
      galleryAnalysis: galleryAnalysis ?? null,
      brandNameOverride: brandName ?? null,
      bundleCards,
      feedDirectorReport: (feedDirectorReport ?? null) as Record<string, unknown> | null,
      strategistMissionType: strategistMissionType ?? null,
      productionPackage: productionPackage ?? null,
      missionTitle: missionTitle ?? null,
      creativeBrief: creativeBrief ?? null,
    });
  } finally {
    // Always release — even if runProduction throws or times out
    releaseProductionLock(workspaceId);
  }
  return response;
}

// ─── Core production engine ────────────────────────────────────────────────────
// Extracted from POST so the lock try-finally can wrap it cleanly.
// All data is workspace-scoped — no cross-tenant state.

interface RunProductionParams {
  workspaceId: string;
  missionId?: string;
  nodeKey?: string;
  ideas: ParsedIdea[];
  galleryAnalysis: Record<string, unknown> | null;
  brandNameOverride: string | null;
  bundleCards?: boolean;
  feedDirectorReport: Record<string, unknown> | null;
  strategistMissionType: string | null;
  productionPackage: string | null;
  missionTitle: string | null;
  creativeBrief: string | null;
}

async function runProduction(params: RunProductionParams): Promise<NextResponse> {
  const {
    workspaceId, missionId, nodeKey,
    ideas, galleryAnalysis: galleryAnalysisInput,
    brandNameOverride, bundleCards,
    feedDirectorReport, strategistMissionType,
    productionPackage, missionTitle, creativeBrief,
  } = params;
  const brandName = brandNameOverride ?? undefined;

  // ── Phase 1: Fetch brand production context ─────────────────────────────────
  // All brand data fetched in parallel, fully tenant-isolated.
  // Uses fetchProductionContext() from ./production-context.ts
  const pctx = await fetchProductionContext(workspaceId, {
    brandName: brandName ?? undefined,
    creativeBrief: creativeBrief ?? undefined,
  });

  const resolvedBrandName = pctx.brandName;
  if (!resolvedBrandName || resolvedBrandName === 'Brand') {
    // Try to proceed with best guess — don't hard-block since pctx.brandName always has a fallback
    console.warn(`[auto-produce:${workspaceId}] brand name missing — using fallback`);
  }

  // Alias to legacy variable names used throughout the rest of the function
  // These all reference pctx, ensuring tenant isolation
  const brandCtx = pctx.raw;
  const hasVibe = pctx.hasVibe;
  const brandLocation = pctx.brandLocation;
  const brandBusinessType = pctx.brandBusinessType;
  const brandLogoUrl = pctx.brandLogoUrl;
  const brandTheme = pctx.brandTheme;
  const templateLibrary = pctx.templateLibrary;
  const brandKitId = pctx.kitId;
  const aiPhotoEnhance = pctx.aiPhotoEnhanceEnabled;
  const aiPhotoEnhanceLevel = pctx.aiPhotoEnhanceLevel;
  const aiVisualStandard = pctx.aiVisualStandard;
  const resolvedVisualSubject = pctx.resolvedVisualSubject;
  const missionVisualBrief = pctx.missionVisualBrief;
  const tenantLearningBrief = pctx.tenantLearningBrief;
  const brandLutDirective = pctx.brandLutDirective ?? '';
  const brandGradingLook = pctx.brandGradingLook ?? '';
  const brandAntiPatterns = pctx.brandAntiPatterns;
  const motionProfile = pctx.motionProfile;
  const brandCtxForVisual = pctx.brandCtxForVisual;

  const vibePalette = hasVibe
    ? ((brandCtx.brand_vibe_profile as Record<string, unknown>)?.palette as Record<string, string> | undefined)
    : undefined;
  const syncPrimaryColor = vibePalette?.primary;
  const syncAccentColor = vibePalette?.accent;

  // Log brand story templates for this workspace
  const missionStorySlotKeys = templateLibrary.slots
    .filter((s) => s.format === 'story' && s.enabled && s.storyTemplateId)
    .map((s) => `${s.key}:${s.storyTemplateId}`);
  if (missionStorySlotKeys.length) {
    console.log(
      `[auto-produce] Brand story templates (${templateLibrary.locked ? 'locked' : 'derived'}): ` +
      missionStorySlotKeys.join(', '),
    );
  }

  if (aiVisualStandard.enabled) {
    console.log(
      `[auto-produce] AI Görsel Geliştirme ON (level=${aiPhotoEnhanceLevel}, subject=${resolvedVisualSubject}, ` +
      `formats=${[...aiVisualStandard.formats].join(',')}, identity=${aiVisualStandard.useBrandIdentity}, ` +
      `briefScene=${aiVisualStandard.briefDrivesScene}, logo=${aiVisualStandard.embedLogo})`,
    );
  }

  // ── Phase 2: Budget check ───────────────────────────────────────────────────
  const budget = await canProduce(workspaceId, ideas.length, 0, {
    missionProduction: Boolean(missionId),
  });
  if (!budget.allowed) {
    releaseProductionLock(workspaceId);
    console.warn(
      `[auto-produce] Budget blocked workspace=${workspaceId} mission=${missionId ?? 'none'}: ${budget.reason}`,
    );
    return NextResponse.json({
      error: budget.reason,
      produced: 0,
      code: missionId ? 'mission_production_budget_blocked' : 'production_budget_blocked',
      budget: {
        spentTodayUsd: budget.spentTodayUsd,
        dailyBudgetUsd: budget.dailyBudgetUsd,
        remainingUsd: budget.remainingUsd,
      },
    }, { status: 429 });
  }

  const maxIdeas = budget.remaining;
  const rawSlice = ideas.slice(0, maxIdeas) as Record<string, unknown>[];
  const productionIdeas = productionIdeasFromParsed(rawSlice, missionId);
  const toProcess = productionIdeas.map((pi) => productionIdeaToRecord(pi) as ParsedIdea);
  console.log(`[auto-produce] ICS parsed=${productionIdeas.length} ideas (ProductionIdea)`);
  const pisScores: number[] = [];
  const pisWarnings: Array<{
    idea_index: number;
    headline: string;
    renderer: string;
    score: number;
    missing: string[];
    pipeline: string;
  }> = [];
  const fdAssignments = parseProductionAssignments(feedDirectorReport ?? null);
  const manifestMissionType = resolveManifestMissionType({
    hubPackage: (productionPackage ?? null) as 'weekly_content' | 'campaign' | 'event' | 'ads_focus' | null,
    missionType: strategistMissionType ?? null,
    title: missionTitle,
    creativeBrief,
  });
  const manifestValidation = validateManifestAgainstAssignments(
    missionId || workspaceId,
    fdAssignments,
    manifestMissionType,
    { requireCampaignReel: manifestMissionType === 'campaign' },
  );
  const hasOrganicReelAssignment = fdAssignments.some((a) => a.slot_role === 'organic_reel');
  const stackCtx = createProductionStackContext(feedDirectorReport ?? null, {
    assignments: fdAssignments,
    ideas: toProcess as Record<string, unknown>[],
  });
  if (stackCtx.heroReelIndex === null && toProcess.length > 0) {
    stackCtx.heroReelIndex = inferHeroReelIndex(toProcess as Record<string, unknown>[]);
  }
  const primaryIdeaIndices = resolvePrimaryIndicesWithReport(
    toProcess as Record<string, unknown>[],
    feedDirectorReport ?? null,
  );
  const maxRunwayReelsPerMission = resolveMaxRunwayReelsPerMission(brandTheme);
  let runwayReelsProducedInMission = 0;
  if (feedDirectorReport || fdAssignments.length > 0) {
    const assignCount = (feedDirectorReport as any)?.production_assignments?.length ?? fdAssignments.length;
    console.log(
      `[auto-produce] Production Stack: manifest=${manifestMissionType} ` +
      `feed_score=${(feedDirectorReport as any)?.feed_score ?? 'n/a'} ` +
      `hero_reel=${stackCtx.heroReelIndex ?? 'n/a'} max_runway=${maxRunwayReelsPerMission} ` +
      `assignments=${assignCount} manifest_cov=${(feedDirectorReport as any)?.manifest_coverage_pct ?? manifestValidation.coveragePct}% ` +
      `slot_fill=${manifestValidation.filledRequired}/${manifestValidation.requiredSlots} ` +
      `layouts=${((feedDirectorReport as any)?.recommended_layout_families ?? []).slice(0, 4).join(',')}`,
    );
  }
  let slotPostCount = 0;
  let slotStoryCount = 0;
  let slotReelCount = 0;
  const sceneBriefCache = new Map<number, ProductSceneBrief | null>();

  // ── Phase 3: Prepare gallery context ───────────────────────────────────────
  // Fully tenant-isolated: all gallery data fetched via X-Tenant-Id header.
  // Health check, enrichment, and sector seed fill happen here.
  const galleryAnalysis = galleryAnalysisInput as Record<string, unknown> | null;
  const gctx = await fetchGalleryContext(
    workspaceId,
    brandCtx,
    galleryAnalysis,
    brandBusinessType,
  );
  triggerGalleryAnalysisIfNeeded(workspaceId, gctx, galleryAnalysis);

  // Alias to legacy variable names used throughout the production loop
  let galleryPhotos = gctx.photos;
  const galleryMeta = gctx.meta;
  const hasGallery = gctx.hasPhotos;
  const hasRealBrandPhotos = gctx.hasRealPhotos;
  const galleryUsage = gctx.usage;
  const batchUsedByType = gctx.batchUsedByType;
  const syncUsedTemplateIds: string[] = [...gctx.recentTemplateIds];

  // galleryMetaRaw alias for code that still references it directly
  const galleryMetaRaw = (galleryAnalysis ?? {}) as Record<string, import('@/lib/gallery-photo-matcher').GalleryPhotoMeta>;
  const results: { id?: string; title: string; imageUrl: string; videoUrl?: string; error?: string }[] = [];
  let costEstimate = 0;
  const routeBaseUrl = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';
  const location = brandLocation;

  // ── Production rules (APO-2 pipeline router) ───────────────────────────────
  // organic_post      → gallery photo only + caption in Feed
  // designed_post     → Remotion agency poster (SVG+Sharp)
  // organic_story_still → static gallery story
  // campaign_story_motion → Remotion MP4
  // organic_reel / campaign_reel_motion → Runway (hero budget)
  // ─────────────────────────────────────────────────────────────────────────
  const creatomateStoryCandidates: Array<{
    headline: string;
    caption: string;
    photoUrl: string;
    galleryPhotoUrls?: string[];
    galleryLayout?: 'dual' | 'triple' | 'sequence';
    artifactId: string;
    ideaId?: string;
    treatment?: string;
    mood?: string;
    templateUseCase?: string;
    event_details?: Record<string, string>;
    sceneBriefBlock?: string;
    preferredLayoutFamily?: RemotionLayoutFamily;
    slotRole?: ProductionSlotRole;
    publishChannel?: string;
    ideaIndex?: number;
    librarySlotKey?: string;
  }> = [];

  const remotionPostCandidates: Array<{
    headline: string;
    caption: string;
    photoUrl: string;
    artifactId: string;
    ideaId?: string;
    ideaIndex?: number;
    treatment?: string;
    mood?: string;
    templateUseCase?: string;
    event_details?: Record<string, string>;
  }> = [];


  for (let ideaIndex = 0; ideaIndex < toProcess.length; ideaIndex++) {
    const idea = toProcess[ideaIndex]!;
    const ideaId = randomUUID();
    const headline = getField(idea, 'headline', 'concept_title', 'title');
    let caption = getField(idea, 'caption_draft', 'caption');
    const hashtags = normalizeHashtags(idea.hashtags);
    let cta = getField(idea, 'cta', 'call_to_action');
    if (caption && cta) {
      const harmonized = harmonizeCaptionAndCta(
        caption,
        cta,
        (brandCtx.languages as string | undefined) ?? (brandCtx.inferred_language as string | undefined),
      );
      caption = harmonized.caption;
      cta = harmonized.cta;
    }
    const kind = detectContentKind(idea);
    const ideaRecord = idea as Record<string, unknown>;
    const pkgFmt = detectIdeaPackageFormat(ideaRecord);
    const postIndex = pkgFmt === 'post' || pkgFmt === 'carousel' ? slotPostCount : 0;
    const storyIndex = pkgFmt === 'story' ? slotStoryCount : 0;
    const reelIndex = pkgFmt === 'reel' ? slotReelCount : 0;
    const assignment = resolveProductionAssignment({
      ideaIndex,
      idea: ideaRecord,
      report: feedDirectorReport ?? null,
      missionId: missionId || '',
      postIndex,
      storyIndex,
      reelIndex,
    });
    if (pkgFmt === 'post' || pkgFmt === 'carousel') slotPostCount += 1;
    else if (pkgFmt === 'story') slotStoryCount += 1;
    else if (pkgFmt === 'reel') slotReelCount += 1;

    const postType = kindToPostType(kind);
    const fmt = kind.replace('instagram_', '');
    const mood = idea.mood || '';
    const strategicPurpose = idea.strategic_purpose || '';
    const treatmentLower = ((idea.treatment ?? idea.visual_production_spec?.treatment) || '').toLowerCase();
    const templateUseCase = String(idea.template_use_case || '');
    const typeExclude = getExcludeUrlsForPostType(galleryUsage, postType, batchUsedByType[postType]);

    if (!caption && !headline) {
      results.push({ title: '(empty idea)', imageUrl: '', error: 'No caption or headline' });
      continue;
    }

    if (shouldSkipIdeaForProduction(ideaIndex, feedDirectorReport ?? null, {
      missionProduction: Boolean(missionId),
    })) {
      console.warn(`[auto-produce] Feed Art Director skip (error flag): idea ${ideaIndex} "${headline.slice(0, 40)}"`);
      results.push({ title: headline, imageUrl: '', error: 'Feed Art Director flagged (error)' });
      continue;
    }

    const prodIdea = productionIdeas[ideaIndex]!;
    const agentUrlEarly =
      prodIdea.visualProductionSpec.selectedGalleryUrl
      ?? idea.visual_production_spec?.selected_gallery_url
      ?? idea.selected_gallery_url
      ?? null;
    const pisRenderer = resolveProductionRenderer(assignment.pipeline, prodIdea);
    const pisGalleryUrl =
      (typeof agentUrlEarly === 'string' && agentUrlEarly.startsWith('http') ? agentUrlEarly : null)
      ?? (galleryPhotos[0] ?? null);
    const pisBrand: RendererBrandContext = {
      brandName: resolvedBrandName,
      location: brandLocation,
      businessType: brandBusinessType,
      logoUrl: brandLogoUrl || undefined,
      visualStyle: brandGradingLook || undefined,
      brandTone: (brandCtx.brand_tone as string) ?? undefined,
      targetAudience: (brandCtx.target_audience as string) ?? undefined,
      vibeProfile: hasVibe ? brandCtx.brand_vibe_profile : undefined,
      missionBrief: missionVisualBrief || undefined,
      themeGrading: brandLutDirective
        ? { look: brandGradingLook || undefined, lutDirective: brandLutDirective }
        : undefined,
    };
    const pisGallery: RendererGalleryMeta = { photoUrl: pisGalleryUrl };
    const pisPayload = buildPayloadForIntegrityCheck(pisRenderer, prodIdea, pisBrand, pisGallery);
    const pisMinScore = missionId ? 50 : PIS_PRODUCTION_MIN_SCORE;
    const pisGate = gatePromptIntegrity(pisRenderer, pisPayload, pisMinScore);
    auditRendererPayload(pisRenderer, pisPayload);
    if (!pisGate.pass) {
      console.warn(
        `[auto-produce] PIS ${missionId ? 'warn' : 'skip'} idea ${ideaIndex} ` +
        `(${assignment.pipeline}/${pisRenderer} ${pisGate.score}%): ${pisGate.missing.join(', ')}`,
      );
      pisWarnings.push({
        idea_index: ideaIndex,
        headline: headline.slice(0, 80),
        renderer: pisRenderer,
        score: pisGate.score,
        missing: pisGate.missing,
        pipeline: assignment.pipeline,
      });
      if (!missionId) {
        results.push({
          title: headline,
          imageUrl: '',
          error: `PIS ${pisGate.score}% — eksik: ${pisGate.missing.slice(0, 3).join(', ')}`,
        });
        continue;
      }
    }
    pisScores.push(pisGate.score);

    // Production Stack: scene brief for Remotion / Runway enrichment
    let sceneBrief = sceneBriefCache.get(ideaIndex);
    if (sceneBrief === undefined) {
      const sceneCaptionParts = [
        headline ? `Headline: ${headline}` : '',
        caption ? `Caption: ${caption}` : '',
        aiVisualStandard.briefDrivesScene && missionVisualBrief
          ? `Mission brief: ${missionVisualBrief}`
          : '',
      ].filter(Boolean);
      sceneBrief = await fetchProductSceneBrief({
        workspaceId,
        caption: sceneCaptionParts.join('\n') || headline || caption,
        productType: idea.product_type || idea.subject || '',
        sector: brandBusinessType,
        mood,
        enhanceLevel: aiPhotoEnhanceLevel,
        visualSubject: resolvedVisualSubject as 'venue_ambiance' | 'product_hero' | undefined,
      });
      sceneBriefCache.set(ideaIndex, sceneBrief);
    }
    const layoutFamilyCandidates = (((feedDirectorReport as any)?.recommended_layout_families ?? []) as unknown[])
      .filter((f): f is RemotionLayoutFamily => typeof f === 'string');
    const layoutFamilyHint = resolveLayoutFamilyForAssignment(
      stackCtx,
      assignment,
      layoutFamilyCandidates,
    );
    const isHeroReel = shouldProduceRunwayForIdea(ideaIndex, kind, stackCtx, {
      reelsProducedInMission: runwayReelsProducedInMission,
      maxReelsPerMission: maxRunwayReelsPerMission,
      slotRole: assignment.slot_role,
      hasOrganicReelAssignment,
    });
    const creativeTrace = buildCreativeTrace(stackCtx, {
      ideaIndex,
      layoutFamilyHint,
      sceneBrief,
      isHeroReel,
    });

    // ── Step 1: find best gallery reference photo (per post type) ─────
    let referenceUrl: string | null = null;
    let carouselGalleryUrls: string[] = [];
    let enhancedGallerySet: string[] = [];

    const agentUrl = idea.visual_production_spec?.selected_gallery_url || idea.selected_gallery_url || null;
    const batchExclude = batchUsedByType[postType];

    if (hasGallery) {
      referenceUrl = pickGalleryPhotoForIdea(
        caption,
        headline,
        mood,
        galleryMeta,
        galleryPhotos,
        typeExclude,
        batchExclude,
        postType,
        typeof agentUrl === 'string' && agentUrl.startsWith('http') ? agentUrl : null,
        brandBusinessType,
      );
    }

    if (!referenceUrl || (!hasRealBrandPhotos && referenceUrl.includes('unsplash.com'))) {
      // No usable gallery photo: either null or a sector-seed Unsplash URL.
      // Generate a fresh AI image from brand + content context.
      if (referenceUrl?.includes('unsplash.com')) {
        console.log(`[auto-produce] replacing sector-seed Unsplash URL with AI image for: "${headline.slice(0, 50)}"`);
      } else {
        console.log(`[auto-produce] no gallery photo → AI image generation for: "${headline.slice(0, 50)}"`);
      }
      const baseUrl = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';
      const aiGenerated = await generateVibeImage({
        workspaceId,
        headline,
        caption,
        contentType: kind,
        brandName: resolvedBrandName,
        location: brandLocation,
        businessType: brandBusinessType,
        brandTone: String(brandCtx.brand_tone ?? ''),
        brandDescription: String(brandCtx.description ?? ''),
        targetAudience: String(brandCtx.target_audience ?? ''),
        visualStyle: String(brandCtx.visual_style ?? ''),
        visualDna: String(brandCtx.visual_dna ?? ''),
        vibeProfile: hasVibe ? (brandCtx.brand_vibe_profile as Record<string, unknown>) : null,
        logoUrl: brandLogoUrl || undefined,
        referenceImageUrls: (brandCtx.reference_image_urls as string[] | undefined)?.slice(0, 2),
        agentImageEditPrompt: (idea.visual_production_spec as Record<string, unknown> | undefined)
          ?.image_edit_prompt as string | undefined,
        lutDirective: brandLutDirective || undefined,
        antiPatterns: brandAntiPatterns.length ? brandAntiPatterns : undefined,
      });
      if (!aiGenerated) {
        console.warn(`[auto-produce] AI image generation failed for: "${headline.slice(0, 50)}"`);
        results.push({ title: headline, imageUrl: '', error: 'Galeri boş ve AI görsel üretimi başarısız oldu' });
        continue;
      }
      referenceUrl = aiGenerated;
      console.log(`[auto-produce] AI image generated: ${aiGenerated.slice(0, 80)}`);
    }

    if (!(await probeGalleryImageUrl(referenceUrl))) {
      console.warn(`[auto-produce] broken gallery URL skipped: ${referenceUrl.slice(0, 100)}`);
      results.push({
        title: headline,
        imageUrl: '',
        error: 'Seçilen galeri fotoğrafı erişilemiyor (süresi dolmuş veya geçersiz URL)',
      });
      continue;
    }

    const galleryPreviewUrl = toFeedPreviewUrl(referenceUrl) ?? referenceUrl;

    const useMultiGallery = hasGallery && shouldUseMultiGalleryPhotos(assignment, kind);
    if (useMultiGallery) {
      const extraCount = Math.max(1, multiGalleryPhotoCount(assignment, kind) - 1);
      const extras = pickSupplementaryGalleryPhotos(
        caption,
        headline,
        mood,
        galleryMeta,
        galleryPhotos,
        referenceUrl,
        batchUsedByType[postType],
        extraCount,
        postType,
      );
      enhancedGallerySet = [referenceUrl, ...extras];
    } else {
      enhancedGallerySet = [referenceUrl];
    }

    let aiEnhanceApplied = false;
    const enhanceResult = await runGptImageEnhanceForIdea({
      baseUrl: routeBaseUrl,
      workspaceId,
      photoUrls: enhancedGallerySet,
      brandName: resolvedBrandName,
      businessType: brandBusinessType,
      level: aiPhotoEnhanceLevel,
      assignment,
      contentKind: kind,
      visualStandard: aiVisualStandard,
      brandCtx: brandCtxForVisual,
      brandTheme,
      sceneBrief,
      caption,
      headline,
      strategicPurpose,
      mood,
      cta,
      missionBrief: missionVisualBrief,
      logoUrl: brandLogoUrl || undefined,
      referenceImageUrls: (brandCtx.reference_image_urls as string[] | undefined) ?? [],
      productType: idea.product_type || idea.subject || '',
      maxPhotos: multiGalleryPhotoCount(assignment, kind),
    });
    if (enhanceResult.applied && enhanceResult.photoUrls.length) {
      enhancedGallerySet = enhanceResult.photoUrls;
      referenceUrl = enhanceResult.photoUrls[0]!;
      aiEnhanceApplied = true;
      costEstimate += 0.21 * enhanceResult.photoUrls.length;
      console.log(
        `[auto-produce] gpt-image-2 enhance ×${enhanceResult.photoUrls.length} (${aiPhotoEnhanceLevel}): "${headline.slice(0, 40)}"`,
      );
    } else if (aiVisualStandard.enabled) {
      // Enhance failed. If brand has no real photos (only sector seed Unsplash URLs
      // which GPT can't access), generate a fresh AI image from brand + content context.
      if (!hasRealBrandPhotos) {
        console.log(`[auto-produce] GPT enhance failed on seed photo → fresh AI generation for: "${headline.slice(0, 40)}"`);
        const baseUrl = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';
        const freshImage = await generateVibeImage({
          workspaceId,
          headline,
          caption,
          contentType: kind,
          brandName: resolvedBrandName,
          location: brandLocation,
          businessType: brandBusinessType,
          brandTone: String(brandCtx.brand_tone ?? ''),
          brandDescription: String(brandCtx.description ?? ''),
          targetAudience: String(brandCtx.target_audience ?? ''),
          visualStyle: String(brandCtx.visual_style ?? ''),
          visualDna: String(brandCtx.visual_dna ?? ''),
          vibeProfile: hasVibe ? (brandCtx.brand_vibe_profile as Record<string, unknown>) : null,
          logoUrl: brandLogoUrl || undefined,
          agentImageEditPrompt: (idea.visual_production_spec as Record<string, unknown> | undefined)
            ?.image_edit_prompt as string | undefined,
          lutDirective: brandLutDirective || undefined,
          antiPatterns: brandAntiPatterns.length ? brandAntiPatterns : undefined,
        });
        if (freshImage) {
          referenceUrl = freshImage;
          enhancedGallerySet = [freshImage];
          aiEnhanceApplied = true;
          costEstimate += 0.04; // gpt-image-1 flat rate estimate
          console.log(`[auto-produce] Fresh AI image generated: ${freshImage.slice(0, 80)}`);
        } else {
          console.warn(`[auto-produce] Fresh AI generation also failed — using seed: "${headline.slice(0, 40)}"`);
        }
      } else {
        console.warn(
          `[auto-produce] gpt-image-2 enhance boş döndü — Remotion ham galeri ile: "${headline.slice(0, 40)}"`,
        );
      }
    }

    // Never mark generative URLs — gallery-only pipeline guarantees real venue photos
    markGalleryUrlUsedForPostType(galleryUsage, referenceUrl, postType);
    batchUsedByType[postType].push(referenceUrl);

    const isReel     = kind === 'instagram_reel';
    const isCarousel = kind === 'instagram_carousel';
    const isCanvas   = kind === 'instagram_canvas';
    const hasEventDetails = Boolean(idea.event_details?.artist_name || idea.event_details?.date);
    const vibeProfile = hasVibe ? (brandCtx.brand_vibe_profile as Record<string, unknown>) : undefined;

    let reelFailureReason: string | null = null;

    // ── Step 2: Agency production ─────────────────────────────────────
    // Event overlay (story/post/canvas with event_details)
    //              → GPT-image-1 eventOverlayMode: photo bg + minimal gradient + text
    // Carousel     → 3-4 gallery photos enhanced with vibe DNA → media_urls
    // Reel         → Runway Gen4 Turbo image-to-video (~$0.10/5s)
    // Post/Story   → gpt-image-2 (AI ayar açık) → Remotion motion/still (marka token + şablon)
    let imageUrl: string | null = null;
    let videoUrl: string | null = null;
    let carouselUrls: string[] = [];
    let runwayProduceMeta: {
      source: 'runway' | 'runway_multi_photo';
      strategy?: string;
      photoCount?: number;
    } | null = null;

    // Event / canvas — announcement card (buildEventCardPayload) → Remotion fallback
    if (isCanvas || (hasEventDetails && !isReel && !isCarousel)) {
      const evDet = idea.event_details;
      const contentTypeFmt = kind === 'instagram_story' ? 'story' : 'post';
      const eventBrand: RendererBrandContext = {
        brandName: resolvedBrandName,
        location: brandLocation,
        businessType: brandBusinessType,
        vibeProfile,
      };
      const eventGallery: RendererGalleryMeta = { photoUrl: referenceUrl };
      let cardUrl = await renderEventCardFromPayload(prodIdea, eventBrand, eventGallery, {
        workspaceId,
        vibeProfile,
      });
      if (!cardUrl) {
        cardUrl = await generateMarkyLayerCard({
        workspaceId,
        headline,
        caption,
        brandName: resolvedBrandName,
        location: brandLocation,
        businessType: brandBusinessType,
        mood,
        vibeProfile,
        referenceImageUrl: referenceUrl,
        contentTypeFmt,
        templateUseCase: idea.template_use_case as string | undefined,
        strategicPurpose,
        ideaIndex,
        brandTheme,
        logoUrl: brandLogoUrl,
        primaryColor: syncPrimaryColor,
        accentColor: syncAccentColor,
        usedTemplateIds: syncUsedTemplateIds,
        baseUrl: routeBaseUrl,
        eventDetails: {
          artistName: evDet?.artist_name,
          date: evDet?.date,
          time: evDet?.time,
          venueArea: evDet?.venue_area ?? resolvedBrandName,
          tagline: evDet?.tagline,
          ctaText: evDet?.cta_text,
        },
      });
      }
      imageUrl = cardUrl ?? referenceUrl;
      if (cardUrl) costEstimate += 0.001;

    } else if (isCarousel) {
      if (enhancedGallerySet.length >= 2) {
        carouselUrls = [...enhancedGallerySet];
        carouselGalleryUrls = [...enhancedGallerySet];
        for (const gUrl of carouselGalleryUrls) {
          markGalleryUrlUsedForPostType(galleryUsage, gUrl, 'carousel');
          batchUsedByType.carousel.push(gUrl);
        }
        if (enhancedGallerySet.length < 4) {
          const already = new Set(carouselUrls.map(normalizeGalleryUrl));
          for (const p of galleryPhotos) {
            if (carouselUrls.length >= 4) break;
            if (!already.has(normalizeGalleryUrl(p)) && !p.toLowerCase().includes('logo')) {
              carouselUrls.push(p);
              if (!carouselGalleryUrls.includes(p)) carouselGalleryUrls.push(p);
              already.add(normalizeGalleryUrl(p));
            }
          }
        }
      } else if (hasGallery) {
        const carouselExclude = getExcludeUrlsForPostType(
          galleryUsage, 'carousel', batchUsedByType.carousel,
        );
        const carouselResult = await generateVibeCarousel({
          workspaceId,
          headline,
          caption,
          brandName:    resolvedBrandName,
          location:     brandLocation,
          businessType: brandBusinessType,
          mood,
          galleryAnalysis: galleryMeta,
          candidateUrls: galleryPhotos,
          excludeUrls: carouselExclude,
          count:        4,
        });
        carouselUrls = carouselResult.enhancedUrls;
        carouselGalleryUrls = carouselResult.galleryUrls;
        for (const gUrl of carouselGalleryUrls) {
          markGalleryUrlUsedForPostType(galleryUsage, gUrl, 'carousel');
          batchUsedByType.carousel.push(gUrl);
        }
        costEstimate += carouselUrls.length > 0 ? 0.04 : 0; // only hero slide enhanced

        // Fallback: fill remaining slots with raw gallery photos if we got < 4
        if (carouselUrls.length < 4) {
          const already = new Set(carouselUrls.map(normalizeGalleryUrl));
          for (const p of galleryPhotos) {
            if (carouselUrls.length >= 4) break;
            if (!already.has(normalizeGalleryUrl(p)) && !p.toLowerCase().includes('logo')) {
              carouselUrls.push(p);
              if (!carouselGalleryUrls.includes(p)) carouselGalleryUrls.push(p);
              already.add(normalizeGalleryUrl(p));
            }
          }
        }
      }
      // ── Branded carousel frame overlay ──────────────────────────────────
      // Apply agency-grade frame overlays to carousel slides:
      // slide 1: headline overlay, slides 2-N: slide number + swipe hint, last: CTA
      if (carouselUrls.length >= 2) {
        try {
          const { compositeCarouselFrames, fetchCarouselImageBuffer } = await import('@/lib/carousel-compositor');
          const carouselBrandTokens = resolveBrandProductionTokens({
            brandContext: brandCtx,
            brandTheme,
            vibeProfile: hasVibe ? (brandCtx.brand_vibe_profile as Record<string, unknown>) : undefined,
            sector: brandBusinessType,
            brandName: resolvedBrandName,
          });
          const slideBuffers = await Promise.all(
            carouselUrls.map(async (url, idx) => {
              const buf = await fetchCarouselImageBuffer(url);
              return buf ? { buffer: buf, index: idx, total: carouselUrls.length } : null;
            }),
          );
          const validSlides = slideBuffers.filter((s): s is NonNullable<typeof s> => s !== null);
          if (validSlides.length >= 2) {
            const { buffers } = await compositeCarouselFrames({
              slides: validSlides,
              brandName: resolvedBrandName,
              headline,
              caption: caption || undefined,
              cta: cta || (idea as { cta?: string }).cta || '',
              primaryColor: carouselBrandTokens.primaryColor,
              accentColor: carouselBrandTokens.accentColor,
            });
            // Convert composited buffers to base64 data URLs for immediate use
            carouselUrls = buffers.map(b => `data:image/jpeg;base64,${b.toString('base64')}`);
            costEstimate += 0.001 * buffers.length; // sharp compositing cost
            console.log(`[auto-produce] Carousel branded frames applied: ${buffers.length} slides`);
          }
        } catch (cErr: any) {
          console.warn('[auto-produce] Carousel compositor failed, using raw urls:', cErr?.message);
        }
      }

      imageUrl = carouselUrls[0] ?? referenceUrl;

    } else if (isReel && isHeroReel) {
      // Runway hero reel — only the Feed Art Director hero slot (budget-controlled)
      // reel_motion_spec can live at top level OR inside visual_production_spec (agent prompt puts it in VPS)
      const reelSpec = (idea.visual_production_spec as Record<string, unknown> | undefined)?.reel_motion_spec
        ?? idea.reel_motion_spec as Record<string, unknown> | undefined;
      // Fetch gallery photo description for AI director prompt
      const galleryEntry = referenceUrl
        ? (galleryMeta[referenceUrl] ?? Object.entries(galleryMeta).find(([k]) =>
            normalizeGalleryUrl(k) === normalizeGalleryUrl(referenceUrl!),
          )?.[1])
        : undefined;
      const photoDescription = galleryEntry?.description as string | undefined;
      const photoTags = Array.isArray(galleryEntry?.contentTags)
        ? (galleryEntry!.contentTags as string[])
        : undefined;

      // Pick 1-2 additional thematically RELATED photos for multi-reference enrichment.
      // Score by tag overlap with the primary photo's contentTags + headline/caption keywords.
      const primaryTags = new Set([
        ...(photoTags ?? []).map(t => t.toLowerCase()),
        ...caption.toLowerCase().split(/\s+/).filter(w => w.length > 4),
        ...headline.toLowerCase().split(/\s+/).filter(w => w.length > 4),
      ]);
      const additionalPhotoUrls = enhancedGallerySet.length > 1
        ? enhancedGallerySet.slice(1)
        : hasGallery
          ? galleryPhotos
              .filter(u =>
                u !== referenceUrl &&
                u.startsWith('http') &&
                !isGalleryUrlUsedForPostType(galleryUsage, u, 'reel'),
              )
              .map(u => {
                const entry = galleryMeta[u] ?? Object.entries(galleryMeta).find(([k]) =>
                  normalizeGalleryUrl(k) === normalizeGalleryUrl(u),
                )?.[1];
                const e = (entry ?? {}) as Record<string, unknown>;
                const entryTags: string[] = (
                  Array.isArray(e.contentTags) ? e.contentTags :
                  Array.isArray(e.tags) ? e.tags : []
                ).map((t: unknown) => String(t).toLowerCase());
                const overlap = entryTags.filter(t => primaryTags.has(t)).length;
                const urlLower = u.toLowerCase();
                const penalty = ['logo', 'map', 'banner', 'menu', 'icon'].some(p => urlLower.includes(p)) ? -5 : 0;
                return { url: u, score: overlap + penalty };
              })
              .sort((a, b) => b.score - a.score)
              .slice(0, 3)
              .map(x => x.url)
          : [];

      const reelPhotoInputs = buildMultiReelPhotoInputs(
        [referenceUrl, ...additionalPhotoUrls].filter((u): u is string => Boolean(u)),
        galleryMeta,
        normalizeGalleryUrl,
      );
      const reelStrategy = resolveRunwayReelStrategy({
        photoCount: reelPhotoInputs.length,
        transitionStyle: (reelSpec as Record<string, unknown> | undefined)?.transition_style as string | undefined,
        treatment: treatmentLower,
        templateUseCase,
        mood,
        contentType: 'reel',
      });
      const reelCostUsd = estimateRunwayReelCostUsd(reelStrategy, reelPhotoInputs.length);

      const runwayBudget = await canAffordRunway(workspaceId, reelCostUsd);
      if (runwayBudget.allowed) {
        const reelMood = (reelSpec as Record<string, unknown> | undefined)?.pace
          || (reelSpec as Record<string, unknown> | undefined)?.audio_mood
          || mood;
        const cameraHint = (reelSpec as Record<string, unknown> | undefined)?.camera_movement as string | undefined;
        const normalizedCameraHint = normalizeCameraMotion(cameraHint);
        const imageEditPromptForReel = [
          (idea.visual_production_spec as Record<string, unknown> | undefined)?.image_edit_prompt as string | undefined,
          buildRunwayDirectorExtra(sceneBrief),
        ].filter(Boolean).join(' — ');

        const runway = await generateRunwayReel({
          workspaceId,
          headline,
          caption,
          brandName:    resolvedBrandName,
          location:     brandLocation,
          businessType: brandBusinessType,
          mood: reelMood as string,
          cameraMotion: normalizedCameraHint,
          agentImageEditPrompt: imageEditPromptForReel,
          referenceImageUrl: referenceUrl,
          additionalPhotoUrls,
          photos: reelPhotoInputs,
          galleryMeta,
          strategy: reelStrategy,
          productionIdea: prodIdea,
          transitionStyle: (reelSpec as Record<string, unknown> | undefined)?.transition_style as string | undefined,
          treatment: treatmentLower,
          templateUseCase,
          vibeProfile,
          photoDescription,
          photoTags,
          brandThemeGrading: brandLutDirective || brandGradingLook
            ? { look: brandGradingLook || undefined, lut_directive: brandLutDirective || undefined }
            : undefined,
          tenantLearningBrief: tenantLearningBrief || undefined,
        });
        if (runway) {
          videoUrl = runway;
          imageUrl = referenceUrl;
          incrementReelCount(workspaceId);
          runwayReelsProducedInMission += 1;
          costEstimate += reelCostUsd;
          if (reelStrategy !== 'single' && reelPhotoInputs.length >= 2) {
            runwayProduceMeta = {
              source: 'runway_multi_photo',
              strategy: reelStrategy === 'sequential' ? 'sequential' : 'multi_ref',
              photoCount: Math.min(reelPhotoInputs.length, maxPhotosForStrategy(reelStrategy)),
            };
          } else {
            runwayProduceMeta = { source: 'runway' };
          }
        } else {
          reelFailureReason = 'Runway reel üretilemedi';
          console.warn('[auto-produce] Runway failed for reel:', headline.slice(0, 50));
        }
      } else {
        reelFailureReason = runwayBudget.reason ?? 'Runway bütçe yetersiz';
        console.log('[auto-produce] Runway skipped:', runwayBudget.reason);
      }
    } else if (isReel && !isHeroReel) {
      reelFailureReason = runwayReelsProducedInMission >= maxRunwayReelsPerMission
        ? `Mission reel limiti (${maxRunwayReelsPerMission})`
        : 'Hero reel slot assigned to another idea — publish as story';
      console.log(`[auto-produce] Reel demoted (not hero slot): idea ${ideaIndex} "${headline.slice(0, 40)}"`);
      if (!videoUrl) {
        imageUrl = referenceUrl;
      }
    }

    // Post/Story Marky layer — skip when Remotion video will render (use raw gallery photo only)
    const isStoryIdeaEarly = kind === 'instagram_story' || kind === 'instagram_canvas';
    const isOrganicStoryStill = assignment.slot_role === 'organic_story_still';
    const isDesignedPostSlot =
      assignment.pipeline === 'remotion_poster' || assignment.slot_role === 'designed_post';
    const willRemotionStorySoon = bundleCards !== false && isStoryIdeaEarly && Boolean(referenceUrl)
      && !isOrganicStoryStill && !isDesignedPostSlot;
    const skipMarkyLayer = Boolean(videoUrl) || isReel || (isCarousel && carouselUrls.length >= 2)
      || willRemotionStorySoon
      || (isOrganicStoryStill && isStoryIdeaEarly);
    if (!skipMarkyLayer && referenceUrl) {
      if (!imageUrl || imageUrl === referenceUrl) {
        const contentTypeFmt = (kind === 'instagram_story' || isCanvas) ? 'story' : 'post';
        const evDet = idea.event_details;
        const cardUrl = await generateMarkyLayerCard({
          workspaceId,
          headline,
          caption,
          brandName: resolvedBrandName,
          location: brandLocation,
          businessType: brandBusinessType,
          mood,
          vibeProfile,
          referenceImageUrl: referenceUrl,
          contentTypeFmt,
          templateUseCase: idea.template_use_case as string | undefined,
          strategicPurpose,
          ideaIndex,
          brandTheme,
          logoUrl: brandLogoUrl,
          primaryColor: syncPrimaryColor,
          accentColor: syncAccentColor,
          usedTemplateIds: syncUsedTemplateIds,
          baseUrl: routeBaseUrl,
          eventDetails: evDet ? {
            artistName: evDet.artist_name,
            date: evDet.date,
            time: evDet.time,
            venueArea: evDet.venue_area,
            tagline: evDet.tagline,
            ctaText: evDet.cta_text,
          } : undefined,
        });
        if (cardUrl) {
          imageUrl = cardUrl;
          costEstimate += 0.01;
          console.log(`[auto-produce] Remotion still (${contentTypeFmt}): "${headline.slice(0, 40)}"`);
        } else if (!imageUrl) {
          imageUrl = referenceUrl;
        }
      }

      const markyApplied = Boolean(imageUrl && referenceUrl && imageUrl !== referenceUrl);

      // Legacy vibe enhance (only if Marky + aiPhotoEnhance both off)
      if (
        !markyApplied
        && !aiPhotoEnhance
        && SUBTLE_ENHANCE
        && referenceUrl
        && (hasVibe || idea.visual_production_spec?.image_edit_prompt)
      ) {
        const generated = await generateVibeImage({
          workspaceId,
          headline,
          caption,
          contentType: fmt,
          brandName:    resolvedBrandName,
          location:     brandLocation,
          businessType: brandBusinessType,
          brandTone:    String(brandCtx.brand_tone ?? ''),
          brandDescription: String(brandCtx.description ?? ''),
          visualStyle:  String(brandCtx.visual_style ?? ''),
          visualDna:    String(brandCtx.visual_dna ?? ''),
          vibeProfile:  hasVibe ? (brandCtx.brand_vibe_profile as Record<string, unknown>) : null,
          logoUrl:      brandLogoUrl || undefined,
          referenceImageUrl: referenceUrl,
          referenceImageUrls: (brandCtx.reference_image_urls as string[] | undefined)?.slice(0, 2),
          agentImageEditPrompt: idea.visual_production_spec?.image_edit_prompt,
          lutDirective:  brandLutDirective || undefined,
          antiPatterns:  brandAntiPatterns.length ? brandAntiPatterns : undefined,
        });
        if (generated) {
          imageUrl = generated;
          costEstimate += 0.04;
        }
      }
    }

    // Static story still (APO): skip Marky/Remotion motion but still save gallery photo
    if (isOrganicStoryStill && referenceUrl && !videoUrl && !imageUrl) {
      imageUrl = referenceUrl;
      console.log(`[auto-produce] Story still (gallery): "${headline.slice(0, 50)}"`);
    }

    // APO-4: designed_post — sync Remotion/announcement still (fixes story+designed slot mismatch)
    let designedPosterSyncUrl: string | null = null;
    let designedPosterGrafikerScore: number | null = null;
    let designedPosterGrafikerPass = true;
    if (isDesignedPostSlot && referenceUrl && !videoUrl && (!imageUrl || imageUrl === referenceUrl)) {
      const posterFmt: 'post' | 'story' = isStoryIdeaEarly ? 'story' : 'post';
      const treatmentForPoster = String(
        idea.visual_production_spec?.treatment || idea.treatment || '',
      ).toLowerCase();
      const posterResult = await renderRemotionBrandStillResult({
        workspaceId,
        photoUrl: referenceUrl,
        headline,
        caption,
        brandName: resolvedBrandName,
        location: brandLocation,
        sector: brandBusinessType,
        mood,
        treatment: treatmentForPoster,
        templateUseCase: idea.template_use_case as string | undefined,
        contentType: posterFmt,
        ideaIndex,
        brandTheme,
        logoUrl: brandLogoUrl,
        primaryColor: syncPrimaryColor,
        accentColor: syncAccentColor,
        usedTemplateIds: syncUsedTemplateIds,
        baseUrl: routeBaseUrl,
        cta,
      });
      designedPosterSyncUrl = posterResult?.imageUrl ?? null;
      designedPosterGrafikerScore = posterResult?.grafikerScore ?? null;
      designedPosterGrafikerPass = posterResult?.grafikerPass ?? true;
      if (!designedPosterSyncUrl) {
        const fallbackBrand: RendererBrandContext = {
          brandName: resolvedBrandName,
          location: brandLocation,
          businessType: brandBusinessType,
          vibeProfile,
        };
        designedPosterSyncUrl = await renderEventCardFromPayload(
          prodIdea,
          fallbackBrand,
          { photoUrl: referenceUrl },
          { workspaceId, vibeProfile },
        );
      }
      if (designedPosterSyncUrl) {
        imageUrl = designedPosterSyncUrl;
        costEstimate += 0.01;
        console.log(
          `[auto-produce] Designed post sync (${posterFmt}): "${headline.slice(0, 40)}"`,
        );
      }
    }

    // AI Ayarlar açıkken organik feed postları: ham galeri kalmasın — Remotion poster katmanı
    const postNeedsBrandLayer =
      aiVisualStandard.enabled
      && !isReel
      && !videoUrl
      && !isCanvas
      && !(isCarousel && carouselUrls.length >= 2)
      && Boolean(referenceUrl)
      && (kind === 'instagram_post' || (isCarousel && carouselUrls.length < 2))
      && assignment.slot_role !== 'organic_story_still';

    if (
      postNeedsBrandLayer
      && !designedPosterSyncUrl
      && (!imageUrl || imageUrl === referenceUrl)
    ) {
      const treatmentForAi = String(
        idea.visual_production_spec?.treatment || idea.treatment || '',
      ).toLowerCase();
      const aiPoster = await renderRemotionBrandStillResult({
        workspaceId,
        photoUrl: referenceUrl,
        headline,
        caption,
        brandName: resolvedBrandName,
        location: brandLocation,
        sector: brandBusinessType,
        mood,
        treatment: treatmentForAi,
        templateUseCase: idea.template_use_case as string | undefined,
        contentType: 'post',
        ideaIndex,
        brandTheme,
        logoUrl: brandLogoUrl,
        primaryColor: syncPrimaryColor,
        accentColor: syncAccentColor,
        usedTemplateIds: syncUsedTemplateIds,
        baseUrl: routeBaseUrl,
        cta,
      });
      if (aiPoster?.imageUrl) {
        imageUrl = aiPoster.imageUrl;
        designedPosterSyncUrl = aiPoster.imageUrl;
        designedPosterGrafikerScore = aiPoster.grafikerScore ?? designedPosterGrafikerScore;
        designedPosterGrafikerPass = aiPoster.grafikerPass ?? designedPosterGrafikerPass;
        costEstimate += 0.01;
        console.log(
          `[auto-produce] AI branded post layer (organic): "${headline.slice(0, 40)}"`,
        );
      } else {
        console.warn(
          `[auto-produce] AI branded post layer başarısız — feed ham foto riski: "${headline.slice(0, 40)}"`,
        );
      }
    }

    // Reels: Runway MP4 preferred; Remotion motion fallback when Runway fails (credits/down)
    const reelRemotionFallback = isReel && !videoUrl && Boolean(referenceUrl) && bundleCards !== false;
    if (isReel && !videoUrl && !reelRemotionFallback) {
      console.warn(`[auto-produce] reel skip (no video): ${headline.slice(0, 50)} — ${reelFailureReason ?? 'unknown'}`);
      results.push({
        title: headline,
        imageUrl: referenceUrl ?? '',
        error: reelFailureReason ?? 'Runway reel üretilemedi',
      });
      continue;
    }
    if (reelRemotionFallback) {
      console.log(`[auto-produce] Reel → Remotion motion fallback: "${headline.slice(0, 40)}"`);
    }

    // Guard: skip only when there is no video, still, or gallery reference for Remotion
    if (!videoUrl && !imageUrl && !referenceUrl) {
      console.warn(`[auto-produce] no contentUrl produced for "${headline.slice(0, 50)}", skipping save`);
      results.push({ title: headline, imageUrl: '', error: 'Production failed: no image or video URL' });
      continue;
    }

    // Stories: event info is baked into the image
    const isEventStory = (kind === 'instagram_story' || isCanvas) && hasEventDetails;
    // For event stories: include CTA URL in caption so followers can tap link in bio
    const _ideaEvDet = (idea as any).event_details as Record<string, string> | undefined;
    const eventCtaUrl = _ideaEvDet?.cta_url || _ideaEvDet?.ctaUrl || '';
    const eventCtaText = _ideaEvDet?.cta_text || (idea as any).cta || '';
    const publishCaption = isEventStory
      ? (eventCtaUrl
          ? `🔗 ${eventCtaText || 'Rezervasyon'} → ${eventCtaUrl}`
          : '') // event details are on the image
      : caption;
    const publishHashtags = isEventStory ? [] : hashtags;

    const vpsRaw = (idea.visual_production_spec as Record<string, unknown> | undefined);
    const treatment = String(vpsRaw?.treatment || idea.treatment || '').toLowerCase();
    const designedPosterReady = Boolean(designedPosterSyncUrl);
    const markyBranded = Boolean(referenceUrl && imageUrl && imageUrl !== referenceUrl)
      || designedPosterReady
      || Boolean(designedPosterSyncUrl && imageUrl && imageUrl !== referenceUrl);

    // Carousel degradation: <2 slides, or branded composite → single feed post (not IG carousel)
    const carouselPublishAsFeed = isCarousel
      && carouselUrls.length >= 2
      && (markyBranded || designedPosterReady);
    const effectiveKind = (isCarousel && carouselUrls.length < 2) || carouselPublishAsFeed
      ? 'instagram_post'
      : kind;
    const effectiveFmt = (isCarousel && carouselUrls.length < 2) || carouselPublishAsFeed
      ? 'post'
      : fmt;
    const persistedCarouselUrls = carouselPublishAsFeed ? [] : carouselUrls;

    const isStoryIdea = kind === 'instagram_story' || kind === 'instagram_canvas';
    const willRemotionStoryRender = bundleCards !== false
      && Boolean(referenceUrl)
      && !designedPosterReady
      && (
        reelRemotionFallback
        || (isStoryIdea && shouldRenderRemotionStory(assignment, { forceEvent: hasEventDetails || isCanvas }))
      );
    const willRemotionPostRender = bundleCards !== false
      && effectiveKind === 'instagram_post'
      && Boolean(referenceUrl)
      && !markyBranded
      && !designedPosterReady
      && shouldRenderRemotionPoster(assignment);
    const willRemotionRender = willRemotionStoryRender || willRemotionPostRender;
    const storyPosterUrl = willRemotionStoryRender
      ? galleryPreviewUrl
      : null;
    const postPlaceholderUrl = willRemotionPostRender ? galleryPreviewUrl : (markyBranded ? imageUrl : null);
    const bundleReadyNow = designedPosterReady
      || (markyBranded && !willRemotionPostRender && !willRemotionStoryRender);

    const nexusPrimaryContentUrl = (willRemotionStoryRender || willRemotionPostRender) && galleryPreviewUrl
      ? galleryPreviewUrl
      : (videoUrl ?? imageUrl ?? galleryPreviewUrl ?? '');
    if (!nexusPrimaryContentUrl) {
      console.warn(`[auto-produce] no nexus contentUrl for "${headline.slice(0, 50)}", skipping save`);
      results.push({ title: headline, imageUrl: '', error: 'Production failed: no persistable content URL' });
      continue;
    }

    const contentJson = JSON.stringify({
      kind: effectiveKind,
      contentType: effectiveFmt,
      caption: publishCaption,
      hashtags: publishHashtags,
      cta,
      imageUrl: designedPosterSyncUrl
        ?? (willRemotionStoryRender ? storyPosterUrl : (markyBranded ? imageUrl : willRemotionPostRender ? postPlaceholderUrl : (videoUrl ?? imageUrl))),
      posterUrl: galleryPreviewUrl ?? storyPosterUrl ?? postPlaceholderUrl ?? designedPosterSyncUrl ?? undefined,
      videoUrl: willRemotionRender ? null : videoUrl,
      carousel_urls: carouselUrls.length ? carouselUrls : undefined,
      gallery_photo_urls: carouselGalleryUrls.length ? carouselGalleryUrls : undefined,
      headline,
      idea_index: ideaIndex,
      mission_id: missionId || undefined,
      node_key: nodeKey || undefined,
      ...(willRemotionRender || bundleReadyNow ? {
        production_bundle: true,
        bundle_status: bundleReadyNow ? 'ready' : 'rendering',
        idea_id: ideaId,
      } : {}),
      agency_branded: markyBranded,
      ai_gallery_enhanced: aiEnhanceApplied,
    });

    const metadata: Record<string, unknown> = {
      contentType: effectiveFmt,
      kind: effectiveKind,
      platform: 'instagram',
      headline,
      caption: publishCaption.slice(0, 300),
      cta,
      hashtags: publishHashtags,
      strategic_purpose: strategicPurpose,
      auto_produced: true,
      gallery_sourced: true,
      gallery_only: GALLERY_ONLY,
      agency_produced: markyBranded || Boolean(designedPosterSyncUrl) || Boolean(videoUrl) || isCanvas || (isCarousel && carouselUrls.length > 0),
      runway_produced: Boolean(videoUrl),
      ...(runwayProduceMeta ? {
        runway_source: runwayProduceMeta.source,
        runway_strategy: runwayProduceMeta.strategy,
        runway_photo_count: runwayProduceMeta.photoCount,
      } : {}),
      canvas_produced: isCanvas,
      carousel_urls:   persistedCarouselUrls.length ? persistedCarouselUrls : undefined,
      gallery_photo_urls: carouselGalleryUrls.length ? carouselGalleryUrls : undefined,
      ...(carouselPublishAsFeed ? { carousel_publish_as: 'feed' } : {}),
      source: 'auto-produce',
      mission_id: missionId || null,
      node_key: nodeKey || null,
      mood,
      posting_time_suggestion: idea.posting_time_suggestion || null,
      imageUrl: designedPosterSyncUrl
        ?? (willRemotionStoryRender ? storyPosterUrl : (markyBranded ? imageUrl : willRemotionPostRender ? postPlaceholderUrl : (videoUrl ?? imageUrl))),
      videoUrl: willRemotionRender ? null : videoUrl,
      reference_photo_url: referenceUrl,
      feed_preview_url: galleryPreviewUrl,
      agency_branded: markyBranded,
      ai_gallery_enhanced: aiEnhanceApplied,
      ai_visual_standard_enabled: aiVisualStandard.enabled,
      ai_visual_standard: buildAiVisualStandardMetadata(aiVisualStandard, aiPhotoEnhanceLevel),
      ai_visual_subject_resolved: resolvedVisualSubject,
      visual_pipeline_steps: resolveVisualPipelineSteps(aiVisualStandard, kind, assignment, {
        willRemotionStory: willRemotionStoryRender,
        willRemotionPost: willRemotionPostRender,
        isReel,
        designedPosterSync: designedPosterReady,
        postBrandLayer: postNeedsBrandLayer,
      }),
      brandName: resolvedBrandName,
      idea_index: ideaIndex,
      // Tüm başarılı üretimler Feed'de görünsün (yedek gizleme yok).
      publish_package: 'primary',
      publish_priority: primaryIdeaIndices.has(ideaIndex) ? 'recommended' : 'extended',
      production_role: assignment.slot_role,
      pipeline: assignment.pipeline,
      copy_bundle_id: assignment.copy_bundle_id,
      publish_channel: assignment.publish_channel,
      assignment_rationale: assignment.rationale ?? null,
      creative_trace: creativeTrace,
      feed_director_score: creativeTrace.feed_director_score,
      ...(designedPosterGrafikerScore != null ? {
        grafiker_score: designedPosterGrafikerScore,
        grafiker_pass: designedPosterGrafikerPass,
      } : {}),
      layout_family_hint: assignment.layout_family_hint ?? layoutFamilyHint ?? null,
      ...(willRemotionRender || bundleReadyNow ? {
        production_bundle: true,
        bundle_status: bundleReadyNow ? 'ready' : 'rendering',
        idea_id: ideaId,
        poster_url: galleryPreviewUrl ?? storyPosterUrl ?? postPlaceholderUrl,
        posterUrl: galleryPreviewUrl ?? storyPosterUrl ?? postPlaceholderUrl,
      } : {}),
    };

    const title = headline || `${resolvedBrandName} — ${effectiveFmt}`;

    const persistContentUrl = nexusPersistableContentUrl(nexusPrimaryContentUrl, [
      referenceUrl ?? '',
      ...carouselGalleryUrls,
      ...carouselUrls,
    ]);

    const saved = await saveArtifactToNexus(workspaceId, {
      title,
      contentUrl: persistContentUrl,
      content: contentJson,
      platform: 'instagram',
      contentType: effectiveFmt,
      metadata,
    });

    results.push({ id: saved.id, title, imageUrl: persistContentUrl, videoUrl: videoUrl ?? undefined, error: saved.error });

    // ── Story → Remotion: TÜM story'ler için Remotion render tetiklenir ─────
    if (willRemotionRender && saved.id && storyPosterUrl) {
      let gallerySeriesUrls: string[] = enhancedGallerySet.length >= 2
        ? [...enhancedGallerySet]
        : [referenceUrl];
      if (gallerySeriesUrls.length < 2 && hasGallery && galleryPhotos.length >= 2) {
        if (carouselGalleryUrls.length >= 2) {
          for (const u of carouselGalleryUrls) {
            if (!gallerySeriesUrls.includes(u)) gallerySeriesUrls.push(u);
            if (gallerySeriesUrls.length >= 3) break;
          }
        } else {
          const extras = pickSupplementaryGalleryPhotos(
            caption,
            headline,
            mood,
            galleryMeta,
            galleryPhotos,
            referenceUrl,
            batchUsedByType[postType],
            2,
            postType,
          );
          for (const u of extras) {
            if (!gallerySeriesUrls.includes(u)) gallerySeriesUrls.push(u);
            markGalleryUrlUsedForPostType(galleryUsage, u, postType);
            batchUsedByType[postType].push(u);
          }
        }
      }

      const galleryPhotoUrls = gallerySeriesUrls.length >= 2 ? gallerySeriesUrls : undefined;
      creatomateStoryCandidates.push({
        headline,
        caption: (idea.caption_draft ?? idea.caption ?? '') as string,
        photoUrl: referenceUrl,
        galleryPhotoUrls,
        galleryLayout: galleryPhotoUrls
          ? resolveGallerySeriesLayout(galleryPhotoUrls.length, ideaIndex)
          : undefined,
        treatment,
        mood: (idea.mood || '') as string,
        templateUseCase: String(idea.template_use_case || ''),
        event_details: (idea.event_details as Record<string, string> | undefined),
        artifactId: saved.id,
        ideaId,
        sceneBriefBlock: buildSceneBriefPromptBlock(sceneBrief),
        preferredLayoutFamily: layoutFamilyHint,
        slotRole: assignment.slot_role,
        publishChannel: assignment.publish_channel,
        ideaIndex,
        // FD-assigned library slot key takes priority over rotation-based fallback.
        // This ensures the brand's configured template (Marka Detayı 5 slot) is used
        // for the exact content type the FD intended (event vs daily vs editorial etc.)
        librarySlotKey: assignment.library_slot_key
          ?? missionStoryLibrarySlotKey(templateLibrary, storyIndex),
      });
    }

    if (willRemotionPostRender && !designedPosterReady && saved.id && postPlaceholderUrl) {
      remotionPostCandidates.push({
        headline,
        caption: (idea.caption_draft ?? idea.caption ?? '') as string,
        photoUrl: postPlaceholderUrl,
        treatment,
        mood: (idea.mood || '') as string,
        templateUseCase: String(idea.template_use_case || ''),
        event_details: (idea.event_details as Record<string, string> | undefined),
        artifactId: saved.id,
        ideaId,
        ideaIndex,
      });
    }
  }

  const vibeForTokens = hasVibe
    ? (brandCtx.brand_vibe_profile as Record<string, unknown>)
    : undefined;
  const brandTokensForRender = bundleCards !== false
    ? resolveBrandProductionTokens({
        brandContext: brandCtx,
        brandTheme,
        vibeProfile: vibeForTokens,
        sector: brandBusinessType,
        brandName: resolvedBrandName,
      })
    : null;

  // Mission guarantee: at least one Remotion template story when mission has no story MP4 queued
  if (
    bundleCards !== false
    && missionId
    && creatomateStoryCandidates.length === 0
    && hasGallery
    && brandTokensForRender
    && toProcess.length > 0
  ) {
    for (let gi = 0; gi < toProcess.length; gi++) {
      const idea = toProcess[gi]!;
      const headline = getField(idea, 'headline', 'concept_title', 'title');
      const caption = getField(idea, 'caption_draft', 'caption');
      const mood = idea.mood || '';
      const postType = kindToPostType(detectContentKind(idea));
      const referenceUrl = pickGalleryPhotoForIdea(
        caption,
        headline,
        mood,
        galleryMeta,
        galleryPhotos,
        getExcludeUrlsForPostType(galleryUsage, postType, batchUsedByType[postType]),
        batchUsedByType[postType],
        postType,
        typeof idea.selected_gallery_url === 'string' ? idea.selected_gallery_url : null,
        brandBusinessType,
      );
      if (!referenceUrl || !(await probeGalleryImageUrl(referenceUrl))) continue;

      const ideaId = randomUUID();
      const guaranteeAssignment = {
        idea_index: gi,
        slot_role: 'campaign_story_motion' as const,
        pipeline: 'remotion_story' as const,
        copy_bundle_id: `${missionId.slice(0, 8)}-remotion-story`,
        publish_channel: 'instagram_campaign' as const,
        rationale: 'mission_guaranteed_remotion_story',
        library_slot_key: undefined as string | undefined,
      };
      let guaranteeSceneBrief = sceneBriefCache.get(gi);
      if (guaranteeSceneBrief === undefined) {
        const guaranteeSceneCaption = [
          headline ? `Headline: ${headline}` : '',
          caption ? `Caption: ${caption}` : '',
          aiVisualStandard.briefDrivesScene && missionVisualBrief
            ? `Mission brief: ${missionVisualBrief}`
            : '',
        ].filter(Boolean).join('\n') || headline || caption;
        guaranteeSceneBrief = await fetchProductSceneBrief({
          workspaceId,
          caption: guaranteeSceneCaption,
          productType: idea.product_type || idea.subject || '',
          sector: brandBusinessType,
          mood,
          enhanceLevel: aiPhotoEnhanceLevel,
          visualSubject: resolvedVisualSubject as 'venue_ambiance' | 'product_hero' | undefined,
        });
        sceneBriefCache.set(gi, guaranteeSceneBrief);
      }
      let guaranteePhotoUrl = referenceUrl;
      let guaranteeAiEnhanced = false;
      const guaranteeEnhance = await runGptImageEnhanceForIdea({
        baseUrl: routeBaseUrl,
        workspaceId,
        photoUrls: [guaranteePhotoUrl],
        brandName: resolvedBrandName,
        businessType: brandBusinessType,
        level: aiPhotoEnhanceLevel,
        assignment: guaranteeAssignment,
        contentKind: 'instagram_story',
        visualStandard: aiVisualStandard,
        brandCtx: brandCtxForVisual,
        brandTheme,
        sceneBrief: guaranteeSceneBrief,
        caption,
        headline,
        mood,
        missionBrief: missionVisualBrief,
        logoUrl: brandLogoUrl || undefined,
        referenceImageUrls: (brandCtx.reference_image_urls as string[] | undefined) ?? [],
        productType: idea.product_type || idea.subject || '',
        maxPhotos: 1,
      });
      if (guaranteeEnhance.applied && guaranteeEnhance.photoUrls[0]) {
        guaranteePhotoUrl = guaranteeEnhance.photoUrls[0];
        guaranteeAiEnhanced = true;
        costEstimate += 0.21;
      }
      const sceneBrief = guaranteeSceneBrief;
      const persistContentUrl = nexusPersistableContentUrl(guaranteePhotoUrl, [guaranteePhotoUrl]);
      const saved = await saveArtifactToNexus(workspaceId, {
        title: headline || `${resolvedBrandName} — story`,
        contentUrl: persistContentUrl,
        content: JSON.stringify({
          kind: 'instagram_story',
          contentType: 'story',
          caption: caption.slice(0, 300),
          headline,
          imageUrl: guaranteePhotoUrl,
          posterUrl: guaranteePhotoUrl,
          videoUrl: null,
          idea_index: gi,
          production_bundle: true,
          bundle_status: 'rendering',
          idea_id: ideaId,
          source: 'remotion',
          ai_gallery_enhanced: guaranteeAiEnhanced,
        }),
        platform: 'instagram',
        contentType: 'story',
        metadata: {
          kind: 'instagram_story',
          contentType: 'story',
          platform: 'instagram',
          headline,
          caption: caption.slice(0, 300),
          source: 'remotion',
          auto_produced: true,
          gallery_sourced: true,
          mission_id: missionId,
          node_key: nodeKey || null,
          idea_index: gi,
          production_role: guaranteeAssignment.slot_role,
          pipeline: guaranteeAssignment.pipeline,
          publish_package: 'primary',
          publish_priority: 'recommended',
          production_bundle: true,
          bundle_status: 'rendering',
          idea_id: ideaId,
          poster_url: guaranteePhotoUrl,
          posterUrl: guaranteePhotoUrl,
          reference_photo_url: guaranteePhotoUrl,
          ai_gallery_enhanced: guaranteeAiEnhanced,
          ai_visual_standard_enabled: aiVisualStandard.enabled,
          ai_visual_standard: buildAiVisualStandardMetadata(aiVisualStandard, aiPhotoEnhanceLevel),
          ai_visual_subject_resolved: resolvedVisualSubject,
          visual_pipeline_steps: resolveVisualPipelineSteps(
            aiVisualStandard,
            'instagram_story',
            guaranteeAssignment,
            { willRemotionStory: true },
          ),
          remotion_mission_story: true,
        },
      });
      if (!saved.id) break;

      markGalleryUrlUsedForPostType(galleryUsage, guaranteePhotoUrl, postType);
      batchUsedByType[postType].push(guaranteePhotoUrl);
      creatomateStoryCandidates.push({
        headline: headline || resolvedBrandName,
        caption,
        photoUrl: guaranteePhotoUrl,
        artifactId: saved.id,
        ideaId,
        treatment: String(idea.treatment || '').toLowerCase(),
        mood: String(mood),
        templateUseCase: String(idea.template_use_case || ''),
        event_details: idea.event_details as Record<string, string> | undefined,
        sceneBriefBlock: buildSceneBriefPromptBlock(sceneBrief),
        preferredLayoutFamily: undefined,
        slotRole: guaranteeAssignment.slot_role,
        ideaIndex: gi,
        librarySlotKey: guaranteeAssignment.library_slot_key
          ?? missionStoryLibrarySlotKey(templateLibrary, gi),
      });
      console.log(
        `[auto-produce] Mission Remotion story guarantee: idea ${gi} "${headline.slice(0, 40)}"`,
      );
      break;
    }
  }

  // ── Remotion story renders — after loop, fire-and-forget ─────────────────
  if (bundleCards !== false && creatomateStoryCandidates.length > 0 && brandTokensForRender) {
    const brandTokens = brandTokensForRender;
    const { primaryColor, accentColor } = brandTokens;
    console.log(
      `[auto-produce] Brand tokens: fonts ${brandTokens.headingFont}/${brandTokens.bodyFont} ` +
      `colors ${primaryColor}/${accentColor} text ${brandTokens.textColor} [${brandTokens.sources.join(', ')}]`,
    );

    const usedCompositions: StoryCompositionId[] = [];
    const usedTemplateIds: string[] = [...gctx.recentTemplateIds];
    for (let ci = 0; ci < creatomateStoryCandidates.length; ci++) {
      const candidate = creatomateStoryCandidates[ci]!;

      const moodLower = ((candidate as any).mood || '').toLowerCase();
      const treatmentLower = ((candidate as any).treatment || '').toLowerCase();
      const templateUseCase = String((candidate as any).template_use_case || '');

      const intent = resolveContentIntent({
        treatment: treatmentLower,
        templateUseCase,
        mood: moodLower,
        headline: candidate.headline,
      });

      const galleryPhotoUrls = candidate.galleryPhotoUrls;
      const galleryPhotoCount = galleryPhotoUrls?.length ?? 1;

      const storyIdeaIndex = (candidate as { ideaIndex?: number }).ideaIndex ?? ci;
      const storySlotRole = (candidate as { slotRole?: ProductionSlotRole }).slotRole;

      const storyPick = resolveBrandStoryProductionTemplate({
        library: templateLibrary,
        sector: brandBusinessType,
        intent,
        treatment: treatmentLower,
        ideaIndex: storyIdeaIndex,
        usedTemplateIds,
        headline: candidate.headline,
        caption: candidate.caption,
        slotRole: storySlotRole,
        templateUseCase,
        hasEventDetails: Boolean(
          (candidate as { event_details?: Record<string, string> }).event_details?.date
          || (candidate as { event_details?: Record<string, string> }).event_details?.event_date,
        ),
        librarySlotKey: (candidate as { librarySlotKey?: string }).librarySlotKey,
      });

      usedTemplateIds.push(storyPick.storyTemplateId);

      const templateId = storyPick.storyTemplateId;
      const production = {
        slot: storyPick.slot,
        storyTemplateId: storyPick.storyTemplateId,
        compositionId: storyPick.compositionId,
        kitId: storyPick.kitId,
      };

      const eventDet = (
        (candidate as any).event_details ??
        (candidate as any).eventDetails ??
        {}
      ) as Record<string, string>;

      const compositionId: StoryCompositionId = resolveStoryCompositionForBrandTemplate({
        storyTemplateId: templateId,
        slot: storyPick.slot,
        slotRole: storySlotRole,
        forceEvent: Boolean(eventDet.date || eventDet.event_date),
      });
      usedCompositions.push(compositionId);

      console.log(
        `[auto-produce] Remotion story template: ${templateId} (${storyPick.templateNameTr}) ` +
        `slot=${storyPick.slot.key} composition=${compositionId} locked=${storyPick.libraryLocked}`,
      );

      const remotionTemplate = getRemotionTemplate(templateId);
      const storyRenderProps = applyBrandTokensToRenderProps({
        templateId,
        kitId: production.kitId,
        librarySlotKey: production.slot.key,
        photoUrl: candidate.photoUrl,
        galleryPhotoUrls: galleryPhotoUrls && galleryPhotoUrls.length > 1
          ? galleryPhotoUrls.slice(1)
          : undefined,
        galleryLayout: candidate.galleryLayout,
        headline: candidate.headline,
        subtitle: '',
        categoryLabel: '',
        brandName: resolvedBrandName,
        location: brandLocation || '',
        logoUrl: brandLogoUrl || undefined,
        contentIntent: intent,
        sector: brandBusinessType,
        sceneBrief: candidate.sceneBriefBlock || undefined,
        preferredLayoutFamily: candidate.preferredLayoutFamily,
      }, brandTokens);

      const eventDate     = eventDet.date       || eventDet.event_date  || (candidate as any).event_date  || '';
      const eventTime     = eventDet.time       || eventDet.event_time  || (candidate as any).event_time  || '';
      const ctaText       = eventDet.cta_text   || (candidate as any).cta || '';
      const ctaUrl        = eventDet.cta_url    || (candidate as any).ctaUrl || '';
      const eventSubtitle = eventDet.tagline    || (candidate as any).subtitle || '';
      const categoryLabel = eventDet.category_label || (candidate as any).categoryLabel || '';
      const audioMood     = eventDet.audio_mood || (candidate as any).audioMood || '';
      const artistName    = eventDet.artist_name || '';

      const resolvedSubtitle = compositionId === 'EventAnnouncementStory'
        ? (eventSubtitle || artistName || candidate.caption.slice(0, 40))
        : candidate.caption.slice(0, 100);

      const nexusApi = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, '');
      const internalKey = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';

      const storyProps = {
        ...storyRenderProps,
        subtitle: resolvedSubtitle,
        categoryLabel,
        eventDate,
        eventTime,
        cta: ctaText,
        ctaUrl: ctaUrl || undefined,
        audioMood,
      };

      fetch(`${routeBaseUrl}/api/remotion/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compositionId,
          useCreativeDirector: true,
          brandTemplateLocked: storyPick.libraryLocked || templateLibrary.locked,
          motionStyle: motionProfile.motionStyle,
          locale: motionProfile.locale,
          allowedCompositions: allowedCompositionsForDirector(motionProfile),
          uploadToR2: Boolean(process.env.R2_BUCKET_NAME),
          requirePersistent: true,
          workspaceId,
          props: storyProps,
        }),
        signal: AbortSignal.timeout(280_000),
      }).then(async (res) => {
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          console.warn('[auto-produce] Remotion render failed:', res.status, errText.slice(0, 120));
          await markProductionBundleFailed({
            nexusApi,
            internalKey,
            workspaceId,
            artifactId: candidate.artifactId,
            error: `Render HTTP ${res.status}`,
            posterUrl: candidate.photoUrl,
            contentType: 'instagram_story',
          });
          return;
        }
        const data = await res.json() as {
          videoUrl?: string; videoBase64?: string;
          compositionId?: string;
          templateId?: string;
          creativeDirector?: Record<string, unknown>;
          grafikerScore?: number | null; grafikerPass?: boolean;
          durationMs?: number; bytes?: number;
        };
        const videoUrl = data.videoUrl || null;
        const base64 = data.videoBase64 || null;

        if (!videoUrl && !base64) {
          console.warn('[auto-produce] Remotion: no output URL');
          await markProductionBundleFailed({
            nexusApi,
            internalKey,
            workspaceId,
            artifactId: candidate.artifactId,
            error: 'No video output from Remotion',
            posterUrl: candidate.photoUrl,
            contentType: 'instagram_story',
          });
          return;
        }

        const finalCompositionId = data.compositionId ?? compositionId;
        const finalTemplateId = data.templateId ?? templateId;
        const grafikerScore = data.grafikerScore ?? null;
        const grafikerPass = data.grafikerPass !== false;

        console.log(
          `[auto-produce] Remotion story: ${finalCompositionId} | slot=${production.slot.key} | template=${finalTemplateId} | ` +
          `cd=${data.creativeDirector?.layoutFamily ?? 'n/a'}[${data.creativeDirector?.variantIndex ?? '-'}] | ` +
          `grafiker=${grafikerScore}/10 pass=${grafikerPass} | ` +
          `"${candidate.headline.slice(0, 40)}"`
        );

        const existingArtifactId = candidate.artifactId;
        if (!existingArtifactId || !videoUrl) {
          console.warn('[auto-produce] Remotion: missing artifactId or videoUrl — bundle not updated');
          return;
        }

        if (!(await probeMediaUrl(videoUrl))) {
          console.warn('[auto-produce] Remotion video URL not reachable, skip attach:', videoUrl.slice(0, 80));
          await markProductionBundleFailed({
            nexusApi,
            internalKey,
            workspaceId,
            artifactId: existingArtifactId,
            error: 'Rendered video URL not reachable',
            posterUrl: candidate.photoUrl,
            contentType: 'instagram_story',
          });
          return;
        }

        const patchResult = await attachVideoToProductionBundle({
          nexusApi,
          internalKey,
          workspaceId,
          artifactId: existingArtifactId,
          videoUrl,
          posterUrl: candidate.photoUrl,
          compositionId: finalCompositionId,
          grafikerScore,
          grafikerPass,
          renderMs: data.durationMs,
        });

        if (patchResult.ok) {
          console.log(
            `[auto-produce] ProductionBundle ready: ${existingArtifactId} | ` +
            `${finalCompositionId} | grafiker=${grafikerScore}/10`
          );
        } else {
          console.warn(`[auto-produce] attach-video failed: ${patchResult.error}`);
        }
      }).catch(async (err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[auto-produce] Remotion story error (no fallback): ${msg.slice(0, 80)}`);
        await markProductionBundleFailed({
          nexusApi,
          internalKey,
          workspaceId,
          artifactId: candidate.artifactId,
          error: msg.slice(0, 200),
          posterUrl: candidate.photoUrl,
          contentType: 'instagram_story',
        });
      });

      console.log(`[auto-produce] Remotion ${compositionId} (${templateId}) triggered: "${candidate.headline.slice(0,40)}"`);
    }
  }

  // ── Remotion feed post renders — agency SVG posters (Canva replacement) ───
  if (bundleCards !== false && remotionPostCandidates.length > 0 && brandTokensForRender) {
    const brandTokens = brandTokensForRender;
    const { primaryColor, accentColor } = brandTokens;
    const usedPosterTemplateIds: string[] = [...gctx.recentTemplateIds];
    const nexusApi = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, '');
    const internalKey = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';

    for (let pi = 0; pi < remotionPostCandidates.length; pi++) {
      const candidate = remotionPostCandidates[pi]!;
      const moodLower = (candidate.mood || '').toLowerCase();
      const treatmentLower = (candidate.treatment || '').toLowerCase();
      const templateUseCase = String(candidate.templateUseCase || '');

      const intent = resolveContentIntent({
        treatment: treatmentLower,
        templateUseCase,
        mood: moodLower,
        headline: candidate.headline,
      });

      const production = resolveProductionTemplate({
        library: templateLibrary,
        sector: brandBusinessType,
        intent,
        treatment: treatmentLower,
        ideaIndex: pi,
        format: 'post',
        usedTemplateIds: usedPosterTemplateIds,
        headline: candidate.headline,
        caption: candidate.caption,
        brandTheme: brandTheme ?? undefined,
      });

      const posterTemplateId = production.posterTemplateId ?? 'poster_promo_split_01';
      if (posterTemplateId) usedPosterTemplateIds.push(posterTemplateId);

      const eventDet = (candidate.event_details ?? {}) as Record<string, string>;
      const eventDate = eventDet.date || eventDet.event_date || '';
      const eventTime = eventDet.time || eventDet.event_time || '';
      const ctaText = eventDet.cta_text || '';
      const compositionId = 'SpecPosterPost';
      const posterCopy = resolvePosterOverlayCopy({
        headline: candidate.headline,
        subtitle: candidate.caption,
        caption: candidate.caption,
        brandName: resolvedBrandName,
        location: brandLocation,
        eventDate,
        eventTime,
        cta: ctaText,
      });
      const posterQa = auditPosterOverlayCopy(posterCopy, {
        sector: brandBusinessType,
        layoutFamily: posterTemplateId,
      });
      if (!posterQa.pass) {
        console.warn(
          `[auto-produce] poster QA ${posterQa.score}/10 idea ${candidate.ideaIndex ?? pi}: ${posterQa.issues.join(', ')}`,
        );
      }

      const posterProps = applyBrandTokensToRenderProps({
        templateId: posterTemplateId,
        posterTemplateId,
        kitId: production.kitId,
        librarySlotKey: production.slot.key,
        photoUrl: candidate.photoUrl,
        headline: posterCopy.headline,
        subtitle: posterCopy.subtitle || candidate.caption.slice(0, 120),
        brandName: resolvedBrandName,
        location: posterCopy.venueArea ?? '',
        eventDate,
        eventTime,
        cta: posterCopy.cta || ctaText,
        logoUrl: brandLogoUrl || undefined,
        sector: brandBusinessType,
        businessType: brandBusinessType,
      }, brandTokens);

      fetch(`${routeBaseUrl}/api/remotion/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compositionId,
          useCreativeDirector: true,
          brandTemplateLocked: templateLibrary.locked,
          motionStyle: motionProfile.motionStyle,
          locale: motionProfile.locale,
          allowedCompositions: allowedCompositionsForDirector(motionProfile),
          uploadToR2: Boolean(process.env.R2_BUCKET_NAME),
          workspaceId,
          props: posterProps,
        }),
        signal: AbortSignal.timeout(120_000),
      }).then(async (res) => {
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          console.warn('[auto-produce] Remotion post failed:', res.status, errText.slice(0, 120));
          await markProductionBundleFailed({
            nexusApi,
            internalKey,
            workspaceId,
            artifactId: candidate.artifactId,
            error: `Poster render HTTP ${res.status}`,
            posterUrl: candidate.photoUrl,
            contentType: 'instagram_post',
          });
          return;
        }
        const data = await res.json() as {
          imageUrl?: string;
          durationMs?: number;
          announcementTemplateId?: string;
        };
        const imageUrl = data.imageUrl || null;
        let posterOut = imageUrl;
        if (!posterOut && candidate.artifactId) {
          posterOut = await renderRemotionBrandStill({
            workspaceId,
            photoUrl: candidate.photoUrl,
            headline: candidate.headline,
            caption: candidate.caption,
            brandName: resolvedBrandName,
            location: brandLocation,
            sector: brandBusinessType,
            contentType: 'post',
            baseUrl: routeBaseUrl,
            logoUrl: brandLogoUrl,
            primaryColor: syncPrimaryColor,
            accentColor: syncAccentColor,
          });
          if (posterOut) {
            console.log(`[auto-produce] Poster async fallback (sync still): "${candidate.headline.slice(0, 40)}"`);
          }
        }
        if (!posterOut || !candidate.artifactId) {
          await markProductionBundleFailed({
            nexusApi,
            internalKey,
            workspaceId,
            artifactId: candidate.artifactId,
            error: 'No poster output from Remotion',
            posterUrl: candidate.photoUrl,
            contentType: 'instagram_post',
          });
          return;
        }

        const patchResult = await attachPosterToProductionBundle({
          nexusApi,
          internalKey,
          workspaceId,
          artifactId: candidate.artifactId,
          imageUrl: posterOut,
          referencePhotoUrl: candidate.photoUrl,
          compositionId,
          posterTemplateId,
          renderMs: data.durationMs,
        });

        if (patchResult.ok) {
          console.log(
            `[auto-produce] Post bundle ready: ${candidate.artifactId} | ${posterTemplateId} | "${candidate.headline.slice(0, 40)}"`,
          );
        } else {
          console.warn(`[auto-produce] attach-poster failed: ${patchResult.error}`);
          await markProductionBundleFailed({
            nexusApi,
            internalKey,
            workspaceId,
            artifactId: candidate.artifactId,
            error: patchResult.error ?? 'attach_poster_failed',
            posterUrl: candidate.photoUrl,
            contentType: 'instagram_post',
          });
        }
      }).catch(async (err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[auto-produce] Remotion post error: ${msg.slice(0, 80)}`);
        await markProductionBundleFailed({
          nexusApi,
          internalKey,
          workspaceId,
          artifactId: candidate.artifactId,
          error: msg.slice(0, 200),
          posterUrl: candidate.photoUrl,
          contentType: 'instagram_post',
        });
      });

      console.log(`[auto-produce] Remotion post ${posterTemplateId} triggered: "${candidate.headline.slice(0, 40)}"`);
    }
  }

  const produced = results.filter(r => r.id && !r.error).length;
  await recordProduction(workspaceId, produced, costEstimate);

  const avgPis = pisScores.length
    ? Math.round(pisScores.reduce((a, b) => a + b, 0) / pisScores.length)
    : null;
  if (pisWarnings.length > 0 || avgPis != null) {
    console.log(
      `[auto-produce] PIS summary: avg=${avgPis ?? 'n/a'}% checked=${pisScores.length} skipped=${pisWarnings.length}`,
    );
  }

  releaseProductionLock(workspaceId);

  return NextResponse.json({
    produced,
    total: toProcess.length,
    parsed: productionIdeas.length,
    costEstimate: Math.round(costEstimate * 1000) / 1000,
    missionType: manifestMissionType,
    manifest: manifestValidation,
    pis: {
      minScore: PIS_PRODUCTION_MIN_SCORE,
      avg: avgPis,
      checked: pisScores.length,
      skipped: pisWarnings.length,
      warnings: pisWarnings,
    },
    results,
    artifacts: results,
  });
}
