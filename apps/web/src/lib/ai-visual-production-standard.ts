/**
 * Brand-level AI visual production standard (Brand Hub → Ayarlar).
 *
 * Identity layer: logo, story, business, vibe — stable per brand.
 * Scene layer: headline, caption, mission brief — per post.
 */
import type { AiEnhanceLevel } from '@/lib/ai-gallery-enhance';
import { shouldAiEnhanceGalleryPipeline } from '@/lib/ai-gallery-enhance';
import type { ProductionAssignment } from '@/lib/mission-production-manifest';

export type AiEnhanceFormat = 'post' | 'story' | 'carousel' | 'reel';
export type AiVisualSubject = 'auto' | 'venue_ambiance' | 'product_hero';

export interface AiVisualProductionStandard {
  enabled: boolean;
  level: AiEnhanceLevel;
  useBrandIdentity: boolean;
  briefDrivesScene: boolean;
  embedLogo: boolean;
  formats: Set<AiEnhanceFormat>;
  visualSubject: AiVisualSubject;
}

const DEFAULT_FORMATS: AiEnhanceFormat[] = ['post', 'story', 'carousel', 'reel'];

import { normalizeBrandThemeRecord } from '@/lib/brand-theme-normalize';

export function resolveAiVisualProductionStandard(
  brandTheme: Record<string, unknown> | null | undefined,
): AiVisualProductionStandard {
  brandTheme = normalizeBrandThemeRecord(brandTheme);
  const enabled = Boolean(brandTheme?.ai_photo_enhance);
  const rawLevel = String(brandTheme?.ai_photo_enhance_level ?? 'moderate');
  const level: AiEnhanceLevel =
    rawLevel === 'subtle' || rawLevel === 'full' ? rawLevel : 'moderate';

  const rawFormats = brandTheme?.ai_enhance_formats;
  const formats = new Set<AiEnhanceFormat>();
  if (Array.isArray(rawFormats) && rawFormats.length) {
    for (const f of rawFormats) {
      if (f === 'post' || f === 'story' || f === 'carousel' || f === 'reel') {
        formats.add(f);
      }
    }
  }
  if (!formats.size) {
    for (const f of DEFAULT_FORMATS) formats.add(f);
  }

  const rawSubject = String(brandTheme?.ai_visual_subject ?? 'auto');
  const visualSubject: AiVisualSubject =
    rawSubject === 'venue_ambiance' || rawSubject === 'product_hero' ? rawSubject : 'auto';

  return {
    enabled,
    level,
    useBrandIdentity: brandTheme?.ai_use_brand_identity !== false,
    briefDrivesScene: brandTheme?.ai_brief_drives_scene !== false,
    embedLogo: brandTheme?.ai_embed_logo !== false,
    formats,
    visualSubject,
  };
}

export function resolveVisualSubject(
  subject: AiVisualSubject,
  businessType: string,
): 'venue_ambiance' | 'product_hero' {
  if (subject === 'venue_ambiance' || subject === 'product_hero') return subject;
  const bt = businessType.toLowerCase();
  if (
    /barber|berber|salon|restaurant|cafe|hotel|beach|club|spa|clinic|dental|gym|fitness|venue|resort|bar\b/i.test(bt)
  ) {
    return 'venue_ambiance';
  }
  if (/food|gıda|product|retail|e-commerce|skincare|cosmetic|packaged/i.test(bt)) {
    return 'product_hero';
  }
  return 'venue_ambiance';
}

export function contentKindToAiFormat(contentKind: string): AiEnhanceFormat | null {
  if (contentKind === 'instagram_post' || contentKind === 'instagram_canvas') return 'post';
  if (contentKind === 'instagram_story') return 'story';
  if (contentKind === 'instagram_carousel') return 'carousel';
  if (contentKind === 'instagram_reel') return 'reel';
  return null;
}

