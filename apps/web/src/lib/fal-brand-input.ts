import type {
  BrandDesignTypographyConfig,
  BrandPostDesignDefaults,
  BrandTheme,
  TypographyBackgroundStyle,
  TypographyVibe,
} from '@/types/brand-theme';
import type { BrandTemplateLibrary } from './brand-template-library';
import type { BrandProductionTokens } from './brand-production-tokens';
import { resolveSlotRenderTypography } from './brand-template-slot-typography';
import {
  getSectorBackgroundScenePrompt,
  getSectorImageNegativeGuards,
} from './sector-production-profile';
import {
  buildTemplateColorPreview,
  resolveTemplateColorProps,
} from './template-color-policy';
import { resolveTypographyVibeFromContext } from './fal-designer-production';
import {
  resolveFalTemplateIntensityForChannel,
  resolveFalTemplateBackgroundStyle,
  resolveFalTemplateProductionSettings,
} from '@/lib/fal-template-production-settings';
import type { FalDesignChannel, FalDesignIntensityLevel } from '@/lib/fal-design-intensity';

export interface ResolvedFalBrandInput {
  brandColors: { primary: string; accent: string };
  vibe: TypographyVibe;
  backgroundStyle: TypographyBackgroundStyle;
  sceneHint?: string;
  promptDirectives: string[];
  /** Condensed brand DNA phrase injected as a standalone visual tone block. */
  visualDnaTone?: string;
  templateId?: string;
  posterTemplateId?: string;
  /** Resolved fal.ai design intensity for the production channel. */
  designIntensityLevel: FalDesignIntensityLevel;
}

function readTypographyConfig(
  theme: Record<string, unknown> | null | undefined,
): BrandDesignTypographyConfig | undefined {
  return (theme?.typography_design ?? theme?.typographyDesign) as BrandDesignTypographyConfig | undefined;
}

function readPostDefaults(
  theme: Record<string, unknown> | null | undefined,
): BrandPostDesignDefaults | undefined {
  return (theme?.post_design_defaults ?? theme?.postDesignDefaults) as BrandPostDesignDefaults | undefined;
}

function describeTextEffect(effect: BrandPostDesignDefaults['text_effect'] | undefined): string | undefined {
  switch (effect) {
    case 'extrude_3d':
      return 'Typography direction: premium 3D extrusion depth, tactile highlights, agency-quality finish.';
    case 'neon_3d':
      return 'Typography direction: luminous neon depth with nightlife-style glow and premium edge lighting.';
    case 'editorial_outline':
      return 'Typography direction: editorial outline contrast, refined hierarchy, and luxury magazine restraint.';
    case 'gradient_stack':
      return 'Typography direction: layered gradient typography with polished premium color transitions.';
    case 'soft_shadow':
      return 'Typography direction: clean modern type with subtle shadow depth and elegant legibility.';
    default:
      return undefined;
  }
}

function describeLogoTreatment(treatment: BrandDesignTypographyConfig['logo_treatment'] | undefined): string | undefined {
  const integrity =
    'Never redraw, recolor, or replace the official logo — the exact asset is composited in post-production; vibe may only affect opacity, shadow, or glow on the composited mark.';
  switch (treatment) {
    case 'watermark':
      return `Logo treatment: keep the brand mark subtle, refined, and watermark-like rather than dominant. ${integrity}`;
    case 'badge':
      return `Logo treatment: place the logo as a small premium badge lockup in a quiet corner — never over the photo focal point. ${integrity}`;
    case 'inline':
      return `Logo treatment: integrate the brand mark inline with the composition, not as a random sticker. ${integrity}`;
    case 'none':
      return `Logo treatment: avoid forced logo placement unless essential for balance. When placed, ${integrity.toLowerCase()}`;
    default:
      return undefined;
  }
}

