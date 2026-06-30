/**
 * fal.ai Design Brief — agent → prompt bridge.
 *
 * MULTI-TENANT: All inputs are per-workspace (brandTheme, sector, agent VPS).
 * No brand or venue names are embedded in this module.
 */

import type { PremiumCompositionMeta } from '@/app/api/auto-produce/remotion-render-phase';
import {
  buildCanvaArchetypeDirective,
  getCanvaArchetype,
  resolveCanvaArchetype,
  type CanvaArchetypeId,
} from './canva-archetype-catalog';
import {
  formatFalLogoPlacementDirective,
  parseFalLogoPosition,
  resolveFalLogoPlacement,
  type FalLogoPosition,
  type ResolvedFalLogoPlacement,
} from './fal-logo-placement';

export interface FalDesignBrief {
  /** One-line creative hook — what makes this design distinct from generic templates. */
  creativeHook: string;
  /** Canva-style layout pattern for the frame. */
  layoutPattern: string;
  /** How typography should behave on the canvas. */
  typographyMode: string;
  /** Where the real gallery photo lives (when grounded). */
  photoZone?: string;
  /** Decorative devices the designer wants visible. */
  graphicAccents: string[];
  /** Single sentence linking caption message → visual treatment. */
  captionVisualBridge: string;
  /** Designer rationale — why this layout fits the post. */
  designerRationale?: string;
  /** What must NOT look like stock / amateur. */
  avoidPatterns: string[];
  /** Motion cue for reel start frames (Kling). */
  motionCue?: string;
  /** Agent-stated differentiator vs generic templates. */
  differentiator?: string;
  /** Resolved Canva Pro archetype id + name. */
  canvaArchetypeId?: string;
  canvaArchetypeName?: string;
  /** Agent free-text logo zone (art director). */
  logoZone?: string;
  /** Parsed logo anchor enum when agent supplies it. */
  logoPosition?: FalLogoPosition;
  /** Resolved logo anchor for this layout (agent > archetype > brand). */
  logoPlacement?: ResolvedFalLogoPlacement;
}

export interface ResolveFalDesignPromptContextInput {
  caption?: string;
  headline?: string;
  mood?: string;
  strategicPurpose?: string;
  templateUseCase?: string;
  format: 'post' | 'reel' | 'story';
  slotRole?: string;
  sceneHint?: string;
  layoutFamilyHint?: string;
  falDesignHint?: string;
  referencePhotoUrl?: string;
  premiumComposition?: PremiumCompositionMeta | null;
  sector?: string;
  /** Archetypes already used in this mission — avoids repeating the same layout. */
  usedArchetypeIds?: string[];
  /** 0-based fal designer slot index within the mission batch. */
  falSlotOrdinal?: number;
  /** Tenant typography_design.preferred_canva_archetypes override. */
  tenantPreferredArchetypes?: CanvaArchetypeId[];
  /** Agent visual_production_spec.fal_design_brief (snake or camel). */
  agentFalDesignBrief?: Record<string, unknown> | null;
  /** Brand Kit post defaults — logo_position fallback. */
  brandLogoPosition?: FalLogoPosition | null;
}

const FAL_AVOID_DEFAULTS = [
  'amateur 50/50 photo + flat beige block with centered generic type',
  'unreadable text over busy photos without a color panel or scrim',
  'stock watermark badges or lorem ipsum filler',
  'identical layout to every other post in the feed — this slot must feel custom',
];

