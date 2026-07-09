/**
 * Fal feed production — before/after simulation for a single brief idea.
 *
 * Pure functions only (no I/O). Used by vitest + scripts/fal-feed-before-after.mts
 * to compare CURRENT pipeline behavior vs PROPOSED improvements before code lands.
 */
import {
  buildDesignedVideoReelDesignCardPrompt,
  resolveTypographyVibeFromContext,
} from '@/lib/fal-designer-production';
import { distillBrandSoul, resolveFalBrandInput } from '@/lib/fal-brand-input';
import type { BrandProductionTokens } from '@/lib/brand-production-tokens';
import {
  CALENDAR_GALLERY_DESIGN_INTENSITY,
  normalizeCalendarPlanToProductionIdea,
  resolveCalendarSlotAssignment,
} from '@/lib/calendar-production-pack';
import {
  resolveFalDesignIntensityForChannel,
  type FalDesignIntensityLevel,
} from '@/lib/fal-design-intensity';
import { getVibePromptSpec } from '@/lib/fal-typography-design';
import type { TypographyVibe } from '@/types/brand-theme';

// ── Fixture: Yula — New Citrus Cocktail Launch (calendar story) ─────────────

export const YULA_NEW_CITRUS_CALENDAR_PLAN: Record<string, unknown> = {
  event_name: 'New Citrus Cocktail Launch',
  tagline: 'Taste the essence of Bodrum',
  content_brief:
    'Showcase our refreshing new citrus cocktail featuring local Bodrum mandarins. '
    + 'The visual should highlight the vibrant colors of the drink against a bar backdrop.',
  photo_mood: 'bright and inviting bar scene with a focus on the cocktail',
  date: 'June 25, 2026',
  time: '5 PM',
  format: 'story',
  announcement_type: 'product_reveal',
  priority: 'must_post',
};

export const YULA_VISUAL_DNA_SAMPLE = [
  '**Brand**: Yula Bodrum',
  '**Colors**: The color scheme is warm and inviting, featuring earthy tones like terracotta and teal, complemented by soft blues and sandy neutrals.',
  '**Palette**: #F4A261 · #264653 · #E9C46A · #2A9D8F',
  '**Lighting**: The lighting is predominantly natural, capturing the warm glow of sunlight and enhancing the vibrant colors.',
  '**Materials**: Natural materials such as wood and stone create an inviting atmosphere.',
].join('\n');

export const YULA_TOKENS: BrandProductionTokens = {
  headingFont: 'Playfair Display',
  bodyFont: 'Inter',
  primaryColor: '#264653',
  accentColor: '#E9C46A',
  textColor: '#ffffff',
  shadowColor: '#2c1a0e',
  headlineColor: '#ffffff',
  subtitleColor: 'rgba(255,255,255,0.88)',
  overlayColor: '#264653',
  overlayOpacity: 0.22,
  announcementKit: {
    primaryColor: '#264653',
    accentColor: '#E9C46A',
    textColor: '#ffffff',
    headlineColor: '#ffffff',
    shadowColor: '#2c1a0e',
    headingFontStack: "'Playfair Display', serif",
    bodyFontStack: "'Inter', sans-serif",
    logoUrl: null,
    brandName: 'Yula Bodrum',
    themeSource: 'simulation',
  },
  sources: ['simulation'],
};

/** Current DB-like brand_theme — typography_design missing (typical pilot gap). */
export const YULA_CURRENT_BRAND_THEME: Record<string, unknown> = {
  source: 'visual_dna',
  palette: { primary: '#264653', accent: '#E9C46A' },
  fal_design_intensity: { story: 'balanced', reel: 'balanced', post: 'balanced' },
};

/** Proposed tenant profile — locked vibe + channel intensity + announcement routing. */
export const YULA_PROPOSED_BRAND_THEME: Record<string, unknown> = {
  ...YULA_CURRENT_BRAND_THEME,
  typography_design: {
    vibe: 'warm_coastal',
    text_effect: 'soft_shadow',
    background_style: 'photo_overlay',
    logo_treatment: 'watermark',
  },
  fal_design_intensity: {
    story: 'photo_first',
    reel: 'photo_first',
    post: 'photo_first',
  },
};

