/**
 * Agency-level fal reel prompt pack — general → specific.
 *
 * Built only from already-extracted brand_theme / brand_vibe_profile /
 * motion_profile + this mission's calendar/idea signals. Wired into
 * fal_reel still + Kling motion cues (not template library / GPT posts).
 */

import {
  parseMotionProfileFromTheme,
} from '@/lib/brand-motion-profile';
import {
  resolveBrandReelProductionParams,
  type BrandReelProductionParams,
} from '@/lib/brand-reel-motion-profile';

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

export interface FalReelAgencyDirectiveInput {
  brandName?: string;
  sector?: string;
  brandTheme?: Record<string, unknown> | null;
  brandVibeProfile?: Record<string, unknown> | null;
  brandTone?: string | null;
  visualStyle?: string | null;
  visualDna?: string | null;
  /** Mission / calendar idea signals */
  headline?: string | null;
  caption?: string | null;
  mood?: string | null;
  visualDirection?: string | null;
  strategicPurpose?: string | null;
  announcementType?: string | null;
  slotRole?: string | null;
  catalogSlotKey?: string | null;
  reelArtDirection?: string | null;
  reelSupportingSubjects?: string[] | null;
}

export interface FalReelAgencyPack {
  /** Injected into fal designer still brandDirectives (ordered general → specific). */
  stillDirectives: string[];
  /** Merged into Kling designerMotionCue (photo/light only). */
  motionCue: string | undefined;
  motionParams: BrandReelProductionParams | null;
  summary: {
    agencyLevel?: string;
    grading?: string;
    composition?: string;
    typePersonality?: string;
    motion?: string;
  };
}

function describeMotionCue(params: BrandReelProductionParams): string {
  const bits = [
    params.reelPacing === 'slow_burn'
      ? 'slow cinematic burn — restrained push-in, luxury stillness'
      : params.reelPacing === 'fast_cut'
        ? 'mid-energy editorial pulse — still micro-parallax, never carnival cuts inside I2V'
        : 'balanced editorial tempo — quiet push-in + soft light breath',
    params.cameraMotion
      ? `camera feel: ${params.cameraMotion.replace(/_/g, ' ')} on the photo zone only`
      : '',
    params.strategy && params.strategy !== 'single'
      ? `montage intent: ${params.strategy} (single locked cover — imply multi-subject energy via light/parallax only)`
      : '',
  ].filter(Boolean);
  return bits.join('; ').slice(0, 200);
}

/**
 * Build agency-level still + motion directives for fal_reel production.
 * Deterministic — no LLM. Empty fields are skipped.
 */
