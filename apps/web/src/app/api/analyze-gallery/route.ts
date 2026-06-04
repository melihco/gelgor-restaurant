import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { computeAnalysisQuality } from '@/lib/gallery-intelligence';

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
  /** Deterministic 0..100 quality of this analysis (Sprint 2 GIS). */
  qualityScore?: number;
  /** ISO timestamp when this analysis was produced (Sprint 2 GIS recency). */
  analyzedAt?: string;
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
  "usageContext": "Specific caption/content types this photo pairs best with — be specific to what the photo shows"
}

bestFor/notGoodFor values: venue_photo, product_highlight, service_showcase, drink_showcase, food_showcase, event_announcement, behind_the_scenes, social_proof, daily_story, campaign_offer, brand_background, story_format, feed_post, reel_cover, before_after, team_intro, customer_result, equipment_showcase`;


/** Normalize URL for cache key — ignore query params */
function normalizeUrlKey(url: string): string {
  return url.split('?')[0] ?? url;
}

async function analyzePhoto(
  url: string,
  openai: OpenAI,
  tier: AnalysisTier = 'standard',
): Promise<GalleryPhotoAnalysis> {
  // standard: gpt-4o-mini + detail:low — ~15x cheaper, fine for bulk tagging.
  // hero:     gpt-4o + detail:high — richer tags for the most important photos.
  const isHero = tier === 'hero';
  const response = await openai.chat.completions.create({
    model: isHero ? 'gpt-4o' : 'gpt-4o-mini',
    max_tokens: isHero ? 700 : 500,
    temperature: 0.15,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analyze this brand photo:' },
          { type: 'image_url', image_url: { url, detail: isHero ? 'high' : 'low' } },
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
    analyzedAt: new Date().toISOString(),
  };
  analysis.qualityScore = computeAnalysisQuality(analysis);
  return analysis;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
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

  // Ephemeral CDN patterns — filter before analysis
  const EPHEMERAL_CDN = /scontent-|cdninstagram\.com|fbcdn\.net|instagram\.fcdn/i;

  const urls = (body.assetUrls ?? []).filter(
    (u): u is string => typeof u === 'string' && u.startsWith('http') && !EPHEMERAL_CDN.test(u),
  );

  if (urls.length === 0) {
    return NextResponse.json({ error: 'No valid URLs provided', note: 'All URLs may have been filtered (ephemeral CDN)' }, { status: 400 });
  }

  const openai = new OpenAI({ apiKey });

  // Pre-validate URLs — skip ones that can't be fetched (broken, expired, blocked)
  const FETCH_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'image/*,*/*;q=0.8',
  };

  async function isAccessible(url: string): Promise<boolean> {
    // Brand website direct image URLs — skip local fetch check; OpenAI Vision fetches remotely
    if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(url.split('?')[0] ?? url)) {
      return true;
    }
    try {
      const r = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(8_000),
        headers: FETCH_HEADERS,
      });
      if (r.ok) return true;
      // Try GET if HEAD is blocked
      const r2 = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(10_000), headers: FETCH_HEADERS });
      const mime = r2.headers.get('content-type') ?? '';
      return r2.ok && mime.startsWith('image/');
    } catch {
      return false;
    }
  }

  // Check accessibility in parallel before spending tokens on analysis
  const accessible = await Promise.all(urls.slice(0, 100).map(async (url) => ({
    url,
    ok: await isAccessible(url),
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
        errors.push({ url, error: err instanceof Error ? err.message : 'Analysis failed' });
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
