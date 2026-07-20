/**
 * Production bridge — onboarding fal.ai brand design templates → mission slots.
 *
 * Locks layout/vibe/colors from the brand's approved template set while swapping
 * mission gallery photos and headline/copy (DJ nightly post, campaign, etc.).
 */

import type { TypographyVibe } from '@/types/brand-theme';
import { isUsableGalleryPhotoUrl } from '@/lib/media-url';
import { GRAFIKER_PASS_THRESHOLD } from '@/lib/grafiker-quality';
import {
  isRenderableDesignTemplateMatch,
  matchDesignTemplateToSlot,
  recordDesignTemplateUsage,
  type MatchedDesignTemplate,
} from '@/lib/brand-design-template-matcher';
import type { BrandActiveSlotSet } from '@/lib/brand-active-slot-resolver';
import { collectTemplatePlaceholderTexts } from '@/lib/template-placeholder-guard';

export interface BrandTemplateFalBinding {
  matched: MatchedDesignTemplate | null;
  /** Locked typography vibe from onboarding template (overrides caption heuristics). */
  lockedVibe: TypographyVibe | null;
  /** Gallery photo for the content zone — mission match preferred. */
  referencePhotoUrl: string | null;
  /** Approved template preview — second GPT-image ref for layout skeleton. */
  styleReferenceUrl: string | null;
  brandDirectives: string[];
  brandColors: { primary: string; accent: string } | null;
  logoUrl: string | undefined;
  occasion: { name: string; mood?: string } | undefined;
}

/** Phase 1 — fal slot count unchanged; stronger lock when onboarding template matches. */
export interface FalTemplateLockOptions {
  /** Mission headline verbatim — no caption-aware rewrite. */
  captionAwareHeadline: boolean;
  /** Extra Grafiker retries when a brand template is locked (cap 2). */
  grafikerMaxRetries: number;
  /** Template preview should appear in the reference set. */
  requireTemplateStyleRef: boolean;
}

export function resolveFalTemplateLockOptions(input: {
  binding: BrandTemplateFalBinding | null | undefined;
  baseGrafikerMaxRetries?: number | null;
  adHocBrief?: boolean;
  /** Default caption-aware behaviour when no template is matched. */
  defaultCaptionAwareHeadline?: boolean;
}): FalTemplateLockOptions {
  const base = Math.max(0, Math.min(2, Math.floor(input.baseGrafikerMaxRetries ?? 0)));
  if (input.adHocBrief || !input.binding?.matched) {
    return {
      captionAwareHeadline: input.adHocBrief ? false : (input.defaultCaptionAwareHeadline ?? false),
      grafikerMaxRetries: base,
      requireTemplateStyleRef: false,
    };
  }
  // Library template lock (post/story/reel): mission/ideation copy is SSOT.
  // Caption-aware rewrite fights replica "sample → mission" text swap.
  return {
    captionAwareHeadline: false,
    grafikerMaxRetries: Math.min(2, Math.max(base, 1)),
    requireTemplateStyleRef: false,
  };
}

/**
 * When a catalog slot is pinned, only that library template may bind (fail-closed).
 * Without a pin, soft same-format match is allowed for pre-catalog missions.
 */
export function allowSoftTemplateFallbackForCatalogPin(
  catalogSlotKey?: string | null,
): boolean {
  return !String(catalogSlotKey ?? '').trim();
}

/** Hard/soft library match — production must clone layout + swap photo/copy. */
export function requiresLibraryTemplateReplica(
  matched: MatchedDesignTemplate | null | undefined,
): boolean {
  return isRenderableDesignTemplateMatch(matched);
}

export function templateLockUsesGrafikerPass(score: number | null, pass: boolean | undefined): boolean {
  return pass === true || (score != null && score >= GRAFIKER_PASS_THRESHOLD);
}

export interface TemplateMissionCopy {
  headline?: string;
  subtitle?: string;
}

