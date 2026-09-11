/**
 * Gallery-first mission production — pick analyzed gallery photo per slot.
 * Ideation caption stays for tone/CTA. Product *variants* (erken hasat vs
 * sızma) are grounded to the pinned still so we do not invent a SKU attribute
 * the photo cannot prove. Full caption rewrite from vision is still forbidden
 * — that caused kitchen overlays on DJ posts.
 */
import {
  MIN_ACCEPT_SCORE,
  RELAXED_MATCH_SCORE,
  buildGalleryLookup,
  isHardGalleryThemeMismatch,
  pickMissionDiverseFallbackPhoto,
  rankPhotosForContent,
  rankPhotosForContentSeeded,
  resolveGalleryMatchSubjectKey,
  type GalleryPhotoMeta,
  type MatchPhotoInput,
  type PhotoMatchResult,
} from '@/lib/gallery-photo-matcher';
import {
  buildCatalogAwareGalleryMatchFields,
  filterGalleryUrlsByPreferredAssetTypes,
  isStrongIdeationCaption,
  photoMatchesPreferredAssetTypes,
  resolveCatalogSlotGalleryHints,
} from '@/lib/catalog-slot-gallery';
import { kindToPostType, normalizeGalleryUrl, type PostTypeBucket } from '@/lib/gallery-usage-tracker';
import { isUsableGalleryPhotoUrl } from '@/lib/media-url';
import { buildInstagramCaptionFromGalleryMeta } from '@/lib/feed-display-caption';
import {
  captionRequiresStrictGalleryMatch,
  scoreIdeationPhotoMatch,
} from '@/lib/caption-photo-alignment';
import { generateGalleryCaptionsWithGpt } from '@/lib/gallery-caption-generator';
import { groundPublishCopyToVisual } from '@/lib/photo-claim-grounding';
import {
  lookFeedSlotPack,
  lookJobKind,
  shouldLookFeedSlotPack,
  slotJobFromCatalogKey,
  type FeedSlotLookInput,
  type FeedSlotLookIssue,
  type FeedSlotLookResult,
  type LookJobKind,
} from '@/lib/feed-slot-look';
import { groundFeedSlotCopy, parseFeedSlotPack, type FeedSlotPack } from '@/lib/feed-slot-pack';
import { keepWeeklySceneCopy } from '@/lib/caption-scene-fit';
import { assignmentUsesGalleryPhoto } from '@/lib/auto-produce/gallery-orchestrator';
import type { ProductionAssignment, ProductionSlotRole } from '@/lib/mission-production-manifest';
import { isVisionAnalysisDescription, isGalleryTagHeadline } from '@/lib/vision-text-guard';
import { sanitizeProductionHeadline } from '@/lib/production-headline-quality';
import {
  isInternalStrategyBriefing,
  isMeaningfulFalOverlayText,
} from '@/lib/fal-caption-headline';
import { resolveSlotSampleCopy } from '@/lib/slot-sample-copy';

export type GalleryFirstCaptionSource =
  | 'ideation_aligned'
  | 'photo_grounded'
  | 'gallery_meta'
  | 'gallery_gpt'
  | 'slot_look';

export interface GalleryFirstSlotResult {
  photoUrl: string | null;
  caption: string;
  headline: string;
  hashtags: string[];
  matchScore: number | null;
  source: GalleryFirstCaptionSource;
  applied: boolean;
  grounded?: boolean;
  pack?: FeedSlotPack;
  lookIssues?: FeedSlotLookIssue[];
}

type SlotFormat = 'post' | 'story' | 'reel' | 'carousel';

const SLOT_FORMAT: Partial<Record<ProductionSlotRole, SlotFormat>> = {
  organic_post: 'post',
  designed_post: 'post',
  designed_typography: 'post',
  fal_designed_post: 'post',
  fal_only_post: 'post',
  organic_carousel: 'carousel',
  organic_story_still: 'story',
  campaign_story_motion: 'story',
  organic_reel: 'reel',
  campaign_reel_motion: 'reel',
  paid_ad_creative: 'post',
  paid_ad_google_creative: 'post',
  premium_editorial_campaign_post: 'post',
  premium_editorial_campaign_story: 'story',
};

