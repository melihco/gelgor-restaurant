/**
 * Headline writer — the single place that decides the on-canvas line.
 *
 * Order (first accepted wins):
 *   1. hint      — line the look / ideation already wrote, if it passes the gate
 *   2. ai        — one cheap chat call: caption → 2 short inviting candidates
 *   3. caption   — a later caption sentence (never the opening thought)
 *   4. sample    — catalog slot motto (only when grounded in the caption)
 *
 * The gate is shared by every candidate: complete phrase, not the caption's
 * first thought, traceable to caption or evidence, not a hollow place command.
 * No sector / brand word lists — works for every tenant.
 */

import OpenAI from 'openai';
import { serverConfig } from '@/lib/server-config';
import { getAiModelProfile } from '@/lib/ai-model-tier';
import {
  emitAiCostLine,
  estimateOpenAiUsd,
  type OpenAiUsageLike,
} from '@/lib/ai-cost-telemetry';
import {
  isOpenAiQuotaBlocked,
  isOpenAiQuotaOrBillingError,
  markOpenAiQuotaBlocked,
} from '@/lib/openai-error-utils';
import { resolveLookPromptLanguage } from '@/lib/cta-localization';
import {
  isIncompleteOverlayPhrase,
  isMeaningfulFalOverlayText,
} from '@/lib/fal-caption-headline';
import { overlayHeadlineGroundedInCaption } from '@/lib/overlay-caption-grounding';
import {
  captionOpensWithHeadline,
  deriveHeadlineFromCaption,
  isCaptionMetaLine,
  FEED_MOTTO_BOX,
  isEmptyPlaceCommand,
  lockFeedCardCopy,
  type FeedPhotoRole,
  type FeedShellDirection,
} from '@/lib/feed-slot-pack';
import { resolveSlotSampleCopy } from '@/lib/slot-sample-copy';

export type HeadlineSource = 'hint' | 'ai' | 'caption' | 'sample' | 'none';

export type HeadlineGateInput = {
  headline: string;
  caption: string;
  evidenceNote?: string;
  brandName?: string;
  photoRole?: FeedPhotoRole | null;
  shellDirection?: FeedShellDirection | null;
};

export type HeadlineWriterInput = {
  caption: string;
  /** Line already proposed upstream (vision look / ideation). Used when it passes. */
  hint?: string;
  evidenceNote?: string;
  slotJob?: string;
  catalogSlotKey?: string;
  sector?: string;
  brandName?: string;
  brandTone?: string;
  language?: unknown;
  photoRole?: FeedPhotoRole | null;
  shellDirection?: FeedShellDirection | null;
  /** Test seam / custom generator — returns raw candidate lines. */
  generate?: (prompt: HeadlinePrompt) => Promise<string[]>;
  openai?: OpenAI;
  model?: string;
  missionId?: string | null;
  workspaceId?: string | null;
  slotKey?: string | null;
};

export type HeadlinePrompt = {
  system: string;
  user: string;
  language: string;
};

export type HeadlineWriterResult = {
  headline: string;
  source: HeadlineSource;
  /** Candidates the gate refused, in order tried — for logs / QA. */
  rejected: string[];
};

/** Loose canvas bound — type budget trims further at paint time. */
const HEADLINE_MAX_LEN = 60;
const HEADLINE_MAX_WORDS = 9;

function filled(text: unknown): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function fold(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** First clause, complete sentence, no trailing punctuation / quotes / emoji. */
export function normalizeHeadlineCandidate(raw: string): string {
  const cleaned = filled(raw)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/#\S+/g, '')
    .replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, '')
    .trim();
  if (!cleaned) return '';
  return lockFeedCardCopy({ caption: '', headline: cleaned }).headline;
}

/** Shared gate — every producer's candidate must pass this. */
export function acceptFeedHeadline(input: HeadlineGateInput): boolean {
  const headline = filled(input.headline);
  const caption = filled(input.caption);
  const evidence = filled(input.evidenceNote);
  if (headline.length < 4 || headline.length > HEADLINE_MAX_LEN) return false;
  const words = headline.split(' ').filter(Boolean);
  if (words.length > HEADLINE_MAX_WORDS) return false;
  if (isIncompleteOverlayPhrase(headline)) return false;
  if (!isMeaningfulFalOverlayText(headline)) return false;
  if (isCaptionMetaLine(headline)) return false;
  const brand = fold(input.brandName ?? '');
  if (brand && fold(headline) === brand) return false;
  if (caption.length >= 16) {
    if (captionOpensWithHeadline(caption, headline)) return false;
    if (
      !overlayHeadlineGroundedInCaption(headline, caption)
      && !(evidence && overlayHeadlineGroundedInCaption(headline, evidence))
    ) {
      return false;
    }
  }
  if (isEmptyPlaceCommand(headline, input.photoRole ?? undefined, input.shellDirection ?? undefined)) {
    return false;
  }
  return true;
}

