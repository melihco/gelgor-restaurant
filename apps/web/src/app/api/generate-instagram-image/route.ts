import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
import { API_BASE_URL } from '@/lib/runtime-config';
import { shouldPreserveVenuePhotos } from '@/lib/venue-photo-policy';

export const runtime = 'nodejs';
export const maxDuration = 120;

type InstagramImageInput = {
  title: string;
  caption?: string;
  /** Carousel last-slide CTA (e.g. "Rezervasyon için DM") */
  cta?: string;
  concept?: string;
  campaignContext?: string;
  platform?: 'instagram';
  contentType?: 'post' | 'story' | 'carousel';
  brandName?: string;
  industry?: string;
  location?: string;
  description?: string;
  visualStyle?: string;
  brandTone?: string;
  targetAudience?: string;
  campaignGoals?: string;
  customRules?: string;
  websiteUrl?: string;
  instagramHandle?: string;
  tags?: string[];
  /** HTTPS URLs of real brand photos — enables OpenAI images.edit with high input fidelity when using gpt-image-* */
  referenceImageUrls?: string[];
  /**
   * When set, this IS the complete image generation prompt from the visual design card agent.
   * Bypasses buildPrompt() entirely — the agent already wrote the full designed card spec.
   * Used by visual_design_cards task output.
   */
  designCardPrompt?: string;
  /** Background treatment from visual design card spec */
  backgroundIntent?: string;
  /** Overlay color hex from visual design card spec */
  overlayColor?: string;
  /**
   * When true, skips full image generation and instead enhances the first referenceImageUrl.
   * Uses images.edit with input_fidelity:high and a focused retouching prompt.
   * The original photo structure is preserved — only lighting, color, and atmosphere are improved.
   */
  enhanceMode?: boolean;
  /** When true with 2+ referenceImageUrls, enhance up to 4 photos (carousel / story / reel). */
  multiPhotoEnhance?: boolean;
  /** Context hint for the enhancement (content type, mood) */
  enhanceContext?: string;
  /**
   * Asset intent of the content card — drives the enhance prompt strategy.
   * 'product_image' → product-safe enhancement (preserve product exactly).
   * Other values → venue/ambiance enhancement.
   */
  assetIntent?: string;
  /** Brand logo URL — when provided, prompt includes logo placement instruction */
  logoUrl?: string;
  /** Optional metadata per referenceImageUrl for text-based selection */
  photoMetadata?: Array<{ tags?: string; description?: string; assetType?: string }>;
  /**
   * Pinterest visual themes scraped for this tenant's sector+location.
   * Injected into the prompt so generated visuals align with trending styles on Pinterest.
   * Example: ["golden hour", "minimal", "coastal luxury", "warm tones"]
   */
  pinterestThemes?: string[];
  /**
   * Top pin titles from Pinterest (highest saves) — style reference for composition.
   * Example: ["Bodrum beach sunset aerial view", "coastal dining setup minimal"]
   */
  pinterestTopPins?: string[];
  /**
   * Product background replacement mode.
   * The product/food/item in the foreground is preserved EXACTLY.
   * ONLY the background is replaced with a brand-consistent scene
   * derived from the brand's visual DNA, location and business type.
   * Use for product photos that need a consistent brand backdrop across the feed.
   */
  productBgMode?: boolean;
  /** Brand visual DNA — injected into background generation prompt */
  visualDna?: string;
  /** Business type (e.g. "beach club", "restaurant", "hotel") */
  businessType?: string;
  /** Workspace UUID — when provided, route auto-loads brand_vibe_profile
   *  from Python backend if brandVibeProfile is not explicitly passed. */
  workspaceId?: string;
  /**
   * Event overlay mode — keeps the venue photo VISIBLE as a background
   * and composites a minimal, elegant event announcement on top.
   * Unlike enhanceMode (which only retouches), this explicitly adds:
   *   - subtle dark gradient at bottom 35%
   *   - artist/DJ name (hero text)
   *   - date, time, venue info
   *   - brand name anchor
   * Requires at least one referenceImageUrl.
   */
  eventOverlayMode?: boolean;
  /** Structured event details for the overlay announcement */
  eventDetails?: {
    artistName?: string;
    date?: string;
    time?: string;
    venueName?: string;
    venueArea?: string; // e.g. "Beach", "Roof", "Garden"
    tagline?: string;
  };
  /**
   * Brand Vibe Profile — agency-grade reference DNA extracted from external
   * accounts (e.g. @thesummerroom.co). Overrides/refines visualDna with
   * concrete palette, grading directives, composition rules, anti-patterns.
   * Stored on brand_contexts.brand_vibe_profile.
   */
  brandVibeProfile?: {
    palette?: { primary?: string; accent?: string; neutral?: string; shadow?: string; palette_description?: string };
    grading?: { look?: string; lut_directive?: string };
    composition?: { primary_pattern?: string; framing_rules?: string; subject_focus?: string };
    typography?: { text_overlay_density?: string };
    content_pillars_visual?: string[];
    anti_patterns?: string[];
    what_makes_this_agency_level?: string;
    source_accounts?: string[];
  };
};

type ImageProvider = 'flux' | 'openai' | 'original';

// Instagram/Facebook CDN URLs expire in ~24h — never send these to image APIs
const EXPIRING_CDN = ['cdninstagram.com', 'fbcdn.net', 'scontent-'];

type GeneratedImage = {
  imageUrl: string;
  provider: ImageProvider;
  model: string;
  quality: string;
};

function isDalleModel(model: string) {
  return model.startsWith('dall-e');
}

function sizeFor(contentType: string, model: string) {
  if (isDalleModel(model)) return contentType === 'story' ? '1024x1792' : '1024x1024';
  // gpt-image-2 supports higher resolutions
  if (model === 'gpt-image-2') return contentType === 'story' ? '1024x1536' : '1024x1024';
  // gpt-image-1 fallback
  return contentType === 'story' ? '1024x1536' : '1024x1024';
}

function aspectRatioFor(contentType: string) {
  return contentType === 'story' ? '9:16' : '1:1';
}

