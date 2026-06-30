/**
 * Gallery-first mission production — pick analyzed gallery photo per slot,
 * then generate caption/headline aligned to that photo (not ideation-first).
 */
import {
  MIN_ACCEPT_SCORE,
  RELAXED_MATCH_SCORE,
  buildGalleryLookup,
  rankPhotosForContent,
  rankPhotosForContentSeeded,
  type GalleryPhotoMeta,
  type MatchPhotoInput,
  type PhotoMatchResult,
} from '@/lib/gallery-photo-matcher';
import { kindToPostType, normalizeGalleryUrl, type PostTypeBucket } from '@/lib/gallery-usage-tracker';
import { isUsableGalleryPhotoUrl } from '@/lib/media-url';
import { buildInstagramCaptionFromGalleryMeta } from '@/lib/feed-display-caption';
import { scoreIdeationPhotoMatch } from '@/lib/caption-photo-alignment';
import { generateGalleryCaptionsWithGpt } from '@/lib/gallery-caption-generator';
import { assignmentUsesGalleryPhoto } from '@/lib/auto-produce/gallery-orchestrator';
import type { ProductionAssignment, ProductionSlotRole } from '@/lib/mission-production-manifest';
import { isVisionAnalysisDescription, isGalleryTagHeadline } from '@/lib/vision-text-guard';
import { sanitizeProductionHeadline } from '@/lib/production-headline-quality';

export type GalleryFirstCaptionSource = 'ideation_aligned' | 'gallery_meta' | 'gallery_gpt';

export interface GalleryFirstSlotResult {
  photoUrl: string | null;
  caption: string;
  headline: string;
  hashtags: string[];
  matchScore: number | null;
  source: GalleryFirstCaptionSource;
  applied: boolean;
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
  visualSubjectHint?: string;
  creativeBrief?: string;
  ideationCaption?: string;
  ideationHeadline?: string;
}): MatchPhotoInput {
  const format = slotFormatFromAssignment(input.assignment);
  const hint = String(input.visualSubjectHint ?? '').trim();
  const headline = String(input.ideationHeadline ?? '').trim();
  const caption = String(input.ideationCaption ?? '').trim();
  const brief = String(input.creativeBrief ?? '').trim().slice(0, 160);
  const brandLine = `${input.brandName} ${input.brandDescription ?? ''}`.trim();

  const syntheticHeadline = hint || headline || brief || input.brandName;
  const syntheticCaption = caption
    || [hint, brief, brandLine].filter(Boolean).join(' — ')
    || input.brandName;

  return {
    caption: syntheticCaption,
    headline: syntheticHeadline,
    mood: '',
    contentType: formatToContentType(format),
    businessType: input.businessType,
    storySequenceRole: format === 'story'
      ? storySequenceRole(input.storyIndex ?? 0)
      : undefined,
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
  visualSubjectHint?: string;
  creativeBrief?: string;
  ideationCaption?: string;
  ideationHeadline?: string;
  slotBackfillPass?: boolean;
  tieBreakSeed?: number;
}): PhotoMatchResult | null {
  const matchInput = buildSlotGalleryMatchInput(input);
  const usedBases = new Set(input.excludeUrls.map(normalizeGalleryUrl));
  const minScore = input.slotBackfillPass ? RELAXED_MATCH_SCORE : MIN_ACCEPT_SCORE;
  const lookup = buildGalleryLookup(input.galleryMeta, input.galleryPhotos);

  const ranked = input.tieBreakSeed != null
    ? rankPhotosForContentSeeded(
      matchInput,
      input.galleryPhotos,
      lookup,
      input.tieBreakSeed,
      usedBases,
      input.galleryMeta,
    )
    : rankPhotosForContent(
      matchInput,
      input.galleryPhotos,
      lookup,
      usedBases,
      input.galleryMeta,
    );

  const best = ranked[0];
  if (best && best.score >= minScore) return best;

  if (!input.slotBackfillPass && best && best.score >= RELAXED_MATCH_SCORE) {
    return best;
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
  existingCaptions?: string[];
  slotBackfillPass?: boolean;
  ideaIndex?: number;
  forceRewrite?: boolean;
  /** Pre-assigned photo from mission batch matcher — caption still generated for this URL. */
  forcedPhotoUrl?: string | null;
}): Promise<GalleryFirstSlotResult | null> {
  const ideationCaption = String(input.ideationCaption ?? '').trim();
  const ideationHeadline = String(input.ideationHeadline ?? '').trim();
  const tieBreakSeed = input.ideaIndex;

  let pick: PhotoMatchResult | null = null;
  const forced = String(input.forcedPhotoUrl ?? '').trim();
  if (forced && isUsableGalleryPhotoUrl(forced)) {
    const forcedBase = normalizeGalleryUrl(forced);
    const excluded = new Set(input.excludeUrls.map(normalizeGalleryUrl));
    if (!excluded.has(forcedBase)) {
      pick = {
        url: forced,
        score: MIN_ACCEPT_SCORE,
        reason: 'mission_batch_assign',
        confidence: 1,
      };
    }
  }

  if (!pick?.url) {
    pick = pickGalleryPhotoForSlot({
      ...input,
      ideationCaption,
      ideationHeadline,
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

  const alignScore = scoreIdeationPhotoMatch({
    caption: ideationCaption || ideationHeadline,
    headline: ideationHeadline || ideationCaption,
    photoUrl,
    galleryAnalysis: input.galleryMeta,
    businessType: input.businessType,
  });

  const ideationStrong = ideationCaption.length >= 24
    && alignScore >= MIN_ACCEPT_SCORE
    && !input.forceRewrite
    && !input.slotBackfillPass;

  if (ideationStrong) {
    return {
      photoUrl,
      caption: ideationCaption,
      headline: ideationHeadline || ideationCaption.slice(0, 72),
      hashtags: [],
      matchScore: alignScore,
      source: 'ideation_aligned',
      applied: true,
    };
  }

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
