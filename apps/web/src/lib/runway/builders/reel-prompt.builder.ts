/**
 * Reel Prompt Builder
 *
 * Converts structured JSON input (from CrewAI or direct API) into
 * a high-quality, cinematic text prompt optimized for Runway Gen 4.5.
 *
 * Design principles:
 * - First 2 seconds always start with a strong visual hook
 * - Vertical 9:16 composition is explicit in every prompt
 * - Camera motion, lighting, and mood are always specified
 * - Prompts are optimized for social-media-first viewing
 * - No negative prompts needed (Runway handles these internally)
 */

import { normalizeCameraMotion } from '@/lib/camera-motion';
import { applyFidelityToDirectorPrompt } from '@/lib/runway-reel-fidelity';
import type {
  CameraMotion,
  PromptBuilderContext,
  VisualStyle,
} from '../types/reel.types';

// ── Camera motion → natural language ─────────────────────────────────────

const CAMERA_MOTION_DESCRIPTORS: Record<CameraMotion, string> = {
  slow_pan: 'smooth slow horizontal camera pan',
  dolly_in: 'cinematic dolly-in push toward subject',
  dolly_out: 'cinematic dolly-out pull away from subject',
  static: 'locked-off static camera, perfectly still',
  handheld: 'subtle handheld movement, intimate and organic feel',
  tracking: 'smooth tracking shot following the subject',
  orbit: 'slow orbital rotation around the subject',
  tilt_up: 'elegant upward tilt reveal from ground to sky',
  tilt_down: 'dramatic downward tilt from wide to subject',
};

function resolveCameraMotion(motion?: string): string {
  if (!motion) return 'smooth cinematic camera movement';
  const normalized = normalizeCameraMotion(motion);
  const known = CAMERA_MOTION_DESCRIPTORS[normalized];
  return known ?? motion;
}

// ── Visual style → cinematic language ────────────────────────────────────

const VISUAL_STYLE_DESCRIPTORS: Record<VisualStyle, string> = {
  cinematic: 'cinematic wide-angle composition, film grain, anamorphic lens',
  lifestyle: 'authentic lifestyle photography, natural light, candid moments',
  minimalist: 'clean minimalist aesthetic, negative space, precise framing',
  dramatic: 'high-contrast dramatic lighting, deep shadows, intense mood',
  warm: 'warm golden tones, soft bokeh, inviting atmosphere',
  editorial: 'editorial fashion photography, sharp lines, sophisticated composition',
  documentary: 'documentary realism, natural colors, honest storytelling',
  luxury: 'ultra-luxury aesthetic, rich textures, premium materials, elegant lighting',
  energetic: 'dynamic fast-paced energy, vibrant colors, motion blur accents',
  soft: 'soft diffused lighting, pastel tones, gentle bokeh, dreamy atmosphere',
};

function resolveVisualStyle(style?: string): string {
  if (!style) return 'cinematic wide-angle composition';
  const known = VISUAL_STYLE_DESCRIPTORS[style as VisualStyle];
  return known ?? style;
}

// ── Content type → opener hook ────────────────────────────────────────────

function buildOpeningHook(
  contentType: string,
  concept: string,
  title: string,
): string {
  const lower = contentType.toLowerCase();

  if (lower.includes('venue') || lower.includes('restaurant') || lower.includes('cafe')) {
    return `Opening shot: An inviting exterior or interior reveal of the venue`;
  }
  if (lower.includes('product')) {
    return `Opening shot: A dramatic product close-up emerging from soft shadow`;
  }
  if (lower.includes('event')) {
    return `Opening shot: The energy and atmosphere of the event from an elevated angle`;
  }
  if (lower.includes('service') || lower.includes('promo')) {
    return `Opening shot: A compelling visual metaphor for the service benefit`;
  }
  if (lower.includes('ad') || lower.includes('campaign')) {
    return `Opening shot: High-impact brand visual with immediate emotional pull`;
  }
  if (lower.includes('lifestyle')) {
    return `Opening shot: An aspirational lifestyle moment unfolding naturally`;
  }

  // Generic fallback: extract key nouns from concept
  const words = concept.split(' ').slice(0, 6).join(' ');
  return `Opening shot: Visually arresting scene of ${words}`;
}