const WRITER_SYSTEM = [
  'You write the single on-canvas line for a social media post.',
  'You receive the final CAPTION (and optional photo EVIDENCE).',
  'Return JSON: {"candidates": ["...", "..."]} with exactly 2 lines.',
  'Rules for every line:',
  `- at most ${FEED_MOTTO_BOX.maxWords} words and ${FEED_MOTTO_BOX.maxLen} characters; complete phrase, no dangling word;`,
  '- warm and inviting, written for the reader, not a label or a category;',
  '- every noun must appear in the CAPTION or EVIDENCE (inflection allowed) — invent nothing;',
  '- must not repeat or start with the first sentence of the CAPTION;',
  '- no brand name, no emoji, no hashtags, no quotes, no trailing period;',
  '- write in the requested language only.',
].join('\n');

export function buildHeadlinePrompt(input: {
  caption: string;
  evidenceNote?: string;
  slotJob?: string;
  brandTone?: string;
  language?: unknown;
}): HeadlinePrompt {
  const language = resolveLookPromptLanguage(input.language);
  const lines = [
    `LANGUAGE: ${language}`,
    input.slotJob ? `SLOT: ${filled(input.slotJob)}` : '',
    input.brandTone ? `TONE: ${filled(input.brandTone).slice(0, 160)}` : '',
    `CAPTION:\n${filled(input.caption).slice(0, 700)}`,
    input.evidenceNote ? `EVIDENCE:\n${filled(input.evidenceNote).slice(0, 300)}` : '',
  ].filter(Boolean);
  return { system: WRITER_SYSTEM, user: lines.join('\n\n'), language };
}

function parseCandidates(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as { candidates?: unknown; headline?: unknown };
    const list = Array.isArray(parsed.candidates)
      ? parsed.candidates
      : typeof parsed.headline === 'string'
        ? [parsed.headline]
        : [];
    return list.filter((v): v is string => typeof v === 'string');
  } catch {
    return [];
  }
}

async function generateWithOpenAi(
  prompt: HeadlinePrompt,
  input: HeadlineWriterInput,
): Promise<string[]> {
  const apiKey = serverConfig.openai.apiKey;
  if (!apiKey && !input.openai) return [];
  if (!input.openai && isOpenAiQuotaBlocked()) return [];
  const model = input.model ?? getAiModelProfile().chatStandard;
  const openai = input.openai ?? new OpenAI({ apiKey, timeout: 20_000, maxRetries: 0 });
  try {
    const response = await openai.chat.completions.create({
      model,
      max_tokens: 80,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
    });
    const usage: OpenAiUsageLike | null = response.usage ?? null;
    emitAiCostLine({
      callType: 'creative_director',
      usd: estimateOpenAiUsd(model, usage),
      provider: 'openai',
      model,
      missionId: input.missionId,
      workspaceId: input.workspaceId,
      slotKey: input.slotKey,
      promptTokens: usage?.prompt_tokens ?? undefined,
      completionTokens: usage?.completion_tokens ?? undefined,
      detail: 'headline_writer',
    });
    return parseCandidates(response.choices[0]?.message?.content?.trim() ?? '{}');
  } catch (err) {
    if (isOpenAiQuotaOrBillingError(err)) markOpenAiQuotaBlocked();
    return [];
  }
}

/**
 * Decide the headline for a finished caption. Never throws; `headline: ''`
 * with `source: 'none'` means the slot must not open.
 */
export async function writeFeedHeadline(input: HeadlineWriterInput): Promise<HeadlineWriterResult> {
  const caption = filled(input.caption);
  const rejected: string[] = [];
  const gate = (candidate: string): string => {
    const line = normalizeHeadlineCandidate(candidate);
    if (!line) return '';
    const ok = acceptFeedHeadline({
      headline: line,
      caption,
      evidenceNote: input.evidenceNote,
      brandName: input.brandName,
      photoRole: input.photoRole,
      shellDirection: input.shellDirection,
    });
    if (!ok) rejected.push(line);
    return ok ? line : '';
  };

  const hint = gate(input.hint ?? '');
  if (hint) return { headline: hint, source: 'hint', rejected };

  if (caption.length >= 16) {
    const prompt = buildHeadlinePrompt(input);
    const raw = input.generate
      ? await input.generate(prompt).catch(() => [] as string[])
      : await generateWithOpenAi(prompt, input);
    for (const candidate of raw.slice(0, 3)) {
      const line = gate(candidate);
      if (line) return { headline: line, source: 'ai', rejected };
    }

    const derived = gate(deriveHeadlineFromCaption(caption));
    if (derived) return { headline: derived, source: 'caption', rejected };
  }

  const sample = resolveSlotSampleCopy({
    catalogSlotKey: input.catalogSlotKey,
    slotLabel: input.slotJob,
    sector: input.sector,
    language: typeof input.language === 'string' ? input.language : undefined,
    showSubline: false,
  }).headline;
  const sampled = gate(sample);
  if (sampled) return { headline: sampled, source: 'sample', rejected };

  return { headline: '', source: 'none', rejected };
}