const COMPOSITION_LAYOUT: Record<string, Partial<FalDesignBrief>> = {
  oversized_typography: {
    layoutPattern: 'full_bleed_type — headline occupies 40–70% of canvas as design element',
    typographyMode: 'oversized_display — text IS the hero, photo supports',
    graphicAccents: ['gradient wash behind type', 'accent underline'],
  },
  hero_object: {
    layoutPattern: 'hero_object_center — photo/product dominates, type in dedicated panel',
    typographyMode: 'minimal_overlay — short punchy headline',
    photoZone: 'center or lower 60% — object/venue stays natural',
    graphicAccents: ['soft shadow frame', 'accent corner mark'],
  },
  editorial_layout: {
    layoutPattern: 'magazine_grid — asymmetric editorial split',
    typographyMode: 'editorial_serif — strong hierarchy headline + subline',
    graphicAccents: ['thin rule line', 'category label strip'],
  },
  poster_design: {
    layoutPattern: 'poster_stack — print-worthy bold blocks',
    typographyMode: 'bold_display — high contrast stack',
    graphicAccents: ['geometric shape', 'accent bar', 'grain texture'],
  },
  graphic_layering: {
    layoutPattern: 'layered_graphics — shapes over photo zones',
    typographyMode: 'bold_display with layered accents',
    graphicAccents: ['circle frame', 'accent line', 'gradient mesh shape', 'paper texture hint'],
  },
  luxury_minimalism: {
    layoutPattern: 'minimal_luxury — generous negative space',
    typographyMode: 'whisper_light serif — restrained elegance',
    graphicAccents: ['single accent line', 'subtle brand badge'],
  },
  visual_metaphor: {
    layoutPattern: 'visual_metaphor — unexpected asymmetric composition',
    typographyMode: 'editorial_display — cinematic mood',
    graphicAccents: ['cinematic vignette', 'accent shape'],
  },
};

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((item) => str(item)).filter(Boolean);
}

