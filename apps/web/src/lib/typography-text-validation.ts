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
  containsFalCanvasMetaLeak,
  isFalCanvasMetaOnlyHeadline,
} from './fal-caption-headline';
import { resolveExternallyAccessibleUrl } from './media-url';
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
  const result = await validateFalCanvasText(imageUrl, { headline: intendedHeadline });
  return result.valid;
}

export interface FalCanvasTextValidationInput {
  headline: string;
  subtitle?: string;
}

export interface FalCanvasTextValidationResult {
  valid: boolean;
  headlineValid: boolean;
  subtitleValid: boolean;
  confidence: number;
  detectedHeadline?: string;
  detectedSubtitle?: string;
  reason?: string;
}

/**
 * Verify headline and optional subtitle on a designed frame.
 * Rejects misspelled Turkish diacritics and invented copy.
 */
export async function validateFalCanvasText(
  imageUrl: string,
  input: FalCanvasTextValidationInput,
): Promise<FalCanvasTextValidationResult> {
  const intendedHeadline = input.headline.trim();
  const intendedSubtitle = input.subtitle?.trim() ?? '';

  if (
    !intendedHeadline
    || !isMeaningfulFalOverlayText(intendedHeadline)
    || isIncompleteOverlayPhrase(intendedHeadline)
    || isInternalStrategyBriefing(intendedHeadline)
  ) {
    console.warn('[typography-validate] intended headline invalid — reject before vision');
    return {
      valid: false,
      headlineValid: false,
      subtitleValid: !intendedSubtitle,
      confidence: 0,
      reason: 'invalid intended headline',
    };
  }

  const apiKey = serverConfig.openai.apiKey;
  if (!apiKey) {
    console.warn('[typography-validate] OPENAI_API_KEY not set — cannot verify canvas text (reject)');
    return {
      valid: false,
      headlineValid: false,
      subtitleValid: false,
      confidence: 0,
      reason: 'OPENAI_API_KEY missing',
    };
  }

  try {
    const visionUrl = await resolveExternallyAccessibleUrl(imageUrl);
    const result = await callVisionCanvasValidator(
      apiKey,
      visionUrl,
      intendedHeadline,
      intendedSubtitle || undefined,
    );
    console.log(
      `[typography-validate] headline="${intendedHeadline.slice(0, 25)}" ` +
      `subtitle="${intendedSubtitle.slice(0, 20)}" ` +
      `valid=${result.valid} headlineOk=${result.headlineValid} subtitleOk=${result.subtitleValid} ` +
      `confidence=${result.confidence}`,
    );
    return result;
  } catch (err) {
    console.warn('[typography-validate] Vision check failed — rejecting image:', err instanceof Error ? err.message : err);
    return {
      valid: false,
      headlineValid: false,
      subtitleValid: false,
      confidence: 0,
      reason: err instanceof Error ? err.message : 'vision failed',
    };
  }
}