export function buildTemplateLayoutDirectives(
  matched: MatchedDesignTemplate,
  mission?: TemplateMissionCopy,
): string[] {
  const out: string[] = [matched.directive];
  const layoutRecipe: string[] = [];

  if (matched.canvaArchetypeName || matched.canvaArchetypeId) {
    layoutRecipe.push(
      `Canva layout archetype: ${matched.canvaArchetypeName ?? matched.canvaArchetypeId}`,
    );
  }
  if (matched.layoutPattern) {
    layoutRecipe.push(`Layout pattern: ${String(matched.layoutPattern).slice(0, 220)}`);
  }
  if (matched.designBriefDirectives?.length) {
    layoutRecipe.push(...matched.designBriefDirectives.slice(0, 8));
  }

  const forbidden = collectTemplatePlaceholderTexts(matched);
  const missionHeadline = mission?.headline?.trim() ?? '';
  const missionSubtitle = mission?.subtitle?.trim() ?? '';

  out.unshift(
    `BRAND LAYOUT TEMPLATE "${matched.templateName}" (${matched.templateType}): ` +
      'This approved brand template is the LAYOUT LAW — replicate it exactly, do not redesign. ' +
      'Copy 1:1: panel geometry (shapes, positions, proportions), typographic hierarchy (font style, weight, size scale, alignment), ' +
      'brand color-block placement, and decorative rhythm. ' +
      'ONLY swap: (1) the photo/content zone with the mission gallery photo, (2) ALL on-canvas text with the mission copy below. ' +
      'The output must read as the SAME template re-issued with new photo and new copy. ' +
      'Never reuse sample placeholder text from the template library preview.',
  );

  if (layoutRecipe.length > 0) {
    out.push(`Layout system: ${layoutRecipe.join(' | ')}`);
  }

  if (missionHeadline) {
    out.push(`MISSION HEADLINE (render exactly, Turkish diacritics preserved): "${missionHeadline}"`);
  }
  if (missionSubtitle) {
    out.push(`MISSION SUBTITLE (render exactly): "${missionSubtitle}"`);
  }

  if (forbidden.length > 0) {
    out.push(
      `FORBIDDEN ON-CANVAS TEXT (template preview placeholders — never render): ${forbidden.map((t) => `"${t}"`).join(', ')}`,
    );
  }

  out.push(
    'TEXT LOCK: Render ONLY the mission headline and supporting line above. ' +
      'Typography style, weight, and placement must follow the locked layout recipe — not the preview image text.',
  );
  return out;
}

/**
 * One layout authority: when a brand template is locked, mission-level Canva
 * archetype rotation and grid-surface rotation directives must not fight the
 * template's layout recipe. Without a match, rotation directives pass through
 * so per-mission variety still applies.
 */
export function dropConflictingLayoutDirectives(
  extraDirectives: string[],
  matched: MatchedDesignTemplate | null | undefined,
): string[] {
  if (!matched) return extraDirectives;
  return extraDirectives.filter(
    (d) => !/^(CANVA ARCHETYPE:|GRID ROTATION:|FORBIDDEN: )/.test(d.trim()),
  );
}

/** Mission gallery photo only — template preview PNGs carry sample copy and must not be edit refs. */
export function pickTemplateReferenceUrls(input: {
  missionPhotoUrl: string | null | undefined;
  matched: MatchedDesignTemplate | null;
  brandReferenceImageUrls?: string[];
}): string[] {
  const mission =
    input.missionPhotoUrl && isUsableGalleryPhotoUrl(input.missionPhotoUrl)
      ? input.missionPhotoUrl
      : null;
  const templateGallery =
    input.matched?.galleryRef && isUsableGalleryPhotoUrl(input.matched.galleryRef)
      ? input.matched.galleryRef
      : null;

  if (mission) return [mission];

  if (templateGallery) return [templateGallery];

  const extra = (input.brandReferenceImageUrls ?? []).find(
    (u) => u && isUsableGalleryPhotoUrl(u),
  );
  return extra ? [extra] : [];
}

/** Phase 1 — template preview must not be used as a production edit reference. */
export function assertTemplateStyleReference(
  binding: BrandTemplateFalBinding | null | undefined,
  referenceUrls: string[],
): void {
  const preview = binding?.styleReferenceUrl;
  if (!binding?.matched || !preview || !isUsableGalleryPhotoUrl(preview)) return;
  if (referenceUrls.includes(preview)) {
    console.warn(
      `[fal-template-lock] template preview must not be used as edit ref for "${binding.matched.templateName}" — sample copy leak risk`,
    );
  }
}

