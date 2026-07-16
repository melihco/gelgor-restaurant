/**
 * Instagram Feed caption — never show raw vision analysis ("The image shows…").
 * Vision description stays in metadata.gallery_photo_description for prompts.
 */

import {
  isVisionAnalysisDescription,
  isGalleryTagHeadline,
  isGalleryDerivedCaption,
  resolveProductHeadlineFromGalleryTags,
} from './vision-text-guard';
import { mergeMissionIdeationRecords } from './parse-ideation-summary';
import {
  isLabelStyleHeadline,
  isMeaninglessBrandEchoHeadline,
  resolveMeaningfulProductionHeadline,
} from './production-headline-quality';
import { nodeOutputArray } from './mission-node-output';

/**
 * Calendar-produced slots use idea_index ≥ this base (mirror of
 * CALENDAR_PRODUCTION_IDEA_INDEX_BASE — inlined to avoid a client bundle cycle
 * through calendar-production-pack → gallery-first-production → this module).
 */
const CALENDAR_PRODUCTION_IDEA_INDEX_BASE = 1000;
const MAX_CALENDAR_PLANS_PER_MISSION = 32;

/** True when ideation supplied a real marketing headline (not gallery/vision filler). */
export function hasPublishableIdeationHeadline(text: string, brandName = ''): boolean {
  const t = pickStr(text);
  if (t.length < 8) return false;
  if (isVisionAnalysisDescription(t)) return false;
  if (isGalleryTagHeadline(t)) return false;
  if (isLabelStyleHeadline(t)) return false;
  if (brandName && isMeaninglessBrandEchoHeadline(t, brandName)) return false;
  return true;
}

/** Designed / overlay slots — headline belongs on the image, not as a separate IG caption line. */
export function isDesignedPostArtifact(meta: Record<string, unknown>): boolean {
  const role = String(meta.production_role ?? '').toLowerCase();
  const pipeline = String(meta.pipeline ?? '').toLowerCase();
  if (
    role.includes('designed')
    || role === 'fal_designed_post'
    || role === 'paid_ad_creative'
    || role === 'paid_ad_google_creative'
  ) {
    return true;
  }
  if (
    pipeline.includes('fal_design')
    || pipeline === 'meta_ad'
    || pipeline === 'google_ad'
  ) {
    return true;
  }
  return meta.designed_post === true || meta.canvas_produced === true;
}

/** Nexus artifact list title — never gallery vision dumps or overlay-only hooks alone. */
export function buildArtifactListTitle(input: {
  conceptTitle?: string;
  ideationHeadline?: string;
  caption?: string;
  brandName?: string;
  format?: string;
}): string {
  const concept = pickStr(input.conceptTitle);
  const ideation = pickStr(input.ideationHeadline);
  const captionHook = pickStr(input.caption).split(/[.!?\n]/)[0]?.trim() ?? '';
  const brand = pickStr(input.brandName) || 'İçerik';
  const fmt = pickStr(input.format) || 'post';

  if (concept && !isVisionAnalysisDescription(concept) && !isGalleryTagHeadline(concept)) {
    return concept.slice(0, 72);
  }
  if (hasPublishableIdeationHeadline(ideation, brand)) {
    return ideation.slice(0, 72);
  }
  if (captionHook.length >= 12 && isPublishableIdeationCaption(captionHook)) {
    return captionHook.slice(0, 72);
  }
  return `${brand} — ${fmt}`;
}

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

export {
  isVisionAnalysisDescription,
  isGalleryTagHeadline,
  isGalleryDerivedCaption,
} from './vision-text-guard';

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
  /** Resolved from mission content_ideation (mission_id + idea_index). */
  missionIdeationCaption?: string;
}

