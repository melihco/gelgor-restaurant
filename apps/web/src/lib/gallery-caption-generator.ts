/**
 * GPT caption generation from analyzed gallery photos (shared by API route + auto-produce).
 */
import OpenAI from 'openai';
import type { GalleryPhotoMeta } from '@/lib/gallery-photo-matcher';

export interface GalleryCaptionSuggestion {
  photoUrl: string;
  caption: string;
  headline: string;
  hashtags: string[];
  contentType: 'post' | 'story' | 'reel';
  mood: string;
}

const SYSTEM_PROMPT = `You are a creative social media strategist generating Instagram captions for brand photos.
You receive gallery photos with AI analysis (tags, description, mood) and brand context.

RULES:
- Each caption must naturally describe what's IN the photo — viewers will see the photo alongside the caption
- Match tone to photo mood (energetic → upbeat, elegant → sophisticated)
- Include a catchy headline (1 line, for preview cards)
- Include 5-8 relevant hashtags mixing brand-specific and discovery hashtags
- NEVER repeat an existing caption (provided in context)
- Write in the specified language (default: Turkish)
- Keep captions concise (2-3 sentences max) and Instagram-native
- Do NOT start with "The image shows" or raw vision-analysis phrasing

Respond with JSON: { "suggestions": [{ "photoUrl", "caption", "headline", "hashtags", "contentType", "mood" }] }
Respond ONLY with JSON (no markdown fences).`;

export async function generateGalleryCaptionsWithGpt(input: {
  photoUrls: string[];
  galleryAnalysis: Record<string, GalleryPhotoMeta>;
  brandName?: string;
  brandDescription?: string;
  industry?: string;
  existingCaptions?: string[];
  language?: string;
  slotHint?: string;
}): Promise<GalleryCaptionSuggestion[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !input.photoUrls.length) return [];

  const photosToProcess = input.photoUrls
    .filter((url) => input.galleryAnalysis[url])
    .slice(0, 5);
  if (!photosToProcess.length) return [];

  const photosDescription = photosToProcess.map((url, i) => {
    const analysis = input.galleryAnalysis[url]!;
    const tags = (analysis.contentTags ?? []).join(', ');
    const desc = analysis.description ?? '';
    const photoMood = analysis.mood ?? '';
    const bestFor = (analysis.bestFor ?? []).join(', ');
    return `Photo ${i + 1} [url: ${url}]:\n  Tags: ${tags}\n  Description: ${desc}\n  Mood: ${photoMood}\n  Best for: ${bestFor}`;
  }).join('\n\n');

  const existingList = (input.existingCaptions ?? []).slice(0, 20)
    .map((c, i) => `${i + 1}. "${c.slice(0, 100)}"`)
    .join('\n');

  const userPrompt = [
    `Brand: ${input.brandName || 'Unknown'}`,
    input.brandDescription ? `About: ${input.brandDescription}` : '',
    input.industry ? `Industry: ${input.industry}` : '',
    input.slotHint ? `Content slot: ${input.slotHint}` : '',
    `Language: ${input.language ?? 'Turkish'}`,
    '',
    `Photos (${photosToProcess.length}):`,
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
      max_tokens: 2000,
      temperature: 0.75,
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
      return [];
    }

    if (
      !parsed
      || typeof parsed !== 'object'
      || !('suggestions' in parsed)
      || !Array.isArray((parsed as { suggestions: unknown }).suggestions)
    ) {
      return [];
    }

    return (parsed as { suggestions: GalleryCaptionSuggestion[] }).suggestions.filter(
      (s) => s && typeof s.photoUrl === 'string' && typeof s.caption === 'string',
    );
  } catch {
    return [];
  }
}