function describeSlotTypography(input: {
  mode?: string;
  headingFont?: string;
  bodyFont?: string;
  fontPersonality?: string;
}): string | undefined {
  const families = [input.headingFont, input.bodyFont].filter(Boolean).join(' / ');
  if (input.mode === 'brand' && families) {
    return `Typography should feel aligned with the brand's chosen font system, inspired by ${families}.`;
  }
  if (input.mode === 'custom' && input.headingFont) {
    return `Typography should be inspired by custom brand fonts: ${families || input.headingFont}.`;
  }
  if (input.fontPersonality || families) {
    return `Typography personality should follow the selected template style (${input.fontPersonality ?? 'brand'}), with a look inspired by ${families || 'the template font system'}.`;
  }
  return undefined;
}

/** Live tenant palette always wins over stale onboarding template snapshots. */
export function resolveFalProductionBrandColors(
  live: { primary: string; accent: string },
  _templateSnapshot?: { primary: string; accent: string } | null,
): { primary: string; accent: string } {
  return {
    primary: live.primary,
    accent: live.accent,
  };
}

function buildBrandColorLockDirective(colors: { primary: string; accent: string }): string {
  return (
    `BRAND COLOR LOCK (mandatory): primary ${colors.primary}, accent ${colors.accent}. ` +
    `These exact hex values MUST dominate panels, gradients, typography color blocks, and decorative accents. ` +
    `Never substitute sector presets, Canva archetype defaults, template preview colors, or generic gold/yellow/amber unless accent is explicitly ${colors.accent}.`
  );
}

function buildTemplateColorDirective(input: {
  templateId?: string;
  posterTemplateId?: string;
  tokens: BrandProductionTokens;
}): string | undefined {
  const preview = buildTemplateColorPreview({
    templateId: input.templateId,
    posterTemplateId: input.posterTemplateId,
    tokens: input.tokens,
  });
  const colors = resolveTemplateColorProps({
    templateId: input.templateId,
    posterTemplateId: input.posterTemplateId,
    tokens: input.tokens,
  });
  if (!preview.items.length) return undefined;
  const parts = [
    colors.headlineColor ? `headline emphasis ${colors.headlineColor}` : '',
    colors.categoryColor ? `category accent ${colors.categoryColor}` : '',
    colors.textColor ? `detail text ${colors.textColor}` : '',
    colors.overlayColor ? `overlay tint ${colors.overlayColor}` : '',
  ].filter(Boolean);
  return `Template color behavior: ${preview.summary}. Use these resolved roles clearly: ${parts.join(', ')}.`;
}

/**
 * Distil the brand's visual_dna and description into a short, single-line
 * tone directive that can be injected directly into the Ideogram/Flux prompt.
 * Keeps under 200 chars to avoid drowning other directives.
 */