export function pickIdeationCaptionFromIdea(idea: Record<string, unknown>): string {
  // Prefer real IG copy fields before brief/description (those are often planning meta).
  for (const key of ['caption_draft', 'caption', 'captionDraft', 'copy', 'text', 'script', 'body', 'brief', 'description']) {
    const v = idea[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

export function buildMissionIdeationCaptionLookup(
  missionId: string,
  nodes: Array<{
    node_key?: string;
    output_summary?: string | null;
    output_payload?: unknown;
    status?: string;
    task_type?: string;
  }>,
): Map<number, string> {
  const lookup = new Map<number, string>();
  const ideas = mergeMissionIdeationRecords(nodes, missionId);
  ideas.forEach((idea, index) => {
    const caption = pickIdeationCaptionFromIdea(idea);
    if (!caption || isGalleryDerivedCaption(caption)) return;
    lookup.set(index, caption);
    const rawIdx = idea.idea_index ?? idea.ideaIndex;
    if (typeof rawIdx === 'number' && Number.isFinite(rawIdx)) {
      lookup.set(rawIdx, caption);
    }
  });
  // Calendar-produced slots use idea_index ≥ CALENDAR_PRODUCTION_IDEA_INDEX_BASE.
  const calendarPlans = nodes
    .filter((n) => n.task_type === 'content_calendar' && n.status === 'completed')
    .flatMap((node) => nodeOutputArray(
      node as { output_summary?: string | null; output_payload?: unknown },
      ['plans', 'calendar', 'items', 'content_calendar', 'schedule'],
    ))
    .slice(0, MAX_CALENDAR_PLANS_PER_MISSION);
  calendarPlans.forEach((plan, planIndex) => {
    const caption = pickIdeationCaptionFromIdea(plan);
    if (!caption || isGalleryDerivedCaption(caption)) return;
    lookup.set(CALENDAR_PRODUCTION_IDEA_INDEX_BASE + planIndex, caption);
    const rawIdx = plan.idea_index ?? plan.ideaIndex;
    if (typeof rawIdx === 'number' && Number.isFinite(rawIdx)) {
      lookup.set(rawIdx, caption);
    }
  });
  return lookup;
}

function captionFromMissionLookup(
  meta: Record<string, unknown>,
  content: Record<string, unknown>,
  lookup?: ReadonlyMap<string, string>,
): string {
  if (!lookup?.size) return '';
  const missionId = pickStr(meta.mission_id, meta.missionId, content.mission_id, content.missionId);
  const ideaIndex = meta.idea_index ?? meta.ideaIndex ?? content.idea_index ?? content.ideaIndex;
  if (!missionId || ideaIndex == null || ideaIndex === '') return '';
  const key = `${missionId}:${Number(ideaIndex)}`;
  return pickStr(lookup.get(key));
}

function isPublishableIdeationCaption(text: string): boolean {
  const t = pickStr(text);
  if (!t) return false;
  if (isVisionAnalysisDescription(t)) return false;
  if (isGalleryDerivedCaption(t)) return false;
  if (isGalleryTagHeadline(t)) return false;
  if (ATMOSFER_PREFIX_RE.test(t) && t.length < 40) return false;
  return true;
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

/**
 * Feed UI headline line — only for designed posts (on-canvas copy preview).
 * Organic gallery posts: Instagram has no separate headline; caption carries the message.
 */
export function resolveFeedDisplayHeadline(input: FeedCaptionInput): string {
  const content = input.content ?? {};
  const meta = input.metadata ?? {};
  const brandName = pickStr(meta.brand_name, content.brand_name);

  if (!isDesignedPostArtifact(meta)) {
    return '';
  }

  const caption = pickStr(
    meta.ideation_caption,
    meta.caption_draft,
    content.caption_draft,
    content.caption,
    meta.caption,
  );

  const candidates = [
    meta.design_overlay_headline,
    content.design_overlay_headline,
    meta.ideation_headline,
    content.ideation_headline,
    content.headline,
    meta.headline,
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
export function resolveFeedDisplayCaption(
  input: FeedCaptionInput,
  missionIdeationLookup?: ReadonlyMap<string, string>,
): string {
  const content = input.content ?? {};
  const meta = input.metadata ?? {};
  const missionCaption = pickStr(
    input.missionIdeationCaption,
    captionFromMissionLookup(meta, content, missionIdeationLookup),
  );

  const candidates: unknown[] = [
    missionCaption,
    meta.ideation_caption,
    content.ideation_caption,
    meta.caption_draft,
    content.caption_draft,
    meta.original_caption,
    content.original_caption,
  ];

  const captionSource = pickStr(meta.caption_source, content.caption_source);
  const gallerySourcedCaption = captionSource === 'gallery_meta' || captionSource === 'gallery_gpt';
  if (!gallerySourcedCaption) {
    candidates.push(content.caption, meta.caption);
  }

  for (const raw of candidates) {
    const t = pickStr(raw);
    if (!isPublishableIdeationCaption(t)) continue;
    return t;
  }

  if (hasIdeationCopy(meta, content) || missionCaption) {
    return '';
  }

  const hooks = meta.caption_hooks ?? meta.captionHooks ?? content.caption_hooks;
  const hook = pickTurkishCaptionHook(hooks);
  if (hook && isPublishableIdeationCaption(hook)) return hook;

  const rawStored = pickStr(content.caption, meta.caption);
  if (rawStored && isVisionAnalysisDescription(rawStored)) {
    const brandName = pickStr(meta.brand_name, content.brand_name, input.title) || '';
    const salvaged = salvageCaptionFromVisionBlob(rawStored, brandName);
    if (salvaged && isPublishableIdeationCaption(salvaged)) return salvaged;
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