// ── Lighting descriptor ────────────────────────────────────────────────────

function inferLighting(
  brandTone?: string,
  visualStyle?: string,
  tags?: string[],
): string {
  const combined = [brandTone, visualStyle, ...(tags ?? [])].join(' ').toLowerCase();

  if (combined.includes('luxury') || combined.includes('premium')) {
    return 'warm tungsten accent lighting, dramatic shadows, luxury product lighting';
  }
  if (combined.includes('outdoor') || combined.includes('nature') || combined.includes('sunset')) {
    return 'natural golden hour light, warm sunflares, ambient outdoor illumination';
  }
  if (combined.includes('night') || combined.includes('bar') || combined.includes('club')) {
    return 'moody ambient lighting, neon accents, atmospheric glow';
  }
  if (combined.includes('food') || combined.includes('restaurant') || combined.includes('menu')) {
    return 'soft diffused food photography lighting, warm tones, appetizing ambiance';
  }
  if (combined.includes('tech') || combined.includes('digital') || combined.includes('ai')) {
    return 'cool blue-teal studio lighting, sharp highlights, futuristic atmosphere';
  }
  if (combined.includes('minimal') || combined.includes('clean')) {
    return 'bright clean studio lighting, even exposure, no harsh shadows';
  }

  return 'professional soft-box lighting, balanced exposure, flattering tone';
}

// ── Audience/mood descriptor ──────────────────────────────────────────────

function inferMood(brandTone?: string, targetAudience?: string): string {
  const combined = [brandTone, targetAudience].join(' ').toLowerCase();

  if (combined.includes('luxury') || combined.includes('premium') || combined.includes('high-end')) {
    return 'sophisticated, aspirational, exclusive';
  }
  if (combined.includes('young') || combined.includes('gen-z') || combined.includes('millennial')) {
    return 'energetic, authentic, culturally relevant';
  }
  if (combined.includes('professional') || combined.includes('b2b') || combined.includes('corporate')) {
    return 'confident, authoritative, trustworthy';
  }
  if (combined.includes('family') || combined.includes('parent') || combined.includes('home')) {
    return 'warm, welcoming, relatable, emotionally resonant';
  }
  if (combined.includes('fitness') || combined.includes('sport') || combined.includes('health')) {
    return 'high-energy, motivational, empowering';
  }
  if (combined.includes('food') || combined.includes('restaurant') || combined.includes('cafe')) {
    return 'inviting, sensory-rich, appetite-stimulating';
  }

  return 'engaging, polished, social-media-native';
}

// ── CTA integration ───────────────────────────────────────────────────────

function buildCtaEnding(cta?: string): string {
  if (!cta) return '';
  return `, ending with a visual pause that creates desire for "${cta}"`;
}

// ── Tag context ────────────────────────────────────────────────────────────