export function slotFormatFromAssignment(assignment: ProductionAssignment): SlotFormat {
  const role = assignment.slot_role;
  if (role && SLOT_FORMAT[role]) return SLOT_FORMAT[role]!;
  const pipeline = String(assignment.pipeline ?? '');
  if (pipeline.includes('reel')) return 'reel';
  if (pipeline.includes('story')) return 'story';
  if (pipeline.includes('carousel')) return 'carousel';
  return 'post';
}

function storySequenceRole(storyIndex: number): MatchPhotoInput['storySequenceRole'] {
  if (storyIndex <= 0) return 'hook';
  if (storyIndex === 1) return 'proof';
  return 'cta';
}

/** Maps a production slot to the gallery dedupe bucket (feed/story/reel/carousel). */
export function assignmentPostType(assignment: ProductionAssignment): PostTypeBucket {
  return kindToPostType(formatToContentType(slotFormatFromAssignment(assignment)));
}

function formatToContentType(format: SlotFormat): string {
  if (format === 'reel') return 'instagram_reel';
  if (format === 'story') return 'instagram_story';
  if (format === 'carousel') return 'instagram_carousel';
  return 'instagram_post';
}

function slotLabelTr(assignment: ProductionAssignment): string {
  const map: Partial<Record<ProductionSlotRole, string>> = {
    organic_post: 'organik feed postu',
    designed_post: 'tasarım postu',
    organic_carousel: 'carousel',
    organic_story_still: 'story (galeri)',
    campaign_story_motion: 'kampanya story',
    organic_reel: 'reel',
    campaign_reel_motion: 'kampanya reel',
  };
  return map[assignment.slot_role] ?? assignment.slot_role;
}

/** All mission organic/remotion/reel slots — excludes paid ad derivatives only. */
export function assignmentSupportsGalleryFirst(
  assignment: { pipeline?: string; slot_role?: string },
): boolean {
  const role = String(assignment.slot_role ?? '');
  if (role === 'paid_ad_creative' || role === 'paid_ad_google_creative') return false;
  const pipeline = String(assignment.pipeline ?? '');
  if (pipeline === 'meta_ad' || pipeline === 'google_ad') return false;
  if (pipeline.startsWith('fal_only_') || role.startsWith('fal_only_')) return false;
  return true;
}

export function shouldUseGalleryFirstMission(input: {
  missionId?: string;
  hasGallery: boolean;
  hasRealBrandPhotos: boolean;
  slotBackfillPass?: boolean;
  assignment: ProductionAssignment;
}): boolean {
  if (!input.missionId || !input.hasGallery || !input.hasRealBrandPhotos) return false;
  if (!assignmentSupportsGalleryFirst(input.assignment)) return false;
  return true;
}

