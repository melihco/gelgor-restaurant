/**
 * Mission Fal design copy — on-canvas headline/subtitle for designed posts.
 *
 * Priority: mission tagline (quoted calendar line) → canva_field_copy →
 * caption-aligned short punchline → ideation title (last resort).
 * Overlays stay ≤3–4 words from channel + design intensity paint density.
 */

import {
  detectOverlayLocale,
  extractCaptionThemePunchline,
  FAL_FEED_OVERLAY_MAX_CHARS,
  areFalOverlayTextsRedundant,
  fitMissionOverlayToTemplateBudget,
  isIncompleteOverlayPhrase,
  isMeaningfulFalOverlayText,
  resolveFalDisplayHeadline,
  resolveFalOverlayCopy,
  resolveFalProductionOverlayHeadline,
  resolveFalSubtitle,
  resolveMissionPlannedOverlayLine,
  resolveOverlayHeadlineWordBudget,
  tightenOverlayHeadline,
  type OverlayLocale,
} from '@/lib/fal-caption-headline';
import {
  isLabelStyleHeadline,
  isMeaninglessBrandEchoHeadline,
  isSoullessMenuHourHeadline,
  resolveMeaningfulProductionHeadline,
} from '@/lib/production-headline-quality';
import { rebiasUngroundedOverlayCopy } from '@/lib/overlay-caption-grounding';
import { preferBrandToneHeadline } from '@/lib/brand-tone-headline';
import { resolveIdeationTagline } from '@/lib/production-idea-parse';

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

