/**
 * Pure planning helpers for New Brief → auto-produce (no provider calls).
 */
import type { ParsedIdea } from '@/app/api/auto-produce/caption-publish-resolver';
import { resolveBriefIntent, type BriefOutputType } from '@/lib/brief-intent-resolver';
import type { BrandCreativeDirectorOutput } from '@/lib/brand-creative-director';

export function mapBriefOutputToContentType(outputType: BriefOutputType): string {
  switch (outputType) {
    case 'story': return 'story';
    case 'reel': return 'reel';
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
}): ParsedIdea[] {
  const contentType = mapBriefOutputToContentType(input.outputType);
  const ideaCount = clampBriefIdeaCount(input.count);

  return Array.from({ length: ideaCount }, (_, i) => {
    if (input.bcd) {
      const idea: ParsedIdea = {
        headline: input.bcd.headline,
        caption_draft: input.bcd.caption,
        content_type: contentType,
        visual_direction: input.bcd.visualDirection,
        strategic_purpose: input.bcd.strategicPurpose,
        mood: input.bcd.mood,
        scene_hint: input.bcd.sceneHint,
        motion_cue: input.bcd.motionCue,
      };
      attachUserPhotosToIdea(idea, input.photoUrls, i);
      return enrichBriefIdeaForSlotMatch(idea, input);
    }

    const intent = resolveBriefIntent({
      title: input.title,
      extraDirection: input.extraDirection,
      outputType: input.outputType,
    });
    const idea: ParsedIdea = {
      headline: intent.headline,
      caption_draft: intent.caption,
      content_type: contentType,
      visual_direction: intent.visualDirection,
      strategic_purpose: intent.strategicPurpose,
      mood: intent.mood,
    };
    attachUserPhotosToIdea(idea, input.photoUrls, i);
    return enrichBriefIdeaForSlotMatch(idea, input);
  });
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
  if (!['story', 'reel', 'post'].includes(String(body.outputType ?? 'post'))) {
    return { ok: false, error: 'outputType must be story, reel, or post', status: 400 };
  }
  return { ok: true, workspaceId: body.workspaceId };
}