export const YULA_GALLERY_MATCH = {
  url: 'https://yulabodrum.com/galeri/10.webp',
  score: 58,
  reason: 'semantic_match_after_meta',
};

/** Keep in sync with `FAL_GROUNDED_GALLERY_MIN_SCORE` in gpt-enhance-policy.ts (GIS bar). */
export const FAL_GALLERY_MATCH_MIN_SCORE = 55;
export const FAL_BRS_MIN_FOR_PRODUCE = 70;

// ── Types ─────────────────────────────────────────────────────────────────────

export type FalFeedSimulationMode = 'current' | 'proposed';

export interface FalFeedSimulationInput {
  calendarPlan: Record<string, unknown>;
  brandName: string;
  sector: string;
  brandTheme: Record<string, unknown>;
  visualDna: string;
  tokens: BrandProductionTokens;
  galleryMatchScore?: number;
  galleryUrl?: string;
  brandReadinessScore?: number;
}

export interface FalFeedProductionPlan {
  mode: FalFeedSimulationMode;
  slotRole: string;
  pipeline: string;
  format: 'story' | 'post';
  engine: 'gpt_image_designed' | 'fal_ideogram' | 'blocked';
  intensity: FalDesignIntensityLevel;
  intensitySource: string;
  resolvedVibe: TypographyVibe;
  vibeSource: string;
  librarySlotKey?: string;
  headline: string;
  subtitle?: string;
  galleryUrl?: string;
  galleryMatchScore?: number;
  designCardPrompt: string;
  promptLength: number;
  promptConflicts: string[];
  productionGate: { passed: boolean; reason: string };
  artifactMetadata: Record<string, unknown>;
}

export interface FalFeedBeforeAfterComparison {
  briefId: string;
  briefLabel: string;
  before: FalFeedProductionPlan;
  after: FalFeedProductionPlan;
  deltas: Array<{ field: string; before: string; after: string; impact: string }>;
}

// ── Proposed-only helpers (future production behavior) ────────────────────────

/** Announcement-aware intensity — calendar rows no longer one-size photo_first. */
export function resolveProposedCalendarIntensity(
  announcementType: string,
  channel: 'story' | 'post',
  theme: Record<string, unknown>,
): { level: FalDesignIntensityLevel; source: string } {
  const fromTheme = resolveFalDesignIntensityForChannel(theme, channel);
  const key = announcementType.toLowerCase().replace(/\s+/g, '_');
  const announcementOverrides: Record<string, FalDesignIntensityLevel> = {
    product_reveal: 'photo_first',
    venue_showcase: 'photo_first',
    behind_the_scenes: 'photo_first',
    event_teaser: 'elegant_light',
    offer_campaign: 'designed',
    social_proof: 'elegant_light',
  };
  const override = announcementOverrides[key];
  if (override) {
    return { level: override, source: `announcement:${key}` };
  }
  return { level: fromTheme, source: `brand_theme.fal_design_intensity.${channel}` };
}

export function detectFalPromptConflicts(
  prompt: string,
  intensity: FalDesignIntensityLevel,
): string[] {
  const conflicts: string[] = [];
  const wantsSmallType = /small, refined caption line only|minimal corner caption|tiny brand mark only/i.test(prompt);
  const wantsBoldHeadline = /Headline "[^"]+" in [^.]+\./i.test(prompt);
  const wantsLargeBlocks = /no large blocks|no poster blocks/i.test(prompt);
  const hasSectorNightEnergy = /neon-glow accents|nightlife energy|speakeasy/i.test(prompt);

  if (intensity === 'photo_first' && wantsSmallType && wantsBoldHeadline) {
    conflicts.push(
      'photo_first asks for minimal caption-only type, but TYPOGRAPHY STANDARD demands full custom headline letterforms.',
    );
  }
  if (intensity === 'photo_first' && wantsLargeBlocks && /Supporting tagline/i.test(prompt)) {
    conflicts.push(
      'photo_first forbids large text blocks, but prompt still instructs a DESIGNED secondary tagline line.',
    );
  }
  if (hasSectorNightEnergy && /warm_coastal|handwritten|coastal typography/i.test(prompt)) {
    conflicts.push(
      'Sector style block pushes nightlife/neon energy while resolved vibe is coastal/handwritten.',
    );
  }
  return conflicts;
}

