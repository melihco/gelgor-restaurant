/**
 * Instagram Feed caption — never show raw vision analysis ("The image shows…").
 * Vision description stays in metadata.gallery_photo_description for prompts.
 */

import { isVisionAnalysisDescription, isGalleryTagHeadline, resolveProductHeadlineFromGalleryTags } from './vision-text-guard';
import {
  isMeaninglessBrandEchoHeadline,
  resolveMeaningfulProductionHeadline,
} from './production-headline-quality';

const ATMOSFER_PREFIX_RE = /^atmosfer:\s*/i;

const MOOD_TR: Record<string, string> = {
  festive: 'Kutlama ve samimi bir atmosfer.',
  energetic: 'Enerjik ve canlı bir atmosfer.',
  elegant: 'Zarif ve özenli bir atmosfer.',
  warm: 'Sıcak ve davetkar bir atmosfer.',
  romantic: 'Romantik bir atmosfer.',
  luxurious: 'Lüks ve özel bir deneyim.',
  playful: 'Eğlenceli ve rahat bir atmosfer.',
  cozy: 'Samimi ve huzurlu bir atmosfer.',
  ambient: 'Rahat bir atmosfer.',
  minimal: 'Sade ve modern bir atmosfer.',
  dramatic: 'Etkileyici bir atmosfer.',
};

export { isVisionAnalysisDescription, isGalleryTagHeadline } from './vision-text-guard';

