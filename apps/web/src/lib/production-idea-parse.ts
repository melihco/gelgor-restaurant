/**
 * Unified idea parsing (Sprint 3 / ICS).
 *
 * Single entry point that turns a raw content_ideation `output_summary` string
 * into normalised `ProductionIdea[]`. It reuses the battle-tested
 * `signalFromArtifact` parser (which already maps every snake_case alias and
 * preserves `canvaFieldCopy` + `visualProductionSpec`) and converts each
 * `ArtifactIdea` into the convergence type so downstream code (ICS scoring,
 * renderer prompt building) has one shape to depend on.
 *
 * See docs/foundation-sprint-program.md § Sprint 3.
 */

import { signalFromArtifact, type ArtifactIdea } from '@/components/artifacts/artifact-preview';
import type {
  ProductionIdea,
  ProductionFormat,
  ProductionRenderer,
  VisualTreatment,
} from '@/types/production-idea';

function deriveFormat(contentType: string): ProductionFormat {
  const c = contentType.toLowerCase();
  if (c.includes('story')) return 'story';
  if (c.includes('reel')) return 'reel';
  if (c.includes('carousel')) return 'carousel';
  if (c.includes('feed')) return 'feed';
  return 'post';
}

function deriveRenderer(treatment: VisualTreatment | undefined): ProductionRenderer {
  switch (treatment) {
    case 'event_announcement':
      return 'announcement';
    case 'feed_text_overlay':
    case 'story_event':
      return 'canva';
    case 'pure_photo':
    default:
      return 'photo';
  }
}

/** Convert a parsed ArtifactIdea (camelCase, lossless) into a ProductionIdea. */
export function productionIdeaFromArtifact(
  idea: ArtifactIdea,
  index = 0,
  missionId?: string,
): ProductionIdea {
  const headline = idea.headline ?? idea.title ?? '';
  const contentType = idea.contentType ?? 'post';
  const treatment = idea.visualProductionSpec?.treatment;

  // Prefer agent-provided design copy; synthesise a minimal headline/cta fallback
  // so ICS reflects "do we have design copy to render", not just raw agent output.
  const agentCopy = idea.canvaFieldCopy && Object.keys(idea.canvaFieldCopy).length > 0
    ? idea.canvaFieldCopy
    : undefined;
  const canvaFieldCopy: Record<string, string> = agentCopy
    ? { ...agentCopy }
    : {};
  if (!canvaFieldCopy.headline && headline) canvaFieldCopy.headline = headline;
  if (!canvaFieldCopy.cta && idea.cta) canvaFieldCopy.cta = idea.cta;

  return {
    id: `${missionId ?? 'idea'}-${index}`,
    missionId,
    headline,
    caption: idea.caption ?? '',
    cta: idea.cta ?? '',
    hashtags: idea.hashtags ?? [],
    contentType,
    format: deriveFormat(contentType),
    templateUseCase: idea.templateUseCase ?? '',
    primaryRenderer: deriveRenderer(treatment),
    visualProductionSpec: {
      treatment: treatment ?? 'pure_photo',
      selectedGalleryUrl: idea.visualProductionSpec?.selectedGalleryUrl ?? null,
      imageEditPrompt: idea.visualProductionSpec?.imageEditPrompt ?? idea.visualDirection ?? '',
      shotType: undefined,
      includePeople: undefined,
    },
    canvaFieldCopy,
    eventDetails: idea.eventDate
      ? { eventDate: idea.eventDate, location: idea.location }
      : undefined,
    assetIntent: idea.assetIntent,
    postingTime: idea.postingTime,
  };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function firstStr(rec: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const s = str(rec[k]);
    if (s) return s;
  }
  return '';
}

/**
 * Convert an already-parsed raw idea record (snake_case, as flows into
 * AutoProductionFeed / IdeaCard) into a normalised ProductionIdea. Reads the
 * same field aliases the renderers use, preserving canvaFieldCopy + VPS that
 * Sprint 3's artifactIdeaToRecord now emits.
 */
