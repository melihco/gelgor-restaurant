/**
 * Local typography renderer — Satori → SVG → resvg PNG + sharp photo composite.
 *
 * Replaces expensive gpt-image / Ideogram typography edits for text-heavy design
 * slots with deterministic, pixel-accurate local rendering:
 *   real gallery photo (sharp cover-resize) + brand-colored panel & typography
 *   (Satori overlay) + optional logo badge → R2.
 *
 * Text is rendered by the font engine, so Turkish diacritics never garble and no
 * vision QA / retry loop is needed. On any failure the orchestrator returns
 * `null` so callers fall back to the existing gpt-image pipeline.
 *
 * Multi-tenant: every decision is driven by format, template type, layout hint,
 * vibe, and brand colors — never by tenant id or brand name.
 */

import satori from 'satori';
import { renderAsync } from '@resvg/resvg-js';
import type { TypographyVibe } from '@/types/brand-theme';
import { serverConfig } from '@/lib/server-config';
import { fetchExternalImageBuffer } from '@/lib/external-image-fetch';
import { resolveExternalGalleryPhotoTarget } from '@/lib/media-url';
import { persistImageBuffer } from '@/lib/persist-enhanced-images';
import sharp from '@/lib/sharp-runtime';
import { fontsForVibe, loadSatoriFontSet } from '@/lib/satori-fonts';
import { isLocalTypographyEnabledForBrand } from '@/lib/brand-production-engines';
import { LOCAL_TYPOGRAPHY_ROLES } from '@/lib/local-typography-meta';

/**
 * Layout families — mapped 1:1 from brand template Canva archetypes where possible.
 * Brands must diverge by geometry + vibe, not only corporate colors.
 *
 * - bottom_panel / photo_top — cream text slab under/over photo
 * - split_panel — solid brand color column beside photo
 * - hero_footer — full-bleed + centered type + thin brand footer (campaign_hero)
 * - frosted_quote — soft glass panel (frosted_quote_card) — chill / coastal
 * - polaroid — white frame + brand base (polaroid_memory) — casual / lifestyle
 * - neon_night — dark scrim + neon accent (neon_night_promo) — nightlife
 * - ticket_stub — masthead + tear-off slab (event_ticket_stub) — events
 * - cinematic — corner lockup, minimal chrome (cinematic / noir / editorial)
 */
export type LayoutFamily =
  | 'bottom_panel'
  | 'split_panel'
  | 'photo_top'
  | 'hero_footer'
  | 'frosted_quote'
  | 'polaroid'
  | 'neon_night'
  | 'ticket_stub'
  | 'cinematic';
export type SlotFormat = 'story' | 'post';

/** Corner logo fights these compositions (brand lives in the layout itself). */
export const NO_CORNER_LOGO_FAMILIES: ReadonlySet<LayoutFamily> = new Set([
  'hero_footer',
  'polaroid',
  'ticket_stub',
  'frosted_quote',
]);

/** Canva archetype id → Satori geometry (multi-tenant; never brand-name keyed). */
const ARCHETYPE_LAYOUT: Record<string, LayoutFamily> = {
  frosted_quote_card: 'frosted_quote',
  polaroid_memory: 'polaroid',
  neon_night_promo: 'neon_night',
  event_ticket_stub: 'ticket_stub',
  cinematic_full_bleed: 'cinematic',
  noir_editorial: 'cinematic',
  magazine_cover_drop: 'cinematic',
  editorial_date_masthead: 'cinematic',
  campaign_hero_block: 'hero_footer',
  social_proof_banner: 'hero_footer',
  promo_price_stack: 'hero_footer',
  location_pin_card: 'frosted_quote',
  product_hero_card: 'photo_top',
  gallery_carousel_tease: 'photo_top',
  graphic_shape_stack: 'neon_night',
  split_feature_panel: 'split_panel',
  diagonal_brand_split: 'split_panel',
  before_after_diptych: 'split_panel',
};

// Client-safe helpers live in local-typography-meta.ts; re-exported for server callers.
export { isSatoriTypographyMeta, LOCAL_TYPOGRAPHY_ROLES } from '@/lib/local-typography-meta';

/**
 * Single routing authority. `designed_post` (hero) and any reel role stay on the
 * expensive external pipeline and are intentionally NOT in the role set.
 */
export function shouldUseLocalTypography(
  slotRole: string | null | undefined,
  pipeline?: string | null,
  brandTheme?: Record<string, unknown> | null,
): boolean {
  if (!serverConfig.localTypography?.enabled) return false;
  if (!isLocalTypographyEnabledForBrand(brandTheme)) return false;
  const role = String(slotRole ?? '').trim();
  if (role && LOCAL_TYPOGRAPHY_ROLES.has(role)) return true;
  // Pipeline-level fallback for callers that only know the pipeline id.
  const p = String(pipeline ?? '').trim();
  if (p === 'fal_only_story' || p === 'fal_only_post') return true;
  return false;
}