export function shouldAiEnhanceForOutput(
  standard: AiVisualProductionStandard,
  contentKind: string,
  assignment?: ProductionAssignment,
): boolean {
  if (!standard.enabled) return false;
  if (assignment && !shouldAiEnhanceGalleryPipeline(assignment)) return false;
  const fmt = contentKindToAiFormat(contentKind);
  if (!fmt) return false;
  return standard.formats.has(fmt);
}

export type BrandContextForVisual = {
  business_name?: string;
  business_type?: string;
  description?: string;
  brand_tone?: string;
  visual_style?: string;
  target_audience?: string;
  location?: string;
  website_summary?: string;
  instagram_bio?: string;
  brand_dna?: string | Record<string, unknown>;
  visual_dna?: string;
  logo_url?: string;
  brand_vibe_profile?: Record<string, unknown>;
  website_intelligence?: Record<string, unknown> | string | null;
  content_pillars?: string[];
  default_ctas?: string[];
  custom_rules?: string;
};

function mergeThemeDict(
  theme: Record<string, unknown> | undefined,
  vibe: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> {
  const t = (theme?.[key] ?? {}) as Record<string, unknown>;
  const v = (vibe?.[key] ?? {}) as Record<string, unknown>;
  if (!Object.keys(t).length) return v;
  if (!Object.keys(v).length) return t;
  return { ...v, ...t };
}

function collectAntiPatterns(
  theme?: Record<string, unknown> | null,
  vibe?: Record<string, unknown>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const source of [theme?.anti_patterns, vibe?.anti_patterns]) {
    if (!Array.isArray(source)) continue;
    for (const ap of source) {
      const s = String(ap).trim();
      if (s && !seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
  }
  return out;
}

/** Short venue/menu context from website crawl for image prompts. */
export function summarizeWebsiteIntelligence(
  raw: Record<string, unknown> | string | null | undefined,
): string {
  if (!raw) return '';
  let o: Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return raw.slice(0, 280);
    }
  } else {
    o = raw;
  }
  const parts: string[] = [];
  const display = String(o.brand_display_name ?? o.brandDisplayName ?? '').trim();
  if (display) parts.push(`Venue: ${display}`);
  const menu = o.menu_highlights ?? o.menuHighlights;
  if (Array.isArray(menu) && menu.length) {
    parts.push(`Menu highlights: ${menu.slice(0, 5).map(String).join(', ')}`);
  }
  const services = o.services ?? o.service_categories;
  if (Array.isArray(services) && services.length) {
    parts.push(`Services: ${services.slice(0, 4).map(String).join(', ')}`);
  }
  return parts.join(' | ').slice(0, 320);
}