export function productionIdeaFromRecord(
  rec: Record<string, unknown>,
  index = 0,
  missionId?: string,
): ProductionIdea {
  const headline = firstStr(rec, 'headline', 'concept_title', 'title');
  const contentType = firstStr(rec, 'content_type', 'content_kind') || 'post';

  const vpsRaw = (rec.visual_production_spec ?? rec.visualProductionSpec) as
    | Record<string, unknown>
    | undefined;
  const treatmentRaw = vpsRaw ? str(vpsRaw.treatment) : '';
  const treatment = (['pure_photo', 'story_event', 'feed_text_overlay', 'event_announcement']
    .includes(treatmentRaw) ? treatmentRaw : 'pure_photo') as VisualTreatment;

  const rawCopy = (rec.canva_field_copy ?? rec.canvaFieldCopy) as
    | Record<string, unknown>
    | undefined;
  const canvaFieldCopy: Record<string, string> = {};
  if (rawCopy && typeof rawCopy === 'object') {
    for (const [k, v] of Object.entries(rawCopy)) {
      if (typeof v === 'string' && v.trim()) canvaFieldCopy[k] = v.trim();
    }
  }
  if (!canvaFieldCopy.headline && headline) canvaFieldCopy.headline = headline;
  const cta = firstStr(rec, 'cta', 'call_to_action');
  if (!canvaFieldCopy.cta && cta) canvaFieldCopy.cta = cta;

  const hashtags = Array.isArray(rec.hashtags)
    ? rec.hashtags.map((h) => String(h).trim()).filter(Boolean)
    : [];
  const eventDate = firstStr(rec, 'event_date', 'eventDate', 'date_suggestion');
  const location = firstStr(rec, 'location');

  const selectedGalleryUrl = vpsRaw
    ? str(vpsRaw.selected_gallery_url) || str(vpsRaw.selectedGalleryUrl) || null
    : null;
  const imageEditPrompt = (vpsRaw
    ? str(vpsRaw.image_edit_prompt) || str(vpsRaw.imageEditPrompt)
    : '') || firstStr(rec, 'visual_direction', 'image_prompt');

  return {
    id: `${missionId ?? 'idea'}-${index}`,
    missionId,
    headline,
    caption: firstStr(rec, 'caption_draft', 'caption'),
    cta,
    hashtags,
    contentType,
    format: deriveFormat(contentType),
    templateUseCase: firstStr(rec, 'template_use_case', 'templateUseCase'),
    primaryRenderer: deriveRenderer(treatment),
    visualProductionSpec: {
      treatment,
      selectedGalleryUrl: selectedGalleryUrl || null,
      imageEditPrompt,
    },
    canvaFieldCopy,
    eventDetails: eventDate ? { eventDate, location: location || undefined } : undefined,
    assetIntent: firstStr(rec, 'asset_intent', 'assetIntent', 'asset_recommendation') || undefined,
    postingTime: firstStr(rec, 'posting_time_suggestion'),
  };
}

/**
 * Serialise a ProductionIdea back to the snake_case record shape the existing
 * Canva signal builder + renderer APIs consume — with NO field loss.
 */
export function productionIdeaToRecord(idea: ProductionIdea): Record<string, unknown> {
  const vps = idea.visualProductionSpec;
  return {
    headline: idea.headline,
    concept_title: idea.headline,
    title: idea.headline,
    caption_draft: idea.caption,
    caption: idea.caption,
    cta: idea.cta,
    hashtags: idea.hashtags,
    content_type: idea.contentType,
    content_kind: idea.contentType,
    template_use_case: idea.templateUseCase || undefined,
    asset_intent: idea.assetIntent || undefined,
    event_date: idea.eventDetails?.eventDate || undefined,
    location: idea.eventDetails?.location || undefined,
    strategic_purpose: idea.canvaFieldCopy.subtitle || undefined,
    posting_time_suggestion: idea.postingTime || undefined,
    canva_field_copy: idea.canvaFieldCopy,
    canvaFieldCopy: idea.canvaFieldCopy,
    visual_production_spec: vps
      ? {
          treatment: vps.treatment,
          selected_gallery_url: vps.selectedGalleryUrl ?? undefined,
          image_edit_prompt: vps.imageEditPrompt || undefined,
        }
      : undefined,
    selected_gallery_url: vps?.selectedGalleryUrl ?? undefined,
  };
}

/**
 * Parse a raw content_ideation output string into ProductionIdea[].
 * Returns [] when nothing parseable is found (never throws).
 */
/** Normalise an array of raw idea records (auto-produce / executor payload). */
export function productionIdeasFromParsed(
  ideas: Record<string, unknown>[],
  missionId?: string,
): ProductionIdea[] {
  return ideas.map((rec, idx) => productionIdeaFromRecord(rec, idx, missionId));
}

export function parseProductionIdeas(
  outputSummary: string | null | undefined,
  missionId?: string,
): ProductionIdea[] {
  if (!outputSummary || !outputSummary.trim()) return [];
  try {
    const signal = signalFromArtifact({
      content: outputSummary,
      artifactType: 'instagram_caption',
      title: 'Content ideation',
    });
    const ideas = (signal.ideas ?? []).filter(
      (i) => Boolean(i.caption?.trim() || i.headline?.trim() || i.title?.trim()),
    );
    return ideas.map((idea, idx) => productionIdeaFromArtifact(idea, idx, missionId));
  } catch {
    return [];
  }
}