export async function bindBrandTemplateForFalProduction(input: {
  workspaceId: string;
  slotRole: string;
  librarySlotKey: string | null | undefined;
  format: 'story' | 'post' | 'reel';
  caption?: string;
  headline?: string;
  subtitle?: string;
  announcementType?: string | null;
  templateUseCase?: string | null;
  /** Catalog slot key when production knows the mission slot (Faz 5). */
  catalogSlotKey?: string | null;
  /** Tenant-enabled catalog snapshot — excludes disabled slot templates. */
  brandActiveSlots?: BrandActiveSlotSet | null;
  /** True only for ad-hoc New Brief — skips onboarding template lock. */
  adHocBrief?: boolean;
  missionReferenceUrl: string | null;
  baseDirectives: string[];
  brandColors: { primary: string; accent: string };
  logoUrl?: string;
  brandVibe: TypographyVibe | null;
}): Promise<BrandTemplateFalBinding> {
  const empty: BrandTemplateFalBinding = {
    matched: null,
    lockedVibe: null,
    referencePhotoUrl: input.missionReferenceUrl,
    styleReferenceUrl: null,
    brandDirectives: [...input.baseDirectives],
    brandColors: null,
    logoUrl: input.logoUrl,
    occasion: undefined,
  };
  if (input.adHocBrief) return empty;

  try {
    const matched = await matchDesignTemplateToSlot(input.workspaceId, {
      slotRole: input.slotRole,
      librarySlotKey: input.librarySlotKey,
      format: input.format,
      caption: input.caption,
      headline: input.headline,
      announcementType: input.announcementType,
      templateUseCase: input.templateUseCase,
      catalogSlotKey: input.catalogSlotKey,
      brandActiveSlots: input.brandActiveSlots,
      // Catalog pin = exact library template only (post/story/reel_cover).
      // Soft same-format match only when the slot has no catalog key.
      allowSoftFallbackWhenHardMiss: allowSoftTemplateFallbackForCatalogPin(
        input.catalogSlotKey,
      ),
    });
    if (!matched) {
      console.warn(
        `[design-matcher] no template match workspace=${input.workspaceId} ` +
        `role=${input.slotRole} library=${input.librarySlotKey ?? '-'} ` +
        `catalog=${input.catalogSlotKey ?? '-'} ` +
        `announcement=${input.announcementType ?? '-'} format=${input.format}` +
        (input.catalogSlotKey ? ' (hard-pin fail-closed or empty library)' : ''),
      );
      return empty;
    }

    console.log(
      `[design-matcher] locked "${matched.templateName}" (${matched.templateType}) ` +
      `quality=${matched.matchQuality} catalog=${input.catalogSlotKey ?? '-'} ` +
      `role=${input.slotRole} announcement=${input.announcementType ?? '-'}`,
    );

    void recordDesignTemplateUsage(input.workspaceId, matched.id);

    const specialDay = matched.specialDay;
    const referencePhotoUrl =
      (input.missionReferenceUrl && isUsableGalleryPhotoUrl(input.missionReferenceUrl)
        ? input.missionReferenceUrl
        : null) ??
      (matched.galleryRef && isUsableGalleryPhotoUrl(matched.galleryRef) ? matched.galleryRef : null);

    return {
      matched,
      lockedVibe: input.brandVibe ?? matched.vibe ?? null,
      referencePhotoUrl,
      styleReferenceUrl: matched.thumbnailUrl ?? null,
      brandDirectives: [
        ...buildTemplateLayoutDirectives(matched, {
          headline: input.headline,
          subtitle: input.subtitle ?? input.caption,
        }),
        ...dropConflictingLayoutDirectives(input.baseDirectives, matched),
      ],
      brandColors: matched.brandColors ?? null,
      logoUrl: matched.prominentLogo ? (input.logoUrl ?? matched.logoUrl) : input.logoUrl,
      occasion: specialDay?.name
        ? { name: specialDay.name, mood: specialDay.category }
        : undefined,
    };
  } catch {
    return empty;
  }
}

/**
 * Saved template generation prompt + its sample copy — the exact spec the
 * library preview was rendered with (`design_spec.prompt`).
 */
export interface TemplateReplicaSpec {
  prompt: string;
  sampleHeadline: string | null;
  sampleSubtitle: string | null;
  forbiddenTexts: string[];
  format?: 'story' | 'post' | 'reel';
}

/**
 * Rewrite legacy library prompts that stored feed 4:5 language on story/reel
 * templates (or the reverse) so mission replica matches the slot canvas.
 */
