/**
 * Maps Creative Director output → Remotion catalog templateId + layout patches.
 */
import type { ContentIntent } from './brand-motion-profile';
import type { StoryCompositionId } from '@/remotion/types';
import {
  REMOTION_FAMILY_META,
  listTemplatesByFamily,
  listTemplatesForIntent,
  getRemotionTemplate,
} from './remotion-template-catalog';
import type { RemotionLayoutFamily, RemotionLayoutSpec } from './remotion-template-types';
import { resolveTemplateId } from './remotion-template-registry';

export const LAYOUT_FAMILY_IDS = REMOTION_FAMILY_META.map((f) => f.family);

const LEGACY_TO_FAMILY: Partial<Record<StoryCompositionId, RemotionLayoutFamily>> = {
  EditorialStory: 'editorial_bottom',
  MagazineCoverStory: 'magazine_cover',
  LuxurySplitStory: 'split_panel',
  CinematicStory: 'cinematic_center',
  CampaignHeroStory: 'campaign_hero',
  GallerySeriesStory: 'gallery_series',
  EventAnnouncementStory: 'event_ticket',
};

export interface CreativeDirectorLayoutOverrides {
  duotoneWash?: RemotionLayoutSpec['duotoneWash'];
  duotoneOpacity?: number;
  vignette?: RemotionLayoutSpec['vignette'];
  heroUppercase?: boolean;
  heroTracking?: number;
  heroScale?: number;
  gradientStart?: number;
  gradientEnd?: number;
  accentLine?: RemotionLayoutSpec['accentLine'];
  frame?: RemotionLayoutSpec['frame'];
  fontPersonality?: RemotionLayoutSpec['fontPersonality'];
  showCtaPill?: boolean;
  frostedCard?: boolean;
}

export interface CreativeDirectorRoutingInput {
  layoutFamily?: RemotionLayoutFamily;
  variantIndex?: number;
  compositionId?: StoryCompositionId;
  currentTemplateId?: string;
  intent?: ContentIntent;
  sector?: string;
  galleryPhotoCount?: number;
}

export function compositionToLayoutFamily(compositionId?: StoryCompositionId): RemotionLayoutFamily | undefined {
  if (!compositionId) return undefined;
  return LEGACY_TO_FAMILY[compositionId];
}

function scoreTemplate(
  templateId: string,
  intent?: ContentIntent,
  sector?: string,
): number {
  const tpl = getRemotionTemplate(templateId);
  if (!tpl) return 0;
  let score = 0;
  if (intent && tpl.bestFor.includes(intent)) score += 3;
  if (sector) {
    const norm = sector.toLowerCase().replace(/\s+/g, '_');
    if (tpl.sectors.some((s) => norm.includes(s) || s.includes(norm.split('_')[0] ?? ''))) score += 2;
  }
  return score;
}

export function resolveTemplateFromDirector(input: CreativeDirectorRoutingInput): string {
  const family = input.layoutFamily
    ?? compositionToLayoutFamily(input.compositionId)
    ?? getRemotionTemplate(input.currentTemplateId ?? '')?.family;

  if (family) {
    const pool = listTemplatesByFamily(family);
    if (pool.length) {
      const idx = Math.max(0, Math.min(pool.length - 1, input.variantIndex ?? 0));
      const ranked = [...pool].sort((a, b) => scoreTemplate(b.id, input.intent, input.sector) - scoreTemplate(a.id, input.intent, input.sector));
      return ranked[idx]?.id ?? ranked[0]!.id;
    }
  }

  if (input.currentTemplateId && getRemotionTemplate(input.currentTemplateId)) {
    return input.currentTemplateId;
  }

  if (input.intent) {
    const intentPool = listTemplatesForIntent(input.intent);
    if (intentPool.length) return intentPool[0]!.id;
  }

  return resolveTemplateId({
    templateId: input.currentTemplateId,
    compositionId: input.compositionId,
    intent: input.intent,
    seed: input.variantIndex,
  });
}

export function buildFamilyCatalogForPrompt(): string {
  return REMOTION_FAMILY_META.map((f) =>
    `${f.family} — ${f.nameEn} (${f.collection}): ${f.descTr} | best: ${f.bestFor.join(', ')}`,
  ).join('\n');
}

export function clampLayoutOverrides(raw: Record<string, unknown> | undefined): CreativeDirectorLayoutOverrides {
  if (!raw || typeof raw !== 'object') return {};
  const out: CreativeDirectorLayoutOverrides = {};
  const wash = raw.duotoneWash;
  if (wash === 'none' || wash === 'warm' || wash === 'cool' || wash === 'primary') {
    out.duotoneWash = wash;
  }
  if (typeof raw.duotoneOpacity === 'number') {
    out.duotoneOpacity = Math.max(0.1, Math.min(0.65, raw.duotoneOpacity));
  }
  const vig = raw.vignette;
  if (vig === 'none' || vig === 'soft' || vig === 'noir' || vig === 'radial') {
    out.vignette = vig;
  }
  if (typeof raw.heroUppercase === 'boolean') out.heroUppercase = raw.heroUppercase;
  if (typeof raw.heroTracking === 'number') {
    out.heroTracking = Math.max(0, Math.min(0.2, raw.heroTracking));
  }
  if (typeof raw.heroScale === 'number') {
    out.heroScale = Math.max(0.75, Math.min(1.35, raw.heroScale));
  }
  if (typeof raw.gradientStart === 'number') {
    out.gradientStart = Math.max(0.25, Math.min(0.75, raw.gradientStart));
  }
  if (typeof raw.gradientEnd === 'number') {
    out.gradientEnd = Math.max(0.55, Math.min(0.95, raw.gradientEnd));
  }
  const accent = raw.accentLine;
  if (accent === 'none' || accent === 'above' || accent === 'left_bar' || accent === 'both' || accent === 'underline') {
    out.accentLine = accent;
  }
  const frame = raw.frame;
  if (frame === 'none' || frame === 'thin' || frame === 'double' || frame === 'inset') {
    out.frame = frame;
  }
  const font = raw.fontPersonality;
  if (font === 'brand' || font === 'serif_editorial' || font === 'sans_modern' || font === 'display_bold' || font === 'script') {
    out.fontPersonality = font;
  }
  if (typeof raw.showCtaPill === 'boolean') out.showCtaPill = raw.showCtaPill;
  if (typeof raw.frostedCard === 'boolean') out.frostedCard = raw.frostedCard;
  return out;
}