// ── Color utilities (deterministic contrast QA — no vision LLM) ───────────────

const WARM_CREAM = '#F5EFE4';
const DEEP_INK = '#241f1a';

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = String(hex).trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(m)) {
    const r = parseInt(m[0]! + m[0]!, 16);
    const g = parseInt(m[1]! + m[1]!, 16);
    const b = parseInt(m[2]! + m[2]!, 16);
    return { r, g, b };
  }
  if (/^[0-9a-fA-F]{6}$/.test(m)) {
    return {
      r: parseInt(m.slice(0, 2), 16),
      g: parseInt(m.slice(2, 4), 16),
      b: parseInt(m.slice(4, 6), 16),
    };
  }
  return null;
}

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return (
    0.2126 * channelLuminance(rgb.r) +
    0.7152 * channelLuminance(rgb.g) +
    0.0722 * channelLuminance(rgb.b)
  );
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Pick cream or deep-ink text for a panel color, whichever passes WCAG AA best. */
export function pickReadableTextColor(panelHex: string): string {
  const creamContrast = contrastRatio(panelHex, WARM_CREAM);
  const inkContrast = contrastRatio(panelHex, DEEP_INK);
  return inkContrast >= creamContrast ? DEEP_INK : WARM_CREAM;
}

/** Text color for a light cream panel — brand primary if legible, else deep ink. */
function textOnCream(primary: string): string {
  return contrastRatio(primary, WARM_CREAM) >= 4.5 ? primary : DEEP_INK;
}

// ── Layout selection ──────────────────────────────────────────────────────────

export function formatForAspect(aspectRatio: string): SlotFormat {
  return aspectRatio === '9:16' ? 'story' : 'post';
}

/**
 * When the brand template has no Canva archetype, vibe still picks a distinct
 * geometry so chill / classy / luxury / nightlife brands don't share one shell.
 */
export function layoutFamilyForVibe(
  format: SlotFormat,
  vibe: TypographyVibe | null | undefined,
): LayoutFamily {
  if (format === 'post') {
    switch (vibe) {
      case 'neon_glow':
      case 'street_bold':
        return 'split_panel';
      case 'retro_poster':
      case 'handwritten':
        return 'photo_top';
      case 'editorial_serif':
      case 'chrome_gradient':
      case 'minimal_modern':
        return 'cinematic';
      case 'warm_coastal':
      case 'bubble_3d':
        return 'frosted_quote';
      default:
        return 'photo_top';
    }
  }
  switch (vibe) {
    case 'neon_glow':
    case 'street_bold':
    case 'bubble_3d':
      return 'neon_night';
    case 'retro_poster':
      return 'bottom_panel';
    case 'editorial_serif':
    case 'chrome_gradient':
    case 'minimal_modern':
      return 'cinematic';
    case 'handwritten':
    case 'warm_coastal':
      return 'frosted_quote';
    default:
      return 'hero_footer';
  }
}

/** Format-appropriate geometry rotation used when a slot has no archetype/pattern. */
const POST_LAYOUT_POOL: readonly LayoutFamily[] = [
  'photo_top',
  'split_panel',
  'frosted_quote',
  'cinematic',
  'bottom_panel',
  'polaroid',
];
const STORY_LAYOUT_POOL: readonly LayoutFamily[] = [
  'bottom_panel',
  'hero_footer',
  'cinematic',
  'frosted_quote',
  'neon_night',
  'ticket_stub',
];

/** Stable FNV-1a hash → deterministic per-slot geometry (no run-to-run drift). */
function seedHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * When a brand's templates carry no Canva archetype / layout pattern (common for
 * bootstrapped catalogs), every slot would otherwise collapse to the single
 * vibe-default geometry — producing one repeating look across the whole feed.
 * A stable per-slot seed rotates each slot to a distinct family, anchored on the
 * vibe default so the brand still reads coherently.
 */
export function diversifiedLayoutFamily(
  format: SlotFormat,
  vibe: TypographyVibe | null | undefined,
  slotSeed: string,
): LayoutFamily {
  const pool = format === 'story' ? STORY_LAYOUT_POOL : POST_LAYOUT_POOL;
  const base = layoutFamilyForVibe(format, vibe);
  const baseIdx = Math.max(0, pool.indexOf(base));
  const offset = seedHash(slotSeed) % pool.length;
  return pool[(baseIdx + offset) % pool.length]!;
}

