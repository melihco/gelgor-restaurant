/**
 * Parse and match `visual_design_cards` mission node outputs for downstream production.
 */

import { extractObjectArrayFromSummary } from '@/lib/output-summary-array';

export interface MissionVisualDesignCard {
  card_type?: string;
  format?: string;
  concept_title?: string;
  background_reference_url?: string;
  background_intent?: string;
  overlay_color?: string;
  overlay_opacity?: number | string;
  headline?: string;
  subline?: string;
  cta_text?: string;
  cta_style?: string;
  cta_color?: string;
  text_color?: string;
  typography_style?: string;
  logo_position?: string;
  visual_mood?: string;
  strategic_purpose?: string;
  image_generation_prompt?: string;
  canva_field_mapping?: Record<string, string> | string;
  photo_url?: string;
  accent_color?: string;
  primary_color?: string;
  canvas_spec?: Record<string, unknown>;
}

function toCard(item: Record<string, unknown>): MissionVisualDesignCard | null {
  const prompt = String(item.image_generation_prompt ?? '').trim();
  const headline = String(item.headline ?? item.concept_title ?? item.title ?? '').trim();
  if (!prompt && !headline) return null;
  return {
    card_type: typeof item.card_type === 'string' ? item.card_type : undefined,
    format: typeof item.format === 'string' ? item.format : undefined,
    concept_title: typeof item.concept_title === 'string' ? item.concept_title : undefined,
    background_reference_url: typeof item.background_reference_url === 'string' ? item.background_reference_url : undefined,
    background_intent: typeof item.background_intent === 'string' ? item.background_intent : undefined,
    overlay_color: typeof item.overlay_color === 'string' ? item.overlay_color : undefined,
    overlay_opacity: typeof item.overlay_opacity === 'string' || typeof item.overlay_opacity === 'number'
      ? item.overlay_opacity
      : undefined,
    headline: headline || undefined,
    subline: typeof item.subline === 'string' ? item.subline : undefined,
    cta_text: typeof item.cta_text === 'string' ? item.cta_text : undefined,
    cta_style: typeof item.cta_style === 'string' ? item.cta_style : undefined,
    cta_color: typeof item.cta_color === 'string' ? item.cta_color : undefined,
    text_color: typeof item.text_color === 'string' ? item.text_color : undefined,
    typography_style: typeof item.typography_style === 'string' ? item.typography_style : undefined,
    logo_position: typeof item.logo_position === 'string' ? item.logo_position : undefined,
    visual_mood: typeof item.visual_mood === 'string' ? item.visual_mood : undefined,
    strategic_purpose: typeof item.strategic_purpose === 'string' ? item.strategic_purpose : undefined,
    image_generation_prompt: prompt || undefined,
    canva_field_mapping: typeof item.canva_field_mapping === 'string' || (item.canva_field_mapping && typeof item.canva_field_mapping === 'object')
      ? item.canva_field_mapping as Record<string, string> | string
      : undefined,
    photo_url: typeof item.photo_url === 'string' ? item.photo_url : undefined,
    accent_color: typeof item.accent_color === 'string' ? item.accent_color : undefined,
    primary_color: typeof item.primary_color === 'string' ? item.primary_color : undefined,
    canvas_spec: item.canvas_spec && typeof item.canvas_spec === 'object'
      ? item.canvas_spec as Record<string, unknown>
      : undefined,
  };
}

export function parseMissionVisualDesignCards(
  outputSummary: string | null | undefined,
): MissionVisualDesignCard[] {
  if (!outputSummary?.trim()) return [];
  return extractObjectArrayFromSummary(outputSummary)
    .map(toCard)
    .filter((card): card is MissionVisualDesignCard => Boolean(card))
    .slice(0, 8);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

function scoreCardForIdea(
  card: MissionVisualDesignCard,
  idea: Record<string, unknown>,
): number {
  const ideaBlob = [
    idea.headline,
    idea.concept_title,
    idea.idea_title,
    idea.caption_draft,
    idea.caption,
    idea.strategic_purpose,
    idea.mood,
  ].map((v) => String(v ?? '')).join(' ');
  const cardBlob = [
    card.headline,
    card.concept_title,
    card.subline,
    card.visual_mood,
    card.strategic_purpose,
  ].map((v) => String(v ?? '')).join(' ');

  const ideaTokens = new Set(tokenize(ideaBlob));
  const cardTokens = tokenize(cardBlob);
  let score = 0;
  for (const token of cardTokens) {
    if (ideaTokens.has(token)) score += 2;
  }

  const fmt = String(idea.content_type ?? idea.content_kind ?? idea.format ?? '').toLowerCase();
  const cardFmt = String(card.format ?? '').toLowerCase();
  const bothPostish = (!fmt || fmt.includes('post') || fmt.includes('carousel')) && (!cardFmt || cardFmt.includes('post') || cardFmt.includes('1x1') || cardFmt.includes('4x5'));
  if (bothPostish) score += 1;
  return score;
}

export function pickMissionVisualDesignCard(params: {
  cards: MissionVisualDesignCard[];
  idea: Record<string, unknown>;
  usedIndices: Set<number>;
  designedPostOrdinal: number;
}): { card: MissionVisualDesignCard; index: number } | null {
  const { cards, idea, usedIndices, designedPostOrdinal } = params;
  if (!cards.length) return null;

  let bestIndex = -1;
  let bestScore = -1;
  cards.forEach((card, index) => {
    if (usedIndices.has(index)) return;
    const score = scoreCardForIdea(card, idea);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  if (bestIndex >= 0 && bestScore > 0) {
    return { card: cards[bestIndex]!, index: bestIndex };
  }

  const fallbackIndex = cards.findIndex((_, index) => !usedIndices.has(index) && index >= designedPostOrdinal);
  if (fallbackIndex >= 0) {
    return { card: cards[fallbackIndex]!, index: fallbackIndex };
  }

  const firstUnused = cards.findIndex((_, index) => !usedIndices.has(index));
  return firstUnused >= 0 ? { card: cards[firstUnused]!, index: firstUnused } : null;
}
