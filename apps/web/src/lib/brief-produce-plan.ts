/**
 * Pure planning helpers for New Brief → auto-produce (no provider calls).
 */
import type { ParsedIdea } from '@/app/api/auto-produce/caption-publish-resolver';
import {
  isBriefOutputType,
  resolveBriefIntent,
  stripBriefFormMetadata,
  type BriefOutputType,
} from '@/lib/brief-intent-resolver';
import type { BrandCreativeDirectorOutput } from '@/lib/brand-creative-director';
import { buildRevisionDirective, sanitizeRevisionNote, type BriefRequestSnapshot } from '@/lib/brief-revision';
import {
  briefDesignDirectionLabel,
  buildBriefDesignDirectives,
  buildBriefDetailCaptionTail,
  buildBriefDetailSubline,
  pickAlternateDesignDirections,
  resolveBriefCta,
  type BriefDesignDirectionId,
  type BriefDetails,
  type BriefGoalId,
} from '@/lib/brief-design-direction';

/** Owner's "+" choices — goal, look and facts. All optional; absent = today's behaviour. */
export interface BriefOwnerChoices {
  goal?: BriefGoalId | null;
  designDirection?: BriefDesignDirectionId | null;
  details?: BriefDetails | null;
  locale?: 'tr' | 'en';
  /** "Düzelt" round — owner's one-sentence note; painted as a binding directive. */
  revision?: { of: string; round: number; note: string } | null;
}

/**
 * Fold the owner's choices into an idea: painter directives ride on
 * `visual_direction`, the facts land in caption + on-canvas subline, and the
 * goal becomes the strategic purpose when the director did not set one.
 */
export function applyBriefOwnerChoices(idea: ParsedIdea, choices: BriefOwnerChoices | undefined): ParsedIdea {
  if (!choices) return idea;
  const details = choices.details ?? null;
  const directives = buildBriefDesignDirectives({
    goal: choices.goal,
    designDirection: choices.designDirection,
    details,
  });
  const subline = details ? buildBriefDetailSubline(details) : '';
  const tail = details ? buildBriefDetailCaptionTail(details, choices.locale ?? 'tr') : '';
  const cta = resolveBriefCta(choices.goal, details?.cta, choices.locale ?? 'tr');
  const caption = String(idea.caption_draft ?? '').trim();
  const nextCaption = tail && !caption.includes(tail) ? [caption, tail].filter(Boolean).join('\n\n') : caption;
  const revision = choices.revision && choices.revision.note.trim() ? choices.revision : null;
  const nextVisual = [
    String(idea.visual_direction ?? '').trim(),
    ...directives,
    ...(revision ? [buildRevisionDirective(revision.note, revision.round)] : []),
  ].filter(Boolean).join('\n');
  const fieldCopy = { ...(idea.canva_field_copy ?? {}) };
  if (subline && !fieldCopy.subtitle) fieldCopy.subtitle = subline;
  if (cta && !fieldCopy.cta) fieldCopy.cta = cta;
  return {
    ...idea,
    caption_draft: nextCaption || idea.caption_draft,
    visual_direction: nextVisual || idea.visual_direction,
    strategic_purpose: idea.strategic_purpose || (choices.goal ?? undefined),
    ...(Object.keys(fieldCopy).length ? { canva_field_copy: fieldCopy } : {}),
    ...(cta ? { cta } : {}),
    ...(revision
      ? {
          brief_revision_of: revision.of,
          brief_revision_round: revision.round,
          brief_revision_note: sanitizeRevisionNote(revision.note),
        }
      : {}),
  };
}

/** Stamp the owner request snapshot on every idea so each card can be revised later. */
export function stampBriefRequestSnapshot(ideas: ParsedIdea[], snapshot: BriefRequestSnapshot): ParsedIdea[] {
  return ideas.map((idea) => ({ ...idea, brief_request: { ...snapshot } }));
}

/** New Brief title is the on-canvas headline — never replaced by BCD or catalog samples. */
export function lockBriefUserHeadline(title: string): string {
  return title.trim().slice(0, 80);
}

export function mapBriefOutputToContentType(outputType: BriefOutputType): string {
  switch (outputType) {
    case 'story': return 'story';
    case 'reel': return 'reel';
    case 'carousel': return 'carousel';
    case 'post': return 'feed_post';
    default: return 'feed_post';
  }
}