/** Harmonized photo_first typography — proposed prompt patch (tests first, prod later). */
export function buildHarmonizedPhotoFirstTypographyBlock(input: {
  vibe: TypographyVibe;
  subtitle?: string;
  brandName?: string;
}): string[] {
  const spec = getVibePromptSpec(input.vibe);
  const lines = [
    'TYPOGRAPHY (photo-first): Keep the gallery photo as absolute hero — 85–95% of frame untouched.',
    `If any text appears: ONE small designed tagline only, max 6 words, in ${spec.fontDescription}.`,
    `Style energy: ${spec.styleDirective} — subtle corner placement or thin scrim, never poster-scale blocks.`,
    'Do NOT render a large headline block. No event-card layout. No date/time baked into the image.',
  ];
  if (input.subtitle?.trim()) {
    lines.push(
      `Preferred tagline text (exact): "${input.subtitle.trim().slice(0, 48)}" — small, refined, vibe-aligned.`,
    );
  }
  if (input.brandName) {
    lines.push(`Optional: tiny "${input.brandName}" watermark — max 8% frame width.`);
  }
  return lines;
}

export function harmonizePhotoFirstDesignPrompt(
  prompt: string,
  input: {
    vibe: TypographyVibe;
    subtitle?: string;
    brandName?: string;
  },
): string {
  const withoutLegacyTypography = prompt
    .replace(
      /TYPOGRAPHY STANDARD \(MANDATORY\):[\s\S]*?(?=SAFE ZONE \(MANDATORY\):|BRAND COLORS:|═══ CRITICAL TEXT LOCK ═══|$)/,
      '',
    )
    .replace(
      /SECTOR STYLE \(beach\/night club\):[\s\S]*?(?=PHOTO HERO \(MAXIMUM\):|PHOTO FIDELITY \(MAXIMUM\):|PHOTO HERO:|PHOTO FIDELITY:)/,
      'SECTOR STYLE (beach club): Sun-washed coastal restraint — warm natural photo hero, subtle brand accents only. ',
    )
    .replace(/\s+/g, ' ')
    .trim();

  const harmonized = buildHarmonizedPhotoFirstTypographyBlock(input).join(' ');
  return `${withoutLegacyTypography} ${harmonized}`.replace(/\s+/g, ' ').trim();
}

function describeVibeSource(input: {
  brandTheme: Record<string, unknown>;
  visualDna: string;
  postMood?: string;
  sector: string;
  caption?: string;
  headline?: string;
}): string {
  const brandVibe = (input.brandTheme.typography_design as { vibe?: TypographyVibe } | undefined)?.vibe ?? null;
  if (brandVibe) return 'brand_theme.typography_design.vibe';

  const soul = distillBrandSoul({ visualDna: input.visualDna, brandDescription: '' });
  if (soul) {
    const withSoul = resolveTypographyVibeFromContext({
      brandVibe: null,
      visualDnaTone: soul,
      sector: input.sector,
      postMood: input.postMood,
      caption: input.caption,
      headline: input.headline,
    });
    const withoutSoul = resolveTypographyVibeFromContext({
      brandVibe: null,
      sector: input.sector,
      postMood: input.postMood,
      caption: input.caption,
      headline: input.headline,
    });
    if (withSoul !== withoutSoul) return 'visual_dna.soul';
  }

  if (input.postMood?.trim()) {
    const withMood = resolveTypographyVibeFromContext({
      brandVibe: null,
      postMood: input.postMood,
      sector: input.sector,
      caption: input.caption,
      headline: input.headline,
    });
    const withoutMood = resolveTypographyVibeFromContext({
      brandVibe: null,
      sector: input.sector,
      caption: input.caption,
      headline: input.headline,
    });
    if (withMood !== withoutMood) return 'idea.photo_mood';
  }

  const withCaption = resolveTypographyVibeFromContext({
    brandVibe: null,
    sector: input.sector,
    caption: input.caption,
    headline: input.headline,
  });
  const sectorOnly = resolveTypographyVibeFromContext({
    brandVibe: null,
    sector: input.sector,
  });
  if (withCaption !== sectorOnly) return 'caption.keyword';

  return 'sector.default';
}