export function buildSlotGalleryMatchInput(input: {
  assignment: ProductionAssignment;
  storyIndex?: number;
  brandName: string;
  brandDescription?: string;
  businessType?: string;
  /** Sector id when distinct from businessType — catalog slot resolution. */
  sectorId?: string;
  catalogSlotKey?: string;
  visualSubjectHint?: string;
  creativeBrief?: string;
  ideationCaption?: string;
  ideationHeadline?: string;
  subjectKey?: string;
  mood?: string;
  visualDirection?: string;
  strategicPurpose?: string;
  language?: string;
}): MatchPhotoInput {
  const format = slotFormatFromAssignment(input.assignment);
  const hint = String(input.visualSubjectHint ?? '').trim();
  const headline = String(input.ideationHeadline ?? '').trim();
  const caption = String(input.ideationCaption ?? '').trim();
  const brief = String(input.creativeBrief ?? '').trim().slice(0, 160);
  const brandLine = `${input.brandName} ${input.brandDescription ?? ''}`.trim();
  const mood = String(input.mood ?? '').trim();
  const visualDirection = String(input.visualDirection ?? '').trim() || undefined;
  const strategicPurpose = String(input.strategicPurpose ?? '').trim() || undefined;

  const catalogSlotKey = String(
    input.catalogSlotKey
      ?? input.assignment.catalog_slot_key
      ?? '',
  ).trim();
  const sectorId = String(input.sectorId ?? input.businessType ?? '').trim();
  const catalogHints = resolveCatalogSlotGalleryHints({
    sectorId,
    catalogSlotKey,
  });

  const baseCaption = caption
    || [hint, brief, brandLine].filter(Boolean).join(' — ')
    || '';
  const captionIsStrong = isStrongIdeationCaption(caption);

  // When ideation headline is briefing/meaningless, seed from catalog sample
  // punchline (same short phrases the template library uses).
  const headlineWeak = !headline
    || !isMeaningfulFalOverlayText(headline)
    || isInternalStrategyBriefing(headline);
  const slotSample = headlineWeak && catalogSlotKey
    ? resolveSlotSampleCopy({
      catalogSlotKey,
      templateType: catalogHints?.templateType,
      sector: sectorId,
      showSubline: false,
      language: input.language,
    }).headline
    : '';

  // Strong publish caption → ideation headline wins (hint must not override).
  // Thin caption / weak headline → catalog sample may fill the gap (library parity).
  const seededHeadline = headlineWeak
    ? (slotSample || catalogHints?.sampleHeadline || headline)
    : headline;
  const syntheticHeadline = captionIsStrong
    ? (seededHeadline || hint || catalogHints?.sampleHeadline || brief || input.brandName)
    : (hint || seededHeadline || catalogHints?.sampleHeadline || brief || input.brandName);

  const catalogAware = buildCatalogAwareGalleryMatchFields({
    caption: baseCaption,
    headline: syntheticHeadline,
    catalogSlotKey,
    sectorId,
    seedHeadlineFromCatalog: headlineWeak,
  });

  // Resolve subject from ideation/brief only — catalog tokens like "teaser"
  // must not poison subject_key (e.g. teaser → tea).
  const subjectKey = resolveGalleryMatchSubjectKey({
    caption: baseCaption || catalogHints?.sampleHeadline || input.brandName,
    headline: syntheticHeadline,
    subjectKey: String(input.subjectKey ?? '').trim() || undefined,
  });

  return {
    caption: catalogAware.caption || baseCaption || input.brandName,
    headline: catalogAware.headline || syntheticHeadline,
    mood,
    contentType: formatToContentType(format),
    businessType: input.businessType,
    storySequenceRole: format === 'story'
      ? storySequenceRole(input.storyIndex ?? 0)
      : undefined,
    ...(visualDirection ? { visualDirection } : {}),
    ...(strategicPurpose ? { strategicPurpose } : {}),
    ...(subjectKey ? { subjectKey } : {}),
    ...(catalogAware.templateUseCase
      ? { templateUseCase: catalogAware.templateUseCase }
      : {}),
    ...(catalogAware.preferredAssetTypes?.length
      ? { preferredAssetTypes: catalogAware.preferredAssetTypes }
      : {}),
  };
}