export function buildFalReelAgencyPack(input: FalReelAgencyDirectiveInput): FalReelAgencyPack {
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
  const lut = str(grading.lut_directive ?? grading.lutDirective ?? grading.lut, 180);
  const compositionLine = str(
    composition.primary_pattern
      ?? composition.primaryPattern
      ?? composition.framing_rules
      ?? composition.framingRules
      ?? composition.subject_focus
      ?? composition.subjectFocus,
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
      ?? asRecord(vibe?.caption_voice)?.writing_rules
      ?? vibe?.caption_voice,
    3,
  ).join('; ');
  const typePersonality = str(
    typography.personality
      ?? typographyDesign.vibe
      ?? typography.vibe
      ?? vibe?.heading_personality
      ?? vibe?.headingPersonality,
    120,
  );
  const tone = str(input.brandTone, 140);
  const visualStyle = str(input.visualStyle, 160);
  const visualDna = str(input.visualDna, 280);
  const mood = str(input.mood, 100);
  const visualDirection = str(input.visualDirection, 180);
  const strategicPurpose = str(input.strategicPurpose, 160);
  const announcementType = str(input.announcementType, 80);
  const slotRole = str(input.slotRole, 80);
  const catalogSlotKey = str(input.catalogSlotKey, 100);
  const headline = str(input.headline, 80);
  const caption = str(input.caption, 160);
  const reelArtDirection = str(input.reelArtDirection, 180);
  const supporting = strList(input.reelSupportingSubjects, 3).join(' · ');

  const motionProfile = parseMotionProfileFromTheme(theme, {
    sector: input.sector,
  });
  const motionParams = resolveBrandReelProductionParams(
    motionProfile,
    input.sector ?? '',
  );
  const motionCueFromBrand = describeMotionCue(motionParams);

  // ── Still directives: GENERAL brand → SPECIFIC mission ────────────────────
  const stillDirectives = [
    `REEL AGENCY BRIEF: Design a premium Instagram Reel cover for ${input.brandName || 'this brand'} as a senior art director would — niche, intentional, never generic ${input.sector || 'sector'} stock.`,
    agencyLevel
      ? `AGENCY QUALITY BAR: ${agencyLevel}. Prefer those craft moves over small-business template energy.`
      : 'AGENCY QUALITY BAR: Quiet luxury editorial — one hero photo, one clear headline hierarchy, brand-color accents only. No carnival stickers, neon spam, or Canva-cliché stacks.',
    look || lut
      ? `BRAND GRADING: ${[look, lut].filter(Boolean).join(' · ')}. Apply grading feel to graphic layers and type temperature — never recolor the locked gallery photo.`
      : '',
    compositionLine
      ? `BRAND COMPOSITION: ${compositionLine}. Keep crop bias, negative space, and hierarchy consistent with this brand.`
      : '',
    typePersonality
      ? `TYPE PERSONALITY: ${typePersonality}. Typography character must feel owned by this brand on the 9:16 cover.`
      : '',
    captionVoice
      ? `CAPTION → VISUAL RHYTHM: ${captionVoice}. Short/sharp voice → bolder hook type; poetic voice → sparser editorial spacing.`
      : '',
    tone ? `Brand tone: ${tone}.` : '',
    visualStyle ? `Visual style: ${visualStyle}.` : '',
    visualDna ? `Visual DNA: ${visualDna}.` : '',
    motionCueFromBrand
      ? `MOTION INTENT (cover composition must support this I2V): ${motionCueFromBrand}. Leave photo zone free for micro-parallax; keep type in a stable locked plate.`
      : '',
    // Mission / calendar specificity
    slotRole || announcementType || catalogSlotKey
      ? `SLOT PURPOSE: ${[slotRole && `role=${slotRole}`, announcementType && `announcement=${announcementType}`, catalogSlotKey && `catalog=${catalogSlotKey}`].filter(Boolean).join(' · ')}. Layout must serve THIS reel job, not a generic cover.`
      : '',
    strategicPurpose ? `STRATEGIC PURPOSE: ${strategicPurpose}.` : '',
    mood ? `POST MOOD: ${mood}.` : '',
    visualDirection ? `VISUAL DIRECTION: ${visualDirection}.` : '',
    headline ? `MISSION HOOK (on-canvas verbatim when used): "${headline}".` : '',
    caption ? `CAPTION CONTEXT (design energy only — do not invent new slogans): ${caption}.` : '',
    reelArtDirection ? `REEL ART DIRECTION: ${reelArtDirection}.` : '',
    supporting ? `SUPPORTING SUBJECTS (imply via photo zone / parallax readiness): ${supporting}.` : '',
    'REEL COVER CONTRACT: First-frame scroll-stopper on 9:16. Frozen typography for I2V. Official logo composited later — keep one quiet corner calm with the footage continuing as-is, no painted plate. Never paint platform labels (REEL, INSTAGRAM).',
  ].filter(Boolean);

  const motionCue = [
    reelArtDirection,
    motionCueFromBrand,
    supporting ? `favor light shifts that reveal: ${supporting}` : '',
    mood ? `mood energy: ${mood}` : '',
  ].filter(Boolean).join(' · ').slice(0, 220) || undefined;

  return {
    stillDirectives: stillDirectives.slice(0, 14),
    motionCue,
    motionParams,
    summary: {
      agencyLevel: agencyLevel || undefined,
      grading: look || lut || undefined,
      composition: compositionLine || undefined,
      typePersonality: typePersonality || undefined,
      motion: motionCueFromBrand || undefined,
    },
  };
}

export function buildFalReelAgencyStillDirectives(
  input: FalReelAgencyDirectiveInput,
): string[] {
  return buildFalReelAgencyPack(input).stillDirectives;
}

/** Merge FD motion cue with brand motion pack — FD art direction wins when present. */
export function mergeFalReelMotionCue(
  existingCue: string | undefined,
  agencyMotionCue: string | undefined,
): string | undefined {
  const a = (existingCue ?? '').trim();
  const b = (agencyMotionCue ?? '').trim();
  if (a && b) {
    // Keep FD cue primary; append brand pace/camera if not already echoed.
    if (a.toLowerCase().includes(b.slice(0, 24).toLowerCase())) return a.slice(0, 220);
    return `${a} · ${b}`.slice(0, 220);
  }
  return (a || b || undefined)?.slice(0, 220);
}
