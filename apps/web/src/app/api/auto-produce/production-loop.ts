import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import {
  canProduce,
  recordProduction,
  cleanupOldBuckets,
  fetchPackageLimits,
} from './budget';
import {
  FAL_GROUNDED_GALLERY_MIN_SCORE,
  isWeakGalleryMatch,
  shouldSkipProductionForWeakGallery,
} from '@/lib/gpt-enhance-policy';
import { hasCaptionHeadlineThemeConflict } from '@/lib/headline-theme-clusters';
import { canShipCaptionDesignPost } from '@/lib/caption-design-post-coherence';
import { serverConfig } from '@/lib/server-config';
import { isPlayableVideoUrl } from '@/lib/fal-story-motion';
import {
  beginFalRequestSlot,
  clearFalRequestSlot,
  getCapturedFalRequests,
} from '@/lib/fal-request-tracker';
// matchPhotoToContent, pickScoredCarouselSlides, MatchPhotoInput → caption-publish-resolver / image-generators
import { slotNeedsSceneBrief } from '@/lib/scene-brief-policy';
import {
  type PostTypeBucket,
  type UsedGalleryUsage,
  fetchUsedGalleryImages,
  getExcludeUrlsForPostType,
  getMissionWideExcludeUrls,
  isGalleryUrlUsedForPostType,
  kindToPostType,
  markGalleryUrlUsedForPostType,
  normalizeGalleryUrl,
  seedBatchUsedByTypeFromUsage,
  buildGlobalGalleryUsageCounts,
} from '@/lib/gallery-usage-tracker';
import { fetchRecentTemplateIds } from '@/lib/template-usage-tracker';
import {
  enrichGalleryAnalysis,
  assignPhotosToContents,
  resolveBestGalleryUrl,
  resolveUrlInPool,
  matchPhotoToContent,
  pickMissionDiverseFallbackPhoto,
  isHardGalleryThemeMismatch,
  rankPhotosForContent,
  buildGalleryLookup,
  MIN_ACCEPT_SCORE,
  REEL_GALLERY_MIN_SCORE,
  resolveGalleryMatchSubjectKey,
  type GalleryPhotoMeta,
  type MatchPhotoInput,
} from '@/lib/gallery-photo-matcher';
import {
  captionRequiresStrictGalleryMatch,
  scoreIdeationPhotoMatch,
} from '@/lib/caption-photo-alignment';
import type { GalleryPickMatchExtras } from '@/app/api/auto-produce/caption-publish-resolver';
import { shouldAutoProduceEnhanceGallery } from '@/lib/venue-photo-policy';
import {
  filterReachableGalleryUrls,
  toFeedPreviewUrl,
  normalizeExternalPhotoUrl,
  isStockGalleryPhotoUrl,
  probeMediaUrl,
  probeMediaUrlReliable,
  isUsableGalleryPhotoUrl,
  pickReachableProductionGalleryUrl,
} from '@/lib/media-url';
import { getNextjsInternalOrigin } from '@/lib/runtime-config';
import { isNonVenueSector } from '@/lib/sector-gallery-seed';
import {
  isCaptionDrivenDefault,
  getSectorColorGrade,
  isNonVenueSectorProfile,
  normalizeSectorId,
  allowsCaptionScratchGalleryFallback,
} from '@/lib/sector-production-profile';
import { resolveBrandReelProductionParams } from '@/lib/brand-reel-motion-profile';
import { resolveCanonicalBrandName } from '@/lib/resolve-brand-name';
import {
  harmonizeCaptionAndCta,
  normalizeBrandLanguagesInput,
  pickLocalizedCta,
  resolveBrandLanguageCode,
} from '@/lib/cta-localization';
import {
  isAiEnhanceEnabled,
  resolveAiEnhanceLevel,
  shouldUseMultiGalleryPhotos,
} from '@/lib/ai-gallery-enhance';
import {
  buildAiVisualStandardMetadata,
  resolveMissionVisualBrief,
  resolveVisualPipelineSteps,
  runGptImageEnhanceForIdea,
} from '@/lib/brand-visual-pipeline';
import { resolveVisualSubject, shouldUseCaptionDrivenVisual } from '@/lib/ai-visual-production-standard';
import { normalizeHashtags, resolveCarouselUrls } from '@/lib/artifact-utils';
import {
  detectIdeaPackageFormat,
  type FeedArtDirectorReport,
} from '@/lib/weekly-publish-package';
import {
  publishScheduleToMetadata,
  resolvePublishSchedule,
} from '@/lib/feed-publish-schedule';
import {
  buildManifestProductionQueue,
  prepareMissionFdAssignments,
  resolveContentKindForAssignment,
  resolveProductionAssignment,
  assignmentImpliesReel,
  assignmentImpliesStoryFormat,
  assignmentRequiresDesignedStoryVisual,
  type ManifestProductionQueueItem,
} from '@/lib/production-pipeline-router';
import {
  gallerySequencePhotoTarget,
  isGalleryOnlyVisualPolicy,
  storyGalleryPhotoTarget,
} from '@/lib/visual-overlay-policy';
import { GRAFIKER_PASS_THRESHOLD, resolveGrafikerMaxRetries } from '@/lib/grafiker-quality';
import {
  fetchGisScoreForWorkspace,
  isFeedDirectorFallback,
  resolveProductionProfile,
  shouldBlockProductionOnFdFallback,
  shouldUseMarkyLayer,
  type ProductionProfile,
} from '@/lib/production-profile';
import {
  buildMissionProductionTelemetry,
  countArtifactsWithScheduleLabel,
} from '@/lib/mission-production-telemetry';
import type { MissionProductionManifest, ProductionAssignment, ProductionSlotRole } from '@/lib/mission-production-manifest';
import { normalizeProductionPipeline } from '@/lib/mission-production-manifest';
import { resolveManifestMissionType } from '@/lib/mission-production-prefs';
import {
  adPipelineForChannel,
  adPlatformLabel,
  adSlotRoleForChannel,
  shouldDeriveWeeklyAdPair,
  type AdPublishChannel,
} from '@/lib/ad-publish-utils';
import {
  productionIdeasFromParsed,
  productionIdeaFromRecord,
  productionIdeaToRecord,
} from '@/lib/production-idea-parse';
import {
  applyCrossMissionHeadlineDedupe,
  fetchRecentHeadlineHistory,
} from '@/lib/mission-headline-history';
import type { ProductionIdea } from '@/types/production-idea';
import {
  auditRendererPayload,
  buildPayloadForIntegrityCheck,
  gatePromptIntegrity,
  PIS_PRODUCTION_MIN_SCORE,
  resolveProductionRenderer,
  type RendererBrandContext,
  type RendererGalleryMeta,
} from '@/lib/renderer-payload';
// buildReelGenerateReelRequest, reelDirectorExtrasFromIdeaRecord → handlers/image-generators.ts
import type { AiVisualProductionStandard, BrandContextForVisual } from '@/lib/ai-visual-production-standard';
import {
  buildCreativeTrace,
  buildReelDirectorExtra,
  createProductionStackContext,
  fetchProductSceneBrief,
  inferHeroReelIndex,
  resolveLayoutFamilyForAssignment,
  resolvePrimaryIndicesWithReport,
  resolveMaxHeroReelsPerMission,
  shouldProduceHeroReelForIdea,
  shouldSkipIdeaForProduction,
  toStorySceneBrief,
  toReelSceneBrief,
  type ProductSceneBrief,
} from '@/lib/production-stack';
import { fetchRejectedLayoutFamilies } from '@/lib/layout-family-learning';
import {
  buildIdeaProductionDedupeKey,
  fetchMissionArtifacts,
  loadMissionAutoArtifactDedupeKeys,
} from '@/lib/mission-production-guard';
import {
  pickMissionVisualDesignCard,
  type MissionVisualDesignCard,
} from '@/lib/mission-visual-design-cards';
import {
  ensureWeeklyFormatCoverage,
} from '@/lib/mission-production-plan';
import {
  acquireMissionProductionLock,
  acquireProductionLock,
  releaseAllProductionLocks,
  releaseProductionLock,
} from '@/lib/production-in-process-lock';
import type { StoryLayoutFamily } from '@/lib/story-template-types';
import {
  parseMotionProfileFromTheme,
  resolveContentIntent,
} from '@/lib/brand-motion-profile';
import { resolveStoryAudioMood } from '@/lib/story-audio-mood';
import { resolveFalSlotAspectRatio } from '@/lib/fal-slot-aspect-ratio';
import { resolveKitForSector } from '@/lib/story-template-registry';
import { tenantKitSeed } from '@/lib/tenant-template-seed';
import {
  ensureBrandTemplateLibrary,
  getLibrarySlotByKey,
  resolveStoryLibrarySlotKey,
  storyLayoutFamilyForSlotKey,
} from '@/lib/brand-template-library';
import {
  isMeaninglessBrandEchoHeadline,
  isLabelStyleHeadline,
  isUsableVisualDesignCardHeadline,
  resolveMeaningfulProductionHeadline,
  sanitizeProductionHeadline,
} from '@/lib/production-headline-quality';
import {
  clampMissionTaglineForCanvas,
  isIncompleteOverlayPhrase,
  isInternalStrategyBriefing,
  resolveFalOverlayCopy,
} from '@/lib/fal-caption-headline';
import {
  resolveMissionFalDesignCopy,
  shouldPreserveLockedPunchlineHeadline,
  type FalDesignCopyIdea,
} from '@/lib/fal-design-copy';
import { resolveSlotSampleCopy } from '@/lib/slot-sample-copy';
import { enforceDisplayHeadline } from '@/lib/grafiker-quality';
import {
  resolveIdeationHeadline,
  resolveIdeationOverlayHeadline,
  resolveIdeationTagline,
} from '@/lib/production-idea-parse';
import { resolveIdeaFeedBind } from '@/lib/idea-feed-bind';
import {
  buildArtifactListTitle,
  hasPublishableIdeationHeadline,
} from '@/lib/feed-display-caption';
import { resolvePlanningIdeaIndex } from '@/lib/content-calendar-artifact-link';
import { isGalleryTagHeadline } from '@/lib/vision-text-guard';
import { getBrandKit } from '@/lib/agency-brand-kits';
import {
  applyBrandTokensToRenderProps,
  resolveBrandProductionTokens,
} from '@/lib/brand-production-tokens';
import { resolveFalDesignPromptContext, readAgentFalDesignBrief, readBrandLogoPosition, readTenantPreferredCanvaArchetypes } from '@/lib/fal-design-brief';
import { resolveSlotRenderTypography } from '@/lib/brand-template-slot-typography';
import {
  type PremiumCompositionMeta,
} from './production-candidate-types';
import { resolveSlotLogoForRender } from '@/lib/brand-logo-production';
import { resolveSlotSublineForRender } from '@/lib/slot-subline-policy';
import {
  fetchBrandThemeForProduction,
  resolveProductionVisualStandard,
  resolveVisualSourceMode,
} from '@/lib/brand-theme-ai-settings';
import { auditPosterOverlayCopy, resolvePosterOverlayCopy } from '@/lib/poster-copy';
import type { StoryCompositionId } from '@/lib/story-composition-types';
import { normalizeCameraMotion } from '@/lib/camera-motion';
import { fetchProductionContext } from './production-context';
import { fetchGalleryContext, triggerGalleryAnalysisIfNeeded, ensureGalleryAnalysisForProduction } from './gallery-context';
import type { ProductionBrandContextSnapshot } from '@smartagency/contracts';
import {
  attachPipelineTrace,
  createProductionPipelineRun,
  runPipelineStep,
} from '@/lib/auto-produce/pipeline-telemetry';
import { runAutoProducePlanPhase } from '@/lib/auto-produce/plan-phase';
import { buildAutoProduceProductionQueue } from '@/lib/auto-produce/build-production-queue';
import {
  alignAssignmentToCatalogSlotKey,
  applyCatalogSlotBindingsToQueue,
  collectDurableCatalogPreferredKeys,
  enrichProductionQueueWithBrandSlots,
  filterProductionQueueToEnabledFormats,
  resolveSlotBackfillProductionLoop,
  loadBrandActiveSlotSet,
  stampIdeasWithBrandCatalogSlots,
  summarizeCatalogSlotStampCoverage,
  type BrandActiveSlotSet,
} from '@/lib/brand-active-slot-resolver';
import { summarizeCatalogTemplateHardPinCoverage } from '@/lib/catalog-template-coverage';
import {
  invalidateDesignTemplateCache,
  loadWorkspaceDesignTemplates,
} from '@/lib/brand-design-template-matcher';
import {
  ensureSlotCreativeBriefsForAssignments,
  stampAssignmentBriefsOntoKeyedTemplates,
} from '@/lib/slot-creative-library-persist';
import {
  getProductionProviderPreflight,
  httpStatusForProviderPreflight,
  recordProductionProviderBillingFailure,
  refreshProductionProviderCircuitsFromRedis,
} from '@/lib/production-provider-preflight';
import {
  resolveArtifactPublishReady,
  stampPublishReadyMetadata,
} from '@/lib/artifact-publish-ready';
import {
  getBrandContextProducePreflight,
  httpStatusForBrandContextPreflight,
} from '@/lib/brand-context-produce-preflight';
import { preferAiCatalogSlotsOnIdeas } from '@/lib/catalog-slot-ai-picker';
import { readBrandSlotFacilitiesFromTheme } from '@/lib/sector-slot-pack';
import {
  buildCalendarFalSceneHint,
  calendarGalleryMatchCaption,
  isCalendarProductionIdea,
  resolveCalendarSlotDesignIntensity,
} from '@/lib/calendar-production-pack';
import {
  readExplicitCalendarDesignLayoutFamily,
  resolveCalendarDesignLayout,
} from '@/lib/calendar-design-layout';
import { resolveCalendarEventOverlay } from '@/lib/calendar-event-overlay';
import {
  resolveGalleryFirstForSlot,
  shouldUseGalleryFirstMission,
  type GalleryFirstCaptionSource,
} from '@/lib/gallery-first-production';
import {
  buildMissionGalleryAssignments,
  missionGallerySlotKey,
  assignmentUsesGalleryPhoto,
  pickVenueEscalationFallbackPhoto,
  resolveQueueGalleryCapacityReroutes,
  tryGalleryFailureEscalation,
} from '@/lib/auto-produce/gallery-orchestrator';
import {
  createDefaultNexusClient,
} from './nexus-client';
import {
  deriveAdCreativesFromDesignedPost,
  type DesignedPostSnapshot,
  type AdDeriveRenderContext,
} from './ad-derive';
import { artifactToProductionRunRow, deriveStoriesFromPostsForEmptySlots } from './post-story-adapt';
import {
  applyCalendarBackfillToIdeas,
  matchCalendarPlansToEmptySlots,
  collectUsedCalendarPlanIndices,
} from '@/lib/calendar-slot-backfill';
import type { ProductionRunResultRow } from '@/lib/mission-slot-backfill';
import {
  missionHasPublishReadyStory,
  produceAndSaveMissionFalStoryGuarantee,
} from '@/lib/mission-fal-story-guarantee';
import {
  adHeadlineCharLimit,
  resolveAdChannelFromAssignment,
  resolveFalAdCreativeDirectives,
} from '@/lib/fal-ad-creative-prompt';
import { isPaidAdProductionSlot } from '@/lib/mission-fal-ad';
import {
  type ParsedIdea,
  NEXUS_CONTENT_URL_MAX,
  GALLERY_ONLY,
  GALLERY_EXCLUDE_PATTERNS,
  getField,
  detectContentKind,
  nexusPersistableContentUrl,
  isDataImageUrl,
  parseBrandGalleryPhotos,
  pickGalleryPhotoForIdea,
  captionHasExplicitBeautyService,
  pickSupplementaryGalleryPhotos,
  markSourceGalleryUsed,
  isCampaignContentIdea,
  buildEventCanvasPrompt,
  repickGalleryIfDuplicateForType,
  rematchGalleryAfterHardThemeConflict,
} from './caption-publish-resolver';
import {
  generateVibeImage,
  generateScratchVibeImage,
  generateDesignedImageFromMissionCard,
  generateEventOverlayImage,
  generateMarkyLayerCard,
  generateVibeCarousel,
  renderEventCardFromPayload,
} from './handlers/image-generators';
import {
  scratchBriefTelemetry,
  type ScratchVisualBrief,
} from '@/lib/scratch-visual-brief';
import { generateFalVideo, isFalVideoPipeline, isFalDesignPipeline, isFalOnlyVideoPipeline, isFalOnlyPostPipeline } from '@/lib/fal-video';
import { isVideoPipeline } from '@/lib/pipeline-registry';
import { isFalOnlyPipeline, isPremiumEditorialPipeline } from '@/lib/pipeline-registry';
import { finalizeFalPrompt } from '@/lib/fal-prompt';
import { falVideoHandler } from './pipelines/fal-video-pipeline';
import { productShowcaseHandler } from './pipelines/product-showcase-pipeline';
import { falOnlyHandler, produceFalOnlySlot } from './pipelines/fal-only-pipeline';
import { falDesignHandler } from './pipelines/fal-designed-post-pipeline';
import { premiumEditorialHandler } from './pipelines/premium-editorial-pipeline';
import { runPipelineStages } from './pipelines/pipeline-types';
import type { SlotProductionContext, VideoProduceMeta } from './pipelines/pipeline-types';
import { resolveFalDesignIntensityForChannel } from '@/lib/fal-design-intensity';
import {
  GALLERY_THEME_MISMATCH_CODE,
  galleryThemeMismatchMessage,
} from '@/lib/production-slot-failures';
import {
  confirmGalleryPickWithAiJudge,
  escalateSubjectAlignedPick,
} from '@/lib/gallery-ai-match-judge';
import { resolveFalRequireGroundedGallery } from '@/lib/fal-designer-production';
import type { TypographyBackgroundStyle } from '@/types/brand-theme';
import {
  classifyFalGridSurface,
  fetchRecentFalGridSurfaces,
  rotateFalDesignSurfaceForGrid,
  type FalGridSurfaceKind,
} from '@/lib/fal-grid-surface-rotation';
import {
  CAROUSEL_MIN_SLIDES,
  CAROUSEL_TARGET_SLIDES,
  isCarouselAssignment,
  fillCarouselPhotoPool,
  attachReelPhotoRefs,
} from './handlers/slot-utils';

const nexusClient = createDefaultNexusClient();

function extractPremiumComposition(idea: ParsedIdea): PremiumCompositionMeta | null {
  const raw = idea as Record<string, unknown>;
  const vpsSnake = raw.visual_production_spec as Record<string, unknown> | undefined;
  const vpsCamel = raw.visualProductionSpec as Record<string, unknown> | undefined;
  const pcSnake = vpsSnake?.premium_composition as Record<string, unknown> | undefined;
  const pcCamel = (vpsCamel?.premiumComposition ?? vpsSnake?.premiumComposition) as Record<string, unknown> | undefined;
  const pc = pcSnake ?? pcCamel;
  if (!pc) return null;

  const compType = (pc.composition_type ?? pc.compositionType) as string | undefined;
  if (typeof compType !== 'string') return null;

  return {
    compositionType: compType,
    visualPriority: String(pc.visual_priority ?? pc.visualPriority ?? '') || undefined,
    typographyApproach: String(pc.typography_approach ?? pc.typographyApproach ?? '') || undefined,
    objectTreatment: String(pc.object_treatment ?? pc.objectTreatment ?? '') || undefined,
    graphicElements: Array.isArray(pc.graphic_elements ?? pc.graphicElements)
      ? (pc.graphic_elements ?? pc.graphicElements) as string[]
      : undefined,
    layoutStrategy: String(pc.layout_strategy ?? pc.layoutStrategy ?? '') || undefined,
    compositionDescription: String(pc.composition_description ?? pc.compositionDescription ?? '') || undefined,
    creativeDirection: String(pc.creative_direction ?? pc.creativeDirection ?? '') || undefined,
    premiumScore: typeof (pc.premium_score ?? pc.premiumScore) === 'number'
      ? (pc.premium_score ?? pc.premiumScore) as number
      : undefined,
    visualStory: String(pc.visual_story ?? pc.visualStory ?? '') || undefined,
    motionApproach: String(pc.motion_approach ?? pc.motionApproach ?? '') || undefined,
  };
}


// ─── Core production engine ────────────────────────────────────────────────────
// Extracted from POST so the lock try-finally can wrap it cleanly.
// All data is workspace-scoped — no cross-tenant state.

export interface RunProductionParams {
  workspaceId: string;
  missionId?: string;
  nodeKey?: string;
  ideas: ParsedIdea[];
  visualDesignCards: MissionVisualDesignCard[];
  galleryAnalysis: Record<string, unknown> | null;
  brandNameOverride: string | null;
  productionSnapshot: ProductionBrandContextSnapshot | null;
  brandThemeOverride?: Record<string, unknown> | null;
  bundleCards?: boolean;
  feedDirectorReport: Record<string, unknown> | null;
  strategistMissionType: string | null;
  productionPackage: string | null;
  missionTitle: string | null;
  creativeBrief: string | null;
  skipArtifactDedupe?: boolean;
  /** Internal — second pass for failed/missing manifest slots only. */
  slotBackfillPass?: boolean;
  /** Internal — keys `${ideaIndex}:${slot_role}` to re-run on backfill pass. */
  backfillSlotKeys?: string[];
  /** Raw content_calendar plan rows — used for empty-slot backfill after main pass. */
  calendarPlans?: Record<string, unknown>[];
  /** Factory plan-phase gallery picks keyed by `${ideaIndex}::${slot_role}`. */
  gallerySlotAssignments?: Record<string, { url: string; score?: number | null }>;
  /**
   * Faz 5 — persisted production_jobs.slot_key bindings keyed by
   * `${ideaIndex}:${slot_role}`. Hard-pins the tenant catalog slot chosen at
   * plan time so drain passes render the exact brand template (no re-match drift).
   */
  catalogSlotBindings?: Record<string, string>;
  /** Internal nested calendar backfill — skip lock release (outer pass owns locks). */
  internalNestedPass?: boolean;
  /** Skip main slot loop — only post→story + calendar backfill + retries (factory completion). */
  completionPassOnly?: boolean;
  /** New Brief form — fal.ai art-director pipelines, no Remotion bundle. */
  adHocBrief?: boolean;
}

/**
 * Pipelines that compose their own visual and treat a gallery pin as optional.
 *
 * Narrower than `!assignmentUsesGalleryPhoto`: fal_only slots also run without a
 * pin, but they are only *reached* after the gallery genuinely missed, and policy
 * there is to withhold rather than invent an unrelated AI visual for a photo brand.
 */
function pipelineComposesWithoutGalleryPin(pipeline: string, slotRole: string): boolean {
  return isPremiumEditorialPipeline(pipeline)
    || slotRole === 'premium_editorial_campaign_post'
    || slotRole === 'premium_editorial_campaign_story'
    || pipeline === 'meta_ad'
    || pipeline === 'google_ad'
    || slotRole === 'paid_ad_creative'
    || slotRole === 'paid_ad_google_creative';
}

/** Pipelines that can attempt durable gallery rematch/mirror before aborting. */
function canRetryBrandGalleryRecovery(pipeline: string, slotRole: string): boolean {
  return isFalDesignPipeline(pipeline)
    || isFalVideoPipeline(pipeline)
    || isFalOnlyPipeline(pipeline)
    || slotRole === 'designed_post'
    || slotRole === 'designed_typography'
    || slotRole === 'fal_designed_post'
    || slotRole === 'campaign_story_motion'
    || slotRole === 'campaign_reel_motion'
    || slotRole === 'organic_reel'
    || slotRole === 'organic_story_still'
    || slotRole === 'organic_carousel'
    || slotRole === 'organic_post'
    || pipeline === 'carousel_gallery'
    || pipeline === 'gallery_photo';
}

/**
 * Rematch a broken gallery URL among reachable brand photos.
 * When matchInput is provided, only caption-aligned candidates (≥ minScore) are tried —
 * never fall back to the first reachable brand photo without scoring.
 */
type GalleryRematchFailure =
  | 'no_photos'
  | 'no_aligned_candidate'
  | 'unreachable'
  /** Pipeline is outside `canRetryBrandGalleryRecovery` — no rematch was attempted. */
  | 'recovery_unsupported';

type GalleryRematchResult =
  | { ok: true; url: string }
  | { ok: false; reason: GalleryRematchFailure };

async function rematchMirroredBrandGalleryUrl(opts: {
  workspaceId: string;
  primaryUrl: string | null | undefined;
  galleryPhotos: string[];
  matchInput?: MatchPhotoInput;
  galleryMeta?: Record<string, GalleryPhotoMeta>;
  minScore?: number;
}): Promise<GalleryRematchResult> {
  const photos = opts.galleryPhotos.filter((u) => Boolean(u?.trim()));
  if (!photos.length) return { ok: false, reason: 'no_photos' };

  const minScore = opts.minScore ?? MIN_ACCEPT_SCORE;
  let ordered = photos;

  if (opts.matchInput && opts.galleryMeta) {
    const lookup = buildGalleryLookup(opts.galleryMeta, photos);
    const ranked = rankPhotosForContent(
      opts.matchInput,
      photos,
      lookup,
      new Set(),
      opts.galleryMeta,
    ).filter((r) => r.score >= minScore);
    if (!ranked.length) {
      console.warn(
        '[auto-produce] rematch refused — no caption-aligned candidates above floor',
      );
      return { ok: false, reason: 'no_aligned_candidate' };
    }
    ordered = ranked.map((r) => r.url);
  }

  const primary = (
    opts.primaryUrl
    && ordered.some((u) => normalizeGalleryUrl(u) === normalizeGalleryUrl(opts.primaryUrl!))
      ? opts.primaryUrl
      : ordered[0]
  )!.trim();
  if (!primary) return { ok: false, reason: 'no_photos' };

  const picked = await pickReachableProductionGalleryUrl(
    opts.workspaceId,
    primary,
    ordered,
    { timeoutMs: 12_000 },
  );
  if (!picked?.url) return { ok: false, reason: 'unreachable' };
  return { ok: true, url: picked.url };
}

function galleryRematchErrorMessage(reason: GalleryRematchFailure): string {
  if (reason === 'no_aligned_candidate') {
    return 'Galeri eşleşmesi yok — caption ile uyumlu marka fotoğrafı bulunamadı';
  }
  if (reason === 'no_photos') {
    return 'Marka galerisinde kullanılabilir fotoğraf yok';
  }
  if (reason === 'recovery_unsupported') {
    return 'Slota galeri fotoğrafı atanamadı — caption ile uyumlu marka fotoğrafı gerekiyor';
  }
  return 'Galeri fotoğrafı erişilemiyor (mirror/probe başarısız — URL süresi dolmuş veya fetch engelli olabilir)';
}

/** Prefer byte-fetch for brand-site https — HEAD-only probes false-fail on some hosts. */
async function isProductionGalleryUrlReachable(url: string, timeoutMs = 8_000): Promise<boolean> {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('https://')) {
    try {
      const { fetchExternalImageBuffer } = await import('@/lib/external-image-fetch');
      const buf = await fetchExternalImageBuffer(trimmed, timeoutMs);
      if (buf && buf.length >= 100) return true;
    } catch {
      /* fall through */
    }
  }
  return probeMediaUrlReliable(trimmed, { timeoutMs, retries: trimmed.includes('/api/media') ? 3 : 2 });
}