function layoutFromArchetypeRecipe(recipe: string): LayoutFamily | null {
  for (const [id, family] of Object.entries(ARCHETYPE_LAYOUT)) {
    if (recipe.includes(id)) return family;
  }
  if (/frosted|glass.?panel|quote.?card/.test(recipe)) return 'frosted_quote';
  if (/polaroid/.test(recipe)) return 'polaroid';
  if (/neon.?night|neon.?glow|club.?neon/.test(recipe)) return 'neon_night';
  if (/ticket.?stub|event.?ticket|masthead/.test(recipe)) return 'ticket_stub';
  if (/cinematic|noir|magazine.?cover|editorial.?date/.test(recipe)) return 'cinematic';
  if (/campaign_hero|hero_block|hero_slab|offer.?block|brand.?slab|social_proof/.test(recipe)) {
    return 'hero_footer';
  }
  if (/split|side_panel|diagonal|diptych/.test(recipe)) return 'split_panel';
  return null;
}

/**
 * Pick a Satori layout from format + brand template archetype/pattern + vibe.
 * Catalog `canvaArchetypeId` / `layoutPattern` win; vibe is the fallback so
 * brands diverge even without a hard-pinned template.
 */
export function selectLayoutFamily(input: {
  format: SlotFormat;
  layoutFamilyHint?: string | null;
  templateType?: string | null;
  /** From brand_design_templates.design_spec.canvaArchetypeId */
  canvaArchetypeId?: string | null;
  /** From brand_design_templates.design_spec.layoutPattern */
  layoutPattern?: string | null;
  /** Brand typography vibe — geometry accent when archetype is absent */
  vibe?: TypographyVibe | null;
  /** Stable per-slot id (catalog_slot_key/template id) — diversifies vibe fallback. */
  slotSeed?: string | null;
}): LayoutFamily {
  const hint = String(input.layoutFamilyHint ?? '').toLowerCase();
  const templateType = String(input.templateType ?? '').toLowerCase();
  const archetype = String(input.canvaArchetypeId ?? '').toLowerCase().trim();
  const pattern = String(input.layoutPattern ?? '').toLowerCase();
  const recipe = `${archetype} ${pattern} ${hint}`;

  // Explicit operator / pipeline hints first
  if (hint.includes('bottom') || hint.includes('cream') || hint.includes('slab')) {
    return 'bottom_panel';
  }
  if (hint.includes('frosted') || hint.includes('glass') || hint.includes('quote')) {
    return 'frosted_quote';
  }
  if (hint.includes('polaroid')) return 'polaroid';
  if (hint.includes('neon')) return 'neon_night';
  if (hint.includes('ticket')) return 'ticket_stub';
  if (hint.includes('cinematic') || hint.includes('noir')) return 'cinematic';
  if (hint.includes('hero_footer') || hint.includes('footer')) return 'hero_footer';

  // Exact archetype id (hardest pin)
  if (archetype && ARCHETYPE_LAYOUT[archetype]) {
    const pinned = ARCHETYPE_LAYOUT[archetype]!;
    // Side-split on story still works; keep as-is for classy vertical brands.
    return pinned;
  }

  const fromRecipe = layoutFromArchetypeRecipe(recipe);
  if (fromRecipe) {
    if (input.format === 'post' && fromRecipe === 'hero_footer') {
      // Posts: campaign hero → brand split column (library post look).
      return 'split_panel';
    }
    if (input.format === 'story' && fromRecipe === 'photo_top') {
      return 'cinematic';
    }
    return fromRecipe;
  }

  if (input.format === 'story') {
    if (/campaign|promo|offer|announce/.test(templateType)) return 'hero_footer';
    if (/event/.test(templateType)) return 'ticket_stub';
    return input.slotSeed
      ? diversifiedLayoutFamily('story', input.vibe, input.slotSeed)
      : layoutFamilyForVibe('story', input.vibe);
  }

  if (hint.includes('split') || hint.includes('side') || /split|side_panel/.test(recipe)) {
    return 'split_panel';
  }
  if (hint.includes('photo_top') || hint.includes('top') || hint.includes('stacked')) {
    return 'photo_top';
  }
  if (/event|promo|campaign|announce|special/.test(templateType) || /campaign_hero|split/.test(recipe)) {
    return 'split_panel';
  }
  return input.slotSeed
    ? diversifiedLayoutFamily('post', input.vibe, input.slotSeed)
    : layoutFamilyForVibe('post', input.vibe);
}

