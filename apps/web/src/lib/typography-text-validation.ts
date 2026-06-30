/**
 * Typography Text Validation — GPT-4o Vision
 *
 * Verifies that AI-generated typography designs contain the intended
 * headline text with acceptable accuracy. Used as a quality gate
 * in the designed_typography production pipeline.
 */

import {
  isIncompleteOverlayPhrase,
  isInternalStrategyBriefing,
  isRenderedOverlayTextIncomplete,
  isMeaningfulFalOverlayText,
} from './fal-caption-headline';
import { serverConfig } from './server-config';

interface ValidationResult {
  valid: boolean;
  confidence: number;
  detectedText?: string;
  reason?: string;
}

/**
 * Check if the generated image contains text that matches the intended headline.
 * Uses GPT-4o Vision for OCR + fuzzy matching.
 *
 * Returns true if the detected text is >=70% similar to the intended headline.
 */
export async function validateTypographyText(
  imageUrl: string,
  intendedHeadline: string,
): Promise<boolean> {
  if (
    !intendedHeadline.trim()
    || !isMeaningfulFalOverlayText(intendedHeadline)
    || isIncompleteOverlayPhrase(intendedHeadline)
    || isInternalStrategyBriefing(intendedHeadline)
  ) {
    console.warn('[typography-validate] intended headline invalid — reject before vision');
    return false;
  }

  const apiKey = serverConfig.openai.apiKey;
  if (!apiKey) {
    console.warn('[typography-validate] OPENAI_API_KEY not set — cannot verify canvas text (reject)');
    return false;
  }

  try {
    const result = await callVisionValidator(apiKey, imageUrl, intendedHeadline);
    console.log(
      `[typography-validate] headline="${intendedHeadline.slice(0, 25)}" ` +
      `valid=${result.valid} confidence=${result.confidence} detected="${result.detectedText?.slice(0, 30)}"`,
    );
    return result.valid;
  } catch (err) {
    console.warn('[typography-validate] Vision check failed — rejecting image:', err instanceof Error ? err.message : err);
    return false;
  }
}

async function callVisionValidator(
  apiKey: string,
  imageUrl: string,
  intendedHeadline: string,
): Promise<ValidationResult> {
  const prompt = [
    'You are a text accuracy validator for AI-generated social media designs.',
    'Look at this image and identify the main headline/display text.',
    '',
    `The INTENDED headline is: "${intendedHeadline}"`,
    '',
    'Respond in JSON only:',
    '{"detected_text": "...", "matches": true/false, "confidence": 0.0-1.0, "reason": "..."}',
    '',
    'Rules:',
    '- "matches" = true if the detected text conveys the same message (minor spelling/case differences OK)',
    '- "confidence" = how confident you are in your reading (0.0-1.0)',
    '- Ignore decorative elements, brand names, or small text — focus on the largest/main text only',
    '- If text is partially obscured but readable, still match',
  ].join('\n');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: serverConfig.ai.profile.visionGrafiker,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl, detail: serverConfig.ai.profile.visionDetail } },
          ],
        },
      ],
      max_tokens: 200,
      temperature: 0,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Vision API failed ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content ?? '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { valid: false, confidence: 0, reason: 'Could not parse vision response' };
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    detected_text?: string;
    matches?: boolean;
    confidence?: number;
    reason?: string;
  };

  const detected = parsed.detected_text?.trim() ?? '';
  const incomplete = isRenderedOverlayTextIncomplete(detected);
  const matches = parsed.matches !== false && !incomplete;

  return {
    valid: matches,
    confidence: parsed.confidence ?? 0.5,
    detectedText: parsed.detected_text,
    reason: incomplete ? 'detected incomplete or briefing text on canvas' : parsed.reason,
  };
}

/**
 * Simple string similarity (Levenshtein-based) for quick pre-check
 * before calling expensive Vision API.
 */
export function quickTextSimilarity(a: string, b: string): number {
  const sa = a.toLowerCase().replace(/[^a-z0-9\u00c0-\u024f]/g, '');
  const sb = b.toLowerCase().replace(/[^a-z0-9\u00c0-\u024f]/g, '');
  if (sa === sb) return 1;
  if (!sa || !sb) return 0;

  const longer = sa.length > sb.length ? sa : sb;
  const shorter = sa.length > sb.length ? sb : sa;

  if (longer.includes(shorter)) return shorter.length / longer.length;

  const dist = levenshtein(sa, sb);
  return Math.max(0, 1 - dist / Math.max(sa.length, sb.length));
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1]
        ? dp[i - 1]![j - 1]!
        : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[m]![n]!;
}
