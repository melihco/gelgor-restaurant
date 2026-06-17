import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import {
  canProduce,
  recordProduction,
  cleanupOldBuckets,
  canAffordRunway,
  incrementReelCount,
  fetchPackageLimits,
} from './budget';
import { isWeakGalleryMatch, shouldSkipProductionForWeakGallery } from '@/lib/gpt-enhance-policy';
import { MIN_ACCEPT_SCORE, RUNWAY_GALLERY_MIN_SCORE } from '@/lib/gallery-photo-matcher';
// matchPhotoToContent, resolveBestGalleryUrl, pickScoredCarouselSlides, MatchPhotoInput → caption-publish-resolver / image-generators
import { slotNeedsSceneBrief } from '@/lib/scene-brief-policy';
import {
  type PostTypeBucket,
  type UsedGalleryUsage,
  fetchUsedGalleryImages,
  getExcludeUrlsForPostType,
  isGalleryUrlUsedForPostType,
  kindToPostType,
  markGalleryUrlUsedForPostType,
  normalizeGalleryUrl,
} from '@/lib/gallery-usage-tracker';
import { fetchRecentTemplateIds } from '@/lib/template-usage-tracker';
import {
  enrichGalleryAnalysis,
  assignPhotosToContents,
  type GalleryPhotoMeta,
} from '@/lib/gallery-photo-matcher';
import { scoreIdeationPhotoMatch } from '@/lib/caption-photo-alignment';
import {
  buildRunwayGalleryScenePackage,
  galleryMetaToRendererGallery,
} from '@/lib/runway-scene-from-gallery';
import { shouldAutoProduceEnhanceGallery } from '@/lib/venue-photo-policy';
import {
  filterReachableGalleryUrls,
  normalizePhotoUrlForRemotionRender,
  toFeedPreviewUrl,
  normalizeExternalPhotoUrl,
  isStockGalleryPhotoUrl,
  probeMediaUrl,
  probeMediaUrlReliable,
} from '@/lib/media-url';
import { isNonVenueSector } from '@/lib/sector-gallery-seed';
import {
  isCaptionDrivenDefault,
  getSectorColorGrade,
  isNonVenueSectorProfile,
} from '@/lib/sector-production-profile';
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
import { normalizeHashtags, resolveCarouselUrls } from '@/app/mobile/_components/artifact-utils';
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
  toStorySceneBrief,
  toReelSceneBrief,
  type ProductSceneBrief,
} from '@/lib/production-stack';
import { fetchRejectedLayoutFamilies } from '@/lib/layout-family-learning';
import {
  buildIdeaProductionDedupeKey,
  loadMissionAutoArtifactDedupeKeys,
} from '@/lib/mission-production-guard';
import {
  pickMissionVisualDesignCard,
  type MissionVisualDesignCard,
} from '@/lib/mission-visual-design-cards';
import {
  ensureWeeklyFormatCoverage,
  mergeIdeationWithCalendarPlans,
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
import { resolveKitForSector } from '@/lib/remotion-template-registry';
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
  resolveMeaningfulProductionHeadline,
} from '@/lib/production-headline-quality';
import { resolveIdeationHeadline } from '@/lib/production-idea-parse';
import { enforceDisplayHeadline } from '@/lib/remotion-quality';
import { getBrandKit } from '@/lib/agency-brand-kits';
import { getRemotionTemplate } from '@/lib/remotion-template-catalog';
import {
  applyBrandTokensToRenderProps,
  resolveBrandProductionTokens,
} from '@/lib/brand-production-tokens';
import { renderRemotionBrandStill, renderRemotionBrandStillResult } from '@/lib/remotion-brand-kit';
import { resolveSlotLogoForRender } from '@/lib/brand-logo-production';
import { persistRemotionVideoOutput } from '@/lib/remotion-video-persist';
import {
  fetchBrandThemeForProduction,
  resolveProductionVisualStandard,
} from '@/lib/brand-theme-ai-settings';
import { auditPosterOverlayCopy, resolvePosterOverlayCopy } from '@/lib/poster-copy';
import type { StoryCompositionId } from '@/remotion/types';
import {
  buildMultiReelPhotoInputs,
  estimateRunwayReelCostUsd,
  maxPhotosForStrategy,
  resolveRunwayReelStrategy,
} from '@/lib/reel-multi-production';
import { normalizeCameraMotion } from '@/lib/camera-motion';
// resolveRunwayCameraMotionForFidelity → handlers/image-generators.ts
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
} from './caption-publish-resolver';
import {
  generateVibeImage,
  generateDesignedImageFromMissionCard,
  generateEventOverlayImage,
  generateMarkyLayerCard,
  generateVibeCarousel,
  renderEventCardFromPayload,
  generateRunwayReel,
} from './handlers/image-generators';
import { scoreReelHook } from '@/lib/reel-hook-score';
import { generateFalVideo } from '@/lib/fal-video';
import {
  CAROUSEL_MIN_SLIDES,
  CAROUSEL_TARGET_SLIDES,
  isCarouselAssignment,
  fillCarouselPhotoPool,
  attachReelPhotoRefs,
} from './handlers/slot-utils';
import {
  type StoryCandidate,
  type PostCandidate,
  runRemotionStoryPhase,
  runRemotionPostPhase,
} from './remotion-render-phase';

const nexusClient = createDefaultNexusClient();


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
  bundleCards?: boolean;
  feedDirectorReport: Record<string, unknown> | null;
  strategistMissionType: string | null;
  productionPackage: string | null;
  missionTitle: string | null;
  creativeBrief: string | null;
  skipArtifactDedupe?: boolean;
}

