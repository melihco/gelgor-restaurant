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
      return idea;
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
    return idea;
  });
}

export function validateBriefProduceRequest(body: {
  workspaceId?: string;
  title?: string;
  outputType?: string;
}): { ok: true } | { ok: false; error: string; status: number } {
  if (!body.workspaceId) {
    return { ok: false, error: 'workspaceId required', status: 400 };
  }
  if (!String(body.title ?? '').trim()) {
    return { ok: false, error: 'title required', status: 400 };
  }
  if (!['story', 'reel', 'post'].includes(String(body.outputType ?? 'post'))) {
    return { ok: false, error: 'outputType must be story, reel, or post', status: 400 };
  }
  return { ok: true };
}