function buildProductionGate(input: {
  mode: FalFeedSimulationMode;
  galleryMatchScore?: number;
  brandReadinessScore?: number;
}): { passed: boolean; reason: string } {
  if (input.mode === 'current') {
    return { passed: true, reason: 'no_gate (current pipeline always produces)' };
  }
  const brs = input.brandReadinessScore ?? 100;
  if (brs < FAL_BRS_MIN_FOR_PRODUCE) {
    return {
      passed: false,
      reason: `brand_readiness ${brs} < ${FAL_BRS_MIN_FOR_PRODUCE}`,
    };
  }
  const score = input.galleryMatchScore ?? 0;
  if (score < FAL_GALLERY_MATCH_MIN_SCORE) {
    return {
      passed: false,
      reason: `gallery_match ${score} < ${FAL_GALLERY_MATCH_MIN_SCORE}`,
    };
  }
  return { passed: true, reason: 'readiness + gallery gates passed' };
}

function buildArtifactMetadata(plan: Omit<FalFeedProductionPlan, 'artifactMetadata'>): Record<string, unknown> {
  const base = {
    production_route: 'fal_ai',
    fal_design_engine: plan.engine,
    production_role: plan.slotRole,
    headline: plan.headline,
    design_intensity: plan.intensity,
  };
  if (plan.mode === 'proposed') {
    return {
      ...base,
      resolved_vibe: plan.resolvedVibe,
      vibe_source: plan.vibeSource,
      intensity_source: plan.intensitySource,
      gallery_match_score: plan.galleryMatchScore ?? null,
      gallery_url: plan.galleryUrl ?? null,
      prompt_conflict_count: plan.promptConflicts.length,
      simulation_mode: 'proposed',
    };
  }
  return {
    ...base,
    simulation_mode: 'current',
  };
}

export function simulateFalFeedProduction(
  mode: FalFeedSimulationMode,
  input: FalFeedSimulationInput,
): FalFeedProductionPlan {
  const idea = normalizeCalendarPlanToProductionIdea(input.calendarPlan, 0);
  const assignment = resolveCalendarSlotAssignment(idea);
  const ideaFormat = String(idea.format ?? 'post').toLowerCase();
  const format: 'story' | 'post' = ideaFormat === 'story' ? 'story' : 'post';
  const channel = format === 'story' ? 'story' as const : 'post' as const;
  const headline = String(idea.headline ?? '');
  const subtitle = String(idea.tagline ?? idea.subline ?? '').trim() || undefined;
  const caption = String(idea.caption ?? '');
  const photoMood = String(idea.photo_mood ?? idea.mood ?? '');
  const announcementType = String(idea.calendar_announcement_type ?? '');

  const falBrand = resolveFalBrandInput({
    brandTheme: input.brandTheme,
    tokens: input.tokens,
    sector: input.sector,
    caption,
    headline,
    format: channel,
    visualDna: input.visualDna,
    brandDescription: input.brandName,
    postMood: photoMood,
    referencePhotoUrl: input.galleryUrl,
    preferExplicitSceneHint: true,
    sceneHint: String(assignment.fal_design_hint ?? ''),
  });

  const intensityBundle = mode === 'current'
    ? {
        level: CALENDAR_GALLERY_DESIGN_INTENSITY,
        source: 'calendar hardcoded photo_first',
      }
    : resolveProposedCalendarIntensity(announcementType, channel, input.brandTheme);

  const vibeSource = describeVibeSource({
    brandTheme: input.brandTheme,
    visualDna: input.visualDna,
    postMood: photoMood,
    sector: input.sector,
    caption,
    headline,
  });

  const gate = buildProductionGate({
    mode,
    galleryMatchScore: input.galleryMatchScore,
    brandReadinessScore: input.brandReadinessScore,
  });

  let designCardPrompt = buildDesignedVideoReelDesignCardPrompt({
    vibe: falBrand.vibe,
    headline,
    subtitle,
    caption,
    brandColors: falBrand.brandColors,
    brandName: input.brandName,
    sector: input.sector,
    aspectRatio: '9:16',
    brandDirectives: falBrand.promptDirectives,
    visualDnaTone: falBrand.visualDnaTone,
    briefMood: photoMood,
    designIntensityLevel: intensityBundle.level,
    sceneHint: falBrand.sceneHint,
  });

  if (mode === 'proposed' && intensityBundle.level === 'photo_first') {
    designCardPrompt = harmonizePhotoFirstDesignPrompt(designCardPrompt, {
      vibe: falBrand.vibe,
      subtitle,
      brandName: input.brandName,
    });
  }

  const promptConflicts = detectFalPromptConflicts(designCardPrompt, intensityBundle.level);

  const engine: FalFeedProductionPlan['engine'] = !gate.passed
    ? 'blocked'
    : input.galleryUrl
      ? 'gpt_image_designed'
      : 'fal_ideogram';

  const partial: Omit<FalFeedProductionPlan, 'artifactMetadata'> = {
    mode,
    slotRole: assignment.slot_role,
    pipeline: assignment.pipeline,
    format,
    engine,
    intensity: intensityBundle.level,
    intensitySource: intensityBundle.source,
    resolvedVibe: falBrand.vibe,
    vibeSource,
    librarySlotKey: assignment.library_slot_key,
    headline,
    subtitle,
    galleryUrl: input.galleryUrl,
    galleryMatchScore: input.galleryMatchScore,
    designCardPrompt,
    promptLength: designCardPrompt.length,
    promptConflicts,
    productionGate: gate,
  };

  return {
    ...partial,
    artifactMetadata: buildArtifactMetadata(partial),
  };
}