export function resolveCanvasDimensions(aspectRatio: string): { width: number; height: number } {
  if (aspectRatio === '9:16') return { width: 1080, height: 1920 };
  if (aspectRatio === '1:1') return { width: 1080, height: 1080 };
  return { width: 1080, height: 1350 };
}

function headlineFontSize(headline: string, format: SlotFormat): number {
  const len = headline.trim().length;
  if (format === 'story') {
    if (len > 40) return 52;
    if (len > 26) return 64;
    if (len > 16) return 78;
    return 94;
  }
  if (len > 40) return 40;
  if (len > 26) return 48;
  if (len > 16) return 58;
  return 70;
}

// ── Satori overlay element builder (pure — testable without fonts) ────────────

type SatoriNode = {
  type: string;
  props: { style: Record<string, unknown>; children?: unknown };
} | null;

export interface OverlayContent {
  family: LayoutFamily;
  format: SlotFormat;
  headline: string;
  subtitle?: string;
  overline: string;
  headingFontFamily: string;
  bodyFontFamily: string;
  panelColor: string;
  textColor: string;
  accentColor: string;
  /** Optional vibe — neon/editorial accents on shared geometries */
  vibe?: TypographyVibe | null;
}

/**
 * Locale-aware uppercase: Turkish copy needs the dotted-İ mapping (i→İ, ı→I),
 * but tr-TR would corrupt English ("MISSION"→"MİSSİON"). The overline alone may
 * lack Turkish-specific letters ("Yeni Hasat"), so callers pass the slot's full
 * copy as the language signal.
 */
export function displayUppercase(text: string, languageSignal?: string): string {
  const sample = `${text} ${languageSignal ?? ''}`;
  return /[çğıİöşüÇĞÖŞÜ]/.test(sample) ? text.toLocaleUpperCase('tr-TR') : text.toUpperCase();
}

function overlineNode(content: OverlayContent): SatoriNode {
  if (!content.overline) return null;
  return {
    type: 'div',
    props: {
      style: {
        fontFamily: content.bodyFontFamily,
        fontWeight: 600,
        fontSize: content.format === 'story' ? 26 : 22,
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        color: content.accentColor,
        display: 'flex',
      },
      children: displayUppercase(
        content.overline,
        `${content.headline} ${content.subtitle ?? ''}`,
      ).slice(0, 42),
    },
  };
}

function headlineNode(content: OverlayContent): SatoriNode {
  return {
    type: 'div',
    props: {
      style: {
        fontFamily: content.headingFontFamily,
        fontWeight: 800,
        fontSize: headlineFontSize(content.headline, content.format),
        lineHeight: 1.04,
        letterSpacing: '-0.02em',
        color: content.textColor,
        display: 'flex',
      },
      children: content.headline.trim(),
    },
  };
}

function accentDivider(content: OverlayContent): SatoriNode {
  return {
    type: 'div',
    props: {
      style: {
        width: 84,
        height: 6,
        borderRadius: 3,
        background: content.accentColor,
        display: 'flex',
      },
    },
  };
}

function subtitleNode(content: OverlayContent): SatoriNode {
  const text = content.subtitle?.trim();
  if (!text) return null;
  return {
    type: 'div',
    props: {
      style: {
        fontFamily: content.bodyFontFamily,
        fontWeight: 500,
        fontSize: content.format === 'story' ? 34 : 28,
        lineHeight: 1.3,
        color: content.textColor,
        opacity: 0.88,
        display: 'flex',
      },
      children: text.slice(0, 120),
    },
  };
}

function textStack(content: OverlayContent, align: 'flex-start' | 'center') {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: align,
        gap: 20,
      },
      children: [
        overlineNode(content),
        headlineNode(content),
        accentDivider(content),
        subtitleNode(content),
      ].filter(Boolean),
    },
  };
}

/**
 * Build the transparent-background overlay tree. The photo is composited by
 * sharp underneath, so all non-panel regions stay transparent.
 */
