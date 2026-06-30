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
  const headline = idea.title ?? idea.headline ?? '';
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

  const artPc = (idea.visualProductionSpec as Record<string, unknown> | undefined)?.premiumComposition as Record<string, unknown> | undefined;
  const artPremium = artPc && typeof artPc.compositionType === 'string'
    ? {
        compositionType: artPc.compositionType as string,
        visualPriority: artPc.visualPriority as string | undefined,
        typographyApproach: artPc.typographyApproach as string | undefined,
        objectTreatment: artPc.objectTreatment as string | undefined,
        graphicElements: artPc.graphicElements as string[] | undefined,
        layoutStrategy: artPc.layoutStrategy as string | undefined,
        compositionDescription: artPc.compositionDescription as string | undefined,
        creativeDirection: artPc.creativeDirection as string | undefined,
        premiumScore: artPc.premiumScore as number | undefined,
        visualStory: artPc.visualStory as string | undefined,
        motionApproach: artPc.motionApproach as string | undefined,
      }
    : undefined;

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
      premiumComposition: artPremium ?? null,
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

export function firstStr(rec: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const s = str(rec[k]);
    if (s) return s;
  }
  return '';
}

/**
 * Planning title from mission ideation — matches Mission Hub cards and feeds
 * Remotion stories, posters, and feed overlay copy (not caption CTA hooks).
 * Prefers `headline` over `concept_title` because headlines are more likely
 * to be complete marketing sentences suitable for story overlays.
 */
export function resolveIdeationHeadline(rec: Record<string, unknown>): string {
  // strategic_purpose is internal agent briefing — never use as display headline.
  return firstStr(
    rec,
    'headline',
    'hook',
    'concept_title',
    'conceptTitle',
    'idea_title',
    'ideaTitle',
    'title',
    'subline',
  );
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
  const headline = resolveIdeationHeadline(rec);
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
  const subline = firstStr(rec, 'subline', 'tagline');
  if (!canvaFieldCopy.subtitle && subline) canvaFieldCopy.subtitle = subline;

  const hashtags = Array.isArray(rec.hashtags)
    ? rec.hashtags.map((h) => String(h).trim()).filter(Boolean)
    : [];
  const eventDate = firstStr(rec, 'event_date', 'eventDate', 'date_suggestion');
  const location = firstStr(rec, 'location');

  const selectedGalleryUrl =
    (vpsRaw ? str(vpsRaw.selected_gallery_url) || str(vpsRaw.selectedGalleryUrl) : null)
    || str(rec.selected_gallery_url)
    || null;
  const imageEditPrompt = (vpsRaw
    ? str(vpsRaw.image_edit_prompt) || str(vpsRaw.imageEditPrompt)
    : '') || firstStr(rec, 'visual_direction', 'image_prompt');

  const pcRaw = vpsRaw?.premium_composition as Record<string, unknown> | undefined;
  const premiumComposition = pcRaw && typeof pcRaw.composition_type === 'string'
    ? {
        compositionType: pcRaw.composition_type as string,
        visualPriority: str(pcRaw.visual_priority) || undefined,
        typographyApproach: str(pcRaw.typography_approach) || undefined,
        objectTreatment: str(pcRaw.object_treatment) || undefined,
        graphicElements: Array.isArray(pcRaw.graphic_elements)
          ? (pcRaw.graphic_elements as string[])
          : undefined,
        layoutStrategy: str(pcRaw.layout_strategy) || undefined,
        compositionDescription: str(pcRaw.composition_description) || undefined,
        creativeDirection: str(pcRaw.creative_direction) || undefined,
        premiumScore: typeof pcRaw.premium_score === 'number' ? pcRaw.premium_score : undefined,
        visualStory: str(pcRaw.visual_story) || undefined,
        motionApproach: str(pcRaw.motion_approach) || undefined,
      }
    : undefined;

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
      premiumComposition: premiumComposition ?? null,
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
          ...(vps.premiumComposition ? {
            premium_composition: {
              composition_type: vps.premiumComposition.compositionType,
              visual_priority: vps.premiumComposition.visualPriority,
              typography_approach: vps.premiumComposition.typographyApproach,
              object_treatment: vps.premiumComposition.objectTreatment,
              graphic_elements: vps.premiumComposition.graphicElements,
              layout_strategy: vps.premiumComposition.layoutStrategy,
              composition_description: vps.premiumComposition.compositionDescription,
              creative_direction: vps.premiumComposition.creativeDirection,
              premium_score: vps.premiumComposition.premiumScore,
              visual_story: vps.premiumComposition.visualStory,
              motion_approach: vps.premiumComposition.motionApproach,
            },
          } : {}),
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
