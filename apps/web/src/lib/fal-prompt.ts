/**
 * fal.ai media prompt finalization — complete prompts, word-safe caps.
 *
 * Kling I2V recommends ≤2500 chars. Never `.slice()` mid-word (breaks FORBIDDEN clauses).
 */
import { truncateAtWordBoundary } from '@/lib/fal-caption-headline';

/** fal Kling v3 I2V recommended max (https://fal.ai/models/fal-ai/kling-video/v3/standard/image-to-video) */
export const FAL_VIDEO_PROMPT_MAX_CHARS = 2500;

/** Ideogram / Flux designer still prompts — room for typography contracts */
export const FAL_IMAGE_PROMPT_MAX_CHARS = 4000;

export type FalPromptKind = 'video' | 'image';

export function resolveFalPromptMaxChars(kind: FalPromptKind): number {
  return kind === 'video' ? FAL_VIDEO_PROMPT_MAX_CHARS : FAL_IMAGE_PROMPT_MAX_CHARS;
}

/**
 * Normalize whitespace and cap at fal API limits without mid-word truncation.
 * Logs a warning when trimming occurs so ops can spot over-long prompts.
 */
export function finalizeFalPrompt(
  text: string,
  opts?: { maxChars?: number; kind?: FalPromptKind; label?: string },
): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  const maxChars = opts?.maxChars ?? resolveFalPromptMaxChars(opts?.kind ?? 'video');
  if (normalized.length <= maxChars) return normalized;

  const trimmed = truncateAtWordBoundary(normalized, maxChars);
  const tag = opts?.label ? `[fal-prompt:${opts.label}]` : '[fal-prompt]';
  console.warn(
    `${tag} trimmed ${normalized.length}→${trimmed.length} chars (max ${maxChars})`,
  );
  return trimmed;
}
