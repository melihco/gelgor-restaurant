/**
 * Brand-level AI visual production standard (Brand Hub → Ayarlar).
 *
 * Identity layer: logo, story, business, vibe — stable per brand.
 * Scene layer: headline, caption, mission brief — per post.
 */
import type { AiEnhanceLevel } from '@/lib/ai-gallery-enhance';
import { shouldAiEnhanceGalleryPipeline } from '@/lib/ai-gallery-enhance';
import type { ProductionAssignment } from '@/lib/mission-production-manifest';
import { isNonVenueSector } from '@/lib/sector-gallery-seed';
import {
  isNonVenueSectorProfile,
  getDefaultVisualSubject,
} from '@/lib/sector-production-profile';

export type AiEnhanceFormat = 'post' | 'story' | 'carousel' | 'reel';
export type AiVisualSubject = 'auto' | 'venue_ambiance' | 'product_hero' | 'digital_ui';

/** Mission Hub — caption'a uygun sahne/ürün kompoziti (zayıf galeri dahil). */
export type AiAdaptiveSceneMode =
  | 'auto'
  | 'venue_context'
  | 'product_showcase'
  | 'lifestyle_composite'
  | 'digital_ui_context';

export type ResolvedAdaptiveSceneMode =
  | 'venue_context'
  | 'product_showcase'
  | 'lifestyle_composite'
  | 'digital_ui_context';

export type ResolvedVisualSubject = 'venue_ambiance' | 'product_hero' | 'digital_ui';

export interface AiVisualProductionStandard {
  enabled: boolean;
  level: AiEnhanceLevel;
  useBrandIdentity: boolean;
  briefDrivesScene: boolean;
  embedLogo: boolean;
  formats: Set<AiEnhanceFormat>;
  visualSubject: AiVisualSubject;
  /**
   * GPT images.edit on the matcher-selected gallery photo (not fresh generation).
   * Bypasses cost-skip when gallery match is already high.
   */
  enhanceGallerySelected: boolean;
  /** Caption + sektöre göre sahne yeniden kurulumu — post/carousel/story base foto. */
  adaptiveScene: boolean;
  adaptiveSceneMode: AiAdaptiveSceneMode;
  /**
   * Fresh AI image from caption + brand DNA (logo, vibe, brief).
   * When on, organic/designed feed posts skip gallery matcher even if photos exist.
   */
  captionDrivenVisual: boolean;
}

export type VisualSourceMode = 'gallery_only' | 'gallery_enhanced' | 'ai_generated';

const DEFAULT_FORMATS: AiEnhanceFormat[] = ['post', 'story', 'carousel', 'reel'];

import { normalizeBrandThemeRecord } from '@/lib/brand-theme-normalize';

/**
 * Resolve the top-level visual source mode from brand_theme.
 * Reads `visual_source_mode` if explicitly set; otherwise infers from flags.
 */
export function resolveVisualSourceMode(
  brandTheme: Record<string, unknown> | null | undefined,
): VisualSourceMode {
  brandTheme = normalizeBrandThemeRecord(brandTheme);
  const explicit = brandTheme?.visual_source_mode;
  if (explicit === 'gallery_only' || explicit === 'gallery_enhanced' || explicit === 'ai_generated') {
    return explicit;
  }
  const enhance = Boolean(brandTheme?.ai_photo_enhance);
  const captionDriven = Boolean(brandTheme?.ai_caption_driven_visual);
  if (captionDriven && enhance) return 'ai_generated';
  if (enhance) return 'gallery_enhanced';
  return 'gallery_only';
}

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
    rawSubject === 'venue_ambiance' || rawSubject === 'product_hero' || rawSubject === 'digital_ui'
      ? rawSubject
      : 'auto';

  const rawAdaptiveMode = String(brandTheme?.ai_adaptive_scene_mode ?? 'auto');
  const adaptiveSceneMode: AiAdaptiveSceneMode =
    rawAdaptiveMode === 'venue_context'
    || rawAdaptiveMode === 'product_showcase'
    || rawAdaptiveMode === 'lifestyle_composite'
    || rawAdaptiveMode === 'digital_ui_context'
      ? rawAdaptiveMode
      : 'auto';

  const enhanceGallerySelected = enabled
    && brandTheme?.ai_enhance_gallery_selected !== false;

  const captionDrivenVisual = Boolean(brandTheme?.ai_caption_driven_visual) && enabled;

  return {
    enabled,
    level,
    useBrandIdentity: brandTheme?.ai_use_brand_identity !== false,
    briefDrivesScene: brandTheme?.ai_brief_drives_scene !== false,
    embedLogo: brandTheme?.ai_embed_logo !== false,
    formats,
    visualSubject,
    enhanceGallerySelected,
    adaptiveScene: Boolean(brandTheme?.ai_adaptive_scene) && enabled,
    adaptiveSceneMode,
    captionDrivenVisual,
  };
}

/** Feed post slots: generate fresh AI from caption instead of gallery matcher. */
export function shouldUseCaptionDrivenVisual(
  standard: AiVisualProductionStandard,
  contentKind: string,
  assignment?: import('@/lib/mission-production-manifest').ProductionAssignment,
): boolean {
  if (!standard.captionDrivenVisual || !standard.enabled) return false;
  if (!shouldAiEnhanceForOutput(standard, contentKind, assignment)) return false;
  const role = assignment?.slot_role;
  const pipeline = assignment?.pipeline;
  if (
    pipeline === 'fal_story'
    || pipeline === 'fal_reel'
    || pipeline === 'fal_design'
    || pipeline === 'fal_only_reel'
    || pipeline === 'fal_only_story'
    || pipeline === 'fal_only_post'
    || pipeline?.startsWith('fal_only_')
    || pipeline === 'carousel_gallery'
    || role === 'organic_reel'
    || role === 'organic_carousel'
    || role === 'campaign_story_motion'
    || role === 'campaign_reel_motion'
    || role === 'organic_story_still'
    || role === 'fal_reel_motion'
    || role === 'fal_designed_post'
  ) {
    return false;
  }
  return (
    pipeline === 'gallery_photo'
    || role === 'designed_post'
    || role === 'designed_typography'
    || role === 'organic_post'
  );
}