function buildTagContext(tags?: string[]): string {
  if (!tags || tags.length === 0) return '';
  const cleaned = tags.map((t) => t.replace(/^#/, '')).slice(0, 5);
  return ` [Context: ${cleaned.join(', ')}]`;
}

// ── Main builder ───────────────────────────────────────────────────────────

export interface BuiltPrompt {
  /** Full cinematic prompt for Runway */
  prompt: string;

  /** Structural breakdown for debugging */
  breakdown: {
    hook: string;
    subject: string;
    environment: string;
    cameraMotion: string;
    lighting: string;
    mood: string;
    style: string;
    ctaClose: string;
  };
}

/**
 * Builds a production-quality cinematic prompt from structured input.
 * Output is optimized for Runway Gen 4.5 vertical video.
 *
 * @example
 * const { prompt } = buildReelPrompt({
 *   title: "Spring Menu Launch",
 *   concept: "Restaurant spring menu reveal with fresh seasonal ingredients",
 *   visualStyle: "warm",
 *   cameraMotion: "dolly_in",
 *   brandTone: "premium",
 *   targetAudience: "food lovers",
 *   cta: "Reserve your table"
 * });
 */
export function buildReelPrompt(ctx: PromptBuilderContext): BuiltPrompt {
  const hook = buildOpeningHook(ctx.title, ctx.concept, ctx.title);
  const cameraMotion = resolveCameraMotion(ctx.cameraMotion);
  const visualStyle = resolveVisualStyle(ctx.visualStyle);
  const lighting = inferLighting(ctx.brandTone, ctx.visualStyle, ctx.tags);
  const mood = inferMood(ctx.brandTone, ctx.targetAudience);
  const ctaClose = buildCtaEnding(ctx.cta);
  const tagCtx = buildTagContext(ctx.tags);

  // Subject: extract the most concrete description from concept
  const subject = ctx.concept.length > 120
    ? ctx.concept.slice(0, 120).trimEnd() + '...'
    : ctx.concept;

  // Environment: infer from tags and scene metadata
  const envHints = [
    ctx.sceneMetadata?.location as string | undefined,
    ctx.sceneMetadata?.setting as string | undefined,
    ctx.sceneMetadata?.imagePrompt as string | undefined,
  ]
    .filter(Boolean)
    .join(', ');

  const environment = envHints
    ? `Set in: ${envHints}`
    : 'in a visually compelling real-world environment';

  // Compose full prompt
  const parts = [
    `Vertical 9:16 social media video optimized for Instagram Reels.`,
    `${hook}.`,
    `Subject: ${subject}.`,
    `${environment}.`,
    `Camera: ${cameraMotion}.`,
    `Lighting: ${lighting}.`,
    `Mood: ${mood}.`,
    `Style: ${visualStyle}, vertical composition, social-media-first framing.`,
    `Resolution: ultra-high definition, sharp details, professional color grade.`,
    ctaClose ? ctaClose + '.' : '',
    tagCtx,
  ]
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' ');

  return {
    prompt: parts,
    breakdown: {
      hook,
      subject,
      environment,
      cameraMotion,
      lighting,
      mood,
      style: visualStyle,
      ctaClose,
    },
  };
}

// ── AI Director Prompt ─────────────────────────────────────────────────────
// Uses GPT-4o to produce a Runway-optimized, shot-by-shot cinematic director
// prompt tailored to the specific photo, brand DNA, and content type.
// Falls back to buildReelPrompt() on any failure.

const DIRECTOR_SYSTEM_PROMPT = `You are a creative director at a luxury social media agency. You write Runway AI video generation prompts for Instagram Reels.

YOUR JOB: Turn a content brief (headline + caption + photo) into a visual description for Runway.
The video must SHOW what the caption SAYS — it should visually tell the exact same story.

RULES:
1. Identify the KEY SUBJECT from the caption (specific product, dish, drink, moment, person)
2. Describe that subject as it appears in the photo — use the photo description to ground it in reality
3. Add warm, atmospheric light (brand color grading)
4. One gentle camera motion (slow push, soft pan, or still)
5. Any organic scene motion (steam, ripple, light shift, liquid, breeze)

CAPTION → VISUAL TRANSLATION:
- "best gin tonic in Bodrum" → beautiful gin tonic glass catching golden light
- "fresh seafood tonight" → beautifully plated seafood dish in warm candlelight
- "sunset views" → atmospheric terrace with golden sky and ambient warmth
- "handcrafted cocktails" → bartender hands in motion, glass detail, garnish reveal

REFERENCE FIDELITY (mandatory):
- Animate ONLY what is visible in the reference photo. Do not invent objects, people, logos, or scenery.
- Preserve exact composition, subjects, and layout. No morphing, no scene change, no style drift.
- Motion: subtle only — shimmer, steam, ripple, soft parallax, gentle focus breathing.
- Camera: locked-off or very slow drift unless the brief explicitly requests otherwise.

STRICT RULES:
- English only — no Turkish or any non-ASCII characters
- ONE paragraph, 100–180 words maximum
- Start directly with the visual — no intro phrases like "Here is..." or "This scene..."
- No bullet points, no timestamps, no section headers, no cinematography jargon
- Keep it atmospheric and simple — Runway works better with evocative descriptions than technical specs
- NEVER mention brand names or location names (these cause generation errors)
- Describe what IS in the photo, not imagined additions`;

export interface DirectorPromptContext {
  headline: string;
  caption: string;
  contentKind: string; // 'cocktail', 'food', 'venue', 'person', 'product', 'event'
  brandName: string;
  brandLocation?: string;
  /** Photo description from gallery_analysis */
  photoDescription?: string;
  /** Photo content tags from gallery_analysis */
  photoTags?: string[];
  /** brand_vibe_profile */
  vibeProfile?: {
    grading?: { look?: string; lut_directive?: string };
    palette?: { primary?: string; accent?: string; palette_description?: string };
    motion?: { camera_movement?: string; pace?: string };
    composition?: { framing_rules?: string };
  };
  /** BrandTheme grading */
  brandThemeGrading?: { look?: string; lut_directive?: string };
  mood?: string;
  /** VPS image_edit_prompt / scene brief — visual direction for this clip */
  agentVisualDirection?: string;
}

// ── Content-kind cinematic templates ─────────────────────────────────────
// Used as GPT-4o fallback — produces director-level prompts purely from brand data.

/**
 * Runway-friendly atmospheric descriptions per content type.
 * Simple, flowing language — avoid technical camera jargon or structured labels.
 */
const ATMOSPHERE_TEMPLATES: Record<string, (
  photoDesc: string,
  tags: string[],
  brandName: string,
  location: string,
  grading: string,
  caption: string,
) => string> = {
  cocktail: (_desc, tags, _brand, _loc, grading, caption) => {
    // Extract the specific drink from caption (e.g. "gin tonic", "margarita", "mojito")
    const drinkFromCaption = caption.match(/\b(gin tonic|gin-tonic|margarita|mojito|negroni|cosmopolitan|aperol|spritz|tequila|whisky|whiskey|wine|şarap|vodka|rum|raki|beer|bira|pina colada)\b/i)?.[1];
    const drink = drinkFromCaption ?? tags.find(t => /tequila|whisky|whiskey|wine|gin|vodka|rum|raki/i.test(t)) ?? 'cocktail';
    const garnish = tags.find(t => /lime|orange|citrus|cherry|lemon|portakal/i.test(t)) ?? '';
    return `A beautiful ${drink}${garnish ? ` with ${garnish}` : ''} in a crystal glass, catching ${grading} light beautifully. Ice glistens, condensation shimmers on the glass surface. A gentle warmth fills the scene - the kind of moment that says the evening is perfect. Slow cinematic push toward the glass, liquid and light dancing together. Atmospheric, intimate, luxury coastal venue feeling.`;
  },
  food: (_desc, tags, _brand, _loc, grading, caption) => {
    // Extract specific dish from caption
    const dishFromCaption = caption.match(/\b(burger|pizza|pasta|steak|salad|tart|risotto|sushi|seafood|mezze|kebab|fish|salmon|sea bass|levrek|cipura|karides)\b/i)?.[1];
    const dish = dishFromCaption ?? tags.find(t => /burger|pizza|pasta|steak|salad|dessert|soup|fish/i.test(t)) ?? 'dish';
    return `A beautifully plated ${dish} bathed in ${grading} candlelight. Colors vivid, textures rich - the plating is a work of art. Steam rises gently, garnishes glisten. A slow cinematic reveal across the plate surface, warmth and appetite fill every frame. Premium restaurant, culinary craft at its finest.`;
  },
  venue: (_desc, _tags, _brand, _loc, grading, caption) => {
    // Look for specific venue feature in caption (terrace, pool, beach, garden, bar)
    const featureFromCaption = caption.match(/\b(terrace|terras|teras|pool|havuz|beach|plaj|garden|bahce|bahçe|bar|rooftop|sunset|sundown|golden hour)\b/i)?.[1] ?? 'terrace';
    return `A stunning ${featureFromCaption} bathed in ${grading} evening light. Warm tones wash over every surface, soft shadows create depth and intimacy. A gentle breeze moves through the atmosphere, candles flicker, the horizon glows. The scene breathes slowly - cinematic and atmospheric, inviting you to stay forever.`;
  },
  person: (_desc, tags, _brand, _loc, grading, caption) => {
    const roleFromCaption = caption.match(/\b(mixologist|bartender|chef|barista|sommelier|host|team)\b/i)?.[1];
    const role = roleFromCaption ?? tags.find(t => /mixolog|bartend|chef|stylist|barista|sommelier/i.test(t)) ?? 'artisan';
    return `A skilled ${role} at work, hands moving with quiet intention under ${grading} light. Close detail on craftsmanship - pouring, plating, preparing. Background softens into warm bokeh. An intimate portrait of mastery, unhurried and beautiful.`;
  },
  event: (_desc, _tags, _brand, _loc, grading, caption) => {
    const eventType = caption.match(/\b(concert|dj|party|festival|launch|opening|gala|night|live|performance)\b/i)?.[1] ?? 'evening';
    return `A memorable ${eventType} unfolding in ${grading} ambient light. Energy and warmth fill the atmosphere, movement and connection are everywhere. The crowd and space breathe together - alive, electric, and beautiful. Wide atmospheric shot slowly pulling back to reveal the scale of the moment.`;
  },
  product: (_desc, tags, _brand, _loc, grading, caption) => {
    const productFromCaption = caption.match(/\b(bottle|jar|package|item|collection|set|kit)\b/i)?.[1];
    const product = productFromCaption ?? tags.find(t => /bottle|package|label|jar|box/i.test(t)) ?? 'product';
    return `A premium ${product} in clean ${grading} light. Beautiful reflections play across the surface, texture and quality unmistakable. A slow, elegant reveal - rotating or pulling back to show the full product. Confident, minimal, beautifully composed.`;
  },
};

/**
 * Template-based director prompt (no API call required).
 * Produces atmospheric, Runway-compatible descriptions from brand data.
 * Used as fallback when GPT-4o is unavailable.
 *
 * IMPORTANT: Uses flowing, natural language — no structured sections, timestamps,
 * or technical camera terms that confuse Runway's model.
 */
export function buildDirectorPromptTemplate(ctx: DirectorPromptContext): string {
  const kind = ctx.contentKind in ATMOSPHERE_TEMPLATES ? ctx.contentKind : 'venue';
  const photoDesc = ctx.photoDescription ?? ctx.headline ?? '';
  const photoTags = ctx.photoTags ?? [];

  const gradingLook = ctx.brandThemeGrading?.look ?? ctx.vibeProfile?.grading?.look ?? 'warm golden';
  const location = ctx.brandLocation ?? '';
  // Use the actual caption (content brief) to extract specific product/subject from the idea
  const captionForTemplate = ctx.caption ?? ctx.headline ?? '';

  const core = ATMOSPHERE_TEMPLATES[kind]?.(photoDesc, photoTags, ctx.brandName, location, gradingLook, captionForTemplate)
    ?? `${photoDesc.slice(0, 150)} in warm cinematic light, beautiful and atmospheric.`;

  // Add gentle mood if provided
  const mood = ctx.mood ? ` ${ctx.mood}.` : '';

  // Avoid duplicate endings (some template variants already end with "Cinematic quality.")
  const ending = core.includes('Cinematic quality') || core.includes('Slow, graceful')
    ? '' : ' Slow, graceful movement. Cinematic quality.';
  const prompt = `${core}${mood}${ending}`;

  // Sanitize non-ASCII chars — Runway rejects Turkish/special chars with BAD_OUTPUT.CODE01
  const CHAR_MAP: Record<string, string> = {
    'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ü': 'u', 'Ü': 'U',
    'ş': 's', 'Ş': 'S', 'ö': 'o', 'Ö': 'O', 'ı': 'i', 'İ': 'I',
    'â': 'a', 'Â': 'A', 'î': 'i', 'Î': 'I', 'û': 'u', 'Û': 'U',
    '\u2014': ' - ', '\u2013': ' - ', '\u2018': "'", '\u2019': "'",
    '\u201C': '"', '\u201D': '"', '\u2026': '...', '\u00B7': '.',
  };
  const safe = prompt
    .replace(/[^\x00-\x7F]/g, (ch) => CHAR_MAP[ch] ?? ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const withFidelity = applyFidelityToDirectorPrompt(safe);
  return withFidelity.length > 950 ? `${withFidelity.slice(0, 947).trimEnd()}.` : withFidelity;
}

// In-process prompt cache: same photo+caption → skip redundant API call.
// Cleared on process restart (per Next.js instance). Max 100 entries (FIFO eviction).
const _promptCache = new Map<string, string>();
const _CACHE_MAX = 100;

function _makePromptCacheKey(ctx: DirectorPromptContext): string {
  // Key: content kind + headline + first 100 chars of caption + first photo tag
  return [
    ctx.contentKind,
    ctx.headline.slice(0, 60),
    ctx.caption.slice(0, 100),
    ctx.photoTags?.[0] ?? '',
    ctx.vibeProfile?.grading?.look ?? '',
  ].join('|');
}

/**
 * Calls GPT-4o-mini to generate a director-level Runway prompt.
 * Returns null on failure so callers can fall back to buildDirectorPromptTemplate().
 */
export async function buildDirectorPromptWithAI(
  ctx: DirectorPromptContext,
  openaiApiKey: string,
): Promise<string | null> {
  // Cache hit: same content brief already generated a valid prompt this session
  const cacheKey = _makePromptCacheKey(ctx);
  const cached = _promptCache.get(cacheKey);
  if (cached) {
    console.log('[director-prompt] cache hit — skipping API call');
    return cached;
  }

  try {
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: openaiApiKey });

    // Resolve color grading from multiple sources (BrandTheme > vibeProfile)
    const gradingLook =
      ctx.brandThemeGrading?.look ||
      ctx.vibeProfile?.grading?.look ||
      'warm golden hour';
    const lutDirective =
      ctx.brandThemeGrading?.lut_directive ||
      ctx.vibeProfile?.grading?.lut_directive ||
      '';
    const palette = ctx.vibeProfile?.palette;
    const paletteDesc = palette?.palette_description || '';
    const primaryColor = palette?.primary || '';
    const accentColor = palette?.accent || '';

    const cameraMove =
      ctx.vibeProfile?.motion?.camera_movement ||
      ctx.vibeProfile?.composition?.framing_rules || '';

    const userPrompt = [
      `CONTENT BRIEF`,
      `─────────────`,
      `Headline: "${ctx.headline}"`,
      `Caption (what this content says): "${ctx.caption.slice(0, 300)}"`,
      ctx.mood ? `Mood: ${ctx.mood}` : '',
      ``,
      `PHOTO (this is the first frame — describe what's actually visible):`,
      ctx.photoDescription
        ? `- Description: ${ctx.photoDescription}`
        : '- (unknown — infer from caption)',
      ctx.photoTags?.length
        ? `- Tags: ${ctx.photoTags.slice(0, 12).join(', ')}`
        : '',
      ctx.agentVisualDirection
        ? `- Agent visual direction: ${ctx.agentVisualDirection.slice(0, 280)}`
        : '',
      ``,
      `VISUAL STYLE`,
      `Brand grading: ${gradingLook}${lutDirective ? `. LUT: ${lutDirective}` : ''}`,
      paletteDesc ? `Palette: ${paletteDesc}` : '',
      primaryColor ? `Primary: ${primaryColor}` : '',
      accentColor ? `Accent: ${accentColor}` : '',
      cameraMove ? `Camera preference: ${cameraMove}` : '',
      ``,
      `TASK: Write a Runway video prompt that SHOWS the story told in the caption above.`,
      `The video must be grounded in what's actually in the photo. One flowing paragraph, max 180 words.`,
    ].filter(Boolean).join('\n');

    // gpt-4o-mini is 15x cheaper than gpt-4o for this task and produces identical quality
    // for short atmospheric descriptions (180 words max). GPT-4o adds no value here.
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 280,
      temperature: 0.65,
      messages: [
        { role: 'system', content: DIRECTOR_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    });

    const raw = res.choices[0]?.message?.content?.trim() ?? '';
    if (!raw || raw.length < 80) return null;

    // Sanitize non-ASCII chars — Runway rejects Turkish/special chars with BAD_OUTPUT.CODE01
    // (sanitization happens below; we cache the sanitized result)
    const CHAR_MAP: Record<string, string> = {
      'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ü': 'u', 'Ü': 'U',
      'ş': 's', 'Ş': 'S', 'ö': 'o', 'Ö': 'O', 'ı': 'i', 'İ': 'I',
      'â': 'a', 'Â': 'A', 'î': 'i', 'Î': 'I', 'û': 'u', 'Û': 'U',
      '\u2014': ' - ', '\u2013': ' - ', '\u2018': "'", '\u2019': "'",
      '\u201C': '"', '\u201D': '"', '\u2026': '...', '\u00B7': '.',
    };
    const prompt = raw
      .replace(/[^\x00-\x7F]/g, (ch) => CHAR_MAP[ch] ?? ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const withFidelity = applyFidelityToDirectorPrompt(prompt);
    const finalPrompt = withFidelity.length > 960 ? `${withFidelity.slice(0, 957).trimEnd()}…` : withFidelity;

    // Store in cache (FIFO eviction when full)
    if (_promptCache.size >= _CACHE_MAX) {
      const firstKey = _promptCache.keys().next().value;
      if (firstKey !== undefined) _promptCache.delete(firstKey);
    }
    _promptCache.set(cacheKey, finalPrompt);

    return finalPrompt;
  } catch (err) {
    console.warn('[director-prompt] GPT-4o-mini failed, falling back:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Infer content kind from caption + headline + tags for cinematography selection.
 */
export function inferContentKind(opts: {
  headline: string;
  caption: string;
  photoTags?: string[];
  contentType?: string;
}): string {
  const text = [opts.headline, opts.caption, ...(opts.photoTags ?? [])].join(' ').toLowerCase();
  const ct = (opts.contentType ?? '').toLowerCase();

  if (/cocktail|tequila|whisky|whiskey|wine|şarap|beer|bira|drink|içecek|kokteyl|pour|bartend|mixolog/.test(text)) return 'cocktail';
  if (/burger|pizza|pasta|steak|food|yemek|dish|plate|menu|salad|dessert|tatlı|cheese|seafood/.test(text)) return 'food';
  if (/chef|cook|team|staff|mixolog|barista|stylist|trainer|doctor|person|people|meet|portrait/.test(text)) return 'person';
  if (/event|concert|dj|music|müzik|party|festival|launch|opening|gala|show/.test(text)) return 'event';
  if (/product|bottle|package|şişe|label|brand|logo|item|collection/.test(text)) return 'product';
  if (ct.includes('story') || /sunset|terrace|terras|view|sea|deniz|venue|atmosphere|ambiance|mekan/.test(text)) return 'venue';
  return 'venue'; // default: atmospheric venue shot
}

// ── Normalize image input ──────────────────────────────────────────────────

/**
 * Normalizes various image input formats into a Runway-compatible URL or data URI.
 *
 * Runway requirements:
 * - HTTPS URLs: max 16MB, server must support HEAD, no redirects
 * - Data URIs: format "data:image/jpeg;base64,<base64>" max 5MB
 * - Base64 strings (without data URI prefix): auto-wrapped
 */
export function normalizeImageInput(
  input: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg',
): string {
  const trimmed = input.trim();

  // Already a data URI
  if (trimmed.startsWith('data:')) {
    return trimmed;
  }

  // HTTPS URL
  if (trimmed.startsWith('https://')) {
    return trimmed;
  }

  // Raw base64 — wrap as data URI
  if (/^[A-Za-z0-9+/]+=*$/.test(trimmed)) {
    return `data:${mimeType};base64,${trimmed}`;
  }

  throw new Error(
    `[RunwayPromptBuilder] Invalid image input format. ` +
    `Expected HTTPS URL, data URI, or base64 string. Got: "${trimmed.slice(0, 50)}..."`,
  );
}

// ── Ratio normalization ────────────────────────────────────────────────────

import type { ReelRatio } from '../types/reel.types';

/**
 * Converts user-friendly ratio strings to Runway API format.
 */
export function normalizeRatio(ratio?: string): ReelRatio {
  if (!ratio) return '720:1280';

  const map: Record<string, ReelRatio> = {
    '9:16': '720:1280',
    '720:1280': '720:1280',
    '832:1104': '832:1104',
    '672:1584': '672:1584',
  };

  const resolved = map[ratio];
  if (!resolved) {
    console.warn(
      `[RunwayPromptBuilder] Unknown ratio "${ratio}", falling back to 720:1280`,
    );
    return '720:1280';
  }

  return resolved;
}

// ── Duration normalization ─────────────────────────────────────────────────

import type { ReelDuration } from '../types/reel.types';

/**
 * Clamps a requested duration to the nearest valid Gen 4.5 value (5 or 10).
 */
export function normalizeDuration(requested?: number): ReelDuration {
  if (!requested) return 10;
  return requested <= 7 ? 5 : 10;
}
