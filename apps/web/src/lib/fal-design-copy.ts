/**
 * Mission Fal design copy — on-canvas headline/subtitle for designed posts.
 *
 * Ideation `headline` is often a calendar/signal label ("Yaz sezonu", "15 Temmuz anması").
 * Overlay text must be a short, caption-aligned marketing line in the caption's language.
 */

import {
  detectOverlayLocale,
  resolveFalDisplayHeadline,
  resolveFalOverlayCopy,
  resolveFalProductionOverlayHeadline,
  resolveFalSubtitle,
  type OverlayLocale,
} from '@/lib/fal-caption-headline';
import {
  isLabelStyleHeadline,
  isMeaninglessBrandEchoHeadline,
  resolveMeaningfulProductionHeadline,
} from '@/lib/production-headline-quality';

export interface FalDesignCopyIdea {
  headline?: string;
  caption?: string;
  caption_draft?: string;
  cta?: string;
  call_to_action?: string;
  subline?: string;
  canva_field_copy?: Record<string, unknown> | null;
  canvaFieldCopy?: Record<string, unknown> | null;
  visual_production_spec?: {
    text_layers?: { title?: string; subtitle?: string; cta?: string } | null;
  } | null;
}

function strField(obj: Record<string, unknown> | null | undefined, ...keys: string[]): string {
  if (!obj) return '';
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/** Pull purpose-built overlay fields from ideation (canva_field_copy / text_layers). */
export function extractIdeationDesignCopy(idea: FalDesignCopyIdea): {
  headline: string;
  subtitle: string;
  source: 'canva_field_copy' | 'text_layers' | 'none';
} {
  const canva = (idea.canva_field_copy ?? idea.canvaFieldCopy) as Record<string, unknown> | null;
  const fromCanvaHeadline = strField(canva, 'headline', 'title', 'heading');
  const fromCanvaSub = strField(canva, 'subtitle', 'subline', 'supporting', 'tagline');
  const fromCanvaCta = strField(canva, 'cta', 'cta_text', 'button');
  if (fromCanvaHeadline) {
    return {
      headline: fromCanvaHeadline,
      subtitle: fromCanvaSub || fromCanvaCta,
      source: 'canva_field_copy',
    };
  }

  const layers = idea.visual_production_spec?.text_layers;
  if (layers && typeof layers === 'object') {
    const title = String(layers.title ?? '').trim();
    const sub = String(layers.subtitle ?? layers.cta ?? '').trim();
    if (title) {
      return { headline: title, subtitle: sub, source: 'text_layers' };
    }
  }

  return { headline: '', subtitle: '', source: 'none' };
}

function localesClash(captionLoc: OverlayLocale, headlineLoc: OverlayLocale): boolean {
  if (captionLoc === 'unknown' || headlineLoc === 'unknown') return false;
  return captionLoc !== headlineLoc;
}

/**
 * Resolve on-canvas design copy for Fal / GPT designed slots.
 * Priority: canva_field_copy → caption-derived hook (when ideation is label/locale-bad)
 * → cleaned ideation → resolveFalOverlayCopy.
 */
export function resolveMissionFalDesignCopy(input: {
  idea: FalDesignCopyIdea;
  ideationHeadline: string;
  caption: string;
  cta?: string;
  brandName: string;
  channel: 'reel' | 'feed_post' | 'story';
  businessType?: string;
}): {
  headline: string;
  subtitle?: string;
  source: string;
} {
  const caption = input.caption.trim();
  const brandName = input.brandName.trim();
  const channel = input.channel;
  const captionLoc = detectOverlayLocale(caption);
  const maxLen = channel === 'reel' ? 22 : channel === 'story' ? 28 : 32;

  const extracted = extractIdeationDesignCopy(input.idea);
  if (extracted.headline) {
    const bad =
      isLabelStyleHeadline(extracted.headline)
      || isMeaninglessBrandEchoHeadline(extracted.headline, brandName)
      || localesClash(captionLoc, detectOverlayLocale(extracted.headline));
    if (!bad) {
      const overlay = resolveFalOverlayCopy({
        headline: extracted.headline,
        cta: extracted.subtitle || input.cta,
        caption,
        channel,
        lockIdeationCopy: true,
      });
      return { ...overlay, source: extracted.source };
    }
  }

  const ideation = input.ideationHeadline.trim();
  const ideationBad =
    !ideation
    || isLabelStyleHeadline(ideation)
    || isMeaninglessBrandEchoHeadline(ideation, brandName)
    || localesClash(captionLoc, detectOverlayLocale(ideation));

  if (ideationBad && caption.length >= 24) {
    const fromCaption = resolveFalDisplayHeadline({
      caption,
      missionTitle: ideation || brandName,
      brandName,
      cta: input.cta,
      maxLen,
    });
    let headline = resolveFalProductionOverlayHeadline(
      fromCaption.headline,
      [ideation, caption.split(/[.!?\n]/)[0]?.trim() ?? ''].filter(Boolean),
      channel,
    );
    if (!headline || isLabelStyleHeadline(headline)) {
      const qa = resolveMeaningfulProductionHeadline({
        headline: '',
        caption,
        brandName,
        businessType: input.businessType,
        maxLen,
      });
      headline = resolveFalProductionOverlayHeadline(qa.headline, [], channel);
    }
    const subtitle = resolveFalSubtitle({
      caption,
      headline,
      cta: input.cta || String(input.idea.subline ?? '').trim() || undefined,
    }) ?? undefined;
    const overlay = resolveFalOverlayCopy({
      headline,
      cta: subtitle || input.cta,
      caption,
      channel,
      lockIdeationCopy: true,
    });
    return { ...overlay, source: 'caption_design_copy' };
  }

  const overlay = resolveFalOverlayCopy({
    headline: ideation,
    cta: input.cta || String(input.idea.subline ?? '').trim() || undefined,
    caption,
    channel,
    lockIdeationCopy: true,
  });

  // Final safety: if locked ideation still looks like a label, force caption path.
  if (overlay.headline && isLabelStyleHeadline(overlay.headline) && caption.length >= 24) {
    const forced = resolveFalDisplayHeadline({
      caption,
      missionTitle: overlay.headline,
      brandName,
      cta: input.cta,
      maxLen,
    });
    const headline = resolveFalProductionOverlayHeadline(forced.headline, [overlay.headline], channel);
    if (headline && !isLabelStyleHeadline(headline)) {
      return {
        headline,
        subtitle: resolveFalSubtitle({ caption, headline, cta: input.cta }) ?? undefined,
        source: 'caption_design_copy_rescue',
      };
    }
  }

  return { ...overlay, source: 'ideation_locked' };
}