function buildCaptionSceneDirective(caption?: string): string | undefined {
  const clean = (caption ?? '')
    .replace(/[\u{1F600}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/#\S+/g, '')
    .replace(/@\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length < 16) return undefined;
  return `Caption-driven visual mood: "${clean.slice(0, 140)}" — the design must express this specific post message, not a generic sector template.`;
}

/** Labels in a markdown visual_dna dump that carry no aesthetic signal. */
const SOUL_NOISE_LABELS = /^(brand|source|url|link|website|site|name|title|logo|handle|account|profile|palette|hex)$/i;
/** Labels whose value is reliably descriptive of the brand's look/feel. */
const SOUL_KEEP_LABELS = /(colou?r|mood|vibe|tone|style|aesthetic|atmosphere|feel|look|texture|material|theme|personality|emotion|imagery|photography)/i;
const HEX_LIST = /^#?[0-9a-fA-F]{3,8}(\s*[,+/]\s*#?[0-9a-fA-F]{3,8})*$/;

function stripMarkdown(line: string): string {
  return line.replace(/\*\*/g, '').replace(/^[-*•\d.\s]+/, '').trim();
}

/**
 * Distil the brand's visual_dna / tone / description into a short, single-line
 * BRAND SOUL directive injected into the designer prompt.
 *
 * Robust against the markdown-dump shape brand analysis often produces
 * (`**Brand**: …`, `**Colors**: …`, `**Palette**: #…`): it skips noise label
 * lines (Brand/Source/Palette-hex) and keeps the aesthetic fragments
 * (colors-as-words, mood, vibe, style) plus the brand tone — so the soul reads
 * like a designer brief instead of a scraped page title.
 */
export function distillBrandSoul(input: {
  visualDna?: string | null;
  brandTone?: string | null;
  brandDescription?: string | null;
}): string | undefined {
  const fragments: string[] = [];

  const tone = (input.brandTone ?? '').trim();
  if (tone) fragments.push(tone);

  const dna = (input.visualDna ?? '').trim();
  if (dna) {
    const lines = dna.split(/\n+/).map(stripMarkdown).filter(Boolean);
    for (const line of lines) {
      const labelled = line.match(/^([A-Za-zÇĞİÖŞÜçğıöşü ]{2,24}):\s*(.+)$/);
      if (labelled) {
        const label = (labelled[1] ?? '').trim();
        const value = (labelled[2] ?? '').trim();
        if (SOUL_NOISE_LABELS.test(label)) continue;
        if (HEX_LIST.test(value)) continue; // pure hex palette, not descriptive
        if (SOUL_KEEP_LABELS.test(label) || value.length >= 12) fragments.push(value);
      } else if (line.length >= 16 && !line.startsWith('#')) {
        fragments.push(line.split(/[.!?]/)[0]?.trim() ?? line);
      }
      if (fragments.join(' · ').length > 170) break;
    }
  }

  if (fragments.length === 0) {
    const desc = (input.brandDescription ?? '').trim();
    if (desc) fragments.push(desc.split(/[.!?\n]/)[0]?.trim() ?? '');
  }

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const fragment of fragments) {
    const key = fragment.toLowerCase();
    if (!fragment || seen.has(key)) continue;
    seen.add(key);
    unique.push(fragment);
  }

  const soul = unique.join(' · ').replace(/\s+/g, ' ').trim();
  return soul.length > 10 ? soul.slice(0, 180) : undefined;
}

function buildSceneHint(input: {
  explicitSceneHint?: string;
  sector: string;
  gradingLook?: string | null;
}): string {
  const parts = [
    input.explicitSceneHint?.trim(),
    getSectorBackgroundScenePrompt(input.sector),
    input.gradingLook ? `${input.gradingLook} color grading` : '',
  ].filter(Boolean);
  return parts.join(' | ').slice(0, 420);
}

export function resolveFalBrandInput(input: {
  brandTheme: Record<string, unknown> | null | undefined;
  templateLibrary?: BrandTemplateLibrary | null;
  librarySlotKey?: string | null;
  tokens: BrandProductionTokens;
  sector: string;
  caption?: string;
  headline?: string;
  referencePhotoUrl?: string;
  sceneHint?: string;
  format: FalDesignChannel;
  /** Brand visual DNA text (from brand_contexts.visual_dna). */
  visualDna?: string;
  /** Brand tone phrase (from brand_contexts.brand_tone), e.g. "samimi, sıcak". */
  brandTone?: string;
  /** Brand description / about text (from brand_contexts.description). */
  brandDescription?: string;
  /** Agent + designer brief directives (from resolveFalDesignPromptContext). */
  designBriefDirectives?: string[];
  /** Ad-hoc New Brief — keep scene hint focused on user intent, not sector boilerplate. */
  preferExplicitSceneHint?: boolean;
  /** Post-specific mood (photo_mood, visual_direction). */
  postMood?: string;
}): ResolvedFalBrandInput {
  const themeRecord = (input.brandTheme ?? null) as Record<string, unknown> | null;
  const theme = themeRecord as BrandTheme | Record<string, unknown> | null;
  const typographyConfig = readTypographyConfig(themeRecord);
  const postDefaults = readPostDefaults(themeRecord);
  const slot = input.librarySlotKey
    ? input.templateLibrary?.slots.find((item) => item.key === input.librarySlotKey)
    : undefined;
  const isVertical = input.format === 'story' || input.format === 'reel';
  const templateId = isVertical ? slot?.storyTemplateId : undefined;
  const posterTemplateId = input.format === 'post' ? slot?.posterTemplateId : undefined;
  const slotTypography = slot
    ? resolveSlotRenderTypography({
        slot: {
          fontMode: slot.fontMode,
          fontPersonality: slot.fontPersonality,
          headingFont: slot.headingFont,
          bodyFont: slot.bodyFont,
          format: isVertical ? 'story' : 'post',
          storyTemplateId: slot.storyTemplateId,
          posterTemplateId: slot.posterTemplateId,
        },
        templateId: templateId ?? posterTemplateId,
        format: isVertical ? 'story' : 'post',
        brandHeadingFont: input.tokens.headingFont,
        brandBodyFont: input.tokens.bodyFont,
        sector: input.sector,
      })
    : null;

  const explicitAccent = typographyConfig?.accent_color ?? postDefaults?.accent_color;
  const visualDnaTone = distillBrandSoul({
    visualDna: input.visualDna,
    brandTone: input.brandTone,
    brandDescription: input.brandDescription,
  });
  const vibe = resolveTypographyVibeFromContext({
    caption: input.caption,
    headline: input.headline,
    sector: input.sector,
    brandVibe: typographyConfig?.vibe ?? null,
    visualDnaTone,
    postMood: input.postMood,
    lockPremiumVibe: Boolean(visualDnaTone?.trim()) || /beach|club|hotel|resort|spa|fine_dining/i.test(input.sector ?? ''),
  });
  const backgroundStyle: TypographyBackgroundStyle = resolveFalTemplateBackgroundStyle({
    theme: themeRecord,
    referencePhotoUrl: input.referencePhotoUrl,
  });
  const antiPatterns = [
    ...getSectorImageNegativeGuards(input.sector),
    ...(((themeRecord?.anti_patterns ?? themeRecord?.antiPatterns) as string[] | undefined) ?? []),
  ]
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 8);

  const brandColors = {
    primary: input.tokens.primaryColor,
    accent: explicitAccent || input.tokens.accentColor,
  };

  const promptDirectives = [
    ...(input.designBriefDirectives ?? []),
    buildBrandColorLockDirective(brandColors),
    buildCaptionSceneDirective(input.caption),
    describeSlotTypography({
      mode: slotTypography?.fontMode,
      headingFont: slotTypography?.headingFont,
      bodyFont: slotTypography?.bodyFont,
      fontPersonality: slotTypography?.fontPersonality,
    }),
    describeTextEffect(typographyConfig?.text_effect ?? postDefaults?.text_effect),
    describeLogoTreatment(resolveFalTemplateProductionSettings(themeRecord).logo_treatment),
    buildTemplateColorDirective({
      templateId,
      posterTemplateId,
      tokens: input.tokens,
    }),
    antiPatterns.length
      ? `Avoid these brand and sector anti-patterns: ${antiPatterns.join('; ')}.`
      : undefined,
  ].filter((item): item is string => Boolean(item));

  return {
    brandColors,
    vibe,
    backgroundStyle,
    sceneHint: input.preferExplicitSceneHint
      ? (input.sceneHint?.trim() || undefined)
      : buildSceneHint({
          explicitSceneHint: input.sceneHint,
          sector: input.sector,
          gradingLook: (theme?.grading as Record<string, unknown> | undefined)?.look as string | undefined,
        }) || undefined,
    promptDirectives,
    visualDnaTone,
    templateId,
    posterTemplateId,
    designIntensityLevel: resolveFalTemplateIntensityForChannel(themeRecord, input.format),
  };
}
