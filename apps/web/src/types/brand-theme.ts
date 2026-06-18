/**
 * BrandTheme — derived design token set for a specific tenant.
 *
 * Single source of truth consumed by:
 *  - LayoutEngine (React renderer)
 *  - generate-instagram-image (image generation prompt)
 *  - generate-event-card (card generation)
 *  - Canvas layout components
 *
 * Derived from (priority waterfall):
 *   1. brand_vibe_profile (richest — palette, grading, composition, anti_patterns)
 *   2. visual_dna        (text analysis from own photos)
 *   3. brand_primary_color / brand_accent_color / brand_font_family (manual)
 *   4. Industry sector defaults
 */

export interface BrandThemePalette {
  /** Primary background or dominant brand color — hex */
  primary: string;
  /** Accent / CTA color — hex */
  accent: string;
  /** Neutral / surface color — hex */
  neutral: string;
  /** Shadow / deep contrast color — hex */
  shadow: string;
  /** Human-readable description of the palette feel */
  description: string;
}

export interface BrandThemeTypography {
  /**
   * Suggested heading font (must be from safe_fonts.ts list — Google Fonts or OFL).
   * Renderer falls back to system-ui if not available.
   */
  headingFont: string;
  bodyFont: string;
  /**
   * How much text overlay the brand's style allows on imagery.
   * "minimal" = clean image, small caption below
   * "medium"  = moderate overlay text
   * "dense"   = heavy editorial text treatment
   */
  textOverlayDensity: 'minimal' | 'medium' | 'dense';
  /** Caption/body personality in 3-5 words */
  personality: string;
  /** Başlık / hero overlay rengi (hex) — feed & poster SVG */
  headlineColor?: string;
  headline_color?: string;
}

export interface BrandThemeComposition {
  /**
   * Primary framing pattern — e.g. "centered subject", "rule of thirds",
   * "flat lay overhead", "close-up texture"
   */
  primaryPattern: string;
  /** Safe area fraction (0–1) for text placement within a layout slot */
  textSafeAreaFraction: number;
  /** Subject focus hint for image generation prompts */
  subjectFocus: string;
}

export interface BrandThemeGrading {
  /**
   * Colour grading "look" — e.g. "warm golden editorial",
   * "cool toned minimal", "vibrant saturated", "dark moody"
   */
  look: string;
  /** LLM directive injected into image gen prompts verbatim */
  lutDirective: string;
}

export interface BrandThemeOverlay {
  /**
   * Opacity for colour overlay on images (0 = none, 1 = opaque).
   * Typically 0.15–0.45 for legible text over photos.
   */
  opacity: number;
  /** Overlay colour — usually palette.primary or palette.shadow */
  color: string;
}

export interface BrandThemeLayout {
  /** Default border radius for cards/frames — px */
  borderRadius: number;
  /** Spacing unit multiplier — base 8px grid */
  spacingBase: number;
  /**
   * Default layout ID for auto-produced feed posts.
   * Operator can override this from Brand Kit UI.
   */
  defaultLayoutId: LayoutId;
}

/**
 * All supported layout identifiers.
 * Each maps to a React component in LayoutEngine.tsx.
 */
export type LayoutId =
  | 'feed_square'
  | 'story_full'
  | 'carousel_slide'
  | 'event_card'
  | 'weekly_brief'
  | 'review_showcase'
  | 'ad_banner_horizontal';

/** Per-tenant Remotion routing — see brand-motion-profile.ts */
export type { BrandMotionProfile, MotionStyle } from '@/lib/brand-motion-profile';

export interface BrandTheme {
  /** Workspace / tenant this theme belongs to */
  workspaceId: string;
  /** ISO 8601 timestamp of last derivation */
  derivedAt: string;
  /**
   * Which step in the waterfall produced this theme.
   * Useful for UI badges ("Stil Analizi'nden" vs "Manuel Renk'ten").
   */
  source: 'vibe_profile' | 'visual_dna' | 'manual_colors' | 'sector_default';

  palette: BrandThemePalette;
  typography: BrandThemeTypography;
  composition: BrandThemeComposition;
  grading: BrandThemeGrading;
  overlay: BrandThemeOverlay;
  layout: BrandThemeLayout;

  /** Caption voice rules from vibe profile, verbatim for agent injection */
  captionVoiceRules: string[];
  /** Anti-patterns — injected as "NEVER:" list in image gen prompts */
  antiPatterns: string[];
  /** Validated WCAG AA contrast check result */
  contrastValid: boolean;

  /** AI visual production (Brand Hub → Ayarlar) */
  ai_photo_enhance?: boolean;
  ai_photo_enhance_level?: 'subtle' | 'moderate' | 'full';
  /** GPT images.edit on matcher-selected gallery photo (not fresh generation). */
  ai_enhance_gallery_selected?: boolean;
  ai_use_brand_identity?: boolean;
  ai_brief_drives_scene?: boolean;
  ai_embed_logo?: boolean;
  ai_enhance_formats?: Array<'post' | 'story' | 'carousel' | 'reel'>;
  ai_visual_subject?: 'auto' | 'venue_ambiance' | 'product_hero';
  /** Caption-uyumlu sahne/ürün kompoziti — Mission Hub post/carousel/story base foto */
  ai_adaptive_scene?: boolean;
  ai_adaptive_scene_mode?: 'auto' | 'venue_context' | 'product_showcase' | 'lifestyle_composite';
  /** Marka açık etmeli: caption + brand DNA ile sıfırdan AI görsel — galeri olsa bile feed postlarında matcher atlanır */
  ai_caption_driven_visual?: boolean;
  /** Experimental Crew VPD — default false; existing VPS from ideation wins on merge */
  enable_visual_production_director?: boolean;
  enableVisualProductionDirector?: boolean;