/** Clamp idea count the same way as POST /api/brief-produce. */
export function clampBriefIdeaCount(count: string | number | undefined): number {
  const parsed = parseInt(String(count ?? 1), 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(Math.max(parsed, 1), 10);
}

export const BRIEF_CAROUSEL_MIN_SLIDES = 2;
export const BRIEF_CAROUSEL_MAX_SLIDES = 6;
export const BRIEF_CAROUSEL_DEFAULT_SLIDES = 4;

/** For a carousel brief the form "count" is the slide count of one carousel. */
export function clampBriefCarouselSlides(count: string | number | undefined): number {
  const parsed = parseInt(String(count ?? BRIEF_CAROUSEL_DEFAULT_SLIDES), 10);
  if (!Number.isFinite(parsed)) return BRIEF_CAROUSEL_DEFAULT_SLIDES;
  return Math.min(Math.max(parsed, BRIEF_CAROUSEL_MIN_SLIDES), BRIEF_CAROUSEL_MAX_SLIDES);
}

/** How many ideas a brief produces: N designs, or exactly one carousel. */
export function resolveBriefIdeaCount(outputType: BriefOutputType, count: string | number | undefined): number {
  return outputType === 'carousel' ? 1 : clampBriefIdeaCount(count);
}

/**
 * Light, sector-agnostic announcement signal from title + description (+ BCD cues).
 * Used so catalog stamp / AI picker can idea-fit without a mission calendar label.
 */
export function resolveBriefAnnouncementType(input: {
  title: string;
  extraDirection: string;
  strategicPurpose?: string;
  sceneHint?: string;
  mood?: string;
}): string | null {
  const hay = [
    input.title,
    input.extraDirection,
    input.strategicPurpose,
    input.sceneHint,
    input.mood,
  ].join(' ').toLowerCase();

  if (
    /\b(dj|live\s*set|live\s*music|line.?up|konser|afterparty|aftermovie|wedding|düğün|etkinlik|event|party|gece)\b/.test(hay)
  ) {
    return 'event_teaser';
  }
  if (
    /\b(guest\s*review|customer\s*review|testimonial|what\s*guests|misafir\s*yorum|memnuniyet)\b/.test(hay)
  ) {
    return 'social_proof';
  }
  if (
    /\b(indirim|offer|promo|day.?pass|daybed|kampanya|fırsat|discount|%|ticket|rezerv)\b/.test(hay)
  ) {
    return 'offer_campaign';
  }
  if (
    /(?:^|\s)(ürün|product|reçel|zeytin|menu|menü|kokteyl|cocktail|tabak|dish|vitrin|bal|product\s*spotlight)/.test(` ${hay} `)
    || /\b(product\s*spotlight|ürün\s*vitrin|shelf|hero\s*product)\b/.test(hay)
  ) {
    return 'product_reveal';
  }
  if (/\b(venue|mekan|atmosfer|ambiance|havuz|pool|sunset|manzara|aerial)\b/.test(hay)) {
    return 'venue_showcase';
  }
  return null;
}

export function attachUserPhotosToIdea(
  idea: ParsedIdea,
  photoUrls: string[],
  slotIndex: number,
): void {
  if (photoUrls.length === 0) return;
  idea.attached_photo_urls = photoUrls;
  idea.force_attached_photos = true;
  idea.selected_gallery_url = photoUrls[slotIndex % photoUrls.length];
}

function enrichBriefIdeaForSlotMatch(
  idea: ParsedIdea,
  input: {
    title: string;
    extraDirection: string;
    outputType: BriefOutputType;
    count?: number;
  },
): ParsedIdea {
  const contentBrief = [input.title.trim(), input.extraDirection.trim()]
    .filter(Boolean)
    .join('\n');
  const announcement = resolveBriefAnnouncementType({
    title: input.title,
    extraDirection: input.extraDirection,
    strategicPurpose: idea.strategic_purpose,
    sceneHint: idea.scene_hint,
    mood: idea.mood,
  });

  return {
    ...idea,
    format: input.outputType,
    publish_schedule_format: input.outputType,
    content_brief: contentBrief || undefined,
    ...(input.outputType === 'carousel'
      ? { carousel_slide_target: clampBriefCarouselSlides(input.count) }
      : {}),
    ...(announcement
      ? {
          calendar_announcement_type: announcement,
          announcement_type: announcement,
        }
      : {}),
  };
}

export function buildBriefProduceIdeas(input: {
  title: string;
  extraDirection: string;
  outputType: BriefOutputType;
  count: number;
  photoUrls: string[];
  bcd: BrandCreativeDirectorOutput | null;
  /** When true, overlay headline is the form title. Default: generate from caption + description. */
  lockUserHeadline?: boolean;
  /** "+" owner choices (goal / look / facts). */
  choices?: BriefOwnerChoices;
  /** "Pick one": paint each idea in N looks (1–3). Reel/carousel always 1. */
  variantCount?: number;
  /** Stable seed for sibling grouping (brief job id). */
  variantGroupSeed?: string;
}): ParsedIdea[] {
  const contentType = mapBriefOutputToContentType(input.outputType);
  const ideaCount = resolveBriefIdeaCount(input.outputType, input.count);
  const lockUserHeadline = input.lockUserHeadline === true;
  const variantCount = resolveBriefVariantCount(input.outputType, input.variantCount);

  const userHeadline = lockBriefUserHeadline(input.title);
  const userDirection = stripBriefFormMetadata(input.extraDirection);

  const baseIdeas = Array.from({ length: ideaCount }, (_, i) => buildOneBriefIdea(i));
  if (variantCount <= 1) return baseIdeas.map(({ raw: _raw, ...idea }) => idea);

  const chosen = input.choices?.designDirection ?? 'brand';
  const alternates = pickAlternateDesignDirections(chosen, variantCount - 1);
  const seed = String(input.variantGroupSeed ?? '').trim() || 'brief';
  const out: ParsedIdea[] = [];
  baseIdeas.forEach((base, i) => {
    const group = `${seed}:${i}`;
    const looks: BriefDesignDirectionId[] = [chosen, ...alternates];
    looks.forEach((look, v) => {
      const choices: BriefOwnerChoices = { ...(input.choices ?? {}), designDirection: look };
      const variant = applyBriefOwnerChoices(base.raw, choices);
      out.push({
        ...variant,
        brief_variant_group: group,
        brief_variant_index: v,
        brief_variant_count: looks.length,
        brief_variant_label: briefDesignDirectionLabel(look) ?? look,
      });
    });
  });
  return out;

  /** Builds one idea with owner choices applied; `raw` keeps the pre-choices idea for variants. */
  function buildOneBriefIdea(i: number): ParsedIdea & { raw: ParsedIdea } {
    const raw = buildRawBriefIdea(i);
    return { ...applyBriefOwnerChoices(raw, input.choices), raw };
  }

  function buildRawBriefIdea(i: number): ParsedIdea {
    if (input.bcd) {
      const overlay = lockUserHeadline ? userHeadline : lockBriefUserHeadline(input.bcd.headline);
      const idea: ParsedIdea = {
        headline: overlay,
        caption_draft: userDirection || input.bcd.caption,
        content_type: contentType,
        visual_direction: input.bcd.visualDirection,
        strategic_purpose: input.bcd.strategicPurpose,
        mood: input.bcd.mood,
        scene_hint: input.bcd.sceneHint,
        motion_cue: input.bcd.motionCue,
        lock_user_headline: lockUserHeadline,
        canva_field_copy: lockUserHeadline
          ? {
              title: overlay,
              ...(userDirection ? { subtitle: userDirection.slice(0, 80) } : {}),
            }
          : undefined,
      };
      attachUserPhotosToIdea(idea, input.photoUrls, i);
      return enrichBriefIdeaForSlotMatch(idea, input);
    }

    const intent = resolveBriefIntent({
      title: input.title,
      extraDirection: input.extraDirection,
      outputType: input.outputType,
    });
    const overlay = lockUserHeadline ? userHeadline : intent.headline;
    const idea: ParsedIdea = {
      headline: overlay,
      caption_draft: intent.caption,
      content_type: contentType,
      visual_direction: intent.visualDirection,
      strategic_purpose: intent.strategicPurpose,
      mood: intent.mood,
      lock_user_headline: lockUserHeadline,
      canva_field_copy: lockUserHeadline
        ? {
            title: overlay,
            ...(userDirection ? { subtitle: userDirection.slice(0, 80) } : {}),
          }
        : undefined,
    };
    attachUserPhotosToIdea(idea, input.photoUrls, i);
    return enrichBriefIdeaForSlotMatch(idea, input);
  }
}

export const BRIEF_MAX_VARIANTS = 3;

/** Variants only make sense where the painter designs a card: post + story. */
export function resolveBriefVariantCount(outputType: BriefOutputType, requested: string | number | undefined): number {
  if (outputType === 'reel' || outputType === 'carousel') return 1;
  const parsed = parseInt(String(requested ?? 1), 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(Math.max(parsed, 1), BRIEF_MAX_VARIANTS);
}

/** Artifacts the owner should expect in the feed for this brief. */
export function resolveBriefExpectedArtifacts(
  outputType: BriefOutputType,
  count: string | number | undefined,
  variants: string | number | undefined,
): number {
  return resolveBriefIdeaCount(outputType, count) * resolveBriefVariantCount(outputType, variants);
}

export function validateBriefProduceRequest(body: {
  workspaceId?: string;
  title?: string;
  outputType?: string;
}):
  | { ok: true; workspaceId: string }
  | { ok: false; error: string; status: number } {
  if (!body.workspaceId) {
    return { ok: false, error: 'workspaceId required', status: 400 };
  }
  if (!String(body.title ?? '').trim()) {
    return { ok: false, error: 'title required', status: 400 };
  }
  if (!isBriefOutputType(String(body.outputType ?? 'post'))) {
    return { ok: false, error: 'outputType must be story, reel, post, or carousel', status: 400 };
  }
  return { ok: true, workspaceId: body.workspaceId };
}
