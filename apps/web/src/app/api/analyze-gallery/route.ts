import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { computeAnalysisQuality } from '@/lib/gallery-intelligence';
import {
  probeGalleryPhotoAccessible,
  resolveVisionImageUrl,
} from '@/lib/gallery-upload';
import { isUsableGalleryPhotoUrl } from '@/lib/media-url';
import { serverConfig } from '@/lib/server-config';

export const runtime = 'nodejs';
export const maxDuration = 120;

export interface GalleryPhotoAnalysis {
  url: string;
  description: string;
  contentTags: string[];
  bestFor: string[];
  notGoodFor: string[];
  mood: string;
  hasPeople: boolean;
  hasText: boolean;
  isLogo: boolean;
  suggestedAssetType: string;
  usageContext: string;
  captionHooks?: string[];
  pairingKeywords?: string[];
  /** Deterministic 0..100 quality of this analysis (Sprint 2 GIS). */
  qualityScore?: number;
  /** ISO timestamp when this analysis was produced (Sprint 2 GIS recency). */
  analyzedAt?: string;
  /** Source of the analysis; metadata_fallback means no vision model was available. */
  analysisSource?: 'vision' | 'metadata_fallback';
  fallbackReason?: string;
}

/** Analysis tier. `hero` uses gpt-4o + detail:high for the most important photos. */
export type AnalysisTier = 'standard' | 'hero';

const ANALYSIS_SYSTEM_PROMPT = `You are a senior creative director and visual analyst at a top social media agency.
Your job: deeply analyze every brand photo so AI content agents can automatically select the perfect image for any caption.
The brand can be ANY type: restaurant, salon, gym, clinic, retail, tech, education, auto service, etc.

TAGGING PHILOSOPHY: Be hyper-specific about what you ACTUALLY see. Tag visible objects, not assumed ones.
Examples:
- Cocktail photo → "cocktail", "kokteyl", "drink", "içecek", "orange slice", "garnish", "bar glass"
- Hair salon → "saç kesimi", "haircut", "stylist", "ayna", "mirror", "saç boyası", "hair color"
- Gym → "dumbbell", "halter", "treadmill", "koşu bandı", "fitness", "antrenman", "workout"
- Product shot → describe the product, packaging, material, color, brand elements

TAG EVERY VISIBLE ELEMENT (use categories relevant to what you see):
- Food/Drink: dish name + ingredients, drink type + garnish, presentation style
- Space/Venue: specific room type, furniture, architectural features, outdoor/indoor
- Products: product name/type, packaging, material, display method
- **Packaged goods / local products:** read ANY visible label text on the package (e.g. "KURU NANE", "BADEM") and put exact product names in contentTags + pairingKeywords (TR + EN)
- Equipment/Tools: specific items relevant to the business (salon chair, gym rack, medical device, etc.)
- People: role/context (stylist, trainer, customer, team, model)
- Atmosphere: lighting mood, time of day, ambiance elements
- Activities: what's happening in the scene

BILINGUAL RULE: Add both English + Turkish for every key tag.

Respond ONLY with JSON (no markdown):
{
  "description": "2–3 sentences. Describe EXACTLY what you see: specific objects, people, setting, activity, atmosphere.",
  "contentTags": ["specific tag 1", "specific tag 2", ...],
  "bestFor": ["use_case1", ...],
  "notGoodFor": ["use_case1", ...],
  "mood": "ambient|energetic|elegant|warm|cool|dramatic|minimal|playful|festive|romantic|luxurious|professional|clinical|cozy",
  "hasPeople": true|false,
  "hasText": true|false,
  "isLogo": true|false,
  "suggestedAssetType": "venue_reference|hero_image|product_image|service_photo|event_photo|food_drink_photo|brand_background|logo|team_photo|before_after|equipment_photo",
  "usageContext": "Specific caption/content types this photo pairs best with — be specific to what the photo shows",
  "captionHooks": ["short TR caption hook 1", "short EN hook 2", "..."],
  "pairingKeywords": ["bilingual", "tokens", "for", "matcher"]
}

captionHooks: 3–6 short phrases (Turkish + English) that would appear in an Instagram caption when THIS exact photo is shown.
pairingKeywords: 8–14 concrete nouns/adjectives visible in the image (bilingual where useful) for search matching.

bestFor/notGoodFor values: venue_photo, product_highlight, service_showcase, drink_showcase, food_showcase, event_announcement, behind_the_scenes, social_proof, daily_story, campaign_offer, brand_background, story_format, feed_post, reel_cover, before_after, team_intro, customer_result, equipment_showcase`;