export async function runProduction(params: RunProductionParams): Promise<NextResponse> {
  const {
    workspaceId, missionId, nodeKey,
    ideas, visualDesignCards,
    galleryAnalysis: galleryAnalysisInput,
    brandNameOverride, productionSnapshot, bundleCards,
    feedDirectorReport, strategistMissionType,
    productionPackage, missionTitle, creativeBrief, skipArtifactDedupe,
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
      baseUrl: process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000',
      productionSnapshot,
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
  const templateLibrary = pctx.templateLibrary;
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
    feedDirectorReport,
    productionPackage,
    strategistMissionType,
    missionTitle,
    creativeBrief,
    brandBusinessType,
    brandTheme,
    pipelineRun,
  });

  if (planOutcome.status === 'blocked') {
    releaseAllProductionLocks(workspaceId, missionId);
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
    maxRunwayReelsPerMission,
    hasOrganicReelAssignment,
  } = planOutcome.plan;

  const routeBaseUrl = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';

  let runwayReelsProducedInMission = 0;
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
      releaseAllProductionLocks(workspaceId, missionId);
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
    .filter((u): u is string => typeof u === 'string' && u.startsWith('http'));
  if (briefPhotoUrls.length > 0 && !gctx.hasPhotos) {
    galleryPhotos = [...new Set([...briefPhotoUrls, ...galleryPhotos])];
  }

  const hasGallery = gctx.hasPhotos || briefPhotoUrls.length > 0;
  const hasRealBrandPhotos = gctx.hasRealPhotos;
  const galleryUsage = gctx.usage;
  const batchUsedByType = gctx.batchUsedByType;
  const syncUsedTemplateIds: string[] = [...gctx.recentTemplateIds];
  /** Strategist — avoid same venue photo across slots in one mission run. */
  const batchUsedGalleryMission = new Set<string>();

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
    metadata?: Record<string, unknown>;
  }[] = [];
  let costEstimate = 0;
  const location = brandLocation;

  // ── Production rules (APO-2 pipeline router) ───────────────────────────────
  // organic_post      → gallery photo only + caption in Feed
  // designed_post     → Remotion agency poster (SVG+Sharp)
  // organic_story_still → static gallery story
  // campaign_story_motion → Remotion MP4
  // organic_reel / campaign_reel_motion → Runway (hero budget)
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
    packageSlug: pkgLimits.packageSlug ?? 'weekly',
  });

  const productionLoop: ManifestProductionQueueItem[] = manifestQueue;

  if (missionId) {
    console.log(
      `[auto-produce] Manifest production queue: ${productionLoop.length} slots ` +
      `(ideas=${toProcess.length}, max=${maxIdeas}, package=${manifestMissionType})`,
    );
  }

  const missionGalleryAssignments = buildMissionGalleryAssignments({
    missionId,
    productionLoop,
    galleryPhotos,
    galleryMeta,
    brandBusinessType,
    resolvedBrandName,
    hasGallery,
    hasRealBrandPhotos,
  });

  for (const queueItem of productionLoop) {
    const ideaCostBefore = costEstimate;
    const ideaIndex = queueItem.ideaIndex;
    const idea = queueItem.idea as ParsedIdea;
    const ideaRecord = queueItem.idea;
    let assignment = queueItem.assignment;
    const resolvedIdeaIndex = typeof ideaRecord.idea_index === 'number'
      ? ideaRecord.idea_index
      : ideaIndex;
    const ideaId = missionId ? `${missionId}-${resolvedIdeaIndex}` : randomUUID();
    let caption = getField(idea, 'caption_draft', 'caption');
    const rawIdeationHeadline = resolveIdeationHeadline(idea as Record<string, unknown>);
    let ideationHeadline = rawIdeationHeadline;
    let headline = rawIdeationHeadline;

    const isDesignedPostSlotForHeadline =
      queueItem.assignment.pipeline === 'remotion_poster'
      || queueItem.assignment.slot_role === 'designed_post';
    let slotVisualDesignCard: MissionVisualDesignCard | null = null;
    let slotVisualDesignCardIndex: number | null = null;
    if (isDesignedPostSlotForHeadline && visualDesignCards.length) {
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

    if (!rawIdeationHeadline || isMeaninglessBrandEchoHeadline(rawIdeationHeadline, resolvedBrandName)) {
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
    // Feed Art Director's visual_subject_hint overrides generic caption for gallery matching.
    // Append the hint keywords to ideationCaption so the gallery scorer sees specific
    // service terms (e.g. "tırnak, manikür, nail art") as primary selection signals.
    const fdVisualHint = (assignment?.visual_subject_hint ?? '').trim();
    const ideationCaption = fdVisualHint
      ? `${caption} ${fdVisualHint}`.trim()
      : caption;
    const hashtags = normalizeHashtags(idea.hashtags);
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
    const pkgFmt = detectIdeaPackageFormat(ideaRecord);
    const usesManifestQueue = Boolean(missionId && manifestQueue.length > 0);
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
        });
      })();
    const kind = resolveContentKindForAssignment(ideaRecord, assignment);
    const storyIndex = assignmentImpliesStoryFormat(assignment.slot_role) ? slotStoryCount : 0;
    const galleryOnlyVisual = !productionProfile.requireRemotionGrafiker
      && isGalleryOnlyVisualPolicy(assignment, ideaRecord);
    const slotRole = String(assignment.slot_role);
    const slotPipeline = String(assignment.pipeline);
    const isPaidAdSlot =
      slotRole === 'paid_ad_creative'
      || slotRole === 'paid_ad_google_creative'
      || slotPipeline === 'meta_ad'
      || slotPipeline === 'google_ad';
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
      results.push({ title: headline, imageUrl: '', error: 'duplicate_skipped' });
      continue;
    }

    const postType = kindToPostType(kind);
    const fmt = kind.replace('instagram_', '');
    const mood = idea.mood || '';
    const strategicPurpose = idea.strategic_purpose || '';
    const treatmentLower = ((idea.treatment ?? idea.visual_production_spec?.treatment) || '').toLowerCase();
    const templateUseCase = String(idea.template_use_case || '');
    const typeExclude = getExcludeUrlsForPostType(galleryUsage, postType, batchUsedByType[postType]);
    const missionGalleryExclude = [
      ...typeExclude,
      ...Array.from(batchUsedGalleryMission),
    ];

    if (!caption && !headline) {
      results.push({ title: '(empty idea)', imageUrl: '', error: 'No caption or headline' });
      continue;
    }

    if (shouldSkipIdeaForProduction(resolvedIdeaIndex, feedDirectorReport ?? null, {
      missionProduction: Boolean(missionId),
    })) {
      console.warn(`[auto-produce] Feed Art Director skip (error flag): idea ${resolvedIdeaIndex} "${headline.slice(0, 40)}"`);
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

    const isHeroReel = shouldProduceRunwayForIdea(ideaIndex, kind, stackCtx, {
      reelsProducedInMission: runwayReelsProducedInMission,
      maxReelsPerMission: maxRunwayReelsPerMission,
      slotRole: assignment.slot_role,
      hasOrganicReelAssignment,
    });
    const isStoryIdeaForBrief = kind === 'instagram_story' || kind === 'instagram_canvas';
    const organicStillForBrief = assignment.slot_role === 'organic_story_still';
    const designedPostForBrief =
      assignment.pipeline === 'remotion_poster' || assignment.slot_role === 'designed_post';
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
    let galleryMatchScore: number | null = null;

    const agentUrl = idea.visual_production_spec?.selected_gallery_url || idea.selected_gallery_url || null;
    const batchExclude = batchUsedByType[postType];

    // Brief'ten gelen fotoğraf her zaman öncelik alır — marka galerisi seçimini override et
    if (!referenceUrl && typeof agentUrl === 'string' && agentUrl.startsWith('http')) {
      referenceUrl = agentUrl;
      console.log(`[auto-produce] brief photo override: "${headline.slice(0, 50)}"`);
    }

    if (shouldUseCaptionDrivenVisual(aiVisualStandard, kind, assignment) && !hasRealBrandPhotos && !referenceUrl) {
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

    if (!referenceUrl && hasGallery) {
      const agentGalleryUrl =
        typeof agentUrl === 'string' && (agentUrl.startsWith('http') || agentUrl.startsWith('/api/'))
          ? agentUrl
          : null;
      const gallerySlotKey = missionGallerySlotKey(ideaIndex, String(assignment.slot_role));
      const batchAssigned = missionId && assignmentUsesGalleryPhoto(assignment)
        ? missionGalleryAssignments.get(gallerySlotKey)
        : undefined;

      if (missionId && assignmentUsesGalleryPhoto(assignment)) {
        if (batchAssigned?.url) {
          referenceUrl = batchAssigned.url;
          galleryMatchScore = batchAssigned.score;
        } else {
          console.warn(
            `[auto-produce] no gallery match for slot ${gallerySlotKey} "${ideationHeadline.slice(0, 48)}" — fallback pick`,
          );
          // Use strict mode when caption explicitly names a specific beauty
          // sub-service (nail, lash, hair) — prevents bestEffort from
          // accepting a mis-matched service photo at score ≥10.
          const missionFallbackStrict = captionHasExplicitBeautyService(
            ideationCaption, ideationHeadline,
          );
          referenceUrl = pickGalleryPhotoForIdea(
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
              photoUrl: referenceUrl,
              galleryAnalysis: galleryMeta,
              businessType: brandBusinessType,
              mood,
              contentType: postType,
            });
          }
        }
      } else {
        referenceUrl = pickGalleryPhotoForIdea(
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
          referenceUrl = pickGalleryPhotoForIdea(
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
      referenceUrl = pickGalleryPhotoForIdea(
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
      ) ?? galleryPhotos[ideaIndex % galleryPhotos.length] ?? null;
      if (referenceUrl) {
        referenceIsStock = isStockGalleryPhotoUrl(referenceUrl);
        galleryMatchScore = scoreIdeationPhotoMatch({
          caption: ideationCaption,
          headline: ideationHeadline,
          photoUrl: referenceUrl,
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

    // Marka galerisi varsa gerçek mekan fotoğrafı zorunlu — AI scratch / stock yerine galeri.
    if (hasRealBrandPhotos && galleryPhotos.length) {
      const venuePhotos = galleryPhotos.filter((u) => !isStockGalleryPhotoUrl(u));
      if (venuePhotos.length && (!referenceUrl || referenceIsStock || captionDrivenGenerated)) {
        const venuePick = pickGalleryPhotoForIdea(
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
        ) ?? (missionId ? null : pickGalleryPhotoForIdea(
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
        captionDrivenMode: isNonVenueSectorProfile(brandBusinessType) || isCaptionDrivenDefault(brandBusinessType),
      });
      if (!aiGenerated) {
        console.warn(`[auto-produce] AI image generation failed for: "${headline.slice(0, 50)}"`);
        results.push({ title: headline, imageUrl: '', error: 'Galeri boş ve AI görsel üretimi başarısız oldu' });
        continue;
      }
      referenceUrl = aiGenerated;
      galleryMatchScore = null;
      console.log(`[auto-produce] AI image generated: ${aiGenerated.slice(0, 80)}`);
    }

    if (referenceUrl) {
      referenceUrl = normalizeExternalPhotoUrl(referenceUrl) ?? referenceUrl;
    }

    if (!referenceUrl || !(await probeMediaUrlReliable(referenceUrl))) {
      console.warn(`[auto-produce] broken gallery URL skipped: ${(referenceUrl ?? '').slice(0, 100)}`);
      results.push({
        title: headline,
        imageUrl: '',
        error: referenceUrl?.startsWith('/api/')
          ? 'Üretilen görsel depolamadan okunamadı — birkaç dakika sonra yeniden deneyin'
          : 'Seçilen galeri fotoğrafı erişilemiyor (süresi dolmuş veya geçersiz URL)',
      });
      continue;
    }

    let resolvedReferenceUrl = referenceUrl;
    let galleryPreviewUrl = toFeedPreviewUrl(resolvedReferenceUrl) ?? resolvedReferenceUrl;
    let selectedVisualDesignCard: MissionVisualDesignCard | null = slotVisualDesignCard;
    let selectedVisualDesignCardIndex: number | null = slotVisualDesignCardIndex;
    let missionVisualDesignRendered = false;

    let pickedFromBrandGallery = galleryPhotos.some(
      (u) => normalizeGalleryUrl(u) === normalizeGalleryUrl(resolvedReferenceUrl),
    );
    let photoMetaForCaption = galleryMeta[normalizeGalleryUrl(resolvedReferenceUrl)]
      ?? Object.entries(galleryMeta).find(
        ([k]) => normalizeGalleryUrl(k) === normalizeGalleryUrl(resolvedReferenceUrl),
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

      galleryMatchScore = scorePhoto(resolvedReferenceUrl);

      if (galleryMatchScore < MIN_ACCEPT_SCORE) {
        let bestUrl = resolvedReferenceUrl;
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
          photoMetaForCaption = galleryMeta[normalizeGalleryUrl(resolvedReferenceUrl)]
            ?? Object.entries(galleryMeta).find(
              ([k]) => normalizeGalleryUrl(k) === normalizeGalleryUrl(resolvedReferenceUrl),
            )?.[1];
          console.log(
            `[auto-produce] gallery re-picked for headline (score ${bestScore}): "${ideationHeadline.slice(0, 48)}"`,
          );
        } else if (!missionId) {
          const altUrl = pickGalleryPhotoForIdea(
            ideationCaption,
            ideationHeadline,
            mood,
            galleryMeta,
            galleryPhotos,
            [...missionGalleryExclude, resolvedReferenceUrl],
            [...batchUsedByType[postType], resolvedReferenceUrl],
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
                photoMetaForCaption = galleryMeta[normalizeGalleryUrl(resolvedReferenceUrl)]
                  ?? Object.entries(galleryMeta).find(
                    ([k]) => normalizeGalleryUrl(k) === normalizeGalleryUrl(resolvedReferenceUrl),
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
    // Detect cross-service conflict: gallery score went negative due to beauty sub-service
    // conflict penalty (e.g. nail caption + lash photo → -45). This overrides adaptiveScene
    // so the weak-gallery gate triggers AI fallback even for beauty_wellness sector.
    const captionServiceConflict = typeof galleryMatchScore === 'number' && galleryMatchScore < 0;
    const weakGallery = isWeakGalleryMatch({
      missionProduction: Boolean(missionId),
      galleryMatchScore,
      pickedFromBrandGallery,
      referenceIsStock,
      hasReference: Boolean(resolvedReferenceUrl),
      adaptiveScene: aiVisualStandard.adaptiveScene,
      captionServiceConflict,
    });
    if (weakGallery && mediaFallback === 'logo_hero' && brandLogoUrl) {
      referenceUrl = brandLogoUrl;
      resolvedReferenceUrl = brandLogoUrl;
      galleryPreviewUrl = toFeedPreviewUrl(brandLogoUrl) ?? brandLogoUrl;
      referenceIsStock = false;
      pickedFromBrandGallery = false;
      console.log(
        `[auto-produce] weak gallery (${galleryMatchScore}%) → logo hero fallback: "${headline.slice(0, 40)}"`,
      );
    } else if (weakGallery && mediaFallback === 'brand_solid' && aiVisualStandard.enabled) {
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
          error: `Zayıf galeri eşleşmesi — marka solid üretimi başarısız (${galleryMatchScore}/${MIN_ACCEPT_SCORE})`,
        });
        continue;
      }
      referenceUrl = aiGenerated;
      resolvedReferenceUrl = aiGenerated;
      galleryPreviewUrl = toFeedPreviewUrl(aiGenerated) ?? aiGenerated;
      galleryMatchScore = null;
      pickedFromBrandGallery = false;
      console.log(
        `[auto-produce] weak gallery (${galleryMatchScore}%) → brand solid AI: "${headline.slice(0, 40)}"`,
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
      })
    ) {
      console.warn(
        `[auto-produce] weak gallery (${galleryMatchScore}%) — skip "${headline.slice(0, 40)}"`,
      );
      results.push({
        title: headline,
        imageUrl: galleryPreviewUrl,
        error: `Galeri–başlık eşleşmesi yetersiz (${galleryMatchScore}/${MIN_ACCEPT_SCORE}) — "${ideationHeadline.slice(0, 40)}" için uygun foto yok`,
      });
      continue;
    }

    const isStoryIdeaForEnhance = kind === 'instagram_story' || kind === 'instagram_canvas';
    const isOrganicStoryStillSlot = assignment.slot_role === 'organic_story_still';
    const isDesignedPostSlotEarly =
      assignment.pipeline === 'remotion_poster' || assignment.slot_role === 'designed_post';
    const willRemotionStoryForEnhance = bundleCards !== false
      && isStoryIdeaForEnhance
      && Boolean(resolvedReferenceUrl)
      && (!isOrganicStoryStillSlot || productionProfile.requireRemotionGrafiker)
      && !isDesignedPostSlotEarly;
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
        referenceUrl,
        batchUsedByType[postType],
        extraCount,
        postType,
      );
      enhancedGallerySet = [referenceUrl, ...extras].map(
        (u) => normalizeExternalPhotoUrl(u) ?? u,
      );
    } else {
      enhancedGallerySet = [referenceUrl];
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

    if (!captionDrivenGenerated && !isDesignedPostSlotEarly) {
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
      maxPhotos: pkgFmt === 'story'
        ? storyGalleryPhotoTarget({ assignment, contentKind: kind, templateFamily: slotStoryTemplateFamily })
        : gallerySequencePhotoTarget(assignment, kind),
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
      enhancedGallerySet = enhanceResult.photoUrls;
      referenceUrl = enhanceResult.photoUrls[0]!;
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
      source: 'runway' | 'runway_multi_photo' | 'kling' | 'luma' | 'fal_video';
      strategy?: string;
      photoCount?: number;
    } | null = null;
    let reelHookScore: { score: number; pass: boolean; reasons: string[] } | null = null;

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
      if (!cardUrl && productionProfile.requireRemotionGrafiker) {
        const eventPoster = await renderRemotionBrandStillResult({
          workspaceId,
          photoUrl: referenceUrl,
          headline,
          caption,
          brandName: resolvedBrandName,
          location: brandLocation,
          sector: brandBusinessType,
          mood,
          treatment: String(idea.visual_production_spec?.treatment || idea.treatment || '').toLowerCase(),
          templateUseCase: idea.template_use_case as string | undefined,
          contentType: contentTypeFmt,
          ideaIndex,
          brandTheme,
          logoUrl: brandLogoUrl,
          primaryColor: syncPrimaryColor,
          accentColor: syncAccentColor,
          usedTemplateIds: syncUsedTemplateIds,
          baseUrl: routeBaseUrl,
          cta,
          grafikerMaxRetries,
        });
        cardUrl = eventPoster?.imageUrl ?? null;
      } else if (!cardUrl && shouldUseMarkyLayer(productionProfile)) {
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
      const runwayScene = galleryEntry
        ? buildRunwayGalleryScenePackage(galleryEntry as GalleryPhotoMeta, caption)
        : null;
      const photoDescription = runwayScene?.photoDescription
        ?? (galleryEntry?.description as string | undefined);
      const photoTags = runwayScene?.photoTags
        ?? (Array.isArray(galleryEntry?.contentTags)
          ? (galleryEntry!.contentTags as string[])
          : undefined);
      const reelGalleryMeta = galleryEntry
        ? galleryMetaToRendererGallery(galleryEntry as GalleryPhotoMeta, {
            photoUrl: referenceUrl ?? null,
            caption,
          })
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

      // Runway quality gate: if the gallery photo is a weak semantic match for the caption,
      // skip AI video generation — the opening frame will be visually incoherent.
      const runwayGalleryWeak = pickedFromBrandGallery
        && galleryMatchScore != null
        && galleryMatchScore < RUNWAY_GALLERY_MIN_SCORE;
      if (runwayGalleryWeak) {
        console.warn(
          `[auto-produce] Runway gallery floor: match ${galleryMatchScore}/${RUNWAY_GALLERY_MIN_SCORE} — skipping Reel, using still: "${headline.slice(0, 40)}"`,
        );
        reelFailureReason = `Galeri eşleşme skoru çok düşük (${galleryMatchScore}/${RUNWAY_GALLERY_MIN_SCORE}) — Reel atlandı`;
      }

      const runwayBudget = !runwayGalleryWeak && await canAffordRunway(workspaceId, reelCostUsd);
      if (runwayBudget && runwayBudget.allowed) {
        const reelMood = (reelSpec as Record<string, unknown> | undefined)?.pace
          || (reelSpec as Record<string, unknown> | undefined)?.audio_mood
          || mood;
        const cameraHint = (reelSpec as Record<string, unknown> | undefined)?.camera_movement as string | undefined;
        const normalizedCameraHint = normalizeCameraMotion(cameraHint);
        // Sprint 4 — Brief Split: use typed ReelSceneBrief for richer Runway direction.
        const effectiveReelBrief = missionReelBrief ?? sceneBrief;
        const imageEditPromptForReel = [
          (idea.visual_production_spec as Record<string, unknown> | undefined)?.image_edit_prompt as string | undefined,
          buildRunwayDirectorExtra(effectiveReelBrief),
          // Inject reel-specific opening moment if available.
          (missionReelBrief as any)?.opening_moment
            ? `Opening: ${(missionReelBrief as any).opening_moment}`
            : '',
          (missionReelBrief as any)?.camera_progression
            ? `Camera: ${(missionReelBrief as any).camera_progression}`
            : '',
        ].filter(Boolean).join(' — ');

        // Score the opening hook before firing Runway — result flows into artifact metadata.
        reelHookScore = scoreReelHook({
          headline,
          caption,
          photoDescription,
          photoSceneMoment: runwayScene?.sceneMoment ?? reelGalleryMeta?.sceneMoment,
          photoTags,
          agentVisualDirection: imageEditPromptForReel || undefined,
          cameraMotion: normalizedCameraHint,
          mood: reelMood as string,
        });

        // Sprint 5 — CTA Intrusion Check:
        // Detect if the caption leads with a CTA phrase before establishing value.
        // If so, log a warning — Runway prompt builder already earns the CTA via
        // Beat 3 desire close, so this is about detecting weak brief inputs early.
        const captionLow = caption.toLowerCase();
        const ctaLeadsCaption = /^(?:hemen|şimdi|bugün|now|get|book|reserve|call|shop|buy|order)\b/.test(captionLow.trim());
        if (ctaLeadsCaption) {
          console.warn(
            `[auto-produce] CTA Intrusion: caption leads with action before establishing value — "${caption.slice(0, 60)}"`,
          );
        }

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
          photoSceneMoment: runwayScene?.sceneMoment ?? reelGalleryMeta?.sceneMoment,
          photoMicroMotions: runwayScene?.microMotions ?? reelGalleryMeta?.microMotions,
          photoMood: runwayScene?.photoMood ?? reelGalleryMeta?.photoMood,
          photoUsageContext: runwayScene?.usageContext ?? reelGalleryMeta?.usageContext,
          photoPairingKeywords: runwayScene?.pairingKeywords ?? reelGalleryMeta?.pairingKeywords,
          photoTags,
          brandThemeGrading: brandLutDirective || brandGradingLook
            ? { look: brandGradingLook || undefined, lut_directive: brandLutDirective || undefined }
            : undefined,
          tenantLearningBrief: tenantLearningBrief || undefined,
          sceneBrief: aiVisualStandard.enabled ? sceneBrief : null,
          aiVisualStandard,
          brandContextForVisual: brandCtxForVisual,
          strategicPurpose: String(idea.strategic_purpose ?? ''),
          productType: String(idea.product_type ?? idea.subject ?? getField(idea, 'product_type', 'subject')),
          isHeroReel: true,
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
        } else if (process.env.FAL_API_KEY && referenceUrl) {
          console.log('[auto-produce] Runway failed — trying fal.ai video fallback');
          try {
            const falPrompt = [caption, headline, brandBusinessType].filter(Boolean).join('. ').slice(0, 500);
            const fal = await generateFalVideo(referenceUrl, falPrompt, { durationSecs: 5, timeoutMs: 110_000 });
            videoUrl = fal.videoUrl;
            imageUrl = referenceUrl;
            runwayProduceMeta = { source: fal.model.includes('kling') ? 'kling' : fal.model.includes('luma') ? 'luma' : 'fal_video' };
            console.log('[auto-produce] fal.ai video fallback success:', fal.model);
          } catch (falErr) {
            reelFailureReason = 'Runway + fal.ai video üretilemedi';
            console.warn('[auto-produce] fal.ai fallback also failed:', falErr instanceof Error ? falErr.message : falErr);
          }
        } else {
          reelFailureReason = 'Runway reel üretilemedi';
          console.warn('[auto-produce] Runway failed for reel:', headline.slice(0, 50));
        }
      } else if (runwayBudget) {
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
    if (isDesignedPostSlot) {
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
      && !isOrganicStoryStill && !isDesignedPostSlot;
    const skipMarkyLayer = Boolean(videoUrl) || isReel || (isCarousel && carouselUrls.length >= 2)
      || willRemotionStorySoon
      || (isOrganicStoryStill && isStoryIdeaEarly && !productionProfile.requireRemotionGrafiker)
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

    // APO-4: designed_post — kampanya → event overlay; diğer → Remotion still
    let designedPosterSyncUrl: string | null = null;
    let designedPosterGrafikerScore: number | null = null;
    let designedPosterGrafikerPass = true;
    const isCampaignDesignedPost = isDesignedPostSlot
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
    if (isDesignedPostSlot && referenceUrl && !videoUrl && (!imageUrl || imageUrl === referenceUrl) && !designedPosterSyncUrl) {
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
        templateUseCase: isPaidAdSlot
          ? 'ad_creative'
          : (idea.template_use_case as string | undefined),
        contentType: posterFmt,
        ideaIndex,
        brandTheme,
        logoUrl: brandLogoUrl,
        primaryColor: syncPrimaryColor,
        accentColor: syncAccentColor,
        usedTemplateIds: syncUsedTemplateIds,
        baseUrl: routeBaseUrl,
        cta,
        grafikerMaxRetries,
        slotRole: assignment.slot_role,
        librarySlotKey: assignment.library_slot_key,
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
        if (
          designedPosterGrafikerScore != null
          && designedPosterGrafikerScore < GRAFIKER_PASS_THRESHOLD
          && !designedPosterGrafikerPass
        ) {
          console.warn(
            `[auto-produce] Designed post Grafiker ${designedPosterGrafikerScore}/10 — withheld: "${headline.slice(0, 40)}"`,
          );
          designedPosterSyncUrl = null;
        } else {
          imageUrl = designedPosterSyncUrl;
          costEstimate += 0.01;
          console.log(
            `[auto-produce] Designed post sync (${posterFmt}): "${headline.slice(0, 40)}"`,
          );
        }
      }
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
        });
        continue;
      }
    }

    // Organik + tasarım postları: Remotion SpecPoster + Grafiker (Marky yok)
    const postNeedsBrandLayer =
      (aiVisualStandard.enabled || productionProfile.requireRemotionGrafiker)
      && !galleryOnlyVisual
      && !isReel
      && !videoUrl
      && !isCanvas
      && !(isCarousel && carouselUrls.length >= 2)
      && Boolean(referenceUrl)
      && (kind === 'instagram_post' || (isCarousel && carouselUrls.length < 2))
      && assignment.slot_role !== 'organic_story_still'
      && (productionProfile.requireRemotionGrafiker
        || assignment.slot_role !== 'organic_post');

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
        grafikerMaxRetries,
      });
      if (aiPoster?.imageUrl) {
        const grafikerFail = aiPoster.grafikerScore != null
          && aiPoster.grafikerScore < GRAFIKER_PASS_THRESHOLD
          && !aiPoster.grafikerPass;
        if (grafikerFail && productionProfile.requireRemotionGrafiker) {
          if (missionId && referenceUrl) {
            console.warn(
              `[auto-produce] Grafiker ${aiPoster.grafikerScore}/10 — mission gallery fallback: "${headline.slice(0, 40)}"`,
            );
            imageUrl = referenceUrl;
            designedPosterGrafikerPass = false;
          } else {
            console.warn(
              `[auto-produce] Organic post Grafiker ${aiPoster.grafikerScore}/10 — withheld: "${headline.slice(0, 40)}"`,
            );
            results.push({
              title: headline,
              imageUrl: '',
              error: `Grafiker ${aiPoster.grafikerScore}/10 — poster yayına alınmadı`,
            });
            continue;
          }
        } else {
          imageUrl = aiPoster.imageUrl;
          designedPosterSyncUrl = aiPoster.imageUrl;
          designedPosterGrafikerScore = aiPoster.grafikerScore ?? designedPosterGrafikerScore;
          designedPosterGrafikerPass = aiPoster.grafikerPass ?? designedPosterGrafikerPass;
          costEstimate += 0.01;
          console.log(
            `[auto-produce] Remotion branded post (organic): "${headline.slice(0, 40)}"`,
          );
        }
      } else if (productionProfile.requireRemotionGrafiker) {
        if (missionId && referenceUrl) {
          console.warn(
            `[auto-produce] Remotion poster yok — mission gallery fallback: "${headline.slice(0, 40)}"`,
          );
          imageUrl = referenceUrl;
        } else {
        console.warn(
          `[auto-produce] Remotion poster zorunlu — üretilemedi: "${headline.slice(0, 40)}"`,
        );
        results.push({
          title: headline,
          imageUrl: '',
          error: 'Remotion poster üretilemedi (Grafiker zorunlu profil)',
        });
        continue;
        }
      } else {
        console.warn(
          `[auto-produce] AI branded post layer başarısız — feed ham foto riski: "${headline.slice(0, 40)}"`,
        );
      }
    }

    // Reels: Runway MP4 preferred; Remotion motion fallback when Runway fails (credits/down)
    const reelRemotionFallback = isReel && !videoUrl && Boolean(referenceUrl) && bundleCards !== false
      && (productionProfile.reelRemotionMotionFallback || Boolean(missionId));
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
      if (missionId) {
        console.warn(`[auto-produce] mission slot empty — skipping: "${headline.slice(0, 50)}"`);
      } else {
        console.warn(`[auto-produce] no contentUrl produced for "${headline.slice(0, 50)}", skipping save`);
      }
      results.push({ title: headline, imageUrl: '', error: 'Production failed: no image or video URL' });
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
      : caption;
    const publishHashtags = isEventStory ? [] : hashtags;

    const vpsRaw = (idea.visual_production_spec as Record<string, unknown> | undefined);
    const treatment = String(vpsRaw?.treatment || idea.treatment || '').toLowerCase();
    const designedPosterReady = Boolean(designedPosterSyncUrl);
    const markyBranded = !productionProfile.requireRemotionGrafiker
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
    if (assignmentImpliesReel(assignment.slot_role)) {
      effectiveKind = 'instagram_reel';
      effectiveFmt = 'reel';
    } else if (assignmentImpliesStoryFormat(assignment.slot_role)) {
      effectiveKind = 'instagram_story';
      effectiveFmt = 'story';
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
      && (
        reelRemotionFallback
        || shouldRenderRemotionStory(assignment, { forceEvent: hasEventDetails || isCanvas })
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
      ...(carouselGalleryUrls.length >= 2 ? { carousel_multi_photo: true } : {}),
      headline: ideationHeadline || headline,
      ideation_headline: ideationHeadline || headline,
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

    const ideaCostUsd = Math.round((costEstimate - ideaCostBefore) * 1000) / 1000;

    const metadata: Record<string, unknown> = {
      cost_usd_estimate: ideaCostUsd,
      contentType: effectiveFmt,
      kind: effectiveKind,
      platform: 'instagram',
      headline: ideationHeadline || headline,
      caption: publishCaption.slice(0, 2200),
      cta,
      hashtags: publishHashtags,
      strategic_purpose: strategicPurpose,
      auto_produced: true,
      gallery_sourced: !captionDrivenGenerated,
      gallery_only: GALLERY_ONLY,
      ...(captionDrivenGenerated ? { caption_driven_visual: true } : {}),
      ...(galleryMatchScore != null && galleryMatchScore >= MIN_ACCEPT_SCORE
        ? { gallery_match_score: galleryMatchScore }
        : {}),
      ...(ideationHeadline ? { ideation_headline: ideationHeadline.slice(0, 120) } : {}),
      ...(ideationCaption ? { ideation_caption: ideationCaption.slice(0, 500) } : {}),
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
        if (videoUrl) return 'runway_reel';
        if (willRemotionStoryRender) return 'remotion_story_async';
        if (missionVisualDesignRendered) return 'mission_visual_design_card';
        if (designedPosterSyncUrl) return 'remotion_poster_sync';
        if (willRemotionPostRender) return 'remotion_post_async';
        if (markyBranded && imageUrl && referenceUrl && imageUrl !== referenceUrl) {
          return 'remotion_poster_marky';
        }
        if (aiEnhanceApplied && !productionProfile.requireRemotionGrafiker) {
          return 'gpt_image_enhance';
        }
        if (assignment.pipeline === 'gallery_photo') return 'gallery_raw';
        return assignment.pipeline;
      })(),
      ...(productionProfile.requireRemotionGrafiker
        ? { production_route: 'remotion_grafiker', marky_disabled: true }
        : {}),
      flux_used: false,
      agency_defaults_forced: agencyProductionForced,
      agency_produced: markyBranded || Boolean(designedPosterSyncUrl) || Boolean(videoUrl) || isCanvas || (isCarousel && carouselUrls.length > 0),
      runway_produced: Boolean(videoUrl),
      ...(runwayProduceMeta ? {
        runway_source: runwayProduceMeta.source,
        runway_strategy: runwayProduceMeta.strategy,
        runway_photo_count: runwayProduceMeta.photoCount,
      } : {}),
      ...(reelHookScore ? {
        reel_hook_score: reelHookScore.score,
        reel_hook_pass: reelHookScore.pass,
        reel_hook_reasons: reelHookScore.reasons.join(', ') || null,
      } : {}),
      canvas_produced: isCanvas,
      carousel_urls:   persistedCarouselUrls.length ? persistedCarouselUrls : undefined,
      gallery_photo_urls: carouselGalleryUrls.length ? carouselGalleryUrls : undefined,
      ...(carouselGalleryUrls.length >= 2 ? { carousel_multi_photo: true } : {}),
      ...(carouselPublishAsFeed ? { carousel_publish_as: 'feed' } : {}),
      source: 'auto-produce',
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
      imageUrl: designedPosterSyncUrl
        ?? (willRemotionStoryRender ? storyPosterUrl : (markyBranded ? imageUrl : willRemotionPostRender ? postPlaceholderUrl : (videoUrl ?? imageUrl))),
      videoUrl: willRemotionRender ? null : videoUrl,
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
        postBrandLayer: postNeedsBrandLayer,
      }),
      brandName: resolvedBrandName,
      idea_index: resolvedIdeaIndex,
      // Tüm başarılı üretimler Feed'de görünsün (yedek gizleme yok).
      publish_package: 'primary',
      publish_priority: primaryIdeaIndices.has(resolvedIdeaIndex) ? 'recommended' : 'extended',
      production_role: assignment.slot_role,
      pipeline: assignment.pipeline,
      visual_policy: galleryOnlyVisual ? 'gallery_only' : 'designed',
      copy_bundle_id: assignment.copy_bundle_id,
      publish_channel: assignment.publish_channel,
      assignment_rationale: assignment.rationale ?? null,
      ...(String(nodeKey ?? '').includes('calendar')
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
      } : {}),
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
      layout_family_hint: assignment.layout_family_hint ?? layoutFamilyHint ?? null,
      ...(willRemotionRender || bundleReadyNow ? {
        production_bundle: true,
        bundle_status: bundleReadyNow ? 'ready' : 'rendering',
        idea_id: ideaId,
        poster_url: galleryPreviewUrl ?? storyPosterUrl ?? postPlaceholderUrl,
        posterUrl: galleryPreviewUrl ?? storyPosterUrl ?? postPlaceholderUrl,
      } : {}),
      ...(willRemotionStoryRender ? {
        library_slot_key: assignment.library_slot_key
          ?? missionStoryLibrarySlotKey(templateLibrary, storyIndex),
        remotion_mission_story: true,
      } : {}),
    };

    const title = headline || `${resolvedBrandName} — ${effectiveFmt}`;

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
      metadata,
    });

    if (saved.id && !saved.error) {
      existingArtifactKeys.add(ideaDedupeKey);
    }

    if (
      saved.id
      && !saved.error
      && assignment.slot_role === 'designed_post'
      && persistContentUrl
    ) {
      designedPostSnapshot = {
        imageUrl: persistContentUrl,
        referencePhotoUrl: referenceUrl,
        headline: ideationHeadline || headline,
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
        : [referenceUrl];
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
            referenceUrl,
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
        photoUrl: referenceUrl,
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
        // Sprint 4 — Brief Split: prefer typed StorySceneBrief when available so
        // the Creative Director gets panel-narrative + color-grade hints.
        sceneBriefBlock: buildSceneBriefPromptBlock(missionStoryBrief ?? sceneBrief),
        preferredLayoutFamily: layoutFamilyHint,
        slotRole: assignment.slot_role,
        publishChannel: assignment.publish_channel,
        ideaIndex,
        // FD-assigned library slot key takes priority over rotation-based fallback.
        librarySlotKey: assignment.library_slot_key
          ?? missionStoryLibrarySlotKey(templateLibrary, storyIndex),
        // Sprint 6 — Luxury photo quality gate: pass match score so render phase
        // can detect full-bleed families used with low-quality photos.
        galleryMatchScore: galleryMatchScore ?? null,
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
      const headline = resolveIdeationHeadline(idea as Record<string, unknown>)
        || getField(idea, 'headline', 'concept_title', 'title');
      const caption = getField(idea, 'caption_draft', 'caption');
      const mood = (idea.mood as string | undefined) || '';
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
        true,
        gi,
      );
      if (!referenceUrl || !(await probeMediaUrl(referenceUrl))) continue;

      const guaranteeSourceUrl = referenceUrl;
      const ideaId = missionId ? `${missionId}-guarantee-story-${gi}` : randomUUID();
      const guaranteeAssignment = {
        idea_index: gi,
        slot_role: 'campaign_story_motion' as const,
        pipeline: 'remotion_story' as const,
        copy_bundle_id: `${missionId.slice(0, 8)}-remotion-story`,
        publish_channel: 'instagram_campaign' as const,
        rationale: 'mission_guaranteed_remotion_story',
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
      const sceneBrief = guaranteeSceneBrief;
      const persistContentUrl = nexusPersistableContentUrl(guaranteePhotoUrl, [guaranteePhotoUrl]);
      const saved = await nexusClient.saveArtifact(workspaceId, {
        title: headline || `${resolvedBrandName} — story`,
        contentUrl: persistContentUrl,
        content: JSON.stringify({
          kind: 'instagram_story',
          contentType: 'story',
          caption: caption.slice(0, 2200),
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
          caption: caption.slice(0, 2200),
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
      existingArtifactKeys.add(guaranteeDedupeKey);

      markSourceGalleryUsed(galleryUsage, batchUsedByType, guaranteeSourceUrl, postType);
      creatomateStoryCandidates.push({
        headline: headline || resolvedBrandName,
        caption,
        voiceoverCaption: caption,
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
  await runRemotionStoryPhase({
    workspaceId,
    missionId,
    bundleCards,
    creatomateStoryCandidates,
    remotionPostCandidates,
    brandTokensForRender,
    recentTemplateIds: gctx.recentTemplateIds,
    templateLibrary,
    brandBusinessType,
    brandCtx,
    resolvedBrandName,
    brandLocation,
    brandLogoUrl,
    syncPrimaryColor,
    syncAccentColor,
    motionProfile,
    routeBaseUrl,
    nexusClient,
    grafikerMaxRetries,
    brandTheme,
  });

  // ── Remotion feed post renders — agency SVG posters (Canva replacement) ───
  await runRemotionPostPhase({
    workspaceId,
    missionId,
    bundleCards,
    creatomateStoryCandidates,
    remotionPostCandidates,
    brandTokensForRender,
    recentTemplateIds: gctx.recentTemplateIds,
    templateLibrary,
    brandBusinessType,
    brandCtx,
    resolvedBrandName,
    brandLocation,
    brandLogoUrl,
    syncPrimaryColor,
    syncAccentColor,
    motionProfile,
    routeBaseUrl,
    nexusClient,
    grafikerMaxRetries,
    brandTheme,
  });

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

  releaseAllProductionLocks(workspaceId, missionId);

  const productionTelemetry = buildMissionProductionTelemetry({
    profileTier: productionProfile.tier,
    hubPackage: productionPackage,
    gisScore,
    feedDirectorReport,
    tenantLearning,
    run: {
      produced: saved,
      publish_ready: publishReady,
      rendering,
      withheld,
    },
    scheduleArtifactsWithLabel: countArtifactsWithScheduleLabel(
      results.filter((r) => r.metadata) as Array<{ metadata?: unknown }>,
    ),
    scheduleArtifactsTotal: saved,
  });

  return NextResponse.json(attachPipelineTrace({
    produced: saved,
    publishReady,
    rendering,
    withheld,
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
    results,
    artifacts: results,
  }, pipelineRun));
}