export function pickGalleryPhotoForSlot(input: {
  assignment: ProductionAssignment;
  storyIndex?: number;
  galleryPhotos: string[];
  galleryMeta: Record<string, GalleryPhotoMeta>;
  excludeUrls: string[];
  brandName: string;
  brandDescription?: string;
  businessType?: string;
  sectorId?: string;
  catalogSlotKey?: string;
  visualSubjectHint?: string;
  creativeBrief?: string;
  ideationCaption?: string;
  ideationHeadline?: string;
  subjectKey?: string;
  slotBackfillPass?: boolean;
  tieBreakSeed?: number;
}): PhotoMatchResult | null {
  const matchInput = buildSlotGalleryMatchInput(input);
  const usedBases = new Set(input.excludeUrls.map(normalizeGalleryUrl));
  const minScore = input.slotBackfillPass ? RELAXED_MATCH_SCORE : MIN_ACCEPT_SCORE;
  const lookup = buildGalleryLookup(input.galleryMeta, input.galleryPhotos);

  // Thin captions: hard-prefer catalog asset types (library parity).
  // Strong publish captions: full gallery + soft preferredAssetTypes score only —
  // never let slot archetype override caption semantics (burger vs DJ).
  const captionIsStrong = isStrongIdeationCaption(input.ideationCaption);
  const preferredPool = !captionIsStrong && matchInput.preferredAssetTypes?.length
    ? filterGalleryUrlsByPreferredAssetTypes(
      input.galleryPhotos,
      input.galleryMeta,
      matchInput.preferredAssetTypes,
    )
    : [];
  const pools = preferredPool.length > 0
    ? [preferredPool, input.galleryPhotos]
    : [input.galleryPhotos];

  for (const pool of pools) {
    const ranked = input.tieBreakSeed != null
      ? rankPhotosForContentSeeded(
        matchInput,
        pool,
        lookup,
        input.tieBreakSeed,
        usedBases,
        input.galleryMeta,
      )
      : rankPhotosForContent(
        matchInput,
        pool,
        lookup,
        usedBases,
        input.galleryMeta,
      );

    const best = ranked[0];
    if (best && best.score >= minScore) return best;
  }

  // Never accept sub-threshold scores on the normal pass — that shipped DJ+food pairs.
  // Backfill may still use RELAXED_MATCH_SCORE via minScore above.
  const strictTheme = captionRequiresStrictGalleryMatch(
    matchInput.caption ?? '',
    matchInput.headline ?? '',
  );
  if (!strictTheme) {
    const diverse = pickMissionDiverseFallbackPhoto(
      input.galleryPhotos,
      usedBases,
      input.galleryMeta,
      input.excludeUrls,
      matchInput,
    );
    if (diverse) return diverse;
  }

  return null;
}

function normalizeHashtagsLocal(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((h) => String(h).trim())
    .filter(Boolean)
    .map((h) => (h.startsWith('#') ? h : `#${h.replace(/^#+/, '')}`))
    .slice(0, 12);
}

function captionNeedsGpt(caption: string): boolean {
  const t = caption.trim();
  if (t.length < 36) return true;
  if (isVisionAnalysisDescription(t)) return true;
  return false;
}

const LOOK_CANDIDATE_LIMIT = 4;
/** Drop look tails that lose the caption winner by more than this. */
const CAPTION_LOOK_SCORE_GAP = 8;

/** Place / process jobs — products cannot prove the slot. */
const PLACE_PROCESS_LOOK_TYPES = [
  'venue_reference',
  'event_photo',
  'team_photo',
  'hero_image',
  'brand_background',
] as const;

function isFallbackGalleryMeta(meta?: GalleryPhotoMeta | null): boolean {
  if (!meta) return true;
  return /metadata fallback analysis/i.test(String(meta.description ?? ''));
}

function photoCanProveLookJob(
  meta: GalleryPhotoMeta | undefined,
  jobKind: LookJobKind,
): boolean {
  if (jobKind !== 'place' && jobKind !== 'process') return true;
  if (isFallbackGalleryMeta(meta)) return true;
  const types = jobKind === 'process'
    ? [...PLACE_PROCESS_LOOK_TYPES, 'food_drink_photo']
    : [...PLACE_PROCESS_LOOK_TYPES];
  return photoMatchesPreferredAssetTypes(meta?.suggestedAssetType, types);
}

function lookJobKindFromAssignment(assignment: ProductionAssignment): LookJobKind {
  return lookJobKind({
    slotJob: String(assignment.catalog_slot_label ?? '').trim()
      || slotJobFromCatalogKey(assignment.catalog_slot_key)
      || slotLabelTr(assignment),
    catalogSlotKey: String(assignment.catalog_slot_key ?? '').trim(),
  });
}

function trimLookShortlistToCaptionFit(
  picked: Array<{ url: string; score: number }>,
): Array<{ url: string; score: number }> {
  if (picked.length <= 1) return picked.slice(0, LOOK_CANDIDATE_LIMIT);
  const best = picked[0]!.score;
  if (best <= 0) return picked.slice(0, LOOK_CANDIDATE_LIMIT);
  return picked
    .filter((row) => best - row.score <= CAPTION_LOOK_SCORE_GAP)
    .slice(0, LOOK_CANDIDATE_LIMIT);
}