export function normalizeLibraryPromptForFormat(
  prompt: string,
  format: 'story' | 'post' | 'reel' | 'reel_cover' | null | undefined,
): string {
  const channel = format === 'reel' || format === 'reel_cover'
    ? 'reel'
    : format === 'story'
      ? 'story'
      : format === 'post'
        ? 'post'
        : null;
  if (!channel || !prompt.trim()) return prompt;

  let out = prompt;

  if (channel === 'story' || channel === 'reel') {
    const channelOpener = channel === 'story'
      ? 'a scroll-stopping Instagram Story'
      : 'a scroll-stopping reel cover';
    const channelNoun = channel === 'story' ? 'Instagram Story' : 'Reels';
    const canvaPattern = channel === 'story' ? 'story 9:16' : 'reel 9:16';

    const verticalDeliverable = channel === 'story'
      ? 'one finished Instagram Story design (1080×1920 vertical portrait frame (9:16 aspect ratio)) — scroll-stopping vertical story poster'
      : 'one finished Instagram Reel cover design (1080×1920 vertical portrait frame (9:16 aspect ratio)) — scroll-stopping reel cover, hand-crafted';

    out = out.replace(
      /Design ONE portrait 4:5 feed post \(1080×1350\):\s*a scroll-stopping feed post/gi,
      `Design ONE 1080×1920 vertical portrait frame (9:16 aspect ratio): ${channelOpener}`,
    );
    out = out.replace(
      /Design ONE square 1:1 feed post \(1080×1080\):\s*a scroll-stopping feed post/gi,
      `Design ONE 1080×1920 vertical portrait frame (9:16 aspect ratio): ${channelOpener}`,
    );
    out = out.replace(
      /one finished Instagram feed post design \(portrait 4:5 feed post \(1080×1350\)\) — scroll-stopping feed post/gi,
      verticalDeliverable,
    );
    out = out.replace(
      /one finished Instagram feed post design \(square 1:1 feed post \(1080×1080\)\) — scroll-stopping feed post/gi,
      verticalDeliverable,
    );
    out = out.replace(
      /portrait 4:5 feed post \(1080×1350\)/gi,
      '1080×1920 vertical portrait frame (9:16 aspect ratio)',
    );
    out = out.replace(
      /square 1:1 feed post \(1080×1080\)/gi,
      '1080×1920 vertical portrait frame (9:16 aspect ratio)',
    );
    out = out.replace(
      /a scroll-stopping feed post/gi,
      channelOpener,
    );
    out = out.replace(
      /scroll-stopping feed post/gi,
      channel === 'story' ? 'scroll-stopping vertical story poster' : 'scroll-stopping reel cover',
    );
    out = out.replace(
      /one finished Instagram feed post design/gi,
      channel === 'story'
        ? 'one finished Instagram Story design'
        : 'one finished Instagram Reel cover design',
    );
    out = out.replace(
      /scroll-stopping feed design/gi,
      `scroll-stopping ${channelNoun} design`,
    );
    out = out.replace(
      /Premium feed post —/gi,
      `Premium ${channel === 'story' ? 'vertical story poster' : 'vertical reel'} —`,
    );
    out = out.replace(
      /Match this Pro feed 4:5 template pattern/gi,
      `Match this Pro ${canvaPattern} template pattern`,
    );
    out = out.replace(
      /PHOTO FRAMING \(4:5 feed\):[^.]*\./gi,
      'PHOTO FRAMING (9:16): Scale the full gallery photograph to fit inside the frame — object-fit contain. Never crop off plates, faces, hands, or hero subjects. Letterbox with brand-color bands if aspect ratios differ.',
    );
    out = out.replace(
      /FEED CANVAS LOCK:[^.]*\./gi,
      channel === 'story'
        ? 'STORY CANVAS LOCK: Exact Instagram Story 9:16 (1080×1920). Compose as a vertical story poster — full-height frame, safe-zone typography. FORBIDDEN: 4:5 feed crop language or square feed composition.'
        : 'REEL CANVAS LOCK: Exact Instagram Reel 9:16 (1080×1920). Compose as a reel cover — full-height frame, motion-ready typography. FORBIDDEN: 4:5 feed crop language or square feed composition.',
    );
  } else {
    out = out.replace(
      /Design ONE 1080×1920 vertical portrait frame \(9:16 aspect ratio\):\s*a scroll-stopping Instagram Story/gi,
      'Design ONE portrait 4:5 feed post (1080×1350): a scroll-stopping feed post',
    );
    out = out.replace(
      /Design ONE 1080×1920 vertical portrait frame \(9:16 aspect ratio\):\s*a scroll-stopping reel cover/gi,
      'Design ONE portrait 4:5 feed post (1080×1350): a scroll-stopping feed post',
    );
    out = out.replace(
      /one finished Instagram Story design \(1080×1920 vertical portrait frame \(9:16 aspect ratio\)\) — scroll-stopping vertical story poster/gi,
      'one finished Instagram feed post design (portrait 4:5 feed post (1080×1350)) — scroll-stopping feed post',
    );
    out = out.replace(
      /one finished Instagram Reel cover design \(1080×1920 vertical portrait frame \(9:16 aspect ratio\)\) — scroll-stopping reel cover, hand-crafted/gi,
      'one finished Instagram feed post design (portrait 4:5 feed post (1080×1350)) — scroll-stopping feed post',
    );
    out = out.replace(
      /Match this Pro (?:story|reel|vertical) 9:16 template pattern/gi,
      'Match this Pro feed 4:5 template pattern',
    );
    out = out.replace(
      /STORY CANVAS LOCK:[^.]*\./gi,
      'FEED CANVAS LOCK: Exact Instagram feed 4:5 (1080×1350). Compose as a feed post — corner/side/lower-third typography. FORBIDDEN: 9:16 story proportions or tall upper story panels that make the post look like a cropped story.',
    );
    out = out.replace(
      /REEL CANVAS LOCK:[^.]*\./gi,
      'FEED CANVAS LOCK: Exact Instagram feed 4:5 (1080×1350). Compose as a feed post — corner/side/lower-third typography. FORBIDDEN: 9:16 story proportions or tall upper story panels that make the post look like a cropped story.',
    );
  }

  return out;
}