export function buildOverlayElement(content: OverlayContent) {
  if (content.family === 'split_panel') {
    return {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'row',
          background: 'transparent',
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                width: '42%',
                height: '100%',
                background: content.panelColor,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                padding: 64,
              },
              children: [textStack(content, 'flex-start')],
            },
          },
        ],
      },
    };
  }

  if (content.family === 'frosted_quote') {
    return {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          padding: content.format === 'story' ? 64 : 56,
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                width: '82%',
                background: 'rgba(245, 239, 228, 0.90)',
                borderRadius: 28,
                border: `2px solid ${content.accentColor}33`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: content.format === 'story' ? 64 : 48,
                gap: 18,
              },
              children: [textStack({ ...content, panelColor: WARM_CREAM, textColor: content.textColor }, 'center')],
            },
          },
        ],
      },
    };
  }

  if (content.family === 'polaroid') {
    const frameCaption = content.overline
      ? {
          type: 'div',
          props: {
            style: {
              fontFamily: content.bodyFontFamily,
              fontWeight: 600,
              fontSize: 22,
              letterSpacing: '0.08em',
              color: DEEP_INK,
              display: 'flex',
              marginTop: 16,
            },
            children: displayUppercase(
              content.overline,
              `${content.headline} ${content.subtitle ?? ''}`,
            ).slice(0, 36),
          },
        }
      : null;
    return {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'transparent',
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                flex: 1,
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 48,
                background: 'transparent',
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      width: '78%',
                      height: content.format === 'story' ? '58%' : '62%',
                      background: '#FFFFFF',
                      borderRadius: 6,
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '28px 28px 20px 28px',
                      boxShadow: '0 18px 48px rgba(0,0,0,0.28)',
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            flex: 1,
                            width: '100%',
                            background: 'transparent',
                            display: 'flex',
                          },
                          children: [],
                        },
                      },
                      frameCaption,
                    ].filter(Boolean),
                  },
                },
              ],
            },
          },
          {
            type: 'div',
            props: {
              style: {
                width: '100%',
                height: '22%',
                background: content.panelColor,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                padding: content.format === 'story' ? 48 : 40,
                gap: 12,
              },
              children: [
                headlineNode({ ...content, textColor: content.textColor }),
                subtitleNode({ ...content, textColor: content.textColor }),
              ].filter(Boolean),
            },
          },
        ],
      },
    };
  }

  if (content.family === 'neon_night') {
    const neonLine = {
      type: 'div',
      props: {
        style: {
          width: 120,
          height: 4,
          borderRadius: 2,
          background: content.accentColor,
          boxShadow: `0 0 18px ${content.accentColor}`,
          display: 'flex',
          marginBottom: 8,
        },
      },
    };
    const whiteHeadline = {
      type: 'div',
      props: {
        style: {
          fontFamily: content.headingFontFamily,
          fontWeight: 800,
          fontSize: headlineFontSize(content.headline, content.format),
          lineHeight: 1.04,
          letterSpacing: '-0.02em',
          color: '#FFFFFF',
          display: 'flex',
          textShadow: `0 0 24px ${content.accentColor}88`,
        },
        children: content.headline.trim(),
      },
    };
    const whiteSub = content.subtitle?.trim()
      ? {
          type: 'div',
          props: {
            style: {
              fontFamily: content.bodyFontFamily,
              fontWeight: 500,
              fontSize: content.format === 'story' ? 32 : 26,
              lineHeight: 1.3,
              color: '#FFFFFF',
              opacity: 0.9,
              display: 'flex',
            },
            children: content.subtitle.trim().slice(0, 120),
          },
        }
      : null;
    const over = content.overline
      ? {
          type: 'div',
          props: {
            style: {
              fontFamily: content.bodyFontFamily,
              fontWeight: 700,
              fontSize: 22,
              letterSpacing: '0.28em',
              color: content.accentColor,
              display: 'flex',
              textShadow: `0 0 12px ${content.accentColor}`,
            },
            children: displayUppercase(
              content.overline,
              `${content.headline} ${content.subtitle ?? ''}`,
            ).slice(0, 42),
          },
        }
      : null;
    return {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          background: 'transparent',
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                width: '100%',
                height: content.format === 'story' ? '44%' : '40%',
                background: content.panelColor,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                padding: content.format === 'story' ? 72 : 56,
                gap: 16,
              },
              children: [over, whiteHeadline, neonLine, whiteSub].filter(Boolean),
            },
          },
        ],
      },
    };
  }

  if (content.family === 'ticket_stub') {
    const masthead = {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '14%',
          background: content.panelColor,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        },
        children: content.overline
          ? [
              {
                type: 'div',
                props: {
                  style: {
                    fontFamily: content.bodyFontFamily,
                    fontWeight: 700,
                    fontSize: 26,
                    letterSpacing: '0.2em',
                    color: content.textColor,
                    display: 'flex',
                  },
                  children: displayUppercase(
                    content.overline,
                    `${content.headline} ${content.subtitle ?? ''}`,
                  ).slice(0, 42),
                },
              },
            ]
          : [],
      },
    };
    return {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'transparent',
        },
        children: [
          masthead,
          {
            type: 'div',
            props: {
              style: {
                flex: 1,
                width: '100%',
                background: 'transparent',
                display: 'flex',
              },
              children: [],
            },
          },
          {
            type: 'div',
            props: {
              style: {
                width: '100%',
                height: '34%',
                background: WARM_CREAM,
                borderTop: `6px dashed ${content.accentColor}`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                padding: content.format === 'story' ? 64 : 52,
                gap: 16,
              },
              children: [
                headlineNode({
                  ...content,
                  textColor: textOnCream(
                    hexToRgb(content.panelColor) ? content.panelColor : DEEP_INK,
                  ),
                }),
                accentDivider(content),
                subtitleNode({
                  ...content,
                  textColor: DEEP_INK,
                }),
              ].filter(Boolean),
            },
          },
        ],
      },
    };
  }

  if (content.family === 'cinematic') {
    const lockupAlign = 'flex-start' as const;
    const whiteHeadline = {
      type: 'div',
      props: {
        style: {
          fontFamily: content.headingFontFamily,
          fontWeight: 800,
          fontSize: headlineFontSize(content.headline, content.format) - (content.format === 'story' ? 8 : 4),
          lineHeight: 1.05,
          letterSpacing: content.vibe === 'editorial_serif' ? '0.01em' : '-0.02em',
          color: '#FFFFFF',
          display: 'flex',
          textShadow: '0 2px 20px rgba(0,0,0,0.55)',
          maxWidth: '88%',
        },
        children: content.headline.trim(),
      },
    };
    const whiteSub = content.subtitle?.trim()
      ? {
          type: 'div',
          props: {
            style: {
              fontFamily: content.bodyFontFamily,
              fontWeight: 500,
              fontSize: content.format === 'story' ? 30 : 24,
              lineHeight: 1.35,
              color: '#FFFFFF',
              opacity: 0.9,
              display: 'flex',
              textShadow: '0 1px 12px rgba(0,0,0,0.45)',
              maxWidth: '80%',
            },
            children: content.subtitle.trim().slice(0, 120),
          },
        }
      : null;
    const over = content.overline
      ? {
          type: 'div',
          props: {
            style: {
              fontFamily: content.bodyFontFamily,
              fontWeight: 600,
              fontSize: 20,
              letterSpacing: '0.24em',
              color: content.accentColor,
              display: 'flex',
            },
            children: displayUppercase(
              content.overline,
              `${content.headline} ${content.subtitle ?? ''}`,
            ).slice(0, 42),
          },
        }
      : null;
    return {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          background: 'transparent',
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: lockupAlign,
                justifyContent: 'flex-end',
                padding: content.format === 'story' ? '0 64px 96px 64px' : '0 52px 72px 52px',
                gap: 14,
                background: 'transparent',
              },
              children: [over, whiteHeadline, accentDivider(content), whiteSub].filter(Boolean),
            },
          },
        ],
      },
    };
  }

  // campaign_hero_block: full-bleed photo, centered overlay type, thin brand footer.
  if (content.family === 'hero_footer') {
    const headlineEl = headlineNode(content)!;
    const overlayHeadline = {
      type: headlineEl.type,
      props: {
        ...headlineEl.props,
        style: {
          ...headlineEl.props.style,
          color: '#FFFFFF',
          textAlign: 'center',
          textShadow: '0 2px 18px rgba(0,0,0,0.45)',
        },
      },
    };
    const overlaySubtitle = content.subtitle?.trim()
      ? {
          type: 'div',
          props: {
            style: {
              fontFamily: content.bodyFontFamily,
              fontWeight: 500,
              fontSize: 34,
              lineHeight: 1.3,
              color: '#FFFFFF',
              opacity: 0.92,
              display: 'flex',
              textAlign: 'center',
              textShadow: '0 1px 12px rgba(0,0,0,0.4)',
            },
            children: content.subtitle.trim().slice(0, 120),
          },
        }
      : null;
    const footerLabel = content.overline
      ? {
          type: 'div',
          props: {
            style: {
              fontFamily: content.bodyFontFamily,
              fontWeight: 700,
              fontSize: 28,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: content.textColor,
              display: 'flex',
            },
            children: displayUppercase(
              content.overline,
              `${content.headline} ${content.subtitle ?? ''}`,
            ).slice(0, 42),
          },
        }
      : null;

    return {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'transparent',
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                flex: 1,
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 72,
                gap: 22,
                background: 'transparent',
              },
              children: [overlayHeadline, overlaySubtitle].filter(Boolean),
            },
          },
          {
            type: 'div',
            props: {
              style: {
                width: '100%',
                height: '14%',
                background: content.panelColor,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 28,
              },
              children: footerLabel ? [footerLabel] : [],
            },
          },
        ],
      },
    };
  }

  const panelHeight = content.family === 'bottom_panel' ? '36%' : '38%';
  return {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        background: 'transparent',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              width: '100%',
              height: panelHeight,
              background: content.panelColor,
              borderTop: `6px solid ${content.accentColor}`,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: content.format === 'story' ? 72 : 60,
            },
            children: [textStack(content, 'flex-start')],
          },
        },
      ],
    },
  };
}