/** Normalize URL for cache key — ignore query params */
function normalizeUrlKey(url: string): string {
  return url.split('?')[0] ?? url;
}

function humanizeUrlTokens(url: string): string[] {
  try {
    const parsed = new URL(url);
    const pathTokens = decodeURIComponent(parsed.pathname)
      .split(/[\/_.\-\s]+/g)
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part.length >= 3 && !/^\d+$/.test(part));
    const stop = new Set([
      'www',
      'com',
      'tr',
      'jpg',
      'jpeg',
      'png',
      'webp',
      'image',
      'images',
      'assets',
      'myassets',
      'banner',
      'pictures',
      'uploads',
    ]);
    return Array.from(new Set(pathTokens.filter((part) => !stop.has(part)))).slice(0, 10);
  } catch {
    return [];
  }
}

function buildMetadataFallbackAnalysis(url: string, reason: string): GalleryPhotoAnalysis {
  const tokens = humanizeUrlTokens(url);
  const visibleTokens = tokens.length > 0 ? tokens : ['brand photo', 'marka fotoğrafı'];
  const tags = Array.from(new Set([
    ...visibleTokens,
    'brand gallery',
    'marka galerisi',
    'website image',
    'web sitesi görseli',
  ])).slice(0, 12);
  const analysis: GalleryPhotoAnalysis = {
    url,
    description:
      `Metadata fallback analysis for a brand gallery image. URL tokens suggest: ${visibleTokens.join(', ')}. ` +
      'A real vision pass should replace this entry when provider quota is available.',
    contentTags: tags,
    bestFor: ['brand_background', 'feed_post', 'story_format'],
    notGoodFor: ['logo', 'before_after'],
    mood: 'warm',
    hasPeople: false,
    hasText: false,
    isLogo: false,
    suggestedAssetType: 'brand_background',
    usageContext:
      `Use as a conservative brand/gallery background when copy mentions ${visibleTokens.slice(0, 4).join(', ')}.`,
    captionHooks: ['Markadan kareler', 'Brand gallery moment', 'Detaylarda marka hissi'],
    pairingKeywords: tags,
    analyzedAt: new Date().toISOString(),
    analysisSource: 'metadata_fallback',
    fallbackReason: reason.slice(0, 180),
  };
  analysis.qualityScore = Math.min(72, computeAnalysisQuality(analysis));
  return analysis;
}

function shouldUseMetadataFallback(error: unknown): boolean {
  if (process.env.GALLERY_ANALYSIS_METADATA_FALLBACK === 'false') return false;
  const message = error instanceof Error ? error.message : String(error);
  return /429|quota|rate limit|insufficient_quota|billing|timeout|fetch failed/i.test(message);
}

