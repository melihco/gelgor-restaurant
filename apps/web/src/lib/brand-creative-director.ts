/**
 * Brand Creative Director — interprets ad-hoc briefs through the lens of the brand.
 *
 * When a user types "Full Moon" for Sarnıç Beach (a beach club), this module
 * enriches that raw intent into a brand-contextual creative brief:
 *   - What does "Full Moon" mean for THIS brand? (party, DJ set, moonlit dinner, yakamoz)
 *   - What visual scene, mood, and headline best represent this brand's identity?
 *   - What is the strategic purpose of this content?
 *
 * Uses GPT-4o with brand context (sector, tone, visual DNA, location, description)
 * to reason like the brand's own creative director / CEO.
 */

import OpenAI from 'openai';
import { serverConfig } from './server-config';

export interface BrandCreativeDirectorInput {
  title: string;
  extraDirection?: string;
  outputType: 'story' | 'reel' | 'post';
  brandName: string;
  brandBusinessType: string;
  brandLocation: string;
  brandTone: string;
  brandDescription: string;
  visualDna?: string;
  contentPillars?: string[];
  instagramBio?: string;
  customRules?: string;
  locale?: string;
}

export interface BrandCreativeDirectorOutput {
  headline: string;
  caption: string;
  sceneHint: string;
  mood: string;
  visualDirection: string;
  strategicPurpose: string;
  brandInterpretation: string;
  motionCue?: string;
}

const SYSTEM_PROMPT = `You are the in-house CREATIVE DIRECTOR for a brand. Your job is to interpret brief requests through the brand's unique identity, sector, and audience.

When the brand owner writes a short brief (e.g. "Full Moon"), you must:
1. Think like the brand's CEO — what would THIS brand create for this concept?
2. Consider the sector: a beach club "Full Moon" = moonlit party, DJ set, sunset-to-moonrise; a restaurant = moonlight dinner, special tasting menu; a yoga studio = full moon meditation circle.
3. Consider the brand tone and location: a luxury venue will frame it elegantly; a youthful brand will frame it energetically.
4. Produce a specific, visual, actionable creative brief — not generic marketing copy.

Output ONLY valid JSON with these exact fields:
{
  "headline": "Short punchy headline for the visual (max 5 words, MUST be in the brand's native language — Turkish brands → Turkish headline)",
  "caption": "Instagram caption draft (2-3 sentences, brand tone, relevant hashtags)",
  "sceneHint": "Specific visual scene description for the AI image generator — describe what the CAMERA SEES: environment, lighting, objects, people, time of day. Must match the brand's actual venue/product photos. Do NOT describe graphic design elements.",
  "mood": "2-3 word mood descriptor (e.g. 'mystical euphoric', 'warm intimate', 'bold energetic')",
  "visualDirection": "DESIGN ART DIRECTION — describe the specific graphic design style this brand would use for this brief. Include: typography style (serif/sans/display/script, weight, case), layout composition (diagonal split, centered stack, asymmetric, full-bleed), decorative elements (geometric shapes, organic curves, neon effects, hand-drawn marks, minimalist lines), color temperature approach, and a style reference (e.g. 'dark moody neon poster with bold condensed sans headline, diagonal amber slash' or 'airy minimal layout, thin serif headline on cream panel, single gold accent line'). Each brand MUST get a fundamentally different design language.",
  "strategicPurpose": "Why this content exists for the brand (engagement, event awareness, atmosphere showcase, etc.)",
  "brandInterpretation": "One sentence: how you interpreted the brief specifically for this brand (e.g. 'Full Moon → moonlit beach party with DJ set overlooking the Aegean')",
  "motionCue": "For video/reel: subtle motion description (e.g. 'gentle waves, flickering candles, crowd sway')"
}

Rules:
- LANGUAGE: Always output headline and caption in the BRAND'S native language. If the brand is Turkish, ALL text output (headline, caption) MUST be in Turkish — even if the brief title is in English.
- Be SPECIFIC to this brand — never generic
- sceneHint must describe the REAL SCENE a photographer would capture at this venue — NOT graphic design layout instructions
- headline stays short and punchy (social media hook), max 4-5 words
- caption should feel native to the brand's Instagram voice
- sceneHint keywords help select the right gallery photo, so mention key visual elements: beach/pool/bar/dance floor/sunset/night/crowd/DJ/food etc.
- visualDirection MUST produce a UNIQUE design language for each brand — two different brands receiving the same brief must get completely different design approaches based on their sector, tone, and aesthetic DNA`;

