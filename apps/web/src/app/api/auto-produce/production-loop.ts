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
  pickMissionDiverseFallbackPhoto,
  isHardGalleryThemeMismatch,
  MIN_ACCEPT_SCORE,
  REEL_GALLERY_MIN_SCORE,
  type GalleryPhotoMeta,
} from '@/lib/gallery-photo-matcher';
import {
  buildGalleryPhotoSearchable,
  captionRequiresStrictGalleryMatch,
  isHardCaptionPhotoConflict,
  scoreIdeationPhotoMatch,
} from '@/lib/caption-photo-alignment';
import { shouldAutoProduceEnhanceGallery } from '@/lib/venue-photo-policy';
import {
  filterReachableGalleryUrls,
  normalizePhotoUrlForRemotionRender,
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
} from '@/lib/sector-production-profile';
import { resolveBrandReelProductionParams } from '@/lib/brand-reel-motion-profile';
import { resolveCanonicalBrandName } from '@/lib/resolve-brand-name';
import { harmonizeCaptionAndCta, normalizeBrandLanguagesInput } from '@/lib/cta-localization';
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
import { missionTemplateIdeaIndex } from '@/lib/mission-remotion-story';
import { missionStoryLibrarySlotKey } from '@/lib/mission-story-template';
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
  shouldRenderRemotionPoster,
  shouldRenderRemotionStory,
  type ManifestProductionQueueItem,
} from '@/lib/production-pipeline-router';
import {
  gallerySequencePhotoTarget,
  isGalleryOnlyVisualPolicy,
  prefersGallerySequenceStory,
  storyGalleryPhotoTarget,
} from '@/lib/visual-overlay-policy';
import { GRAFIKER_PASS_THRESHOLD, resolveGrafikerMaxRetries } from '@/lib/remotion-quality';
import {
  fetchGisScoreForWorkspace,
  isFeedDirectorFallback,
  resolveProductionProfile,
  shouldBlockProductionOnFdFallback,
  shouldUseMarkyLayer,
  slotUsesRemotionPost,
  slotUsesRemotionStory,
  type ProductionProfile,
} from '@/lib/production-profile';
import {
  buildMissionProductionTelemetry,
  countArtifactsWithScheduleLabel,
} from '@/lib/mission-production-telemetry';
import type { MissionProductionManifest, ProductionSlotRole } from '@/lib/mission-production-manifest';
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
  buildSceneBriefPromptBlock,
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
import type { RemotionLayoutFamily } from '@/lib/remotion-template-types';
import {
  allowedCompositionsForDirector,
  parseMotionProfileFromTheme,
  resolveContentIntent,
  resolveGallerySeriesLayout,
} from '@/lib/brand-motion-profile';
import { resolveStoryAudioMood } from '@/lib/story-audio-mood';
import { resolveKitForSector } from '@/lib/story-template-registry';
import { tenantKitSeed } from '@/lib/tenant-template-seed';
import {
  ensureBrandTemplateLibrary,
  resolveProductionTemplate,
  resolveBrandStoryProductionTemplate,
  resolveStoryCompositionForBrandTemplate,
  storyTemplateFamilyForSlot,
} from '@/lib/brand-template-library';
import {
  isMeaninglessBrandEchoHeadline,
  isLabelStyleHeadline,
  resolveMeaningfulProductionHeadline,
  sanitizeProductionHeadline,
} from '@/lib/production-headline-quality';
import {
  isIncompleteOverlayPhrase,
  isInternalStrategyBriefing,
  resolveFalOverlayCopy,
} from '@/lib/fal-caption-headline';
import { resolveMissionFalDesignCopy, type FalDesignCopyIdea } from '@/lib/fal-design-copy';
import { enforceDisplayHeadline } from '@/lib/remotion-quality';
import { resolveIdeationHeadline } from '@/lib/production-idea-parse';
import {
  buildArtifactListTitle,
  hasPublishableIdeationHeadline,
} from '@/lib/feed-display-caption';
import { resolvePlanningIdeaIndex } from '@/lib/content-calendar-artifact-link';
import { resolveProductionEngines } from '@/lib/brand-production-engines';
import { isGalleryTagHeadline } from '@/lib/vision-text-guard';
import { getBrandKit } from '@/lib/agency-brand-kits';
import { getRemotionTemplate } from '@/lib/story-template-catalog';
import {
  applyBrandTokensToRenderProps,
  resolveBrandProductionTokens,
} from '@/lib/brand-production-tokens';
import { resolveFalDesignPromptContext, readAgentFalDesignBrief, readBrandLogoPosition, readTenantPreferredCanvaArchetypes } from '@/lib/fal-design-brief';
import { resolveSlotRenderTypography } from '@/lib/brand-template-slot-typography';
import {
  type StoryCandidate,
  type PostCandidate,
  type PremiumCompositionMeta,
} from './production-candidate-types';
import {
  alignRemotionPosterWithFalTemplate,
  isRemotionFalAlignedSlot,
  type RemotionFalTemplateAlignment,
} from '@/lib/brand-design-template-production';
import { resolveSlotLogoForRender } from '@/lib/brand-logo-production';
import {
  fetchBrandThemeForProduction,
  resolveProductionVisualStandard,
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
  parseBrandGalleryPhotos,
  pickGalleryPhotoForIdea,
  captionHasExplicitBeautyService,
  pickSupplementaryGalleryPhotos,
  markSourceGalleryUsed,
  isCampaignContentIdea,
  buildEventCanvasPrompt,
  repickGalleryIfDuplicateForType,
} from './caption-publish-resolver';
import {
  generateVibeImage,
  generateDesignedImageFromMissionCard,
  generateEventOverlayImage,
  generateMarkyLayerCard,
  generateVibeCarousel,
  renderEventCardFromPayload,
} from './handlers/image-generators';
import { generateFalVideo, isFalVideoPipeline, isFalDesignPipeline, isFalOnlyVideoPipeline, isFalOnlyPostPipeline } from '@/lib/fal-video';
import { finalizeFalPrompt } from '@/lib/fal-prompt';
import { falVideoHandler } from './pipelines/fal-video-pipeline';
import { productShowcaseHandler } from './pipelines/product-showcase-pipeline';
import { falOnlyHandler } from './pipelines/fal-only-pipeline';
import { falDesignHandler } from './pipelines/fal-designed-post-pipeline';
import { runPipelineStages } from './pipelines/pipeline-types';
import type { SlotProductionContext } from './pipelines/pipeline-types';
import { resolveFalDesignIntensityForChannel } from '@/lib/fal-design-intensity';
import { resolveFalRequireGroundedGallery } from '@/lib/fal-designer-production';
import type { TypographyBackgroundStyle } from '@/types/brand-theme';
import {
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
  /** Internal nested calendar backfill — skip lock release (outer pass owns locks). */
  internalNestedPass?: boolean;
  /** Skip main slot loop — only post→story + calendar backfill + retries (factory completion). */
  completionPassOnly?: boolean;
  /** New Brief form — fal.ai art-director pipelines, no Remotion bundle. */
  adHocBrief?: boolean;
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
  const brandTokens = pctx.tokens;
  const templateLibrary = pctx.templateLibrary;
  const hasReusablePostTemplates = templateLibrary.slots.some(
    (s) => s.enabled && s.format === 'post' && Boolean(s.posterTemplateId),
  );
  const brandKitId = pctx.kitId;
  const aiPhotoEnhance = pctx.aiPhotoEnhanceEnabled;
  const aiPhotoEnhanceLevel = pctx.aiPhotoEnhanceLevel;
  const aiVisualStandard = pctx.aiVisualStandard;
  const resolvedVisualSubject = pctx.resolvedVisualSubject;
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
    );

  // galleryMetaRaw alias for code that still references it directly
  const galleryMetaRaw = (galleryAnalysis ?? {}) as Record<string, import('@/lib/gallery-photo-matcher').GalleryPhotoMeta>;
  const results: {
    id?: string;
    title: string;
    imageUrl: string;
    videoUrl?: string;
    error?: string;
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
  // organic_reel / campaign_reel_motion → fal_reel (fal designer video; Runway kapalı)
  // ─────────────────────────────────────────────────────────────────────────
  const creatomateStoryCandidates: StoryCandidate[] = [];
  const remotionPostCandidates: PostCandidate[] = [];

  const existingArtifactKeys = missionId && !skipArtifactDedupe
    ? await loadMissionAutoArtifactDedupeKeys(workspaceId, missionId)
    : new Set<string>();

  const manifestQueue = buildAutoProduceProductionQueue({
    missionId,
    toProcess: toProcess as Record<string, unknown>[],
    feedDirectorReport,
    manifestMissionType,
    brandBusinessType,
    maxIdeas,
    productionProfile,
    packageSlug: pkgLimits.packageSlug,
    adHocBrief,
  });

  const fullProductionQueue = manifestQueue;

  if (adHocBrief) {
    console.log(
      `[auto-produce] Ad-hoc New Brief → fal.ai art-director track (${manifestQueue.length} slots)`,
    );
  }

  const productionLoop: ManifestProductionQueueItem[] = completionPassOnly
    ? []
    : slotBackfillPass && backfillSlotKeys?.length
      ? fullProductionQueue.filter((item) =>
          backfillSlotKeys.includes(`${item.ideaIndex}:${item.assignment.slot_role}`),
        )
      : fullProductionQueue;

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

  const missionGalleryAssignments = buildMissionGalleryAssignments({
    missionId,
    // Always assign across the full manifest — factory drain may produce one slot per call.
    productionLoop: fullProductionQueue,
    galleryPhotos,
    galleryMeta,
    brandBusinessType,
    resolvedBrandName,
    hasGallery,
    hasRealBrandPhotos,
    brandDescription: String(brandCtx.description ?? ''),
    creativeBrief: creativeBrief ?? undefined,
    galleryUsage,
  });

  if (gallerySlotAssignments && Object.keys(gallerySlotAssignments).length > 0) {
    for (const [key, entry] of Object.entries(gallerySlotAssignments)) {
      const url = String(entry?.url ?? '').trim();
      if (!url) continue;
      missionGalleryAssignments.set(key, {
        url,
        score: typeof entry.score === 'number' ? entry.score : MIN_ACCEPT_SCORE,
        reason: 'factory_batch_assign',
        confidence: 1,
      });
    }
    console.log(
      `[auto-produce] Factory gallery batch assign: `
      + `${Object.keys(gallerySlotAssignments).length} precomputed slot(s)`,
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
    const ideaCostBefore = costEstimate;
    const ideaIndex = queueItem.ideaIndex;
    const idea = queueItem.idea as ParsedIdea;
    const ideaRecord = queueItem.idea;
    let assignment = queueItem.assignment;
    assignment = {
      ...assignment,
      pipeline: normalizeProductionPipeline(assignment.pipeline),
    };
    const resolvedIdeaIndex = typeof ideaRecord.idea_index === 'number'
      ? ideaRecord.idea_index
      : ideaIndex;
    const ideaId = missionId ? `${missionId}-${resolvedIdeaIndex}` : randomUUID();
    let caption = getField(idea, 'caption_draft', 'caption');
    const originalIdeationCaption = caption;
    const rawIdeationHeadline = resolveIdeationHeadline(idea as Record<string, unknown>);
    let ideationHeadline = rawIdeationHeadline;
    let headline = rawIdeationHeadline;

    const isFalDesignedPostSlotForHeadline =
      isFalDesignPipeline(assignment.pipeline)
      || assignment.slot_role === 'designed_post'
      || assignment.slot_role === 'designed_typography'
      || assignment.slot_role === 'fal_designed_post';
    const isTypographyDesignSlot = assignment.slot_role === 'designed_typography';
    let slotVisualDesignCard: MissionVisualDesignCard | null = null;
    let slotVisualDesignCardIndex: number | null = null;
    if (isFalDesignedPostSlotForHeadline && visualDesignCards.length) {
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

    if (
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
        maxLen: 72,
      });
      if (headlineFix.replaced) {
        console.warn(
          `[auto-produce] headline QA (${headlineFix.reason}): "${rawIdeationHeadline.slice(0, 48)}" → "${headlineFix.headline}"`,
        );
      }
      headline = headlineFix.headline;
      ideationHeadline = headline;
    } else {
      ideationHeadline = enforceDisplayHeadline(rawIdeationHeadline, 72);
      headline = ideationHeadline;
    }
    /** Ideation marketing hook — preserved for feed metadata; never overwritten by gallery vision. */
    const storedIdeationHeadline = headline;

    // Feed Art Director's visual_subject_hint overrides generic caption for gallery matching.
    // Append the hint keywords to ideationCaption so the gallery scorer sees specific
    // service terms (e.g. "tırnak, manikür, nail art") as primary selection signals.
    const fdVisualHint = (assignment?.visual_subject_hint ?? '').trim();
    const isCalendarSlot = isCalendarProductionIdea(ideaRecord);
    let ideationCaption = isCalendarSlot
      ? calendarGalleryMatchCaption(ideaRecord)
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
    const falSceneHint = isCalendarProductionIdea(ideaRecord)
      ? buildCalendarFalSceneHint(ideaRecord)
      : adHocBrief
        ? [String(idea.scene_hint ?? idea.visual_direction ?? '').trim(), fdVisualHint].filter(Boolean).join(' — ').slice(0, 260)
        : [fdVisualHint, String(idea.visual_direction ?? '').trim(), missionVisualBrief]
          .map((s) => (s ?? '').trim())
          .filter(Boolean)
          .join(' — ')
          .slice(0, 160);
    let hashtags = normalizeHashtags(idea.hashtags);
    let cta = getField(idea, 'cta', 'call_to_action');
    if (caption && cta) {
      const harmonized = harmonizeCaptionAndCta(
        caption,
        cta,
        normalizeBrandLanguagesInput(brandCtx.languages ?? brandCtx.inferred_language),
      );
      caption = harmonized.caption;
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
          caption = cta
            ? `${conceptTitle}. ${cta}`
            : `${conceptTitle}. ${resolvedBrandName}'de sizi bekliyoruz.`;
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
    if (usesFalDesignCopy && caption.trim().length >= 16) {
      const falChannel =
        kind === 'instagram_reel' ? 'reel'
          : (kind === 'instagram_story' || kind === 'instagram_canvas') ? 'story'
            : 'feed_post';
      const ideationTitleLocked = hasPublishableIdeationHeadline(
        storedIdeationHeadline,
        resolvedBrandName,
      );
      if (ideationTitleLocked) {
        headline = enforceDisplayHeadline(storedIdeationHeadline, 72);
      } else {
        const designCopy = resolveMissionFalDesignCopy({
          idea: idea as FalDesignCopyIdea,
          ideationHeadline: headline,
          caption,
          cta,
          brandName: resolvedBrandName,
          channel: falChannel,
          businessType: brandBusinessType,
        });
        if (designCopy.headline && designCopy.headline !== headline) {
          console.log(
            `[auto-produce] fal design copy (${designCopy.source}): `
            + `"${headline.slice(0, 36)}" → "${designCopy.headline.slice(0, 36)}"`,
          );
          headline = designCopy.headline;
        }
        if (designCopy.subtitle?.trim()) {
          cta = designCopy.subtitle.trim();
        }
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
    const fmt = kind.replace('instagram_', '');
    const mood = String(
      idea.mood ?? idea.photo_mood ?? idea.visual_direction ?? '',
    ).trim();
    const strategicPurpose = idea.strategic_purpose || '';
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
        ideationHeadline,
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
      .filter((f): f is RemotionLayoutFamily => typeof f === 'string');
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
    const isStoryIdeaForBrief = kind === 'instagram_story' || kind === 'instagram_canvas';
    const organicStillForBrief = assignment.slot_role === 'organic_story_still';
    const designedPostForBrief =
      assignment.pipeline === 'remotion_poster' || assignment.slot_role === 'designed_post' || assignment.slot_role === 'designed_typography' || assignment.slot_role === 'fal_designed_post';
    const willRemotionStoryForBrief = bundleCards !== false
      && isStoryIdeaForBrief
      && !organicStillForBrief
      && !designedPostForBrief
      && shouldRenderRemotionStory(assignment);

    // Scene Director LLM — once per mission when any slot needs it (not per idea).
    let sceneBrief: ProductSceneBrief | null = null;
    if (slotNeedsSceneBrief({
      visualStandard: aiVisualStandard,
      contentKind: kind,
      assignment,
      galleryOnlyVisual,
      isHeroReel,
      willRemotionStory: willRemotionStoryForBrief,
      designedPosterSync: false,
    })) {
      // Retry when previous fetch failed (null) and this is a high-value visual slot.
      const isImportantVisualSlot = isHeroReel || willRemotionStoryForBrief;
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
    let carouselGalleryUrls: string[] = [];
    let enhancedGallerySet: string[] = [];
    let galleryMatchScore: number | null = galleryMatchScoreEarly;

    const attachedPhotoUrls = Array.isArray(idea.attached_photo_urls)
      ? idea.attached_photo_urls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
      : [];
    const forceAttachedPhotos = Boolean(adHocBrief && idea.force_attached_photos && attachedPhotoUrls.length > 0);

    const agentUrl = idea.visual_production_spec?.selected_gallery_url || idea.selected_gallery_url || null;
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
          headline: ideationHeadline,
          mood,
          contentType: postType,
          businessType: brandBusinessType,
          globalUsageCounts: globalGalleryUsageCounts,
        },
        galleryPhotos,
        galleryMeta,
        agentUrl,
        { excludeUrls: missionGalleryExclude, tieBreakSeed: ideaIndex },
      );
      if (ideationPick) {
        referenceUrl = ideationPick.url;
        galleryMatchScore = ideationPick.score;
        console.log(
          `[auto-produce] ideation gallery pick score=${ideationPick.score}: "${headline.slice(0, 50)}"`,
        );
      }
    }

    if (!referenceUrl && preassignedGalleryUrl && !captionDrivenSlot && !forceAttachedPhotos) {
      referenceUrl = preassignedGalleryUrl;
      console.log(
        `[auto-produce] gallery-first photo: "${headline.slice(0, 48)}" → ${preassignedGalleryUrl.slice(0, 72)}`,
      );
    }

    if (captionDrivenSlot && !referenceUrl && !forceAttachedPhotos) {
      const aiFromCaption = await generateVibeImage({
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
        captionDrivenMode: true,
      });
      if (aiFromCaption) {
        referenceUrl = aiFromCaption;
        captionDrivenGenerated = true;
        galleryMatchScore = null;
        console.log(
          `[auto-produce] caption-driven AI (gallery skipped): "${headline.slice(0, 50)}"`,
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
          headline: ideationHeadline,
          mood,
          contentType: postType,
          businessType: brandBusinessType,
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
          const diverseFallback = pickMissionDiverseFallbackPhoto(
            galleryPhotos,
            new Set(missionGalleryExclude.map(normalizeGalleryUrl)),
            galleryMeta,
            missionGalleryExclude,
            batchMatchInput,
          );
          if (diverseFallback?.url) {
            referenceUrl = diverseFallback.url;
            galleryMatchScore = diverseFallback.score;
          } else {
          // Strict captions (nightlife / food / beauty) never use bestEffort ≥10.
          const missionFallbackStrict = captionRequiresStrictGalleryMatch(
            ideationCaption, ideationHeadline,
          ) || captionHasExplicitBeautyService(ideationCaption, ideationHeadline);
          referenceUrl = pickMissionGallery(
            ideationCaption,
            ideationHeadline,
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
            missionFallbackStrict,
            ideaIndex,
          );
          if (referenceUrl) {
            galleryMatchScore = scoreIdeationPhotoMatch({
              caption: ideationCaption,
              headline: ideationHeadline,
              photoUrl: referenceUrl ?? '',
              galleryAnalysis: galleryMeta,
              businessType: brandBusinessType,
              mood,
              contentType: postType,
            });
          }
          }
        }
      } else {
        referenceUrl = pickMissionGallery(
          ideationCaption,
          ideationHeadline,
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
            ideationHeadline,
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
        ideationHeadline,
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
        ideationHeadline,
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
          headline: ideationHeadline,
          photoUrl: referenceUrl ?? '',
          galleryAnalysis: galleryMeta,
          businessType: brandBusinessType,
          mood,
          contentType: postType,
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
          ideationHeadline,
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
          ideationHeadline,
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
      const baseUrl = getNextjsInternalOrigin();
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
        captionDrivenMode: isNonVenueSectorProfile(brandBusinessType) || isCaptionDrivenDefault(brandBusinessType),
      });
      if (!aiGenerated) {
        console.warn(`[auto-produce] AI image generation failed for: "${headline.slice(0, 50)}"`);
        results.push({ title: headline, imageUrl: '', error: 'Galeri boş ve AI görsel üretimi başarısız oldu', slotKey });
        continue;
      }
      referenceUrl = aiGenerated;
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
        headline: ideationHeadline,
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
      });
      if (referenceUrl) {
        referenceUrl = normalizeExternalPhotoUrl(referenceUrl) ?? referenceUrl;
        markSourceGalleryUsed(galleryUsage, batchUsedByType, referenceUrl, postType);
        batchUsedGalleryMission.add(normalizeGalleryUrl(referenceUrl));
      }
    }

    if (!forceAttachedPhotos && referenceUrl && !referenceUrl.startsWith('/api/') && !(await probeMediaUrlReliable(referenceUrl, { timeoutMs: 4_000 }))) {
      // External URL is broken — attempt fallback to a fresh gallery pick before aborting.
      console.warn(`[auto-produce] broken external gallery URL — attempting fallback pick: ${referenceUrl.slice(0, 100)}`);
      const fallbackCandidates = galleryPhotos.filter((u) => u !== referenceUrl);
      const fallback = fallbackCandidates.length
        ? pickMissionGallery(
            ideationCaption,
            ideationHeadline,
            mood,
            galleryMeta,
            fallbackCandidates,
            missionGalleryExclude,
            batchExclude,
            postType,
            null,
            brandBusinessType,
            false,
            ideaIndex,
          )
        : null;
      if (fallback) {
        console.log(`[auto-produce] fallback gallery pick: ${fallback.slice(0, 80)}`);
        referenceUrl = fallback;
        referenceIsStock = isStockGalleryPhotoUrl(fallback);
      } else {
        console.warn(`[auto-produce] no fallback gallery URL — slot skipped`);
        results.push({
          title: headline,
          imageUrl: '',
          error: 'Seçilen galeri fotoğrafı erişilemiyor (süresi dolmuş veya geçersiz URL)',
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
            ideationHeadline,
            mood,
            galleryMeta,
            galleryPhotos,
            missionGalleryExclude,
            batchExclude,
            postType,
            null,
            brandBusinessType,
            false,
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
    ) {
      const brokenInternal = referenceUrl?.startsWith('/api/');
      const internalFallback = brokenInternal && galleryPhotos.length
        ? pickMissionGallery(
            ideationCaption,
            ideationHeadline,
            mood,
            galleryMeta,
            galleryPhotos,
            missionGalleryExclude,
            batchExclude,
            postType,
            null,
            brandBusinessType,
            false,
            ideaIndex,
          )
        : null;
      if (internalFallback && internalFallback !== referenceUrl) {
        console.log(`[auto-produce] broken internal URL — fallback pick: ${internalFallback.slice(0, 80)}`);
        referenceUrl = internalFallback;
        referenceIsStock = isStockGalleryPhotoUrl(internalFallback);
      } else {
        console.warn(`[auto-produce] broken internal gallery URL skipped: ${(referenceUrl ?? '').slice(0, 100)}`);
        results.push({
          title: headline,
          imageUrl: '',
          error: brokenInternal
            ? 'Üretilen görsel depolamadan okunamadı — birkaç dakika sonra yeniden deneyin'
            : 'Seçilen galeri fotoğrafı erişilemiyor (süresi dolmuş veya geçersiz URL)',
          slotKey,
        });
        continue;
      }
    }

    if (referenceUrl && !referenceIsStock) {
      try {
        const picked = await pickReachableProductionGalleryUrl(
          workspaceId,
          referenceUrl,
          galleryPhotos,
          { timeoutMs: 12_000 },
        );
        if (picked) {
          if (picked.fallbackFrom) {
            console.log(
              `[auto-produce] gallery production fallback: ${picked.fallbackFrom.slice(0, 80)} → ${picked.url.slice(0, 80)}`,
            );
          }
          referenceUrl = picked.url;
        } else if (!referenceUrl.startsWith('/api/media?key=')) {
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
      } catch (mirrorErr) {
        console.warn('[auto-produce] pickReachableProductionGalleryUrl failed:', mirrorErr);
        if (!referenceUrl.startsWith('/api/media?key=')) {
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

    let resolvedReferenceUrl = referenceUrl;
    let galleryPreviewUrl = toFeedPreviewUrl(resolvedReferenceUrl) ?? resolvedReferenceUrl;
    let selectedVisualDesignCard: MissionVisualDesignCard | null = slotVisualDesignCard;
    let selectedVisualDesignCardIndex: number | null = slotVisualDesignCardIndex;
    let missionVisualDesignRendered = false;

    const normalizedResolvedReferenceUrl = resolvedReferenceUrl ?? '';
    let pickedFromBrandGallery = galleryPhotos.some(
      (u) => normalizeGalleryUrl(u) === normalizeGalleryUrl(normalizedResolvedReferenceUrl),
    );
    let photoMetaForCaption = galleryMeta[normalizeGalleryUrl(normalizedResolvedReferenceUrl)]
      ?? Object.entries(galleryMeta).find(
        ([k]) => normalizeGalleryUrl(k) === normalizeGalleryUrl(normalizedResolvedReferenceUrl),
      )?.[1];
    const galleryPhotoDescription = String(
      (photoMetaForCaption as GalleryPhotoMeta | undefined)?.description ?? '',
    ).trim();

    if (pickedFromBrandGallery && !referenceIsStock) {
      const scorePhoto = (url: string) => scoreIdeationPhotoMatch({
        caption: ideationCaption,
        headline: ideationHeadline,
        photoUrl: url,
        galleryAnalysis: galleryMeta,
        businessType: brandBusinessType,
        mood,
        contentType: postType,
      });

      galleryMatchScore = scorePhoto(normalizedResolvedReferenceUrl);

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
            ideationHeadline,
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
    const hardThemeConflict = Boolean(
      pickedFromBrandGallery
      && resolvedReferenceUrl
      && isHardCaptionPhotoConflict(
        `${ideationCaption} ${ideationHeadline}`,
        buildGalleryPhotoSearchable(lockedGalleryMeta, resolvedReferenceUrl),
      ),
    );
    if (hardThemeConflict) {
      console.warn(
        `[auto-produce] hard caption↔photo theme conflict — skip "${ideationHeadline.slice(0, 40)}"`,
      );
      results.push({
        title: headline,
        imageUrl: galleryPreviewUrl ?? '',
        error: `Caption–görsel tema çatışması — "${ideationHeadline.slice(0, 40)}" için uygun galeri fotoğrafı yok`,
        slotKey,
      });
      continue;
    }
    // Detect cross-service conflict: gallery score went negative due to beauty sub-service
    // conflict penalty (e.g. nail caption + lash photo → -45). This overrides adaptiveScene
    // so the weak-gallery gate triggers AI fallback even for beauty_wellness sector.
    const captionServiceConflict =
      (typeof galleryMatchScore === 'number' && galleryMatchScore < 0)
      || hardThemeConflict;
    // Fal paints typography on the gallery photo — never ship a weak caption↔photo pair.
    const falGroundedPipeline = usesFalDesignerTrackEarly && !captionDrivenGenerated;
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
      && !usesFalDesignerTrackEarly
    ) {
      referenceIsStock = false;
      captionDrivenGenerated = true;
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
        console.warn(
          `[auto-produce] weak gallery brand_solid failed — skip "${headline.slice(0, 40)}"`,
        );
        results.push({
          title: headline,
          imageUrl: galleryPreviewUrl ?? '',
          error: `Zayıf galeri eşleşmesi — marka solid üretimi başarısız (${galleryMatchScore}/${galleryFloor})`,
          slotKey,
        });
        continue;
      }
      referenceUrl = aiGenerated;
      resolvedReferenceUrl = aiGenerated;
      galleryPreviewUrl = toFeedPreviewUrl(aiGenerated) ?? aiGenerated;
      galleryMatchScore = null;
      pickedFromBrandGallery = false;
      console.log(
        `[auto-produce] weak gallery → brand solid AI: "${headline.slice(0, 40)}"`,
      );
    }

    if (
      shouldSkipProductionForWeakGallery({
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
      })
    ) {
      console.warn(
        `[auto-produce] weak gallery (${galleryMatchScore}/${galleryFloor}) — skip "${headline.slice(0, 40)}"`,
      );
      results.push({
        title: headline,
        imageUrl: galleryPreviewUrl ?? '',
        error: `Galeri–caption eşleşmesi yetersiz (${galleryMatchScore}/${galleryFloor}) — "${ideationHeadline.slice(0, 40)}" için uygun foto yok`,
        slotKey,
      });
      continue;
    }

    // Overlay must not fight the Instagram caption (kitchen headline + DJ body).
    if (
      usesFalDesignerTrackEarly
      && caption.trim().length >= 24
      && hasCaptionHeadlineThemeConflict(caption, headline)
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
    const willRemotionStoryForEnhance = bundleCards !== false
      && isStoryIdeaForEnhance
      && Boolean(resolvedReferenceUrl)
      && (!isOrganicStoryStillSlot || productionProfile.requireDesignedVisuals)
      && !isFalDesignedPostSlotEarly;
    const willRemotionPostForEnhance = bundleCards !== false && (
      shouldRenderRemotionPoster(assignment)
      || slotUsesRemotionPost(productionProfile, assignment, kind)
    );

    const useMultiGallery = !captionDrivenGenerated
      && hasGallery
      && shouldUseMultiGalleryPhotos(assignment, kind);
    const storyLibrarySlotKey = assignmentImpliesStoryFormat(assignment.slot_role)
      ? (assignment.library_slot_key ?? missionStoryLibrarySlotKey(templateLibrary, storyIndex))
      : undefined;
    const slotStoryTemplateFamily = storyTemplateFamilyForSlot(templateLibrary, storyLibrarySlotKey);

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

    // ── Designed-post background enhance ────────────────────────────────────
    // Run a photo-quality-only pass for designed_post BEFORE the Remotion overlay render.
    // Unlike story/reel enhance, this must NOT add text — Remotion handles that.
    if (
      !captionDrivenGenerated
      && isDesignedPostSlotEarly
      && referenceUrl
      && aiVisualStandard.enabled
      && !isNonVenueSector(brandBusinessType)
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
        sceneBrief: null,
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
          willRemotionStory: false,
          willRemotionPost: false,
          designedPosterSync: false,
          designedPostPhotoEnhance: true,
          skipEnhanceForRemotionGrade: serverConfig.productionFlags.skipEnhanceForRemotionGrade,
          productionProfile,
        },
      });
      if (bgEnhance.applied && bgEnhance.photoUrls[0]) {
        enhancedGallerySet = [bgEnhance.photoUrls[0]];
        referenceUrl = bgEnhance.photoUrls[0];
        aiEnhanceApplied = true;
        aiEnhanceSkipReason = undefined;
        console.log(`[auto-produce] designed_post background enhanced: "${headline.slice(0, 40)}"`);
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
        willRemotionStory: willRemotionStoryForEnhance,
        willRemotionPost: willRemotionPostForEnhance,
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
          console.log(`[auto-produce] GPT enhance failed on seed photo → fresh AI generation for: "${headline.slice(0, 40)}"`);
          const baseUrl = getNextjsInternalOrigin();
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
            aiEnhanceSkipReason = undefined;
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
    // Reel         → Runway Gen4 Turbo image-to-video (~$0.10/5s)
    // Post/Story   → gpt-image-2 (AI ayar açık) → Remotion motion/still (marka token + şablon)
    // Reel         → Runway Gen4 / fal.ai designer (Remotion kullanılmaz)
    let imageUrl: string | null = null;
    let videoUrl: string | null = null;
    let carouselUrls: string[] = [];
    let videoProduceMeta: {
      source: 'kling' | 'luma' | 'fal_video';
      strategy?: string;
      photoCount?: number;
      cameraMotion?: string;
      reelPace?: string;
      sectorId?: string;
      i2vReused?: boolean;
      reusedFromArtifactId?: string;
    } | null = null;

    // ── Product Showcase pipeline (AI background replacement) ───────
    const isProductShowcase = assignment.pipeline === 'product_showcase'
      || assignment.slot_role === 'product_showcase_post'
      || assignment.slot_role === 'product_showcase_story';
    const isFalMissionVideo = isFalVideoPipeline(assignment.pipeline);
    const isFalDesignPost = isFalDesignPipeline(assignment.pipeline) || isPaidAdSlot;
    const isFalOnlyPost = isFalOnlyPostPipeline(assignment.pipeline);
    const isFalOnlyVideo = isFalOnlyVideoPipeline(assignment.pipeline);
    const usesFalDesignerTrack = isFalMissionVideo || isFalDesignPost || isFalOnlyPost || isFalOnlyVideo;
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
        `remotion=${calendarDesignLayout.layoutFamilyHint} source=${calendarDesignLayout.source}`,
      );
    }
    const falDesignCtx = usesFalDesignerTrack && !adHocBrief
      ? resolveFalDesignPromptContext({
          caption,
          headline,
          mood,
          strategicPurpose,
          templateUseCase,
          format: falBriefFormat,
          slotRole: assignment.slot_role,
          sceneHint: falSceneHint,
          layoutFamilyHint: calendarDesignLayout?.layoutFamilyHint ?? assignment.layout_family_hint,
          explicitCanvaArchetypeId: calendarDesignLayout?.canvaArchetypeId,
          falDesignHint: assignment.fal_design_hint,
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
    if (calendarEventOverlay?.headline && calendarEventOverlay.headline !== headline) {
      headline = calendarEventOverlay.headline;
      ideationHeadline = calendarEventOverlay.headline;
    }
    const falCalendarSubtitle = isCalendarSlot
      ? calendarEventOverlay?.subtitle
      ?? String(
        ideaRecord.tagline ?? ideaRecord.subline
        ?? (idea.event_details as Record<string, unknown> | undefined)?.tagline
        ?? '',
      ).trim() || undefined
      : undefined;
    const falTypoSlot = assignment.library_slot_key
      ? templateLibrary.slots.find((s) => s.key === assignment.library_slot_key)
      : undefined;
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

    if (usesFalDesignerTrack && !adHocBrief && !isCalendarSlot) {
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
          caption,
          headline,
          cta,
          mood,
          referenceUrl: referenceUrl || null,
          sceneHint: falSceneHint || undefined,
          grafikerMaxRetries,
          designBriefDirectives: [
            ...(falDesignCtx?.promptDirectives ?? []),
            ...(calendarEventOverlay?.directives ?? []),
            ...falGridRotationDirectives,
            ...(adPublishChannel ? resolveFalAdCreativeDirectives(adPublishChannel) : []),
          ],
          designerMotionCue: falDesignCtx?.brief.motionCue || (adHocBrief ? String((idea as ParsedIdea).motion_cue ?? '') : undefined),
          artDirection: adHocBrief ? String((idea as ParsedIdea).visual_direction ?? '').trim() || undefined : undefined,
          falLogoPlacement: falDesignCtx?.brief.logoPlacement,
          isFalMissionVideo,
          isFalDesignPost,
          isFalOnlyPost,
          isFalOnlyVideo,
          isProductShowcase,
          adHocBrief,
          falAspectRatio: isPaidAdSlot
            ? '4:5'
            : isCalendarSlot && pkgFmt === 'story'
              ? '9:16'
              : undefined,
          requireGroundedGallery: resolveFalRequireGroundedGallery({
            requireGroundedGallery: isCalendarSlot || adHocBrief || isPaidAdSlot,
            referencePhotoUrl: referenceUrl,
            sector: brandBusinessType,
            pipeline: isFalMissionVideo
              ? (assignment.pipeline === 'fal_reel' ? 'fal_reel' : 'fal_story')
              : undefined,
            captionDrivenGenerated,
          }),
          falDesignIntensityOverride: calendarIntensityBundle?.level
            ?? falGridIntensityOverride,
          falBackgroundStyleOverride: falGridBackgroundOverride,
          falGridSurfaceKind: slotFalGridSurface ?? undefined,
          captionAwareHeadline: false,
          falSubtitle: falCalendarSubtitle,
          falFontPersonality: falSlotTypography?.fontPersonality,
          falHeadingFont: falSlotTypography?.headingFont,
          falBodyFont: falSlotTypography?.bodyFont,
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
        },
      };
      await runPipelineStages(slotCtx, [
        falVideoHandler,
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
      videoProduceMeta = slotCtx.state.videoProduceMeta;
      costEstimate += slotCtx.state.costDelta;
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
      if (enhancedGallerySet.length >= 2) {
        carouselUrls = [...enhancedGallerySet];
        carouselGalleryUrls = [...enhancedGallerySet];
        for (const gUrl of sourceGalleryUrlsForSlot.length > 0
          ? sourceGalleryUrlsForSlot
          : carouselGalleryUrls) {
          markSourceGalleryUsed(galleryUsage, batchUsedByType, gUrl, 'carousel');
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
          count:        CAROUSEL_TARGET_SLIDES,
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
      if (carouselUrls.length >= CAROUSEL_MIN_SLIDES) {
        console.log(
          `[auto-produce] Carousel slides: ${carouselUrls.length} (gallery=${carouselGalleryUrls.length}) — "${headline.slice(0, 40)}"`,
        );
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
    const willRemotionStorySoon = bundleCards !== false && isStoryIdeaEarly && Boolean(referenceUrl)
      && !isOrganicStoryStill && !isFalDesignedPostSlot && !isFalMissionVideo && !isFalOnlyVideo;
    const skipMarkyLayer = Boolean(videoUrl) || isReel || (isCarousel && carouselUrls.length >= 2)
      || willRemotionStorySoon
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

    let remotionFalAlignment: RemotionFalTemplateAlignment | null = null;
    if (isRemotionFalAlignedSlot(assignment) && !adHocBrief) {
      remotionFalAlignment = await alignRemotionPosterWithFalTemplate({
        workspaceId,
        slotRole: assignment.slot_role,
        librarySlotKey: assignment.library_slot_key,
        caption,
        brandColors: { primary: syncPrimaryColor ?? '', accent: syncAccentColor ?? '' },
        brandVibe: null,
        logoUrl: brandLogoUrl || undefined,
        adHocBrief,
      });
      if (remotionFalAlignment) {
        console.log(
          `[auto-produce] [remotion-fal-align] "${remotionFalAlignment.matched.templateName}" ` +
          `(${remotionFalAlignment.matched.templateType}) → ${assignment.slot_role}`,
        );
      }
    }

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
      if (isDesignedPostSlot && !designedPosterSyncUrl) {
        console.warn(
          `[auto-produce] Designed post slot withheld (no branded poster): "${headline.slice(0, 40)}"`,
        );
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

    // Organic designed posts — fal_design pipeline handles branded layers.

    // Reels: Runway/fal MP4 only — never fall back to Remotion story motion.
    if (isReel && !videoUrl) {
      console.warn(`[auto-produce] reel skip (no video): ${headline.slice(0, 50)} — ${reelFailureReason ?? 'unknown'}`);
      results.push({
        title: headline,
        imageUrl: referenceUrl ?? '',
        error: reelFailureReason ?? 'Reel videosu üretilemedi (Runway/fal.ai)',
        slotKey,
      });
      continue;
    }

    // Guard: skip only when there is no video, still, or gallery reference for Remotion
    if (!videoUrl && !imageUrl && !referenceUrl) {
      if (missionId) {
        console.warn(`[auto-produce] mission slot empty — skipping: "${headline.slice(0, 50)}"`);
      } else {
        console.warn(`[auto-produce] no contentUrl produced for "${headline.slice(0, 50)}", skipping save`);
      }
      const pipelineErr = falPipelineFailureReason;
      results.push({
        title: headline,
        imageUrl: '',
        error: pipelineErr ?? 'Production failed: no image or video URL',
        slotKey,
      });
      continue;
    }
    if (missionId && !videoUrl && !imageUrl && referenceUrl) {
      imageUrl = referenceUrl;
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

    const isStoryIdea = kind === 'instagram_story' || kind === 'instagram_canvas'
      || assignmentImpliesStoryFormat(assignment.slot_role);
    const willRemotionStoryRender = bundleCards !== false
      && Boolean(referenceUrl)
      && !designedPosterReady
      && !isPaidAdSlot
      && effectiveKind !== 'instagram_reel'
      && !isReel
      && (
        shouldRenderRemotionStory(assignment, { forceEvent: hasEventDetails || isCanvas })
        || slotUsesRemotionStory(productionProfile, assignment, effectiveKind)
      );
    const willRemotionPostRender = bundleCards !== false
      && effectiveKind === 'instagram_post'
      && Boolean(referenceUrl)
      && !markyBranded
      && !designedPosterReady
      && (shouldRenderRemotionPoster(assignment)
        || slotUsesRemotionPost(productionProfile, assignment, effectiveKind));
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
      results.push({ title: headline, imageUrl: '', error: 'Production failed: no persistable content URL', slotKey });
      continue;
    }

    const publishHeadline = sanitizeProductionHeadline({
      headline,
      ideationHeadline: storedIdeationHeadline,
      caption: publishCaption || caption,
      brandName: resolvedBrandName,
      conceptTitle: String(idea.concept_title ?? idea.idea_title ?? idea.title ?? ''),
      businessType: brandBusinessType,
      maxLen: adPublishChannel ? adHeadlineCharLimit(adPublishChannel) : 72,
    });
    const designOverlayHeadline = publishHeadline;
    headline = designOverlayHeadline;
    if (
      !ideationHeadline
      || isGalleryTagHeadline(ideationHeadline)
    ) {
      ideationHeadline = storedIdeationHeadline || designOverlayHeadline;
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
    const falDesignedStillUrl = (isFalMissionVideo || isFalOnlyVideo) && imageUrl && !isVideoMediaUrl(imageUrl)
      ? imageUrl
      : null;
    const previewStillUrl = pickStillPreviewUrl(
      designedPosterSyncUrl,
      falDesignedStillUrl,
      willRemotionStoryRender ? storyPosterUrl : null,
      markyBranded ? imageUrl : null,
      willRemotionPostRender ? postPlaceholderUrl : null,
      galleryPreviewUrl,
    );

    const contentJson = JSON.stringify({
      kind: effectiveKind,
      contentType: effectiveFmt,
      caption: publishCaption,
      caption_draft: originalIdeationCaption || undefined,
      ideation_caption: originalIdeationCaption || undefined,
      hashtags: publishHashtags,
      cta,
      imageUrl: previewStillUrl ?? undefined,
      posterUrl: previewStillUrl ?? galleryPreviewUrl ?? storyPosterUrl ?? postPlaceholderUrl ?? designedPosterSyncUrl ?? undefined,
      videoUrl: willRemotionRender ? null : (isPlayableVideoUrl(videoUrl) ? videoUrl : null),
      carousel_urls: carouselUrls.length ? carouselUrls : undefined,
      gallery_photo_urls: carouselGalleryUrls.length ? carouselGalleryUrls : undefined,
      ...(carouselGalleryUrls.length >= 2 ? { carousel_multi_photo: true } : {}),
      headline: designOverlayHeadline,
      design_overlay_headline: designOverlayHeadline,
      ideation_headline: storedIdeationHeadline || undefined,
      idea_index: ideaIndex,
      mission_id: missionId || undefined,
      ...(resolvePlanningIdeaIndex(ideaRecord) != null
        ? { planning_idea_index: resolvePlanningIdeaIndex(ideaRecord) }
        : {}),
      node_key: nodeKey || undefined,
      ...(willRemotionRender || bundleReadyNow ? {
        production_bundle: true,
        bundle_status: bundleReadyNow ? 'ready' : 'rendering',
        idea_id: ideaId,
      } : {}),
      agency_branded: markyBranded,
      ai_gallery_enhanced: aiEnhanceApplied,
    });

    const ideaCostUsd = Math.round((costEstimate - ideaCostBefore) * 1000) / 1000;

    if (ideaCostUsd > 0) {
      const { emitAiCostLine } = await import('@/lib/ai-cost-telemetry');
      emitAiCostLine({
        callType: 'other',
        usd: ideaCostUsd,
        missionId: missionId ?? null,
        workspaceId,
        slotKey: `${ideaIndex}:${assignment.slot_role}`,
        detail: `slot-rollup:${assignment.pipeline ?? assignment.slot_role}`,
      });
    }

    let remotionStoryMeta: Record<string, unknown> = {};
    if (willRemotionStoryRender) {
      const storyIntent = resolveContentIntent({
        treatment,
        templateUseCase: String(idea.template_use_case || ideaRecord?.template_use_case || ''),
        mood,
        headline,
      });
      const storySlotKey = assignment.library_slot_key
        ?? missionStoryLibrarySlotKey(templateLibrary, storyIndex);
      const storyPick = resolveBrandStoryProductionTemplate({
        library: templateLibrary,
        sector: brandBusinessType,
        intent: storyIntent,
        treatment,
        ideaIndex,
        headline,
        caption: publishCaption || caption,
        slotRole: assignment.slot_role,
        templateUseCase: String(idea.template_use_case || ''),
        hasEventDetails,
        librarySlotKey: storySlotKey,
      });
      remotionStoryMeta = {
        library_slot_key: storySlotKey,
        remotion_mission_story: true,
        templateId: storyPick.storyTemplateId,
        storyTemplateId: storyPick.storyTemplateId,
        compositionId: storyPick.compositionId,
        kitId: storyPick.kitId,
        brandTemplateLocked: storyPick.libraryLocked || templateLibrary.locked,
      };
    }

    const slotFalRequests = getCapturedFalRequests();
    const metadata: Record<string, unknown> = {
      ...(brandDesignTemplateId
        ? {
          brand_design_template_id: brandDesignTemplateId,
          brand_design_template_type: brandDesignTemplateType,
          brand_design_template_name: brandDesignTemplateName,
        }
        : {}),
      cost_usd_estimate: ideaCostUsd,
      contentType: effectiveFmt,
      kind: effectiveKind,
      platform: 'instagram',
      headline: designOverlayHeadline,
      design_overlay_headline: designOverlayHeadline,
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
        if (videoUrl && isFalMissionVideo) {
          const rawFalI2v = videoProduceMeta
            && (videoProduceMeta.source === 'kling'
              || videoProduceMeta.source === 'luma'
              || videoProduceMeta.source === 'fal_video')
            && !falDesignEngine;
          return rawFalI2v ? 'fal_raw_i2v' : 'fal_designer_video';
        }
        if (isFalOnlyPost && imageUrl && falDesignEngine) return 'fal_only_post';
        if (isFalDesignPost && imageUrl && falDesignEngine) {
          return falDesignEngine === 'gpt_image_designed'
            ? 'gpt_image_designed_post'
            : 'fal_designer_post';
        }
        if (videoUrl) return normalizeProductionPipeline(assignment.pipeline) === 'fal_reel' ? 'fal_reel' : 'runway_reel';
        if (willRemotionStoryRender) return 'remotion_story_async';
        if (missionVisualDesignRendered) return 'mission_visual_design_card';
        if (designedPosterSyncUrl) return 'remotion_poster_sync';
        if (willRemotionPostRender) return 'remotion_post_async';
        if (markyBranded && imageUrl && referenceUrl && imageUrl !== referenceUrl) {
          return 'remotion_poster_marky';
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
            typography_text_valid: true,
          }
        : productionProfile.requireDesignedVisuals
          ? { production_route: 'designed_grafiker', marky_disabled: true }
          : {}),
      flux_used: false,
      agency_defaults_forced: agencyProductionForced,
      agency_produced: markyBranded || Boolean(designedPosterSyncUrl) || Boolean(videoUrl) || isCanvas || (isCarousel && carouselUrls.length > 0) || (isFalDesignPost && Boolean(imageUrl) && Boolean(falDesignEngine)) || ((isFalOnlyPost || isFalOnlyVideo) && Boolean(imageUrl || videoUrl)),
      hero_reel_produced: Boolean(videoUrl) && !isFalMissionVideo && !isFalOnlyVideo,
      fal_video_produced: isPlayableVideoUrl(videoUrl) && (isFalMissionVideo || isFalOnlyVideo),
      fal_designer_produced: (Boolean(videoUrl) && (isFalMissionVideo || isFalOnlyVideo)) || ((isFalDesignPost || isFalOnlyPost) && Boolean(imageUrl) && Boolean(falDesignEngine)),
      ...(isFalMissionVideo && videoProduceMeta ? { fal_video_model: videoProduceMeta.source } : {}),
      ...(videoProduceMeta ? {
        video_source: videoProduceMeta.source,
        video_strategy: videoProduceMeta.strategy,
        video_photo_count: videoProduceMeta.photoCount,
        camera_motion: videoProduceMeta.cameraMotion ?? null,
        reel_pace: videoProduceMeta.reelPace ?? null,
        sector_id: videoProduceMeta.sectorId ?? normalizeSectorId(brandBusinessType),
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
          i2v_source_image_url: pickedGallerySourceUrl ?? referenceUrl ?? null,
          i2v_motion_type: 'raw_gallery',
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
      videoUrl: willRemotionRender ? null : (isPlayableVideoUrl(videoUrl) ? videoUrl : null),
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
      ai_enhance_level: aiVisualStandard.enabled ? aiPhotoEnhanceLevel : undefined,
      ai_visual_standard_enabled: aiVisualStandard.enabled,
      ai_visual_standard: buildAiVisualStandardMetadata(aiVisualStandard, aiPhotoEnhanceLevel),
      ai_visual_subject_resolved: resolvedVisualSubject,
      visual_pipeline_steps: resolveVisualPipelineSteps(aiVisualStandard, kind, assignment, {
        willRemotionStory: willRemotionStoryRender,
        willRemotionPost: willRemotionPostRender,
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
      ...(willRemotionRender || bundleReadyNow ? {
        production_bundle: true,
        bundle_status: bundleReadyNow ? 'ready' : 'rendering',
        idea_id: ideaId,
        poster_url: galleryPreviewUrl ?? storyPosterUrl ?? postPlaceholderUrl,
        posterUrl: galleryPreviewUrl ?? storyPosterUrl ?? postPlaceholderUrl,
      } : {}),
      ...remotionStoryMeta,
    };

    const title = buildArtifactListTitle({
      conceptTitle: getField(idea, 'concept_title', 'idea_title'),
      ideationHeadline: storedIdeationHeadline,
      caption: publishCaption,
      brandName: resolvedBrandName,
      format: effectiveFmt,
    });

    const persistContentUrl = nexusPersistableContentUrl(nexusPrimaryContentUrl, [
      referenceUrl ?? '',
      ...carouselGalleryUrls,
      ...carouselUrls,
    ]);

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
      && bundleReadyNow
      && !willRemotionRender,
    );
    results.push({
      id: saved.id,
      title,
      imageUrl: persistContentUrl,
      videoUrl: videoUrl ?? undefined,
      error: saved.error,
      publishReady: publishReadyNow,
      rendering: Boolean(saved.id && !saved.error && willRemotionRender),
      slotKey,
      metadata,
    });

    if (saved.id && !saved.error) {
      existingArtifactKeys.add(ideaDedupeKey);
    }

    if (saved.id && !saved.error && ideaCostUsd > 0) {
      const { recordArtifactProductionCost } = await import('@/lib/cost-ledger-client');
      await recordArtifactProductionCost({
        workspaceId,
        missionId: missionId ?? null,
        artifactId: saved.id,
        amountUsd: ideaCostUsd,
        pipeline: String(assignment.pipeline ?? ''),
        slotRole: assignment.slot_role,
        ideaIndex: resolvedIdeaIndex,
        slotKey: `${ideaIndex}:${assignment.slot_role}`,
      });
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

    // ── Story → Remotion: TÜM story'ler için Remotion render tetiklenir ─────
    if (willRemotionRender && saved.id && storyPosterUrl) {
      let gallerySeriesUrls: string[] = enhancedGallerySet.length >= 2
        ? [...enhancedGallerySet]
        : (referenceUrl ? [referenceUrl] : []);
      const gallerySeqTarget = storyGalleryPhotoTarget({
        assignment,
        contentKind: kind,
        templateFamily: slotStoryTemplateFamily,
      });
      if (gallerySeqTarget > 1 && gallerySeriesUrls.length < gallerySeqTarget && hasGallery && galleryPhotos.length >= 2) {
        if (carouselGalleryUrls.length >= 2) {
          for (const u of carouselGalleryUrls) {
            if (!gallerySeriesUrls.includes(u)) gallerySeriesUrls.push(u);
            if (gallerySeriesUrls.length >= gallerySeqTarget) break;
          }
        }
        if (gallerySeriesUrls.length < gallerySeqTarget) {
          const extras = pickSupplementaryGalleryPhotos(
            caption,
            headline,
            mood,
            galleryMeta,
            galleryPhotos,
            referenceUrl ?? '',
            batchUsedByType[postType],
            gallerySeqTarget - 1,
            postType,
          );
          for (const u of extras) {
            if (!gallerySeriesUrls.includes(u)) gallerySeriesUrls.push(u);
            markGalleryUrlUsedForPostType(galleryUsage, u, postType);
            batchUsedByType[postType].push(u);
            if (gallerySeriesUrls.length >= gallerySeqTarget) break;
          }
        }
      }

      const galleryPhotoUrls = slotStoryTemplateFamily === 'polaroid_single'
        ? undefined
        : gallerySeriesUrls.length >= 2
          ? gallerySeriesUrls
          : undefined;
      creatomateStoryCandidates.push({
        headline,
        caption: (idea.caption_draft ?? idea.caption ?? '') as string,
        voiceoverCaption: publishCaption || caption,
        photoUrl: referenceUrl ?? '',
        galleryPhotoUrls,
        galleryLayout: galleryPhotoUrls
          ? (prefersGallerySequenceStory(assignment, ideaRecord, galleryPhotoUrls.length)
            ? 'sequence'
            : resolveGallerySeriesLayout(galleryPhotoUrls.length, ideaIndex))
          : undefined,
        treatment,
        mood: (idea.mood || '') as string,
        templateUseCase: String(idea.template_use_case || ''),
        event_details: (idea.event_details as Record<string, string> | undefined),
        artifactId: saved.id,
        ideaId,
        sceneBriefBlock: buildSceneBriefPromptBlock(missionStoryBrief ?? sceneBrief),
        preferredLayoutFamily: layoutFamilyHint,
        slotRole: assignment.slot_role,
        publishChannel: assignment.publish_channel,
        ideaIndex,
        librarySlotKey: assignment.library_slot_key
          ?? missionStoryLibrarySlotKey(templateLibrary, storyIndex),
        galleryMatchScore: galleryMatchScore ?? null,
        premiumComposition: ideaPremiumComposition,
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
          premiumComposition: ideaPremiumComposition,
      });
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
      console.error(`[auto-produce] slot failed (continuing): slotKey=${slotKey}`, slotErr);
      results.push({
        title: headline || '(slot failed)',
        imageUrl: '',
        error: message,
        slotKey,
      });
    } finally {
      clearFalRequestSlot();
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
      creatomateStoryCandidates.push(...postStoryAdapt.storyCandidates);
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
    && creatomateStoryCandidates.length === 0
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
        librarySlotKey: guaranteeAssignment.library_slot_key
          ?? missionStoryLibrarySlotKey(templateLibrary, gi),
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