async function analyzePhoto(
  url: string,
  openai: OpenAI,
  tier: AnalysisTier = 'standard',
): Promise<GalleryPhotoAnalysis> {
  // standard: gpt-4o-mini + detail:low — ~15x cheaper, fine for bulk tagging.
  // hero:     gpt-4o + detail:high — richer tags for the most important photos.
  // DEV_COST_MODE=true overrides hero to mini (cheaper during development).
  const devCostMode = process.env.GALLERY_ANALYSIS_DEV_MODE === 'true';
  const isHero = tier === 'hero' && !devCostMode;
  const visionUrl = await resolveVisionImageUrl(url);
  const response = await openai.chat.completions.create({
    model: isHero ? serverConfig.ai.chatModel('hero') : serverConfig.ai.chatModel('standard'),
    max_tokens: isHero ? 700 : 500,
    temperature: 0.15,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analyze this brand photo:' },
          { type: 'image_url', image_url: { url: visionUrl, detail: isHero ? 'high' : 'low' } },
        ],
      },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? '{}';
  let parsed: Record<string, unknown>;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] ?? raw);
  } catch {
    parsed = {};
  }

  const analysis: GalleryPhotoAnalysis = {
    url,
    description: String(parsed.description ?? ''),
    contentTags: Array.isArray(parsed.contentTags) ? parsed.contentTags.map(String) : [],
    bestFor: Array.isArray(parsed.bestFor) ? parsed.bestFor.map(String) : [],
    notGoodFor: Array.isArray(parsed.notGoodFor) ? parsed.notGoodFor.map(String) : [],
    mood: String(parsed.mood ?? 'ambient'),
    hasPeople: Boolean(parsed.hasPeople),
    hasText: Boolean(parsed.hasText),
    isLogo: Boolean(parsed.isLogo),
    suggestedAssetType: String(parsed.suggestedAssetType ?? 'venue_reference'),
    usageContext: String(parsed.usageContext ?? ''),
    captionHooks: Array.isArray(parsed.captionHooks) ? parsed.captionHooks.map(String) : [],
    pairingKeywords: Array.isArray(parsed.pairingKeywords) ? parsed.pairingKeywords.map(String) : [],
    analyzedAt: new Date().toISOString(),
    analysisSource: 'vision',
  };
  analysis.qualityScore = computeAnalysisQuality(analysis);
  return analysis;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = serverConfig.openai.apiKey;
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 503 });
  }

  let body: {
    assetUrls?: string[];
    maxImages?: number;
    /** Already-analyzed entries keyed by URL — these are skipped (incremental mode) */
    existingAnalysis?: Record<string, Partial<GalleryPhotoAnalysis>>;
    forceReanalyze?: boolean;
    /** Analysis tier for this batch — 'hero' uses gpt-4o + detail:high. */
    tier?: AnalysisTier;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const urls = (body.assetUrls ?? []).filter(
    (u): u is string => typeof u === 'string' && isUsableGalleryPhotoUrl(u),
  );

  if (urls.length === 0) {
    return NextResponse.json({ error: 'No valid URLs provided' }, { status: 400 });
  }

  const openai = new OpenAI({ apiKey });

  // Check accessibility in parallel before spending tokens on analysis
  const accessible = await Promise.all(urls.slice(0, 100).map(async (url) => ({
    url,
    ok: await probeGalleryPhotoAccessible(url),
  })));

  const validUrls = accessible.filter((a) => a.ok).map((a) => a.url);
  const inaccessibleUrls = accessible.filter((a) => !a.ok).map((a) => a.url);

  const requestedMax = Number.isFinite(body.maxImages)
    ? Math.max(1, Math.min(Number(body.maxImages), 100))
    : 80;

  const existing = body.existingAnalysis ?? {};
  const existingKeys = new Set(Object.keys(existing).map(normalizeUrlKey));

  // Incremental: skip URLs already in persisted gallery_analysis
  const cachedResults: GalleryPhotoAnalysis[] = [];
  const pendingUrls: string[] = [];

  for (const url of validUrls.slice(0, requestedMax)) {
    const key = normalizeUrlKey(url);
    if (!body.forceReanalyze && existingKeys.has(key)) {
      const hit = Object.entries(existing).find(([k]) => normalizeUrlKey(k) === key)?.[1];
      if (hit?.description) {
        cachedResults.push({
          url,
          description: String(hit.description ?? ''),
          contentTags: Array.isArray(hit.contentTags) ? hit.contentTags.map(String) : [],
          bestFor: Array.isArray(hit.bestFor) ? hit.bestFor.map(String) : [],
          notGoodFor: Array.isArray(hit.notGoodFor) ? hit.notGoodFor.map(String) : [],
          mood: String(hit.mood ?? 'ambient'),
          hasPeople: Boolean(hit.hasPeople),
          hasText: Boolean(hit.hasText),
          isLogo: Boolean(hit.isLogo),
          suggestedAssetType: String(hit.suggestedAssetType ?? 'venue_reference'),
          usageContext: String(hit.usageContext ?? ''),
        });
        continue;
      }
    }
    pendingUrls.push(url);
  }

  const urlsToAnalyze = pendingUrls;

  // Analyze with small bounded concurrency: fast enough for onboarding, gentle on rate limits.
  const results: GalleryPhotoAnalysis[] = [...cachedResults];
  const errors: { url: string; error: string }[] = inaccessibleUrls.map((url) => ({
    url,
    error: 'Photo inaccessible — could not be fetched (broken URL, expired link, or server blocked)',
  }));

  const tier: AnalysisTier = body.tier === 'hero' ? 'hero' : 'standard';
  // Hero tier runs gpt-4o serially-ish to respect rate limits; standard stays at 3.
  const CONCURRENCY = tier === 'hero' ? 2 : 3;
  let cursor = 0;

  async function worker() {
    while (cursor < urlsToAnalyze.length) {
      const url = urlsToAnalyze[cursor++];
      if (!url) continue;
      try {
        const analysis = await analyzePhoto(url, openai, tier);
        results.push(analysis);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Analysis failed';
        if (shouldUseMetadataFallback(err)) {
          results.push(buildMetadataFallbackAnalysis(url, message));
          errors.push({ url, error: `metadata_fallback_used: ${message}` });
        } else {
          errors.push({ url, error: message });
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urlsToAnalyze.length) }, () => worker()));

  return NextResponse.json({
    results,
    errors,
    analyzed: results.length,
    newlyAnalyzed: results.length - cachedResults.length,
    skippedFromCache: cachedResults.length,
  });
}