  /** Remotion composition pool, media policy, motion style (snake_case in JSONB) */
  motionProfile?: import('@/lib/brand-motion-profile').BrandMotionProfile;
  motion_profile?: import('@/lib/brand-motion-profile').BrandMotionProfile;

  /** 5-slot brand template library — Mission Hub production source */
  templateLibrary?: import('@/lib/brand-template-library').BrandTemplateLibrary;
  template_library?: import('@/lib/brand-template-library').BrandTemplateLibrary;
}

// ── Safe fonts list — must be Google Fonts or OFL licensed ───────────────────
export const SAFE_FONTS: readonly string[] = [
  'Inter',
  'Playfair Display',
  'Montserrat',
  'Lora',
  'Raleway',
  'Nunito',
  'Josefin Sans',
  'Cormorant Garamond',
  'DM Sans',
  'DM Serif Display',
  'Libre Baskerville',
  'Poppins',
  'Source Serif 4',
  'Fraunces',
  'Space Grotesk',
  'Syne',
  'Cabinet Grotesk',
  'Great Vibes',
  'Allura',
  'Anton',
  'Bebas Neue',
] as const;

// ── Sector default palettes (cold-start fallback) ─────────────────────────────
export const SECTOR_DEFAULT_THEMES: Record<string, Pick<BrandTheme, 'palette' | 'typography' | 'grading'>> = {
  restaurant_cafe: {
    palette: { primary: '#2c1a0e', accent: '#c9813f', neutral: '#f5f0e8', shadow: '#1a0f07', description: 'warm earth tones' },
    typography: { headingFont: 'Playfair Display', bodyFont: 'Lora', textOverlayDensity: 'minimal', personality: 'warm, inviting, artisanal' },
    grading: { look: 'warm golden editorial', lutDirective: 'warm tones, lifted shadows, golden cast, film grain' },
  },
  beauty_wellness: {
    palette: { primary: '#f8f4f0', accent: '#c9a98e', neutral: '#ffffff', shadow: '#3d2b1f', description: 'soft neutral luxury' },
    typography: { headingFont: 'Cormorant Garamond', bodyFont: 'DM Sans', textOverlayDensity: 'minimal', personality: 'elegant, soft, aspirational' },
    grading: { look: 'soft pastel editorial', lutDirective: 'bright, airy, desaturated skin tones, clean whites' },
  },
  beach_club: {
    palette: { primary: '#0b4f6c', accent: '#f5a623', neutral: '#e8f4f8', shadow: '#071e26', description: 'deep ocean with golden sun' },
    typography: { headingFont: 'Raleway', bodyFont: 'Montserrat', textOverlayDensity: 'medium', personality: 'energetic, bold, summery' },
    grading: { look: 'vibrant coastal', lutDirective: 'punchy blues, golden highlights, high contrast, vivid saturation' },
  },
  healthcare_clinic: {
    palette: { primary: '#f0f6ff', accent: '#2563eb', neutral: '#ffffff', shadow: '#1e3a5f', description: 'clean clinical trust' },
    typography: { headingFont: 'Inter', bodyFont: 'DM Sans', textOverlayDensity: 'minimal', personality: 'professional, trustworthy, calm' },
    grading: { look: 'cool clinical minimal', lutDirective: 'cool tones, clean whites, minimal saturation, precise' },
  },
  ecommerce_retail: {
    palette: { primary: '#111111', accent: '#e63946', neutral: '#f8f8f8', shadow: '#000000', description: 'bold modern retail' },
    typography: { headingFont: 'Syne', bodyFont: 'DM Sans', textOverlayDensity: 'medium', personality: 'modern, bold, commercial' },
    grading: { look: 'punchy product', lutDirective: 'high contrast, vivid colors, clean backgrounds, product-focused' },
  },
  local_products_shop: {
    palette: { primary: '#3d2b1f', accent: '#6b8f3e', neutral: '#f5ede0', shadow: '#1a110a', description: 'organic earthy natural' },
    typography: { headingFont: 'Fraunces', bodyFont: 'Libre Baskerville', textOverlayDensity: 'minimal', personality: 'authentic, artisan, natural' },
    grading: { look: 'natural earthy', lutDirective: 'earthy tones, natural greens, warm shadows, organic film look' },
  },
  real_estate: {
    palette: { primary: '#1a1a2e', accent: '#c9a84c', neutral: '#f2f2f2', shadow: '#0d0d1a', description: 'prestige dark gold' },
    typography: { headingFont: 'Montserrat', bodyFont: 'Source Serif 4', textOverlayDensity: 'medium', personality: 'prestigious, authoritative, refined' },
    grading: { look: 'prestige architectural', lutDirective: 'dramatic shadows, golden hour glow, rich blacks, cinematic' },
  },
  agency_services: {
    palette: { primary: '#0f172a', accent: '#6366f1', neutral: '#f8fafc', shadow: '#020617', description: 'modern digital bold' },
    typography: { headingFont: 'Space Grotesk', bodyFont: 'Inter', textOverlayDensity: 'medium', personality: 'sharp, innovative, confident' },
    grading: { look: 'digital modern', lutDirective: 'cool neutral, clean whites, accent color pops, high clarity' },
  },
};
