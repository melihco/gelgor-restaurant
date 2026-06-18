import { resolveContentIntent, allowedCompositionsForDirector } from '@/lib/brand-motion-profile';
import {
  resolveBrandStoryProductionTemplate,
  resolveProductionTemplate,
  resolveStoryCompositionForBrandTemplate,
} from '@/lib/brand-template-library';
import { getRemotionTemplate } from '@/lib/remotion-template-catalog';
import { applyBrandTokensToRenderProps, resolveBrandProductionTokens } from '@/lib/brand-production-tokens';
import {
  normalizePhotoUrlForRemotionRender,
  toFeedPreviewUrl,
  probeMediaUrl,
} from '@/lib/media-url';
import { resolveSlotLogoForRender } from '@/lib/brand-logo-production';
import { persistRemotionVideoOutput } from '@/lib/remotion-video-persist';
import { GRAFIKER_PASS_THRESHOLD, GRAFIKER_HARD_FLOOR } from '@/lib/remotion-quality';
import { resolvePosterOverlayCopy, auditPosterOverlayCopy } from '@/lib/poster-copy';
import { renderRemotionBrandStill } from '@/lib/remotion-brand-kit';
import { resolveStoryAudioMood } from '@/lib/story-audio-mood';
import {
  buildStorySequenceMicrocopy,
  resolveStorySequenceRole,
  planStorySet,
  type StorySequenceRole,
  type StorySetPlan,
} from '@/lib/story-sequence-rules';
import { assessPremiumRubric } from '@/lib/premium-approval-rubric';
import {
  buildSafeOverlayRetryProps,
  callRemotionRenderApi,
  ensureRemotionPhotoUrl,
  persistStoryVideo,
} from '@/lib/remotion-bundle-render';
import {
  shouldShowLogo,
  resolveMotionLane,
  MOTION_LANE_SPECS,
} from '@/lib/sector-premium-presets';
import type { StoryCompositionId } from '@/remotion/types';
import type { ProductionSlotRole } from '@/lib/mission-production-manifest';
import type { RemotionLayoutFamily } from '@/lib/remotion-template-types';
import type { NexusClient } from './nexus-client';
import { buildInternalProductionHeaders } from '@/lib/tenant-production-guard';

// ─── Candidate types ──────────────────────────────────────────────────────────

export type StoryCandidate = {
  headline: string;
  caption: string;
  /** Feed caption — story TTS birincil kaynağı */
  voiceoverCaption?: string;
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
  storySequenceRole?: StorySequenceRole;
  /** Gallery match score (0–100). Used by the luxury photo quality gate. */
  galleryMatchScore?: number | null;
};

export type PostCandidate = {
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
};

// ─── Context interface ────────────────────────────────────────────────────────

export interface RemotionRenderPhaseContext {
  workspaceId: string;
  missionId?: string;
  bundleCards?: boolean;
  creatomateStoryCandidates: StoryCandidate[];
  remotionPostCandidates: PostCandidate[];
  brandTokensForRender: ReturnType<typeof resolveBrandProductionTokens> | null;
  recentTemplateIds: string[];
  templateLibrary: any;
  brandBusinessType: string;
  brandCtx: Record<string, unknown>;
  resolvedBrandName: string;
  brandLocation: string | undefined;
  brandLogoUrl: string | null | undefined;
  syncPrimaryColor: string | undefined;
  syncAccentColor: string | undefined;
  motionProfile: any;
  routeBaseUrl: string;
  nexusClient: NexusClient;
  grafikerMaxRetries: number;
  brandTheme: any;
}

// ─── Story phase ──────────────────────────────────────────────────────────────