/**
 * Replica spec for real (hard/soft) template matches. The stored onboarding
 * prompt is reused in production so the textual instruction and the
 * thumbnail layout reference describe the SAME design instead of fighting.
 * Channel language is normalized to the template format so legacy 4:5 feed
 * wording on story/reel library rows cannot leak into mission renders.
 */
export function templateReplicaSpecFromBinding(
  binding: BrandTemplateFalBinding | null | undefined,
): TemplateReplicaSpec | null {
  const matched = binding?.matched ?? null;
  if (!isRenderableDesignTemplateMatch(matched)) return null;
  const prompt = matched.designSpecPrompt?.trim();
  if (!prompt) return null;
  const format = matched.format === 'story' || matched.format === 'post' || matched.format === 'reel'
    ? matched.format
    : undefined;
  return {
    prompt: normalizeLibraryPromptForFormat(prompt, format),
    sampleHeadline: matched.sampleHeadline ?? null,
    sampleSubtitle: matched.sampleSubtitle ?? null,
    forbiddenTexts: collectTemplatePlaceholderTexts(matched),
    format,
  };
}

/**
 * "Yeniden üret" semantics for mission production: run the template's original
 * generation prompt again, with only the on-canvas copy swapped to the mission
 * text (the photo swap happens via the edit reference image). Sample copy is
 * replaced in place; a compact override header wins if any residue survives.
 */
export function buildTemplateReplicaPrompt(
  spec: TemplateReplicaSpec,
  mission: { headline: string; subtitle?: string | null },
): string {
  let prompt = spec.prompt.trim();
  const missionSubtitle = (mission.subtitle ?? '').trim();

  const swap = (from: string | null, to: string) => {
    const needle = from?.trim();
    if (!needle || needle.length < 3 || !prompt.includes(needle)) return;
    prompt = prompt.split(needle).join(to);
  };
  swap(spec.sampleHeadline, mission.headline);
  swap(spec.sampleSubtitle, missionSubtitle);

  const header = [
    '═══ MISSION COPY OVERRIDE (FINAL AUTHORITY) ═══',
    `ON-CANVAS HEADLINE (exact, Turkish diacritics preserved): "${mission.headline}"`,
    missionSubtitle
      ? `ON-CANVAS SUBTITLE (exact): "${missionSubtitle}"`
      : 'NO SUBTITLE — render only the headline above.',
    spec.forbiddenTexts.length
      ? `FORBIDDEN TEXT (template placeholders — never render): ${spec.forbiddenTexts.map((t) => `"${t}"`).join(', ')}`
      : '',
    'This is the brand\'s SAVED template spec re-issued: keep its layout, typography system, and colors exactly — only the text above and the mission photo change.',
  ].filter(Boolean).join('\n');

  return `${header}\n\n${prompt}`;
}

/**
 * Approved library preview as the GPT edit layout reference — only for real
 * (hard/soft) template matches. Format fallbacks must not clone a foreign layout.
 */
export function templateLayoutReferenceUrl(
  binding: BrandTemplateFalBinding | null | undefined,
): string | undefined {
  if (!isRenderableDesignTemplateMatch(binding?.matched ?? null)) return undefined;
  const url = binding?.styleReferenceUrl;
  return url && isUsableGalleryPhotoUrl(url) ? url : undefined;
}

/** Extra brand refs for fal designer — never include template preview (sample copy). */
export function templateStyleReferenceUrls(
  binding: BrandTemplateFalBinding,
  brandReferenceImageUrls: string[],
): string[] {
  const out: string[] = [];
  for (const u of brandReferenceImageUrls) {
    if (!u || !isUsableGalleryPhotoUrl(u)) continue;
    if (u === binding.referencePhotoUrl) continue;
    if (u === binding.styleReferenceUrl) continue;
    out.push(u);
  }
  return out.slice(0, 1);
}