function emptySlotLookResult(issues: FeedSlotLookIssue[]): GalleryFirstSlotResult {
  return {
    photoUrl: null,
    caption: '',
    headline: '',
    hashtags: [],
    matchScore: null,
    source: 'slot_look',
    applied: false,
    lookIssues: issues,
  };
}

function collectFeedSlotLookUrls(input: {
  assignment: ProductionAssignment;
  storyIndex?: number;
  galleryPhotos: string[];
  galleryMeta: Record<string, GalleryPhotoMeta>;
  excludeUrls: string[];
  brandName: string;
  brandDescription?: string;
  businessType?: string;
  sectorId?: string;
  catalogSlotKey?: string;
  visualSubjectHint?: string;
  creativeBrief?: string;
  ideationCaption?: string;
  ideationHeadline?: string;
  subjectKey?: string;
  slotBackfillPass?: boolean;
  tieBreakSeed?: number;
  /** Ignored for look: caption rank owns the shortlist. */
  forcedPhotoUrl?: string | null;
  matchInput: MatchPhotoInput;
}): Array<{ url: string; score: number }> {
  const usedBases = new Set(input.excludeUrls.map(normalizeGalleryUrl));
  const lookup = buildGalleryLookup(input.galleryMeta, input.galleryPhotos);
  const jobKind = lookJobKindFromAssignment(input.assignment);
  const jobKindPool = (jobKind === 'place' || jobKind === 'process')
    ? input.galleryPhotos.filter((url) => {
      const meta = input.galleryMeta[normalizeGalleryUrl(url)]
        ?? input.galleryMeta[url]
        ?? Object.entries(input.galleryMeta).find(
          ([k]) => normalizeGalleryUrl(k) === normalizeGalleryUrl(url),
        )?.[1];
      return photoCanProveLookJob(meta, jobKind);
    })
    : [];
  const captionIsStrong = isStrongIdeationCaption(input.ideationCaption);
  const preferredPool = !captionIsStrong && input.matchInput.preferredAssetTypes?.length
    ? filterGalleryUrlsByPreferredAssetTypes(
      input.galleryPhotos,
      input.galleryMeta,
      input.matchInput.preferredAssetTypes,
    )
    : [];
  const pool = jobKindPool.length > 0
    ? jobKindPool
    : preferredPool.length > 0
      ? preferredPool
      : input.galleryPhotos;
  const ranked = input.tieBreakSeed != null
    ? rankPhotosForContentSeeded(
      input.matchInput,
      pool,
      lookup,
      input.tieBreakSeed,
      usedBases,
      input.galleryMeta,
    )
    : rankPhotosForContent(
      input.matchInput,
      pool,
      lookup,
      usedBases,
      input.galleryMeta,
    );

  const skipCaptionTrim = jobKind === 'place' || jobKind === 'process';
  const finish = (rows: Array<{ url: string; score: number }>) => (
    skipCaptionTrim
      ? rows.slice(0, LOOK_CANDIDATE_LIMIT)
      : trimLookShortlistToCaptionFit(rows)
  );

  const picked: Array<{ url: string; score: number }> = [];
  const seen = new Set<string>();
  for (const row of ranked) {
    const key = normalizeGalleryUrl(row.url);
    if (seen.has(key) || !isUsableGalleryPhotoUrl(row.url)) continue;
    picked.push({ url: row.url, score: row.score });
    seen.add(key);
    if (picked.length >= LOOK_CANDIDATE_LIMIT) {
      return finish(picked);
    }
  }
  if (picked.length > 0) {
    return finish(picked);
  }
  const fallbackPool = jobKindPool.length > 0 ? jobKindPool : input.galleryPhotos;
  for (const url of fallbackPool) {
    const key = normalizeGalleryUrl(url);
    if (seen.has(key) || usedBases.has(key) || !isUsableGalleryPhotoUrl(url)) continue;
    picked.push({ url, score: 0 });
    seen.add(key);
    if (picked.length >= LOOK_CANDIDATE_LIMIT) break;
  }
  return finish(picked);
}

