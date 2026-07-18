/**
 * Shared Brand Vibe extraction — vision + caption-voice prompts and assembly.
 * Used by extract-vibe BFF (handles scrape OR onboarding gallery skip-scrape).
 */

export const VIBE_VISUAL_PROMPT = `You are a senior creative director at a top-tier social media agency. You are reverse-engineering the visual DNA of a reference Instagram account so we can produce content that matches its agency-level quality.

Look at ALL the provided images as a SET (they're from the same account / same vibe).

Return ONLY this exact JSON, no markdown:
{
  "palette": {
    "primary": "#rrggbb",
    "accent": "#rrggbb",
    "neutral": "#rrggbb",
    "shadow": "#rrggbb",
    "palette_description": "1 sentence on how the palette feels (e.g. 'sun-bleached warm neutrals with deep teal accents')"
  },
  "typography": {
    "heading_personality": "e.g. 'condensed editorial uppercase serif' / 'wide tracked sans / handwritten script'",
    "body_personality": "e.g. 'minimal small caps' / 'none, captions only'",
    "text_overlay_density": "minimal | medium | dense",
    "typography_role": "1 sentence on what role text plays in the visuals"
  },
  "motion": {
    "pace": "slow_observational | rhythmic | kinetic",
    "cuts_per_10_seconds_estimate": 1.5,
    "camera_movement": "e.g. 'static-locked with subtle parallax' / 'handheld push-in'",
    "shot_grammar": "1 sentence on how shots are composed (e.g. 'wide → product → person reaction, always ending on negative space')"
  },
  "grading": {
    "look": "golden_hour | sun_bleached | cinematic_teal_orange | moody_low_key | clean_minimal | film_grain | vibrant_saturated",
    "lut_directive": "Concrete grading instruction agents can pass to image gen (e.g. 'lift shadows +10, warm highlights, desaturate blues, +grain')"
  },
  "audio": {
    "mood": "ambient | upbeat | dreamy_vocal | tropical_house | indie_acoustic | chill_lofi | none",
    "description": "1 sentence about what kind of music/audio fits"
  },
  "composition": {
    "primary_pattern": "rule_of_thirds | centered | golden_ratio | negative_space_heavy | symmetrical",
    "framing_rules": "1 sentence on framing tendencies (e.g. 'subject lower-third, sky/ceiling occupies top 2/3')",
    "subject_focus": "1 sentence on what is typically the subject"
  },
  "content_pillars_visual": ["3-6 short visual content themes recurring in the feed (e.g. 'sunset poolside', 'flat-lay cocktails', 'guest portraits')"],
  "anti_patterns": ["3-6 things THIS account would NEVER post (e.g. 'cluttered text overlays', 'oversaturated stock-style food', 'busy backgrounds')"],
  "what_makes_this_agency_level": "1-2 sentences naming the specific moves that elevate this above a typical small-business feed"
}`;

export const CAPTION_VOICE_PROMPT = `You are a senior copy strategist. Reverse-engineer the caption voice from these recent captions.

Return ONLY this exact JSON, no markdown:
{
  "style": "1 sentence describing the voice (e.g. 'cool insider, lowercase, never explanatory')",
  "avg_word_count": 18,
  "uses_emojis": true,
  "uses_hashtags_in_caption_body": false,
  "punctuation_style": "1 sentence (e.g. 'minimal periods, em-dashes for beats')",
  "tonal_anchors": ["3-5 adjectives that anchor the voice"],
  "writing_rules": ["4-7 specific rules a copywriter can follow to match this voice (e.g. 'never use ! in body', 'always lowercase first word', 'end with a single emoji or nothing')"],
  "example_template": "A reusable skeleton e.g. '{vibe phrase} — {sensory detail}. {invitation}.'"
}`;

export interface BrandVibeProfile {
  source_accounts: string[];
  extracted_at: string;
  image_sample_count: number;
  caption_sample_count: number;
  palette?: unknown;
  typography?: unknown;
  motion?: unknown;
  grading?: unknown;
  audio?: unknown;
  composition?: unknown;
  caption_voice?: unknown;
  content_pillars_visual: string[];
  anti_patterns: string[];
  what_makes_this_agency_level?: string;
  reference_frames: { url: string; source_account: string; why_representative?: string }[];
  enrichment_note?: string;
  source_mode?: 'handles_scrape' | 'onboarding_gallery';
}

export function safeParseJsonObject(raw: string): Record<string, unknown> {
  const match = raw.match(/\{[\s\S]*\}/);
  try {
    return JSON.parse(match?.[0] ?? raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function assembleBrandVibeProfile(input: {
  sourceAccounts: string[];
  visualJson: Record<string, unknown>;
  voiceJson?: Record<string, unknown>;
  referenceFrames: { url: string; source_account: string; why_representative?: string }[];
  captionSampleCount: number;
  sourceMode: 'handles_scrape' | 'onboarding_gallery';
  enrichmentNote?: string;
}): BrandVibeProfile {
  const visualJson = input.visualJson;
  const voiceJson = input.voiceJson ?? {};
  return {
    source_accounts: input.sourceAccounts,
    extracted_at: new Date().toISOString(),
    image_sample_count: input.referenceFrames.length,
    caption_sample_count: input.captionSampleCount,
    palette: visualJson.palette,
    typography: visualJson.typography,
    motion: visualJson.motion,
    grading: visualJson.grading,
    audio: visualJson.audio,
    composition: visualJson.composition,
    caption_voice: Object.keys(voiceJson).length > 0 ? voiceJson : undefined,
    content_pillars_visual: Array.isArray(visualJson.content_pillars_visual)
      ? (visualJson.content_pillars_visual as unknown[]).map(String)
      : [],
    anti_patterns: Array.isArray(visualJson.anti_patterns)
      ? (visualJson.anti_patterns as unknown[]).map(String)
      : [],
    what_makes_this_agency_level:
      typeof visualJson.what_makes_this_agency_level === 'string'
        ? visualJson.what_makes_this_agency_level
        : undefined,
    reference_frames: input.referenceFrames,
    source_mode: input.sourceMode,
    enrichment_note: input.enrichmentNote,
  };
}

/** Minimal schema check used by onboarding / gap-repair smoke tests. */
export function isSchemaValidBrandVibeProfile(profile: unknown): boolean {
  if (!profile || typeof profile !== 'object') return false;
  const p = profile as Record<string, unknown>;
  return (
    typeof p.extracted_at === 'string'
    && typeof p.motion === 'object'
    && p.motion !== null
    && typeof p.palette === 'object'
    && p.palette !== null
    && Array.isArray(p.anti_patterns)
  );
}

export function parseCaptionList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((c) => String(c ?? '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((c) => String(c ?? '').trim()).filter(Boolean);
      }
    } catch {
      return raw
        .split(/\n+/)
        .map((c) => c.trim())
        .filter(Boolean);
    }
  }
  return [];
}