function distillCaptionHook(caption: string): string {
  const clean = caption
    .replace(/[\u{1F600}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/#\S+/g, '')
    .replace(/@\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';
  const first = clean.split(/[.!?\n]/)[0]?.trim() ?? clean;
  return first.slice(0, 120);
}

function inferTemplateUseCase(input: ResolveFalDesignPromptContextInput): string {
  const explicit = str(input.templateUseCase).toLowerCase();
  if (explicit) return explicit;
  const text = `${input.headline ?? ''} ${input.caption ?? ''} ${input.strategicPurpose ?? ''}`.toLowerCase();
  if (/%|indirim|kampanya|offer|discount|fırsat|promo/.test(text)) return 'campaign_offer';
  if (/etkinlik|event|konser|dj|live|açılış|opening|tarih/.test(text)) return 'event_announcement';
  if (/müşteri|review|testimonial|yorum|social proof|mutlu/.test(text)) return 'social_proof';
  if (/ürün|product|menu|tabak|yemek|içecek/.test(text)) return 'product_highlight';
  if (/eğitim|ipucu|how to|rehber|learn/.test(text)) return 'educational_post';
  if (/behind|kulis|sahne arkası|ekip/.test(text)) return 'behind_the_scenes';
  return 'daily_story';
}

function parseAgentFalDesignBrief(raw: Record<string, unknown> | null | undefined): Partial<FalDesignBrief> | null {
  if (!raw || typeof raw !== 'object') return null;
  const hook = str(raw.creative_hook ?? raw.creativeHook);
  const layout = str(raw.layout_pattern ?? raw.layoutPattern);
  const typo = str(raw.typography_mode ?? raw.typographyMode);
  const bridge = str(raw.caption_visual_bridge ?? raw.captionVisualBridge);
  const logoZone = str(raw.logo_zone ?? raw.logoZone);
  const logoPosition = parseFalLogoPosition(raw.logo_position ?? raw.logoPosition);
  if (!hook && !layout && !bridge && !logoZone && !logoPosition) return null;
  return {
    creativeHook: hook,
    layoutPattern: layout,
    typographyMode: typo,
    photoZone: str(raw.photo_zone ?? raw.photoZone) || undefined,
    graphicAccents: strArray(raw.graphic_accents ?? raw.graphicAccents),
    captionVisualBridge: bridge,
    designerRationale: str(raw.designer_rationale ?? raw.designerRationale) || undefined,
    differentiator: str(raw.differentiator) || undefined,
    motionCue: str(raw.motion_cue ?? raw.motionCue) || undefined,
    avoidPatterns: strArray(raw.avoid ?? raw.avoid_patterns ?? raw.avoidPatterns),
    canvaArchetypeId: str(raw.canva_archetype ?? raw.canvaArchetype) || undefined,
    logoZone: logoZone || undefined,
    logoPosition: logoPosition ?? undefined,
  };
}

function fromPremiumComposition(pc: PremiumCompositionMeta): Partial<FalDesignBrief> {
  const base = COMPOSITION_LAYOUT[pc.compositionType] ?? {};
  const accents = [
    ...(base.graphicAccents ?? []),
    ...(pc.graphicElements ?? []),
  ].filter(Boolean);
  return {
    ...base,
    creativeHook: pc.visualStory ?? pc.compositionDescription?.slice(0, 140),
    captionVisualBridge: pc.compositionDescription,
    designerRationale: pc.creativeDirection,
    typographyMode: base.typographyMode ?? pc.typographyApproach,
    layoutPattern: base.layoutPattern ?? pc.layoutStrategy,
    graphicAccents: [...new Set(accents)].slice(0, 6),
    motionCue: pc.motionApproach && pc.motionApproach !== 'static' ? pc.motionApproach : undefined,
  };
}

function applyCanvaArchetype(
  brief: FalDesignBrief,
  archetype: ReturnType<typeof getCanvaArchetype> & object,
  hasPhoto: boolean,
): FalDesignBrief {
  return {
    ...brief,
    canvaArchetypeId: archetype.id,
    canvaArchetypeName: archetype.name,
    layoutPattern: archetype.layoutPattern,
    typographyMode: archetype.typographyMode,
    graphicAccents: [...new Set([...brief.graphicAccents, ...archetype.graphicAccents])].slice(0, 8),
    photoZone: hasPhoto
      ? (archetype.photoZone ?? brief.photoZone)
      : brief.photoZone,
    motionCue: archetype.motionCue ?? brief.motionCue,
    designerRationale: brief.designerRationale
      ? `${brief.designerRationale} | Canva archetype: ${archetype.name}`
      : `Canva archetype: ${archetype.name} — ${archetype.description}`,
  };
}

function synthesizeFalDesignBrief(
  input: ResolveFalDesignPromptContextInput,
  archetype: NonNullable<ReturnType<typeof getCanvaArchetype>>,
): FalDesignBrief {
  const useCase = inferTemplateUseCase(input);
  const hook = distillCaptionHook(input.caption ?? '') || str(input.headline).slice(0, 80);
  const isReel = input.format === 'reel' || input.format === 'story';
  const hasPhoto = Boolean(input.referencePhotoUrl);

  const base: FalDesignBrief = {
    creativeHook: hook
      ? `Turn "${hook}" into a scroll-stopping ${isReel ? 'Reels' : 'feed'} design — Canva Pro "${archetype.name}" energy, not a raw photo dump.`
      : `Premium ${isReel ? 'vertical reel' : 'feed post'} — Canva Pro "${archetype.name}" for "${str(input.headline).slice(0, 50)}"`,
    layoutPattern: archetype.layoutPattern,
    typographyMode: archetype.typographyMode,
    photoZone: hasPhoto
      ? (archetype.photoZone ?? 'lower 45–55% hero photo — natural venue/product pixels preserved')
      : undefined,
    graphicAccents: [...archetype.graphicAccents],
    captionVisualBridge: hook
      ? `Visual must express: ${hook} (use case: ${useCase.replace(/_/g, ' ')})`
      : `Design must communicate the headline "${str(input.headline).slice(0, 60)}" at a glance`,
    designerRationale: input.falDesignHint || input.sceneHint || archetype.description,
    avoidPatterns: [...FAL_AVOID_DEFAULTS],
    motionCue: isReel
      ? (archetype.motionCue ?? 'gentle photo push-in + locked typography — creator reel intro energy')
      : undefined,
    canvaArchetypeId: archetype.id,
    canvaArchetypeName: archetype.name,
  };

  return applyCanvaArchetype(base, archetype, hasPhoto);
}

function mergeBrief(
  synthesized: FalDesignBrief,
  ...layers: Array<Partial<FalDesignBrief> | null | undefined>
): FalDesignBrief {
  const merged = { ...synthesized };
  for (const layer of layers) {
    if (!layer) continue;
    if (layer.creativeHook) merged.creativeHook = layer.creativeHook;
    if (layer.layoutPattern) merged.layoutPattern = layer.layoutPattern;
    if (layer.typographyMode) merged.typographyMode = layer.typographyMode;
    if (layer.photoZone) merged.photoZone = layer.photoZone;
    if (layer.captionVisualBridge) merged.captionVisualBridge = layer.captionVisualBridge;
    if (layer.designerRationale) merged.designerRationale = layer.designerRationale;
    if (layer.differentiator) merged.differentiator = layer.differentiator;
    if (layer.motionCue) merged.motionCue = layer.motionCue;
    if (layer.logoZone) merged.logoZone = layer.logoZone;
    if (layer.logoPosition) merged.logoPosition = layer.logoPosition;
    if (layer.graphicAccents?.length) {
      merged.graphicAccents = [...new Set([...merged.graphicAccents, ...layer.graphicAccents])].slice(0, 8);
    }
    if (layer.avoidPatterns?.length) {
      merged.avoidPatterns = [...new Set([...merged.avoidPatterns, ...layer.avoidPatterns])].slice(0, 6);
    }
  }
  return merged;
}

export function resolveFalDesignBrief(input: ResolveFalDesignPromptContextInput): FalDesignBrief {
  const useCase = inferTemplateUseCase(input);
  const archetype = resolveCanvaArchetype({
    format: input.format === 'story' ? 'story' : input.format,
    useCase,
    caption: input.caption,
    headline: input.headline,
    strategicPurpose: input.strategicPurpose,
    layoutFamilyHint: input.layoutFamilyHint,
    sector: input.sector,
    explicitArchetypeId: str(input.agentFalDesignBrief?.canva_archetype ?? input.agentFalDesignBrief?.canvaArchetype) || undefined,
    falDesignHint: input.falDesignHint,
    usedArchetypeIds: (input.usedArchetypeIds ?? []).filter(Boolean) as CanvaArchetypeId[],
    slotOrdinal: input.falSlotOrdinal,
    tenantPreferredArchetypes: input.tenantPreferredArchetypes,
  });

  const synthesized = synthesizeFalDesignBrief(input, archetype);
  const fromAgent = parseAgentFalDesignBrief(input.agentFalDesignBrief);
  const fromPremium = input.premiumComposition ? fromPremiumComposition(input.premiumComposition) : null;

  const falHintLayer: Partial<FalDesignBrief> | null = input.falDesignHint
    ? { designerRationale: input.falDesignHint }
    : null;

  const merged = mergeBrief(synthesized, fromPremium, fromAgent, falHintLayer);

  // Agent overrides layout but keep archetype id/name unless agent set canva_archetype
  if (!fromAgent?.canvaArchetypeId) {
    merged.canvaArchetypeId = archetype.id;
    merged.canvaArchetypeName = archetype.name;
  }

  const briefChannel = input.format === 'story' ? 'story' : input.format === 'reel' ? 'reel' : 'feed_post';
  merged.logoPlacement = resolveFalLogoPlacement({
    agentLogoPosition: merged.logoPosition,
    agentLogoZone: merged.logoZone,
    canvaArchetypeId: merged.canvaArchetypeId,
    layoutPattern: merged.layoutPattern,
    brandLogoPosition: input.brandLogoPosition ?? null,
    channel: briefChannel,
  });

  return merged;
}

export function buildFalDesignBriefDirectives(
  brief: FalDesignBrief,
  format: 'post' | 'reel' | 'story' = 'post',
): string[] {
  const channel = format === 'story' ? 'story' : format === 'reel' ? 'reel' : 'feed_post';
  const spec = brief.canvaArchetypeId ? getCanvaArchetype(brief.canvaArchetypeId) : undefined;
  const archetypeDirective = spec
    ? buildCanvaArchetypeDirective(spec, brief.motionCue ? 'reel' : 'post')
    : undefined;

  const lines = [
    archetypeDirective,
    `DESIGNER BRIEF: ${brief.creativeHook}`,
    `LAYOUT: ${brief.layoutPattern}`,
    `TYPOGRAPHY MODE: ${brief.typographyMode}`,
    `CAPTION → VISUAL: ${brief.captionVisualBridge}`,
    brief.photoZone ? `PHOTO ZONE: ${brief.photoZone}` : undefined,
    brief.graphicAccents.length
      ? `GRAPHIC ACCENTS (include visibly): ${brief.graphicAccents.join(', ')}.`
      : undefined,
    brief.designerRationale
      ? `DESIGNER RATIONALE: ${brief.designerRationale.slice(0, 200)}`
      : undefined,
    brief.differentiator
      ? `DIFFERENTIATOR: ${brief.differentiator.slice(0, 160)}`
      : undefined,
    brief.motionCue && brief.motionCue !== 'static'
      ? `MOTION CUE (start frame): ${brief.motionCue}`
      : undefined,
    brief.logoPlacement
      ? `LOGO PLACEMENT: ${formatFalLogoPlacementDirective(brief.logoPlacement, channel)}`
      : undefined,
    brief.avoidPatterns.length
      ? `DESIGNER REJECT LIST: ${brief.avoidPatterns.join('; ')}.`
      : undefined,
    'Evaluate as a senior social designer: hierarchy, negative space, and on-brand color must feel Canva Pro premium — never template stock, never plain system-font overlay text.',
  ];
  return lines.filter((item): item is string => Boolean(item));
}

export function resolveFalDesignPromptContext(
  input: ResolveFalDesignPromptContextInput,
): { brief: FalDesignBrief; promptDirectives: string[] } {
  const brief = resolveFalDesignBrief(input);
  return {
    brief,
    promptDirectives: buildFalDesignBriefDirectives(brief, input.format),
  };
}

/** Brand Kit default logo anchor (post_design_defaults.logo_position). */
export function readBrandLogoPosition(
  brandTheme: Record<string, unknown> | null | undefined,
): FalLogoPosition | null {
  const post = (brandTheme?.post_design_defaults ?? brandTheme?.postDesignDefaults) as
    | Record<string, unknown>
    | undefined;
  return parseFalLogoPosition(post?.logo_position ?? post?.logoPosition) ?? null;
}

/** Read tenant Canva archetype prefs from brand theme JSON (snake or camel). */
export function readTenantPreferredCanvaArchetypes(
  brandTheme: Record<string, unknown> | null | undefined,
): CanvaArchetypeId[] {
  const typo = (brandTheme?.typography_design ?? brandTheme?.typographyDesign) as
    | Record<string, unknown>
    | undefined;
  const raw = typo?.preferred_canva_archetypes ?? typo?.preferredCanvaArchetypes;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((id) => String(id).trim())
    .filter((id): id is CanvaArchetypeId => Boolean(getCanvaArchetype(id)));
}

/** Extract fal_design_brief from a raw ideation / VPS record. */
export function readAgentFalDesignBrief(
  idea: Record<string, unknown>,
): Record<string, unknown> | null {
  const vps = (idea.visual_production_spec ?? idea.visualProductionSpec) as Record<string, unknown> | undefined;
  if (!vps) return null;
  const raw = (vps.fal_design_brief ?? vps.falDesignBrief) as Record<string, unknown> | undefined;
  return raw && typeof raw === 'object' ? raw : null;
}