/** Strip wrapping quotes from calendar punchlines: "Hadi tatlarına bak!" → Hadi tatlarına bak! */
export function unwrapQuotedOverlayLine(line: string): string {
  const clean = line.trim();
  const m = clean.match(/^[«"„“‘'](.+?)[»"”’']$/);
  return (m?.[1] ?? clean).trim();
}

const PUNCHLINE_STOP = new Set([
  'bir', 'bu', 've', 'ile', 'için', 'da', 'de', 'ki', 'mi', 'mu', 'mü',
  'the', 'a', 'an', 'and', 'with', 'for', 'our', 'your', 'from', 'to',
  'restoran', 'restaurant', 'cafe', 'café', 'otel', 'hotel', 'beach', 'club',
  'tadın', 'tadini', 'çıkarın', 'cikarin', 'hazır', 'hazir', 'mısın', 'misin',
  'seni', 'sizi', 'bekliyor', 'bekliyoruz', 'gelin', 'gel', 'hemen', 'şimdi',
  'show', 'our', 'capturing', 'highlight', 'highlighting',
]);

/**
 * Theme-aware short hooks from caption — never daypart menu boards.
 * Deterministic; multi-tenant (no brand UUID branches).
 */
export function extractCaptionAlignedPunchline(input: {
  caption: string;
  brandName: string;
  maxWords: number;
  maxLen: number;
}): string {
  const caption = input.caption.trim();
  if (caption.length < 12) return '';

  // Theme punchline first — never a truncated caption sentence.
  const theme = extractCaptionThemePunchline({
    caption,
    maxWords: input.maxWords,
    maxLen: input.maxLen,
  });
  if (
    theme
    && !isSoullessMenuHourHeadline(theme)
    && !isLabelStyleHeadline(theme)
    && !isIncompleteOverlayPhrase(theme)
  ) {
    return theme;
  }

  const brandTokens = input.brandName
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  // Content-word extract across the full caption (not first-sentence dump).
  const cleaned = caption
    .replace(/[\u{1F600}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, ' ')
    .replace(/#\S+/g, ' ')
    .replace(/@\S+/g, ' ')
    .replace(/[.!?\n]+/g, ' ')
    .trim();
  const words = cleaned
    .replace(/[«»"'„“‘’():;[\]{}]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => {
      const lw = w.toLowerCase().replace(/['’].*$/, '');
      if (lw.length < 3) return false;
      if (PUNCHLINE_STOP.has(lw)) return false;
      if (brandTokens.some((b) => lw.includes(b) || b.includes(lw))) return false;
      // Drop ablative/case-dangling stems that only work mid-sentence.
      if (/(dan|den|tan|ten)$/i.test(lw)) return false;
      return true;
    });

  if (words.length >= 2) {
    const joined = words.slice(0, Math.max(input.maxWords + 2, 4)).join(' ');
    const tight = tightenOverlayHeadline(joined, input.maxLen, input.maxWords);
    if (
      tight
      && tight.split(/\s+/).filter(Boolean).length >= 2
      && isMeaningfulFalOverlayText(tight)
      && !isIncompleteOverlayPhrase(tight)
      && !isSoullessMenuHourHeadline(tight)
      && !isLabelStyleHeadline(tight)
    ) {
      return tight;
    }
  }

  return '';
}

function isPublishableOverlayLine(
  line: string,
  brandName: string,
  captionLoc: OverlayLocale,
): boolean {
  const clean = unwrapQuotedOverlayLine(line);
  // Punchy calendar quotes may be short (e.g. "Tadına bak!") — keep ≥6 chars / 2+ words.
  if (!clean || clean.length < 6) return false;
  if (clean.length < 8 && clean.split(/\s+/).filter(Boolean).length < 2) return false;
  if (isSoullessMenuHourHeadline(clean)) return false;
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
  designIntensity?: string | null;
  sampleHeadline?: string | null;
  sampleSubtitle?: string | null;
  showSubline?: boolean | null;
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
  const budget = resolveOverlayHeadlineWordBudget({
    channel: input.channel,
    designIntensity: input.designIntensity,
    sampleHeadline: input.sampleHeadline,
  });
  const headline = resolveFalProductionOverlayHeadline(
    overlay.headline,
    [],
    input.channel,
    input.designIntensity,
    budget,
  ) || tightenOverlayHeadline(overlay.headline, budget.maxLen, budget.maxWords);

  const rebased = rebiasUngroundedOverlayCopy({
    headline: headline || overlay.headline,
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
      maxLen: budget.maxLen,
    }).headline;
    const toned = preferBrandToneHeadline({
      current: rebased.headline,
      alternatives: [captionHook],
      brandTone: input.brandTone,
    });
    if (toned && toned !== rebased.headline) {
      const tonedHeadline = resolveFalProductionOverlayHeadline(
        toned,
        [rebased.headline],
        input.channel,
        input.designIntensity,
        budget,
      ) || toned;
      const fittedTone = fitMissionOverlayToTemplateBudget({
        headline: tonedHeadline,
        subtitle: rebased.subtitle,
        channel: input.channel,
        designIntensity: input.designIntensity,
        sampleHeadline: input.sampleHeadline,
        sampleSubtitle: input.sampleSubtitle,
        showSubline: input.showSubline,
      });
      return { headline: fittedTone.headline, subtitle: fittedTone.subtitle };
    }
  }

  const finalHeadline = resolveFalProductionOverlayHeadline(
    rebased.headline,
    [],
    input.channel,
    input.designIntensity,
    budget,
  ) || rebased.headline;

  const fitted = fitMissionOverlayToTemplateBudget({
    headline: finalHeadline,
    subtitle: rebased.subtitle,
    channel: input.channel,
    designIntensity: input.designIntensity,
    sampleHeadline: input.sampleHeadline,
    sampleSubtitle: input.sampleSubtitle,
    showSubline: input.showSubline,
  });
  return { headline: fitted.headline, subtitle: fitted.subtitle };
}

function resolvePlannedOverlayLine(
  line: string,
  fallbacks: string[],
  channel: 'reel' | 'feed_post' | 'story',
  designIntensity?: string | null,
  sampleHeadline?: string | null,
): string {
  const planned = resolveMissionPlannedOverlayLine(line, fallbacks, channel);
  if (!planned) return '';
  const budget = resolveOverlayHeadlineWordBudget({
    channel,
    designIntensity,
    sampleHeadline,
  });
  // Quoted punchlines that already fit the budget stay verbatim.
  const words = planned.replace(/[!?.…]+$/g, '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= budget.maxWords && planned.length <= budget.maxLen) {
    return planned;
  }
  return tightenOverlayHeadline(planned, budget.maxLen, budget.maxWords) || planned;
}

function extractMissionTagline(idea: FalDesignCopyIdea): string {
  return resolveIdeationTagline(idea as Record<string, unknown>);
}

/**
 * Resolve on-canvas design copy for Fal / GPT designed slots.
 * Priority: mission tagline → canva/text_layers → caption punchline → ideation title.
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
  /** Paint density — drives 2–4 word overlay budget. */
  designIntensity?: string | null;
  /** Matched library sample — locks mission overlay to designed type-zone size. */
  sampleHeadline?: string | null;
  sampleSubtitle?: string | null;
  showSubline?: boolean | null;
}): {
  headline: string;
  subtitle?: string;
  source: string;
} {
  const caption = input.caption.trim();
  const brandName = input.brandName.trim();
  const channel = input.channel;
  const captionLoc = detectOverlayLocale(caption);
  const budget = resolveOverlayHeadlineWordBudget({
    channel,
    designIntensity: input.designIntensity,
    sampleHeadline: input.sampleHeadline,
  });
  const maxLen = budget.maxLen;

  const acceptPlannedOverlayLine = (line: string): boolean => {
    const clean = unwrapQuotedOverlayLine(line);
    if (!clean || isIncompleteOverlayPhrase(clean)) return false;
    if (!isMeaningfulFalOverlayText(clean)) return false;
    if (isSoullessMenuHourHeadline(clean)) return false;
    if (isMeaninglessBrandEchoHeadline(clean, brandName)) return false;
    if (localesClash(captionLoc, detectOverlayLocale(clean))) return false;
    return true;
  };

  const lockToTemplate = (result: {
    headline: string;
    subtitle?: string;
    source: string;
  }): { headline: string; subtitle?: string; source: string } => {
    const fitted = fitMissionOverlayToTemplateBudget({
      headline: result.headline,
      subtitle: result.subtitle,
      channel,
      designIntensity: input.designIntensity,
      sampleHeadline: input.sampleHeadline,
      sampleSubtitle: input.sampleSubtitle,
      showSubline: input.showSubline,
    });
    return {
      headline: fitted.headline,
      subtitle: fitted.subtitle,
      source: result.source,
    };
  };

  const templateFitOpts = {
    sampleHeadline: input.sampleHeadline,
    sampleSubtitle: input.sampleSubtitle,
    showSubline: input.showSubline,
  };

  // 1) Mission tagline / subline — quoted line from calendar & ideation cards.
  const missionTagline = unwrapQuotedOverlayLine(extractMissionTagline(input.idea));
  if (missionTagline && isPublishableOverlayLine(missionTagline, brandName, captionLoc)) {
    const headline = resolvePlannedOverlayLine(
      missionTagline,
      [],
      channel,
      input.designIntensity,
      input.sampleHeadline,
    );
    if (headline && acceptPlannedOverlayLine(headline)) {
      const ideationTitle = unwrapQuotedOverlayLine(
        input.ideationHeadline.trim()
          || String(input.idea.concept_title ?? input.idea.title ?? input.idea.headline ?? '').trim(),
      );
      const subtitle = ideationTitle
        && ideationTitle.length <= 36
        && !areFalOverlayTextsRedundant(headline, ideationTitle)
        && isPublishableOverlayLine(ideationTitle, brandName, captionLoc)
        && !isMeaninglessBrandEchoHeadline(ideationTitle, brandName)
        ? resolvePlannedOverlayLine(
          ideationTitle,
          [headline],
          channel,
          input.designIntensity,
          input.sampleHeadline,
        ) || undefined
        : undefined;
      return lockToTemplate({ headline, subtitle, source: 'mission_tagline' });
    }
  }

  // 2) Purpose-built overlay from canva_field_copy / text_layers.
  const extracted = extractIdeationDesignCopy(input.idea);
  if (extracted.headline && isPublishableOverlayLine(extracted.headline, brandName, captionLoc)) {
    const headline = resolvePlannedOverlayLine(
      extracted.headline,
      [],
      channel,
      input.designIntensity,
      input.sampleHeadline,
    );
    if (headline && acceptPlannedOverlayLine(headline)) {
      const subtitleRaw = extracted.subtitle || input.cta;
      const subtitle = subtitleRaw
        && !areFalOverlayTextsRedundant(headline, subtitleRaw)
        ? resolvePlannedOverlayLine(
          subtitleRaw,
          [headline],
          channel,
          input.designIntensity,
          input.sampleHeadline,
        ) || undefined
        : resolveFalSubtitle({
          caption,
          headline,
          cta: extracted.subtitle || input.cta,
        }) ?? undefined;
      return lockToTemplate({ headline, subtitle, source: extracted.source });
    }
  }

  // 3) Caption-aligned short punchline (never long first-sentence dumps).
  if (caption.length >= 24) {
    const punch = extractCaptionAlignedPunchline({
      caption,
      brandName,
      maxWords: budget.maxWords,
      maxLen,
    });
    if (punch && acceptPlannedOverlayLine(punch)) {
      const subtitle = resolveFalSubtitle({
        caption,
        headline: punch,
        cta: input.cta || String(input.idea.subline ?? '').trim() || undefined,
      }) ?? undefined;
      return lockToTemplate({ headline: punch, subtitle, source: 'caption_punchline' });
    }

    const fromCaption = resolveFalDisplayHeadline({
      caption,
      missionTitle: input.ideationHeadline || brandName,
      brandName,
      cta: input.cta,
      maxLen: Math.min(maxLen + 12, FAL_FEED_OVERLAY_MAX_CHARS + 12),
    });
    const themePunch = extractCaptionThemePunchline({
      caption,
      maxWords: budget.maxWords,
      maxLen,
    });
    let headline = resolveFalProductionOverlayHeadline(
      themePunch || fromCaption.headline,
      [fromCaption.headline, input.ideationHeadline].filter(Boolean),
      channel,
      input.designIntensity,
      budget,
    );
    if (
      !headline
      || isLabelStyleHeadline(headline)
      || isSoullessMenuHourHeadline(headline)
      || isIncompleteOverlayPhrase(headline)
    ) {
      const qa = resolveMeaningfulProductionHeadline({
        headline: '',
        caption,
        brandName,
        businessType: input.businessType,
        language: input.language,
        maxLen,
      });
      headline = resolveFalProductionOverlayHeadline(
        qa.headline,
        [],
        channel,
        input.designIntensity,
        budget,
      );
    }
    if (headline && !isSoullessMenuHourHeadline(headline) && !isLabelStyleHeadline(headline)) {
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
        designIntensity: input.designIntensity,
        ...templateFitOpts,
      });
      return lockToTemplate({ ...overlay, source: 'caption_design_copy' });
    }
  }

  // 4) Punchy ideation / concept title (not series labels) — last resort.
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
      designIntensity: input.designIntensity,
      ...templateFitOpts,
    });
    if (
      overlay.headline
      && !isIncompleteOverlayPhrase(overlay.headline)
      && !isSoullessMenuHourHeadline(overlay.headline)
    ) {
      return lockToTemplate({ ...overlay, source: 'ideation_title' });
    }
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
    designIntensity: input.designIntensity,
    ...templateFitOpts,
  });

  if (overlay.headline && isLabelStyleHeadline(overlay.headline) && caption.length >= 24) {
    const punch = extractCaptionAlignedPunchline({
      caption,
      brandName,
      maxWords: budget.maxWords,
      maxLen,
    });
    if (punch && !isLabelStyleHeadline(punch) && !isSoullessMenuHourHeadline(punch)) {
      return lockToTemplate({
        headline: punch,
        subtitle: resolveFalSubtitle({ caption, headline: punch, cta: input.cta }) ?? undefined,
        source: 'caption_design_copy_rescue',
      });
    }
    const forced = resolveFalDisplayHeadline({
      caption,
      missionTitle: overlay.headline,
      brandName,
      cta: input.cta,
      maxLen,
    });
    const headline = resolveFalProductionOverlayHeadline(
      forced.headline,
      [overlay.headline],
      channel,
      input.designIntensity,
      budget,
    );
    if (
      headline
      && !isLabelStyleHeadline(headline)
      && !isSoullessMenuHourHeadline(headline)
      && !isIncompleteOverlayPhrase(headline)
    ) {
      return lockToTemplate({
        headline,
        subtitle: resolveFalSubtitle({ caption, headline, cta: input.cta }) ?? undefined,
        source: 'caption_design_copy_rescue',
      });
    }
  }

  return lockToTemplate({ ...overlay, source: 'ideation_locked' });
}