/** Caption-ranked look shortlist. Batch force only leads when it also fits the caption. */
export function buildCaptionFitLookShortlist(input: {
  assignment: ProductionAssignment;
  storyIndex?: number;
  galleryPhotos: string[];
  galleryMeta: Record<string, GalleryPhotoMeta>;
  excludeUrls: string[];
  brandName: string;
  brandDescription?: string;
  businessType?: string;
  sectorId?: string;
  catalogSlotKey?: string;
  visualSubjectHint?: string;
  creativeBrief?: string;
  ideationCaption?: string;
  ideationHeadline?: string;
  subjectKey?: string;
  slotBackfillPass?: boolean;
  tieBreakSeed?: number;
  forcedPhotoUrl?: string | null;
}): Array<{ url: string; score: number }> {
  const matchInput = buildSlotGalleryMatchInput(input);
  return collectFeedSlotLookUrls({
    ...input,
    matchInput,
  });
}

/**
 * Pick gallery photo for slot + write caption/headline from analysis (meta → GPT fallback).
 */
export async function resolveGalleryFirstForSlot(input: {
  assignment: ProductionAssignment;
  storyIndex?: number;
  galleryPhotos: string[];
  galleryMeta: Record<string, GalleryPhotoMeta>;
  excludeUrls: string[];
  brandName: string;
  brandLocation?: string;
  brandDescription?: string;
  businessType?: string;
  visualSubjectHint?: string;
  creativeBrief?: string;
  language?: string;
  ideationCaption?: string;
  ideationHeadline?: string;
  subjectKey?: string;
  mood?: string;
  visualDirection?: string;
  strategicPurpose?: string;
  existingCaptions?: string[];
  slotBackfillPass?: boolean;
  ideaIndex?: number;
  forceRewrite?: boolean;
  /** Pre-assigned photo from mission batch matcher — caption still generated for this URL. */
  forcedPhotoUrl?: string | null;
  /** Test seam — inject the one-look packer. */
  lookFn?: (input: FeedSlotLookInput) => Promise<FeedSlotLookResult>;
  /** Brand flag: keep weekly scene sentence when the still is only a product. */
  adaptiveScene?: boolean;
}): Promise<GalleryFirstSlotResult | null> {
  const ideationCaption = String(input.ideationCaption ?? '').trim();
  const ideationHeadline = String(input.ideationHeadline ?? '').trim();
  const subjectKey = String(input.subjectKey ?? '').trim() || undefined;
  const tieBreakSeed = input.ideaIndex;
  const mood = String(input.mood ?? '').trim();
  const visualDirection = String(input.visualDirection ?? '').trim() || undefined;
  const strategicPurpose = String(input.strategicPurpose ?? '').trim() || undefined;

  const matchInput = buildSlotGalleryMatchInput({
    assignment: input.assignment,
    storyIndex: input.storyIndex,
    brandName: input.brandName,
    brandDescription: input.brandDescription,
    businessType: input.businessType,
    visualSubjectHint: input.visualSubjectHint,
    creativeBrief: input.creativeBrief,
    ideationCaption,
    ideationHeadline,
    subjectKey,
    mood,
    visualDirection,
    strategicPurpose,
    language: input.language,
  });

  if (shouldLookFeedSlotPack(input.assignment)) {
    const shortlist = collectFeedSlotLookUrls({
      ...input,
      tieBreakSeed,
      matchInput,
    });
    if (shortlist.length === 0) {
      return emptySlotLookResult(['no_pick']);
    }
    const slotJob = String(input.assignment.catalog_slot_label ?? '').trim()
      || slotJobFromCatalogKey(input.assignment.catalog_slot_key)
      || slotLabelTr(input.assignment);
    const lookFn = input.lookFn ?? lookFeedSlotPack;
    const looked = await lookFn({
      slotJob,
      language: input.language ?? 'Turkish',
      adaptiveScene: Boolean(input.adaptiveScene),
      catalogSlotKey: String(input.assignment.catalog_slot_key ?? '').trim() || undefined,
      ideationHint: [ideationHeadline, ideationCaption].filter(Boolean).join(' — ').slice(0, 400),
      candidates: shortlist.map((row) => {
        const meta = input.galleryMeta[normalizeGalleryUrl(row.url)]
          ?? Object.entries(input.galleryMeta).find(
            ([k]) => normalizeGalleryUrl(k) === normalizeGalleryUrl(row.url),
          )?.[1];
        return {
          url: row.url,
          visibleLabelText: meta?.visibleLabelText,
          description: meta?.description,
          primarySubject: meta?.primarySubject,
        };
      }),
    });
    if (!looked.ok) {
      return emptySlotLookResult(looked.issues);
    }
    const pickedMeta = input.galleryMeta[normalizeGalleryUrl(looked.pack.photoUrl)]
      ?? Object.entries(input.galleryMeta).find(
        ([k]) => normalizeGalleryUrl(k) === normalizeGalleryUrl(looked.pack.photoUrl),
      )?.[1];
    const photoSideText = [pickedMeta?.visibleLabelText, pickedMeta?.description, pickedMeta?.primarySubject]
      .filter(Boolean)
      .join(' ');
    const ideationHint = [ideationHeadline, ideationCaption].filter(Boolean).join(' — ').slice(0, 400);
    const groundedCopy = groundFeedSlotCopy({
      ...looked.pack,
      ideationHint,
      photoSideText,
    });
    const sceneCopy = keepWeeklySceneCopy({
      adaptiveScene: Boolean(input.adaptiveScene),
      ideationHint,
      caption: groundedCopy.caption,
      headline: groundedCopy.headline,
      evidenceNote: groundedCopy.evidenceNote,
      photoSideText,
      photoUrl: looked.pack.photoUrl,
    });
    const locked = parseFeedSlotPack({
      ...looked.pack,
      evidenceNote: groundedCopy.evidenceNote,
      caption: sceneCopy.caption,
      headline: sceneCopy.headline,
    });
    if (!locked.ok) {
      return emptySlotLookResult(locked.issues);
    }
    const { acceptBoundPack } = await import('@/studio/bind');
    const accepted = acceptBoundPack(locked.pack);
    if (!accepted.ok) {
      return emptySlotLookResult(accepted.codes);
    }
    const matchScore = shortlist.find(
      (row) => normalizeGalleryUrl(row.url) === normalizeGalleryUrl(accepted.pack.photoUrl),
    )?.score ?? null;
    return {
      photoUrl: accepted.pack.photoUrl,
      caption: accepted.pack.caption,
      headline: accepted.pack.headline,
      hashtags: [],
      matchScore,
      source: 'slot_look',
      applied: true,
      grounded: true,
      pack: accepted.pack,
    };
  }

  let pick: PhotoMatchResult | null = null;
  const forced = String(input.forcedPhotoUrl ?? '').trim();
  if (forced && isUsableGalleryPhotoUrl(forced)) {
    const forcedBase = normalizeGalleryUrl(forced);
    const excluded = new Set(input.excludeUrls.map(normalizeGalleryUrl));
    if (!excluded.has(forcedBase)) {
      const forcedMeta = input.galleryMeta[forcedBase]
        ?? Object.entries(input.galleryMeta).find(
          ([k]) => normalizeGalleryUrl(k) === forcedBase,
        )?.[1];
      // Re-validate batch assign — never trust a pre-assigned hard mismatch.
      if (!isHardGalleryThemeMismatch(matchInput, forcedMeta, forced)) {
        const forcedScore = scoreIdeationPhotoMatch({
          caption: ideationCaption || ideationHeadline,
          headline: ideationHeadline || ideationCaption,
          photoUrl: forced,
          galleryAnalysis: input.galleryMeta,
          businessType: input.businessType,
          subjectKey,
          mood,
          visualDirection,
          strategicPurpose,
        });
        if (forcedScore >= MIN_ACCEPT_SCORE) {
          pick = {
            url: forced,
            score: forcedScore,
            reason: 'mission_batch_assign',
            confidence: Math.min(1, forcedScore / 80),
          };
        }
      }
    }
  }

  if (!pick?.url) {
    pick = pickGalleryPhotoForSlot({
      ...input,
      ideationCaption,
      ideationHeadline,
      subjectKey,
      tieBreakSeed,
    });
  }

  if (!pick?.url) {
    return null;
  }

  const photoUrl = pick.url;
  const meta = input.galleryMeta[normalizeGalleryUrl(photoUrl)]
    ?? Object.entries(input.galleryMeta).find(
      ([k]) => normalizeGalleryUrl(k) === normalizeGalleryUrl(photoUrl),
    )?.[1];

  if (isHardGalleryThemeMismatch(matchInput, meta, photoUrl)) {
    return null;
  }

  const alignScore = scoreIdeationPhotoMatch({
    caption: ideationCaption || ideationHeadline,
    headline: ideationHeadline || ideationCaption,
    photoUrl,
    galleryAnalysis: input.galleryMeta,
    businessType: input.businessType,
    subjectKey,
  });

  // Ideation caption present → keep tone/CTA; ground unproven product variants.
  // Do NOT rebuild the whole caption from gallery meta/GPT (kitchen overlays on DJ).
  const keepIdeationCopy = ideationCaption.length >= 24
    && !input.forceRewrite
    && !input.slotBackfillPass;

  if (keepIdeationCopy) {
    // Weak align on a strict theme → refuse rather than ship mismatched visual.
    if (
      captionRequiresStrictGalleryMatch(ideationCaption, ideationHeadline)
      && alignScore < MIN_ACCEPT_SCORE
    ) {
      return null;
    }
    const grounded = groundPublishCopyToVisual({
      caption: ideationCaption,
      headline: ideationHeadline || ideationCaption.slice(0, 72),
      photoUrl,
      galleryMeta: input.galleryMeta,
    });
    return {
      photoUrl,
      caption: grounded.caption,
      headline: grounded.headline,
      hashtags: [],
      matchScore: alignScore,
      source: grounded.changed ? 'photo_grounded' : 'ideation_aligned',
      applied: true,
      grounded: grounded.changed,
    };
  }

  // Empty / stub ideation only — derive publish copy from the matched photo.
  const built = buildInstagramCaptionFromGalleryMeta(
    meta as Record<string, unknown> | undefined,
    input.brandName,
    input.brandLocation,
  );

  let caption = built.caption.trim();
  let headline = built.headline.trim();
  let hashtags: string[] = [];
  let source: GalleryFirstCaptionSource = 'gallery_meta';

  if (captionNeedsGpt(caption)) {
    const slotHint = slotLabelTr(input.assignment);
    const suggestions = await generateGalleryCaptionsWithGpt({
      photoUrls: [photoUrl],
      galleryAnalysis: input.galleryMeta,
      brandName: input.brandName,
      brandDescription: input.brandDescription,
      industry: input.businessType,
      existingCaptions: input.existingCaptions,
      language: input.language ?? 'Turkish',
      slotHint,
    });
    const match = suggestions.find(
      (s) => normalizeGalleryUrl(s.photoUrl) === normalizeGalleryUrl(photoUrl),
    ) ?? suggestions[0];
    if (match?.caption?.trim()) {
      caption = match.caption.trim();
      headline = match.headline?.trim() || headline;
      hashtags = normalizeHashtagsLocal(match.hashtags);
      source = 'gallery_gpt';
    }
  }

  if (!caption.trim()) {
    caption = `${input.brandName} — ${slotLabelTr(input.assignment)}`.trim();
  }
  if (!headline.trim()) {
    headline = caption.slice(0, 72) || input.brandName;
  }

  headline = sanitizeProductionHeadline({
    headline,
    ideationHeadline: input.ideationHeadline,
    caption,
    brandName: input.brandName,
    maxLen: 72,
  });

  const finalScore = scoreIdeationPhotoMatch({
    caption,
    headline,
    photoUrl,
    galleryAnalysis: input.galleryMeta,
    businessType: input.businessType,
  });

  return {
    photoUrl,
    caption,
    headline,
    hashtags,
    matchScore: finalScore >= 0 ? finalScore : pick.score,
    source,
    applied: true,
  };
}

/** Re-export for orchestrator — gallery slots use photo picker. */
export { assignmentUsesGalleryPhoto };