// ── Orchestrator ────────────────────────────────────────────────────────────

export interface LocalTypographyInput {
  workspaceId: string;
  headline: string;
  subtitle?: string;
  brandName: string;
  brandColors: { primary: string; accent: string };
  vibe: TypographyVibe | null;
  aspectRatio: '9:16' | '4:5' | '1:1';
  referencePhotoUrl: string;
  logoUrl?: string;
  sector?: string;
  occasion?: { name: string; mood?: string } | null;
  layoutFamilyHint?: string | null;
  templateType?: string | null;
  /** Brand template Canva archetype — primary layout pin. */
  canvaArchetypeId?: string | null;
  layoutPattern?: string | null;
  slotRole?: string;
  /** Stable per-slot id (catalog_slot_key/template id) — diversifies vibe fallback. */
  slotSeed?: string | null;
}

export interface LocalTypographyResult {
  imageUrl: string;
  typographyModel: 'satori_local';
  grafikerScore: null;
  grafikerPass: true;
  layoutFamily: LayoutFamily;
  resolvedHeadline: string;
}

/** Resolve panel + text + accent colors for a layout family (deterministic QA). */
export function resolvePanelColors(
  family: LayoutFamily,
  brandColors: { primary: string; accent: string },
  vibe?: TypographyVibe | null,
): { panelColor: string; textColor: string; accentColor: string } {
  const primary = hexToRgb(brandColors.primary) ? brandColors.primary : '#1f2a30';
  const accent = hexToRgb(brandColors.accent) ? brandColors.accent : '#c9813f';

  if (family === 'split_panel') {
    // Solid brand color block — pick a readable cream/ink for the text.
    const textColor = pickReadableTextColor(primary);
    // Accent must read against the panel too; fall back to the text color.
    const accentColor = contrastRatio(accent, primary) >= 2.2 ? accent : textColor;
    return { panelColor: primary, textColor, accentColor };
  }

  if (family === 'hero_footer' || family === 'polaroid' || family === 'ticket_stub') {
    // Brand bar / masthead — choose accent or primary for the highest AA text contrast.
    const candidates = [accent, primary].filter((c) => Boolean(hexToRgb(c)));
    let panelColor = primary;
    let textColor = pickReadableTextColor(primary);
    let best = contrastRatio(panelColor, textColor);
    for (const c of candidates) {
      const t = pickReadableTextColor(c);
      const r = contrastRatio(c, t);
      if (r > best) {
        panelColor = c;
        textColor = t;
        best = r;
      }
    }
    return { panelColor, textColor, accentColor: accent };
  }

  if (family === 'neon_night') {
    const panelColor = vibe === 'chrome_gradient' ? '#12121a' : '#0a0a12';
    const accentColor = contrastRatio(accent, panelColor) >= 2.5 ? accent : '#FF4FD8';
    return { panelColor, textColor: '#FFFFFF', accentColor };
  }

  if (family === 'cinematic') {
    // Scrim-less corner lockup — accent must pop on photo; text is white in overlay.
    const accentColor = contrastRatio(accent, '#000000') >= 2.2 ? accent : primary;
    return { panelColor: '#000000', textColor: '#FFFFFF', accentColor };
  }

  if (family === 'frosted_quote') {
    const textColor = textOnCream(primary);
    const accentColor = contrastRatio(accent, WARM_CREAM) >= 2.2 ? accent : primary;
    return { panelColor: WARM_CREAM, textColor, accentColor };
  }

  // Warm cream panel — brand primary text when legible, accent divider from brand.
  const textColor = textOnCream(primary);
  const accentColor = contrastRatio(accent, WARM_CREAM) >= 2.2 ? accent : primary;
  return { panelColor: WARM_CREAM, textColor, accentColor };
}