export function compareFalFeedBeforeAfter(
  briefId: string,
  briefLabel: string,
  before: FalFeedProductionPlan,
  after: FalFeedProductionPlan,
): FalFeedBeforeAfterComparison {
  const deltas: FalFeedBeforeAfterComparison['deltas'] = [];

  const add = (field: string, impact: string) => {
    const b = String((before as unknown as Record<string, unknown>)[field] ?? '');
    const a = String((after as unknown as Record<string, unknown>)[field] ?? '');
    if (b !== a) deltas.push({ field, before: b, after: a, impact });
  };

  add('resolvedVibe', 'Typography character in GPT-image prompt changes.');
  add('vibeSource', 'Explains whether vibe is stable (tenant) or inferred.');
  add('intensity', 'Controls photo-hero vs designed-poster balance.');
  add('intensitySource', 'Intensity from hardcoded calendar vs brand profile.');
  add('engine', 'Blocked gate vs grounded GPT-image path.');
  add('promptLength', 'Shorter harmonized prompt reduces model confusion.');
  if (before.promptConflicts.length !== after.promptConflicts.length
    || before.promptConflicts.join('|') !== after.promptConflicts.join('|')) {
    deltas.push({
      field: 'promptConflicts',
      before: before.promptConflicts.join(' | ') || '(none)',
      after: after.promptConflicts.join(' | ') || '(none)',
      impact: 'Fewer conflicts → model follows photo-first more reliably.',
    });
  }
  if (before.productionGate.passed !== after.productionGate.passed) {
    deltas.push({
      field: 'productionGate',
      before: before.productionGate.reason,
      after: after.productionGate.reason,
      impact: 'Weak gallery/readiness no longer silently produces bad output.',
    });
  }

  return { briefId, briefLabel, before, after, deltas };
}

export function simulateYulaNewCitrusBeforeAfter(
  overrides?: Partial<FalFeedSimulationInput>,
): FalFeedBeforeAfterComparison {
  const base: FalFeedSimulationInput = {
    calendarPlan: YULA_NEW_CITRUS_CALENDAR_PLAN,
    brandName: 'Yula Bodrum',
    sector: 'beach_club',
    brandTheme: YULA_CURRENT_BRAND_THEME,
    visualDna: YULA_VISUAL_DNA_SAMPLE,
    tokens: YULA_TOKENS,
    galleryMatchScore: YULA_GALLERY_MATCH.score,
    galleryUrl: YULA_GALLERY_MATCH.url,
    brandReadinessScore: 85,
    ...overrides,
  };

  const before = simulateFalFeedProduction('current', base);
  const after = simulateFalFeedProduction('proposed', {
    ...base,
    brandTheme: YULA_PROPOSED_BRAND_THEME,
  });

  return compareFalFeedBeforeAfter(
    'yula-new-citrus-cocktail-launch',
    'New Citrus Cocktail Launch (calendar story)',
    before,
    after,
  );
}
