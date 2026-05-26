/**
 * CanvasOutput — structured contract between Crew agent output and layout renderer.
 *
 * Every content_ideation idea must conform to this shape before being
 * passed to the LayoutEngine. canvas_output_parser.py parses the raw LLM
 * JSON into this structure, filling safe defaults for missing fields.
 */

import type { LayoutId } from './brand-theme';

export interface CanvasOutputVisualBrief {
  /**
   * Photo treatment directive — e.g. "use gallery URL X with warm grade"
   * or "generate: close-up of product with marble background".
   */
  treatment: string;
  /**
   * Selected gallery photo URL (if matched from brand gallery).
   * null = generate new image.
   */
  galleryUrl: string | null;
  /** Shot type hint for generation — e.g. "close-up", "wide environmental", "flat lay" */
  shotType: string;
  /** Whether to include people in the visual */
  includePeople: boolean;
}

export interface CanvasOutputTokensHint {
  /**
   * Override palette primary for this specific post — e.g. for seasonal campaign.
   * null = use BrandTheme.palette.primary.
   */
  primaryColor: string | null;
  /** Overlay opacity override — null = use BrandTheme.overlay.opacity */
  overlayOpacity: number | null;
  /** Typography weight hint — "light" | "regular" | "bold" */
  typographyWeight: 'light' | 'regular' | 'bold' | null;
}

export interface CanvasOutput {
  // ── Content slots ──────────────────────────────────────────────────────────
  /** Primary headline — max 60 chars */
  headline: string;
  /** Supporting subline — max 120 chars. Empty string if not needed. */
  subline: string;
  /** Body bullet points — 0–4 items, each max 80 chars */
  bullets: string[];
  /** Full social media caption draft */
  caption: string;
  /** Call-to-action text — max 40 chars */
  cta: string;
  /** Hashtags as a space-separated string */
  hashtags: string;

  // ── Layout directive ───────────────────────────────────────────────────────
  /**
   * Which layout template to render.
   * LLM does NOT choose this — layout_selector.ts maps content type → layout_id.
   * This field is populated by the selector after parsing, not by the LLM.
   */
  layoutId: LayoutId;
  /**
   * Suggested posting time (ISO 8601).
   * Must be in the future relative to generation time.
   */
  postingTimeSuggestion: string;
  /** Content type string from ideation — e.g. "menu_share", "event_announcement" */
  contentType: string;
  /** Format: "feed" | "story" | "reel" | "carousel" */
  format: 'feed' | 'story' | 'reel' | 'carousel';

  // ── Visual directive ───────────────────────────────────────────────────────
  visualBrief: CanvasOutputVisualBrief;
  /** Per-post token overrides — all fields optional, null = use brand default */
  tokensHint: CanvasOutputTokensHint;

  // ── Metadata ───────────────────────────────────────────────────────────────
  /** The original idea title/concept from the agent */
  ideaTitle: string;
  /** 0–1 confidence that this idea is brand-appropriate */
  brandConfidence: number;
  /** Which anti-patterns (if any) this idea was flagged for — empty = clean */
  antiPatternFlags: string[];
}

// ── Safe defaults used by canvas_output_parser.py ────────────────────────────
export const CANVAS_OUTPUT_DEFAULTS: Omit<CanvasOutput, 'headline' | 'caption' | 'ideaTitle'> = {
  subline: '',
  bullets: [],
  cta: '',
  hashtags: '',
  layoutId: 'feed_square',
  postingTimeSuggestion: '',
  contentType: 'social_post',
  format: 'feed',
  visualBrief: {
    treatment: 'use best matching gallery photo',
    galleryUrl: null,
    shotType: 'environmental',
    includePeople: false,
  },
  tokensHint: {
    primaryColor: null,
    overlayOpacity: null,
    typographyWeight: null,
  },
  brandConfidence: 0.8,
  antiPatternFlags: [],
};