function cleanTheme(value: string) {
  return value
    .replace(/#/g, '')
    .replace(/\binstagram\b/gi, '')
    .replace(/\bpost\b|\bstory\b|\breel\b|\bfeed\b/gi, '')
    .trim();
}

function clean(value?: string) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function compactLines(lines: Array<string | undefined>) {
  return lines.filter(Boolean).join('\n');
}

function contentUrlForPersistence(imageUrl: string) {
  if (imageUrl.startsWith('data:image/') || imageUrl.length > 950) {
    return `generated://smart-agency/image/${crypto.randomUUID()}`;
  }
  return imageUrl;
}

/**
 * Upload generated image to R2 for permanent storage.
 * Returns R2 public URL or falls back to base64/original URL.
 */
async function uploadToR2IfConfigured(
  imageUrl: string,
  tenantId?: string,
): Promise<string> {
  try {
    const { isR2Configured, generateStorageKey, uploadToR2, uploadImageFromUrl } = await import('@/lib/r2-storage');
    if (!isR2Configured()) return imageUrl;

    const wsId = tenantId ?? 'shared';
    if (imageUrl.startsWith('data:')) {
      const ext = imageUrl.includes('webp') ? 'webp' : imageUrl.includes('png') ? 'png' : 'jpg';
      const key = generateStorageKey(wsId, 'image', ext);
      const result = await uploadToR2(imageUrl, key, '');
      return result.url;
    } else if (imageUrl.startsWith('http')) {
      const ext = imageUrl.split('.').pop()?.split('?')[0] ?? 'jpg';
      const key = generateStorageKey(wsId, 'image', ext);
      const result = await uploadImageFromUrl(imageUrl, key);
      return result?.url ?? imageUrl;
    }
  } catch (err) {
    console.warn('[generate-instagram-image] R2 upload failed, using original URL:', err);
  }
  return imageUrl;
}

async function materializeImageUrl(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('data:image/')) return imageUrl;

  const response = await fetch(imageUrl, { headers: FETCH_HEADERS });
  if (!response.ok) {
    throw new Error(`Generated image could not be downloaded for persistence (${response.status})`);
  }

  const contentType = response.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
  if (!contentType.startsWith('image/')) {
    throw new Error(`Generated asset is not an image (${contentType})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

/** Return the original gallery/venue photo — no generative edit. */
async function passthroughVenuePhoto(
  photoUrl: string,
  contentType: string,
  brandName?: string,
): Promise<{ imageUrl: string; persistedImageUrl: string }> {
  const r2Url = await uploadToR2IfConfigured(photoUrl, brandName);
  const persistedImageUrl =
    r2Url.startsWith('http') || r2Url.startsWith('/api/media')
      ? r2Url
      : await materializeImageUrl(photoUrl);
  return { imageUrl: persistedImageUrl, persistedImageUrl };
}

async function persistJpegBuffer(buffer: Buffer, brandName?: string): Promise<string> {
  const dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;
  const r2Url = await uploadToR2IfConfigured(dataUrl, brandName);
  return r2Url.startsWith('http') || r2Url.startsWith('/api/media') ? r2Url : dataUrl;
}

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.google.com/',
};

async function fetchUrlAsOpenAIUpload(imageUrl: string): Promise<Awaited<ReturnType<typeof toFile>> | null> {
  try {
    const res = await fetch(imageUrl, {
      signal: AbortSignal.timeout(25_000),
      headers: FETCH_HEADERS,
    });
    if (!res.ok) return null;
    const mime = res.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
    if (!mime.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 50 * 1024 * 1024) return null;
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    return toFile(buf, `ref.${ext}`, { type: mime });
  } catch {
    return null;
  }
}

/**
 * Text-only photo selection: sends filename list + content brief to GPT-4o-mini.
 * No vision needed — works even when photo URLs are unreachable.
 * Fast (~0.5s) and cheap. Falls back to first URL on failure.
 */
async function pickBestGalleryPhoto(
  urls: string[],
  contentBrief: string,
  openai: OpenAI,
  photoMetadata?: Array<{ tags?: string; description?: string; assetType?: string }>,
): Promise<string> {
  if (urls.length === 0) return '';
  if (urls.length === 1) return urls[0]!;
  try {
    const photoList = urls.slice(0, 10).map((url, i) => {
      const filename = url.split('/').pop() ?? url;
      const meta = photoMetadata?.[i];
      const metaStr = [meta?.assetType, meta?.tags, meta?.description]
        .filter(Boolean).join(', ');
      return `${i + 1}. ${filename}${metaStr ? ` [${metaStr.slice(0, 80)}]` : ''}`;
    }).join('\n');

    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 10,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: 'You select the best photo filename for a social media post. Reply with ONLY the number of the best match. Nothing else.',
        },
        {
          role: 'user',
          content: `Content brief: ${contentBrief.slice(0, 500)}\n\nPhoto options:\n${photoList}\n\nBest photo number:`,
        },
      ],
    });

    const answer = res.choices[0]?.message?.content?.trim() ?? '';
    const index = parseInt(answer.replace(/\D/g, ''), 10) - 1;
    if (index >= 0 && index < urls.length) return urls[index]!;
  } catch {
    // fall through
  }
  return urls[0]!;
}


const PRODUCT_ASSET_INTENTS = new Set([
  'product_image', 'product_photo', 'product_showcase', 'menu_item',
]);
const PRODUCT_USE_CASES = new Set([
  'product_highlight', 'menu_share', 'product_showcase',
]);

function isProductContent(assetIntent?: string, context?: string): boolean {
  if (assetIntent && PRODUCT_ASSET_INTENTS.has(assetIntent)) return true;
  if (context) {
    const low = context.toLowerCase();
    if (PRODUCT_USE_CASES.has(low)) return true;
    // Detect product keywords in the context string
    if (/product|ürün|lokum|şişe|bottle|food|yemek|menu|menü|dish|plate|paket|package|tatlı|sweet|çikolata|chocolate|peynir|cheese|zeytinyağı|olive oil/.test(low)) return true;
  }
  return false;
}

function buildEnhancePrompt(brandName?: string, context?: string, assetIntent?: string, logoUrl?: string, vibeProfile?: InstagramImageInput['brandVibeProfile']): string {
  const brand = brandName ? ` (${brandName})` : '';
  const isProduct = isProductContent(assetIntent, context);

  // Core preservation rule — applies to ALL enhancements
  const preservationCore = [
    '══ ABSOLUTE PRESERVATION RULES ══',
    'This is a RETOUCH task, NOT a generation task. You are editing an existing real photograph.',
    'Every single element in the original photo must remain in exactly the same position, same shape, same size.',
    'DO NOT: add new objects, remove existing objects, move anything, change the background, alter architectural elements, change the time of day, replace faces, change clothing, change product shape/label/packaging.',
    'DO NOT: add text, overlays, watermarks, borders, frames, social media UI, or decorative elements.',
    'The output must be unmistakably the SAME photograph — a viewer who knows the location/product must immediately recognise it.',
  ];

  const instagramFormat = [
    '══ INSTAGRAM FORMAT ══',
    'Crop or letterbox to a clean 1:1 square (or 4:5 portrait) while keeping the main subject fully visible.',
    'The result should feel native to an Instagram feed — professional, clean, scroll-stopping.',
  ];

  if (isProduct) {
    return compactLines([
      `Instagram product photo retouch${brand}.`,
      '',
      ...preservationCore,
      '',
      '══ ALLOWED RETOUCHES (subtle only) ══',
      'Exposure: lift shadows slightly, bring down blown highlights.',
      'Color: neutral white balance, slight warmth boost, gentle saturation lift (+10-15% max).',
      'Sharpness: micro-detail sharpening on the product surface only.',
      'Background: clean up small distracting elements (dust, smudge) if they don\'t belong to the product.',
      'Contrast: gentle S-curve to add depth without flattening the image.',
      '',
      ...instagramFormat,
      '',
      '══ RESULT ══',
      'Same product photo — cleaner, sharper, more vibrant. Looks like a professional studio retouch, not a new image.',
      logoUrl ? `Add brand logo at top-left corner, max 10% image width, exact copy of: ${logoUrl}` : '',
    ].filter(Boolean));
  }

  // Build vibe-specific grading directives when available
  const vibeSection = vibeProfile ? [
    '══ VIBE DNA — AGENCY REFERENCE AESTHETIC ══',
    vibeProfile.source_accounts?.length
      ? `Target aesthetic: quality/mood of ${vibeProfile.source_accounts.map(a => '@' + a).join(', ')} — not a copy, but matching caliber.`
      : undefined,
    vibeProfile.grading?.look
      ? `Color grading look: "${vibeProfile.grading.look}". ${vibeProfile.grading.lut_directive ?? ''}`
      : undefined,
    vibeProfile.palette?.primary
      ? `Target palette: dominant ${vibeProfile.palette.primary}, accent ${vibeProfile.palette.accent ?? ''}, neutral ${vibeProfile.palette.neutral ?? ''}. ${vibeProfile.palette.palette_description ?? ''}`
      : undefined,
    vibeProfile.composition?.framing_rules
      ? `Composition: ${vibeProfile.composition.framing_rules}`
      : undefined,
    vibeProfile.anti_patterns?.length
      ? `AVOID: ${vibeProfile.anti_patterns.join(', ')}`
      : undefined,
    vibeProfile.what_makes_this_agency_level
      ? `Agency quality target: ${vibeProfile.what_makes_this_agency_level}`
      : undefined,
  ].filter((l): l is string => Boolean(l)) : [];

  return compactLines([
    `Instagram venue photo — agency-grade retouch${brand}.`,
    '',
    ...preservationCore,
    '',
    '══ ALLOWED RETOUCHES ══',
    'Exposure: lift dark shadows, recover blown sky/highlights.',
    'Color grade: apply the vibe DNA directives below — warm golden tones, specific palette, agency-caliber LUT.',
    'Vibrancy: targeted saturation on colors matching the palette (sky, water, food/drink). Do not oversaturate skin tones.',
    'Clarity: mid-tone contrast to make textures pop (stone, wood, fabric, water).',
    'Noise: reduce ISO noise in dark areas while preserving texture.',
    'Horizon: straighten if slightly tilted.',
    '',
    ...(vibeSection.length ? ['', ...vibeSection, ''] : []),
    ...instagramFormat,
    '',
    '══ RESULT ══',
    'Same venue photo, same moment — retouched to agency-level quality matching the reference aesthetic. The location must be 100% identifiable.',
    logoUrl ? `Add brand logo at top-left corner, max 10% image width, exact copy of: ${logoUrl}` : '',
  ].filter(Boolean));
}

function buildProductBackgroundPrompt(params: {
  brandName?: string;
  businessType?: string;
  location?: string;
  visualDna?: string;
  brandTone?: string;
  logoUrl?: string;
}): string {
  const { brandName, businessType, location, visualDna, brandTone, logoUrl } = params;

  const brandDesc = [brandName, businessType, location].filter(Boolean).join(' · ');
  const dna = visualDna || 'warm, natural light, premium quality';
  const tone = brandTone || 'elegant and inviting';

  // Derive a fitting background scene from brand context
  const bgScene = compactLines([
    businessType?.toLowerCase().includes('beach') || businessType?.toLowerCase().includes('club')
      ? 'sun-drenched terrace with turquoise sea view in the background, soft bokeh, golden hour light'
      : businessType?.toLowerCase().includes('restaurant') || businessType?.toLowerCase().includes('cafe')
        ? 'warm restaurant interior with soft ambient lighting, natural wood surfaces, shallow depth of field'
        : businessType?.toLowerCase().includes('hotel') || businessType?.toLowerCase().includes('resort')
          ? 'luxury hotel poolside or lobby setting, marble surfaces, natural light, editorial feel'
          : 'premium brand environment with natural textures, soft directional light, editorial quality',
    location ? `The setting evokes ${location} — local materials, local light quality, authentic sense of place.` : '',
    `Visual DNA: ${dna}.`,
    `Brand tone: ${tone}.`,
  ].filter(Boolean));

  return compactLines([
    `Instagram product photo — brand background replacement for ${brandDesc || 'premium brand'}.`,
    '',
    '══ PRODUCT PRESERVATION (NON-NEGOTIABLE) ══',
    'The foreground product/food/drink/item is SACRED. Do not alter it in ANY way.',
    'Product position, shape, size, label, packaging, color, texture, plating — all must remain pixel-perfect.',
    'The product must look as if it was lifted out of the original photo and placed into the new scene.',
    'No reflections, shadows or lighting on the product should change.',
    '',
    '══ BACKGROUND REPLACEMENT ══',
    'Replace the entire background (everything except the main foreground product) with:',
    bgScene,
    'The new background must feel like the product naturally belongs there.',
    'Use shallow depth of field — background is softly blurred (f/2.8 equivalent) so the product stays the clear hero.',
    'Lighting on background must be consistent with the product\'s existing lighting direction.',
    'No other props, people, or objects should be added.',
    '',
    '══ INSTAGRAM FEED CONSISTENCY ══',
    'This image will appear on an Instagram grid alongside other products from the same brand.',
    'The background style, color temperature and mood must be consistent with the brand identity.',
    'Square 1:1 or 4:5 portrait crop. Product centred or rule-of-thirds positioned.',
    '',
    '══ RESULT ══',
    'A professional product photograph where the product is unchanged but the background transports it into the brand\'s world.',
    logoUrl ? `Place brand logo subtly in corner: ${logoUrl} — max 8% of image width, no distortion.` : '',
  ].filter(Boolean));
}

function buildReferenceEditDirective(basePrompt: string, isDesignCard = false): string {
  if (isDesignCard) {
    return compactLines([
      'You are given a REAL PHOTOGRAPH of the actual business venue.',
      'Your task: use this photograph as the visual foundation and produce the DESIGNED SOCIAL MEDIA CARD described below.',
      'The real photo should appear prominently — as a full-bleed background, left panel, or blurred backdrop depending on the design spec.',
      'Apply the text overlays, color blocks, typography, and CTA exactly as described.',
      'The final output is a complete designed social media graphic, not just a photo.',
      'Maintain the authentic feel of the venue photograph — do not make it look stock or artificial.',
      '',
      basePrompt,
    ]);
  }

  return compactLines([
    'You are given a REAL PHOTOGRAPH from the actual business venue.',
    'Your task: produce ONE new editorial photograph that is visually consistent with this venue.',
    'CRITICAL: Match the real location exactly — same architectural style, materials, color palette, lighting mood, and spatial scale as shown in the reference photo.',
    'This must look like it was taken at the same venue on the same day by a professional photographer.',
    'Do not copy faces or identifiable people. If people appear, show them naturally and anonymously.',
    'Do not add text, UI, watermarks, logos, or graphical overlays.',
    'Camera: 35mm editorial, natural depth of field, authentic atmosphere.',
    '',
    basePrompt,
  ]);
}

async function maybeExpandImageScenePrompt(basePrompt: string): Promise<string> {
  if (process.env.SMART_AGENCY_IMAGE_EXPAND_SCENE !== 'true') return basePrompt;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return basePrompt;
  try {
    const openai = new OpenAI({ apiKey });
    const chat = await openai.chat.completions.create({
      model: process.env.SMART_AGENCY_IMAGE_EXPAND_MODEL ?? 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a senior commercial photographer. Reply with ONE concise paragraph (max 6 sentences) describing ONLY the photographic scene: subject, environment, time of day, lens feel, lighting. No markdown. Do not mention AI.',
        },
        {
          role: 'user',
          content: `Turn this creative brief into a single photographic scene paragraph:\n\n${basePrompt.slice(0, 9000)}`,
        },
      ],
      max_tokens: 400,
      temperature: 0.65,
    });
    const para = chat.choices[0]?.message?.content?.trim();
    if (!para || para.length < 40) return basePrompt;
    return `${basePrompt}\n\n## Director scene lock (expanded)\n${para}\n`;
  } catch {
    return basePrompt;
  }
}

function buildPrompt(input: InstagramImageInput) {
  const contentType = input.contentType ?? 'post';
  const isStory = contentType === 'story';
  const format = isStory
    ? 'Vertical 9:16 raw photograph. Keep important subjects inside a safe center area, but do not create any social media interface or designed story layout.'
    : 'Square 1:1 raw photograph. Strong editorial composition, balanced subject placement and premium crop, but no designed feed layout.';

  const brandSection = compactLines([
    clean(input.brandName) ? `Brand: ${clean(input.brandName)}` : undefined,
    clean(input.instagramHandle) ? `Instagram: ${clean(input.instagramHandle)}` : undefined,
    clean(input.industry) ? `Industry: ${clean(input.industry)}` : undefined,
    clean(input.location) ? `Location/local context: ${clean(input.location)}` : undefined,
    clean(input.description) ? `Business description: ${clean(input.description)}` : undefined,
    clean(input.brandTone) ? `Brand tone: ${clean(input.brandTone)}` : undefined,
    clean(input.targetAudience) ? `Target audience: ${clean(input.targetAudience)}` : undefined,
    clean(input.campaignGoals) ? `Campaign goals: ${clean(input.campaignGoals)}` : undefined,
    clean(input.customRules) ? `Non-negotiable brand rules: ${clean(input.customRules)}` : undefined,
    clean(input.websiteUrl) ? `Website reference for brand context only: ${clean(input.websiteUrl)}` : undefined,
  ]);

  const creativeSection = compactLines([
    `Scene brief: ${clean(input.concept) ?? clean(input.title)}`,
    clean(input.campaignContext) ? `Full content plan context for consistency. Generate only the selected visual, but use this plan to understand the series:\n${clean(input.campaignContext)}` : undefined,
    clean(input.title) ? `Asset title: ${clean(input.title)}` : undefined,
    clean(input.caption) ? `Narrative meaning to imply visually, never as written text: ${clean(input.caption)}` : undefined,
    input.tags?.length ? `Scene cues, not text to render: ${input.tags.map(cleanTheme).filter(Boolean).join(', ')}` : undefined,
  ]);

  const photographyDirection = compactLines([
    'RAW CAMERA PHOTO ONLY. Create a realistic commercial lifestyle photograph, not a graphic design asset.',
    'It should look like it was shot by a professional human photographer for a premium brand campaign.',
    'Use documentary/editorial realism: imperfect but attractive real people, believable expressions, real venue lighting, natural skin texture, realistic fabric and object details.',
    'Use believable real-world location details, authentic atmosphere, natural shadows, natural reflections, realistic material textures and premium editorial color grading.',
    'Use a clear hero subject, strong foreground/midground/background depth, and a composition that still works when cropped later by the product UI.',
    clean(input.visualStyle) ? `Brand visual style and creative direction: ${clean(input.visualStyle)}` : 'Brand visual style: premium, modern, editorial, realistic, emotionally warm.',
    format,
  ]);

  const negativeConstraints = compactLines([
    'ABSOLUTELY FORBIDDEN: fake Instagram screenshot, phone screen, social media UI, like/comment/share icons, profile header, caption block, hashtag text, post frame, story frame, browser window, app interface.',
    'Avoid: AI poster look, over-designed graphic, illustration, 3D render, cartoon, collage, flyer, menu board, stock-photo cliche, theatrical staged composition.',
    'Do not put typography, captions, logos, watermarks, QR codes, UI elements, banners, labels, subtitles or unreadable text inside the image.',
    'Avoid distorted hands, faces, teeth, eyes, food, tableware, cutlery, menus, reflections, shadows and impossible geometry.',
    'No random brand names, no fake event sponsors, no text artifacts.',
  ]);

  const logoSection = clean(input.logoUrl)
    ? compactLines([
        'BRAND LOGO',
        `The brand has an official logo. Place it as a small, clean overlay in the corner of the image.`,
        `Logo reference URL: ${input.logoUrl}`,
        'Position: top-left corner (or top-right if the composition demands it). Scale: no larger than 15% of image width.',
        'Style: full opacity if the background is dark/coloured; slightly transparent (80%) if placed over a light area.',
        'Do NOT distort, recolour, or reimagine the logo — render it as-is, faithful to the original.',
      ])
    : undefined;

  // Pinterest visual intelligence — inject trending aesthetics into the prompt
  const validThemes = (input.pinterestThemes ?? []).filter(Boolean).slice(0, 6);
  const validPins = (input.pinterestTopPins ?? []).filter(Boolean).slice(0, 4);
  const pinterestSection = (validThemes.length > 0 || validPins.length > 0)
    ? compactLines([
        'PINTEREST TREND INTELLIGENCE (sector-specific, real data)',
        'The following visual themes are currently trending on Pinterest for this brand\'s sector and location.',
        'Incorporate these aesthetics naturally into the photograph — do NOT illustrate them literally.',
        validThemes.length > 0 ? `Trending visual themes: ${validThemes.join(', ')}` : undefined,
        validPins.length > 0 ? `Top pinned content styles (high-save compositions to reference): ${validPins.join(' | ')}` : undefined,
        'Use these as creative direction: color palette, mood, lighting quality, subject framing.',
      ])
    : undefined;

  // Brand Vibe Profile — agency-grade reference DNA (highest-priority creative direction).
  // Extracted from external reference accounts; overrides generic brand defaults.
  const vibe = input.brandVibeProfile;
  const vibeSection = vibe && Object.keys(vibe).length > 0
    ? compactLines([
        'BRAND VIBE PROFILE (reference DNA — agency-grade target aesthetic)',
        vibe.source_accounts?.length
          ? `Reference accounts to emulate the QUALITY/MOOD of (not literal copies): ${vibe.source_accounts.map((s) => '@' + s).join(', ')}.`
          : 'Reference DNA extracted from peer agency-quality accounts.',
        vibe.what_makes_this_agency_level
          ? `Why these accounts feel agency-level: ${vibe.what_makes_this_agency_level}`
          : undefined,
        vibe.palette
          ? `PALETTE — primary ${vibe.palette.primary ?? '?'}, accent ${vibe.palette.accent ?? '?'}, neutral ${vibe.palette.neutral ?? '?'}, shadow ${vibe.palette.shadow ?? '?'}. ${vibe.palette.palette_description ?? ''}`.trim()
          : undefined,
        vibe.grading?.look || vibe.grading?.lut_directive
          ? `COLOR GRADING — look "${vibe.grading?.look ?? 'editorial'}". ${vibe.grading?.lut_directive ?? ''}`.trim()
          : undefined,
        vibe.composition?.primary_pattern || vibe.composition?.framing_rules
          ? `COMPOSITION — ${vibe.composition?.primary_pattern ?? ''}. ${vibe.composition?.framing_rules ?? ''} ${vibe.composition?.subject_focus ? `Subject focus: ${vibe.composition.subject_focus}` : ''}`.trim()
          : undefined,
        vibe.typography?.text_overlay_density
          ? `TYPOGRAPHY DENSITY — ${vibe.typography.text_overlay_density} (target ZERO visible text in this image regardless).`
          : undefined,
        vibe.content_pillars_visual?.length
          ? `RECURRING VISUAL THEMES (use as creative direction, not literal): ${vibe.content_pillars_visual.slice(0, 6).join(' · ')}`
          : undefined,
        vibe.anti_patterns?.length
          ? `STRICT ANTI-PATTERNS (this account/brand would NEVER post these — avoid at all costs): ${vibe.anti_patterns.slice(0, 6).join(' · ')}`
          : undefined,
        'Translate the vibe into THIS scene: same grading, same composition rules, same palette discipline. Do not literally reproduce the reference subjects.',
      ])
    : undefined;

  return compactLines([
    'You are a senior commercial art director and production photographer. Generate a single raw camera photograph that will later be placed into a social media card by the app.',
    'The image itself must contain only the photographic scene. No text. No layout. No UI. No mockup.',
    '',
    'BRAND INTELLIGENCE',
    brandSection || 'Use a premium, trustworthy local business brand identity.',
    '',
    'CONTENT BRIEF',
    creativeSection,
    '',
    'PHOTOGRAPHIC DIRECTION',
    photographyDirection,
    '',
    ...(vibeSection ? [vibeSection, ''] : []),
    ...(pinterestSection ? [pinterestSection, ''] : []),
    ...(logoSection ? [logoSection, ''] : []),
    'QUALITY BAR',
    'The output must feel expensive, realistic, brand-consistent and usable in a real campaign without looking AI-generated.',
    '',
    'STRICT NEGATIVE CONSTRAINTS',
    negativeConstraints,
  ]);
}

async function generateWithFlux(prompt: string, contentType: string) {
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) {
    throw new Error('fal.ai image generation is not configured. Set FAL_API_KEY.');
  }

  const model = process.env.FAL_IMAGE_MODEL ?? 'fal-ai/flux-pro/v1.1-ultra';
  const response = await fetch(`https://fal.run/${model}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      aspect_ratio: aspectRatioFor(contentType),
      raw: true,
      output_format: 'jpeg',
      prompt_upsampling: true,
      safety_tolerance: 2,
      num_images: 1,
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`fal.ai image generation failed (${response.status}): ${JSON.stringify(body).slice(0, 400)}`);
  }

  const imageUrl =
    body?.images?.[0]?.url ??
    body?.image?.url ??
    body?.url ??
    (Array.isArray(body?.output) ? body.output[0] : undefined);

  if (!imageUrl || typeof imageUrl !== 'string') {
    throw new Error('fal.ai image generation returned no image URL');
  }

  return {
    imageUrl,
    provider: 'flux' as const,
    model,
    quality: 'ultra-raw',
  } satisfies GeneratedImage;
}

async function enhanceWithOpenAI(
  referenceImageUrl: string,
  contentType: string,
  enhancePrompt: string,
): Promise<GeneratedImage> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI API key not configured.');

  const model = process.env.SMART_AGENCY_IMAGE_MODEL ?? process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2';
  // Default: high — full quality production
  const quality = process.env.SMART_AGENCY_IMAGE_QUALITY ?? 'high';
  const openai = new OpenAI({ apiKey });

  const file = await fetchUrlAsOpenAIUpload(referenceImageUrl);
  if (!file) throw new Error(`Mekan fotoğrafı indirilemedi (${new URL(referenceImageUrl).hostname}). Fotoğrafı Brand Hub → Assets bölümünden yükleyin.`);

  const size = sizeFor(contentType, model) as '1024x1024' | '1024x1536' | '1536x1024' | 'auto';

  // Enhance only — uses the configured model, never falls back to pure generation.
  const editModel = process.env.SMART_AGENCY_IMAGE_MODEL ?? 'gpt-image-2';
  const editedRaw = await openai.images.edit({
    model: editModel,
    image: file,
    prompt: enhancePrompt.slice(0, 4000),
    n: 1,
    size: sizeFor(contentType, editModel) as '1024x1024' | '1024x1536' | '1536x1024',
    quality,
  } as Parameters<typeof openai.images.edit>[0]);
  const edited = editedRaw as { data?: Array<{ url?: string; b64_json?: string }> };
  const ed = edited.data?.[0];
  const imageUrl = ed?.url ?? (ed?.b64_json ? `data:image/png;base64,${ed.b64_json}` : undefined);
  if (!imageUrl) throw new Error('Görsel iyileştirme sonuç döndürmedi. Lütfen tekrar deneyin.');
  return { imageUrl, provider: 'openai', model: editModel, quality };
}

async function generateWithOpenAI(
  prompt: string,
  contentType: string,
  referenceImageUrls?: string[],
  isDesignCard = false,
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI image generation is not configured. Set OPENAI_API_KEY.');
  }

  const model = process.env.SMART_AGENCY_IMAGE_MODEL ?? process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2';
  // Default: high — full quality production
  const quality = process.env.SMART_AGENCY_IMAGE_QUALITY ?? 'high';
  const openai = new OpenAI({ apiKey });

  const validUrls = (referenceImageUrls ?? [])
    .map((u) => String(u).trim())
    .filter((u) => u.startsWith('http') && !EXPIRING_CDN.some(h => u.toLowerCase().includes(h)));

  // When gallery photos are provided, attempt images.edit for venue-consistent output.
  // If edit fails (e.g. model doesn't support it), fall through to generate with prompt context.
  const refUrl = validUrls.length > 1
    ? await pickBestGalleryPhoto(validUrls, prompt.slice(0, 600), openai)
    : validUrls[0];

  // Venue/gallery photos: never run through images.edit — use the original file.
  if (refUrl && shouldPreserveVenuePhotos()) {
    return {
      imageUrl: refUrl,
      provider: 'original',
      model: 'passthrough',
      quality: 'original',
    } satisfies GeneratedImage;
  }

  if (refUrl && !isDalleModel(model)) {
    const file = await fetchUrlAsOpenAIUpload(refUrl);
    if (file) {
      try {
        const editModel = model;
        // Design card prompts are detailed (fonts, positions, colors) — never truncate below 4000.
        // gpt-image-2 supports up to 32 000 chars; gpt-image-1 was safe to 4000.
        const promptLimit = isDesignCard ? 4000 : 1500;
        const editPrompt = buildReferenceEditDirective(prompt, isDesignCard).slice(0, promptLimit);
        const editedRaw2 = await openai.images.edit({
          model: editModel,
          image: file,
          prompt: editPrompt,
          n: 1,
          size: sizeFor(contentType, editModel) as '1024x1024' | '1024x1536' | '1536x1024',
          quality,
        } as Parameters<typeof openai.images.edit>[0]);
        const editedR = editedRaw2 as { data?: Array<{ url?: string; b64_json?: string }> };
        const ed = editedR.data?.[0];
        const imageUrl = ed?.url ?? (ed?.b64_json ? `data:image/png;base64,${ed.b64_json}` : undefined);
        if (imageUrl) {
          return { imageUrl, provider: 'openai' as const, model: editModel, quality } satisfies GeneratedImage;
        }
      } catch (err) {
        console.warn('[generate-instagram-image] images.edit failed, falling back to generate:', err);
      }
    }
  }
  const image = await openai.images.generate(
    isDalleModel(model)
      ? ({
          model,
          prompt,
          n: 1,
          size: sizeFor(contentType, model),
          quality: quality === 'high' ? 'hd' : 'standard',
          response_format: 'url',
        } as any)
      : ({
          model,
          prompt,
          n: 1,
          size: sizeFor(contentType, model),
          quality,
          output_format: 'webp',
        } as any),
  );

  const data = image.data?.[0];
  const imageUrl = data?.url ?? (data?.b64_json ? `data:image/webp;base64,${data.b64_json}` : undefined);
  if (!imageUrl) {
    throw new Error('OpenAI image generation returned no image URL');
  }

  return {
    imageUrl,
    provider: 'openai' as const,
    model,
    quality,
  } satisfies GeneratedImage;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let input: InstagramImageInput;
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }

  if (!input?.title || typeof input.title !== 'string') {
    return NextResponse.json({ error: 'Field "title" is required' }, { status: 400 });
  }

  // Auto-load brand vibe profile when workspaceId is provided (server-side).
  // Caller may also pass brandVibeProfile inline to skip the DB roundtrip.
  if (!input.brandVibeProfile && input.workspaceId) {
    try {
      const CREW = (process.env.CREW_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');
      const KEY = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';
      const r = await fetch(`${CREW}/api/v1/brand-context/${input.workspaceId}/vibe`, {
        headers: { 'X-Internal-Api-Key': KEY, 'X-Tenant-Id': input.workspaceId },
        signal: AbortSignal.timeout(5_000),
      });
      if (r.ok) {
        const j = await r.json() as { vibe?: InstagramImageInput['brandVibeProfile'] };
        if (j.vibe && Object.keys(j.vibe).length > 0) {
          input.brandVibeProfile = j.vibe;
          console.log('[generate-instagram-image] vibe auto-loaded', { workspaceId: input.workspaceId, source: j.vibe.source_accounts });
        }
      }
    } catch (err) {
      console.warn('[generate-instagram-image] vibe auto-load failed (continuing without)', err);
    }
  }

  const contentType = input.contentType ?? 'post';
  const referenceImageUrls = Array.isArray(input.referenceImageUrls)
    ? input.referenceImageUrls.filter((u): u is string => typeof u === 'string' && u.startsWith('http'))
    : undefined;

  // ── Product background replacement mode ─────────────────────────────────
  if (input.productBgMode) {
    const validUrls = (referenceImageUrls ?? []).filter(u => {
      if (!u.startsWith('http')) return false;
      // Skip expired Instagram CDN URLs — they return 403
      if (EXPIRING_CDN.some(h => u.toLowerCase().includes(h))) return false;
      return true;
    });
    if (!validUrls.length) {
      return NextResponse.json({
        error: 'Kullanılabilir fotoğraf bulunamadı. Instagram CDN URL\'leri süresi dolmuş olabilir. Brand Hub\'dan fotoğrafları yeniden yükleyin.',
      }, { status: 400 });
    }
    const bgPrompt = buildProductBackgroundPrompt({
      brandName:    input.brandName,
      businessType: input.businessType,
      location:     input.location,
      visualDna:    input.visualDna,
      brandTone:    input.brandTone,
      logoUrl:      input.logoUrl,
    });
    try {
      const generated = await enhanceWithOpenAI(validUrls[0]!, contentType, bgPrompt);
      const r2Url = await uploadToR2IfConfigured(generated.imageUrl, input.brandName);
      const persistedUrl = r2Url.startsWith('http') || r2Url.startsWith('/api/media') ? r2Url : await materializeImageUrl(generated.imageUrl);
      persistCreativeArtifact({
        title: `${input.title} — Brand Background`,
        imageUrl: persistedUrl,
        contentUrl: persistedUrl,
        prompt: bgPrompt,
        contentType,
        brandName: input.brandName,
        provider: generated.provider,
        model: generated.model,
        quality: generated.quality,
      }).catch((err) => console.warn('[generate-instagram-image] productBg artifact persist failed:', err));
      return NextResponse.json({ success: true, imageUrl: persistedUrl, provider: generated.provider, model: generated.model });
    } catch (err) {
      console.error('[generate-instagram-image] productBgMode failed:', err);
      return NextResponse.json({ error: 'Image generation failed', detail: String(err) }, { status: 500 });
    }
  }

  // ── Enhance mode: retouch the tenant's existing venue photo ─────────────
  // Does NOT generate a new image — takes the first referenceImageUrl and
  // applies professional photo retouching (lighting, color grade, atmosphere).
  // ── Event overlay mode ────────────────────────────────────────────────────
  // Takes a real venue photo + event details → GPT-image-1 composites a
  // minimal, agency-grade event announcement overlay on top.
  // The photo background stays >60% visible — only bottom gradient + text.
  if (input.eventOverlayMode) {
    const validOverlayUrls = (referenceImageUrls ?? []).filter(u => u.startsWith('http'));
    if (!validOverlayUrls.length) {
      return NextResponse.json({ error: 'eventOverlayMode requires at least one referenceImageUrl' }, { status: 400 });
    }

    // Preserve venue pixels: Sharp + SVG overlay only (no GPT repaint).
    if (shouldPreserveVenuePhotos()) {
      try {
        const baseUrl = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';
        const ev = input.eventDetails ?? {};
        const vibe = input.brandVibeProfile ?? {};
        const res = await fetch(`${baseUrl}/api/generate-event-card`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            photoUrl: validOverlayUrls[0],
            contentType,
            brandName: input.brandName,
            location: input.location,
            workspaceId: input.workspaceId,
            enhancePhoto: false,
            artistName: ev.artistName,
            eventName: input.title,
            date: ev.date,
            time: ev.time,
            venueArea: ev.venueArea,
            tagline: ev.tagline ?? ev.venueName,
            vibeProfile: vibe.palette || vibe.typography || vibe.grading
              ? { palette: vibe.palette, typography: vibe.typography, grading: vibe.grading }
              : undefined,
          }),
          signal: AbortSignal.timeout(120_000),
        });
        if (!res.ok) {
          const err = await res.text().catch(() => '');
          throw new Error(err.slice(0, 200) || `Event card failed (${res.status})`);
        }
        const data = await res.json();
        const imageUrl = data.imageUrl as string | undefined;
        if (!imageUrl) throw new Error('Event card returned no image');
        return NextResponse.json({
          success: true,
          imageUrl,
          contentType,
          provider: 'sharp-svg',
          model: 'event-overlay',
          quality: 'original-photo',
          eventOverlay: true,
          venue_preserved: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Event overlay failed';
        console.error('[generate-instagram-image] Sharp event overlay error:', error);
        return NextResponse.json({ error: 'Event overlay failed', detail: message }, { status: 500 });
      }
    }

    const vibe = input.brandVibeProfile ?? {};
    const palette = (vibe.palette as Record<string, string> | undefined) ?? {};
    const typography = (vibe.typography as Record<string, string> | undefined) ?? {};
    const ev = input.eventDetails ?? {};
    const accent = palette.accent ?? '#E8C87A';
    const textColor = palette.neutral ?? '#F5F0E8';
    const headlineFont = typography.headline_font ?? typography.heading_personality ?? typography.headline_style ?? 'elegant serif';
    const antiPatterns: string[] = Array.isArray(vibe.anti_patterns) ? vibe.anti_patterns : [];
    const sourceAccounts: string[] = Array.isArray(vibe.source_accounts) ? vibe.source_accounts : [];

    const overlayPrompt = [
      `Instagram event announcement — ${input.brandName ?? 'Brand'}${input.location ? ' · ' + input.location : ''}.`,
      ``,
      `══ PRESERVATION (NON-NEGOTIABLE) ══`,
      `This is a real venue photograph. You MUST keep it as the dominant background.`,
      `The photo MUST be recognisable and visible for AT LEAST the top 60% of the image.`,
      `Do NOT change the sky, sea, architecture, or people in the photo.`,
      ``,
      `══ OVERLAY TREATMENT ══`,
      `Add a smooth dark gradient ONLY at the bottom 35-40% of the image (transparent at top, dark at bottom).`,
      `Gradient color: very dark navy/black with low opacity so the photo still breathes through.`,
      `All text lives within this lower gradient zone.`,
      ``,
      `══ EVENT TEXT TO ADD ══`,
      ev.artistName ? `HERO TEXT (largest element): "${ev.artistName}"` : `HERO TEXT: "${input.title ?? ''}"`,
      ev.date || ev.time ? `Detail line below: ${[ev.date, ev.time].filter(Boolean).join(' · ')}` : '',
      ev.venueArea ? `Venue area badge (small, above hero text): "${ev.venueArea}"` : '',
      `Brand anchor (bottom center, smallest): "${ev.venueName ?? input.brandName ?? 'YULA BODRUM'}"`,
      ev.tagline ? `Optional tagline (italic, small): "${ev.tagline}"` : '',
      ``,
      `══ TYPOGRAPHY STYLE ══`,
      `Hero font: ${headlineFont}, uppercase or mixed case, elegant and legible.`,
      `Color: ${textColor} (cream/off-white) for main text; ${accent} for accent elements or underlines.`,
      `Letter spacing: wide — beach club luxury feel.`,
      `NO drop shadows, NO glows, NO neon — clean and minimal.`,
      sourceAccounts.length ? `Reference quality: ${sourceAccounts.map(a => '@' + a).join(', ')} style event posters.` : '',
      ``,
      `══ FORMAT ══`,
      `4:5 portrait (1080×1350) for feed, or 9:16 (1080×1920) for story.`,
      `Result: a scroll-stopping event announcement where the beautiful ${input.location ?? 'venue'} atmosphere is the hero, text is the accent.`,
      antiPatterns.length ? `AVOID: ${antiPatterns.join(', ')}.` : '',
    ].filter(Boolean).join('\n');

    try {
      const openaiForOverlay = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
      const photoUrl = validOverlayUrls[0]!;

      // Fetch and convert the photo to buffer for GPT-image-1
      const imgRes = await fetch(photoUrl, {
        signal: AbortSignal.timeout(20_000),
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*' },
      });
      if (!imgRes.ok) throw new Error(`Photo fetch failed: ${imgRes.status}`);
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
      const contentTypeMime = (imgRes.headers.get('content-type') ?? 'image/jpeg').split(';')[0]!.trim();

      // Convert to JPEG via sharp for consistent input
      const { default: sharp } = await import('sharp');
      const jpegBuffer = await sharp(imgBuffer).jpeg({ quality: 90 }).toBuffer();
      const file = await toFile(jpegBuffer, 'venue.jpg', { type: 'image/jpeg' });

      const editResponse = await openaiForOverlay.images.edit({
        model: 'gpt-image-1',
        image: file,
        prompt: overlayPrompt,
        size: contentType === 'story' ? '1024x1792' : '1024x1024',
        quality: 'high',
      } as Parameters<typeof openaiForOverlay.images.edit>[0]);

      const b64 = editResponse.data?.[0]?.b64_json;
      if (!b64) throw new Error('No image data returned from GPT-image-1');

      const outBuffer = Buffer.from(b64, 'base64');
      const { isR2Configured, generateStorageKey, uploadToR2, getPresignedUrl: getPresigned } = await import('@/lib/r2-storage');
      let persistedUrl: string;
      if (isR2Configured()) {
        const key = generateStorageKey(input.brandName ?? 'brand', 'event', 'png');
        const r2 = await uploadToR2(outBuffer, key, 'image/png');
        try { persistedUrl = await getPresigned(r2.key, 24 * 3600); } catch { persistedUrl = r2.url; }
      } else {
        persistedUrl = `data:image/png;base64,${b64.slice(0, 80)}…`;
      }

      return NextResponse.json({
        success: true,
        imageUrl: persistedUrl,
        prompt: overlayPrompt,
        contentType,
        provider: 'openai',
        model: 'gpt-image-1',
        quality: 'high',
        eventOverlay: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Event overlay failed';
      console.error('[generate-instagram-image] Event overlay error:', error);
      return NextResponse.json({ error: 'Event overlay failed', detail: message }, { status: 500 });
    }
  }

  if (input.enhanceMode) {
    const validEnhanceUrls = (referenceImageUrls ?? []).filter(u => u.startsWith('http'));
    if (!validEnhanceUrls.length) {
      return NextResponse.json({ error: 'enhanceMode requires at least one referenceImageUrl' }, { status: 400 });
    }

    const isProduct = isProductContent(input.assetIntent, input.enhanceContext);
    const openaiForSelect = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const contentBrief = [input.enhanceContext, input.title, input.caption].filter(Boolean).join('. ');
    const useMultiEnhance = validEnhanceUrls.length >= 2
      && (contentType === 'carousel' || Boolean(input.multiPhotoEnhance));

    const selectUrlsForEnhance = async (): Promise<string[]> => {
      if (!useMultiEnhance) {
        const one = validEnhanceUrls.length > 1
          ? await pickBestGalleryPhoto(validEnhanceUrls, contentBrief, openaiForSelect, input.photoMetadata)
          : validEnhanceUrls[0]!;
        return [one];
      }
      const seen = new Set<string>();
      const out: string[] = [];
      for (const u of validEnhanceUrls) {
        if (seen.has(u)) continue;
        seen.add(u);
        out.push(u);
        if (out.length >= 4) break;
      }
      return out;
    };

    if (isProduct || shouldPreserveVenuePhotos()) {
      const urls = await selectUrlsForEnhance();
      let imageUrls = await Promise.all(
        urls.map(async (photoUrl) => {
          const { persistedImageUrl } = await passthroughVenuePhoto(photoUrl, contentType, input.brandName);
          return persistedImageUrl;
        }),
      );

      let carouselOverlays = false;
      if (contentType === 'carousel' && urls.length >= 2) {
        try {
          const { compositeCarouselFromPhotoUrls } = await import('@/lib/carousel-compositor');
          const headline = (input.title || input.brandName || 'Discover').trim();
          const overlayCaption = [input.caption, input.enhanceContext, input.concept].filter(Boolean).join(' ').trim();
          const { buffers, overlaysApplied } = await compositeCarouselFromPhotoUrls({
            photoUrls: urls,
            brandName: input.brandName || 'Brand',
            headline,
            caption: overlayCaption || undefined,
            cta: input.cta,
          });
          if (overlaysApplied && buffers.length >= 2) {
            imageUrls = await Promise.all(buffers.map((b) => persistJpegBuffer(b, input.brandName)));
            carouselOverlays = true;
            console.log(`[generate-instagram-image] Carousel passthrough overlays: ${buffers.length} slides`);
          }
        } catch (overlayErr) {
          console.warn('[generate-instagram-image] Carousel overlay failed, raw passthrough:', overlayErr);
        }
      }

      return NextResponse.json({
        success: true,
        imageUrl: imageUrls[0],
        imageUrls: useMultiEnhance || imageUrls.length > 1 ? imageUrls : undefined,
        photoCount: imageUrls.length,
        contentType,
        provider: 'original',
        model: carouselOverlays ? 'passthrough+carousel-overlay' : 'passthrough',
        quality: 'original',
        venue_preserved: true,
        carousel_overlays: carouselOverlays || undefined,
      });
    }

    try {
      const enhancePrompt = buildEnhancePrompt(input.brandName, input.enhanceContext, input.assetIntent, input.logoUrl, input.brandVibeProfile);
      const urls = await selectUrlsForEnhance();
      const enhanced = await Promise.all(
        urls.map((photoUrl) => enhanceWithOpenAI(photoUrl, contentType, enhancePrompt)),
      );
      const imageUrls = await Promise.all(
        enhanced.map(async (generated) => {
          const r2Url = await uploadToR2IfConfigured(generated.imageUrl, input.brandName);
          return r2Url.startsWith('http') || r2Url.startsWith('/api/media')
            ? r2Url
            : await materializeImageUrl(generated.imageUrl);
        }),
      );
      const persistedImageUrl = imageUrls[0]!;
      persistCreativeArtifact({
        title: input.title,
        imageUrl: persistedImageUrl,
        contentUrl: persistedImageUrl,
        prompt: enhancePrompt,
        caption: input.caption,
        contentType,
        brandName: input.brandName,
        industry: input.industry,
        location: input.location,
        provider: enhanced[0]!.provider,
        model: enhanced[0]!.model,
        quality: enhanced[0]!.quality,
      }).catch((err) => console.warn('[generate-instagram-image] enhance artifact persist failed:', err));
      return NextResponse.json({
        success: true,
        imageUrl: persistedImageUrl,
        imageUrls: useMultiEnhance ? imageUrls : undefined,
        photoCount: imageUrls.length,
        prompt: enhancePrompt,
        contentType,
        platform: 'instagram',
        provider: enhanced[0]!.provider,
        model: enhanced[0]!.model,
        quality: enhanced[0]!.quality,
        enhanced: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Enhancement failed';
      console.error('[/api/generate-instagram-image] Enhancement error:', error);
      return NextResponse.json({ error: 'Photo enhancement failed', detail: message }, { status: 500 });
    }
  }

  // Designed card mode: the visual design agent already wrote the full prompt.
  const isDesignedCard = Boolean(input.designCardPrompt);
  const prompt = isDesignedCard
    ? input.designCardPrompt!
    : await maybeExpandImageScenePrompt(buildPrompt(input));

  const preferredProvider: ImageProvider = isDesignedCard
    ? 'openai'
    : ((process.env.SMART_AGENCY_IMAGE_PROVIDER ?? 'flux') as ImageProvider);

  try {
    let generated: GeneratedImage;
    try {
      generated = preferredProvider === 'openai'
        ? await generateWithOpenAI(prompt, contentType, referenceImageUrls, isDesignedCard)
        : await generateWithFlux(prompt, contentType);
    } catch (primaryError) {
      if (preferredProvider === 'openai') throw primaryError;
      console.warn('[/api/generate-instagram-image] Flux failed, falling back to OpenAI:', primaryError);
      generated = await generateWithOpenAI(prompt, contentType, referenceImageUrls, isDesignedCard);
    }

    // Upload to R2 for permanent storage (required for Meta API publishing)
    const r2Url = await uploadToR2IfConfigured(generated.imageUrl, input.brandName);
    const persistedImageUrl = r2Url.startsWith('http') || r2Url.startsWith('/api/media') ? r2Url : await materializeImageUrl(generated.imageUrl);

    persistCreativeArtifact({
      title: input.title,
      imageUrl: persistedImageUrl,
      contentUrl: r2Url.startsWith('http') || r2Url.startsWith('/api/media') ? r2Url : contentUrlForPersistence(generated.imageUrl),
      prompt,
      caption: input.caption,
      contentType,
      visualStyle: input.visualStyle,
      brandTone: input.brandTone,
      targetAudience: input.targetAudience,
      brandName: input.brandName,
      industry: input.industry,
      location: input.location,
      campaignGoals: input.campaignGoals,
      customRules: input.customRules,
      instagramHandle: input.instagramHandle,
      provider: generated.provider,
      model: generated.model,
      quality: generated.quality,
    }).catch((error) => {
      console.error('[/api/generate-instagram-image] Failed to persist artifact:', error);
    });

    return NextResponse.json({
      success: true,
      imageUrl: persistedImageUrl,
      prompt,
      contentType,
      platform: 'instagram',
      provider: generated.provider,
      model: generated.model,
      quality: generated.quality,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[/api/generate-instagram-image] Unexpected error:', error);
    const lower = message.toLowerCase();
    if (lower.includes('billing') || lower.includes('exhausted balance') || lower.includes('hard limit')) {
      return NextResponse.json({
        error: 'Image generation provider billing limit reached',
        detail: message,
      }, { status: 402 });
    }
    if (lower.includes('rate limit') || lower.includes('rate_limit')) {
      return NextResponse.json({
        error: 'Image generation rate limit reached',
        detail: message,
      }, { status: 429 });
    }
    return NextResponse.json({ error: 'Image generation failed', detail: message }, { status: 500 });
  }
}

async function persistCreativeArtifact(data: {
  title: string;
  imageUrl: string;
  contentUrl: string;
  prompt: string;
  caption?: string;
  contentType: string;
  visualStyle?: string;
  brandTone?: string;
  targetAudience?: string;
  brandName?: string;
  industry?: string;
  location?: string;
  campaignGoals?: string;
  customRules?: string;
  instagramHandle?: string;
  provider: string;
  model: string;
  quality: string;
}) {
  const res = await fetch(`${API_BASE_URL}/api/artifacts/creative`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: data.title,
      contentUrl: data.contentUrl,
      content: JSON.stringify({
        renderedPreview: {
          kind: 'social',
          title: data.title,
          summary: data.caption ?? data.prompt,
          imageUrl: data.imageUrl,
          caption: data.caption,
        },
        prompt: data.prompt,
      }),
      platform: 'instagram',
      contentType: data.contentType,
      metadata: {
        source: `${data.provider}-image`,
        provider: data.provider,
        model: data.model,
        quality: data.quality,
        platform: 'instagram',
        contentType: data.contentType,
        visualStyle: data.visualStyle,
        brandTone: data.brandTone,
        targetAudience: data.targetAudience,
        brandName: data.brandName,
        industry: data.industry,
        location: data.location,
        campaignGoals: data.campaignGoals,
        customRules: data.customRules,
        instagramHandle: data.instagramHandle,
        generatedAt: new Date().toISOString(),
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Creative artifact persist failed (${res.status}): ${body}`);
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    endpoint: 'POST /api/generate-instagram-image',
    description: 'Generate Instagram post/story image and persist it as an artifact.',
    requiredFields: ['title'],
    optionalFields: ['caption', 'concept', 'campaignContext', 'contentType: post|story|carousel', 'enhanceMode', 'multiPhotoEnhance (2–4 URLs with enhanceMode)', 'brandName', 'industry', 'location', 'visualStyle', 'brandTone', 'targetAudience', 'campaignGoals', 'customRules', 'instagramHandle', 'tags', 'referenceImageUrls (https URLs — array; carousel/multiPhotoEnhance returns imageUrls[])'],
  });
}