async function compositeLogoBadge(
  baseBuffer: Buffer,
  logoUrl: string | undefined,
  dims: { width: number; height: number },
): Promise<Buffer> {
  if (!logoUrl) return baseBuffer;
  try {
    const logoBuf = await fetchExternalImageBuffer(logoUrl, 12_000);
    if (!logoBuf) return baseBuffer;
    const badgeWidth = Math.round(dims.width * 0.16);
    const logo = await sharp(logoBuf)
      .resize(badgeWidth, badgeWidth, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    const pad = Math.round(dims.width * 0.05);
    return await sharp(baseBuffer)
      .composite([{ input: logo, top: pad, left: pad }])
      .jpeg({ quality: 92 })
      .toBuffer();
  } catch {
    return baseBuffer;
  }
}

/** Extract the R2 object key from a `/api/media?key=…` proxy URL (relative or absolute). */
function mediaProxyKeyFromUrl(url: string): string | null {
  const idx = url.indexOf('/api/media?');
  if (idx === -1) return null;
  const q = url.indexOf('?', idx);
  try {
    return new URLSearchParams(url.slice(q + 1)).get('key');
  } catch {
    return null;
  }
}

/**
 * Resolve the reference photo bytes. Tenant gallery photos are often served via
 * the relative `/api/media?key=…` R2 proxy, which a plain HTTP fetch cannot
 * load from inside the worker — read the R2 object directly instead.
 */
async function fetchReferencePhotoBuffer(url: string): Promise<Buffer | null> {
  const key = mediaProxyKeyFromUrl(url);
  if (key) {
    const { readR2ObjectBuffer } = await import('@/lib/r2-storage');
    const buf = await readR2ObjectBuffer(key);
    if (buf) return buf;
  }
  const external = resolveExternalGalleryPhotoTarget(url);
  if (external) return fetchExternalImageBuffer(external, 20_000);
  return null;
}

/**
 * Render a text-heavy design still locally. Returns `null` on any failure so the
 * caller can fall back to the existing gpt-image / Ideogram pipeline.
 */
export async function renderLocalTypography(
  input: LocalTypographyInput,
): Promise<LocalTypographyResult | null> {
  const headline = input.headline?.trim();
  if (!headline || !input.referencePhotoUrl) return null;

  try {
    const dims = resolveCanvasDimensions(input.aspectRatio);
    const format = formatForAspect(input.aspectRatio);
    const family = selectLayoutFamily({
      format,
      layoutFamilyHint: input.layoutFamilyHint,
      templateType: input.templateType,
      canvaArchetypeId: input.canvaArchetypeId,
      layoutPattern: input.layoutPattern,
      vibe: input.vibe,
      slotSeed: input.slotSeed,
    });

    const photoBuf = await fetchReferencePhotoBuffer(input.referencePhotoUrl);
    if (!photoBuf || photoBuf.length < 100) {
      console.warn(
        `[local-typography] reference photo unreachable, falling back: ${input.referencePhotoUrl.slice(0, 100)}`,
      );
      return null;
    }

    const base = await sharp(photoBuf)
      .resize(dims.width, dims.height, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 90 })
      .toBuffer();

    const { heading, body } = fontsForVibe(input.vibe);
    const fonts = await loadSatoriFontSet([
      { name: heading, weight: 800 },
      { name: heading, weight: 700 },
      { name: body, weight: 600 },
      { name: body, weight: 500 },
      { name: body, weight: 400 },
    ]);
    if (fonts.length === 0) return null;

    const colors = resolvePanelColors(family, input.brandColors, input.vibe);
    const content: OverlayContent = {
      family,
      format,
      headline,
      subtitle: input.subtitle,
      overline: input.occasion?.name?.trim() || input.brandName?.trim() || '',
      headingFontFamily: heading,
      bodyFontFamily: body,
      vibe: input.vibe,
      ...colors,
    };

    const element = buildOverlayElement(content);
    const svg = await satori(element as Parameters<typeof satori>[0], {
      width: dims.width,
      height: dims.height,
      fonts,
    });
    const png = await renderAsync(svg, { fitTo: { mode: 'width', value: dims.width } });
    const overlayPng = Buffer.from(png.asPng());

    let composite = await sharp(base)
      .composite([{ input: overlayPng, top: 0, left: 0 }])
      .jpeg({ quality: 92 })
      .toBuffer();
    composite = await compositeLogoBadge(
      composite,
      NO_CORNER_LOGO_FAMILIES.has(family) ? undefined : input.logoUrl,
      dims,
    );

    const imageUrl = await persistImageBuffer(composite, input.workspaceId, 'image/jpeg');
    if (!imageUrl) return null;

    console.log(
      `[local-typography] rendered ${family} ${input.aspectRatio} ` +
        `vibe=${input.vibe ?? 'default'} role=${input.slotRole ?? '-'} "${headline.slice(0, 40)}"`,
    );

    return {
      imageUrl,
      typographyModel: 'satori_local',
      grafikerScore: null,
      grafikerPass: true,
      layoutFamily: family,
      resolvedHeadline: headline,
    };
  } catch (err) {
    console.warn(
      '[local-typography] render failed, falling back:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