/** Sektör + caption ipuçlarıyla sahne modu (auto için). */
export function resolveAdaptiveSceneMode(
  mode: AiAdaptiveSceneMode,
  businessType: string,
  caption: string,
): ResolvedAdaptiveSceneMode {
  if (mode === 'digital_ui_context') return 'digital_ui_context';
  if (mode === 'venue_context' || mode === 'product_showcase' || mode === 'lifestyle_composite') {
    return mode;
  }
  const bt = businessType.toLowerCase();
  const cap = caption.toLowerCase();
  if (isNonVenueSectorProfile(bt) || /saas|yazılım|yazilim|software|platform|panel|dashboard|b2b/i.test(bt + cap)) {
    return 'digital_ui_context';
  }
  if (
    /nakliyat|lojistik|logistics|transport|freight|warehouse|depo|taşımacılık/i.test(bt + cap)
    || /barber|berber|salon|restaurant|cafe|hotel|beach|club|spa|clinic|dental|gym|venue|resort/i.test(bt)
  ) {
    return 'venue_context';
  }
  if (
    /kolye|jewelry|mücevher|ring|yüzük|accessory|aksesuar|packaged|ambalaj|gıda|food|zeytin|olive|cosmetic|skincare|ürün/i.test(bt + cap)
  ) {
    return 'product_showcase';
  }
  if (/lifestyle|doğa|nature|farm|çiftlik|artisan|el yapımı|handmade/i.test(cap)) {
    return 'lifestyle_composite';
  }
  if (/food|gıda|product|retail|e-commerce/i.test(bt)) {
    return 'product_showcase';
  }
  if (isNonVenueSectorProfile(bt)) return 'digital_ui_context';
  return 'venue_context';
}

/** GPT image-2 için caption-uyumlu sahne talimatı. */
export function buildAdaptiveScenePromptBlock(input: {
  mode: ResolvedAdaptiveSceneMode;
  caption: string;
  headline: string;
  businessType: string;
  /** Gallery-derived venue fingerprint — prevents inventing absent environments. */
  venueFingerprintBlock?: string;
}): string {
  const brief = [input.headline, input.caption].filter(Boolean).join(' — ').slice(0, 500);
  const fingerprintNote = input.venueFingerprintBlock?.trim()
    ? `\n${input.venueFingerprintBlock.trim()}`
    : '';
  const lines = [
    'ADAPTIVE SCENE (Mission Hub — caption drives mood; venue identity stays gallery-authentic):',
  ];
  if (input.mode === 'venue_context') {
    lines.push(
      `Adjust lighting, color grade, and atmosphere for: "${brief}".`,
      'Keep the SAME physical venue visible in the reference photo — architecture, trees, furniture, layout.',
      'Do NOT replace the location with a stock waterfront, generic restaurant, or different city.',
      'If the reference photo is a weak caption match, improve mood through light and grade — not by teleporting to a new environment.',
      fingerprintNote,
    );
  } else if (input.mode === 'digital_ui_context') {
    lines.push(
      `B2B SaaS / software product visual for: "${brief}".`,
      'Show dashboard UI, appointment calendar, mobile app screen, or abstract tech workspace — NEVER a physical shop storefront or street scene.',
      'Use clean device mockups, UI panels, or editorial office-with-laptop compositions.',
      'No invented gibberish signage, no fake barber shop exterior, no logistics fleet unless caption explicitly says so.',
      'Preserve any real UI/screenshot pixels; only upgrade lighting and framing around digital product context.',
      fingerprintNote,
    );
  } else if (input.mode === 'product_showcase') {
    lines.push(
      `Instagram product-hero presentation for: "${brief}".`,
      'Clean editorial framing, premium shadows, scroll-stopping composition.',
      'Preserve product shape, label, and branding; upgrade only environment, light, and staging.',
      'Jewelry/accessories: boutique display or lifestyle flat-lay; packaged goods: contextual props at edges only.',
    );
  } else {
    lines.push(
      `Lifestyle composite scene for: "${brief}".`,
      'Merge subject with a believable real-world setting (e.g. olive grove for olive oil, workshop for artisan goods).',
      'The final image must read as one coherent photograph — not a pasted cutout.',
      'Props and background support the caption story; never obscure the hero subject.',
    );
  }
  lines.push(`Sector hint: ${input.businessType || 'general'}`);
  return lines.join('\n');
}

export function resolveVisualSubject(
  subject: AiVisualSubject,
  businessType: string,
): ResolvedVisualSubject {
  if (subject === 'digital_ui') return 'digital_ui';
  if (subject === 'venue_ambiance' || subject === 'product_hero') return subject;

  // Map profile's DefaultVisualSubject to this file's ResolvedVisualSubject type
  const profileSubject = getDefaultVisualSubject(businessType);
  if (profileSubject === 'digital_ui') return 'digital_ui';
  if (profileSubject === 'product_closeup') return 'product_hero';
  if (profileSubject === 'venue_interior' || profileSubject === 'service_person' || profileSubject === 'lifestyle') {
    return 'venue_ambiance';
  }

  // Fallback: auto or unknown — use non-venue check
  if (isNonVenueSectorProfile(businessType)) return 'digital_ui';
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
