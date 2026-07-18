/**
 * Preview-only brand signature pack — richer vibe/theme signals for A/B
 * template previews. Never wired into default mission / design-template
 * production unless an explicit experimental path opts in.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown, max = 220): string {
  const s = typeof value === 'string' ? value.trim() : '';
  return s ? s.slice(0, max) : '';
}

function strList(value: unknown, limit = 4): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .slice(0, limit);
}

function mergeDict(
  theme: Record<string, unknown> | null | undefined,
  vibe: Record<string, unknown> | null | undefined,
  key: string,
): Record<string, unknown> {
  const t = asRecord(theme?.[key]) ?? {};
  const v = asRecord(vibe?.[key]) ?? {};
  if (!Object.keys(t).length) return v;
  if (!Object.keys(v).length) return t;
  return { ...v, ...t };
}

export interface BrandSignatureDirectiveInput {
  brandName?: string;
  sector?: string;
  brandTheme?: Record<string, unknown> | null;
  brandVibeProfile?: Record<string, unknown> | null;
  brandTone?: string | null;
  visualStyle?: string | null;
  visualDna?: string | null;
}

export interface BrandSignaturePack {
  directives: string[];
  summary: {
    grading?: string;
    composition?: string;
    agencyLevel?: string;
    captionVoice?: string;
    typePersonality?: string;
  };
}

/**
 * Compact designer signature block from already-extracted vibe/theme fields.
 * Deterministic — no LLM. Safe to inject only on experimental preview paths.
 */
export function buildBrandSignaturePack(input: BrandSignatureDirectiveInput): BrandSignaturePack {
  const theme = input.brandTheme ?? null;
  const vibe = input.brandVibeProfile
    ?? asRecord(theme?.brand_vibe_profile)
    ?? asRecord(theme?.brandVibeProfile)
    ?? null;

  const grading = mergeDict(theme, vibe, 'grading');
  const composition = mergeDict(theme, vibe, 'composition');
  const typography = asRecord(theme?.typography)
    ?? asRecord(theme?.typography_design)
    ?? asRecord(theme?.typographyDesign)
    ?? asRecord(vibe?.typography)
    ?? {};
  const typographyDesign = asRecord(theme?.typography_design)
    ?? asRecord(theme?.typographyDesign)
    ?? {};

  const look = str(grading.look ?? grading.Look, 120);
  const lut = str(
    grading.lut_directive ?? grading.lutDirective ?? grading.lut,
    180,
  );
  const compositionLine = str(
    composition.primary_pattern
      ?? composition.primaryPattern
      ?? composition.framing_rules
      ?? composition.framingRules
      ?? composition.rules,
    200,
  );
  const agencyLevel = str(
    vibe?.what_makes_this_agency_level ?? vibe?.whatMakesThisAgencyLevel,
    240,
  );
  const captionVoice = strList(
    theme?.caption_voice_rules
      ?? theme?.captionVoiceRules
      ?? asRecord(vibe?.caption_voice)?.rules
      ?? vibe?.caption_voice,
    4,
  ).join('; ');
  const typePersonality = str(
    typography.personality
      ?? typographyDesign.vibe
      ?? typography.vibe,
    120,
  );
  const tone = str(input.brandTone, 140);
  const visualStyle = str(input.visualStyle, 160);
  const visualDna = str(input.visualDna, 280);

  const microBits = [
    look ? `grading=${look}` : '',
    lut ? `lut=${lut}` : '',
    compositionLine ? `framing=${compositionLine}` : '',
    typePersonality ? `type=${typePersonality}` : '',
  ].filter(Boolean);

  const lines = [
    `BRAND SIGNATURE (preview experiment): Design as if ${input.brandName || 'this brand'}'s art director signed every frame — not a generic ${input.sector || 'sector'} template recolor.`,
    look || lut
      ? `SIGNATURE GRADING: ${[look, lut].filter(Boolean).join(' · ')}. Apply grading feel to graphic layers, panels, and type color temperature — never recolor the locked gallery photo.`
      : '',
    compositionLine
      ? `SIGNATURE COMPOSITION: ${compositionLine}. Keep negative space, crop bias, and hierarchy consistent with this brand's framing language.`
      : '',
    agencyLevel
      ? `AGENCY-LEVEL TARGET: ${agencyLevel}. Prefer those specific craft moves over stock social-media layouts.`
      : '',
    captionVoice
      ? `CAPTION → VISUAL RHYTHM: ${captionVoice}. Short/sharp voice → bolder type hierarchy; poetic/long voice → sparser editorial spacing.`
      : '',
    typePersonality
      ? `TYPE PERSONALITY: ${typePersonality}. Let typography character (tracking, contrast, outline vs soft shadow) feel owned by this brand.`
      : '',
    tone ? `Tone lock: ${tone}.` : '',
    visualStyle ? `Visual style lock: ${visualStyle}.` : '',
    visualDna ? `Visual DNA anchor: ${visualDna}.` : '',
    microBits.length
      ? `MICRO SIGNATURE: Recurring brand rhythm — ${microBits.join(' · ')}. Repeat quiet accent/divider temperature and logo quiet-zone discipline across the layout.`
      : 'MICRO SIGNATURE: Keep a quiet, recurring brand accent rhythm (corner lockup discipline, accent divider temperature) so the layout feels recognized without stickers.',
  ].filter(Boolean);

  return {
    directives: lines.slice(0, 8),
    summary: {
      grading: look || lut || undefined,
      composition: compositionLine || undefined,
      agencyLevel: agencyLevel || undefined,
      captionVoice: captionVoice || undefined,
      typePersonality: typePersonality || undefined,
    },
  };
}

export function buildBrandSignatureDirectives(input: BrandSignatureDirectiveInput): string[] {
  return buildBrandSignaturePack(input).directives;
}