function buildUserPrompt(input: BrandCreativeDirectorInput): string {
  const locale = input.locale || 'tr';
  const langLabel = locale === 'tr' ? 'Turkish' : locale === 'en' ? 'English' : locale;
  const lines = [
    `## BRAND PROFILE`,
    `- Name: ${input.brandName}`,
    `- Sector: ${input.brandBusinessType}`,
    `- Location: ${input.brandLocation}`,
    `- Tone: ${input.brandTone}`,
    `- Primary Language: ${langLabel}`,
    input.brandDescription ? `- Description: ${input.brandDescription.slice(0, 300)}` : '',
    input.visualDna ? `- Visual DNA: ${input.visualDna.slice(0, 300)}` : '',
    input.contentPillars?.length ? `- Content Pillars: ${input.contentPillars.join(', ')}` : '',
    input.instagramBio ? `- Instagram Bio: ${input.instagramBio.slice(0, 150)}` : '',
    input.customRules ? `- Brand Rules: ${input.customRules.slice(0, 200)}` : '',
    '',
    `## BRIEF REQUEST`,
    `- Title: "${input.title}"`,
    input.extraDirection ? `- Direction: "${input.extraDirection.slice(0, 300)}"` : '',
    `- Format: ${input.outputType}`,
    '',
    `Interpret this brief AS the brand's creative director. What would ${input.brandName} create for "${input.title}"?`,
    `IMPORTANT: Output headline and caption in ${langLabel}.`,
  ];
  return lines.filter(Boolean).join('\n');
}

function parseResponse(raw: string): BrandCreativeDirectorOutput | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    if (!parsed.headline || !parsed.sceneHint) return null;
    return {
      headline: String(parsed.headline).slice(0, 80),
      caption: String(parsed.caption ?? '').slice(0, 600),
      sceneHint: String(parsed.sceneHint ?? '').slice(0, 300),
      mood: String(parsed.mood ?? '').slice(0, 60),
      visualDirection: String(parsed.visualDirection ?? '').slice(0, 300),
      strategicPurpose: String(parsed.strategicPurpose ?? '').slice(0, 200),
      brandInterpretation: String(parsed.brandInterpretation ?? '').slice(0, 200),
      motionCue: parsed.motionCue ? String(parsed.motionCue).slice(0, 150) : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Interpret a raw brief through the brand's creative director lens.
 * Returns enriched creative direction, or null on failure (caller falls back to rule-based).
 */
export async function interpretBriefAsBrand(
  input: BrandCreativeDirectorInput,
): Promise<BrandCreativeDirectorOutput | null> {
  const apiKey = serverConfig.openai.apiKey;
  if (!apiKey) {
    console.warn('[brand-creative-director] No OpenAI API key — skipping interpretation');
    return null;
  }

  try {
    const openai = new OpenAI({ apiKey });
    const userPrompt = buildUserPrompt(input);

    const response = await openai.chat.completions.create({
      model: serverConfig.ai.chatModel('creative'),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 600,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return null;

    const result = parseResponse(content);
    if (result) {
      console.log(
        `[brand-creative-director] "${input.title}" → "${result.brandInterpretation}"`,
      );
    }
    return result;
  } catch (err) {
    console.warn(
      '[brand-creative-director] interpretation failed:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

const DIRECTION_SYSTEM_PROMPT = `You are the in-house CREATIVE DIRECTOR for a brand. The brand owner is filling a "Vibe & Direction" field for a social media brief.

Write 4–5 short sentences in the brand's native language (Turkish brands → Turkish) that guide the visual production team. Include:
- How THIS brand should interpret the brief topic (not generic — specific to sector and venue)
- Mood, lighting, energy, and atmosphere
- What the design should feel like (typography energy, color temperature, decorative tone)
- One concrete scene or visual cue that fits the brand's real world

Rules:
- Plain text only — no JSON, no bullet points, no hashtags
- Be specific to the brand DNA — never generic Canva-style copy
- Do NOT write the headline or caption — only creative direction for the vibe field
- Max 450 characters total`;

/** Suggest Vibe & Direction copy for the New Brief form — brand-specific, 4–5 sentences. */
export async function suggestBriefDirection(
  input: BrandCreativeDirectorInput,
): Promise<string | null> {
  const apiKey = serverConfig.openai.apiKey;
  if (!apiKey) return null;

  const locale = input.locale || 'tr';
  const langLabel = locale === 'tr' ? 'Turkish' : locale === 'en' ? 'English' : locale;

  try {
    const openai = new OpenAI({ apiKey });
    const userPrompt = [
      `Brand: ${input.brandName}`,
      `Sector: ${input.brandBusinessType}`,
      `Location: ${input.brandLocation}`,
      `Tone: ${input.brandTone}`,
      input.brandDescription ? `Description: ${input.brandDescription.slice(0, 250)}` : '',
      input.visualDna ? `Visual DNA: ${input.visualDna.slice(0, 250)}` : '',
      '',
      `Brief topic: "${input.title}"`,
      `Output format: ${input.outputType}`,
      '',
      `Write the Vibe & Direction field in ${langLabel} — how should ${input.brandName} express "${input.title}" on social media?`,
    ].filter(Boolean).join('\n');

    const response = await openai.chat.completions.create({
      model: serverConfig.ai.chatModel('creative'),
      messages: [
        { role: 'system', content: DIRECTION_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 280,
      temperature: 0.75,
    });

    const text = response.choices[0]?.message?.content?.trim();
    return text ? text.slice(0, 500) : null;
  } catch (err) {
    console.warn(
      '[brand-creative-director] direction suggestion failed:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