function pickStr(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function pickTurkishCaptionHook(hooks: unknown): string {
  if (!Array.isArray(hooks)) return '';
  for (const h of hooks) {
    const t = String(h).trim();
    if (t.length < 8) continue;
    if (isVisionAnalysisDescription(t)) continue;
    if (/[ğüşıöçĞÜŞİÖÇ]/.test(t)) return t;
  }
  for (const h of hooks) {
    const t = String(h).trim();
    if (t.length >= 8 && !isVisionAnalysisDescription(t)) return t;
  }
  return '';
}

function moodLineTr(mood: string): string {
  const key = mood.trim().toLowerCase();
  return MOOD_TR[key] ?? (key ? `Atmosfer: ${key}.` : '');
}

/** Build IG-facing caption from gallery meta (not raw vision dump). */
export function buildInstagramCaptionFromGalleryMeta(
  meta: Record<string, unknown> | undefined,
  brandName: string,
  location?: string,
): { caption: string; headline: string; sceneDescription: string } {
  const sceneDescription = String(meta?.description ?? meta?.photo_description ?? '').trim();
  const hook = pickTurkishCaptionHook(meta?.captionHooks);
  const mood = String(meta?.mood ?? '').trim();
  const tags = Array.isArray(meta?.contentTags)
    ? (meta.contentTags as unknown[]).map(String).filter(Boolean).slice(0, 4)
    : [];

  let headline = hook || brandName;
  const bodyParts: string[] = [];

  if (hook) {
    bodyParts.push(hook);
  } else if (sceneDescription && !isVisionAnalysisDescription(sceneDescription)) {
    const first = sceneDescription.split(/[.!?]/)[0]?.trim();
    if (first && first.length >= 12) {
      bodyParts.push(first);
      headline = first.slice(0, 72);
    }
  } else if (tags.length) {
    const line = tags.join(' · ');
    bodyParts.push(line);
    headline = resolveProductHeadlineFromGalleryTags(tags, brandName);
  }

  const moodLine = moodLineTr(mood);
  if (moodLine) bodyParts.push(moodLine);

  const locLine = location?.trim()
    ? `📍 ${location.trim()}`
    : brandName;
  if (locLine) bodyParts.push(locLine);

  const caption = bodyParts.join('\n\n').slice(0, 420).trim()
    || `${brandName} deneyimini keşfedin.`;

  return {
    caption,
    headline: headline.slice(0, 72) || brandName,
    sceneDescription,
  };
}

export interface FeedCaptionInput {
  content?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  title?: string;
}

function hasIdeationCopy(meta: Record<string, unknown>, content: Record<string, unknown>): boolean {
  return Boolean(
    pickStr(
      meta.ideation_headline,
      meta.ideation_caption,
      meta.caption_draft,
      content.ideation_headline,
      content.ideation_caption,
      content.caption_draft,
      content.headline,
    ),
  );
}

/** Story/reel overlay headline — mission ideation first, never photo vision text. */
export function resolveFeedDisplayHeadline(input: FeedCaptionInput): string {
  const content = input.content ?? {};
  const meta = input.metadata ?? {};
  const brandName = pickStr(meta.brand_name, content.brand_name);
  const caption = pickStr(
    meta.ideation_caption,
    meta.caption_draft,
    content.caption_draft,
    content.caption,
    meta.caption,
  );

  const candidates = [
    meta.ideation_headline,
    content.ideation_headline,
    content.headline,
    meta.headline,
    meta.caption_draft,
    content.caption_draft,
    input.title,
  ];

  const conceptTitle = pickStr(
    content.concept_title,
    content.conceptTitle,
    meta.concept_title,
    meta.conceptTitle,
    content.idea_title,
    meta.idea_title,
  );

  for (const raw of candidates) {
    const t = pickStr(raw);
    if (!t) continue;
    if (isVisionAnalysisDescription(t)) continue;
    if (isGalleryTagHeadline(t)) continue;
    const isStoredIdeation = raw === meta.ideation_headline || raw === content.ideation_headline;
    if (
      isStoredIdeation
      && (!brandName || !isMeaninglessBrandEchoHeadline(t, brandName))
    ) {
      return t;
    }
    if (brandName && !isMeaninglessBrandEchoHeadline(t, brandName)) {
      return t;
    }
    if (brandName) {
      const resolved = resolveMeaningfulProductionHeadline({
        headline: t,
        caption,
        brandName,
        conceptTitle,
        maxLen: 72,
      });
      return resolved.headline;
    }
    return t;
  }

  return brandName || '';
}

/**
 * Caption shown under Feed posts — filters vision analysis, prefers ideation copy.
 */
export function resolveFeedDisplayCaption(input: FeedCaptionInput): string {
  const content = input.content ?? {};
  const meta = input.metadata ?? {};
  const ideationLocked = hasIdeationCopy(meta, content);

  const candidates = [
    meta.ideation_caption,
    meta.caption_draft,
    meta.original_caption,
    content.caption_draft,
    content.ideation_caption,
    content.caption,
    meta.caption,
  ];

  for (const raw of candidates) {
    const t = pickStr(raw);
    if (!t) continue;
    if (isVisionAnalysisDescription(t)) continue;
    if (ATMOSFER_PREFIX_RE.test(t) && t.length < 40) continue;
    return t;
  }

  if (ideationLocked) {
    return '';
  }

  const hooks = meta.caption_hooks ?? meta.captionHooks ?? content.caption_hooks;
  const hook = pickTurkishCaptionHook(hooks);
  if (hook) return hook;

  const brandName = pickStr(meta.brand_name, content.brand_name, input.title) || '';
  const location = pickStr(meta.location, content.location);
  const galleryMeta = meta.gallery_photo_meta as Record<string, unknown> | undefined;
  if (galleryMeta) {
    const built = buildInstagramCaptionFromGalleryMeta(galleryMeta, brandName, location);
    if (built.caption && !isVisionAnalysisDescription(built.caption)) {
      return built.caption;
    }
  }

  const scene = pickStr(meta.gallery_photo_description, meta.photo_scene_description);
  if (scene && !isVisionAnalysisDescription(scene)) {
    const first = scene.split(/[.!?]/)[0]?.trim();
    if (first && first.length >= 12 && first.length <= 200) return first;
  }

  const rawStored = pickStr(content.caption, meta.caption);
  if (rawStored && isVisionAnalysisDescription(rawStored)) {
    const salvaged = salvageCaptionFromVisionBlob(rawStored, brandName);
    if (salvaged) return salvaged;
  }

  return '';
}

/** Legacy artifacts stored vision text + "Atmosfer: mood" in caption field. */
function salvageCaptionFromVisionBlob(text: string, brandName: string): string {
  const atmosferSplit = text.split(/Atmosfer:\s*/i);
  if (atmosferSplit.length < 2) return '';

  const tail = atmosferSplit[1]!.trim();
  const moodRaw = tail.split(/[.!?]/)[0]?.trim() ?? '';
  const moodLine = moodLineTr(moodRaw) || (moodRaw ? `Atmosfer: ${moodRaw}.` : '');

  const parts = [moodLine].filter(Boolean);
  if (brandName) parts.push(brandName);
  return parts.join('\n\n').trim();
}