export async function runRemotionStoryPhase(ctx: RemotionRenderPhaseContext): Promise<void> {
  const {
    creatomateStoryCandidates,
    brandTokensForRender,
    recentTemplateIds,
    templateLibrary,
    brandBusinessType,
    brandCtx,
    resolvedBrandName,
    brandLocation,
    brandLogoUrl,
    motionProfile,
    routeBaseUrl,
    nexusClient,
    grafikerMaxRetries,
    workspaceId,
  } = ctx;

  if (ctx.bundleCards === false || creatomateStoryCandidates.length === 0 || !brandTokensForRender) {
    return;
  }

  const brandTokens = brandTokensForRender;
  const { primaryColor, accentColor } = brandTokens;
  console.log(
    `[auto-produce] Brand tokens: fonts ${brandTokens.headingFont}/${brandTokens.bodyFont} ` +
    `colors ${primaryColor}/${accentColor} text ${brandTokens.textColor} [${brandTokens.sources.join(', ')}]`,
  );

  const usedCompositions: StoryCompositionId[] = [];
  const usedTemplateIds: string[] = [...recentTemplateIds];
  const usedLayoutFamilies: RemotionLayoutFamily[] = [];

  // Sprint 4 — Story Set Pre-Plan: assign roles, photo hints, and shared mood
  // BEFORE any renders fire so all cards follow a coherent visual arc.
  const storySetPlan: StorySetPlan = planStorySet(
    creatomateStoryCandidates.map((c) => ({ headline: c.headline, caption: c.caption })),
    { sector: brandBusinessType, brandLanguage: String((ctx.brandCtx as any)?.language ?? '') },
  );
  console.log(
    `[auto-produce] Story set plan: arc=${storySetPlan.narrativeArc} ` +
    `color=${storySetPlan.sharedColorGrade} cards=${storySetPlan.cards.length}`,
  );

  // Collect produced headlines for sibling similarity check in rubric.
  const producedHeadlines: string[] = [];

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
    // Use pre-planned role when available; fall back to index-based resolution.
    const storySequenceRole =
      candidate.storySequenceRole
      ?? storySetPlan.cards[ci]?.role
      ?? resolveStorySequenceRole(ci, creatomateStoryCandidates.length);

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
    const recentLayoutFamilies = usedLayoutFamilies.slice(-2);
    if (remotionTemplate?.family) {
      usedLayoutFamilies.push(remotionTemplate.family);
    }

    // Sprint 6 — Luxury Photo Quality Gate:
    // Full-bleed luxury families require a higher-quality gallery photo.
    // If the match score is below the luxury floor, the Creative Director is
    // instructed (via candidatePhotoQualityHint) to prefer overlay-safe families.
    const LUXURY_FAMILIES = new Set([
      'magazine_cover', 'cinematic_center', 'noir_editorial',
      'minimal_luxury', 'asymmetric_editorial', 'vibe_fullscreen',
    ]);
    const LUXURY_PHOTO_MIN_SCORE = 50;
    const candidateMatchScore = candidate.galleryMatchScore ?? null;
    const selectedFamily = remotionTemplate?.family ?? '';
    const isLuxuryFamily = LUXURY_FAMILIES.has(selectedFamily);
    const photoQualityBelowLuxuryFloor =
      isLuxuryFamily
      && candidateMatchScore != null
      && candidateMatchScore < LUXURY_PHOTO_MIN_SCORE;

    if (photoQualityBelowLuxuryFloor) {
      console.warn(
        `[auto-produce] Luxury photo gate: family=${selectedFamily} ` +
        `matchScore=${candidateMatchScore}/${LUXURY_PHOTO_MIN_SCORE} — ` +
        `CD will prefer overlay-safe family: "${candidate.headline.slice(0, 40)}"`,
      );
    }
    const { resolveSlotRenderTypography } = await import('@/lib/brand-template-slot-typography');
    const slotTypo = resolveSlotRenderTypography({
      slot: storyPick.slot,
      templateId,
      format: 'story',
      brandHeadingFont: brandTokens.headingFont,
      brandBodyFont: brandTokens.bodyFont,
      brandFontFamily: String(brandCtx.brand_font_family ?? brandCtx.brandFontFamily ?? '').trim() || undefined,
      sector: brandBusinessType,
    });
    const storyRenderProps = applyBrandTokensToRenderProps({
      templateId,
      kitId: production.kitId,
      librarySlotKey: production.slot.key,
      photoUrl: normalizePhotoUrlForRemotionRender(candidate.photoUrl),
      galleryPhotoUrls: galleryPhotoUrls && galleryPhotoUrls.length > 1
        ? galleryPhotoUrls.slice(1)
        : undefined,
      galleryLayout: candidate.galleryLayout,
      headline: candidate.headline,
      subtitle: '',
      categoryLabel: '',
      brandName: resolvedBrandName,
      location: brandLocation || '',
      // Logo restraint: suppress logo on hook cards for luxury sectors
      logoUrl: shouldShowLogo(brandBusinessType, storySequenceRole, Boolean(brandLogoUrl))
        ? resolveSlotLogoForRender(brandLogoUrl, storyPick.slot)
        : undefined,
      contentIntent: intent,
      sector: brandBusinessType,
      sceneBrief: candidate.sceneBriefBlock || undefined,
      preferredLayoutFamily: candidate.preferredLayoutFamily,
    }, brandTokens, {
      headingFont: slotTypo.headingFont,
      bodyFont: slotTypo.bodyFont,
      fontPersonality: slotTypo.fontPersonality,
      honorTemplateTypography: slotTypo.honorTemplateTypography,
    });

    const eventDate     = eventDet.date       || eventDet.event_date  || (candidate as any).event_date  || '';
    const eventTime     = eventDet.time       || eventDet.event_time  || (candidate as any).event_time  || '';
    const ctaText       = eventDet.cta_text   || (candidate as any).cta || '';
    const ctaUrl        = eventDet.cta_url    || (candidate as any).ctaUrl || '';
    const eventSubtitle = eventDet.tagline || (candidate as { subtitle?: string }).subtitle || '';
    const categoryLabel = eventDet.category_label || (candidate as any).categoryLabel || '';
    const audioMood = resolveStoryAudioMood({
      explicit: eventDet.audio_mood || (candidate as any).audioMood || '',
      selected: motionProfile.storyAudioMood,
      pool: motionProfile.audioMoodPool,
      slotIndex: typeof candidate.ideaIndex === 'number' ? candidate.ideaIndex : ci,
      sector: brandBusinessType,
    });
    const artistName    = eventDet.artist_name || '';

    const storyCaptionSource = String(
      candidate.voiceoverCaption || candidate.caption || '',
    ).trim();
    const sequenceCopy = buildStorySequenceMicrocopy({
      headline: candidate.headline,
      caption: storyCaptionSource,
      ctaText,
      eventSubtitle,
      artistName,
      role: storySequenceRole,
      isEventStory: compositionId === 'EventAnnouncementStory',
      sector: brandBusinessType,
      brandLanguage: motionProfile.locale,
    });

    // Resolve motion lane for this sector + role combination
    const motionLane = resolveMotionLane(brandBusinessType, storySequenceRole);
    const motionLaneSpec = MOTION_LANE_SPECS[motionLane];

    const storyProps = {
      ...storyRenderProps,
      subtitle: sequenceCopy.subtitle,
      caption: storyCaptionSource,
      voiceoverScript: sequenceCopy.voiceoverScript,
      categoryLabel: categoryLabel || sequenceCopy.categoryLabel,
      eventDate,
      eventTime,
      cta: ctaText,
      ctaUrl: ctaUrl || undefined,
      audioMood,
      storyAudioMode: motionProfile.storyAudioMode,
      storyVoiceId: motionProfile.storyVoiceId,
      locale: motionProfile.locale,
      storySequenceRole,
      storySequenceIndex: ci + 1,
      storySequenceTotal: creatomateStoryCandidates.length,
      recentLayoutFamilies,
      sector: brandBusinessType,
      motionLane,
      kenBurnsIntensity: motionLaneSpec.kenBurnsIntensity,
      // Sprint 6 — Luxury photo quality gate: signal CD to prefer overlay-safe family.
      preferSafeOverlay: photoQualityBelowLuxuryFloor || undefined,
    };

    void (async () => {
      const baseRenderBody = {
        compositionId,
        brandTemplateLocked: storyPick.libraryLocked || templateLibrary.locked,
        motionStyle: motionProfile.motionStyle,
        locale: motionProfile.locale,
        allowedCompositions: allowedCompositionsForDirector(motionProfile),
        uploadToR2: Boolean(process.env.R2_BUCKET_NAME),
        requirePersistent: true,
        workspaceId: ctx.workspaceId,
        grafikerMaxRetries: ctx.grafikerMaxRetries,
      };

      let data = await callRemotionRenderApi(ctx.routeBaseUrl, {
        ...baseRenderBody,
        useCreativeDirector: true,
        props: storyProps,
      });

      if (!data.ok) {
        console.warn(
          `[auto-produce] Remotion story pass-1 failed (${data.error}) — safe-overlay retry: "${candidate.headline.slice(0, 40)}"`,
        );
        data = await callRemotionRenderApi(ctx.routeBaseUrl, {
          ...baseRenderBody,
          useCreativeDirector: false,
          props: buildSafeOverlayRetryProps(storyProps as Record<string, unknown>),
        });
      }

      if (!data.ok) {
        console.warn('[auto-produce] Remotion story pass-2 failed:', data.error);
        await ctx.nexusClient.markBundleFailed({
          workspaceId: ctx.workspaceId,
          artifactId: candidate.artifactId,
          error: data.error || `Render HTTP ${data.status}`,
          posterUrl: candidate.photoUrl,
          contentType: 'instagram_story',
          pipeline: 'remotion_story',
          slotRole: candidate.slotRole,
          attachGalleryStill: true,
          toFeedPreviewUrl,
          probeMediaUrl,
        });
        return;
      }

      const persistedVideoUrl = await persistStoryVideo(ctx.workspaceId, data, compositionId);

      if (!persistedVideoUrl) {
        console.warn('[auto-produce] Remotion: no output URL');
        await ctx.nexusClient.markBundleFailed({
          workspaceId: ctx.workspaceId,
          artifactId: candidate.artifactId,
          error: 'No video output from Remotion',
          posterUrl: candidate.photoUrl,
          contentType: 'instagram_story',
          pipeline: 'remotion_story',
          slotRole: candidate.slotRole,
          attachGalleryStill: true,
          toFeedPreviewUrl,
          probeMediaUrl,
        });
        return;
      }

      const finalCompositionId = data.compositionId ?? compositionId;
      const finalTemplateId = data.templateId ?? templateId;
      const grafikerScore = data.grafikerScore ?? null;
      const grafikerPass = data.grafikerPass !== false
        && (grafikerScore == null || grafikerScore >= GRAFIKER_PASS_THRESHOLD);

      const cdLayoutFamily = String((data as { creativeDirector?: Record<string, unknown> }).creativeDirector?.layoutFamily ?? '');
      const cdDesignScore = Number((data as { creativeDirector?: Record<string, unknown> }).creativeDirector?.designScore ?? 0);
      const cdVariant = (data as { creativeDirector?: Record<string, unknown> }).creativeDirector?.variantIndex ?? '-';

      const layoutIsRepeated = cdLayoutFamily
        ? recentLayoutFamilies.includes(cdLayoutFamily as RemotionLayoutFamily)
        : false;
      const layoutOriginalityScore = layoutIsRepeated ? 50 : 100;

      console.log(
        `[auto-produce] Remotion story: ${finalCompositionId} | slot=${production.slot.key} | ` +
        `role=${storySequenceRole} | template=${finalTemplateId} | ` +
        `cd=${cdLayoutFamily || 'n/a'}[${cdVariant}] design=${cdDesignScore}/10 | ` +
        `grafiker=${grafikerScore}/10 pass=${grafikerPass} | ` +
        `originality=${layoutOriginalityScore} repeated=${layoutIsRepeated} | ` +
        `"${candidate.headline.slice(0, 40)}"`,
      );

      if (cdLayoutFamily) usedLayoutFamilies.push(cdLayoutFamily as RemotionLayoutFamily);

      const existingArtifactId = candidate.artifactId;
      const videoUrl = persistedVideoUrl;
      if (!existingArtifactId) {
        console.warn('[auto-produce] Remotion: missing artifactId — bundle not updated');
        return;
      }

      const renderBytes = data.bytes ?? 0;
      if (renderBytes <= 0 && !(await probeMediaUrl(videoUrl))) {
        console.warn('[auto-produce] Remotion video URL not reachable, skip attach:', videoUrl.slice(0, 80));
        await ctx.nexusClient.markBundleFailed({
          workspaceId: ctx.workspaceId,
          artifactId: existingArtifactId,
          error: 'Rendered video URL not reachable',
          posterUrl: candidate.photoUrl,
          contentType: 'instagram_story',
          pipeline: 'remotion_story',
          slotRole: candidate.slotRole,
          attachGalleryStill: true,
          toFeedPreviewUrl,
          probeMediaUrl,
        });
        return;
      }

      if (grafikerScore != null && grafikerScore < GRAFIKER_HARD_FLOOR) {
        console.warn(
          `[auto-produce] Story Grafiker HARD FLOOR: ${grafikerScore}/10 — gallery still: "${candidate.headline.slice(0, 40)}"`,
        );
        await ctx.nexusClient.markBundleFailed({
          workspaceId: ctx.workspaceId,
          artifactId: existingArtifactId,
          error: `Grafiker hard floor ${grafikerScore}/10 — render discarded`,
          posterUrl: candidate.photoUrl,
          contentType: 'instagram_story',
          pipeline: 'remotion_story',
          slotRole: candidate.slotRole,
          attachGalleryStill: true,
          toFeedPreviewUrl,
          probeMediaUrl,
        });
        return;
      }

      if (grafikerScore != null && !grafikerPass) {
        console.warn(
          `[auto-produce] Story Grafiker ${grafikerScore}/10 — attaching video: "${candidate.headline.slice(0, 40)}"`,
        );
      }

      const rubric = assessPremiumRubric({
        headline: candidate.headline,
        caption: candidate.caption,
        sequenceRole: storySequenceRole,
        siblingHeadlines: producedHeadlines.slice(),
        brandName: ctx.resolvedBrandName,
        sector: brandBusinessType,
      });
      producedHeadlines.push(candidate.headline);

      const patchResult = await ctx.nexusClient.attachVideo({
        workspaceId: ctx.workspaceId,
        artifactId: existingArtifactId,
        videoUrl,
        posterUrl: candidate.photoUrl,
        compositionId: finalCompositionId,
        grafikerScore,
        grafikerPass,
        renderMs: data.durationMs,
        extraMeta: {
          rubric_score: rubric.score,
          rubric_pass: rubric.pass,
          rubric_caution: rubric.caution,
          rubric_tags: rubric.tags.join(',') || null,
          story_set_arc: storySetPlan.narrativeArc,
          story_set_color: storySetPlan.sharedColorGrade,
        },
      });

      if (patchResult.ok) {
        console.log(
          `[auto-produce] ProductionBundle ready: ${existingArtifactId} | ` +
          `${finalCompositionId} | grafiker=${grafikerScore}/10 | rubric=${rubric.score}/100`,
        );
      } else {
        console.warn(`[auto-produce] attach-video failed: ${patchResult.error}`);
      }
    })().catch(async (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[auto-produce] Remotion story error: ${msg.slice(0, 80)}`);
      await ctx.nexusClient.markBundleFailed({
        workspaceId: ctx.workspaceId,
        artifactId: candidate.artifactId,
        error: msg.slice(0, 200),
        posterUrl: candidate.photoUrl,
        contentType: 'instagram_story',
        pipeline: 'remotion_story',
        slotRole: candidate.slotRole,
        attachGalleryStill: true,
        toFeedPreviewUrl,
        probeMediaUrl,
      });
    });

    console.log(`[auto-produce] Remotion ${compositionId} (${templateId}) triggered: "${candidate.headline.slice(0,40)}"`);
  }
}

// ─── Post phase ───────────────────────────────────────────────────────────────

export async function runRemotionPostPhase(ctx: RemotionRenderPhaseContext): Promise<void> {
  const {
    remotionPostCandidates,
    brandTokensForRender,
    recentTemplateIds,
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
    workspaceId,
    brandTheme,
  } = ctx;

  if (ctx.bundleCards === false || remotionPostCandidates.length === 0 || !brandTokensForRender) {
    return;
  }

  const brandTokens = brandTokensForRender;
  const { primaryColor, accentColor } = brandTokens;
  const usedPosterTemplateIds: string[] = [...recentTemplateIds];

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
      ideationHeadline: candidate.headline,
      subtitle: candidate.caption,
      caption: candidate.caption,
      brandName: resolvedBrandName,
      location: brandLocation,
      eventDate,
      eventTime,
      cta: ctaText,
      sector: brandBusinessType,
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

    const { resolveSlotRenderTypography: resolvePosterSlotTypo } = await import('@/lib/brand-template-slot-typography');
    const posterSlotTypo = resolvePosterSlotTypo({
      slot: production.slot,
      templateId: posterTemplateId,
      format: 'post',
      brandHeadingFont: brandTokens.headingFont,
      brandBodyFont: brandTokens.bodyFont,
      brandFontFamily: String(brandCtx.brand_font_family ?? brandCtx.brandFontFamily ?? '').trim() || undefined,
      sector: brandBusinessType,
    });
    const posterProps = applyBrandTokensToRenderProps({
      templateId: posterTemplateId,
      posterTemplateId,
      kitId: production.kitId,
      librarySlotKey: production.slot.key,
      photoUrl: ensureRemotionPhotoUrl(candidate.photoUrl),
      headline: posterCopy.headline,
      subtitle: posterCopy.subtitle,
      brandName: resolvedBrandName,
      location: posterCopy.venueArea ?? '',
      eventDate,
      eventTime,
      cta: posterCopy.cta || ctaText,
      logoUrl: resolveSlotLogoForRender(brandLogoUrl, production.slot),
      sector: brandBusinessType,
      businessType: brandBusinessType,
    }, brandTokens, {
      headingFont: posterSlotTypo.headingFont,
      bodyFont: posterSlotTypo.bodyFont,
      fontPersonality: posterSlotTypo.fontPersonality,
      honorTemplateTypography: posterSlotTypo.honorTemplateTypography,
    });

    fetch(`${ctx.routeBaseUrl}/api/remotion/render`, {
      method: 'POST',
      headers: buildInternalProductionHeaders(ctx.workspaceId),
      body: JSON.stringify({
        compositionId,
        useCreativeDirector: true,
        brandTemplateLocked: templateLibrary.locked,
        motionStyle: motionProfile.motionStyle,
        locale: motionProfile.locale,
        allowedCompositions: allowedCompositionsForDirector(motionProfile),
        uploadToR2: Boolean(process.env.R2_BUCKET_NAME),
        workspaceId: ctx.workspaceId,
        grafikerMaxRetries: ctx.grafikerMaxRetries,
        props: posterProps,
      }),
      signal: AbortSignal.timeout(120_000),
    }).then(async (res) => {
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.warn('[auto-produce] Remotion post failed:', res.status, errText.slice(0, 120));
        await ctx.nexusClient.markBundleFailed({
          workspaceId: ctx.workspaceId,
          artifactId: candidate.artifactId,
          error: `Poster render HTTP ${res.status}`,
          posterUrl: candidate.photoUrl,
          contentType: 'instagram_post',
          pipeline: 'remotion_poster',
          slotRole: 'designed_post',
          attachGalleryStill: false,
          toFeedPreviewUrl,
          probeMediaUrl,
        });
        return;
      }
      const data = await res.json() as {
        imageUrl?: string;
        durationMs?: number;
        announcementTemplateId?: string;
        grafikerScore?: number | null;
        grafikerPass?: boolean;
      };
      const postGrafikerScore = data.grafikerScore ?? null;
      const postGrafikerPass = data.grafikerPass !== false
        && (postGrafikerScore == null || postGrafikerScore >= GRAFIKER_PASS_THRESHOLD);
      if (postGrafikerScore != null && !postGrafikerPass) {
        console.warn(
          `[auto-produce] Async post Grafiker ${postGrafikerScore}/10 — withheld: "${candidate.headline.slice(0, 40)}"`,
        );
        await ctx.nexusClient.markBundleFailed({
          workspaceId: ctx.workspaceId,
          artifactId: candidate.artifactId,
          error: `Grafiker ${postGrafikerScore}/10 — kalite eşiği altı (min ${GRAFIKER_PASS_THRESHOLD})`,
          posterUrl: candidate.photoUrl,
          contentType: 'instagram_post',
          pipeline: 'remotion_poster',
          slotRole: 'designed_post',
          attachGalleryStill: false,
          toFeedPreviewUrl,
          probeMediaUrl,
        });
        return;
      }
      const imageUrl = data.imageUrl || null;
      let posterOut = imageUrl;
      if (!posterOut && candidate.artifactId) {
        posterOut = await renderRemotionBrandStill({
          workspaceId: ctx.workspaceId,
          photoUrl: candidate.photoUrl,
          headline: candidate.headline,
          caption: candidate.caption,
          brandName: resolvedBrandName,
          location: brandLocation,
          sector: brandBusinessType,
          contentType: 'post',
          baseUrl: ctx.routeBaseUrl,
          logoUrl: brandLogoUrl ?? undefined,
          primaryColor: syncPrimaryColor,
          accentColor: syncAccentColor,
        });
        if (posterOut) {
          console.log(`[auto-produce] Poster async fallback (sync still): "${candidate.headline.slice(0, 40)}"`);
        }
      }
      if (!posterOut || !candidate.artifactId) {
        await ctx.nexusClient.markBundleFailed({
          workspaceId: ctx.workspaceId,
          artifactId: candidate.artifactId,
          error: 'No poster output from Remotion',
          posterUrl: candidate.photoUrl,
          contentType: 'instagram_post',
          pipeline: 'remotion_poster',
          slotRole: 'designed_post',
          attachGalleryStill: false,
          toFeedPreviewUrl,
          probeMediaUrl,
        });
        return;
      }

      const patchResult = await ctx.nexusClient.attachPoster({
        workspaceId: ctx.workspaceId,
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
        await ctx.nexusClient.markBundleFailed({
          workspaceId: ctx.workspaceId,
          artifactId: candidate.artifactId,
          error: patchResult.error ?? 'attach_poster_failed',
          posterUrl: candidate.photoUrl,
          contentType: 'instagram_post',
          pipeline: 'remotion_poster',
          slotRole: 'designed_post',
          attachGalleryStill: false,
          toFeedPreviewUrl,
          probeMediaUrl,
        });
      }
    }).catch(async (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[auto-produce] Remotion post error: ${msg.slice(0, 80)}`);
      await ctx.nexusClient.markBundleFailed({
        workspaceId: ctx.workspaceId,
        artifactId: candidate.artifactId,
        error: msg.slice(0, 200),
        posterUrl: candidate.photoUrl,
        contentType: 'instagram_post',
        pipeline: 'remotion_poster',
        slotRole: 'designed_post',
        attachGalleryStill: false,
        toFeedPreviewUrl,
        probeMediaUrl,
      });
    });

    console.log(`[auto-produce] Remotion post ${posterTemplateId} triggered: "${candidate.headline.slice(0, 40)}"`);
  }
}