export function buildBrandIdentityPromptBlock(
  ctx: BrandContextForVisual,
  brandTheme?: Record<string, unknown> | null,
): string {
  const vibe = ctx.brand_vibe_profile;
  const theme = brandTheme ?? undefined;
  const palette = mergeThemeDict(theme, vibe, 'palette') as Record<string, string>;
  const grading = mergeThemeDict(theme, vibe, 'grading') as Record<string, string>;
  const composition = mergeThemeDict(theme, vibe, 'composition') as Record<string, string>;
  const anti = collectAntiPatterns(theme, vibe);
  const captionVoice = Array.isArray(theme?.caption_voice_rules)
    ? (theme.caption_voice_rules as string[]).filter(Boolean)
    : [];

  let dnaSnippet = '';
  if (typeof ctx.brand_dna === 'string' && ctx.brand_dna.trim()) {
    dnaSnippet = ctx.brand_dna.slice(0, 800);
  } else if (ctx.brand_dna && typeof ctx.brand_dna === 'object') {
    dnaSnippet = JSON.stringify(ctx.brand_dna).slice(0, 800);
  }

  const visualDna = (ctx.visual_dna ?? '').trim();
  const webIntel = summarizeWebsiteIntelligence(ctx.website_intelligence);
  const pillars = (ctx.content_pillars ?? []).filter(Boolean);
  const ctas = (ctx.default_ctas ?? []).filter(Boolean);

  const lines = [
    'BRAND IDENTITY (apply to every visual — do not override with post copy):',
    ctx.business_name ? `Business: ${ctx.business_name}` : '',
    ctx.business_type ? `Category: ${ctx.business_type}` : '',
    ctx.location ? `Location: ${ctx.location}` : '',
    ctx.description ? `About: ${ctx.description.slice(0, 400)}` : '',
    ctx.brand_tone ? `Tone: ${ctx.brand_tone}` : '',
    ctx.visual_style ? `Visual style: ${ctx.visual_style}` : '',
    ctx.target_audience ? `Audience: ${ctx.target_audience.slice(0, 200)}` : '',
    ctx.website_summary ? `Website story: ${ctx.website_summary.slice(0, 300)}` : '',
    ctx.instagram_bio ? `Instagram voice: ${ctx.instagram_bio.slice(0, 200)}` : '',
    webIntel ? `Website intelligence: ${webIntel}` : '',
    dnaSnippet ? `Brand DNA: ${dnaSnippet}` : '',
    visualDna ? `Visual DNA: ${visualDna.slice(0, 500)}` : '',
    pillars.length ? `Content pillars: ${pillars.join(', ')}` : '',
    ctas.length ? `Preferred CTAs: ${ctas.slice(0, 5).join(' | ')}` : '',
    palette.primary ? `Brand primary: ${palette.primary}` : '',
    palette.accent ? `Brand accent: ${palette.accent}` : '',
    grading.look ? `Grading look: ${grading.look}` : '',
    grading.lut_directive ? `LUT: ${grading.lut_directive}` : '',
    composition.primary_pattern
      ? `Composition: ${composition.primary_pattern}`
      : composition.framing_rules
        ? `Composition: ${composition.framing_rules}`
        : '',
    captionVoice.length ? `Caption voice: ${captionVoice.slice(0, 4).join('; ')}` : '',
    ctx.logo_url ? `Logo: use for watermark placement only — never alter logo artwork.` : '',
    anti.length ? `Never: ${anti.slice(0, 8).join('; ')}` : '',
    ctx.custom_rules ? `Brand rules: ${ctx.custom_rules.slice(0, 300)}` : '',
  ].filter(Boolean);

  return lines.join('\n');
}

/** Post-specific scene — caption & brief drive lighting, mood, props only. */
export function buildPostScenePromptBlock(input: {
  caption: string;
  headline: string;
  strategicPurpose?: string;
  mood?: string;
  missionBrief?: string;
  cta?: string;
}): string {
  const lines = [
    'POST SCENE BRIEF (this post only — lighting, mood, props, atmosphere):',
    input.headline ? `Headline: ${input.headline.slice(0, 120)}` : '',
    input.caption ? `Caption: ${input.caption.slice(0, 500)}` : '',
    input.strategicPurpose ? `Purpose: ${input.strategicPurpose.slice(0, 200)}` : '',
    input.mood ? `Mood: ${input.mood.slice(0, 80)}` : '',
    input.cta ? `CTA: ${input.cta.slice(0, 80)}` : '',
    input.missionBrief ? `Mission context: ${input.missionBrief.slice(0, 600)}` : '',
  ].filter(Boolean);
  return lines.join('\n') || 'Editorial social post — premium, authentic, on-brand.';
}

export function mergeEnhanceDirectorCaption(
  standard: AiVisualProductionStandard,
  identityBlock: string,
  sceneBlock: string,
  fallbackCaption: string,
): string {
  if (!standard.useBrandIdentity && !standard.briefDrivesScene) {
    return fallbackCaption;
  }
  const parts: string[] = [];
  if (standard.useBrandIdentity && identityBlock) parts.push(identityBlock);
  if (standard.briefDrivesScene && sceneBlock) parts.push(sceneBlock);
  if (!parts.length) return fallbackCaption;
  parts.push('---');
  parts.push(fallbackCaption);
  return parts.join('\n\n');
}
