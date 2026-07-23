/**
 * Prompt Builder — compiles Brand + Campaign + Template + Layout + Typography
 * into a GPT Image design-card brief (agency creative-director format).
 */

import type { TypographyVibe } from '@/types/brand-theme';
import type { AgencyTemplateContract } from './agency-templates';
import type { CampaignConcept } from './campaign-concepts';
import {
  getGeometricShell,
  resolveGeometricShell,
  type GeometricShellId,
} from '@/lib/canva-geometric-layouts';
import { resolveSlotLookKind } from '@/lib/slot-look-directive';

export type AgencyPromptBrandKit = {
  brandName: string;
  primary: string;
  accent: string;
  personality: string[];
  vibe: TypographyVibe | string | null;
  location?: string | null;
  logoUrl?: string | null;
  headingFont?: string | null;
  bodyFont?: string | null;
  fontPersonality?: string | null;
  visualDnaTone?: string | null;
};

export type AgencyPromptCopy = {
  headline: string;
  subheadline?: string | null;
  cta?: string | null;
  caption?: string | null;
  catalogSlotKey?: string | null;
};

/** Impact/flyer fonts → remapped to editorial serif for agency CD path. */
const FLYER_FONT_RX = /anton|bebas|impact|druk|compressed|condensed impact/i;

function resolveEditorialHeadingFace(kit: AgencyPromptBrandKit): string {
  const requested = kit.headingFont?.trim() ?? '';
  if (requested && !FLYER_FONT_RX.test(requested)) return requested;
  return 'Playfair Display / Didot';
}

function vibeFontLock(vibe: string | null | undefined, kit: AgencyPromptBrandKit): string {
  const face = resolveEditorialHeadingFace(kit);
  const support = kit.bodyFont?.trim() || 'Montserrat / Neue Haas Grotesk';
  const v = String(vibe ?? '').toLowerCase();
  // Agency path is magazine-editorial even for nightlife — energy via grade/mood, not flyer type.
  if (/street|neon|bold/.test(v)) {
    return `Paint headline as high-contrast editorial display SERIF inspired by "${face}" (nightlife = quiet luxury magazine, NOT Anton/Bebas flyer). Support inspired by "${support}".`;
  }
  return `Paint headline in high-contrast editorial display serif inspired by "${face}"; support inspired by "${support}". Optical hierarchy — never system UI fonts, never festival condensed stacks.`;
}

function buildDynamicPrompt(
  campaign: CampaignConcept,
  kit: AgencyPromptBrandKit,
  caption?: string | null,
): string {
  const loc = kit.location?.trim() || 'Mediterranean coastal venue';
  const captionHint = caption?.trim()
    ? `Scene must match this caption topic: "${caption.trim().slice(0, 160)}".`
    : '';
  return [
    campaign.dynamicPromptSeed,
    `Location cue: ${loc}.`,
    kit.visualDnaTone?.trim() ? `Brand visual DNA: ${kit.visualDnaTone.trim().slice(0, 180)}.` : '',
    captionHint,
    'Photoreal, natural light, no AI artifacts, no invented logos or packaging text.',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Full agency creative-director prompt for GPT Image.
 * Structure mirrors operator template briefs (ART DIRECTION / LAYOUT / TYPE / TEXT / IMAGE / BRAND).
 * Geometric shell = layout inspiration (Canva geometry), not a Satori bake instruction.
 */
export function buildAgencyCreativeDirectorPrompt(input: {
  campaign: CampaignConcept;
  template: AgencyTemplateContract;
  brand: AgencyPromptBrandKit;
  copy: AgencyPromptCopy;
  format: 'story' | 'post';
  geometricShellId?: GeometricShellId | null;
}): string {
  const { campaign, template, brand, copy } = input;
  const aspect = input.format === 'story' ? '9:16 Story (1080×1920)' : '4:5 Post (1080×1350)';
  const headline = copy.headline.trim().slice(0, 72);
  const sub = (copy.subheadline ?? '').trim().slice(0, 64);
  const cta = (copy.cta ?? '').trim().slice(0, 40);
  const slotLook = resolveSlotLookKind({
    announcementType: null,
    catalogSlotKey: copy.catalogSlotKey,
    headline,
    caption: copy.caption,
  });
  const resolvedShell = input.geometricShellId
    ? getGeometricShell(input.geometricShellId)
    : resolveGeometricShell({
      catalogSlotKey: copy.catalogSlotKey,
      slotLook,
      format: input.format,
      headline,
    });
  const headingFace = resolveEditorialHeadingFace(brand);

  const lines = [
    `═══ AGENCY CREATIVE DIRECTOR — ${template.name} ═══`,
    `Campaign: ${campaign.name} (${campaign.id}) · Mood: ${campaign.mood}`,
    `Slot: ${copy.catalogSlotKey ?? 'ad_hoc'} · Format: ${aspect}`,
    `Layout recipe (inspire, paint with photographic vibe): ${resolvedShell.id} — ${resolvedShell.pitch}`,
    `Photo mask cue: ${resolvedShell.photoMask} · type zone: ${resolvedShell.typePlacement} · canvas role: ${resolvedShell.canvasRole}`,
    '',
    '═══ ON-CANVAS TEXT CONTRACT (SSOT) ═══',
    `HEADLINE: ${headline || '—'}`,
    sub ? `SUBHEADLINE: ${sub}` : 'SUBHEADLINE: (none)',
    cta ? `CTA: ${cta}` : 'CTA: (none)',
    '',
    '═══ ART DIRECTION ═══',
    ...template.artDirection.map((line) => `• ${line}`),
    '',
    '═══ LAYOUT ZONES ═══',
    `Headline: ${template.layout.headline}`,
    `Sub: ${template.layout.subheadline}`,
    `CTA: ${template.layout.cta}`,
    `Logo: ${template.layout.logo}`,
    `Photo: ${template.layout.photo}`,
    `Safe margin: ~${template.layout.safeMarginPct}%`,
    '',
    '═══ TYPE / FONT LOCK ═══',
    `Face: ${template.typography.face}`,
    `Weight: ${template.typography.weight}`,
    `Hierarchy: ${template.typography.hierarchy}`,
    `Letter-spacing: ${template.typography.letterSpacing}`,
    `Max headline lines: ${template.typography.maxHeadlineLines} · max words/line: ${template.typography.maxWordsPerLine}`,
    vibeFontLock(brand.vibe, brand),
    `FONT LOCK heading inspiration: ${headingFace}`,
    '',
    '═══ MANDATORY GRAPHIC CRAFT ═══',
    'Paint a vibey designed ad — photoreal venue + visible graphic system (rules, frames, chips, hierarchy).',
    'FAIL: bare full-bleed photo + floating caption with zero craft.',
    'FAIL: opaque mustard/charcoal paint slabs / header-footer sandwiches.',
    'PASS: Canva Pro / luxury hospitality campaign energy with intentional geometry when the shell suggests it.',
    '',
    '═══ IMAGE RULES ═══',
    ...template.imageRules.map((r) => `• ${r}`),
    buildDynamicPrompt(campaign, brand, copy.caption),
    '',
    '── BRAND KIT ──',
    `Brand: ${brand.brandName} · Primary ${brand.primary} · Accent ${brand.accent}`,
    `Personality: ${brand.personality.join(', ') || 'premium, mediterranean, hospitality'}`,
    brand.logoUrl ? 'Logo zone empty — composited after bake.' : '',
    '',
    '── PASS BAR ──',
    'Turunç / Wallpaper-level vibey editorial — designed, not caption-on-photo.',
  ];

  return lines.filter(Boolean).join('\n');
}