async function callVisionCanvasValidator(
  apiKey: string,
  imageUrl: string,
  intendedHeadline: string,
  intendedSubtitle?: string,
): Promise<FalCanvasTextValidationResult> {
  const subtitleBlock = intendedSubtitle
    ? [
      `The INTENDED subtitle (second line) is: "${intendedSubtitle}"`,
      '- "subtitle_matches" = true ONLY if the detected subtitle line matches exactly (Turkish diacritics İ/ı/Ş/ş/Ğ/ğ/Ü/ü/Ö/ö/Ç/ç must be correct)',
      '- Reject subtitle if ASCII-only approximations appear (e.g. "Sinirli sure" vs "Sınırlı süre")',
    ].join('\n')
    : '- No subtitle required — subtitle_matches = true';

  const prompt = [
    'You are a text accuracy validator for AI-generated social media designs.',
    'Look at this image and identify the headline and any subtitle/supporting line text.',
    '',
    `The INTENDED headline is: "${intendedHeadline}"`,
    subtitleBlock,
    '',
    'Respond in JSON only:',
    '{"detected_headline": "...", "headline_matches": true/false, "detected_subtitle": "...", "subtitle_matches": true/false, "confidence": 0.0-1.0, "reason": "..."}',
    '',
    'Rules:',
    '- "headline_matches" = true ONLY if the detected main/largest text matches the intended headline message',
    '- Reject if detected text is mostly platform/meta words: STORY, REEL, POST, INSTAGRAM, TIKTOK, ÜNLÜ, VIRAL',
    '- Reject if detected text is unrelated to the intended headline (invented slogans, random words)',
    '- Turkish diacritics must be exact — reject ASCII-only misspellings',
    '- Ignore decorative elements and small logo-area gibberish — focus on designed headline/subtitle only',
    '- If text is partially obscured but readable and matches, still match',
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
      max_tokens: 260,
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
    return {
      valid: false,
      headlineValid: false,
      subtitleValid: false,
      confidence: 0,
      reason: 'Could not parse vision response',
    };
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    detected_headline?: string;
    headline_matches?: boolean;
    detected_subtitle?: string;
    subtitle_matches?: boolean;
    confidence?: number;
    reason?: string;
    detected_text?: string;
    matches?: boolean;
  };

  const detectedHeadline = (parsed.detected_headline ?? parsed.detected_text ?? '').trim();
  const detectedSubtitle = (parsed.detected_subtitle ?? '').trim();
  const incompleteHeadline = isRenderedOverlayTextIncomplete(detectedHeadline);
  const metaLeak = containsFalCanvasMetaLeak(detectedHeadline) && !containsFalCanvasMetaLeak(intendedHeadline);
  const metaOnly = isFalCanvasMetaOnlyHeadline(detectedHeadline);
  const headlineSimilarity = quickTextSimilarity(detectedHeadline, intendedHeadline);
  const lowHeadlineSimilarity = detectedHeadline.length >= 4 && headlineSimilarity < 0.55;
  const headlineValid = (parsed.headline_matches ?? parsed.matches) !== false
    && !incompleteHeadline
    && !metaLeak
    && !metaOnly
    && !lowHeadlineSimilarity;

  let subtitleValid = true;
  if (intendedSubtitle) {
    const incompleteSubtitle = isRenderedOverlayTextIncomplete(detectedSubtitle);
    const subtitleSimilarity = quickTextSimilarity(detectedSubtitle, intendedSubtitle);
    const lowSubtitleSimilarity = detectedSubtitle.length >= 4 && subtitleSimilarity < 0.72;
    subtitleValid = parsed.subtitle_matches !== false
      && !incompleteSubtitle
      && !lowSubtitleSimilarity;
  }

  return {
    valid: headlineValid && subtitleValid,
    headlineValid,
    subtitleValid,
    confidence: parsed.confidence ?? 0.5,
    detectedHeadline,
    detectedSubtitle: detectedSubtitle || undefined,
    reason: !headlineValid
      ? (incompleteHeadline
        ? 'detected incomplete headline'
        : metaOnly
          ? 'detected meta-only canvas text'
          : metaLeak
            ? 'detected platform meta word'
            : lowHeadlineSimilarity
              ? `headline too different (similarity=${headlineSimilarity.toFixed(2)})`
              : parsed.reason)
      : !subtitleValid
        ? `subtitle mismatch (detected="${detectedSubtitle.slice(0, 30)}")`
        : parsed.reason,
  };
}

/** @deprecated Use callVisionCanvasValidator */
async function callVisionValidator(
  apiKey: string,
  imageUrl: string,
  intendedHeadline: string,
): Promise<ValidationResult> {
  const result = await callVisionCanvasValidator(apiKey, imageUrl, intendedHeadline);
  return {
    valid: result.headlineValid,
    confidence: result.confidence,
    detectedText: result.detectedHeadline,
    reason: result.reason,
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