export async function runProduction(params: RunProductionParams): Promise<NextResponse> {
  const {
    workspaceId, missionId, nodeKey,
    ideas, visualDesignCards,
    galleryAnalysis: galleryAnalysisInput,
    brandNameOverride, productionSnapshot, bundleCards,
    feedDirectorReport, strategistMissionType,
    productionPackage, missionTitle, creativeBrief, skipArtifactDedupe,
    brandThemeOverride,
    slotBackfillPass = false,
    backfillSlotKeys,
    calendarPlans = [],
    gallerySlotAssignments,
    catalogSlotBindings,
    internalNestedPass = false,
    completionPassOnly = false,
    adHocBrief = false,
  } = params;
  const brandName = brandNameOverride ?? undefined;
  const pipelineRun = createProductionPipelineRun({ workspaceId, missionId });

  // ── Phase 1: Fetch brand production context ─────────────────────────────────
  // All brand data fetched in parallel, fully tenant-isolated.
  // Uses fetchProductionContext() from ./production-context.ts
  const pctx = await runPipelineStep(
    pipelineRun,
    'fetch_production_context',
    () => fetchProductionContext(workspaceId, {
      brandName: brandName ?? undefined,
      creativeBrief: creativeBrief ?? undefined,
      baseUrl: getNextjsInternalOrigin(),
      productionSnapshot,
      brandThemeOverride: brandThemeOverride ?? undefined,
    }),
  );
  if (!pctx) {
    return NextResponse.json(
      attachPipelineTrace({ error: 'Production context unavailable' }, pipelineRun),
      { status: 500 },
    );
  }

  // Fail loud before draining slots when image providers are missing or BOTH
  // billing circuits are open. Single-provider circuit → degraded continue
  // (fal-video slots skip; posts/stories use the other key).
  await refreshProductionProviderCircuitsFromRedis();
  const providerPreflight = getProductionProviderPreflight();
  if (!providerPreflight.ok) {
    console.warn(
      `[auto-produce:${workspaceId}] provider preflight blocked: ${providerPreflight.code} — ${providerPreflight.reason}`,
    );
    return NextResponse.json(
      attachPipelineTrace({
        error: providerPreflight.code,
        detail: providerPreflight.reason,
        providers: providerPreflight.providers,
        produced: 0,
      }, pipelineRun),
      { status: httpStatusForProviderPreflight(providerPreflight.code) },
    );
  }
  if (providerPreflight.falDegraded) {
    console.warn(
      `[auto-produce:${workspaceId}] provider preflight degraded: ${providerPreflight.reason}`,
    );
  }

  const resolvedBrandName = pctx.brandName;
  // Dual-DB gate: stub/missing constitution/gallery must not drain a mission.
  const brandPreflight = getBrandContextProducePreflight({
    raw: pctx.raw,
    brandName: resolvedBrandName,
  });
  if (!brandPreflight.ok) {
    console.warn(
      `[auto-produce:${workspaceId}] brand preflight blocked: ${brandPreflight.code} — ${brandPreflight.reason}`,
    );
    return NextResponse.json(
      attachPipelineTrace({
        error: brandPreflight.code,
        detail: brandPreflight.reason,
        brand: brandPreflight.details,
        produced: 0,
      }, pipelineRun),
      { status: httpStatusForBrandContextPreflight(brandPreflight.code) },
    );
  }

  // Alias to legacy variable names used throughout the rest of the function
  // These all reference pctx, ensuring tenant isolation
  const brandCtx = pctx.raw;
  const brandLanguageCode = resolveBrandLanguageCode(
    brandCtx.languages ?? brandCtx.inferred_language,
  );
  const hasVibe = pctx.hasVibe;
  const brandLocation = pctx.brandLocation;
  const brandBusinessType = pctx.brandBusinessType;
  const brandLogoUrl = pctx.brandLogoUrl;
  const brandTheme = pctx.brandTheme;
  const brandTokens = pctx.tokens;
  const templateLibrary = pctx.templateLibrary;
  const brandKitId = pctx.kitId;
  const aiPhotoEnhance = pctx.aiPhotoEnhanceEnabled;
  const aiPhotoEnhanceLevel = pctx.aiPhotoEnhanceLevel;
  /** May be refined after gallery analysis when theme subject is `auto`. */
  let aiVisualStandard = pctx.aiVisualStandard;
  let resolvedVisualSubject = pctx.resolvedVisualSubject;
  const missionVisualBrief = pctx.missionVisualBrief;
  const tenantLearning = pctx.tenantLearning;
  const tenantLearningBrief = pctx.tenantLearningBrief;
  const brandLutDirective = pctx.brandLutDirective ?? '';
  const brandGradingLook = pctx.brandGradingLook ?? '';
  const brandAntiPatterns = pctx.brandAntiPatterns;
  const motionProfile = pctx.motionProfile;
  const brandCtxForVisual = pctx.brandCtxForVisual;
  const agencyProductionForced = pctx.agencyProductionForced;

  const vibePalette = hasVibe
    ? ((brandCtx.brand_vibe_profile as Record<string, unknown>)?.palette as Record<string, string> | undefined)
    : undefined;
  const syncPrimaryColor = vibePalette?.primary;
  const syncAccentColor = vibePalette?.accent;

  // Log brand story slot keys for this workspace
  const missionStorySlotKeys = templateLibrary.slots
    .filter((s) => s.format === 'story' && s.enabled)
    .map((s) => s.key);
  if (missionStorySlotKeys.length) {
    console.log(
      `[auto-produce] Brand story slots (${templateLibrary.locked ? 'locked' : 'derived'}): ` +
      missionStorySlotKeys.join(', '),
    );
  }

  if (aiVisualStandard.enabled) {
    console.log(
      `[auto-produce] AI Görsel Geliştirme ON (level=${aiPhotoEnhanceLevel}, subject=${resolvedVisualSubject}, ` +
      `formats=${[...aiVisualStandard.formats].join(',')}, identity=${aiVisualStandard.useBrandIdentity}, ` +
      `briefScene=${aiVisualStandard.briefDrivesScene}, logo=${aiVisualStandard.embedLogo}` +
      `${aiVisualStandard.adaptiveScene ? `, adaptiveScene=${aiVisualStandard.adaptiveSceneMode}` : ''})`,
    );
  }

  // ── Phase 2: Plan (budget, ICS, FD assignments, stack context) ───────────
  const pisScores: number[] = [];
  const pisWarnings: Array<{
    idea_index: number;
    headline: string;
    renderer: string;
    score: number;
    missing: string[];
    pipeline: string;
  }> = [];
  const enhanceTraces: Array<{
    idea_index: number;
    headline: string;
    pipeline: string;
    applied: boolean;
    skip_reason?: string;
    api_failed?: boolean;
  }> = [];

  const planOutcome = await runAutoProducePlanPhase({
    workspaceId,
    missionId,
    ideas: ideas as import('@/lib/auto-produce/plan-phase').ParsedIdeaLike[],
    calendarOnlySlotPass: false,
    calendarIdeasCount: 0,
    feedDirectorReport,
    productionPackage,
    strategistMissionType,
    missionTitle,
    creativeBrief,
    brandBusinessType,
    brandTheme,
    brandName: resolvedBrandName,
    brandLocation,
    brandDescription: brandCtxForVisual.description ?? undefined,
    brandLanguages: normalizeBrandLanguagesInput(
      brandCtx.languages ?? brandCtx.inferred_language,
    ),
    pipelineRun,
  });

  if (planOutcome.status === 'blocked') {
    if (!internalNestedPass) {
      await releaseAllProductionLocks(workspaceId, missionId);
    }
    if (planOutcome.httpStatus === 429) {
      console.warn(
        `[auto-produce] Budget blocked workspace=${workspaceId} mission=${missionId ?? 'none'}: ${planOutcome.body.error}`,
      );
    }
    return NextResponse.json(
      attachPipelineTrace(planOutcome.body, pipelineRun),
      { status: planOutcome.httpStatus },
    );
  }

  const {
    toProcess,
    productionIdeas,
    maxIdeas,
    manifestMissionType,
    pkgLimits,
    gisScore,
    productionProfile,
    grafikerMaxRetries,
    fdAssignments,
    manifestValidation,
    stackCtx,
    primaryIdeaIndices,
    maxHeroReelsPerMission,
    hasOrganicReelAssignment,
  } = planOutcome.plan;

  const brandSector = normalizeSectorId(brandBusinessType);
  let brandActiveSlots: BrandActiveSlotSet | null = null;
  if (brandSector) {
    try {
      // Seed empty assignment briefs, stamp onto keyed shells missing purpose brief,
      // then load coverage with real templates (hasTemplate ≡ hard-pin ready).
      const briefSeed = await ensureSlotCreativeBriefsForAssignments(workspaceId, {
        brandName: resolvedBrandName,
        location: brandLocation || undefined,
        visualDna: typeof brandTheme?.visual_dna === 'string' ? brandTheme.visual_dna : undefined,
        brandTone: typeof brandTheme?.tone === 'string' ? brandTheme.tone : undefined,
      });
      if (briefSeed.seededCount > 0) {
        console.log(
          `[auto-produce] seeded ${briefSeed.seededCount} empty slot creative briefs`,
        );
      }
      let designTemplates = await loadWorkspaceDesignTemplates(workspaceId);
      // Provisional slot set (may have hasTemplate=false gaps) → clone keyed shells
      // BEFORE brief stamp so new clones also receive assignment purpose briefs.
      const provisionalSlots = await loadBrandActiveSlotSet(
        workspaceId,
        brandSector,
        designTemplates,
        readBrandSlotFacilitiesFromTheme(brandTheme as Record<string, unknown> | null),
      );
      const { parseSlotCreativeCustomization } = await import(
        '@/lib/slot-creative-customization'
      );
      const briefByKey = new Map<string, import('@/lib/slot-creative-customization').SlotCreativeCustomization>();
      for (const a of briefSeed.assignments) {
        if (!a.enabled || !a.slot_key) continue;
        const brief = parseSlotCreativeCustomization(a.customization);
        if (brief) briefByKey.set(a.slot_key, brief);
      }
      const { ensureKeyedDesignTemplatesForEnabledSlots } = await import(
        '@/lib/ensure-keyed-design-templates'
      );
      const keyedFill = await ensureKeyedDesignTemplatesForEnabledSlots({
        workspaceId,
        enabledSlots: provisionalSlots.slots,
        activeTemplates: designTemplates,
        brandSeed: {
          brandName: resolvedBrandName,
          location: brandLocation || undefined,
          visualDna: typeof brandTheme?.visual_dna === 'string' ? brandTheme.visual_dna : undefined,
          brandTone: typeof brandTheme?.tone === 'string' ? brandTheme.tone : undefined,
        },
        briefByKey,
      });
      if (keyedFill.cloned > 0) {
        designTemplates = await loadWorkspaceDesignTemplates(workspaceId);
      }
      const stamp = await stampAssignmentBriefsOntoKeyedTemplates(
        workspaceId,
        designTemplates,
        briefSeed.assignments,
      );
      if (stamp.stamped > 0) {
        invalidateDesignTemplateCache(workspaceId);
        designTemplates = await loadWorkspaceDesignTemplates(workspaceId);
        console.log(
          `[auto-produce] stamped purpose briefs onto ${stamp.stamped} keyed shells`,
        );
      }
      brandActiveSlots = await loadBrandActiveSlotSet(
        workspaceId,
        brandSector,
        designTemplates,
        readBrandSlotFacilitiesFromTheme(brandTheme as Record<string, unknown> | null),
      );
      console.log(
        `[auto-produce] Brand active slots: ${brandActiveSlots.slots.length} enabled `
        + `(sector=${brandSector}, hardPinReady=${brandActiveSlots.slots.filter((s) => s.hasTemplate).length})`,
      );
    } catch (err) {
      console.warn(
        `[auto-produce] Brand slot catalog unavailable — falling back to legacy matcher: `
        + `${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const hasReusablePostTemplates = brandActiveSlots
    ? brandActiveSlots.slots.some((s) => s.format === 'post' && s.hasTemplate)
    : templateLibrary.slots.some((s) => s.enabled && s.format === 'post');

  // New Brief / ad-hoc: AI picks one enabled catalog slot before heuristic stamp.
  // Preferred `catalog_slot_key` wins in matchIdeaToBrandCatalogSlot.
  let ideasForStamp = toProcess as Record<string, unknown>[];
  if (adHocBrief && brandActiveSlots) {
    ideasForStamp = await preferAiCatalogSlotsOnIdeas({
      ideas: ideasForStamp,
      activeSlots: brandActiveSlots,
      sector: brandSector || undefined,
    });
  }

  // Lightweight recent catalog keys before gallery context — stamp idea-fit + variety.
  let stampRecentCatalogKeys: string[] = [];
  if (brandActiveSlots) {
    try {
      const { fetchRecentCatalogSlotKeys } = await import('@/lib/template-usage-tracker');
      stampRecentCatalogKeys = await fetchRecentCatalogSlotKeys(workspaceId);
    } catch {
      stampRecentCatalogKeys = [];
    }
  }
  // Produce path: keep plan/FD/factory catalog pins — do not rematch for recent variety.
  const hasFactoryCatalogBindings = Boolean(
    catalogSlotBindings && Object.keys(catalogSlotBindings).length > 0,
  );
  const brandAwareToProcess = brandActiveSlots
    ? stampIdeasWithBrandCatalogSlots(ideasForStamp, brandActiveSlots, {
      recentCatalogSlotKeys: stampRecentCatalogKeys,
      lockExistingCatalogPins: hasFactoryCatalogBindings || !adHocBrief,
    })
    : ideasForStamp;

  const routeBaseUrl = getNextjsInternalOrigin();

  let heroReelsProducedInMission = 0;
  let designedPostSnapshot: DesignedPostSnapshot | null = null;
  let slotPostCount = 0;
  let slotStoryCount = 0;
  let slotReelCount = 0;
  let designedPostOrdinal = 0;
  const usedVisualDesignCardIndices = new Set<number>();
  const sceneBriefCache = new Map<number, ProductSceneBrief | null>();
  /** One Crew scene-brief per mission run — reused across slots that need it. */
  let missionSceneBrief: ProductSceneBrief | null | undefined = undefined;

  // Sprint 4 — Mission Originality Tracker: log all layout families used in this
  // mission run and pass the list to Creative Director so it can diversify.
  const missionUsedLayoutFamilies: string[] = [];
  // Sprint 4 — Brief Split: typed format-specific briefs derived from the base brief.
  // Computed lazily once missionSceneBrief is available.
  let missionStoryBrief: ReturnType<typeof toStorySceneBrief> | undefined = undefined;
  let missionReelBrief: ReturnType<typeof toReelSceneBrief> | undefined = undefined;

  // ── Phase 3: Prepare gallery context ───────────────────────────────────────
  // Fully tenant-isolated: all gallery data fetched via X-Tenant-Id header.
  // Health check, enrichment, and sector seed fill happen here.
  const galleryAnalysis = (
    galleryAnalysisInput
    ?? productionSnapshot?.galleryAnalysis
    ?? pctx.productionSnapshot?.galleryAnalysis
    ?? null
  ) as Record<string, unknown> | null;
  const gctx = await runPipelineStep(
    pipelineRun,
    'fetch_gallery_context',
    () => fetchGalleryContext(
      workspaceId,
      brandCtx,
      galleryAnalysis,
      brandBusinessType,
      { gisScore },
    ),
  );
  if (!gctx) {
    return NextResponse.json(
      attachPipelineTrace({ error: 'Gallery context unavailable' }, pipelineRun),
      { status: 500 },
    );
  }
  triggerGalleryAnalysisIfNeeded(workspaceId, gctx, galleryAnalysis);

  // Alias to legacy variable names used throughout the production loop
  let galleryPhotos = gctx.photos;
  let galleryMeta = gctx.meta;
  if (missionId && gctx.hasRealPhotos) {
    const analysisGate = await runPipelineStep(
      pipelineRun,
      'ensure_gallery_analysis',
      () => ensureGalleryAnalysisForProduction(
        workspaceId,
        galleryPhotos,
        galleryMeta,
        gctx.hasRealPhotos,
        galleryAnalysis,
      ),
    );
    if (analysisGate?.blocked) {
      if (!internalNestedPass) {
        await releaseAllProductionLocks(workspaceId, missionId);
      }
      return NextResponse.json(
        attachPipelineTrace({ error: analysisGate.blocked }, pipelineRun),
        { status: 422 },
      );
    }
    if (analysisGate?.meta) {
      galleryMeta = analysisGate.meta;
    }
  }

  // P3 — auto subject: gallery density → sector default (explicit theme subject untouched).
  if (pctx.aiVisualStandard.visualSubject === 'auto') {
    const fromAuto = resolveVisualSubject('auto', brandBusinessType, { galleryMeta });
    if (fromAuto !== resolvedVisualSubject) {
      console.log(
        `[auto-produce] auto visual subject: ${resolvedVisualSubject} → ${fromAuto} `
        + `(galleryEvidence=${Object.keys(galleryMeta).length})`,
      );
    }
    resolvedVisualSubject = fromAuto;
    aiVisualStandard = {
      ...aiVisualStandard,
      visualSubject: fromAuto,
    };
  }

  // Brief'ten gelen kullanıcı fotoğraflarını galeri yoksa inject et (hasGallery ve PIS için)
  const briefPhotoUrls: string[] = ideas
    .map((idea) => (idea as Record<string, unknown>).selected_gallery_url)
    .filter((u): u is string => typeof u === 'string' && isUsableGalleryPhotoUrl(u));
  if (briefPhotoUrls.length > 0 && !gctx.hasPhotos) {
    galleryPhotos = [...new Set([...briefPhotoUrls, ...galleryPhotos])];
  }

  const hasGallery = gctx.hasPhotos || briefPhotoUrls.length > 0;
  const hasRealBrandPhotos = gctx.hasRealPhotos;
  const galleryUsage = gctx.usage;
  const batchUsedByType = gctx.batchUsedByType;
  if (missionId) {
    seedBatchUsedByTypeFromUsage(galleryUsage, batchUsedByType);
  }
  const syncUsedTemplateIds: string[] = [...gctx.recentTemplateIds];
  /** Strategist — avoid same venue photo across slots in one mission run. */
  const batchUsedGalleryMission = new Set<string>();
  const globalGalleryUsageCounts = buildGlobalGalleryUsageCounts(galleryUsage);
  /** Closed over by pickMissionGallery — set per-slot from ideation subject_key. */
  let activeGallerySubjectKey: string | undefined;
  /** Closed over — visual_direction / strategic_purpose for caption↔photo scoring. */
  let activeGalleryMatchExtras: GalleryPickMatchExtras = {};
  const pickMissionGallery = (
    caption: string,
    headline: string,
    mood: string,
    galleryAnalysis: Record<string, import('@/lib/gallery-photo-matcher').GalleryPhotoMeta>,
    candidateUrls: string[],
    typeExcludeUrls: string[],
    batchExcludeUrls: string[],
    contentType?: string,
    agentUrl?: string | null,
    businessType?: string,
    productionStrict = true,
    tieBreakSeed?: number,
  ): string | null =>
    pickGalleryPhotoForIdea(
      caption,
      headline,
      mood,
      galleryAnalysis,
      candidateUrls,
      typeExcludeUrls,
      batchExcludeUrls,
      contentType,
      agentUrl,
      businessType,
      productionStrict,
      tieBreakSeed,
      globalGalleryUsageCounts,
      activeGallerySubjectKey,
      activeGalleryMatchExtras,
    );

  // galleryMetaRaw alias for code that still references it directly
  const galleryMetaRaw = (galleryAnalysis ?? {}) as Record<string, import('@/lib/gallery-photo-matcher').GalleryPhotoMeta>;
  const results: {
    id?: string;
    title: string;
    imageUrl: string;
    videoUrl?: string;
    error?: string;
    /** Machine-readable failure for factory retry policy (Python drainer). */
    errorCode?: string;
    publishReady?: boolean;
    rendering?: boolean;
    /** `${ideaIndex}:${slot_role}` — lets the durable drainer map a batched
     * multi-slot result back to the exact production_jobs row it satisfied. */
    slotKey?: string;
    metadata?: Record<string, unknown>;
  }[] = [];
  let costEstimate = 0;
  const location = brandLocation;

  // ── Production rules (APO-2 pipeline router) ───────────────────────────────
  // organic_post      → gallery photo only + caption in Feed
  // designed_post     → Remotion agency poster (SVG+Sharp)
  // organic_story_still → static gallery story
  // campaign_story_motion → Remotion MP4
  // organic_reel / campaign_reel_motion → fal_reel (fal designer video)
  // ─────────────────────────────────────────────────────────────────────────

  const existingArtifactKeys = missionId && !skipArtifactDedupe
    ? await loadMissionAutoArtifactDedupeKeys(workspaceId, missionId)
    : new Set<string>();

  const manifestQueue = buildAutoProduceProductionQueue({
    missionId,
    toProcess: brandAwareToProcess,
    feedDirectorReport,
    manifestMissionType,
    brandBusinessType,
    maxIdeas,
    productionProfile,
    packageSlug: pkgLimits.packageSlug,
    adHocBrief,
  });

  // Faz 5 — apply durable factory bindings (production_jobs.slot_key) before
  // enrichment so the matcher treats the plan-time catalog slot as preferred.
  const boundQueue = applyCatalogSlotBindingsToQueue(manifestQueue, catalogSlotBindings);
  // Closed formats (no enabled catalog slots) never enter match/produce.
  const formatGatedQueue = brandActiveSlots
    ? (() => {
      const gated = filterProductionQueueToEnabledFormats(boundQueue, brandActiveSlots);
      if (gated.skipped.length > 0) {
        console.log(
          `[auto-produce] queue format gate dropped ${gated.skipped.length} slot(s): `
          + gated.skipped
            .slice(0, 8)
            .map((s) => `#${s.ideaIndex}:${s.format}`)
            .join(', '),
        );
      }
      return gated.kept;
    })()
    : boundQueue;
  const durablePreferredKeys = collectDurableCatalogPreferredKeys(
    formatGatedQueue,
    catalogSlotBindings,
  );

  const brandAwareQueue = brandActiveSlots
    ? enrichProductionQueueWithBrandSlots(formatGatedQueue, brandActiveSlots, {
      recentCatalogSlotKeys: gctx.recentCatalogSlotKeys,
      durablePreferredKeys,
      // Mission produce: any stamp already on the row is plan SSOT.
      lockExistingCatalogPins: hasFactoryCatalogBindings || !adHocBrief,
    })
    : formatGatedQueue;

  if (brandActiveSlots && brandActiveSlots.enabledSlotKeys.size > 0) {
    const coverage = summarizeCatalogSlotStampCoverage(brandAwareQueue);
    const level = coverage.missing > 0 ? 'warn' : 'log';
    console[level](
      `[auto-produce] catalog stamp coverage ${coverage.stamped}/${coverage.total}` +
        (coverage.missing > 0
          ? ` (${coverage.missing} unbound → soft match only)`
          : ' (all hard-pin ready)'),
    );
    const hardPin = summarizeCatalogTemplateHardPinCoverage(brandActiveSlots);
    const hardLevel = hardPin.sufficient ? 'log' : 'warn';
    console[hardLevel](
      `[auto-produce] template hard-pin coverage ${hardPin.covered}/${hardPin.total}` +
        ` (ratio=${hardPin.ratio.toFixed(2)})` +
        (hardPin.missingKeys.length
          ? ` missing=${hardPin.missingKeys.slice(0, 8).join(',')}`
          : ''),
    );
  }

  const fullProductionQueue = brandAwareQueue;

  if (adHocBrief) {
    const adHocKeys = fullProductionQueue
      .map((item) => String(item.assignment.catalog_slot_key ?? item.idea.catalog_slot_key ?? '').trim())
      .filter(Boolean);
    console.log(
      `[auto-produce] Ad-hoc New Brief → fal.ai art-director track (${fullProductionQueue.length} slots)`
        + (adHocKeys.length ? ` catalog=[${[...new Set(adHocKeys)].join(',')}]` : ' catalog=unbound'),
    );
  }

  let productionLoop: ManifestProductionQueueItem[] = completionPassOnly
    ? []
    : slotBackfillPass && backfillSlotKeys?.length
      ? resolveSlotBackfillProductionLoop(
          fullProductionQueue,
          backfillSlotKeys,
          catalogSlotBindings,
        )
      : fullProductionQueue;

  // Backfill repair can reintroduce a closed format — gate again before render.
  if (brandActiveSlots && productionLoop.length > 0) {
    const gatedLoop = filterProductionQueueToEnabledFormats(productionLoop, brandActiveSlots);
    if (gatedLoop.skipped.length > 0) {
      console.log(
        `[auto-produce] produce format gate dropped ${gatedLoop.skipped.length} slot(s) before render`,
      );
    }
    productionLoop = gatedLoop.kept;
  }

  if (completionPassOnly && missionId) {
    console.log(
      `[auto-produce] Completion pass only: skipping main loop (${fullProductionQueue.length} manifest slots)`,
    );
  } else if (missionId && !slotBackfillPass) {
    console.log(
      `[auto-produce] Manifest production queue: ${productionLoop.length} slots ` +
      `(ideas=${toProcess.length}, max=${maxIdeas}, package=${manifestMissionType})`,
    );
  } else if (missionId && slotBackfillPass) {
    console.log(
      `[auto-produce] Slot backfill pass: ${productionLoop.length} slots`,
    );
  }

  // Plan-time (factory) assignments are the SSOT when present: the plan phase
  // already ran the judge-gated batch once for the whole manifest. Recomputing
  // per drain call would burn judge tokens AND produce drift (cumulative
  // excludes change between calls). Only slots the plan left uncovered get a
  // fresh batch pass, with plan-reserved photos excluded from their pool.
  const precomputedAssignments = Object.entries(gallerySlotAssignments ?? {})
    .filter(([, entry]) => String(entry?.url ?? '').trim().length > 0);
  const precomputedKeys = new Set(precomputedAssignments.map(([key]) => key));
  const uncoveredQueue = precomputedKeys.size > 0
    ? fullProductionQueue.filter(
      (item) => !precomputedKeys.has(
        missionGallerySlotKey(item.ideaIndex, String(item.assignment.slot_role)),
      ),
    )
    // Always assign across the full manifest — factory drain may produce one slot per call.
    : fullProductionQueue;

  // Capacity-aware reroute: strict-subject slots with zero aligned gallery
  // photos switch to the format's fal_only pipeline instead of a guaranteed
  // gallery_theme_mismatch. Deterministic — plan and drain agree.
    const missionCapacityReroutes = missionId
    ? resolveQueueGalleryCapacityReroutes({
      productionLoop: fullProductionQueue,
      galleryMeta,
      galleryPhotos,
      hasRealBrandPhotos,
      resolvedBrandName,
      brandBusinessType,
    })
    : new Map<string, string>();
  if (missionCapacityReroutes.size > 0) {
    console.warn(
      `[auto-produce] gallery capacity reroute: ${missionCapacityReroutes.size} slot(s) → fal_only `
      + `(${[...missionCapacityReroutes.keys()].join(', ')})`,
    );
  }

  const missionGalleryJudgeRejects = new Map<string, string[]>();
  const missionGalleryAssignments = uncoveredQueue.length > 0
    ? await buildMissionGalleryAssignments({
      workspaceId,
      missionId,
      productionLoop: uncoveredQueue,
      galleryPhotos,
      galleryMeta,
      brandBusinessType,
      resolvedBrandName,
      hasGallery,
      hasRealBrandPhotos,
      brandDescription: String(brandCtx.description ?? ''),
      creativeBrief: creativeBrief ?? undefined,
      galleryUsage,
      preassignedUrls: precomputedAssignments.map(([, entry]) => String(entry.url)),
      judgeRejectedBySlot: missionGalleryJudgeRejects,
    })
    : new Map<string, import('@/lib/gallery-photo-matcher').PhotoMatchResult | null>();

  if (precomputedAssignments.length > 0) {
    for (const [key, entry] of precomputedAssignments) {
      missionGalleryAssignments.set(key, {
        url: String(entry.url),
        score: typeof entry.score === 'number' ? entry.score : MIN_ACCEPT_SCORE,
        reason: 'factory_batch_assign',
        confidence: 1,
      });
    }
    console.log(
      `[auto-produce] Factory gallery batch assign: `
      + `${precomputedAssignments.length} precomputed slot(s), `
      + `${uncoveredQueue.length} recomputed`,
    );
  }

  const missionSessionCaptions: string[] = [];
  /** Track Canva archetypes used by fal slots in this mission — prevents one layout dominating. */
  const missionFalArchetypesUsed: string[] = [];
  /** Recent + in-mission fal grid surfaces — prevents identical top color bands back-to-back. */
  const missionFalGridSurfacesUsed: FalGridSurfaceKind[] = missionId
    ? await fetchRecentFalGridSurfaces(workspaceId)
    : [];

  for (const queueItem of productionLoop) {
    // Mid-run circuit: a prior slot may have tripped fal/OpenAI billing.
    const liveProviderPreflight = getProductionProviderPreflight();
    if (!liveProviderPreflight.ok) {
      console.warn(
        `[auto-produce:${workspaceId}] stopping slot drain — ${liveProviderPreflight.code}`,
      );
      results.push({
        title: '(provider blocked)',
        imageUrl: '',
        error: `${liveProviderPreflight.code}: ${liveProviderPreflight.reason}`,
        slotKey: `${queueItem.ideaIndex}:provider_preflight`,
      });
      break;
    }

    const ideaCostBefore = costEstimate;
    const ideaIndex = queueItem.ideaIndex;
    const idea = queueItem.idea as ParsedIdea;
    const ideaRecord = queueItem.idea;
    let assignment = queueItem.assignment;
    assignment = {
      ...assignment,
      pipeline: normalizeProductionPipeline(assignment.pipeline),
    };
    // Catalog key format SSOT — repair fal_reel + *_story (day_pass_story) drift
    // before gallery match / fal bind.
    {
      const aligned = alignAssignmentToCatalogSlotKey(
        assignment,
        assignment.catalog_slot_key
          ?? (ideaRecord.catalog_slot_key as string | undefined),
      );
      if (
        aligned.pipeline !== assignment.pipeline
        || aligned.slot_role !== assignment.slot_role
      ) {
        console.log(
          `[auto-produce] catalog/pipeline realign: `
          + `${assignment.slot_role}/${assignment.pipeline} → ${aligned.slot_role}/${aligned.pipeline} `
          + `key=${aligned.catalog_slot_key ?? '-'}`,
        );
        assignment = aligned;
      }
    }

    // True I2V/video pipelines only when fal circuit is open.
    // fal_story is a grounded GPT-image story poster (no Kling) — keep producing.
    {
      if (
        isVideoPipeline(assignment.pipeline)
        && liveProviderPreflight.providers.falCircuitOpen
      ) {
        const slotKey = `${ideaIndex}:${assignment.slot_role}`;
        console.warn(
          `[auto-produce] [skip-no-fal-quota] ${slotKey} — fal billing circuit open`,
        );
        results.push({
          title: resolveIdeationHeadline(idea as Record<string, unknown>) || '(fal skipped)',
          imageUrl: '',
          error: 'provider_billing_circuit_open [skip-no-fal-quota]',
          slotKey,
        });
        continue;
      }
    }
    const resolvedIdeaIndex = typeof ideaRecord.idea_index === 'number'
      ? ideaRecord.idea_index
      : ideaIndex;
    const ideaId = missionId ? `${missionId}-${resolvedIdeaIndex}` : randomUUID();
    let caption = getField(idea, 'caption_draft', 'caption');
    const originalIdeationCaption = caption;
    const rawPlanningHeadline = resolveIdeationHeadline(idea as Record<string, unknown>);
    const rawOverlayHeadline = resolveIdeationOverlayHeadline(idea as Record<string, unknown>);
    const calendarTagline = resolveIdeationTagline(idea as Record<string, unknown>);
    const isCalendarIdeaForHeadline = isCalendarProductionIdea(ideaRecord);
    // IdeaFeedBind is the single publishability SSOT for this slot — the batch
    // gallery orchestrator resolves the same bind, so photo↔paint cannot drift.
    const ideaFeedBind = resolveIdeaFeedBind(ideaRecord, {
      brandName: resolvedBrandName,
      catalogSlotKey: assignment.catalog_slot_key,
    });
    // Publishable Hub/calendar tagline is canvas SSOT even when enrichment
    // forgot calendar_* flags (matched plan still carries root `tagline`).
    const calendarTaglinePublishable = ideaFeedBind.taglinePublishable;
    const isFalDesignedPostSlotForHeadline =
      isFalDesignPipeline(assignment.pipeline)
      || assignment.slot_role === 'designed_post'
      || assignment.slot_role === 'designed_typography'
      || assignment.slot_role === 'fal_designed_post';
    // Designed slots + content_calendar: seed from overlay/tagline (quoted Hub line).
    // Hub planning title (event_name) stays for metadata via resolveIdeationHeadline.
    const rawIdeationHeadline = (isFalDesignedPostSlotForHeadline || isCalendarIdeaForHeadline)
      ? (rawOverlayHeadline || rawPlanningHeadline)
      : rawPlanningHeadline;
    let ideationHeadline = rawIdeationHeadline;
    let headline = rawIdeationHeadline;

    const isTypographyDesignSlot = assignment.slot_role === 'designed_typography';
    let slotVisualDesignCard: MissionVisualDesignCard | null = null;
    let slotVisualDesignCardIndex: number | null = null;
    // Library catalog pin = template layout + mission copy SSOT.
    // Mission visual_design_cards must not override on-canvas headline/layout.
    const libraryCatalogPinned = Boolean(
      String(
        assignment.catalog_slot_key
        ?? (ideaRecord.catalog_slot_key as string | undefined)
        ?? '',
      ).trim(),
    );
    // Calendar tagline is canvas SSOT — never let visual_design_cards replace it.
    if (
      isFalDesignedPostSlotForHeadline
      && visualDesignCards.length
      && !libraryCatalogPinned
      && !calendarTaglinePublishable
    ) {
      const chosen = pickMissionVisualDesignCard({
        cards: visualDesignCards,
        idea: ideaRecord,
        usedIndices: usedVisualDesignCardIndices,
        designedPostOrdinal,
      });
      if (chosen) {
        slotVisualDesignCard = chosen.card;
        slotVisualDesignCardIndex = chosen.index;
        usedVisualDesignCardIndices.add(chosen.index);
        designedPostOrdinal += 1;
      }
    }
    const vdcHeadline = String(
      slotVisualDesignCard?.headline ?? slotVisualDesignCard?.concept_title ?? '',
    ).trim();
    const agentOverlayLooksPublishable = Boolean(
      rawOverlayHeadline
      && !isMeaninglessBrandEchoHeadline(rawOverlayHeadline, resolvedBrandName)
      && !isLabelStyleHeadline(rawOverlayHeadline)
      && !isIncompleteOverlayPhrase(rawOverlayHeadline),
    );
    /** Design-card overlay only when agent idea copy is weak/missing. */
    let visualDesignCardOverlayApplied = Boolean(
      isFalDesignedPostSlotForHeadline
      && !calendarTaglinePublishable
      && vdcHeadline
      && isUsableVisualDesignCardHeadline(vdcHeadline, resolvedBrandName)
      && !agentOverlayLooksPublishable,
    );

    if (calendarTaglinePublishable) {
      ideationHeadline = enforceDisplayHeadline(calendarTagline, 72);
      headline = ideationHeadline;
      visualDesignCardOverlayApplied = false;
      console.log(
        `[auto-produce] content_calendar tagline → overlay: "${headline.slice(0, 48)}"`,
      );
    } else if (
      !rawIdeationHeadline
      || isMeaninglessBrandEchoHeadline(rawIdeationHeadline, resolvedBrandName)
      || isLabelStyleHeadline(rawIdeationHeadline)
      || isIncompleteOverlayPhrase(rawIdeationHeadline)
    ) {
      const headlineFix = resolveMeaningfulProductionHeadline({
        headline: rawIdeationHeadline,
        caption,
        brandName: resolvedBrandName,
        conceptTitle: getField(idea, 'concept_title', 'idea_title', 'title'),
        visualDesignHeadline: vdcHeadline || undefined,
        businessType: brandBusinessType,
        language: brandLanguageCode,
        maxLen: 72,
      });
      if (headlineFix.replaced) {
        console.warn(
          `[auto-produce] headline QA (${headlineFix.reason}): "${rawIdeationHeadline.slice(0, 48)}" → "${headlineFix.headline}"`,
        );
      }
      headline = headlineFix.headline;
      ideationHeadline = headline;
      if (headlineFix.reason === 'visual_design_card' || headlineFix.reason === 'label_visual_design_card') {
        visualDesignCardOverlayApplied = true;
      }
    } else {
      ideationHeadline = enforceDisplayHeadline(rawIdeationHeadline, 72);
      headline = ideationHeadline;
    }
    // Designed slots: card headline fills in only when agent overlay was not publishable.
    if (visualDesignCardOverlayApplied && vdcHeadline && !calendarTaglinePublishable) {
      const cardOverlay = enforceDisplayHeadline(vdcHeadline, 72);
      if (cardOverlay) {
        headline = cardOverlay;
        console.log(
          `[auto-produce] visual design card headline → overlay: "${cardOverlay.slice(0, 48)}"`,
        );
      }
    }
    /** Ideation marketing hook — preserved for feed metadata; never overwritten by gallery vision. */
    const storedIdeationHeadline = (rawOverlayHeadline || rawPlanningHeadline)
      ? enforceDisplayHeadline(rawOverlayHeadline || rawPlanningHeadline, 72)
      : headline;
    /**
     * Gallery scorer must use the canvas punchline when Hub/tagline is locked —
     * otherwise photo locks to concept title while paint uses tagline.
     * IdeaFeedBind SSOT matches gallery-orchestrator batch.
     */
    let galleryMatchHeadline = ideaFeedBind.galleryMatchHeadline
      || (calendarTaglinePublishable
        ? (ideationHeadline || storedIdeationHeadline)
        : (storedIdeationHeadline || ideationHeadline));

    // Feed Art Director's visual_subject_hint overrides generic caption for gallery matching.
    // Append the hint keywords to ideationCaption so the gallery scorer sees specific
    // service terms (e.g. "tırnak, manikür, nail art") as primary selection signals.
    const fdVisualHint = (assignment?.visual_subject_hint ?? '').trim();
    const isCalendarSlot = isCalendarProductionIdea(ideaRecord);
    let ideationCaption = isCalendarSlot
      ? (ideaFeedBind.galleryMatchCaption || calendarGalleryMatchCaption(ideaRecord))
      : fdVisualHint
        ? `${caption} ${fdVisualHint}`.trim()
        : caption;
    // BCD scene_hint enriches gallery matching so the photo picker understands
    // the actual visual scene (e.g. "moonlit beach party, DJ, crowd dancing")
    // rather than just the headline text.
    if (adHocBrief && (idea as ParsedIdea).scene_hint) {
      ideationCaption = `${ideationCaption} ${String((idea as ParsedIdea).scene_hint).slice(0, 200)}`.trim();
    }
    // Brief-aware scene hint for fal-only / fal-designed prompts: combines the Feed
    // Art Director's specific subject keywords with the mission visual brief so the
    // AI-generated background reflects the post's topic instead of a generic gradient.
    let falSceneHint = isCalendarProductionIdea(ideaRecord)
      ? buildCalendarFalSceneHint(ideaRecord)
      : adHocBrief
        ? [String(idea.scene_hint ?? idea.visual_direction ?? '').trim(), fdVisualHint].filter(Boolean).join(' — ').slice(0, 260)
        : [fdVisualHint, String(idea.visual_direction ?? '').trim(), missionVisualBrief]
          .map((s) => (s ?? '').trim())
          .filter(Boolean)
          .join(' — ')
          .slice(0, 160);
    const reelSupport = (assignment.reel_supporting_subjects ?? [])
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 3);
    if (reelSupport.length > 0 && String(assignment.pipeline ?? '').includes('reel')) {
      falSceneHint = [
        falSceneHint,
        `Multi-beat gallery storyboard (curated): ${reelSupport.join(' → ')}`,
      ].filter(Boolean).join(' — ').slice(0, 280);
    }
    // Canonical product subject from ideation (AI-produced, language-neutral) —
    // SSOT for caption↔photo matching; keyword dictionary is only a fallback.
    let ideationSubjectKey = String(
      ideaRecord.subject_key ?? ideaRecord.subjectKey ?? '',
    ).trim() || undefined;
    const alignedGallerySubjectKey = resolveGalleryMatchSubjectKey({
      caption: ideationCaption,
      headline: galleryMatchHeadline,
      subjectKey: ideationSubjectKey,
    });
    if (alignedGallerySubjectKey && alignedGallerySubjectKey !== ideationSubjectKey) {
      console.warn(
        `[auto-produce] gallery subject_key aligned: "${ideationSubjectKey ?? '—'}" → "${alignedGallerySubjectKey}"`,
      );
      ideationSubjectKey = alignedGallerySubjectKey;
    }
    activeGallerySubjectKey = ideationSubjectKey;
    let hashtags = normalizeHashtags(idea.hashtags);
    const brandLangInput = normalizeBrandLanguagesInput(
      brandCtx.languages ?? brandCtx.inferred_language,
    );
    let cta = getField(idea, 'cta', 'call_to_action');
    if (!cta.trim()) {
      cta = pickLocalizedCta(brandCtx.default_ctas, brandLangInput);
    } else {
      const harmonized = harmonizeCaptionAndCta(caption, cta, brandLangInput);
      caption = harmonized.caption || caption;
      cta = harmonized.cta;
    }

    // Caption QA — reject truncated ideation fragments ("Kartta yeni gelen") for publish + fal overlay.
    if (caption.trim()) {
      const sentences = caption.split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean);
      const goodSentences = sentences.filter(
        (s) => s.length >= 12 && !isIncompleteOverlayPhrase(s) && !isInternalStrategyBriefing(s),
      );
      if (goodSentences.length > 0 && goodSentences.length < sentences.length) {
        caption = goodSentences.join('. ').trim();
        console.warn(
          `[auto-produce] caption QA: dropped ${sentences.length - goodSentences.length} incomplete fragment(s)`,
        );
      } else if (
        sentences.length === 1
        && isIncompleteOverlayPhrase(sentences[0]!)
      ) {
        const conceptTitle = getField(idea, 'concept_title', 'idea_title', 'title').trim();
        if (conceptTitle && !isIncompleteOverlayPhrase(conceptTitle)) {
          const waitLine = brandLanguageCode === 'en'
            ? `${resolvedBrandName} is waiting for you.`
            : `${resolvedBrandName}'de sizi bekliyoruz.`;
          caption = cta
            ? `${conceptTitle}. ${cta}`
            : `${conceptTitle}. ${waitLine}`;
          console.warn(
            `[auto-produce] caption QA: replaced incomplete fragment with concept title`,
          );
        }
      }
    }

    const pkgFmt = detectIdeaPackageFormat(ideaRecord);
    const usesManifestQueue = Boolean(missionId && fullProductionQueue.length > 0) || adHocBrief;
    assignment = usesManifestQueue
      ? queueItem.assignment
      : (() => {
        const postIndex = pkgFmt === 'post' || pkgFmt === 'carousel' ? slotPostCount : 0;
        const storyIndexForResolve = pkgFmt === 'story' ? slotStoryCount : 0;
        const reelIndex = pkgFmt === 'reel' ? slotReelCount : 0;
        return resolveProductionAssignment({
          ideaIndex,
          idea: ideaRecord,
          report: feedDirectorReport ?? null,
          missionId: missionId || '',
          postIndex,
          storyIndex: storyIndexForResolve,
          reelIndex,
          sector: brandBusinessType,
          adHocBrief,
        });
      })();
    // Zero gallery capacity for this slot's strict subject → produce an AI
    // visual instead of failing permanently. Slot role (job key) is preserved.
    const capacityReroutePipeline = missionCapacityReroutes.get(
      missionGallerySlotKey(ideaIndex, String(assignment.slot_role)),
    );
    if (capacityReroutePipeline) {
      console.warn(
        `[auto-produce] capacity reroute ${ideaIndex}:${assignment.slot_role}: `
        + `${assignment.pipeline} → ${capacityReroutePipeline} (subject "${ideationSubjectKey ?? '—'}" not in gallery)`,
      );
      assignment = {
        ...assignment,
        pipeline: capacityReroutePipeline as typeof assignment.pipeline,
      };
    }
    // New Brief: kullanıcı story seçtiyse fal_reel pipeline olsa da feed'de story olarak etiketle.
    const kind = adHocBrief && pkgFmt === 'story'
      ? 'instagram_story'
      : adHocBrief && pkgFmt === 'reel'
        ? 'instagram_reel'
        : resolveContentKindForAssignment(ideaRecord, assignment);

    // Fal / designed slots: on-canvas text from canva_field_copy or caption — never signal labels.
    const usesFalDesignCopy =
      isFalDesignedPostSlotForHeadline
      || isFalVideoPipeline(assignment.pipeline)
      || isFalDesignPipeline(assignment.pipeline)
      || isFalOnlyVideoPipeline(assignment.pipeline)
      || isFalOnlyPostPipeline(assignment.pipeline);
    /** When set, calendar event overlay must not demote punchline → event title. */
    let lockedFalPunchlineSource: string | null = null;
    // Content calendar quoted tagline = canvas punchline lock for the whole slot.
    if (calendarTaglinePublishable) {
      lockedFalPunchlineSource = 'mission_tagline';
    }
    if (usesFalDesignCopy && (caption.trim().length >= 16 || calendarTaglinePublishable)) {
      const falChannel =
        kind === 'instagram_reel' ? 'reel'
          : (kind === 'instagram_story' || kind === 'instagram_canvas') ? 'story'
            : 'feed_post';
      // Card overlay wins over caption-derived fal design copy (avoids brief truncations).
      // Calendar tagline lock skips VDC — punchline stays the quoted Hub line.
      if (visualDesignCardOverlayApplied && vdcHeadline && !calendarTaglinePublishable) {
        const cardOverlay = enforceDisplayHeadline(vdcHeadline, falChannel === 'reel' ? 22 : falChannel === 'story' ? 28 : 32);
        if (cardOverlay) {
          headline = cardOverlay;
        }
        const cardSub = String(
          slotVisualDesignCard?.subline ?? slotVisualDesignCard?.cta_text ?? '',
        ).trim();
        if (cardSub) {
          cta = cardSub.slice(0, 48);
        }
      } else {
        const themeIntensity = (
          brandTheme as { fal_design_intensity?: { post?: string; story?: string; reel?: string } } | null
        )?.fal_design_intensity?.[
          falChannel === 'reel' ? 'reel' : falChannel === 'story' ? 'story' : 'post'
        ] ?? null;
        const falDesignLibrarySlot = assignment.library_slot_key
          ? getLibrarySlotByKey(templateLibrary, assignment.library_slot_key)
          : undefined;
        // Soft early budget from slot sample; fal-designed-post refits to matched template sample.
        const falSlotSample = resolveSlotSampleCopy({
          catalogSlotKey: assignment.catalog_slot_key ?? assignment.library_slot_key,
          showSubline: falDesignLibrarySlot?.showSubline,
          sector: brandBusinessType,
        });
        const designCopy = resolveMissionFalDesignCopy({
          idea: idea as FalDesignCopyIdea,
          ideationHeadline: headline,
          caption,
          cta,
          brandName: resolvedBrandName,
          channel: falChannel,
          businessType: brandBusinessType,
          brandTone: String(brandCtx.brand_tone ?? ''),
          language: brandLanguageCode,
          designIntensity: themeIntensity,
          sampleHeadline: falSlotSample.headline,
          sampleSubtitle: falSlotSample.subtitle,
          showSubline: falDesignLibrarySlot?.showSubline,
        });
        if (designCopy.headline) {
          // Calendar / Hub quoted tagline already locked on `headline`.
          // Never demote to caption clamps / catalog samples when fal-design-copy
          // falls through to a non-punchline source.
          if (
            calendarTaglinePublishable
            && !shouldPreserveLockedPunchlineHeadline(designCopy.source)
          ) {
            console.log(
              `[auto-produce] keep calendar tagline — reject fal design copy `
              + `(${designCopy.source}): "${designCopy.headline.slice(0, 36)}"`,
            );
          } else {
            if (designCopy.headline !== headline) {
              console.log(
                `[auto-produce] fal design copy (${designCopy.source}): `
                + `"${headline.slice(0, 36)}" → "${designCopy.headline.slice(0, 36)}"`,
              );
            }
            headline = designCopy.headline;
            if (shouldPreserveLockedPunchlineHeadline(designCopy.source)) {
              lockedFalPunchlineSource = designCopy.source;
            }
          }
        }
        // Belt: even when source=mission_tagline, never keep a type-budget stem —
        // paint the Hub quote (soft-clamped ≤48) so designs match the plan card.
        if (calendarTaglinePublishable && calendarTagline) {
          // Bind already proved the quote is renderable, so this never falls back
          // to an unclamped line that the image model cannot spell.
          const hubLine =
            clampMissionTaglineForCanvas(calendarTagline, falChannel)
            || ideaFeedBind.canvasTagline;
          if (hubLine && hubLine !== headline) {
            console.log(
              `[auto-produce] restore Hub calendar tagline: `
              + `"${headline.slice(0, 36)}" → "${hubLine.slice(0, 36)}"`,
            );
          }
          if (hubLine) {
            headline = hubLine;
            lockedFalPunchlineSource = 'mission_tagline';
          }
        }
        const gatedSub = resolveSlotSublineForRender(designCopy.subtitle, {
          librarySlot: falDesignLibrarySlot,
        });
        if (gatedSub) {
          cta = gatedSub;
        } else if (designCopy.subtitle?.trim()) {
          // Slot/template closed subline — drop support line entirely.
          cta = '';
        }
      }
      // Photo match text follows the locked canvas punchline (not concept title).
      if (shouldPreserveLockedPunchlineHeadline(lockedFalPunchlineSource) && headline.trim()) {
        galleryMatchHeadline = headline;
      }
    }

    const storyIndex = assignmentImpliesStoryFormat(assignment.slot_role) ? slotStoryCount : 0;
    const hasPremiumComposition = Boolean(
      (idea.visual_production_spec as Record<string, unknown> | undefined)?.premium_composition,
    );
    const galleryOnlyVisual = !hasPremiumComposition
      && !productionProfile.requireDesignedVisuals
      && isGalleryOnlyVisualPolicy(assignment, ideaRecord);
    const slotRole = String(assignment.slot_role);
    const slotPipeline = String(assignment.pipeline);
    const isPaidAdSlot =
      isPaidAdProductionSlot(assignment)
      || slotRole === 'paid_ad_creative'
      || slotRole === 'paid_ad_google_creative'
      || slotPipeline === 'meta_ad'
      || slotPipeline === 'google_ad';
    const adPublishChannel = isPaidAdSlot ? resolveAdChannelFromAssignment(assignment) : null;
    const slotRoleFmt = assignment.slot_role === 'organic_carousel'
      ? 'carousel'
      : assignmentImpliesStoryFormat(assignment.slot_role)
        ? 'story'
        : assignmentImpliesReel(assignment.slot_role)
          ? 'reel'
          : (pkgFmt === 'carousel' ? 'carousel' : pkgFmt);
    if (slotRoleFmt === 'post' || slotRoleFmt === 'carousel') slotPostCount += 1;
    else if (slotRoleFmt === 'story') slotStoryCount += 1;
    else if (slotRoleFmt === 'reel') slotReelCount += 1;

    const slotKey = `${ideaIndex}:${String(assignment.slot_role)}`;
    let slotCostArtifactId: string | null = null;
    let slotCostIdeaUsd = 0;
    let slotCostPipeline = '';
    try {
    beginFalRequestSlot();
    const ideaDedupeKey = buildIdeaProductionDedupeKey(
      missionId,
      idea as Record<string, unknown>,
      ideaIndex,
      assignment.slot_role,
    );
    if (missionId && existingArtifactKeys.has(ideaDedupeKey)) {
      console.warn(
        `[auto-produce] skip duplicate idea ${ideaIndex} "${headline.slice(0, 40)}" (already in Feed)`,
      );
      results.push({ title: headline, imageUrl: '', error: 'duplicate_skipped', slotKey });
      continue;
    }

    const postType = kindToPostType(kind);
    let galleryEscalatedToFalOnly = false;
    const fmt = kind.replace('instagram_', '');
    const mood = String(idea.mood ?? idea.photo_mood ?? '').trim();
    const strategicPurpose = idea.strategic_purpose || '';
    const visualDirectionForMatch = String(idea.visual_direction ?? '').trim()
      || String(
        (idea.visual_production_spec as { scene_hint?: string } | undefined)?.scene_hint ?? '',
      ).trim()
      || undefined;
    const slotCatalogKey = String(
      assignment.catalog_slot_key
        ?? (ideaRecord.catalog_slot_key as string | undefined)
        ?? '',
    ).trim();
    activeGalleryMatchExtras = {
      ...(visualDirectionForMatch ? { visualDirection: visualDirectionForMatch } : {}),
      ...(String(strategicPurpose).trim()
        ? { strategicPurpose: String(strategicPurpose).trim() }
        : {}),
      ...(slotCatalogKey ? { catalogSlotKey: slotCatalogKey } : {}),
      sectorId: brandBusinessType,
    };
    const ideaPremiumComposition = extractPremiumComposition(idea);
    let treatmentLower = ((idea.treatment ?? idea.visual_production_spec?.treatment) || '').toLowerCase();
    if (ideaPremiumComposition && treatmentLower === 'pure_photo') {
      treatmentLower = kind === 'instagram_story' ? 'story_event' : 'feed_text_overlay';
      console.log(
        `[auto-produce] Premium composition: overriding pure_photo → ${treatmentLower} for "${String(idea.headline || idea.concept_title || '').slice(0, 40)}"`,
      );
    }
    const templateUseCase = String(idea.template_use_case || '');
    const typeExclude = getExcludeUrlsForPostType(galleryUsage, postType, batchUsedByType[postType]);
    const missionGalleryExclude = getMissionWideExcludeUrls(
      galleryUsage,
      batchUsedByType,
      batchUsedGalleryMission,
    );

    let preassignedGalleryUrl: string | null = null;
    let galleryFirstSource: GalleryFirstCaptionSource | null = null;
    let galleryMatchScoreEarly: number | null = null;

    if (shouldUseGalleryFirstMission({
      missionId,
      hasGallery,
      hasRealBrandPhotos,
      slotBackfillPass,
      assignment,
    })) {
      const gallerySlotKey = missionGallerySlotKey(ideaIndex, String(assignment.slot_role));
      const batchAssignedPhoto = missionGalleryAssignments.get(gallerySlotKey)?.url ?? null;
      const gf = await resolveGalleryFirstForSlot({
        assignment,
        storyIndex,
        galleryPhotos,
        galleryMeta,
        excludeUrls: missionGalleryExclude,
        brandName: resolvedBrandName,
        brandLocation,
        brandDescription: String(brandCtx.description ?? ''),
        businessType: brandBusinessType,
        visualSubjectHint: fdVisualHint,
        creativeBrief: creativeBrief ?? undefined,
        ideationCaption,
        ideationHeadline: galleryMatchHeadline,
        subjectKey: ideationSubjectKey,
        mood,
        visualDirection: visualDirectionForMatch,
        strategicPurpose: String(strategicPurpose || '').trim() || undefined,
        existingCaptions: missionSessionCaptions,
        slotBackfillPass,
        ideaIndex,
        forceRewrite: Boolean(slotBackfillPass),
        forcedPhotoUrl: batchAssignedPhoto,
      });
      if (gf?.applied) {
        preassignedGalleryUrl = gf.photoUrl;
        galleryFirstSource = gf.source;
        galleryMatchScoreEarly = gf.matchScore;
        if (gf.caption.trim()) {
          if (!originalIdeationCaption.trim()) {
            caption = gf.caption;
          }
          missionSessionCaptions.push(gf.caption);
        }
        if (gf.headline.trim()) {
          if (!hasPublishableIdeationHeadline(storedIdeationHeadline, resolvedBrandName)) {
            headline = sanitizeProductionHeadline({
              headline: gf.headline,
              ideationHeadline: storedIdeationHeadline,
              caption: ideationCaption || caption,
              brandName: resolvedBrandName,
              conceptTitle: String(idea.concept_title ?? idea.idea_title ?? ''),
              businessType: brandBusinessType,
              language: brandLanguageCode,
              maxLen: 72,
            });
          }
        }
        if (gf.hashtags.length) {
          hashtags = gf.hashtags;
        }
        console.log(
          `[auto-produce] gallery-first ${gf.source} slot ${assignment.slot_role}: ` +
          `"${headline.slice(0, 48)}" (score ${gf.matchScore ?? '—'})`,
        );
      }
    }

    if (!caption && !headline && !preassignedGalleryUrl) {
      results.push({ title: '(empty idea)', imageUrl: '', error: 'No caption or headline', slotKey });
      continue;
    }

    if (shouldSkipIdeaForProduction(resolvedIdeaIndex, feedDirectorReport ?? null, {
      missionProduction: Boolean(missionId),
    })) {
      console.warn(`[auto-produce] Feed Art Director skip (error flag): idea ${resolvedIdeaIndex} "${headline.slice(0, 40)}"`);
      results.push({ title: headline, imageUrl: '', error: 'Feed Art Director flagged (error)', slotKey });
      continue;
    }

    const prodIdea = productionIdeas[ideaIndex]
      ?? productionIdeaFromRecord(ideaRecord as Record<string, unknown>, ideaIndex, missionId);
    const agentUrlEarly =
      prodIdea.visualProductionSpec.selectedGalleryUrl
      ?? idea.visual_production_spec?.selected_gallery_url
      ?? idea.selected_gallery_url
      ?? null;
    const pisRenderer = resolveProductionRenderer(assignment.pipeline, prodIdea);
    const pisGalleryUrl =
      (typeof agentUrlEarly === 'string' && isUsableGalleryPhotoUrl(agentUrlEarly) ? agentUrlEarly : null)
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
    const pisMinScore = missionId ? 70 : PIS_PRODUCTION_MIN_SCORE;
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
      // Mission Hub: produce despite low PIS — content can be reviewed/rejected after.
      // Non-mission: skip low-quality prompts to avoid wasted API calls on standalone runs.
      if (!missionId) {
        results.push({
          title: headline,
          imageUrl: '',
          error: `PIS ${pisGate.score}% — eksik: ${pisGate.missing.slice(0, 3).join(', ')}`,
          slotKey,
        });
        continue;
      }
    }
    pisScores.push(pisGate.score);

    const layoutFamilyCandidates = (((feedDirectorReport as any)?.recommended_layout_families ?? []) as unknown[])
      .filter((f): f is StoryLayoutFamily => typeof f === 'string');
    // Sprint 4 — Mission Originality: prefer unused layout families first.
    // Fresh families come first so the resolver picks them as primary candidates.
    // Already-used families are appended as fallback (resolver may still pick them
    // if the fresh list is incompatible with the slot's template requirements).
    const freshFamilies = layoutFamilyCandidates.filter((f) => !missionUsedLayoutFamilies.includes(f));
    const originallySortedCandidates = freshFamilies.length > 0
      ? [...freshFamilies, ...layoutFamilyCandidates.filter((f) => !freshFamilies.includes(f))]
      : layoutFamilyCandidates;

    const layoutFamilyHint = resolveLayoutFamilyForAssignment(
      stackCtx,
      assignment,
      originallySortedCandidates,
    );
    // Track used layout families for subsequent slots in the same mission.
    if (layoutFamilyHint) missionUsedLayoutFamilies.push(layoutFamilyHint);

    const isHeroReel = shouldProduceHeroReelForIdea(ideaIndex, kind, stackCtx, {
      reelsProducedInMission: heroReelsProducedInMission,
      maxReelsPerMission: maxHeroReelsPerMission,
      slotRole: assignment.slot_role,
      hasOrganicReelAssignment,
    });
    // Scene Director LLM — once per mission when any slot needs it (not per idea).
    let sceneBrief: ProductSceneBrief | null = null;
    if (slotNeedsSceneBrief({
      visualStandard: aiVisualStandard,
      contentKind: kind,
      assignment,
      galleryOnlyVisual,
      isHeroReel,
      willStoryOverlay: false,
      designedPosterSync: false,
    })) {
      // Retry when previous fetch failed (null) and this is a high-value visual slot.
      const isImportantVisualSlot = isHeroReel;
      if (missionSceneBrief === undefined || (missionSceneBrief === null && isImportantVisualSlot)) {
        const missionCaption = [
          missionVisualBrief ? `Mission: ${missionVisualBrief}` : '',
          missionTitle ? `Title: ${missionTitle}` : '',
          headline ? `Headline: ${headline}` : '',
          caption ? `Caption: ${caption}` : '',
        ].filter(Boolean).join('\n');
        missionSceneBrief = await fetchProductSceneBrief({
          workspaceId,
          missionId: missionId || undefined,
          caption: missionCaption.slice(0, 1000) || headline || caption,
          productType: idea.product_type || idea.subject || '',
          sector: brandBusinessType,
          mood,
          enhanceLevel: aiPhotoEnhanceLevel,
          visualSubject: resolvedVisualSubject as 'venue_ambiance' | 'product_hero' | undefined,
        });
        if (missionSceneBrief) {
          console.log(`[auto-produce] Mission scene brief fetched (shared across enhance/reel slots)`);
          // Sprint 4 — Brief Split: derive format-specific briefs once the base is ready.
          if (missionStoryBrief === undefined) {
            missionStoryBrief = toStorySceneBrief(missionSceneBrief, {
              colorGrade: (() => {
            const g = getSectorColorGrade(brandBusinessType);
            // toStorySceneBrief accepts 4 values; map dark_moody → neutral
            return (g === 'dark_moody' ? 'neutral' : g) as 'warm' | 'cool' | 'vibrant' | 'neutral';
          })(),
              narrativeArc: 'tease_reveal_convert',
            });
          }
          if (missionReelBrief === undefined) {
            missionReelBrief = toReelSceneBrief(missionSceneBrief, {
              mood,
              sector: brandBusinessType,
            });
          }
        } else if (isImportantVisualSlot) {
          console.warn(`[auto-produce] Scene brief fetch failed for important slot (${assignment.slot_role}) — proceeding without`);
        }
      }
      sceneBrief = missionSceneBrief ?? null;
    }
    sceneBriefCache.set(ideaIndex, sceneBrief);
    const creativeTrace = buildCreativeTrace(stackCtx, {
      ideaIndex,
      layoutFamilyHint,
      sceneBrief,
      isHeroReel,
    });

    // ── Step 1: find best gallery reference photo (per post type) ─────
    let referenceUrl: string | null = null;
    let captionDrivenGenerated = false;
    /** Last idea/brief-driven scratch brief (telemetry when captionDrivenGenerated). */
    let lastScratchBrief: ScratchVisualBrief | null = null;
    let lastScratchBriefSources: string[] = [];
    let carouselGalleryUrls: string[] = [];
    let enhancedGallerySet: string[] = [];
    let galleryMatchScore: number | null = galleryMatchScoreEarly;

    const runScratchVibeImage = async (extra?: {
      referenceImageUrls?: string[];
      referenceImageUrl?: string;
      captionDrivenMode?: boolean;
    }): Promise<string | null> => {
      const result = await generateScratchVibeImage({
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
        lutDirective: brandLutDirective || undefined,
        antiPatterns: brandAntiPatterns.length ? brandAntiPatterns : undefined,
        idea: idea as unknown as Record<string, unknown>,
        mood,
        assignment: {
          slot_role: assignment.slot_role,
          pipeline: assignment.pipeline,
          catalog_slot_key: assignment.catalog_slot_key,
          visual_subject_hint: assignment.visual_subject_hint,
          fal_design_hint: assignment.fal_design_hint,
        },
        missionBrief: missionVisualBrief,
        ...extra,
      });
      if (result.imageUrl) {
        lastScratchBrief = result.brief;
        lastScratchBriefSources = [...result.brief.sources];
      }
      return result.imageUrl;
    };

    const attachedPhotoUrls = Array.isArray(idea.attached_photo_urls)
      ? idea.attached_photo_urls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
      : [];
    const forceAttachedPhotos = Boolean(adHocBrief && idea.force_attached_photos && attachedPhotoUrls.length > 0);

    const agentUrl = idea.visual_production_spec?.selected_gallery_url || idea.selected_gallery_url || null;
    let agentIdeationGalleryLock = false;
    const batchExclude = batchUsedByType[postType];
    const usesFalDesignerTrackEarly =
      isFalVideoPipeline(assignment.pipeline)
      || isFalDesignPipeline(assignment.pipeline)
      || isFalOnlyVideoPipeline(assignment.pipeline)
      || isFalOnlyPostPipeline(assignment.pipeline);
    /** Brand Hub → Sıfırdan görsel üret: galeri olsa bile feed postlarında matcher atlanır. */
    const captionDrivenSlot = shouldUseCaptionDrivenVisual(aiVisualStandard, kind, assignment);

    // New Brief user uploads — always lock to attached photos, never repick from gallery
    if (forceAttachedPhotos) {
      referenceUrl = attachedPhotoUrls[ideaIndex % attachedPhotoUrls.length] ?? attachedPhotoUrls[0] ?? null;
      if (referenceUrl) {
        console.log(
          `[auto-produce] user-attached photo locked (${attachedPhotoUrls.length} total): "${headline.slice(0, 50)}" → ${referenceUrl.split('/').pop()?.slice(0, 40)}`,
        );
      }
    }

    // Ideasyon selected_gallery_url — validate semantic score before override (multi-tenant).
    if (!referenceUrl && typeof agentUrl === 'string' && isUsableGalleryPhotoUrl(agentUrl) && hasGallery) {
      const ideationPick = resolveBestGalleryUrl(
        {
          caption: ideationCaption,
          headline: galleryMatchHeadline,
          mood,
          contentType: postType,
          businessType: brandBusinessType,
          subjectKey: ideationSubjectKey,
          globalUsageCounts: globalGalleryUsageCounts,
          ...activeGalleryMatchExtras,
        },
        galleryPhotos,
        galleryMeta,
        agentUrl,
        { excludeUrls: missionGalleryExclude, tieBreakSeed: ideaIndex },
      );
      if (ideationPick) {
        referenceUrl = ideationPick.url;
        galleryMatchScore = ideationPick.score;
        if (
          typeof agentUrl === 'string'
          && normalizeGalleryUrl(ideationPick.url) === normalizeGalleryUrl(agentUrl)
        ) {
          agentIdeationGalleryLock = true;
        }
        console.log(
          `[auto-produce] ideation gallery pick score=${ideationPick.score}: "${headline.slice(0, 50)}"`,
        );
      } else if (typeof agentUrl === 'string') {
        const pooledAgentUrl = resolveUrlInPool(agentUrl, galleryPhotos);
        if (pooledAgentUrl) {
          const agentMatchInput = {
            caption: ideationCaption,
            headline: galleryMatchHeadline,
            mood,
            contentType: postType,
            businessType: brandBusinessType,
            subjectKey: ideationSubjectKey,
            globalUsageCounts: globalGalleryUsageCounts,
            ...activeGalleryMatchExtras,
          };
          const agentMeta = galleryMeta[normalizeGalleryUrl(pooledAgentUrl)]
            ?? Object.entries(galleryMeta).find(
              ([k]) => normalizeGalleryUrl(k) === normalizeGalleryUrl(pooledAgentUrl),
            )?.[1];
          // Never hard-lock an agent URL that fails the theme/subject gate —
          // let later pick paths find a subject-aligned photo instead.
          if (!isHardGalleryThemeMismatch(agentMatchInput, agentMeta, pooledAgentUrl)) {
            const agentRank = matchPhotoToContent(
              agentMatchInput,
              [pooledAgentUrl],
              galleryMeta,
              { excludeUrls: missionGalleryExclude, minScore: 0, tieBreakSeed: ideaIndex },
            );
            if (agentRank && agentRank.score >= MIN_ACCEPT_SCORE) {
              referenceUrl = pooledAgentUrl;
              galleryMatchScore = agentRank.score;
              agentIdeationGalleryLock = true;
              console.log(
                `[auto-produce] ideation gallery lock (agent URL in pool) score=${galleryMatchScore}: "${headline.slice(0, 50)}"`,
              );
            }
          } else {
            console.warn(
              `[auto-produce] ideation agent URL hard theme mismatch — ignore lock: "${headline.slice(0, 50)}"`,
            );
          }
        }
      }
    }

    if (!referenceUrl && preassignedGalleryUrl && !captionDrivenSlot && !forceAttachedPhotos) {
      referenceUrl = preassignedGalleryUrl;
      console.log(
        `[auto-produce] gallery-first photo: "${headline.slice(0, 48)}" → ${preassignedGalleryUrl.slice(0, 72)}`,
      );
    }

    if (
      captionDrivenSlot
      && !referenceUrl
      && !forceAttachedPhotos
      && !(hasRealBrandPhotos && usesFalDesignerTrackEarly)
    ) {
      const aiFromCaption = await runScratchVibeImage();
      if (aiFromCaption) {
        referenceUrl = aiFromCaption;
        captionDrivenGenerated = true;
        galleryMatchScore = null;
        console.log(
          `[auto-produce] idea-brief scratch AI (gallery skipped): "${headline.slice(0, 50)}" `
          + `sources=${lastScratchBriefSources.join(',') || '—'}`,
        );
      }
    }

    if (!referenceUrl && !captionDrivenGenerated && hasGallery && !forceAttachedPhotos) {
      const agentGalleryUrl =
        typeof agentUrl === 'string' && (agentUrl.startsWith('http') || agentUrl.startsWith('/api/'))
          ? agentUrl
          : null;
      const gallerySlotKey = missionGallerySlotKey(ideaIndex, String(assignment.slot_role));
      const batchAssigned = missionId && assignmentUsesGalleryPhoto(assignment)
        ? missionGalleryAssignments.get(gallerySlotKey)
        : undefined;

      if (missionId && assignmentUsesGalleryPhoto(assignment)) {
        const batchMatchInput = {
          caption: ideationCaption,
          headline: galleryMatchHeadline,
          mood,
          contentType: postType,
          businessType: brandBusinessType,
          subjectKey: ideationSubjectKey,
        };
        if (batchAssigned?.url) {
          const batchMeta = galleryMeta[normalizeGalleryUrl(batchAssigned.url)]
            ?? Object.entries(galleryMeta).find(
              ([k]) => normalizeGalleryUrl(k) === normalizeGalleryUrl(batchAssigned.url),
            )?.[1];
          if (isHardGalleryThemeMismatch(batchMatchInput, batchMeta, batchAssigned.url)) {
            console.warn(
              `[auto-produce] batch gallery hard theme mismatch — drop "${ideationHeadline.slice(0, 48)}"`,
            );
          } else {
            referenceUrl = batchAssigned.url;
            galleryMatchScore = batchAssigned.score;
          }
        }
        if (!referenceUrl) {
          console.warn(
            `[auto-produce] no gallery match for slot ${gallerySlotKey} "${ideationHeadline.slice(0, 48)}" — fallback pick`,
          );
          // The judge already ruled these frames wrong for this copy, so the
          // fallback must look elsewhere instead of landing on them again.
          const slotFallbackExclude = [
            ...missionGalleryExclude,
            ...(missionGalleryJudgeRejects.get(gallerySlotKey) ?? []),
          ];
          const diverseFallback = pickMissionDiverseFallbackPhoto(
            galleryPhotos,
            new Set(slotFallbackExclude.map(normalizeGalleryUrl)),
            galleryMeta,
            slotFallbackExclude,
            batchMatchInput,
          );
          if (diverseFallback?.url) {
            referenceUrl = diverseFallback.url;
            galleryMatchScore = diverseFallback.score;
          } else {
          // Strict captions (nightlife / food / beauty) never use bestEffort ≥10.
          const missionFallbackStrict = captionRequiresStrictGalleryMatch(
            ideationCaption, galleryMatchHeadline,
          ) || captionHasExplicitBeautyService(ideationCaption, galleryMatchHeadline);
          referenceUrl = pickMissionGallery(
            ideationCaption,
            galleryMatchHeadline,
            mood,
            galleryMeta,
            galleryPhotos,
            slotFallbackExclude,
            batchExclude,
            postType,
            typeof agentUrl === 'string' && (agentUrl.startsWith('http') || agentUrl.startsWith('/api/'))
              ? agentUrl
              : null,
            brandBusinessType,
            missionFallbackStrict,
            ideaIndex,
          );
          if (referenceUrl) {
            galleryMatchScore = scoreIdeationPhotoMatch({
              caption: ideationCaption,
              headline: galleryMatchHeadline,
              photoUrl: referenceUrl ?? '',
              galleryAnalysis: galleryMeta,
              businessType: brandBusinessType,
              mood,
              contentType: postType,
              subjectKey: ideationSubjectKey,
              visualDirection: activeGalleryMatchExtras.visualDirection,
              strategicPurpose: activeGalleryMatchExtras.strategicPurpose,
            });
          }
          }
          // Last resort before failing the slot: sub-threshold but
          // subject-aligned photo confirmed by the AI judge (fail-closed).
          if (!referenceUrl) {
            const escalatedPick = await escalateSubjectAlignedPick(
              batchMatchInput,
              galleryMeta,
              galleryPhotos,
              {
                excludeUrls: missionGalleryExclude,
                workspaceId,
                missionId,
                slotKey,
              },
            );
            if (escalatedPick?.url) {
              referenceUrl = escalatedPick.url;
              galleryMatchScore = escalatedPick.score;
              console.log(
                `[auto-produce] judge escalation assigned photo (score ${escalatedPick.score}) for "${ideationHeadline.slice(0, 40)}"`,
              );
            }
          }
        }
      } else {
        referenceUrl = pickMissionGallery(
          ideationCaption,
          galleryMatchHeadline,
          mood,
          galleryMeta,
          galleryPhotos,
          missionGalleryExclude,
          batchExclude,
          postType,
          agentGalleryUrl,
          brandBusinessType,
          true,
          ideaIndex,
        );
        if (!referenceUrl && !missionId) {
          referenceUrl = pickMissionGallery(
            ideationCaption,
            galleryMatchHeadline,
            mood,
            galleryMeta,
            galleryPhotos,
            missionGalleryExclude,
            batchExclude,
            postType,
            agentGalleryUrl,
            brandBusinessType,
            false,
            ideaIndex,
          );
        }
      }
    }

    let referenceIsStock = referenceUrl ? isStockGalleryPhotoUrl(referenceUrl) : false;

    // AI kapalıyken galeri/stock fotoğrafı kullan — scratch GPT üretimine düşme.
    if (!referenceUrl && hasGallery && galleryPhotos.length && !aiVisualStandard.enabled) {
      referenceUrl = pickMissionGallery(
        ideationCaption,
        galleryMatchHeadline,
        mood,
        galleryMeta,
        galleryPhotos,
        missionGalleryExclude,
        batchExclude,
        postType,
        typeof agentUrl === 'string' && (agentUrl.startsWith('http') || agentUrl.startsWith('/api/'))
          ? agentUrl
          : null,
        brandBusinessType,
        false,
        ideaIndex,
      ) ?? pickMissionGallery(
        ideationCaption,
        galleryMatchHeadline,
        mood,
        galleryMeta,
        galleryPhotos,
        missionGalleryExclude,
        batchExclude,
        postType,
        typeof agentUrl === 'string' && (agentUrl.startsWith('http') || agentUrl.startsWith('/api/'))
          ? agentUrl
          : null,
        brandBusinessType,
        false,
        ideaIndex,
      ) ?? null;
      if (referenceUrl) {
        referenceIsStock = isStockGalleryPhotoUrl(referenceUrl);
        galleryMatchScore = scoreIdeationPhotoMatch({
          caption: ideationCaption,
          headline: galleryMatchHeadline,
          photoUrl: referenceUrl ?? '',
          galleryAnalysis: galleryMeta,
          businessType: brandBusinessType,
          mood,
          contentType: postType,
          subjectKey: ideationSubjectKey,
          visualDirection: activeGalleryMatchExtras.visualDirection,
          strategicPurpose: activeGalleryMatchExtras.strategicPurpose,
        });
        console.log(
          `[auto-produce] AI OFF — galeri passthrough: "${ideationHeadline.slice(0, 48)}" → ${referenceUrl.slice(0, 72)}`,
        );
      }
    }

    // Marka galerisi varsa gerçek mekan fotoğrafı zorunlu — sıfırdan üretim açıksa atlanır.
    if (hasRealBrandPhotos && galleryPhotos.length && !captionDrivenGenerated) {
      const venuePhotos = galleryPhotos.filter((u) => !isStockGalleryPhotoUrl(u));
      if (venuePhotos.length && (!referenceUrl || referenceIsStock)) {
        const venuePick = pickMissionGallery(
          ideationCaption,
          galleryMatchHeadline,
          mood,
          galleryMeta,
          venuePhotos,
          missionGalleryExclude,
          batchExclude,
          postType,
          typeof agentUrl === 'string' && (agentUrl.startsWith('http') || agentUrl.startsWith('/api/'))
            ? agentUrl
            : null,
          brandBusinessType,
          true,
          ideaIndex,
        ) ?? (missionId ? null : pickMissionGallery(
          ideationCaption,
          galleryMatchHeadline,
          mood,
          galleryMeta,
          venuePhotos,
          missionGalleryExclude,
          batchExclude,
          postType,
          null,
          brandBusinessType,
          false,
          ideaIndex,
        ));
        if (venuePick) {
          referenceUrl = venuePick;
          referenceIsStock = false;
          captionDrivenGenerated = false;
          console.log(
            `[auto-produce] venue gallery photo: "${ideationHeadline.slice(0, 48)}" → ${venuePick.slice(0, 72)}`,
          );
        }
      }
    }

    // Caption-driven: SaaS/non-venue sectors AND service sectors with low gallery reliability
    // (e.g. beauty, barber) — both need fresh AI generation rather than gallery passthrough.
    const saasNeedsCaptionVisual = (isNonVenueSectorProfile(brandBusinessType) || isCaptionDrivenDefault(brandBusinessType))
      && aiVisualStandard.enabled
      && (referenceIsStock || !referenceUrl);
    const skipStockForVibeGen = aiVisualStandard.enabled
      && !captionDrivenGenerated
      && !hasRealBrandPhotos
      && (!referenceUrl || referenceIsStock || saasNeedsCaptionVisual);
    if (skipStockForVibeGen) {
      // No photo, or stock-only gallery with AI enhance OFF → scratch generation.
      if (referenceUrl && referenceIsStock) {
        console.log(`[auto-produce] stock seed + enhance OFF → AI image for: "${headline.slice(0, 50)}"`);
      } else {
        console.log(`[auto-produce] no gallery photo → AI image generation for: "${headline.slice(0, 50)}"`);
      }
      const aiGenerated = await runScratchVibeImage({
        referenceImageUrls: (brandCtx.reference_image_urls as string[] | undefined)?.slice(0, 2),
        captionDrivenMode: isNonVenueSectorProfile(brandBusinessType) || isCaptionDrivenDefault(brandBusinessType),
      });
      if (!aiGenerated) {
        console.warn(`[auto-produce] AI image generation failed for: "${headline.slice(0, 50)}"`);
        results.push({ title: headline, imageUrl: '', error: 'Galeri boş ve AI görsel üretimi başarısız oldu', slotKey });
        continue;
      }
      referenceUrl = aiGenerated;
      if (isNonVenueSectorProfile(brandBusinessType) || isCaptionDrivenDefault(brandBusinessType)) {
        captionDrivenGenerated = true;
      }
      galleryMatchScore = null;
      console.log(`[auto-produce] AI image generated: ${aiGenerated.slice(0, 80)}`);
    }

    if (referenceUrl) {
      referenceUrl = normalizeExternalPhotoUrl(referenceUrl) ?? referenceUrl;
    }

    if (referenceUrl && hasGallery && !captionDrivenGenerated && !forceAttachedPhotos) {
      referenceUrl = repickGalleryIfDuplicateForType({
        referenceUrl,
        caption: ideationCaption,
        headline: galleryMatchHeadline,
        mood,
        galleryAnalysis: galleryMeta,
        candidateUrls: galleryPhotos,
        typeExcludeUrls: missionGalleryExclude,
        batchExcludeUrls: batchExclude,
        postType,
        galleryUsage,
        batchUsedByType,
        batchUsedMission: batchUsedGalleryMission,
        businessType: brandBusinessType,
        ideaIndex,
        globalUsageCounts: globalGalleryUsageCounts,
        subjectKey: ideationSubjectKey,
      });
      if (referenceUrl) {
        referenceUrl = normalizeExternalPhotoUrl(referenceUrl) ?? referenceUrl;
        // Do NOT mark used yet — hard theme veto rematch may replace this URL.
        // Reservation happens after the gate passes (see mark below).
      }
    }

    if (!forceAttachedPhotos && referenceUrl && !referenceUrl.startsWith('/api/') && !(await isProductionGalleryUrlReachable(referenceUrl))) {
      // External CDN URL dead — rematch + mirror brand gallery before any caption scratch.
      console.warn(`[auto-produce] broken external gallery URL — rematching brand gallery: ${referenceUrl.slice(0, 100)}`);
      const fallbackCandidates = galleryPhotos.filter((u) => u !== referenceUrl);
      const heuristicPick = fallbackCandidates.length
        ? pickMissionGallery(
            ideationCaption,
            galleryMatchHeadline,
            mood,
            galleryMeta,
            fallbackCandidates,
            missionGalleryExclude,
            batchExclude,
            postType,
            null,
            brandBusinessType,
            Boolean(missionId),
            ideaIndex,
          )
        : null;
      const rematch = canRetryBrandGalleryRecovery(assignment.pipeline, assignment.slot_role)
        ? await rematchMirroredBrandGalleryUrl({
          workspaceId,
          primaryUrl: heuristicPick || referenceUrl,
          galleryPhotos,
          matchInput: {
            caption: ideationCaption,
            headline: galleryMatchHeadline,
            mood,
            contentType: postType,
            businessType: brandBusinessType,
            subjectKey: ideationSubjectKey,
            ...activeGalleryMatchExtras,
          },
          galleryMeta,
        })
        : { ok: false as const, reason: 'recovery_unsupported' as const };
      if (rematch.ok) {
        console.log(`[auto-produce] brand gallery rematch/mirror: ${rematch.url.slice(0, 80)}`);
        referenceUrl = rematch.url;
        referenceIsStock = isStockGalleryPhotoUrl(rematch.url);
      } else if (
        allowsCaptionScratchGalleryFallback(brandBusinessType, hasRealBrandPhotos)
        && canRetryBrandGalleryRecovery(assignment.pipeline, assignment.slot_role)
      ) {
        console.warn(
          `[auto-produce] no brand gallery rematch (${rematch.reason}) — caption scratch (non-venue) for "${headline.slice(0, 48)}"`,
        );
        const recovered = await runScratchVibeImage({
          referenceImageUrls: undefined,
        });
        if (!recovered) {
          // Genuine miss — withhold rather than invent fal_only visuals.
          results.push({
            title: headline,
            imageUrl: '',
            error: galleryRematchErrorMessage(rematch.reason),
            slotKey,
          });
          continue;
        }
        referenceUrl = recovered;
        referenceIsStock = false;
        galleryMatchScore = null;
        captionDrivenGenerated = true;
      } else {
        // Photo brand + no aligned gallery — withhold (do not force fal_only).
        console.warn(`[auto-produce] brand gallery rematch failed (${rematch.reason}) — refusing caption scratch for photo brand`);
        results.push({
          title: headline,
          imageUrl: '',
          error: galleryRematchErrorMessage(rematch.reason),
          slotKey,
        });
        continue;
      }
    }

    if (!forceAttachedPhotos && !referenceUrl?.trim()) {
      // FD or batch assign may leave an empty URL — try a fresh gallery pick before skipping.
      const emptyFallback = galleryPhotos.length
        ? pickMissionGallery(
            ideationCaption,
            galleryMatchHeadline,
            mood,
            galleryMeta,
            galleryPhotos,
            missionGalleryExclude,
            batchExclude,
            postType,
            null,
            brandBusinessType,
            Boolean(missionId),
            ideaIndex,
          )
        : null;
      if (emptyFallback) {
        console.log(`[auto-produce] empty gallery URL — fallback pick: ${emptyFallback.slice(0, 80)}`);
        referenceUrl = emptyFallback;
        referenceIsStock = isStockGalleryPhotoUrl(emptyFallback);
      }
    }

    if (
      forceAttachedPhotos
      && referenceUrl
      && referenceUrl.startsWith('/api/')
      && !(await probeMediaUrlReliable(referenceUrl, { timeoutMs: 6_000, retries: 5 }))
    ) {
      try {
        const { resolveExternallyAccessibleUrl } = await import('@/lib/media-url');
        referenceUrl = await resolveExternallyAccessibleUrl(referenceUrl);
        console.log(`[auto-produce] user-attached photo resolved for external access: ${referenceUrl.slice(0, 80)}`);
      } catch (resolveErr) {
        console.warn('[auto-produce] user-attached photo resolve failed:', resolveErr);
      }
    }

    if (
      !forceAttachedPhotos
      && (!referenceUrl || (referenceUrl.startsWith('/api/') && !(await probeMediaUrlReliable(referenceUrl, { timeoutMs: 4_000 }))))
      // premium_editorial / ad pipelines rematch internally — an empty or stale
      // pin must not withhold a slot they can compose without.
      && !pipelineComposesWithoutGalleryPin(assignment.pipeline, assignment.slot_role)
    ) {
      const brokenInternal = referenceUrl?.startsWith('/api/');
      const internalFallback = brokenInternal && galleryPhotos.length
        ? pickMissionGallery(
            ideationCaption,
            galleryMatchHeadline,
            mood,
            galleryMeta,
            galleryPhotos,
            missionGalleryExclude,
            batchExclude,
            postType,
            null,
            brandBusinessType,
            Boolean(missionId),
            ideaIndex,
          )
        : null;
      if (internalFallback && internalFallback !== referenceUrl) {
        console.log(`[auto-produce] broken internal URL — fallback pick: ${internalFallback.slice(0, 80)}`);
        referenceUrl = internalFallback;
        referenceIsStock = isStockGalleryPhotoUrl(internalFallback);
      } else {
        const rematch = canRetryBrandGalleryRecovery(assignment.pipeline, assignment.slot_role)
          ? await rematchMirroredBrandGalleryUrl({
            workspaceId,
            primaryUrl: referenceUrl,
            galleryPhotos,
            matchInput: {
              caption: ideationCaption,
              headline: galleryMatchHeadline,
              mood,
              contentType: postType,
              businessType: brandBusinessType,
              subjectKey: ideationSubjectKey,
              ...activeGalleryMatchExtras,
            },
            galleryMeta,
          })
          : { ok: false as const, reason: 'recovery_unsupported' as const };
        if (rematch.ok) {
          console.log(`[auto-produce] brand gallery rematch after internal miss: ${rematch.url.slice(0, 80)}`);
          referenceUrl = rematch.url;
          referenceIsStock = isStockGalleryPhotoUrl(rematch.url);
        } else if (
          allowsCaptionScratchGalleryFallback(brandBusinessType, hasRealBrandPhotos)
          && canRetryBrandGalleryRecovery(assignment.pipeline, assignment.slot_role)
        ) {
          console.warn(
            `[auto-produce] broken internal/no gallery (${rematch.reason}) — caption scratch (non-venue) for "${headline.slice(0, 48)}"`,
          );
          const recovered = await runScratchVibeImage({
          referenceImageUrls: undefined,
        });
          if (!recovered) {
            results.push({
              title: headline,
              imageUrl: '',
              error: brokenInternal
                ? 'Üretilen görsel depolamadan okunamadı — birkaç dakika sonra yeniden deneyin'
                : galleryRematchErrorMessage(rematch.reason),
              slotKey,
            });
            continue;
          }
          referenceUrl = recovered;
          referenceIsStock = false;
          galleryMatchScore = null;
          captionDrivenGenerated = true;
        } else {
          // Genuine gallery miss — withhold slot rather than invent fal_only.
          console.warn(`[auto-produce] broken internal gallery URL skipped (${rematch.reason}): ${(referenceUrl ?? '').slice(0, 100)}`);
          results.push({
            title: headline,
            imageUrl: '',
            error: brokenInternal
              ? 'Üretilen görsel depolamadan okunamadı — birkaç dakika sonra yeniden deneyin'
              : galleryRematchErrorMessage(rematch.reason),
            slotKey,
          });
          continue;
        }
      }
    }

    if (referenceUrl && !referenceIsStock) {
      const slotRequiresGalleryPhoto = !pipelineComposesWithoutGalleryPin(
        assignment.pipeline,
        assignment.slot_role,
      );
      try {
        const picked = await pickReachableProductionGalleryUrl(
          workspaceId,
          referenceUrl,
          galleryPhotos,
          { timeoutMs: 12_000 },
        );
        if (picked?.fromTenantInventory && slotRequiresGalleryPhoto) {
          // Raw tenant storage has no photo analysis and no caption relevance, so
          // it cannot be scored. Shipping it hands the slot an arbitrary image —
          // withhold instead and let the gallery gap surface as a real gap.
          console.warn(
            `[auto-produce] tenant-inventory photo cannot be caption-scored — withhold "${headline.slice(0, 40)}"`,
          );
          results.push({
            title: headline,
            imageUrl: '',
            error: 'Galeri eşleşmesi yok — caption ile uyumlu marka fotoğrafı bulunamadı',
            slotKey,
          });
          continue;
        }
        if (picked) {
          if (picked.fallbackFrom) {
            console.log(
              `[auto-produce] gallery production fallback: ${picked.fallbackFrom.slice(0, 80)} → ${picked.url.slice(0, 80)}`,
            );
          }
          // Any substitute skipped caption scoring, so keeping the matched photo's
          // score would misreport it as a caption-aligned pick.
          if (picked.fallbackFrom) galleryMatchScore = null;
          referenceUrl = picked.url;
        } else if (!slotRequiresGalleryPhoto) {
          console.warn(
            `[auto-produce] ${assignment.pipeline}: unreachable gallery pin dropped — `
            + 'pipeline composes without it',
          );
          referenceUrl = null;
        } else if (!referenceUrl.startsWith('/api/media?key=')) {
          if (allowsCaptionScratchGalleryFallback(brandBusinessType, hasRealBrandPhotos)) {
            console.warn(
              `[auto-produce] mirror failed — caption scratch (non-venue) for "${headline.slice(0, 48)}"`,
            );
            const recovered = await runScratchVibeImage({
          referenceImageUrls: undefined,
        });
            if (!recovered) {
              results.push({
                title: headline,
                imageUrl: '',
                error: 'Galeri fotoğrafı erişilemiyor (mirror ve fallback başarısız)',
                slotKey,
              });
              continue;
            }
            referenceUrl = recovered;
            referenceIsStock = false;
            galleryMatchScore = null;
            captionDrivenGenerated = true;
          } else {
            console.warn(
              `[auto-produce] gallery photo unreachable after mirror: ${referenceUrl.slice(0, 90)}`,
            );
            results.push({
              title: headline,
              imageUrl: '',
              error: 'Galeri fotoğrafı erişilemiyor (mirror ve fallback başarısız)',
              slotKey,
            });
            continue;
          }
        }
      } catch (mirrorErr) {
        console.warn('[auto-produce] pickReachableProductionGalleryUrl failed:', mirrorErr);
        if (!slotRequiresGalleryPhoto) {
          referenceUrl = null;
        } else if (!referenceUrl?.startsWith('/api/media?key=')) {
          if (allowsCaptionScratchGalleryFallback(brandBusinessType, hasRealBrandPhotos)) {
            const recovered = await runScratchVibeImage({
          referenceImageUrls: undefined,
        });
            if (!recovered) {
              results.push({
                title: headline,
                imageUrl: '',
                error: 'Galeri fotoğrafı erişilemiyor (mirror ve fallback başarısız)',
                slotKey,
              });
              continue;
            }
            referenceUrl = recovered;
            referenceIsStock = false;
            galleryMatchScore = null;
            captionDrivenGenerated = true;
          } else {
            results.push({
              title: headline,
              imageUrl: '',
              error: 'Galeri fotoğrafı erişilemiyor (mirror ve fallback başarısız)',
              slotKey,
            });
            continue;
          }
        }
      }
    }

    let resolvedReferenceUrl = referenceUrl;
    let galleryPreviewUrl = toFeedPreviewUrl(resolvedReferenceUrl) ?? resolvedReferenceUrl;
    let selectedVisualDesignCard: MissionVisualDesignCard | null = slotVisualDesignCard;
    let selectedVisualDesignCardIndex: number | null = slotVisualDesignCardIndex;
    let missionVisualDesignRendered = false;

    const normalizedResolvedReferenceUrl = resolvedReferenceUrl ?? '';
    let pickedFromBrandGallery = galleryPhotos.some(
      (u) => normalizeGalleryUrl(u) === normalizeGalleryUrl(normalizedResolvedReferenceUrl),
    );
    const escalateGalleryFailureToFalOnly = (stage: string): boolean => {
      if (galleryEscalatedToFalOnly || !missionId) return false;
      const rejectedRef = referenceUrl ?? resolvedReferenceUrl;
      const venueFallback = pickVenueEscalationFallbackPhoto({
        currentReferenceUrl: rejectedRef,
        galleryPhotos,
        brandReferenceImageUrls: (brandCtx.reference_image_urls as string[] | undefined) ?? [],
        sector: brandBusinessType,
        hasRealBrandPhotos,
        // After judge/hard veto, try a different gallery photo before reusing the reject.
        excludeUrls: (
          stage === 'judge_reject' || stage === 'hard_veto'
        ) && rejectedRef
          ? [rejectedRef]
          : undefined,
      });
      const escalated = tryGalleryFailureEscalation({
        assignment,
        postType,
        missionId,
        stage,
        fallbackReferenceUrl: venueFallback,
      });
      if (!escalated) return false;
      console.warn(
        `[auto-produce] gallery ${stage} → ${String(escalated.assignment.pipeline)} `
        + `(fal_only escalation${escalated.referenceUrl ? ', venue photo kept' : ', no venue photo'}) `
        + `"${headline.slice(0, 40)}"`,
      );
      assignment = escalated.assignment;
      referenceUrl = escalated.referenceUrl;
      resolvedReferenceUrl = escalated.referenceUrl;
      galleryPreviewUrl = escalated.referenceUrl
        ? (toFeedPreviewUrl(escalated.referenceUrl) ?? escalated.referenceUrl)
        : null;
      pickedFromBrandGallery = escalated.pickedFromBrandGallery;
      galleryMatchScore = escalated.galleryMatchScore;
      captionDrivenGenerated = escalated.captionDrivenGenerated;
      agentIdeationGalleryLock = escalated.agentIdeationGalleryLock;
      galleryEscalatedToFalOnly = true;
      return true;
    };
    let photoMetaForCaption = galleryMeta[normalizeGalleryUrl(normalizedResolvedReferenceUrl)]
      ?? Object.entries(galleryMeta).find(
        ([k]) => normalizeGalleryUrl(k) === normalizeGalleryUrl(normalizedResolvedReferenceUrl),
      )?.[1];
    const galleryPhotoDescription = String(
      (photoMetaForCaption as GalleryPhotoMeta | undefined)?.description ?? '',
    ).trim();

    // Batch decision SSOT: when this slot's photo IS the judge-gated batch
    // assignment, the loop must not re-litigate it with a differently composed
    // caption blob (drift: same photo scores 56 in batch, 26 here). The hard
    // theme veto and the slot-level judge below remain as safety gates.
    const slotBatchDecision = missionId && assignmentUsesGalleryPhoto(assignment)
      ? missionGalleryAssignments.get(missionGallerySlotKey(ideaIndex, String(assignment.slot_role)))
      : undefined;
    const batchSourcedGalleryPick = Boolean(
      slotBatchDecision?.url
      && normalizedResolvedReferenceUrl
      && normalizeGalleryUrl(slotBatchDecision.url) === normalizeGalleryUrl(normalizedResolvedReferenceUrl),
    );

    if (pickedFromBrandGallery && !referenceIsStock) {
      const scorePhoto = (url: string) => scoreIdeationPhotoMatch({
        caption: ideationCaption,
        headline: galleryMatchHeadline,
        photoUrl: url,
        galleryAnalysis: galleryMeta,
        businessType: brandBusinessType,
        mood,
        contentType: postType,
        subjectKey: ideationSubjectKey,
        visualDirection: activeGalleryMatchExtras.visualDirection,
        strategicPurpose: activeGalleryMatchExtras.strategicPurpose,
      });

      // Full caption + visualDirection rescoring is authoritative (no batch score floor).
      galleryMatchScore = scorePhoto(normalizedResolvedReferenceUrl);
      if (
        batchSourcedGalleryPick
        && slotBatchDecision
        && galleryMatchScore >= MIN_ACCEPT_SCORE
      ) {
        console.log(
          `[auto-produce] batch gallery confirmed score=${galleryMatchScore} (batch=${slotBatchDecision.score}): "${ideationHeadline.slice(0, 40)}"`,
        );
      }

      if (galleryMatchScore < MIN_ACCEPT_SCORE) {
        let bestUrl = resolvedReferenceUrl ?? '';
        let bestScore = galleryMatchScore;
        for (const candidate of galleryPhotos) {
          if (typeExclude.some((u) => normalizeGalleryUrl(u) === normalizeGalleryUrl(candidate))) {
            continue;
          }
          const normalized = normalizeExternalPhotoUrl(candidate) ?? candidate;
          if (!(await probeMediaUrl(normalized))) continue;
          const candidateScore = scorePhoto(normalized);
          if (candidateScore > bestScore) {
            bestScore = candidateScore;
            bestUrl = normalized;
          }
        }
        if (bestScore >= MIN_ACCEPT_SCORE && bestUrl !== resolvedReferenceUrl) {
          referenceUrl = bestUrl;
          resolvedReferenceUrl = bestUrl;
          galleryPreviewUrl = toFeedPreviewUrl(resolvedReferenceUrl) ?? resolvedReferenceUrl;
          galleryMatchScore = bestScore;
          photoMetaForCaption = galleryMeta[normalizeGalleryUrl(bestUrl)]
            ?? Object.entries(galleryMeta).find(
              ([k]) => normalizeGalleryUrl(k) === normalizeGalleryUrl(bestUrl),
            )?.[1];
          console.log(
            `[auto-produce] gallery re-picked for headline (score ${bestScore}): "${ideationHeadline.slice(0, 48)}"`,
          );
        } else if (!missionId) {
          const altUrl = pickMissionGallery(
            ideationCaption,
            galleryMatchHeadline,
            mood,
            galleryMeta,
            galleryPhotos,
            resolvedReferenceUrl
              ? [...missionGalleryExclude, resolvedReferenceUrl]
              : missionGalleryExclude,
            resolvedReferenceUrl
              ? [...batchUsedByType[postType], resolvedReferenceUrl]
              : batchUsedByType[postType],
            postType,
            null,
            brandBusinessType,
            false,
            ideaIndex,
          );
          if (altUrl && altUrl !== resolvedReferenceUrl) {
            const normalizedAlt = normalizeExternalPhotoUrl(altUrl) ?? altUrl;
            if (await probeMediaUrl(normalizedAlt)) {
              const altScore = scorePhoto(normalizedAlt);
              if (altScore > (galleryMatchScore ?? 0)) {
                referenceUrl = normalizedAlt;
                resolvedReferenceUrl = normalizedAlt;
                galleryPreviewUrl = toFeedPreviewUrl(resolvedReferenceUrl) ?? resolvedReferenceUrl;
                galleryMatchScore = altScore;
                photoMetaForCaption = galleryMeta[normalizeGalleryUrl(normalizedAlt)]
                  ?? Object.entries(galleryMeta).find(
                    ([k]) => normalizeGalleryUrl(k) === normalizeGalleryUrl(normalizedAlt),
                  )?.[1];
                console.log(
                  `[auto-produce] gallery fallback re-pick (score ${altScore}): "${ideationHeadline.slice(0, 48)}"`,
                );
              }
            }
          }
        }
      }
    }

    const mediaFallback = motionProfile.mediaPolicy?.fallback ?? 'brand_solid';
    // Hard theme veto (DJ caption + food plate, nail + lash, …) — always block production.
    const lockedGalleryMeta = resolvedReferenceUrl
      ? (galleryMeta[normalizeGalleryUrl(resolvedReferenceUrl)]
        ?? Object.entries(galleryMeta).find(
          ([k]) => normalizeGalleryUrl(k) === normalizeGalleryUrl(resolvedReferenceUrl!),
        )?.[1])
      : undefined;
    // Product SKU + nightlife/food/beauty — isHardCaptionPhotoConflict alone misses
    // bal↔zeytinyağı and unlabeled packaging that still ships the wrong product.
    let hardThemeConflict = Boolean(
      // New Brief user uploads are intentional — do not hard-veto the locked photo.
      !forceAttachedPhotos
      && pickedFromBrandGallery
      && resolvedReferenceUrl
      && isHardGalleryThemeMismatch(
        {
          caption: ideationCaption,
          headline: galleryMatchHeadline,
          visualDirection: String(idea.visual_direction ?? '').trim() || undefined,
          businessType: brandBusinessType,
          subjectKey: ideationSubjectKey,
        },
        lockedGalleryMeta,
        resolvedReferenceUrl,
      ),
    );
    if (hardThemeConflict && resolvedReferenceUrl) {
      const rematchExclude = getMissionWideExcludeUrls(
        galleryUsage,
        batchUsedByType,
        batchUsedGalleryMission,
      );
      const rematchedUrl = rematchGalleryAfterHardThemeConflict({
        caption: ideationCaption,
        headline: galleryMatchHeadline,
        mood,
        galleryAnalysis: galleryMeta,
        candidateUrls: galleryPhotos,
        excludeUrls: rematchExclude,
        rejectedUrl: resolvedReferenceUrl,
        contentType: postType,
        businessType: brandBusinessType,
        subjectKey: ideationSubjectKey,
        maxAttempts: 5,
        globalUsageCounts: globalGalleryUsageCounts,
        tieBreakSeed: ideaIndex,
      });
      if (rematchedUrl) {
        console.warn(
          `[auto-produce] hard theme conflict — rematched "${ideationHeadline.slice(0, 40)}" → ${rematchedUrl.slice(0, 72)}`,
        );
        referenceUrl = rematchedUrl;
        resolvedReferenceUrl = rematchedUrl;
        galleryPreviewUrl = toFeedPreviewUrl(resolvedReferenceUrl) ?? resolvedReferenceUrl;
        pickedFromBrandGallery = galleryPhotos.some(
          (u) => normalizeGalleryUrl(u) === normalizeGalleryUrl(rematchedUrl),
        );
        photoMetaForCaption = galleryMeta[normalizeGalleryUrl(rematchedUrl)]
          ?? Object.entries(galleryMeta).find(
            ([k]) => normalizeGalleryUrl(k) === normalizeGalleryUrl(rematchedUrl),
          )?.[1];
        galleryMatchScore = scoreIdeationPhotoMatch({
          caption: ideationCaption,
          headline: galleryMatchHeadline,
          photoUrl: rematchedUrl,
          galleryAnalysis: galleryMeta,
          businessType: brandBusinessType,
          mood,
          contentType: postType,
          subjectKey: ideationSubjectKey,
          visualDirection: activeGalleryMatchExtras.visualDirection,
          strategicPurpose: activeGalleryMatchExtras.strategicPurpose,
        });
        agentIdeationGalleryLock = false;
        hardThemeConflict = false;
      } else {
        console.warn(
          `[auto-produce] hard caption↔photo theme conflict — skip "${ideationHeadline.slice(0, 40)}"`,
        );
        if (!escalateGalleryFailureToFalOnly('hard_veto')) {
          results.push({
            title: headline,
            imageUrl: galleryPreviewUrl ?? '',
            error: galleryThemeMismatchMessage(galleryMatchHeadline, 'hard_veto'),
            errorCode: GALLERY_THEME_MISMATCH_CODE,
            slotKey,
          });
          continue;
        }
      }
    }

    // AI match judge — fail-closed confirmation for gray-zone gallery picks.
    // Strong deterministic matches skip the judge (fast + free). Uncertain picks
    // are confirmed; low confidence / wrong subject fail closed instead of
    // shipping a doubtful photo. Multilingual (TR/EN/mixed) aware.
    // Batch-confirmed picks (photo still equals the judge-gated batch decision)
    // skip the slot judge — re-judging the same verdict wastes tokens.
    const stillBatchConfirmedPick = Boolean(
      slotBatchDecision?.url
      && resolvedReferenceUrl
      && normalizeGalleryUrl(slotBatchDecision.url) === normalizeGalleryUrl(resolvedReferenceUrl),
    );
    if (
      missionId
      && pickedFromBrandGallery
      && resolvedReferenceUrl
      && !captionDrivenGenerated
      && !forceAttachedPhotos
      && !stillBatchConfirmedPick
    ) {
      const judgeExclude = getMissionWideExcludeUrls(
        galleryUsage,
        batchUsedByType,
        batchUsedGalleryMission,
      );
      const decision = await confirmGalleryPickWithAiJudge({
        caption: ideationCaption,
        headline: galleryMatchHeadline,
        subjectKey: ideationSubjectKey,
        businessType: brandBusinessType,
        contentType: postType,
        mood,
        selectedUrl: resolvedReferenceUrl,
        deterministicScore: galleryMatchScore,
        galleryAnalysis: galleryMeta,
        candidateUrls: galleryPhotos,
        excludeUrls: judgeExclude.filter(
          (u) => normalizeGalleryUrl(u) !== normalizeGalleryUrl(resolvedReferenceUrl ?? ''),
        ),
        missionId,
        workspaceId,
        slotKey,
        slotRole,
        ideaIndex,
      });
      if (decision.action === 'swap' && decision.url) {
        console.warn(
          `[auto-produce] ai judge swapped photo (conf ${decision.confidence.toFixed(2)}) for "${ideationHeadline.slice(0, 40)}": ${decision.reason}`,
        );
        referenceUrl = decision.url;
        resolvedReferenceUrl = decision.url;
        galleryPreviewUrl = toFeedPreviewUrl(decision.url) ?? decision.url;
        referenceIsStock = isStockGalleryPhotoUrl(decision.url);
        pickedFromBrandGallery = galleryPhotos.some(
          (u) => normalizeGalleryUrl(u) === normalizeGalleryUrl(decision.url!),
        );
        photoMetaForCaption = galleryMeta[normalizeGalleryUrl(decision.url)]
          ?? Object.entries(galleryMeta).find(
            ([k]) => normalizeGalleryUrl(k) === normalizeGalleryUrl(decision.url!),
          )?.[1];
        galleryMatchScore = scoreIdeationPhotoMatch({
          caption: ideationCaption,
          headline: galleryMatchHeadline,
          photoUrl: decision.url,
          galleryAnalysis: galleryMeta,
          businessType: brandBusinessType,
          mood,
          contentType: kind,
          subjectKey: ideationSubjectKey,
          visualDirection: activeGalleryMatchExtras.visualDirection,
          strategicPurpose: activeGalleryMatchExtras.strategicPurpose,
        });
      } else if (decision.action === 'reject') {
        console.warn(
          `[auto-produce] ai judge rejected gallery match (conf ${decision.confidence.toFixed(2)}) — fail closed "${ideationHeadline.slice(0, 40)}": ${decision.rejectReason ?? decision.reason}`,
        );
        if (!escalateGalleryFailureToFalOnly('judge_reject')) {
          results.push({
            title: headline,
            imageUrl: galleryPreviewUrl ?? '',
            error: galleryThemeMismatchMessage(galleryMatchHeadline, 'judge_reject'),
            errorCode: GALLERY_THEME_MISMATCH_CODE,
            slotKey,
          });
          continue;
        }
      }
    }

    // Reserve gallery URL only after theme gate (or successful rematch).
    if (
      resolvedReferenceUrl
      && hasGallery
      && !captionDrivenGenerated
      && !forceAttachedPhotos
      && pickedFromBrandGallery
    ) {
      markSourceGalleryUsed(galleryUsage, batchUsedByType, resolvedReferenceUrl, postType);
      batchUsedGalleryMission.add(normalizeGalleryUrl(resolvedReferenceUrl));
    }
    // Detect cross-service conflict: gallery score went negative due to beauty sub-service
    // conflict penalty (e.g. nail caption + lash photo → -45). This overrides adaptiveScene
    // so the weak-gallery gate triggers AI fallback even for beauty_wellness sector.
    const captionServiceConflict =
      (typeof galleryMatchScore === 'number' && galleryMatchScore < 0)
      || hardThemeConflict;
    // Fal / calendar gallery ships — never ship a weak idea↔photo pair (0% mismatch).
    // Calendar used to bypass GIS floor; that let score 28–54 wrong plates through.
    const falGroundedPipeline = (usesFalDesignerTrackEarly || isCalendarSlot)
      && !galleryEscalatedToFalOnly
      && !captionDrivenGenerated;
    const galleryFloor = falGroundedPipeline
      ? FAL_GROUNDED_GALLERY_MIN_SCORE
      : MIN_ACCEPT_SCORE;
    const weakGallery = isWeakGalleryMatch({
      missionProduction: Boolean(missionId),
      galleryMatchScore,
      pickedFromBrandGallery,
      referenceIsStock,
      hasReference: Boolean(resolvedReferenceUrl),
      adaptiveScene: aiVisualStandard.adaptiveScene,
      captionServiceConflict,
      falGroundedPipeline,
    });
    if (
      weakGallery
      && mediaFallback === 'logo_hero'
      && brandLogoUrl
      && !falGroundedPipeline
    ) {
      referenceUrl = brandLogoUrl;
      resolvedReferenceUrl = brandLogoUrl;
      galleryPreviewUrl = toFeedPreviewUrl(brandLogoUrl) ?? brandLogoUrl;
      referenceIsStock = false;
      pickedFromBrandGallery = false;
      console.log(
        `[auto-produce] weak gallery (${galleryMatchScore}%) → logo hero fallback: "${headline.slice(0, 40)}"`,
      );
    } else if (
      weakGallery
      && mediaFallback === 'brand_solid'
      && aiVisualStandard.enabled
      && (!usesFalDesignerTrackEarly || isCalendarSlot)
    ) {
      referenceIsStock = false;
      captionDrivenGenerated = true;
      const aiGenerated = await runScratchVibeImage({
        referenceImageUrls: (brandCtx.reference_image_urls as string[] | undefined)?.slice(0, 2),
        captionDrivenMode: true,
      });
      if (!aiGenerated) {
        console.warn(
          `[auto-produce] weak gallery brand_solid failed — skip "${headline.slice(0, 40)}"`,
        );
        if (!escalateGalleryFailureToFalOnly('weak_gallery_brand_solid')) {
          results.push({
            title: headline,
            imageUrl: galleryPreviewUrl ?? '',
            error: `Zayıf galeri eşleşmesi — marka solid üretimi başarısız (${galleryMatchScore}/${galleryFloor})`,
            slotKey,
          });
          continue;
        }
      } else {
        referenceUrl = aiGenerated;
        resolvedReferenceUrl = aiGenerated;
        galleryPreviewUrl = toFeedPreviewUrl(aiGenerated) ?? aiGenerated;
        galleryMatchScore = null;
        pickedFromBrandGallery = false;
        console.log(
          `[auto-produce] weak gallery → brand solid AI: "${headline.slice(0, 40)}"`,
        );
      }
    }

    // Already escalated to fal_only_* — do not re-litigate the gallery floor.
    // When judge_reject clears the photo, shouldSkip sees !hasReference and would
    // call escalate again (no-op) then hard-fail with "Galeri–caption eşleşmesi…".
    if (
      !galleryEscalatedToFalOnly
      && shouldSkipProductionForWeakGallery({
        missionProduction: Boolean(missionId),
        galleryMatchScore,
        pickedFromBrandGallery,
        referenceIsStock,
        pipeline: assignment.pipeline,
        hasReference: Boolean(resolvedReferenceUrl),
        adaptiveScene: aiVisualStandard.adaptiveScene,
        mediaFallback,
        captionServiceConflict,
        falGroundedPipeline,
        agentIdeationGalleryLock,
      })
    ) {
      // Prefer another mirrored brand photo over caption-scratch AI.
      const rematch = hasRealBrandPhotos
        ? await rematchMirroredBrandGalleryUrl({
          workspaceId,
          primaryUrl: resolvedReferenceUrl,
          galleryPhotos: galleryPhotos.filter(
            (u) => normalizeGalleryUrl(u) !== normalizeGalleryUrl(resolvedReferenceUrl ?? ''),
          ),
          matchInput: {
            caption: ideationCaption,
            headline: galleryMatchHeadline,
            mood,
            contentType: postType,
            businessType: brandBusinessType,
            subjectKey: ideationSubjectKey,
            ...activeGalleryMatchExtras,
          },
          galleryMeta,
        })
        : { ok: false as const, reason: 'no_photos' as const };
      if (rematch.ok) {
        console.warn(
          `[auto-produce] weak gallery (${galleryMatchScore}/${galleryFloor}) — rematched brand photo for "${headline.slice(0, 40)}"`,
        );
        referenceUrl = rematch.url;
        resolvedReferenceUrl = rematch.url;
        galleryPreviewUrl = toFeedPreviewUrl(rematch.url) ?? rematch.url;
        referenceIsStock = isStockGalleryPhotoUrl(rematch.url);
        pickedFromBrandGallery = true;
        galleryMatchScore = scoreIdeationPhotoMatch({
          caption: ideationCaption,
          headline: galleryMatchHeadline,
          photoUrl: rematch.url,
          galleryAnalysis: galleryMeta,
          businessType: brandBusinessType,
          mood,
          contentType: kind,
          subjectKey: ideationSubjectKey,
          visualDirection: activeGalleryMatchExtras.visualDirection,
          strategicPurpose: activeGalleryMatchExtras.strategicPurpose,
        });
      } else if (allowsCaptionScratchGalleryFallback(brandBusinessType, hasRealBrandPhotos)) {
        console.warn(
          `[auto-produce] weak gallery (${galleryMatchScore}/${galleryFloor}) — idea-brief scratch (non-venue) for "${headline.slice(0, 40)}"`,
        );
        const recovered = await runScratchVibeImage({ referenceImageUrls: undefined });
        if (!recovered) {
          if (!escalateGalleryFailureToFalOnly('weak_gallery_caption_scratch')) {
            results.push({
              title: headline,
              imageUrl: galleryPreviewUrl ?? '',
              error: `Galeri–caption eşleşmesi yetersiz (${galleryMatchScore}/${galleryFloor}) — "${ideationHeadline.slice(0, 40)}" için uygun foto yok`,
              slotKey,
            });
            continue;
          }
        } else {
          referenceUrl = recovered;
          resolvedReferenceUrl = recovered;
          galleryPreviewUrl = toFeedPreviewUrl(recovered) ?? recovered;
          galleryMatchScore = null;
          pickedFromBrandGallery = false;
          referenceIsStock = false;
          captionDrivenGenerated = true;
        }
      } else {
        console.warn(
          `[auto-produce] weak gallery (${galleryMatchScore}/${galleryFloor}) — skip "${headline.slice(0, 40)}"`,
        );
        if (!escalateGalleryFailureToFalOnly('weak_gallery')) {
          results.push({
            title: headline,
            imageUrl: galleryPreviewUrl ?? '',
            error: `Galeri–caption eşleşmesi yetersiz (${galleryMatchScore}/${galleryFloor}) — "${ideationHeadline.slice(0, 40)}" için uygun foto yok`,
            slotKey,
          });
          continue;
        }
      }
    }

    // Overlay must not fight the Instagram caption (kitchen headline + DJ body).
    // Calendar / canva punchline lock wins — never demote to a caption clamp.
    if (
      usesFalDesignerTrackEarly
      && caption.trim().length >= 24
      && hasCaptionHeadlineThemeConflict(caption, headline)
      && !shouldPreserveLockedPunchlineHeadline(lockedFalPunchlineSource)
    ) {
      const aligned = resolveFalOverlayCopy({
        headline,
        cta,
        caption,
        channel: kind === 'instagram_reel' || kind === 'instagram_story' || kind === 'instagram_canvas'
          ? (kind === 'instagram_reel' ? 'reel' : 'story')
          : 'feed_post',
        lockIdeationCopy: true,
      });
      if (aligned.headline && aligned.headline !== headline) {
        console.warn(
          `[auto-produce] caption↔headline theme fix: "${headline.slice(0, 36)}" → "${aligned.headline.slice(0, 36)}"`,
        );
        headline = aligned.headline;
        ideationHeadline = aligned.headline;
      }
    } else if (
      usesFalDesignerTrackEarly
      && shouldPreserveLockedPunchlineHeadline(lockedFalPunchlineSource)
      && hasCaptionHeadlineThemeConflict(caption, headline)
    ) {
      console.log(
        `[auto-produce] keep locked punchline (${lockedFalPunchlineSource}) — `
        + 'skip caption↔headline theme fix',
      );
    }

    // Final chain gate: caption ↔ overlay ↔ photo must agree before paint.
    if (usesFalDesignerTrackEarly && caption.trim().length >= 24) {
      const lockedMeta = resolvedReferenceUrl
        ? (galleryMeta[normalizeGalleryUrl(resolvedReferenceUrl)]
          ?? Object.entries(galleryMeta).find(
            ([k]) => normalizeGalleryUrl(k) === normalizeGalleryUrl(resolvedReferenceUrl!),
          )?.[1])
        : undefined;
      const chain = canShipCaptionDesignPost({
        caption,
        overlayHeadline: headline,
        brandName: resolvedBrandName,
        businessType: brandBusinessType,
        photoUrl: pickedFromBrandGallery ? resolvedReferenceUrl : null,
        galleryMeta: lockedMeta,
      });
      if (
        chain.repaired
        && chain.overlayHeadline
        && !shouldPreserveLockedPunchlineHeadline(lockedFalPunchlineSource)
      ) {
        console.warn(
          `[auto-produce] coherence repair: "${headline.slice(0, 36)}" → "${chain.overlayHeadline.slice(0, 36)}"`,
        );
        headline = chain.overlayHeadline;
        ideationHeadline = chain.overlayHeadline;
      } else if (
        chain.repaired
        && chain.overlayHeadline
        && shouldPreserveLockedPunchlineHeadline(lockedFalPunchlineSource)
        && chain.overlayHeadline !== headline
      ) {
        console.log(
          `[auto-produce] keep locked punchline (${lockedFalPunchlineSource}) — `
          + `skip coherence repair "${chain.overlayHeadline.slice(0, 36)}"`,
        );
      }
      if (!chain.ok) {
        // Photo broke after overlay settle — one rematch with final overlay text.
        if (
          chain.breaks.includes('photo_theme_conflict')
          && resolvedReferenceUrl
          && pickedFromBrandGallery
        ) {
          const rematchExclude = getMissionWideExcludeUrls(
            galleryUsage,
            batchUsedByType,
            batchUsedGalleryMission,
          );
          const rematchedUrl = rematchGalleryAfterHardThemeConflict({
            caption,
            headline,
            mood,
            galleryAnalysis: galleryMeta,
            candidateUrls: galleryPhotos,
            excludeUrls: rematchExclude,
            rejectedUrl: resolvedReferenceUrl,
            contentType: postType,
            businessType: brandBusinessType,
            subjectKey: ideationSubjectKey,
            maxAttempts: 5,
            globalUsageCounts: globalGalleryUsageCounts,
            tieBreakSeed: ideaIndex,
            matchExtras: activeGalleryMatchExtras,
          });
          if (rematchedUrl) {
            referenceUrl = rematchedUrl;
            resolvedReferenceUrl = rematchedUrl;
            galleryPreviewUrl = toFeedPreviewUrl(resolvedReferenceUrl) ?? resolvedReferenceUrl;
            pickedFromBrandGallery = true;
            photoMetaForCaption = galleryMeta[normalizeGalleryUrl(rematchedUrl)]
              ?? Object.entries(galleryMeta).find(
                ([k]) => normalizeGalleryUrl(k) === normalizeGalleryUrl(rematchedUrl),
              )?.[1];
            const recheck = canShipCaptionDesignPost({
              caption,
              overlayHeadline: headline,
              brandName: resolvedBrandName,
              businessType: brandBusinessType,
              photoUrl: rematchedUrl,
              galleryMeta: photoMetaForCaption,
            });
            if (recheck.ok) {
              console.warn(
                `[auto-produce] coherence rematch ok → ${rematchedUrl.slice(0, 72)}`,
              );
            } else {
              console.warn(
                `[auto-produce] coherence fail-closed (${recheck.breaks.join(',')}) — skip "${headline.slice(0, 40)}"`,
              );
              results.push({
                title: headline,
                imageUrl: galleryPreviewUrl ?? '',
                error: `Caption–tasarım–görsel tutarsız (${recheck.breaks.join(', ')})`,
                slotKey,
              });
              continue;
            }
          } else {
            console.warn(
              `[auto-produce] coherence fail-closed (${chain.breaks.join(',')}) — skip "${headline.slice(0, 40)}"`,
            );
            results.push({
              title: headline,
              imageUrl: galleryPreviewUrl ?? '',
              error: `Caption–tasarım–görsel tutarsız (${chain.breaks.join(', ')})`,
              slotKey,
            });
            continue;
          }
        } else {
          console.warn(
            `[auto-produce] coherence fail-closed (${chain.breaks.join(',')}) — skip "${headline.slice(0, 40)}"`,
          );
          results.push({
            title: headline,
            imageUrl: galleryPreviewUrl ?? '',
            error: `Caption–tasarım–görsel tutarsız (${chain.breaks.join(', ')})`,
            slotKey,
          });
          continue;
        }
      }
    }

    const isStoryIdeaForEnhance = kind === 'instagram_story' || kind === 'instagram_canvas';
    const isOrganicStoryStillSlot = assignment.slot_role === 'organic_story_still';
    const isDesignedPostSlotEarly =
      isFalDesignPipeline(assignment.pipeline)
      || assignment.slot_role === 'designed_post'
      || assignment.slot_role === 'designed_typography';
    const isFalDesignedPostSlotEarly =
      isFalDesignPipeline(assignment.pipeline)
      || assignment.slot_role === 'designed_post'
      || assignment.slot_role === 'designed_typography'
      || assignment.slot_role === 'fal_designed_post';
    const willStoryOverlayForEnhance = bundleCards !== false
      && isStoryIdeaForEnhance
      && Boolean(resolvedReferenceUrl)
      && (!isOrganicStoryStillSlot || productionProfile.requireDesignedVisuals)
      && !isFalDesignedPostSlotEarly;

    const isCarouselSlotEarly = isCarouselAssignment(kind, assignment);
    const useMultiGallery = !captionDrivenGenerated
      && hasGallery
      && shouldUseMultiGalleryPhotos(assignment, kind)
      && !isCarouselSlotEarly;
    const storyLibrarySlotKey = assignmentImpliesStoryFormat(assignment.slot_role)
      ? resolveStoryLibrarySlotKey({
        librarySlotKey: assignment.library_slot_key,
        catalogSlotKey: assignment.catalog_slot_key
          ?? (ideaRecord.catalog_slot_key as string | undefined),
        activeSlots: brandActiveSlots,
        library: templateLibrary,
        storyIndex,
      })
      : undefined;
    const slotStoryTemplateFamily = storyLayoutFamilyForSlotKey(
      storyLibrarySlotKey,
      brandBusinessType,
      storyIndex,
    );

    if (useMultiGallery) {
      const galleryTarget = pkgFmt === 'story'
        ? storyGalleryPhotoTarget({ assignment, contentKind: kind, templateFamily: slotStoryTemplateFamily })
        : gallerySequencePhotoTarget(assignment, kind);
      const extraCount = Math.max(0, galleryTarget - 1);
      const extras = pickSupplementaryGalleryPhotos(
        caption,
        headline,
        mood,
        galleryMeta,
        galleryPhotos,
        referenceUrl ?? '',
        batchUsedByType[postType],
        extraCount,
        postType,
      );
      enhancedGallerySet = (referenceUrl ? [referenceUrl, ...extras] : extras).map(
        (u) => normalizeExternalPhotoUrl(u) ?? u,
      );
    } else {
      enhancedGallerySet = referenceUrl ? [referenceUrl] : [];
    }

    const sourceGalleryUrlsForSlot = enhancedGallerySet.map(
      (u) => normalizeExternalPhotoUrl(u) ?? u,
    );
    const pickedGallerySourceUrl = sourceGalleryUrlsForSlot[0] ?? null;

    let aiEnhanceApplied = captionDrivenGenerated;
    let aiEnhanceSkipReason: string | undefined = captionDrivenGenerated
      ? 'caption_driven_visual'
      : undefined;
    let aiEnhanceApiFailed = false;

    // ── Designed / fal background enhance ───────────────────────────────────
    // Photo pass BEFORE Remotion/fal typography compose. Gated by aiVisualStandard
    // (gallery_only → no-op). Product staging may run even for non-venue e-commerce.
    const designedBgProductStaging =
      resolvedVisualSubject === 'product_hero'
      || aiVisualStandard.visualSubject === 'product_hero'
      || aiVisualStandard.adaptiveSceneMode === 'product_showcase';
    if (
      !captionDrivenGenerated
      && isFalDesignedPostSlotEarly
      && referenceUrl
      && aiVisualStandard.enabled
      && (!isNonVenueSectorProfile(brandBusinessType) || designedBgProductStaging)
    ) {
      const bgEnhance = await runGptImageEnhanceForIdea({
        baseUrl: routeBaseUrl,
        workspaceId,
        photoUrls: [referenceUrl],
        brandName: resolvedBrandName,
        businessType: brandBusinessType,
        level: aiPhotoEnhanceLevel,
        assignment,
        contentKind: kind,
        visualStandard: aiVisualStandard,
        brandCtx: brandCtxForVisual,
        brandTheme,
        // Product: full scene brief for staging. Venue: brief for lighting/mood only;
        // enhance-product-photo preserves venue via visualSubject.
        sceneBrief: sceneBrief,
        caption,
        headline,
        strategicPurpose,
        mood,
        cta,
        missionBrief: missionVisualBrief,
        logoUrl: brandLogoUrl || undefined,
        referenceImageUrls: (brandCtx.reference_image_urls as string[] | undefined) ?? [],
        productType: idea.product_type || idea.subject || '',
        maxPhotos: 1,
        missionId: missionId ?? undefined,
        enhancePolicy: {
          businessType: brandBusinessType,
          galleryMatchScore,
          pickedFromBrandGallery,
          referenceIsStock,
          willStoryOverlay: false,
          willDesignedPost: false,
          designedPosterSync: false,
          designedPostPhotoEnhance: true,
          skipEnhanceForDesignedGrade: serverConfig.productionFlags.skipEnhanceForDesignedGrade,
          productionProfile,
        },
      });
      if (bgEnhance.applied && bgEnhance.photoUrls[0]) {
        enhancedGallerySet = [bgEnhance.photoUrls[0]];
        referenceUrl = bgEnhance.photoUrls[0];
        aiEnhanceApplied = true;
        aiEnhanceSkipReason = undefined;
        console.log(
          `[auto-produce] designed/fal background enhanced `
          + `(pipeline=${assignment.pipeline}, subject=${resolvedVisualSubject}): `
          + `"${headline.slice(0, 40)}"`,
        );
      } else {
        aiEnhanceSkipReason = bgEnhance.skipReason ?? 'designed_post_bg_skipped';
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    if (!captionDrivenGenerated && !isFalDesignedPostSlotEarly) {
    // Faz 2.4 — Carousel hero-only enhance (flag-gated, premium korunur).
    // Yalnız kapak fotoğrafına GPT enhance; kalan slide'lar galeriden gelir
    // (Remotion/sharp render-time grade). Default OFF: davranış değişmez.
    const carouselHeroOnly = isCarouselAssignment(kind, assignment)
      && serverConfig.productionFlags.carouselHeroEnhanceOnly
      && productionProfile.tier !== 'premium'
      && enhancedGallerySet.length >= 2;
    const preEnhanceGallerySet = [...enhancedGallerySet];
    const enhanceResult = await runGptImageEnhanceForIdea({
      baseUrl: routeBaseUrl,
      workspaceId,
      photoUrls: carouselHeroOnly ? enhancedGallerySet.slice(0, 1) : enhancedGallerySet,
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
      maxPhotos: carouselHeroOnly
        ? 1
        : (pkgFmt === 'story'
          ? storyGalleryPhotoTarget({ assignment, contentKind: kind, templateFamily: slotStoryTemplateFamily })
          : gallerySequencePhotoTarget(assignment, kind)),
      missionId: missionId ?? undefined,
      enhancePolicy: {
        businessType: brandBusinessType,
        galleryMatchScore,
        pickedFromBrandGallery,
        referenceIsStock,
        willStoryOverlay: willStoryOverlayForEnhance,
        willDesignedPost: false,
        designedPosterSync: isDesignedPostSlotEarly,
        productionProfile,
      },
    });
    if (enhanceResult.applied && enhanceResult.photoUrls.length) {
      if (carouselHeroOnly && enhanceResult.photoUrls[0]) {
        // Enhanced hero + remaining raw gallery slides (carousel shape korunur).
        enhancedGallerySet = [enhanceResult.photoUrls[0], ...preEnhanceGallerySet.slice(1)];
        console.log(
          `[auto-produce] carousel hero-only enhance: 1/${preEnhanceGallerySet.length} enhanced — "${headline.slice(0, 40)}"`,
        );
      } else {
        enhancedGallerySet = enhanceResult.photoUrls;
      }
      referenceUrl = enhancedGallerySet[0]!;
      aiEnhanceApplied = true;
      // GPT enhance USD recorded by /api/enhance-product-photo → gpt_image_enhance category
      console.log(
        `[auto-produce] gpt-image-2 enhance ×${enhanceResult.photoUrls.length} (${aiPhotoEnhanceLevel}): "${headline.slice(0, 40)}"`,
      );
    } else {
      aiEnhanceSkipReason = enhanceResult.skipReason;
      aiEnhanceApiFailed = Boolean(enhanceResult.apiFailed);
      if (aiVisualStandard.enabled) {
        console.warn(
          `[auto-produce] AI enhance istendi ama uygulanmadı (format=${kind}, pipeline=${assignment.pipeline}, ` +
          `role=${assignment.slot_role}): "${headline.slice(0, 40)}"`,
        );
        // Gallery revision mode: never substitute fresh AI when a gallery pick exists.
        if (aiVisualStandard.enhanceGallerySelected && hasRealBrandPhotos) {
          console.warn(
            `[auto-produce] galeri iyileştirme başarısız — ham galeri ile devam: "${headline.slice(0, 40)}"`,
          );
        } else if (!hasRealBrandPhotos && !productionProfile.skipAggressiveEnhance && !isNonVenueSector(brandBusinessType)) {
          // Stock-only gallery → fresh AI from brand + caption (physical venues only).
          console.log(`[auto-produce] GPT enhance failed on seed photo → idea-brief scratch for: "${headline.slice(0, 40)}"`);
          const freshImage = await runScratchVibeImage({ captionDrivenMode: true });
          if (freshImage) {
            referenceUrl = freshImage;
            enhancedGallerySet = [freshImage];
            aiEnhanceApplied = true;
            aiEnhanceSkipReason = undefined;
            captionDrivenGenerated = true;
            galleryMatchScore = null;
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
    }
    }

    enhanceTraces.push({
      idea_index: ideaIndex,
      headline: (ideationHeadline || headline).slice(0, 80),
      pipeline: assignment.pipeline,
      applied: aiEnhanceApplied,
      ...(aiEnhanceSkipReason ? { skip_reason: aiEnhanceSkipReason } : {}),
      ...(aiEnhanceApiFailed ? { api_failed: true } : {}),
      ...(captionDrivenGenerated ? { caption_driven: true } : {}),
    });

    if (!captionDrivenGenerated && pickedGallerySourceUrl) {
      markSourceGalleryUsed(galleryUsage, batchUsedByType, pickedGallerySourceUrl, postType);
      batchUsedGalleryMission.add(normalizeGalleryUrl(pickedGallerySourceUrl));
    }

    const isReel     = kind === 'instagram_reel' || assignmentImpliesReel(assignment.slot_role);
    const isCarousel = isCarouselAssignment(kind, assignment);
    const isCanvas   = kind === 'instagram_canvas';
    const hasEventDetails = Boolean(idea.event_details?.artist_name || idea.event_details?.date);
    const vibeProfile = hasVibe ? (brandCtx.brand_vibe_profile as Record<string, unknown>) : undefined;

    let reelFailureReason: string | null = null;
    let falPipelineFailureReason: string | null = null;

    // ── Step 2: Agency production ─────────────────────────────────────
    // Event overlay (story/post/canvas with event_details)
    //              → GPT-image-1 eventOverlayMode: photo bg + minimal gradient + text
    // Carousel     → 3-4 gallery photos enhanced with vibe DNA → media_urls
    // Reel         → fal.ai image-to-video (~$0.10/5s)
    // Post/Story   → gpt-image-2 (AI ayar açık) → Remotion motion/still (marka token + şablon)
    // Reel         → fal.ai designer video
    let imageUrl: string | null = null;
    let videoUrl: string | null = null;
    let carouselUrls: string[] = [];
    let carouselShortfallReason: string | null = null;
    let videoProduceMeta: VideoProduceMeta | null = null;

    // ── Product Showcase pipeline (AI background replacement) ───────
    const isProductShowcase = assignment.pipeline === 'product_showcase'
      || assignment.slot_role === 'product_showcase_post'
      || assignment.slot_role === 'product_showcase_story';
    const isFalMissionVideo = isFalVideoPipeline(assignment.pipeline);
    const isFalDesignPost = isFalDesignPipeline(assignment.pipeline) || isPaidAdSlot;
    const isFalOnlyPost = isFalOnlyPostPipeline(assignment.pipeline);
    const isFalOnlyVideo = isFalOnlyVideoPipeline(assignment.pipeline);
    const isPremiumEditorial = isPremiumEditorialPipeline(assignment.pipeline)
      || assignment.slot_role === 'premium_editorial_campaign_post'
      || assignment.slot_role === 'premium_editorial_campaign_story';
    const usesFalDesignerTrack = isFalMissionVideo || isFalDesignPost || isFalOnlyPost || isFalOnlyVideo
      || isPremiumEditorial;
    const falBriefFormat: 'post' | 'reel' | 'story' = isCalendarSlot
      ? (pkgFmt === 'story' ? 'story' : 'post')
      : isPaidAdSlot || isFalDesignPost || isFalOnlyPost
        ? 'post'
        : assignment.pipeline === 'fal_story'
          || assignment.slot_role === 'campaign_story_motion'
          || assignment.slot_role === 'fal_only_story'
          ? 'story'
          : 'reel';
    const calendarDesignLayout = isCalendarSlot
      ? resolveCalendarDesignLayout({
        announcementType: String(
          ideaRecord.calendar_announcement_type
          ?? ideaRecord.template_use_case
          ?? ideaRecord.announcement_type
          ?? '',
        ),
        channel: falBriefFormat === 'story' ? 'story' : 'post',
        sector: brandBusinessType,
        explicitLayoutFamily: readExplicitCalendarDesignLayoutFamily(ideaRecord),
      })
      : null;
    if (calendarDesignLayout) {
      console.log(
        `[auto-produce] [calendar-layout] archetype=${calendarDesignLayout.canvaArchetypeId} ` +
        `layout=${calendarDesignLayout.layoutFamilyHint} source=${calendarDesignLayout.source}`,
      );
    }
    // Ad-hoc New Brief uses the same designed track as mission slots (catalog
    // template + fal design context). Gate is usesFalDesignerTrack only.
    const falDesignCtx = usesFalDesignerTrack
      ? resolveFalDesignPromptContext({
          caption,
          headline,
          mood,
          strategicPurpose,
          templateUseCase,
          format: falBriefFormat,
          slotRole: assignment.slot_role,
          sceneHint: falSceneHint,
          // A defaulted matrix result is not a choice. Fed in as an explicit id it
          // becomes absolute and switches off sector rotation plus the repeat
          // penalty; fed in as a hint it still scores +120. Either way the default
          // wins, which is how one archetype ended up on 233 live frames — so a
          // fallback yields to the assignment's own hint and to rotation.
          layoutFamilyHint: (calendarDesignLayout && !calendarDesignLayout.isFallback
            ? calendarDesignLayout.layoutFamilyHint
            : undefined) ?? assignment.layout_family_hint,
          explicitCanvaArchetypeId: calendarDesignLayout && !calendarDesignLayout.isFallback
            ? calendarDesignLayout.canvaArchetypeId
            : undefined,
          falDesignHint: assignment.fal_design_hint,
          reelArtDirection: assignment.reel_art_direction,
          reelSupportingSubjects: assignment.reel_supporting_subjects,
          referencePhotoUrl: referenceUrl || undefined,
          premiumComposition: extractPremiumComposition(idea),
          agentFalDesignBrief: readAgentFalDesignBrief(idea as Record<string, unknown>),
          sector: brandBusinessType,
          usedArchetypeIds: missionFalArchetypesUsed,
          falSlotOrdinal: missionFalArchetypesUsed.length,
          tenantPreferredArchetypes: readTenantPreferredCanvaArchetypes(brandTheme),
          brandLogoPosition: readBrandLogoPosition(brandTheme),
        })
      : null;
    if (falDesignCtx?.brief.canvaArchetypeId) {
      missionFalArchetypesUsed.push(falDesignCtx.brief.canvaArchetypeId);
      console.log(
        `[auto-produce] [fal-design] archetype=${falDesignCtx.brief.canvaArchetypeId} ` +
        `slot=${assignment.slot_role} used_in_mission=[${missionFalArchetypesUsed.join(', ')}]`,
      );
    }
    let falGrafikerScore: number | null = null;
    let falGrafikerPass = true;
    let falDesignEngine: string | null = null;
    let brandDesignTemplateId: string | null = null;
    let brandDesignTemplateType: string | null = null;
    let brandDesignTemplateName: string | null = null;
    let brandDesignTemplateMatchQuality: string | null = null;
    let pipelineArtifactMetaPatch: Record<string, unknown> | null = null;

    const calendarAnnouncementType = String(
      ideaRecord.calendar_announcement_type
      ?? ideaRecord.template_use_case
      ?? ideaRecord.announcement_type
      ?? '',
    );
    const calendarEventOverlay = isCalendarSlot
      ? resolveCalendarEventOverlay({
        idea: ideaRecord,
        announcementType: calendarAnnouncementType,
        headline,
        canvaArchetypeId: calendarDesignLayout?.canvaArchetypeId,
      })
      : null;
    if (
      calendarEventOverlay?.headline
      && calendarEventOverlay.headline !== headline
      && !shouldPreserveLockedPunchlineHeadline(lockedFalPunchlineSource)
    ) {
      headline = calendarEventOverlay.headline;
      ideationHeadline = calendarEventOverlay.headline;
    } else if (
      calendarEventOverlay?.headline
      && shouldPreserveLockedPunchlineHeadline(lockedFalPunchlineSource)
    ) {
      console.log(
        `[auto-produce] keep locked punchline (${lockedFalPunchlineSource}) — `
        + `skip event title "${calendarEventOverlay.headline.slice(0, 36)}"`,
      );
    }
    const falTypoSlot = assignment.library_slot_key
      ? getLibrarySlotByKey(templateLibrary, assignment.library_slot_key)
      : undefined;
    // Punchline already on headline → keep schedule only (drop redundant tagline support).
    const falCalendarSubtitleRaw = isCalendarSlot
      ? (
        shouldPreserveLockedPunchlineHeadline(lockedFalPunchlineSource)
          ? (
            calendarEventOverlay?.subtitle?.split('|')[0]?.trim()
            || undefined
          )
          : (
            calendarEventOverlay?.subtitle
            ?? String(
              ideaRecord.tagline ?? ideaRecord.subline
              ?? (idea.event_details as Record<string, unknown> | undefined)?.tagline
              ?? '',
            ).trim()
          )
      ) || undefined
      : undefined;
    // Library slot showSubline=false → never paint calendar support line.
    const falCalendarSubtitle = resolveSlotSublineForRender(falCalendarSubtitleRaw, {
      librarySlot: falTypoSlot,
    });
    const falSlotTypography = usesFalDesignerTrack
      ? resolveSlotRenderTypography({
        slot: {
          fontMode: falTypoSlot?.fontMode,
          fontPersonality: falTypoSlot?.fontPersonality,
          headingFont: falTypoSlot?.headingFont,
          bodyFont: falTypoSlot?.bodyFont,
          format: falBriefFormat === 'story' ? 'story' : 'post',
          storyTemplateId: falTypoSlot?.storyTemplateId,
          posterTemplateId: falTypoSlot?.posterTemplateId,
        },
        templateId: falTypoSlot?.storyTemplateId ?? falTypoSlot?.posterTemplateId,
        format: falBriefFormat === 'story' ? 'story' : 'post',
        brandHeadingFont: brandTokens.headingFont,
        brandBodyFont: brandTokens.bodyFont,
        sector: brandBusinessType,
      })
      : null;

    let falGridRotationDirectives: string[] = [];
    let falGridIntensityOverride: import('@/lib/fal-design-intensity').FalDesignIntensityLevel | undefined;
    let falGridBackgroundOverride: TypographyBackgroundStyle | undefined;
    let slotFalGridSurface: FalGridSurfaceKind | null = null;

    if (usesFalDesignerTrack && !isCalendarSlot) {
      const intensityChannel = falBriefFormat === 'post'
        ? 'post'
        : falBriefFormat === 'story'
          ? 'story'
          : 'reel';
      const typoConfig = (brandTheme?.typography_design ?? brandTheme?.typographyDesign) as
        | { background_style?: TypographyBackgroundStyle }
        | undefined;
      const baseIntensity = resolveFalDesignIntensityForChannel(brandTheme, intensityChannel);
      const baseBackground: TypographyBackgroundStyle = referenceUrl
        ? 'photo_overlay'
        : (typoConfig?.background_style ?? 'gradient_mesh');
      // Catalog-pinned library templates own layout — do not rotate surfaces/intensity.
      if (libraryCatalogPinned) {
        slotFalGridSurface = classifyFalGridSurface({
          intensityLevel: baseIntensity,
          backgroundStyle: baseBackground,
          hasReferencePhoto: Boolean(referenceUrl),
          archetypeId: falDesignCtx?.brief.canvaArchetypeId,
          layoutPattern: falDesignCtx?.brief.layoutPattern,
        });
        missionFalGridSurfacesUsed.unshift(slotFalGridSurface);
        console.log(
          `[auto-produce] fal grid surface locked to library template: ${slotFalGridSurface} ` +
          `catalog=${assignment.catalog_slot_key ?? ideaRecord.catalog_slot_key ?? '-'}`,
        );
      } else {
        const gridRotation = rotateFalDesignSurfaceForGrid({
          channel: intensityChannel,
          baseIntensity,
          baseBackgroundStyle: baseBackground,
          hasReferencePhoto: Boolean(referenceUrl),
          archetypeId: falDesignCtx?.brief.canvaArchetypeId,
          layoutPattern: falDesignCtx?.brief.layoutPattern,
          recentSurfaceKinds: missionFalGridSurfacesUsed,
        });
        if (gridRotation.rotated) {
          console.log(
            `[auto-produce] fal grid surface rotation: ${gridRotation.surfaceKind} ` +
            `intensity=${gridRotation.designIntensityLevel} bg=${gridRotation.backgroundStyle} ` +
            `(avoid repeat of ${missionFalGridSurfacesUsed[0] ?? 'none'})`,
          );
        }
        falGridRotationDirectives = gridRotation.gridRotationDirectives;
        falGridIntensityOverride = gridRotation.designIntensityLevel;
        falGridBackgroundOverride = gridRotation.backgroundStyle;
        slotFalGridSurface = gridRotation.surfaceKind;
        missionFalGridSurfacesUsed.unshift(gridRotation.surfaceKind);
      }
    }

    const falIntensityChannel = falBriefFormat === 'post'
      ? 'post'
      : falBriefFormat === 'story'
        ? 'story'
        : 'reel';
    const calendarIntensityBundle = isCalendarSlot
      ? resolveCalendarSlotDesignIntensity(
        ideaRecord,
        brandTheme as Record<string, unknown> | null | undefined,
        falIntensityChannel,
      )
      : null;
    if (calendarIntensityBundle) {
      console.log(
        `[auto-produce] calendar fal intensity (${calendarIntensityBundle.source}): `
        + `${calendarIntensityBundle.level} — "${headline.slice(0, 40)}"`,
      );
    }

    // ── FAL pipeline tracks (handler dispatch — b2b) ──────────────────────────
    if (
      usesFalDesignerTrack
      && hasRealBrandPhotos
      && !referenceUrl
      && !forceAttachedPhotos
      && !galleryEscalatedToFalOnly
    ) {
      console.warn(
        `[auto-produce] fal slot skipped — brand gallery required, no headline-matched photo: "${headline.slice(0, 48)}"`,
      );
    }
    // The fal_video (designer video + raw I2V fallback), fal_design (Canva-like
    // designed feed post) and fal_only (pure fal.ai) branches are now
    // ProductionPipelineHandlers. The dispatch runs them in the original order,
    // with the same guards, mutating a shared slot state seeded from — and written
    // back to — the loop locals. Behavior is identical to the previous inline blocks.
    {
      const slotCtx: SlotProductionContext = {
        inputs: {
          workspaceId,
          pipeline: assignment.pipeline,
          slotRole: assignment.slot_role,
          ideaIndex,
          librarySlotKey: assignment.library_slot_key,
          brandTheme,
          templateLibrary,
          brandTokens,
          brandBusinessType,
          brandTone: String(brandCtx.brand_tone ?? ''),
          resolvedBrandName,
          brandLocation,
          brandLogoUrl,
          brandReferenceImageUrls: (brandCtx.reference_image_urls as string[] | undefined) ?? [],
          visualDna: String(brandCtx.visual_dna ?? ''),
          brandDescription: String(brandCtx.description ?? ''),
          brandVibeProfile: hasVibe
            ? (brandCtx.brand_vibe_profile as Record<string, unknown>)
            : null,
          visualStyle: String(brandCtx.visual_style ?? ''),
          caption,
          headline,
          cta,
          mood,
          visualDirection: String(idea.visual_direction ?? '').trim() || undefined,
          strategicPurpose: String(idea.strategic_purpose ?? '').trim() || undefined,
          reelArtDirection: falDesignCtx?.brief.motionCue
            || String(assignment.reel_art_direction ?? '').trim()
            || undefined,
          reelSupportingSubjects: Array.isArray(assignment.reel_supporting_subjects)
            ? assignment.reel_supporting_subjects
            : undefined,
          referenceUrl: referenceUrl || null,
          sceneHint: falSceneHint || undefined,
          grafikerMaxRetries,
          productionTier: productionProfile.tier,
          designBriefDirectives: [
            ...(falDesignCtx?.promptDirectives ?? []),
            ...(calendarEventOverlay?.directives ?? []),
            ...falGridRotationDirectives,
            ...(adPublishChannel ? resolveFalAdCreativeDirectives(adPublishChannel) : []),
            ...(visualDesignCardOverlayApplied && slotVisualDesignCard
              ? [
                `ON-CANVAS HEADLINE (verbatim, mission design card): "${headline.slice(0, 48)}"`,
                ...(slotVisualDesignCard.image_generation_prompt
                  ? [`MISSION DESIGN CARD LAYOUT CUES: ${String(slotVisualDesignCard.image_generation_prompt).slice(0, 420)}`]
                  : []),
                ...(slotVisualDesignCard.background_intent
                  ? [`Background intent: ${String(slotVisualDesignCard.background_intent).slice(0, 120)}`]
                  : []),
              ]
              : []),
          ],
          designerMotionCue: falDesignCtx?.brief.motionCue || (adHocBrief ? String((idea as ParsedIdea).motion_cue ?? '') : undefined),
          // Reels need brief-specific art direction on every mission — not only ad-hoc.
          artDirection: String(idea.visual_direction ?? '').trim() || undefined,
          falLogoPlacement: falDesignCtx?.brief.logoPlacement,
          isFalMissionVideo,
          isFalDesignPost,
          isFalOnlyPost,
          isFalOnlyVideo,
          isProductShowcase,
          adHocBrief,
          announcementType: calendarAnnouncementType || templateUseCase || undefined,
          templateUseCase: templateUseCase || undefined,
          catalogSlotKey: assignment.catalog_slot_key ?? (ideaRecord.catalog_slot_key as string | undefined),
          slotPromptPack: (() => {
            const key = String(
              assignment.catalog_slot_key ?? ideaRecord.catalog_slot_key ?? '',
            ).trim();
            if (!key || !brandActiveSlots) return null;
            const hit = brandActiveSlots.slots.find((s) => s.slotKey === key);
            return hit?.promptPack ?? null;
          })(),
          reelMotionSpec: (() => {
            const direct = ideaRecord.reel_motion_spec ?? ideaRecord.reelMotionSpec;
            if (direct && typeof direct === 'object') return direct as Record<string, unknown>;
            const vps = ideaRecord.visual_production_spec;
            if (vps && typeof vps === 'object') {
              const nested = (vps as Record<string, unknown>).reel_motion_spec
                ?? (vps as Record<string, unknown>).reelMotionSpec;
              if (nested && typeof nested === 'object') return nested as Record<string, unknown>;
            }
            return null;
          })(),
          montagePhotoUrls: (() => {
            if (!isFalMissionVideo && !isFalOnlyVideo) return undefined;
            const primary = referenceUrl ? normalizeGalleryUrl(referenceUrl) : '';
            const extras: string[] = [];
            for (const u of galleryPhotos) {
              if (!u?.trim()) continue;
              if (primary && normalizeGalleryUrl(u) === primary) continue;
              if (isStockGalleryPhotoUrl(u)) continue;
              extras.push(u);
              if (extras.length >= 4) break;
            }
            return extras.length ? extras : undefined;
          })(),
          galleryAnalysis: galleryMeta,
          brandActiveSlots,
          falAspectRatio: resolveFalSlotAspectRatio({
            isPaidAd: isPaidAdSlot,
            pipeline: assignment.pipeline,
            slotRole: assignment.slot_role,
            formatHint: pkgFmt,
            kind,
            explicit: isCalendarSlot && pkgFmt === 'story' ? '9:16' : null,
          }),
          requireGroundedGallery: resolveFalRequireGroundedGallery({
            requireGroundedGallery: isCalendarSlot || adHocBrief || isPaidAdSlot,
            referencePhotoUrl: referenceUrl,
            sector: brandBusinessType,
            hasRealBrandGallery: hasRealBrandPhotos,
            pipeline: isFalMissionVideo
              ? (assignment.pipeline === 'fal_reel' ? 'fal_reel' : 'fal_story')
              : undefined,
            // Escalation may keep a venue fallback photo — still grounded.
            captionDrivenGenerated: galleryEscalatedToFalOnly ? false : captionDrivenGenerated,
          }),
          hasRealBrandGallery: hasRealBrandPhotos,
          captionDrivenGenerated,
          falDesignIntensityOverride: calendarIntensityBundle?.level
            ?? falGridIntensityOverride,
          falBackgroundStyleOverride: falGridBackgroundOverride,
          falGridSurfaceKind: slotFalGridSurface ?? undefined,
          // Strong ideation caption is publish + overlay SSOT — do not rewrite
          // on-canvas copy away from the Instagram under-post text.
          captionAwareHeadline: originalIdeationCaption.trim().length < 24,
          punchlineLockSource: lockedFalPunchlineSource,
          falSubtitle: falCalendarSubtitle,
          falFontPersonality: falSlotTypography?.fontPersonality,
          falHeadingFont: falSlotTypography?.headingFont,
          falBodyFont: falSlotTypography?.bodyFont,
          layoutFamilyHint: calendarDesignLayout?.layoutFamilyHint
            ?? assignment.layout_family_hint
            ?? null,
        },
        state: {
          imageUrl,
          videoUrl,
          falGrafikerScore,
          falGrafikerPass,
          falDesignEngine,
          videoProduceMeta,
          costDelta: 0,
          pipelineFailureReason: null,
          artifactMetaPatch: null,
        },
      };
      await runPipelineStages(slotCtx, [
        falVideoHandler,
        premiumEditorialHandler,
        falDesignHandler,
        falOnlyHandler,
        productShowcaseHandler,
      ]);
      imageUrl = slotCtx.state.imageUrl;
      videoUrl = slotCtx.state.videoUrl;
      if (videoUrl && !isPlayableVideoUrl(videoUrl)) {
        console.warn(
          `[auto-produce] rejecting non-MP4 videoUrl (fal still_fallback guard): ${videoUrl.slice(0, 120)}`,
        );
        videoUrl = null;
      }
      falGrafikerScore = slotCtx.state.falGrafikerScore;
      falGrafikerPass = slotCtx.state.falGrafikerPass;
      falDesignEngine = slotCtx.state.falDesignEngine;
      brandDesignTemplateId = slotCtx.state.brandDesignTemplateId ?? null;
      brandDesignTemplateType = slotCtx.state.brandDesignTemplateType ?? null;
      brandDesignTemplateName = slotCtx.state.brandDesignTemplateName ?? null;
      brandDesignTemplateMatchQuality = slotCtx.state.brandDesignTemplateMatchQuality ?? null;
      videoProduceMeta = slotCtx.state.videoProduceMeta;
      costEstimate += slotCtx.state.costDelta;
      pipelineArtifactMetaPatch = slotCtx.state.artifactMetaPatch ?? null;
      if (slotCtx.state.pipelineFailureReason && !reelFailureReason) {
        reelFailureReason = slotCtx.state.pipelineFailureReason;
      }
      if (slotCtx.state.pipelineFailureReason) {
        falPipelineFailureReason = slotCtx.state.pipelineFailureReason;
      }
    }

    // Event / canvas — announcement card (buildEventCardPayload) → Remotion fallback
    // Calendar fal_designed_post slots already have a gallery-grounded fal output — do not overwrite.
    if (
      !isProductShowcase
      && !isFalMissionVideo
      && !isCalendarSlot
      && !(isFalDesignPost && imageUrl)
      && (isCanvas || (hasEventDetails && !isReel && !isCarousel))
    ) {
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
      if (!cardUrl && shouldUseMarkyLayer(productionProfile)) {
        cardUrl = await generateMarkyLayerCard({
          workspaceId,
          headline,
          caption,
          brandName: resolvedBrandName,
          location: brandLocation,
          businessType: brandBusinessType,
          mood,
          vibeProfile,
          referenceImageUrl: referenceUrl ?? '',
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
      const carouselExclude = getExcludeUrlsForPostType(
        galleryUsage, 'carousel', batchUsedByType.carousel,
      );
      const carouselMinScore = MIN_ACCEPT_SCORE;
      const carouselVisualDirection = String(idea.visual_direction ?? '').trim() || undefined;

      if (hasGallery) {
        const carouselResult = await generateVibeCarousel({
          workspaceId,
          headline,
          caption,
          brandName:    resolvedBrandName,
          location:     brandLocation,
          businessType: brandBusinessType,
          mood,
          visualDirection: carouselVisualDirection,
          strategicPurpose: strategicPurpose || undefined,
          subjectKey: ideationSubjectKey || undefined,
          galleryAnalysis: galleryMeta,
          candidateUrls: galleryPhotos,
          excludeUrls: carouselExclude,
          count:        CAROUSEL_TARGET_SLIDES,
          minScore:     carouselMinScore,
          minSlides:    CAROUSEL_MIN_SLIDES,
        });
        carouselUrls = carouselResult.enhancedUrls;
        carouselGalleryUrls = carouselResult.galleryUrls;
        for (const gUrl of carouselGalleryUrls) {
          markSourceGalleryUsed(galleryUsage, batchUsedByType, gUrl, 'carousel');
        }
        costEstimate += carouselUrls.length > 0 ? 0.04 : 0; // only hero slide enhanced
      }
      const filled = fillCarouselPhotoPool(
        carouselUrls,
        carouselGalleryUrls,
        galleryPhotos,
      );
      carouselUrls = filled.carouselUrls;
      carouselGalleryUrls = filled.carouselGalleryUrls;
      // Do not pad a failed carousel with a single reference photo — publish path
      // degrades to feed post when <2 caption-aligned slides remain.
      if (carouselUrls.length < CAROUSEL_MIN_SLIDES) {
        console.log(
          `[auto-produce] Carousel under-filled (${carouselUrls.length}/${CAROUSEL_MIN_SLIDES} caption-aligned) — "${headline.slice(0, 40)}"`,
        );
        // No slides and no pinned photo means the gallery could not serve this
        // slot. Say so, instead of the generic "no image or video URL" that reads
        // as a render bug and gets retried until attempts run out.
        if (!carouselUrls.length) {
          carouselShortfallReason = galleryPhotos.length
            ? galleryRematchErrorMessage('no_aligned_candidate')
            : galleryRematchErrorMessage('no_photos');
        }
      } else {
        console.log(
          `[auto-produce] Carousel slides: ${carouselUrls.length} (gallery=${carouselGalleryUrls.length}`
          + `${ideationSubjectKey ? `, subject=${ideationSubjectKey}` : ''}) — "${headline.slice(0, 40)}"`,
        );
      }
      // ── Branded carousel frame overlay ──────────────────────────────────
      // Apply agency-grade frame overlays to carousel slides:
      // slide 1: headline overlay, slides 2-N: slide number + swipe hint, last: CTA
      if (carouselUrls.length >= 2) {
        const preCompositorCarouselUrls = [...carouselUrls];
        try {
          const { compositeCarouselFrames, fetchCarouselImageBuffer } = await import('@/lib/carousel-compositor');
          const { persistCarouselSlideBuffers } = await import('@/lib/persist-enhanced-images');
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
            const persistedSlides = await persistCarouselSlideBuffers(buffers, workspaceId);
            if (persistedSlides.length >= 2 && persistedSlides.length === buffers.length) {
              carouselUrls = persistedSlides;
            } else {
              console.warn(
                `[auto-produce] Carousel R2 persist incomplete (${persistedSlides.length}/${buffers.length}), using pre-compositor urls`,
              );
              carouselUrls = preCompositorCarouselUrls;
            }
            costEstimate += 0.001 * buffers.length; // sharp compositing cost
            console.log(`[auto-produce] Carousel branded frames applied: ${buffers.length} slides`);
          }
        } catch (cErr: any) {
          console.warn('[auto-produce] Carousel compositor failed, using raw urls:', cErr?.message);
        }
      }

      imageUrl = carouselUrls[0] ?? referenceUrl;

    } else if (isReel && !isHeroReel && !isFalMissionVideo && !isFalOnlyVideo) {
      reelFailureReason = heroReelsProducedInMission >= maxHeroReelsPerMission
        ? `Mission reel limiti (${maxHeroReelsPerMission})`
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
      isFalDesignPipeline(assignment.pipeline)
      || assignment.slot_role === 'designed_post'
      || assignment.slot_role === 'designed_typography';
    const isFalDesignedPostSlot =
      isFalDesignPipeline(assignment.pipeline)
      || assignment.slot_role === 'designed_post'
      || assignment.slot_role === 'designed_typography'
      || assignment.slot_role === 'fal_designed_post';
    if (isFalDesignedPostSlot) {
      if (!selectedVisualDesignCard && visualDesignCards.length) {
        const chosen = pickMissionVisualDesignCard({
          cards: visualDesignCards,
          idea: ideaRecord,
          usedIndices: usedVisualDesignCardIndices,
          designedPostOrdinal,
        });
        if (chosen) {
          selectedVisualDesignCard = chosen.card;
          selectedVisualDesignCardIndex = chosen.index;
          usedVisualDesignCardIndices.add(chosen.index);
          designedPostOrdinal += 1;
        }
      }
    }
    const willStoryOverlaySoon = bundleCards !== false && isStoryIdeaEarly && Boolean(referenceUrl)
      && !isOrganicStoryStill && !isFalDesignedPostSlot && !isFalMissionVideo && !isFalOnlyVideo;
    const skipMarkyLayer = Boolean(videoUrl) || isReel || (isCarousel && carouselUrls.length >= 2)
      || willStoryOverlaySoon
      || (isOrganicStoryStill && isStoryIdeaEarly && !productionProfile.requireDesignedVisuals)
      || galleryOnlyVisual
      || !shouldUseMarkyLayer(productionProfile);
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
          referenceImageUrl: referenceUrl ?? undefined,
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
        && shouldAutoProduceEnhanceGallery(brandBusinessType)
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
          referenceImageUrl: referenceUrl ?? undefined,
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

    // APO-4: designed_post — kampanya → event overlay; diğer → Remotion still
    let designedPosterSyncUrl: string | null = null;
    let designedPosterGrafikerScore: number | null = null;
    let designedPosterGrafikerPass = true;
    let designedPosterTemplateMeta: Record<string, unknown> = {};

    const isCampaignDesignedPost = !isFalMissionVideo
      && !isFalDesignPost
      && isDesignedPostSlot
      && !isReel
      && !isCarousel
      && (assignment.publish_channel === 'instagram_campaign' || hasEventDetails || isCampaignContentIdea(ideaRecord));
    if (isCampaignDesignedPost && referenceUrl && !videoUrl && (!imageUrl || imageUrl === referenceUrl)) {
      const posterFmt: 'post' | 'story' = isStoryIdeaEarly ? 'story' : 'post';
      const evDet = idea.event_details;
      const overlayUrl = await generateEventOverlayImage({
        workspaceId,
        headline,
        caption,
        referenceImageUrl: referenceUrl,
        brandName: resolvedBrandName,
        location: brandLocation,
        businessType: brandBusinessType,
        vibeProfile: hasVibe ? (brandCtx.brand_vibe_profile as Record<string, unknown>) : null,
        contentTypeFmt: posterFmt,
        eventDetails: evDet ? {
          artistName: evDet.artist_name,
          date: evDet.date,
          time: evDet.time,
          venueArea: evDet.venue_area ?? resolvedBrandName,
          tagline: evDet.tagline,
          ctaText: evDet.cta_text,
        } : undefined,
      });
      if (overlayUrl) {
        imageUrl = overlayUrl;
        designedPosterSyncUrl = overlayUrl;
        costEstimate += 0.04;
        console.log(`[auto-produce] Campaign event overlay (${posterFmt}): "${headline.slice(0, 40)}"`);
      }
    }
    if (
      isDesignedPostSlot
      && selectedVisualDesignCard
      && referenceUrl
      && !videoUrl
      && (!imageUrl || imageUrl === referenceUrl)
      && !designedPosterSyncUrl
      && !hasReusablePostTemplates
    ) {
      const posterFmt: 'post' | 'story' = isStoryIdeaEarly ? 'story' : 'post';
      const cardImageUrl = await generateDesignedImageFromMissionCard({
        workspaceId,
        card: selectedVisualDesignCard,
        headline,
        caption,
        referenceImageUrl: referenceUrl,
        contentType: posterFmt,
        brandName: resolvedBrandName,
        location: brandLocation,
        businessType: brandBusinessType,
        logoUrl: brandLogoUrl || undefined,
        extraReferenceImageUrls: (brandCtx.reference_image_urls as string[] | undefined)?.slice(0, 2),
      });
      if (cardImageUrl) {
        imageUrl = cardImageUrl;
        designedPosterSyncUrl = cardImageUrl;
        missionVisualDesignRendered = true;
        costEstimate += 0.04;
        console.log(
          `[auto-produce] Mission visual design card applied (#${selectedVisualDesignCardIndex ?? 0}): "${headline.slice(0, 40)}"`,
        );
      }
    }
    if (!isFalMissionVideo && isDesignedPostSlot && referenceUrl && !videoUrl && (!imageUrl || imageUrl === referenceUrl) && !designedPosterSyncUrl) {
      // Remotion poster path removed — fal_design pipeline + event overlay handle designed posts.
      const catalogKey = String(assignment.catalog_slot_key ?? '').trim();
      const purposeShellReady = Boolean(
        catalogKey
        && brandActiveSlots?.slots.some((s) => s.slotKey === catalogKey && s.hasTemplate),
      );
      if (purposeShellReady) {
        console.warn(
          `[auto-produce] Designed post slot withheld — refusing fal_only `
          + `(purpose-briefed shell for ${catalogKey}): "${headline.slice(0, 40)}"`,
        );
      } else if (isDesignedPostSlot && !designedPosterSyncUrl) {
        console.warn(
          `[auto-produce] Designed post slot withheld (no branded poster) — trying fal_only fallback: "${headline.slice(0, 40)}"`,
        );
        const designedFallbackPhoto = pickVenueEscalationFallbackPhoto({
          currentReferenceUrl: referenceUrl,
          galleryPhotos,
          brandReferenceImageUrls: (brandCtx.reference_image_urls as string[] | undefined) ?? [],
          sector: brandBusinessType,
          hasRealBrandPhotos,
        }) ?? referenceUrl ?? undefined;
        const designedFallback = await produceFalOnlySlot({
          pipeline: 'fal_only_post',
          workspaceId,
          isFalOnlyPost: true,
          isFalOnlyVideo: false,
          existingImageUrl: imageUrl,
          existingVideoUrl: videoUrl,
          headline,
          caption,
          cta,
          brandName: resolvedBrandName,
          brandColors: { primary: syncPrimaryColor ?? '', accent: syncAccentColor ?? '' },
          brandVibe: null,
          sector: brandBusinessType,
          location: brandLocation,
          mood,
          sceneHint: falSceneHint || undefined,
          logoUrl: brandLogoUrl || undefined,
          grafikerMaxRetries,
          referencePhotoUrl: designedFallbackPhoto,
          brandReferenceImageUrls: (brandCtx.reference_image_urls as string[] | undefined)?.slice(0, 2),
          requireGroundedGallery: resolveFalRequireGroundedGallery({
            referencePhotoUrl: designedFallbackPhoto,
            sector: brandBusinessType,
            hasRealBrandGallery: hasRealBrandPhotos,
            captionDrivenGenerated: false,
          }),
          hasRealBrandGallery: hasRealBrandPhotos,
          captionDrivenGenerated: false,
        });
        if (designedFallback?.imageUrl) {
          imageUrl = designedFallback.imageUrl;
          designedPosterSyncUrl = designedFallback.imageUrl;
          falDesignEngine = designedFallback.falDesignEngine;
          falGrafikerScore = designedFallback.falGrafikerScore;
          falGrafikerPass = designedFallback.falGrafikerPass;
          costEstimate += designedFallback.costDelta;
        } else {
          results.push({
            title: headline,
            imageUrl: '',
            error: designedPosterGrafikerScore != null
              ? `Grafiker ${designedPosterGrafikerScore}/10 — tasarım postu yayına alınmadı`
              : 'Tasarım postu üretilemedi',
            slotKey,
          });
          continue;
        }
      }
    }

    // Organic designed posts — fal_design pipeline handles branded layers.

    // Reels prefer MP4, but fal_reel can still return a designed still when the
    // video provider fails/no_artifact. Keep that still publishable so dynamic
    // brand slot packages do not stall forever on external video availability.
    let falReelStillFallback = false;
    if (isReel && !videoUrl) {
      if (isFalMissionVideo && imageUrl) {
        falReelStillFallback = true;
        console.warn(
          `[auto-produce] fal_reel still fallback (no video): ${headline.slice(0, 50)} — ${reelFailureReason ?? falPipelineFailureReason ?? 'unknown'}`,
        );
      } else {
        console.warn(`[auto-produce] reel skip (no video): ${headline.slice(0, 50)} — ${reelFailureReason ?? 'unknown'}`);
        results.push({
          title: headline,
          imageUrl: referenceUrl ?? '',
          error: reelFailureReason ?? 'Reel videosu üretilemedi (fal.ai)',
          slotKey,
        });
        continue;
      }
    }

    // Guard: skip only when there is no video, still, or gallery reference for Remotion
    if (!videoUrl && !imageUrl && !referenceUrl) {
      if (missionId) {
        console.warn(`[auto-produce] mission slot empty — skipping: "${headline.slice(0, 50)}"`);
      } else {
        console.warn(`[auto-produce] no contentUrl produced for "${headline.slice(0, 50)}", skipping save`);
      }
      const pipelineErr = falPipelineFailureReason ?? carouselShortfallReason;
      results.push({
        title: headline,
        imageUrl: '',
        error: pipelineErr ?? 'Production failed: no image or video URL',
        slotKey,
      });
      continue;
    }
    if (missionId && !videoUrl && !imageUrl && referenceUrl) {
      if (!assignmentRequiresDesignedStoryVisual(assignment)) {
        imageUrl = referenceUrl;
      } else {
        console.warn(
          `[auto-produce] designed story slot withheld — refusing plain gallery fallback `
          + `pipeline=${assignment.pipeline} "${headline.slice(0, 40)}"`,
        );
      }
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
      : (originalIdeationCaption.trim() || caption);
    const publishHashtags = isEventStory ? [] : hashtags;

    const vpsRaw = (idea.visual_production_spec as Record<string, unknown> | undefined);
    const treatment = String(vpsRaw?.treatment || idea.treatment || '').toLowerCase();
    const designedPosterReady = Boolean(designedPosterSyncUrl);
    const markyBranded = !productionProfile.requireDesignedVisuals
      && Boolean(referenceUrl && imageUrl && imageUrl !== referenceUrl)
      && !designedPosterReady;

    // Carousel degradation: <2 slides, or branded composite → single feed post (not IG carousel)
    const carouselPublishAsFeed = isCarousel
      && carouselUrls.length >= 2
      && (markyBranded || designedPosterReady);
    let effectiveKind = (isCarousel && carouselUrls.length < 2) || carouselPublishAsFeed
      ? 'instagram_post'
      : kind;
    let effectiveFmt = (isCarousel && carouselUrls.length < 2) || carouselPublishAsFeed
      ? 'post'
      : fmt;
    if (adHocBrief && pkgFmt === 'story') {
      effectiveKind = 'instagram_story';
      effectiveFmt = 'story';
    } else if (adHocBrief && pkgFmt === 'reel') {
      effectiveKind = 'instagram_reel';
      effectiveFmt = 'reel';
    } else if (assignmentImpliesReel(assignment.slot_role)) {
      effectiveKind = 'instagram_reel';
      effectiveFmt = 'reel';
    } else if (assignmentImpliesStoryFormat(assignment.slot_role)) {
      effectiveKind = 'instagram_story';
      effectiveFmt = 'story';
    } else if (
      assignment.slot_role === 'organic_post'
      || assignment.pipeline === 'gallery_photo'
      || assignment.slot_role === 'designed_post'
      || assignment.slot_role === 'designed_typography'
    ) {
      effectiveKind = 'instagram_post';
      effectiveFmt = 'post';
    }
    if (isPaidAdSlot) {
      effectiveKind = 'ad_creative';
      effectiveFmt = 'ad';
    }
    const persistedCarouselUrls = carouselPublishAsFeed ? [] : carouselUrls;

    const needsStoryAudioStamp = isReel
      || kind === 'instagram_story'
      || kind === 'instagram_canvas'
      || effectiveKind === 'instagram_story'
      || effectiveKind === 'instagram_reel'
      || assignmentImpliesStoryFormat(assignment.slot_role);
    const storyAudioSlotIndex = assignmentImpliesStoryFormat(assignment.slot_role)
      ? storyIndex
      : ideaIndex;
    const resolvedStoryAudioMood = needsStoryAudioStamp
      ? resolveStoryAudioMood({
        selected: motionProfile.storyAudioMood,
        pool: motionProfile.audioMoodPool,
        slotIndex: storyAudioSlotIndex,
        sector: brandBusinessType,
      })
      : null;

    // fal returns silent MP4s and the montage step strips audio outright, so the
    // brand's track has to be written into the file here — preview-only playback
    // never reaches a download, a scheduler, or the platform itself.
    let storyAudioMuxed = false;
    let storyAudioMuxSkip: string | null = null;
    if (videoUrl && isPlayableVideoUrl(videoUrl) && resolvedStoryAudioMood) {
      const { muxBackgroundMusicOntoVideoUrl } = await import('@/lib/reel-audio-mux');
      const muxed = await muxBackgroundMusicOntoVideoUrl({
        videoUrl,
        trackId: resolvedStoryAudioMood,
        workspaceId,
      });
      if (muxed.audioApplied) {
        videoUrl = muxed.videoUrl;
        storyAudioMuxed = true;
      } else {
        storyAudioMuxSkip = muxed.skipReason ?? 'unknown';
      }
    }

    const isStoryIdea = kind === 'instagram_story' || kind === 'instagram_canvas'
      || assignmentImpliesStoryFormat(assignment.slot_role);
    const bundleReadyNow = designedPosterReady || markyBranded;

    const designedStoryRequired = assignmentRequiresDesignedStoryVisual(assignment);

    // Designed stills often arrive as data:image — Nexus ContentUrl can't hold them
    // (varchar 1000), so without R2 upload the save path falls back to gallery and
    // Feed shows a raw photo. Persist first; fail loud when design can't be stored.
    if (isDataImageUrl(imageUrl)) {
      const { ensurePersistableProductionImageUrl } = await import('@/lib/persist-enhanced-images');
      const persistedStill = await ensurePersistableProductionImageUrl(imageUrl, workspaceId);
      if (persistedStill) {
        imageUrl = persistedStill;
      } else {
        const designedIntent = Boolean(
          isFalDesignPost
          || isFalOnlyPost
          || isFalMissionVideo
          || isFalOnlyVideo
          || designedStoryRequired
          || designedPosterReady
          || markyBranded,
        );
        if (designedIntent) {
          console.warn(
            `[auto-produce] designed_image_persist_failed "${headline.slice(0, 50)}" — refusing gallery ContentUrl fallback`,
          );
          results.push({
            title: headline,
            imageUrl: '',
            error: 'designed_image_persist_failed',
            slotKey,
          });
          continue;
        }
        imageUrl = null;
      }
    }

    const nexusPrimaryContentUrl = videoUrl
      ?? imageUrl
      ?? (designedStoryRequired ? '' : (galleryPreviewUrl ?? ''));
    if (!nexusPrimaryContentUrl) {
      console.warn(`[auto-produce] no nexus contentUrl for "${headline.slice(0, 50)}", skipping save`);
      results.push({ title: headline, imageUrl: '', error: 'Production failed: no persistable content URL', slotKey });
      continue;
    }

    // `headline` still holds the exact text handed to the design/overlay prompts
    // above. The publish sanitize below re-derives copy under a different budget,
    // so snapshot the canvas value first — otherwise the stored overlay metadata
    // describes a headline nobody ever painted.
    const paintedOverlayHeadline = headline;

    const falOverlayMaxLen =
      kind === 'instagram_reel' ? 22
        : (kind === 'instagram_story' || kind === 'instagram_canvas') ? 28
          : 32;
    const publishHeadline = sanitizeProductionHeadline({
      headline,
      ideationHeadline: usesFalDesignCopy ? headline : storedIdeationHeadline,
      caption: publishCaption || caption,
      brandName: resolvedBrandName,
      conceptTitle: String(idea.concept_title ?? idea.idea_title ?? idea.title ?? ''),
      visualDesignHeadline: vdcHeadline || undefined,
      businessType: brandBusinessType,
      language: brandLanguageCode,
      maxLen: adPublishChannel
        ? adHeadlineCharLimit(adPublishChannel)
        : usesFalDesignCopy
          ? falOverlayMaxLen
          : 72,
    });
    const designOverlayHeadline = publishHeadline;
    headline = designOverlayHeadline;
    if (
      !ideationHeadline
      || isGalleryTagHeadline(ideationHeadline)
    ) {
      ideationHeadline = storedIdeationHeadline || designOverlayHeadline;
    }
    // Card headline was forced into fal overlay / sanitize → mark prompt_used.
    if (visualDesignCardOverlayApplied) {
      missionVisualDesignRendered = true;
    }

    const isVideoMediaUrl = (url: string | null | undefined): boolean =>
      Boolean(url && /\.(mp4|mov|webm)(\?|$)/i.test(url));
    const pickStillPreviewUrl = (...candidates: Array<string | null | undefined>): string | null => {
      for (const candidate of candidates) {
        const url = String(candidate ?? '').trim();
        if (url && !isVideoMediaUrl(url)) return url;
      }
      return null;
    };
    const falDesignedStillUrl = (
      isFalMissionVideo
      || isFalOnlyVideo
      || isFalDesignPost
      || isFalOnlyPost
    ) && imageUrl && !isVideoMediaUrl(imageUrl)
      ? imageUrl
      : null;
    const previewStillUrl = pickStillPreviewUrl(
      designedPosterSyncUrl,
      falDesignedStillUrl,
      markyBranded ? imageUrl : null,
      galleryPreviewUrl,
    );

    // Gallery-only posts carry no on-canvas text, so claiming an overlay headline
    // makes Feed render a caption line as if it were painted typography.
    const overlayWasPainted = Boolean(
      designedPosterSyncUrl
      || falDesignedStillUrl
      || (markyBranded && imageUrl)
      || (usesFalDesignCopy && (imageUrl || videoUrl)),
    );
    const canvasOverlayHeadline = overlayWasPainted ? paintedOverlayHeadline : null;
    if (canvasOverlayHeadline && canvasOverlayHeadline !== designOverlayHeadline) {
      console.warn(
        `[auto-produce] overlay/publish headline drift: canvas "${canvasOverlayHeadline.slice(0, 36)}" `
        + `vs publish "${designOverlayHeadline.slice(0, 36)}"`,
      );
    }

    const contentJson = JSON.stringify({
      kind: effectiveKind,
      contentType: effectiveFmt,
      caption: publishCaption,
      caption_draft: originalIdeationCaption || undefined,
      ideation_caption: originalIdeationCaption || undefined,
      hashtags: publishHashtags,
      cta,
      imageUrl: previewStillUrl ?? undefined,
      posterUrl: previewStillUrl ?? galleryPreviewUrl ?? designedPosterSyncUrl ?? undefined,
      videoUrl: isPlayableVideoUrl(videoUrl) ? videoUrl : null,
      carousel_urls: carouselUrls.length ? carouselUrls : undefined,
      gallery_photo_urls: carouselGalleryUrls.length ? carouselGalleryUrls : undefined,
      ...(carouselGalleryUrls.length >= 2 ? { carousel_multi_photo: true } : {}),
      headline: canvasOverlayHeadline ?? designOverlayHeadline,
      ...(canvasOverlayHeadline
        ? { design_overlay_headline: canvasOverlayHeadline }
        : {}),
      ideation_headline: storedIdeationHeadline || undefined,
      idea_index: ideaIndex,
      mission_id: missionId || undefined,
      ...(resolvePlanningIdeaIndex(ideaRecord) != null
        ? { planning_idea_index: resolvePlanningIdeaIndex(ideaRecord) }
        : {}),
      node_key: nodeKey || undefined,
      ...(bundleReadyNow ? {
        production_bundle: true,
        bundle_status: 'ready',
        idea_id: ideaId,
      } : {}),
      agency_branded: markyBranded,
      ai_gallery_enhanced: aiEnhanceApplied,
    });

    const ideaCostUsd = Math.round((costEstimate - ideaCostBefore) * 1000) / 1000;

    // Log-only rollup — per-call fal/OpenAI events are SSOT (persist:false avoids double-count).
    if (ideaCostUsd > 0) {
      const { emitAiCostLine } = await import('@/lib/ai-cost-telemetry');
      emitAiCostLine({
        callType: 'other',
        usd: ideaCostUsd,
        missionId: missionId ?? null,
        workspaceId,
        slotKey: `${ideaIndex}::${assignment.slot_role}`,
        slotRole: assignment.slot_role,
        ideaIndex: resolvedIdeaIndex,
        pipeline: String(assignment.pipeline ?? ''),
        detail: `slot-rollup:${assignment.pipeline ?? assignment.slot_role}`,
        persist: false,
      });
    }

    const storySlotMeta: Record<string, unknown> = {};
    const resolvedCatalogSlotKey = assignment.catalog_slot_key
      ?? (ideaRecord.catalog_slot_key as string | undefined);
    const resolvedProductionSlotKey = assignment.library_slot_key
      ?? resolvedCatalogSlotKey;

    if (assignmentImpliesStoryFormat(assignment.slot_role)) {
      const storySlotKey = resolveStoryLibrarySlotKey({
        librarySlotKey: assignment.library_slot_key,
        catalogSlotKey: resolvedCatalogSlotKey,
        activeSlots: brandActiveSlots,
        library: templateLibrary,
        storyIndex,
      });
      if (storySlotKey) storySlotMeta.library_slot_key = storySlotKey;
      if (resolvedCatalogSlotKey) {
        storySlotMeta.catalog_slot_key = resolvedCatalogSlotKey;
      }
    }

    const slotFalRequests = getCapturedFalRequests();
    const metadata: Record<string, unknown> = {
      ...(brandDesignTemplateId
        ? {
          brand_design_template_id: brandDesignTemplateId,
          brand_design_template_type: brandDesignTemplateType,
          brand_design_template_name: brandDesignTemplateName,
          ...(brandDesignTemplateMatchQuality
            ? { brand_design_template_match_quality: brandDesignTemplateMatchQuality }
            : {}),
        }
        : {}),
      cost_usd_estimate: ideaCostUsd,
      contentType: effectiveFmt,
      kind: effectiveKind,
      ...(resolvedStoryAudioMood
        ? {
          story_audio_mood: resolvedStoryAudioMood,
          story_audio_slot_index: storyAudioSlotIndex,
          // Players must not stack a second bed on a file that already carries
          // one — the flag is what lets the preview unmute instead.
          story_audio_muxed: storyAudioMuxed,
          ...(storyAudioMuxSkip ? { story_audio_mux_skip: storyAudioMuxSkip } : {}),
        }
        : {}),
      platform: 'instagram',
      headline: canvasOverlayHeadline ?? designOverlayHeadline,
      ...(canvasOverlayHeadline
        ? { design_overlay_headline: canvasOverlayHeadline }
        : {}),
      caption: publishCaption.slice(0, 2200),
      cta,
      hashtags: publishHashtags,
      strategic_purpose: strategicPurpose,
      auto_produced: true,
      ...(adHocBrief ? { ad_hoc_brief: true } : {}),
      gallery_sourced: !captionDrivenGenerated,
      gallery_only: GALLERY_ONLY,
      ...(captionDrivenGenerated ? { caption_driven_visual: true } : {}),
      ...(galleryMatchScore != null && galleryMatchScore >= MIN_ACCEPT_SCORE
        ? { gallery_match_score: galleryMatchScore }
        : {}),
      ...(storedIdeationHeadline ? { ideation_headline: storedIdeationHeadline.slice(0, 120) } : {}),
      ...(originalIdeationCaption ? { ideation_caption: originalIdeationCaption.slice(0, 500) } : {}),
      ...(originalIdeationCaption ? { caption_draft: originalIdeationCaption.slice(0, 500) } : {}),
      ...(galleryFirstSource ? {
        gallery_first_caption: true,
        caption_source: galleryFirstSource,
      } : {}),
      ...(galleryPhotoDescription
        ? { gallery_photo_description: galleryPhotoDescription.slice(0, 800) }
        : {}),
      ...(photoMetaForCaption
        ? {
          gallery_photo_meta: photoMetaForCaption as Record<string, unknown>,
          caption_hooks: (photoMetaForCaption as GalleryPhotoMeta).captionHooks,
        }
        : {}),
      renderer_executed: (() => {
        if (captionDrivenGenerated) return 'caption_driven_ai';
        if (videoUrl && isFalOnlyVideo) return assignment.pipeline === 'fal_only_reel' ? 'fal_only_reel' : 'fal_only_story';
        if (falReelStillFallback) return 'fal_reel_still_fallback';
        if (videoUrl && isFalMissionVideo) {
          const rawFalI2v = videoProduceMeta
            && (videoProduceMeta.source === 'kling'
              || videoProduceMeta.source === 'luma'
              || videoProduceMeta.source === 'fal_video')
            && !falDesignEngine;
          return rawFalI2v ? 'fal_raw_i2v' : 'fal_designer_video';
        }
        if (isFalOnlyPost && imageUrl && falDesignEngine) {
          return falDesignEngine === 'satori_local' ? 'local_typography' : 'fal_only_post';
        }
        if (isFalDesignPost && imageUrl && falDesignEngine) {
          if (falDesignEngine === 'satori_local') return 'local_typography';
          return falDesignEngine === 'gpt_image_designed'
            ? 'gpt_image_designed_post'
            : 'fal_designer_post';
        }
        // Designed fal_story / fal_only_story still (no video) — library poster path.
        if (
          (isFalMissionVideo || isFalOnlyVideo)
          && imageUrl
          && falDesignEngine
          && !videoUrl
        ) {
          if (falDesignEngine === 'satori_local') return 'local_typography';
          return assignment.pipeline.includes('reel') || falDesignEngine.includes('reel')
            ? 'fal_designer_reel_still'
            : 'fal_designer_story';
        }
        if (videoUrl) return 'fal_reel';
        if (missionVisualDesignRendered) return 'mission_visual_design_card';
        if (designedPosterSyncUrl) return 'designed_poster_sync';
        if (markyBranded && imageUrl && referenceUrl && imageUrl !== referenceUrl) {
          return 'marky_poster';
        }
        if (aiEnhanceApplied && !productionProfile.requireDesignedVisuals) {
          return 'gpt_image_enhance';
        }
        if (assignment.pipeline === 'gallery_photo') return 'gallery_raw';
        return assignment.pipeline;
      })(),
      ...(isFalMissionVideo
        ? {
          production_route: 'fal_ai',
          production_track: 'fal_ai',
          marky_disabled: true,
          ...(falDesignEngine ? { fal_design_engine: falDesignEngine } : {}),
          ...(falGrafikerScore != null ? { grafiker_score: falGrafikerScore, grafiker_pass: falGrafikerPass } : {}),
          typography_text_valid: falGrafikerPass !== false,
        }
        : (isFalOnlyPost || isFalOnlyVideo) && (imageUrl || videoUrl)
          ? {
            production_route: 'fal_only',
            production_track: 'fal_ai',
            fal_only: true,
            marky_disabled: true,
            fal_design_engine: falDesignEngine ?? 'fal_ideogram_only',
            ...(falGrafikerScore != null ? { grafiker_score: falGrafikerScore, grafiker_pass: falGrafikerPass } : {}),
            typography_text_valid: falGrafikerPass !== false,
          }
        : isFalDesignPost && imageUrl && falDesignEngine
          ? {
            production_route: 'fal_ai',
            production_track: 'fal_ai',
            marky_disabled: true,
            fal_designer_produced: true,
            fal_design_engine: falDesignEngine,
            ...(falGrafikerScore != null ? { grafiker_score: falGrafikerScore, grafiker_pass: falGrafikerPass } : {}),
            // A designed post that came back without painted copy is a failed
            // design, and an unverified render is not a passing one either — only
            // claim valid typography when the canvas actually carries the line.
            ...(overlayWasPainted
              ? (falGrafikerPass != null ? { typography_text_valid: falGrafikerPass } : {})
              : { typography_text_valid: false }),
          }
        : isPremiumEditorial && imageUrl && falDesignEngine
          ? {
            production_route: 'premium_editorial',
            production_track: 'premium_editorial',
            marky_disabled: true,
            fal_designer_produced: true,
            fal_design_engine: falDesignEngine,
            premium_composition: true,
            ...(falGrafikerScore != null ? { grafiker_score: falGrafikerScore, grafiker_pass: falGrafikerPass } : {}),
            typography_text_valid: falGrafikerPass !== false,
          }
        : productionProfile.requireDesignedVisuals
          ? { production_route: 'designed_grafiker', marky_disabled: true }
          : {}),
      flux_used: false,
      agency_defaults_forced: agencyProductionForced,
      agency_produced: markyBranded || Boolean(designedPosterSyncUrl) || Boolean(videoUrl) || isCanvas || (isCarousel && carouselUrls.length > 0) || (isFalDesignPost && Boolean(imageUrl) && Boolean(falDesignEngine)) || ((isFalOnlyPost || isFalOnlyVideo) && Boolean(imageUrl || videoUrl)) || ((isFalMissionVideo || isFalOnlyVideo) && Boolean(imageUrl) && Boolean(falDesignEngine)) || (isPremiumEditorial && Boolean(imageUrl) && Boolean(falDesignEngine)),
      hero_reel_produced: Boolean(videoUrl) && !isFalMissionVideo && !isFalOnlyVideo,
      fal_video_produced: isPlayableVideoUrl(videoUrl) && (isFalMissionVideo || isFalOnlyVideo),
      fal_reel_still_fallback: falReelStillFallback,
      // Story/reel fal stills set falDesignEngine (poster path); posts already did.
      fal_designer_produced: (Boolean(videoUrl) && (isFalMissionVideo || isFalOnlyVideo))
        || falReelStillFallback
        || ((isFalDesignPost || isFalOnlyPost || isPremiumEditorial) && Boolean(imageUrl) && Boolean(falDesignEngine))
        || ((isFalMissionVideo || isFalOnlyVideo) && Boolean(imageUrl) && Boolean(falDesignEngine)),
      ...(falDesignEngine === 'satori_local' ? { typography_model: 'satori_local' } : {}),
      ...(isFalMissionVideo && videoProduceMeta ? { fal_video_model: videoProduceMeta.source } : {}),
      ...(videoProduceMeta ? {
        video_source: videoProduceMeta.source,
        video_strategy: videoProduceMeta.strategy,
        video_photo_count: videoProduceMeta.photoCount,
        camera_motion: videoProduceMeta.cameraMotion ?? null,
        reel_pace: videoProduceMeta.reelPace ?? null,
        sector_id: videoProduceMeta.sectorId ?? normalizeSectorId(brandBusinessType),
        ...(videoProduceMeta.reelRecipe ? { reel_recipe: videoProduceMeta.reelRecipe } : {}),
        ...(videoProduceMeta.motionMode ? { reel_motion_mode: videoProduceMeta.motionMode } : {}),
        ...(videoProduceMeta.i2vReused ? {
          i2v_reused: true,
          i2v_reused_from_artifact_id: videoProduceMeta.reusedFromArtifactId ?? null,
        } : {}),
      } : {}),
      ...(isPlayableVideoUrl(videoUrl)
        && videoProduceMeta
        && (videoProduceMeta.source === 'kling'
          || videoProduceMeta.source === 'luma'
          || videoProduceMeta.source === 'fal_video')
        ? {
          i2v_source_image_url: videoProduceMeta.motionMode === 'photo_plate'
            ? (pickedGallerySourceUrl ?? referenceUrl ?? null)
            : (pickedGallerySourceUrl ?? referenceUrl ?? null),
          i2v_motion_type: videoProduceMeta.motionMode === 'photo_plate'
            ? 'photo_plate'
            : videoProduceMeta.motionMode === 'locked_graphics'
              ? 'locked_graphics'
              : 'raw_gallery',
        }
        : {}),
      canvas_produced: isCanvas,
      carousel_urls:   persistedCarouselUrls.length ? persistedCarouselUrls : undefined,
      gallery_photo_urls: carouselGalleryUrls.length ? carouselGalleryUrls : undefined,
      ...(carouselGalleryUrls.length >= 2 ? { carousel_multi_photo: true } : {}),
      ...(carouselPublishAsFeed ? { carousel_publish_as: 'feed' } : {}),
      source: adHocBrief ? 'new_brief' : 'auto-produce',
      mission_id: missionId || null,
      node_key: nodeKey || null,
      mood,
      posting_time_suggestion: idea.posting_time_suggestion || null,
      ...publishScheduleToMetadata(
        resolvePublishSchedule({
          idea: idea as Record<string, unknown>,
          ideaIndex,
          feedDirectorReport: feedDirectorReport ?? null,
          formatHint: effectiveFmt,
        }),
      ),
      imageUrl: previewStillUrl ?? undefined,
      videoUrl: isPlayableVideoUrl(videoUrl) ? videoUrl : null,
      ...(falReelStillFallback ? { fal_reel_fallback_reason: reelFailureReason ?? falPipelineFailureReason ?? 'no_artifact' } : {}),
      reference_photo_url: pickedGallerySourceUrl ?? referenceUrl,
      ...(pickedGallerySourceUrl && referenceUrl !== pickedGallerySourceUrl
        ? { enhanced_photo_url: referenceUrl }
        : {}),
      ...(pickedGallerySourceUrl ? { selected_gallery_url: pickedGallerySourceUrl } : {}),
      feed_preview_url: galleryPreviewUrl,
      agency_branded: markyBranded,
      ai_gallery_enhanced: aiEnhanceApplied,
      ai_enhance_attempted: aiVisualStandard.enabled,
      ai_enhance_failed: aiVisualStandard.enabled && !aiEnhanceApplied,
      ...(aiEnhanceSkipReason ? { ai_enhance_skip_reason: aiEnhanceSkipReason } : {}),
      ...(aiEnhanceApiFailed ? { ai_enhance_api_failed: true } : {}),
      ...(captionDrivenGenerated && lastScratchBrief
        ? scratchBriefTelemetry(lastScratchBrief)
        : {}),
      ai_enhance_level: aiVisualStandard.enabled ? aiPhotoEnhanceLevel : undefined,
      ai_visual_standard_enabled: aiVisualStandard.enabled,
      ai_visual_standard: buildAiVisualStandardMetadata(aiVisualStandard, aiPhotoEnhanceLevel, {
        visualSourceMode: resolveVisualSourceMode(brandTheme),
        resolvedVisualSubject,
      }),
      ai_visual_subject_resolved: resolvedVisualSubject,
      visual_source_mode: resolveVisualSourceMode(brandTheme),
      visual_pipeline_steps: resolveVisualPipelineSteps(aiVisualStandard, kind, assignment, {
        willStoryOverlay: false,
        willDesignedPost: false,
        isReel,
        designedPosterSync: designedPosterReady,
        postBrandLayer: false,
      }),
      brandName: resolvedBrandName,
      idea_index: resolvedIdeaIndex,
      ...(resolvePlanningIdeaIndex(ideaRecord) != null
        ? { planning_idea_index: resolvePlanningIdeaIndex(ideaRecord) }
        : {}),
      ...(typeof ideaRecord.calendar_linked_idea_index === 'number'
        ? { calendar_linked_idea_index: ideaRecord.calendar_linked_idea_index }
        : {}),
      // Tüm başarılı üretimler Feed'de görünsün (yedek gizleme yok).
      publish_package: 'primary',
      publish_priority: primaryIdeaIndices.has(resolvedIdeaIndex) ? 'recommended' : 'extended',
      production_role: assignment.slot_role,
      pipeline: assignment.pipeline,
      ...(resolvedCatalogSlotKey ? { catalog_slot_key: resolvedCatalogSlotKey } : {}),
      ...(typeof ideaRecord.catalog_slot_label === 'string' && ideaRecord.catalog_slot_label
        ? { catalog_slot_label: ideaRecord.catalog_slot_label }
        : {}),
      ...(typeof ideaRecord.catalog_slot_picker === 'string' && ideaRecord.catalog_slot_picker
        ? {
          catalog_slot_picker: ideaRecord.catalog_slot_picker,
          ...(typeof ideaRecord.catalog_slot_picker_reason === 'string'
            && ideaRecord.catalog_slot_picker_reason
            ? { catalog_slot_picker_reason: ideaRecord.catalog_slot_picker_reason }
            : {}),
        }
        : {}),
      ...(resolvedProductionSlotKey ? { library_slot_key: resolvedProductionSlotKey } : {}),
      visual_policy: galleryOnlyVisual ? 'gallery_only' : 'designed',
      copy_bundle_id: assignment.copy_bundle_id,
      publish_channel: assignment.publish_channel,
      assignment_rationale: assignment.rationale ?? null,
      ...(isCalendarProductionIdea(ideaRecord)
        ? {
          calendar_plan_index: typeof ideaRecord.calendar_plan_index === 'number'
            ? ideaRecord.calendar_plan_index
            : resolvedIdeaIndex - 1000,
          source_node: 'content_calendar' as const,
          source_track: 'calendar' as const,
          calendar_announcement_type: ideaRecord.calendar_announcement_type ?? null,
        }
        : String(nodeKey ?? '').includes('calendar')
          ? { calendar_plan_index: ideaIndex, source_node: 'content_calendar' as const }
          : {}),
      ...(isPaidAdSlot ? {
        ad_creative: true,
        ad_platform: assignment.publish_channel,
        meta_ads_ready: false,
        google_ads_ready: false,
        ad_primary_text: caption.slice(0, 125),
        ad_headline: headline.slice(0, String(assignment.publish_channel) === 'google_ads' ? 30 : 40),
        ad_cta: cta.slice(0, 30),
      } : {}),
      creative_trace: creativeTrace,
      feed_director_score: creativeTrace.feed_director_score,
      ...(designedPosterGrafikerScore != null ? {
        grafiker_score: designedPosterGrafikerScore,
        grafiker_pass: designedPosterGrafikerPass,
        typography_text_valid: designedPosterGrafikerPass,
      } : {}),
      ...(Object.keys(designedPosterTemplateMeta).length ? designedPosterTemplateMeta : {}),
      ...(selectedVisualDesignCard ? {
        visual_design_card_source: 'mission_graph',
        visual_design_card_index: selectedVisualDesignCardIndex,
        visual_design_card_headline: String(
          selectedVisualDesignCard.headline
          ?? selectedVisualDesignCard.concept_title
          ?? '',
        ).slice(0, 160),
        visual_design_card_prompt_used: missionVisualDesignRendered,
      } : {}),
      layout_family_hint: calendarDesignLayout?.layoutFamilyHint
        ?? assignment.layout_family_hint
        ?? layoutFamilyHint
        ?? null,
      ...(calendarDesignLayout
        ? {
          design_layout_family: calendarDesignLayout.canvaArchetypeId,
          design_layout_source: calendarDesignLayout.source,
        }
        : {}),
      // The archetype the prompt was actually built from. Without it, output
      // variety can only be read off the calendar matrix stamp, which covers a
      // fifth of the feed and mostly records its own default.
      ...(falDesignCtx?.brief.canvaArchetypeId
        ? { canva_archetype: falDesignCtx.brief.canvaArchetypeId }
        : {}),
      ...(slotFalGridSurface ? { fal_grid_surface: slotFalGridSurface } : {}),
      ...(slotFalRequests.length ? {
        fal_requests: slotFalRequests,
        fal_request_ids: slotFalRequests
          .map((r) => r.requestId)
          .filter((id) => id && !id.startsWith('sync:')),
      } : {}),
      ...(ideaPremiumComposition ? {
        premium_composition: true,
        premium_composition_type: ideaPremiumComposition.compositionType,
        premium_score: ideaPremiumComposition.premiumScore ?? null,
        production_tier: 'premium' as const,
      } : {}),
      ...(bundleReadyNow ? {
        production_bundle: true,
        bundle_status: 'ready',
        idea_id: ideaId,
        poster_url: galleryPreviewUrl,
        posterUrl: galleryPreviewUrl,
      } : {}),
      ...storySlotMeta,
      ...(pipelineArtifactMetaPatch ?? {}),
    };

    const title = buildArtifactListTitle({
      conceptTitle: getField(idea, 'concept_title', 'idea_title'),
      ideationHeadline: storedIdeationHeadline,
      caption: publishCaption,
      brandName: resolvedBrandName,
      format: effectiveFmt,
    });

    const designedStillIntent = Boolean(
      isFalDesignPost
      || isFalOnlyPost
      || isPremiumEditorial
      || designedStoryRequired
      || designedPosterReady
      || markyBranded
      || (Boolean(imageUrl) && (isFalMissionVideo || isFalOnlyVideo) && !isPlayableVideoUrl(videoUrl)),
    );
    // Never let designed stills fall back to a raw gallery URL in ContentUrl.
    const persistContentUrl = designedStillIntent && !isPlayableVideoUrl(nexusPrimaryContentUrl)
      ? nexusPersistableContentUrl(nexusPrimaryContentUrl, [])
      : nexusPersistableContentUrl(nexusPrimaryContentUrl, [
        referenceUrl ?? '',
        ...carouselGalleryUrls,
        ...carouselUrls,
      ]);
    if (
      designedStillIntent
      && !isPlayableVideoUrl(persistContentUrl)
      && (isDataImageUrl(persistContentUrl) || !persistContentUrl.trim())
    ) {
      console.warn(
        `[auto-produce] designed_image_persist_failed after nexus gate "${headline.slice(0, 50)}"`,
      );
      results.push({
        title: headline,
        imageUrl: '',
        error: 'designed_image_persist_failed',
        slotKey,
      });
      continue;
    }

    // publishReady SSOT — stamp before save so feed filters see the same decision.
    // Prefer fal/grafiker success flags over bundleReadyNow alone (bundle flag is
    // often false for fal_only slots that already produced a designed still).
    const designedVisualReadyNow = Boolean(
      bundleReadyNow
      || metadata.fal_designer_produced === true
      || metadata.fal_only === true
      || metadata.fal_video_produced === true
      || metadata.designed_poster_sync === true
      || metadata.grafiker_pass === true
      || metadata.premium_composition === true
      || Boolean(metadata.fal_design_engine)
      || isPremiumEditorial,
    );
    const publishDecision = resolveArtifactPublishReady({
      meta: metadata,
      content: (() => {
        try {
          return JSON.parse(contentJson) as Record<string, unknown>;
        } catch {
          return {};
        }
      })(),
      designedVisualReady: designedVisualReadyNow,
      requireDesignedVisuals: productionProfile.requireDesignedVisuals,
      format: effectiveFmt,
      hasPlayableVideo: isPlayableVideoUrl(videoUrl),
    });
    Object.assign(metadata, stampPublishReadyMetadata(metadata, publishDecision));

    const saved = await nexusClient.saveArtifact(workspaceId, {
      title,
      contentUrl: persistContentUrl,
      content: contentJson,
      platform: 'instagram',
      contentType: effectiveFmt,
      metadata,
    });

    const publishReadyNow = Boolean(
      saved.id
      && !saved.error
      && publishDecision.ready,
    );
    results.push({
      id: saved.id,
      title,
      imageUrl: persistContentUrl,
      videoUrl: videoUrl ?? undefined,
      error: saved.error,
      publishReady: publishReadyNow,
      rendering: false,
      slotKey,
      metadata,
    });

    if (saved.id && !saved.error) {
      existingArtifactKeys.add(ideaDedupeKey);
    }

    // Residual non-fal slot cost (GPT enhance, composites, etc.) — fal requests
    // are flushed in `finally` with request_id so they never leak off-ledger.
    if (saved.id && !saved.error && ideaCostUsd > 0) {
      slotCostArtifactId = saved.id;
      slotCostIdeaUsd = ideaCostUsd;
      slotCostPipeline = falDesignEngine === 'satori_local'
        ? 'local_typography'
        : String(assignment.pipeline ?? '');
    }

    if (
      saved.id
      && !saved.error
      && persistContentUrl
      && (
        assignment.slot_role === 'designed_post'
        || assignment.slot_role === 'fal_designed_post'
        || isPaidAdSlot
      )
      && (referenceUrl || imageUrl)
    ) {
      designedPostSnapshot = {
        imageUrl: persistContentUrl,
        referencePhotoUrl: referenceUrl ?? imageUrl ?? undefined,
        headline: designOverlayHeadline,
        caption: publishCaption,
        cta,
        hashtags: publishHashtags,
        missionId: missionId || '',
        nodeKey: nodeKey || '',
        ideaId,
        ideaIndex,
        templateUseCase: String(idea.template_use_case || ideaRecord?.template_use_case || ''),
      };
    }

    } catch (slotErr) {
      const message = slotErr instanceof Error ? slotErr.message : String(slotErr);
      const orphanedFal = getCapturedFalRequests();
      if (orphanedFal.length > 0) {
        console.warn(
          `[auto-produce] slot ${slotKey} failed after ${orphanedFal.length} fal request(s): `
          + orphanedFal.map((r) => `${r.model}:${r.requestId}`).join(', '),
        );
      }
      const billingProvider = recordProductionProviderBillingFailure(message);
      console.error(
        `[auto-produce] slot failed${billingProvider ? ' (billing circuit)' : ' (continuing)'}: slotKey=${slotKey}`,
        slotErr,
      );
      results.push({
        title: headline || '(slot failed)',
        imageUrl: '',
        error: message,
        slotKey,
      });
      // Stop draining remaining slots — further calls will also fail and pollute the queue.
      if (billingProvider) {
        console.warn(
          `[auto-produce:${workspaceId}] aborting remaining slots — ${billingProvider} billing circuit open`,
        );
        break;
      }
    } finally {
      try {
        const { flushFalRequestsToCostLedger } = await import('@/lib/fal-cost-ledger');
        const falFlush = await flushFalRequestsToCostLedger({
          workspaceId,
          missionId: missionId ?? null,
          artifactId: slotCostArtifactId,
          ideaIndex: resolvedIdeaIndex,
          slotRole: assignment.slot_role,
          pipeline: slotCostPipeline || String(assignment.pipeline ?? ''),
          orphan: !slotCostArtifactId,
        });
        if (falFlush.count > 0) {
          console.log(
            `[auto-produce] fal cost ledger: ${falFlush.count} request(s) ≈ $${falFlush.recordedUsd.toFixed(3)}`
            + (slotCostArtifactId ? '' : ' (orphan)'),
          );
        }
        // Residual = pipeline estimate minus fal catalog lines already recorded.
        const residual = Math.max(0, slotCostIdeaUsd - falFlush.recordedUsd);
        if (slotCostArtifactId && residual > 0.001) {
          const { recordArtifactProductionCost } = await import('@/lib/cost-ledger-client');
          await recordArtifactProductionCost({
            workspaceId,
            missionId: missionId ?? null,
            artifactId: slotCostArtifactId,
            amountUsd: residual,
            pipeline: slotCostPipeline,
            slotRole: assignment.slot_role,
            ideaIndex: resolvedIdeaIndex,
            slotKey: `${resolvedIdeaIndex}::${assignment.slot_role}`,
            detail: falFlush.count
              ? `residual_after_fal:${falFlush.count}`
              : 'slot_non_fal',
          });
        }
      } catch (costErr) {
        console.warn(
          `[auto-produce] cost ledger flush failed for ${slotKey}:`,
          costErr instanceof Error ? costErr.message : costErr,
        );
      }
      clearFalRequestSlot();
    }

    // Soft-pushed billing errors (no throw) still trip the circuit and stop drain.
    const lastResult = results[results.length - 1];
    if (lastResult?.error && recordProductionProviderBillingFailure(lastResult.error)) {
      console.warn(
        `[auto-produce:${workspaceId}] aborting remaining slots — billing error on ${lastResult.slotKey}`,
      );
      break;
    }
  }

  // Boş story slotları — üretilmiş post'lardan format adaptasyonu (aynı brief, farklı format).
  let postStoryAdaptAttempted = false;
  let calendarBackfillAttempted = false;
  let persistedMissionArtifactsForBackfill: Awaited<ReturnType<typeof fetchMissionArtifacts>> = [];
  if (missionId && !adHocBrief && !slotBackfillPass && fullProductionQueue.length > 0) {
    persistedMissionArtifactsForBackfill = await fetchMissionArtifacts(workspaceId, missionId);
    const postStoryAdapt = await deriveStoriesFromPostsForEmptySlots({
      workspaceId,
      missionId,
      nodeKey,
      queue: fullProductionQueue,
      runResults: results,
      persistedArtifacts: persistedMissionArtifactsForBackfill,
      templateLibrary,
      brandBusinessType,
      brandName: resolvedBrandName,
      nexusClient,
    });
    if (postStoryAdapt.attempted) {
      postStoryAdaptAttempted = true;
      results.push(...postStoryAdapt.results);
      costEstimate += postStoryAdapt.costEstimate;
      console.log(
        `[auto-produce] Post→story adaptation: ${postStoryAdapt.adapted} story slot(s) filled`,
      );
    }
  }

  // Empty manifest slots — backfill from unused content_calendar rows (format + diversity preserved).
  const MAX_CALENDAR_BACKFILL_ROUNDS = 3;
  for (
    let calendarRound = 0;
    calendarRound < MAX_CALENDAR_BACKFILL_ROUNDS;
    calendarRound += 1
  ) {
    if (
      !(
        missionId
        && !adHocBrief
        && !slotBackfillPass
        && !internalNestedPass
        && calendarPlans.length > 0
        && fullProductionQueue.length > 0
      )
    ) {
      break;
    }

    const persistedRows = persistedMissionArtifactsForBackfill.length
      ? persistedMissionArtifactsForBackfill.map(artifactToProductionRunRow)
      : (await fetchMissionArtifacts(workspaceId, missionId)).map(artifactToProductionRunRow);
    const seenArtifactIds = new Set<string>();
    const mergedBackfillResults: ProductionRunResultRow[] = [];
    for (const row of [...results, ...persistedRows]) {
      if (row.id) {
        if (seenArtifactIds.has(row.id)) continue;
        seenArtifactIds.add(row.id);
      }
      mergedBackfillResults.push(row);
    }

    const usedPlanIndices = collectUsedCalendarPlanIndices(mergedBackfillResults);
    const calendarMatches = matchCalendarPlansToEmptySlots({
      queue: fullProductionQueue,
      results: mergedBackfillResults,
      calendarPlans,
      usedPlanIndices,
      ideationIdeas: toProcess as Record<string, unknown>[],
    });

    if (calendarMatches.length === 0) break;

    const backfillKeys = calendarMatches.map((m) => m.slotKey);
    const patchedIdeas = applyCalendarBackfillToIdeas(
      toProcess as Record<string, unknown>[],
      calendarMatches,
    ) as ParsedIdea[];

    console.log(
      `[auto-produce] Calendar slot backfill round ${calendarRound + 1}: `
      + `${calendarMatches.length} slot(s) ← plans [${calendarMatches.map((m) => m.planIndex).join(', ')}]`,
    );

    const calendarBackfillResponse = await runProduction({
      workspaceId,
      missionId,
      nodeKey,
      ideas: patchedIdeas,
      visualDesignCards,
      galleryAnalysis: galleryAnalysisInput,
      brandNameOverride,
      productionSnapshot,
      brandThemeOverride,
      bundleCards,
      feedDirectorReport,
      strategistMissionType,
      productionPackage,
      missionTitle,
      creativeBrief,
      skipArtifactDedupe,
      slotBackfillPass: true,
      backfillSlotKeys: backfillKeys,
      calendarPlans,
      internalNestedPass: true,
    });

    calendarBackfillAttempted = true;
    const calendarPayload = await calendarBackfillResponse.json().catch(() => ({})) as {
      results?: ProductionRunResultRow[];
      costEstimate?: number;
      produced?: number;
    };
    if (Array.isArray(calendarPayload.results)) {
      results.push(...calendarPayload.results);
    }
    if (typeof calendarPayload.costEstimate === 'number') {
      costEstimate += calendarPayload.costEstimate;
    }
    console.log(
      `[auto-produce] Calendar slot backfill round ${calendarRound + 1} complete: `
      + `produced=${calendarPayload.produced ?? 0}`,
    );
    persistedMissionArtifactsForBackfill = [];
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

  // Mission guarantee: Fal.ai designed story poster when no publish-ready story exists (no Remotion MP4)
  if (
    bundleCards !== false
    && missionId
    && !slotBackfillPass
    && !missionHasPublishReadyStory(results)
    && hasGallery
    && brandTokensForRender
    && toProcess.length > 0
  ) {
    for (let gi = 0; gi < toProcess.length; gi++) {
      const idea = toProcess[gi]!;
      const headline = resolveIdeationHeadline(idea as Record<string, unknown>)
        || getField(idea, 'headline', 'concept_title', 'title');
      const caption = getField(idea, 'caption_draft', 'caption');
      const mood = (idea.mood as string | undefined) || '';
      const postType = kindToPostType(detectContentKind(idea));
      activeGallerySubjectKey = String(
        (idea as Record<string, unknown>).subject_key
        ?? (idea as Record<string, unknown>).subjectKey
        ?? '',
      ).trim() || undefined;
      activeGalleryMatchExtras = {
        ...(String(idea.visual_direction ?? '').trim()
          ? { visualDirection: String(idea.visual_direction).trim() }
          : {}),
        ...(String(idea.strategic_purpose ?? '').trim()
          ? { strategicPurpose: String(idea.strategic_purpose).trim() }
          : {}),
      };
      const referenceUrl = pickMissionGallery(
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
        true,
        gi,
      );
      if (!referenceUrl || !(await probeMediaUrl(referenceUrl))) continue;

      const guaranteeSourceUrl = referenceUrl;
      const ideaId = missionId ? `${missionId}-guarantee-story-${gi}` : randomUUID();
      const guaranteeAssignment = {
        idea_index: gi,
        slot_role: 'campaign_story_motion' as const,
        pipeline: 'fal_story' as const,
        copy_bundle_id: `${missionId.slice(0, 8)}-fal-story`,
        publish_channel: 'instagram_campaign' as const,
        rationale: 'mission_guaranteed_fal_story',
        library_slot_key: undefined as string | undefined,
      };
      const guaranteeDedupeKey = buildIdeaProductionDedupeKey(
        missionId,
        idea as Record<string, unknown>,
        gi,
        guaranteeAssignment.slot_role,
      );
      if (missionId && existingArtifactKeys.has(guaranteeDedupeKey)) {
        continue;
      }
      let guaranteeSceneBrief = sceneBriefCache.get(gi);
      if (guaranteeSceneBrief === undefined) {
        if (missionSceneBrief === undefined && aiVisualStandard.enabled) {
          const guaranteeSceneCaption = [
            missionVisualBrief ? `Mission: ${missionVisualBrief}` : '',
            headline ? `Headline: ${headline}` : '',
            caption ? `Caption: ${caption}` : '',
          ].filter(Boolean).join('\n') || headline || caption;
          missionSceneBrief = await fetchProductSceneBrief({
            workspaceId,
            missionId: missionId || undefined,
            caption: guaranteeSceneCaption.slice(0, 1000),
            productType: String(idea.product_type ?? idea.subject ?? ''),
            sector: brandBusinessType,
            mood,
            enhanceLevel: aiPhotoEnhanceLevel,
            visualSubject: resolvedVisualSubject as 'venue_ambiance' | 'product_hero' | undefined,
          });
        }
        guaranteeSceneBrief = missionSceneBrief ?? null;
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
        productType: String(idea.product_type ?? idea.subject ?? ''),
        maxPhotos: 1,
        missionId: missionId ?? undefined,
      });
      if (guaranteeEnhance.applied && guaranteeEnhance.photoUrls[0]) {
        guaranteePhotoUrl = guaranteeEnhance.photoUrls[0];
        guaranteeAiEnhanced = true;
      }

      const guaranteeResult = await produceAndSaveMissionFalStoryGuarantee({
        workspaceId,
        missionId,
        ideaIndex: gi,
        ideaId,
        headline,
        caption,
        mood,
        referencePhotoUrl: guaranteePhotoUrl,
        aiGalleryEnhanced: guaranteeAiEnhanced,
        resolvedBrandName,
        brandBusinessType,
        brandLocation,
        brandLogoUrl: brandLogoUrl || undefined,
        brandCtx,
        brandTheme,
        brandTokens: brandTokensForRender,
        templateLibrary,
        grafikerMaxRetries,
        librarySlotKey: resolveStoryLibrarySlotKey({
          librarySlotKey: guaranteeAssignment.library_slot_key,
          catalogSlotKey: (guaranteeAssignment as ProductionAssignment).catalog_slot_key,
          activeSlots: brandActiveSlots,
          library: templateLibrary,
          storyIndex: gi,
        }),
        nodeKey: nodeKey || null,
        assignment: guaranteeAssignment,
        nexusClient,
      });
      if (!guaranteeResult) continue;

      existingArtifactKeys.add(guaranteeDedupeKey);
      markSourceGalleryUsed(galleryUsage, batchUsedByType, guaranteeSourceUrl, postType);
      costEstimate += guaranteeResult.costUsd;
      results.push({
        id: guaranteeResult.artifactId,
        title: guaranteeResult.title,
        imageUrl: guaranteeResult.imageUrl,
        publishReady: true,
        rendering: false,
        slotKey: `${gi}:${guaranteeAssignment.slot_role}`,
        metadata: guaranteeResult.metadata,
      });
      console.log(
        `[auto-produce] Mission Fal story guarantee: idea ${gi} "${headline.slice(0, 40)}"`,
      );
      break;
    }
  }


  if (designedPostSnapshot && manifestMissionType !== 'ads_focus') {
    const derivedAds = await deriveAdCreativesFromDesignedPost(
      workspaceId,
      designedPostSnapshot,
      manifestMissionType,
      resolvedBrandName,
      {
        brandBusinessType,
        brandLocation,
        brandLogoUrl: brandLogoUrl || undefined,
        brandTheme,
        primaryColor: syncPrimaryColor,
        accentColor: syncAccentColor,
        routeBaseUrl,
        grafikerMaxRetries,
        usedTemplateIds: syncUsedTemplateIds,
      },
      nexusClient,
    );
    for (const d of derivedAds) {
      results.push(d);
    }
  }

  const saved = results.filter((r) => r.id && !r.error).length;
  const publishReady = results.filter((r) => r.id && !r.error && r.publishReady === true).length;
  const rendering = results.filter((r) => r.id && !r.error && r.rendering === true).length;
  const withheld = results.filter((r) => !r.id && r.error).length;
  await recordProduction(workspaceId, saved, costEstimate);

  const avgPis = pisScores.length
    ? Math.round(pisScores.reduce((a, b) => a + b, 0) / pisScores.length)
    : null;
  if (pisWarnings.length > 0 || avgPis != null) {
    console.log(
      `[auto-produce] PIS summary: avg=${avgPis ?? 'n/a'}% checked=${pisScores.length} skipped=${pisWarnings.length}`,
    );
  }

  if (!internalNestedPass) {
    await releaseAllProductionLocks(workspaceId, missionId);
  }

  const backfillAttempted = postStoryAdaptAttempted || calendarBackfillAttempted;
  const mergedResults = results;
  const mergedSaved = saved;
  const mergedPublishReady = publishReady;
  const mergedRendering = rendering;
  const mergedWithheld = withheld;

  const productionTelemetry = buildMissionProductionTelemetry({
    profileTier: productionProfile.tier,
    hubPackage: productionPackage,
    gisScore,
    feedDirectorReport,
    tenantLearning,
    run: {
      produced: mergedSaved,
      publish_ready: mergedPublishReady,
      rendering: mergedRendering,
      withheld: mergedWithheld,
    },
    scheduleArtifactsWithLabel: countArtifactsWithScheduleLabel(
      results.filter((r) => r.metadata) as Array<{ metadata?: unknown }>,
    ),
    scheduleArtifactsTotal: saved,
  });

  return NextResponse.json(attachPipelineTrace({
    produced: mergedSaved,
    publishReady: mergedPublishReady,
    rendering: mergedRendering,
    withheld: mergedWithheld,
    backfillAttempted,
    total: productionLoop.length,
    ideaCount: toProcess.length,
    parsed: productionIdeas.length,
    costEstimate: Math.round(costEstimate * 1000) / 1000,
    missionType: manifestMissionType,
    manifest: manifestValidation,
    productionTelemetry,
    pis: {
      minScore: PIS_PRODUCTION_MIN_SCORE,
      avg: avgPis,
      checked: pisScores.length,
      skipped: pisWarnings.length,
      warnings: pisWarnings,
    },
    enhanceTrace: enhanceTraces,
    results: mergedResults,
    artifacts: mergedResults,
  }, pipelineRun));
}
