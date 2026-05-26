import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface PhotoAnalysis {
  contentTags?: string[];
  description?: string;
  usageContext?: string;
  mood?: string;
  bestFor?: string[];
  suggestedAssetType?: string;
}

interface CaptionGenRequest {
  unusedPhotoUrls: string[];
  galleryAnalysis: Record<string, PhotoAnalysis>;
  brandName?: string;
  brandDescription?: string;
  industry?: string;
  existingCaptions?: string[];
  language?: string;
}

interface CaptionSuggestion {
  photoUrl: string;
  caption: string;
  headline: string;
  hashtags: string[];
  contentType: 'post' | 'story' | 'reel';
  mood: string;
}

const SYSTEM_PROMPT = `You are a creative social media strategist generating Instagram captions for brand photos.
You receive unused gallery photos with their AI analysis (tags, description, mood) and brand context.

RULES:
- Generate exactly ONE caption per unused photo
- Each caption must naturally describe what's IN the photo — viewers will see the photo alongside the caption
- Match the caption's tone to the photo's mood (energetic → upbeat language, elegant → sophisticated tone)
- Include a catchy headline (1 line, for preview cards)
- Include 5-8 relevant hashtags mixing brand-specific and discovery hashtags
- Suggest the best content type: "post" for hero shots, "story" for casual/BTS, "reel" for action/motion scenes
- NEVER repeat an existing caption (provided in context)
- Write in the specified language (default: Turkish)
- Keep captions concise (2-3 sentences max) and Instagram-native

Respond with a JSON object: { "suggestions": [...] } where each item has:
- "photoUrl": exact URL from input
- "caption": the Instagram caption text (include emojis sparingly)
- "headline": short attention-grabbing headline
- "hashtags": string array of hashtags (with # prefix)
- "contentType": "post" | "story" | "reel"
- "mood": one-word mood descriptor

Respond ONLY with JSON (no markdown fences).`;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 503 });
  }

  let body: CaptionGenRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    unusedPhotoUrls, galleryAnalysis,
    brandName, brandDescription, industry,
    existingCaptions, language = 'Turkish',
  } = body;

  if (!unusedPhotoUrls?.length) {
    return NextResponse.json({ suggestions: [] }, { status: 200 });
  }
  if (!galleryAnalysis || Object.keys(galleryAnalysis).length === 0) {
    return NextResponse.json({ suggestions: [], error: 'No gallery analysis data' }, { status: 200 });
  }

  const photosToProcess = unusedPhotoUrls
    .filter(url => galleryAnalysis[url])
    .slice(0, 10);

  if (photosToProcess.length === 0) {
    return NextResponse.json({ suggestions: [], error: 'No analysis available for provided photos' }, { status: 200 });
  }

  const photosDescription = photosToProcess.map((url, i) => {
    const analysis = galleryAnalysis[url]!;
    const tags = (analysis.contentTags ?? []).join(', ');
    const desc = analysis.description ?? '';
    const usage = analysis.usageContext ?? '';
    const photoMood = analysis.mood ?? '';
    const bestFor = (analysis.bestFor ?? []).join(', ');
    return `Photo ${i + 1} [url: ${url}]:\n  Tags: ${tags}\n  Description: ${desc}\n  Mood: ${photoMood}\n  Best for: ${bestFor}\n  Usage: ${usage}`;
  }).join('\n\n');

  const existingList = (existingCaptions ?? []).slice(0, 20).map((c, i) => `${i + 1}. "${c.slice(0, 100)}"`).join('\n');

  const userPrompt = [
    `Brand: ${brandName || 'Unknown'}`,
    brandDescription ? `About: ${brandDescription}` : '',
    industry ? `Industry: ${industry}` : '',
    `Language: ${language}`,
    '',
    `Unused photos (${photosToProcess.length}):`,
    photosDescription,
    '',
    existingList ? `Existing captions (DO NOT repeat):\n${existingList}` : '',
    '',
    `Generate a unique, engaging caption for each photo above.`,
  ].filter(Boolean).join('\n');

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 2500,
      temperature: 0.8,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? '{}';
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ suggestions: [], parseError: true }, { status: 200 });
    }

    let suggestions: CaptionSuggestion[] = [];
    if (parsed && typeof parsed === 'object' && 'suggestions' in parsed && Array.isArray((parsed as { suggestions: unknown }).suggestions)) {
      suggestions = (parsed as { suggestions: CaptionSuggestion[] }).suggestions;
    }

    suggestions = suggestions.filter(s =>
      s && typeof s.photoUrl === 'string' && typeof s.caption === 'string'
    );

    return NextResponse.json({ suggestions });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Caption generation failed', suggestions: [] },
      { status: 200 },
    );
  }
}
