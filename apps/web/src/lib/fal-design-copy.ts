/**
 * Mission Fal design copy — on-canvas headline/subtitle for designed posts.
 *
 * Ideation `headline` is often a calendar/signal label ("Yaz sezonu", "15 Temmuz anması").
 * Overlay text must be a short, caption-aligned marketing line in the caption's language.
 *
 * Priority (feed): canva_field_copy / text_layers → calendar tagline → punchy ideation
 * title → caption-derived complete sentence (never mid-phrase 32-char stubs).
 */

import {
  detectOverlayLocale,
  FAL_FEED_OVERLAY_MAX_CHARS,
  isIncompleteOverlayPhrase,
  isMeaningfulFalOverlayText,
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
import { rebiasUngroundedOverlayCopy } from '@/lib/overlay-caption-grounding';
import { preferBrandToneHeadline } from '@/lib/brand-tone-headline';

export interface FalDesignCopyIdea {
  headline?: string;
  concept_title?: string;
  title?: string;
  tagline?: string;
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

function isPublishableOverlayLine(
  line: string,
  brandName: string,
  captionLoc: OverlayLocale,
): boolean {
  const clean = line.trim();
  if (!clean || clean.length < 8) return false;
  if (isLabelStyleHeadline(clean)) return false;
  if (isMeaninglessBrandEchoHeadline(clean, brandName)) return false;
  if (isIncompleteOverlayPhrase(clean)) return false;
  if (localesClash(captionLoc, detectOverlayLocale(clean))) return false;
  return true;
}

function finalizeMissionOverlay(input: {
  headline: string;
  cta?: string;
  caption: string;
  channel: 'reel' | 'feed_post' | 'story';
  brandName: string;
  businessType?: string;
  brandTone?: string;
  lockIdeationCopy?: boolean;
}): { headline: string; subtitle?: string } {
  const overlay = resolveFalOverlayCopy({
    headline: input.headline,
    cta: input.cta,
    caption: input.caption,
    channel: input.channel,
    lockIdeationCopy: input.lockIdeationCopy,
    brandName: input.brandName,
    businessType: input.businessType,
  });
  const rebased = rebiasUngroundedOverlayCopy({
    headline: overlay.headline,
    subtitle: overlay.subtitle,
    caption: input.caption,
    brandName: input.brandName,
    businessType: input.businessType,
    channel: input.channel,
    cta: input.cta,
  });

  // Story/reel: if caption yields a more on-tone hook, prefer it over a flat promo title.
  if (
    (input.channel === 'story' || input.channel === 'reel')
    && input.brandTone?.trim()
    && input.caption.trim().length >= 24
  ) {
    const captionHook = resolveFalDisplayHeadline({
      caption: input.caption,
      missionTitle: rebased.headline,
      brandName: input.brandName,
      cta: input.cta,
      maxLen: input.channel === 'reel' ? 22 : 28,
    }).headline;
    const toned = preferBrandToneHeadline({
      current: rebased.headline,
      alternatives: [captionHook],
      brandTone: input.brandTone,
    });
    if (toned && toned !== rebased.headline) {
      return {
        headline: resolveFalProductionOverlayHeadline(toned, [rebased.headline], input.channel),
        subtitle: rebased.subtitle,
      };
    }
  }

  return { headline: rebased.headline, subtitle: rebased.subtitle };
}

/**
 * Resolve on-canvas design copy for Fal / GPT designed slots.
 * Priority: canva/calendar marketing line → ideation title → caption sentence.
 */
export function resolveMissionFalDesignCopy(input: {
  idea: FalDesignCopyIdea;
  ideationHeadline: string;
  caption: string;
  cta?: string;
  brandName: string;
  channel: 'reel' | 'feed_post' | 'story';
  businessType?: string;
  brandTone?: string;
  language?: string | null;
}): {
  headline: string;
  subtitle?: string;
  source: string;
} {
  const caption = input.caption.trim();
  const brandName = input.brandName.trim();
  const channel = input.channel;
  const captionLoc = detectOverlayLocale(caption);
  const maxLen = channel === 'reel' ? 22 : channel === 'story' ? 28 : FAL_FEED_OVERLAY_MAX_CHARS;

  const acceptClampedMarketingLine = (line: string): boolean => {
    if (!line || isIncompleteOverlayPhrase(line)) return false;
    if (!isMeaningfulFalOverlayText(line)) return false;
    if (isMeaninglessBrandEchoHeadline(line, brandName)) return false;
    if (localesClash(captionLoc, detectOverlayLocale(line))) return false;
    return true;
  };

  // 1) Purpose-built overlay from canva_field_copy / text_layers (calendar hooks live here).
  // Do NOT run caption rebias — it was replacing full marketing lines with mid-phrase stubs.
  const extracted = extractIdeationDesignCopy(input.idea);
  if (extracted.headline && isPublishableOverlayLine(extracted.headline, brandName, captionLoc)) {
    const headline = resolveFalProductionOverlayHeadline(extracted.headline, [], channel);
    if (headline && acceptClampedMarketingLine(headline)) {
      const subtitle = resolveFalSubtitle({
        caption,
        headline,
        cta: extracted.subtitle || input.cta,
      }) ?? undefined;
      return { headline, subtitle, source: extracted.source };
    }
  }

  // 2) Calendar tagline / subline — often the real marketing sentence.
  const tagline = String(input.idea.tagline ?? input.idea.subline ?? '').trim();
  if (tagline && isPublishableOverlayLine(tagline, brandName, captionLoc)) {
    const headline = resolveFalProductionOverlayHeadline(tagline, [], channel);
    if (headline && acceptClampedMarketingLine(headline)) {
      const subtitle = resolveFalSubtitle({
        caption,
        headline,
        cta: input.cta,
      }) ?? undefined;
      return { headline, subtitle, source: 'calendar_tagline' };
    }
  }

  // 3) Punchy ideation / concept title (not series labels).
  const ideation = input.ideationHeadline.trim()
    || String(input.idea.concept_title ?? input.idea.title ?? input.idea.headline ?? '').trim();
  if (isPublishableOverlayLine(ideation, brandName, captionLoc)) {
    const overlay = finalizeMissionOverlay({
      headline: ideation,
      cta: input.cta || String(input.idea.subline ?? '').trim() || undefined,
      caption,
      channel,
      brandName,
      businessType: input.businessType,
      brandTone: input.brandTone,
      lockIdeationCopy: true,
    });
    if (overlay.headline && !isIncompleteOverlayPhrase(overlay.headline)) {
      return { ...overlay, source: 'ideation_title' };
    }
  }

  // 4) Caption → complete sentence (never mid-phrase stubs).
  if (caption.length >= 24) {
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
    if (!headline || isLabelStyleHeadline(headline) || isIncompleteOverlayPhrase(headline)) {
      const qa = resolveMeaningfulProductionHeadline({
        headline: '',
        caption,
        brandName,
        businessType: input.businessType,
        language: input.language,
        maxLen,
      });
      headline = resolveFalProductionOverlayHeadline(qa.headline, [], channel);
    }
    const subtitle = resolveFalSubtitle({
      caption,
      headline,
      cta: input.cta || String(input.idea.subline ?? '').trim() || undefined,
    }) ?? undefined;
    const overlay = finalizeMissionOverlay({
      headline,
      cta: subtitle || input.cta,
      caption,
      channel,
      brandName,
      businessType: input.businessType,
      brandTone: input.brandTone,
      lockIdeationCopy: true,
    });
    return { ...overlay, source: 'caption_design_copy' };
  }

  const overlay = finalizeMissionOverlay({
    headline: ideation,
    cta: input.cta || String(input.idea.subline ?? '').trim() || undefined,
    caption,
    channel,
    brandName,
    businessType: input.businessType,
    brandTone: input.brandTone,
    lockIdeationCopy: true,
  });

  if (overlay.headline && isLabelStyleHeadline(overlay.headline) && caption.length >= 24) {
    const forced = resolveFalDisplayHeadline({
      caption,
      missionTitle: overlay.headline,
      brandName,
      cta: input.cta,
      maxLen,
    });
    const headline = resolveFalProductionOverlayHeadline(forced.headline, [overlay.headline], channel);
    if (headline && !isLabelStyleHeadline(headline) && !isIncompleteOverlayPhrase(headline)) {
      return {
        headline,
        subtitle: resolveFalSubtitle({ caption, headline, cta: input.cta }) ?? undefined,
        source: 'caption_design_copy_rescue',
      };
    }
  }

  return { ...overlay, source: 'ideation_locked' };
}
