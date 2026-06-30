import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import { serverConfig } from '@/lib/server-config';
import {
  resolveStoryTtsVoiceId,
  storyVoicePreviewScript,
  type StoryTtsVoiceId,
} from './story-voice-catalog';

const VOICEOVER_SERVE_DIR = '/tmp/remotion-serve';

/** Remotion story = 8s; voice starts ~0.55s, ends ~0.85s before cut. */
const STORY_VOICE_WINDOW_SEC = 8 - 0.55 - 0.85;
/** Turkish conversational pace at natural TTS speed (~10–11 char/s). */
const NATURAL_CHARS_PER_SEC = 10.5;

function remotionServeBaseUrl(): string {
  return (process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function maxScriptChars(): number {
  const computed = Math.round(STORY_VOICE_WINDOW_SEC * NATURAL_CHARS_PER_SEC);
  const raw = Number(process.env.STORY_VOICEOVER_MAX_CHARS ?? computed);
  if (!Number.isFinite(raw) || raw < 40) return computed;
  return Math.min(160, Math.max(40, Math.round(raw)));
}

function cleanSpeechText(raw: string): string {
  return raw
    .replace(/[#@]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[«»""]/g, '"')
    .trim();
}

/** Feed caption → TTS: hashtag/URL/emojiler temizlenir. */
export function captionTextForSpeech(raw: string): string {
  let text = String(raw ?? '');
  text = text.replace(/https?:\/\/\S+/gi, '');
  text = text.replace(/#\w+/g, '');
  text = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '');
  return cleanSpeechText(text);
}

/** Noktalama ve kısa cümleler — OpenAI TTS daha doğal tempo okur. */
export function prepareScriptForNaturalSpeech(raw: string): string {
  let s = cleanSpeechText(raw);
  if (!s) return '';

  s = s.replace(/\s*[-–—]\s*/g, ', ');
  s = s.replace(/;\s*/g, '. ');
  s = s.replace(/\s*:\s*/g, ', ');
  s = s.replace(/\s+([.!?…])\s*/g, '$1 ');
  s = s.replace(/\.{2,}/g, '.');
  s = s.replace(/\s{2,}/g, ' ');

  // Uzun virgülsüz blokları iki kısa cümleye böl (TTS nefes arası)
  if (s.length > 72 && !s.includes(',')) {
    const mid = s.lastIndexOf(' ', Math.floor(s.length * 0.55));
    if (mid > 28) {
      const left = s.slice(0, mid).trim();
      const right = s.slice(mid).trim();
      if (right.length > 8) {
        s = `${left.replace(/[.!?…]$/, '')}. ${right}`;
      }
    }
  }

  if (s && !/[.!?…]$/.test(s)) s = `${s}.`;
  return s.trim();
}

function truncateScript(script: string, max = maxScriptChars()): string {
  const prepared = prepareScriptForNaturalSpeech(script);
  if (prepared.length <= max) return prepared;

  const cut = prepared.slice(0, max);
  const sentenceEnd = cut.match(/^[\s\S]*[.!?…](?:\s|$)/);
  if (sentenceEnd?.[0] && sentenceEnd[0].trim().length >= 28) {
    return sentenceEnd[0].trim();
  }
  const wordTrimmed = cut.replace(/\s+\S*$/, '').trim();
  return wordTrimmed.endsWith('.') ? wordTrimmed : `${wordTrimmed}.`;
}

/**
 * OpenAI TTS speed — doğal konuşma; asla hızlandırma (eski 1.22x robotik okuma yapıyordu).
 * STORY_TTS_SPEED: 0.85–1.0 (varsayılan 0.92).
 */
function resolveTtsSpeed(): number {
  const raw = Number(process.env.STORY_TTS_SPEED ?? 0.92);
  if (!Number.isFinite(raw)) return 0.92;
  return Math.min(1.0, Math.max(0.85, raw));
}

// ─── Ad-copy rewrite rules (Sprint 5) ────────────────────────────────────────
// Feed captions are written for social scrollers, not voice.
// These rules convert them into punchy, natural-sounding ad copy.

/** Filler openers that weaken a voiceover — strip and rebuild from real content. */
const FILLER_OPENER_RE =
  /^(?:bu\s+hafta[,!]?\s*|artık[,!]?\s*|sizlerle[,!]?\s*|sizinle[,!]?\s*|merhaba[!,]?\s*|hey[!,]?\s*|herkese[,!]?\s*|müjde[!,]?\s*|haberdar\s+olun[.!]?\s*|takipçilerimize[,!]?\s*|önemli\s+duyuru[!.]?\s*|duyuru[!:]?\s*)/i;

/** Words / phrases that signal copy written for social text, not for ears. */
const VISUAL_ONLY_RE =
  /(?:👇|🔗|link in bio|linktree|swipe up|story'ye bak|profilimizdeki bağlantı|aşağıdaki linke|bio'daki)/gi;

/**
 * Rewrites a feed caption into ad-copy suitable for a 6–7 second voiceover.
 *
 * Rules:
 * 1. Strip filler openers and visual-only references.
 * 2. Pick the most concrete, emotionally loaded sentence to open with.
 * 3. Maximum 2–3 short sentences, each ≤ 12 words.
 * 4. Prefer active verbs, sensory language, and specifics over adjectives.
 * 5. Never start with the brand name or a question unless the caption does.
 */
export function rewriteCaptionAsAdCopy(
  raw: string,
  opts?: {
    maxChars?: number;
    sequenceRole?: 'hook' | 'proof' | 'cta';
    ctaHint?: string;
  },
): string {
  let text = captionTextForSpeech(raw);
  text = text.replace(VISUAL_ONLY_RE, '').replace(FILLER_OPENER_RE, '').trim();
  if (!text) return '';

  // Split into sentences, keep short ones, discard visual-only sentences.
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8 && s.split(/\s+/).length <= 14);

  if (!sentences.length) return truncateScript(text, opts?.maxChars);

  // CTA role: end with the ctaHint sentence if provided.
  const ctaHint = opts?.ctaHint?.trim();
  const selected: string[] = [];

  // Hook role: lead with the most concrete/sensory sentence.
  // For other roles: keep sentence order.
  const body = sentences.slice(0, opts?.sequenceRole === 'hook' ? 2 : 3);
  selected.push(...body);

  const joined = selected.join('. ').replace(/\.{2,}/g, '.').trim();
  const withPunct = joined.endsWith('.') || joined.endsWith('!') || joined.endsWith('?')
    ? joined
    : `${joined}.`;

  // For CTA role: guarantee ctaHint survives by appending AFTER truncation of the body.
  // Truncating body+ctaHint together would silently drop the action phrase.
  if (ctaHint && opts?.sequenceRole === 'cta') {
    const bodyTruncated = truncateScript(withPunct, opts?.maxChars ?? 100);
    const full = `${bodyTruncated.replace(/[.!?]$/, '')}. ${ctaHint}.`;
    return full.replace(/\.{2,}/g, '.').trim();
  }

  return truncateScript(withPunct, opts?.maxChars);
}

/**
 * Story TTS metni — öncelik: mission/Feed caption (voiceoverScript veya caption).
 * Sprint 5: caption önce ad-copy rewrite'a girer; kısa headline yalnızca hiçbir
 * kaynak yoksa kullanılır.
 */
export function buildStoryVoiceoverScript(input: {
  brandName?: string;
  headline?: string;
  subtitle?: string;
  caption?: string;
  voiceoverScript?: string;
  locale?: string;
  sequenceRole?: 'hook' | 'proof' | 'cta';
  ctaHint?: string;
}): string {
  // 1. Explicit voiceover script overrides everything (produced by buildStorySequenceMicrocopy).
  const explicit = captionTextForSpeech(input.voiceoverScript ?? '');
  if (explicit.length >= 12) {
    return rewriteCaptionAsAdCopy(explicit, {
      sequenceRole: input.sequenceRole,
      ctaHint: input.ctaHint,
    });
  }

  // 2. Feed caption: rewrite as ad copy before TTS.
  const caption = captionTextForSpeech(input.caption ?? '');
  if (caption.length >= 12) {
    return rewriteCaptionAsAdCopy(caption, {
      sequenceRole: input.sequenceRole,
      ctaHint: input.ctaHint,
    });
  }

  // 3. Fallback: headline + subtitle (no brand name prefix — sounds robotic).
  const headline = cleanSpeechText(input.headline ?? '');
  const subtitle = captionTextForSpeech(input.subtitle ?? '');

  const script = cleanSpeechText(
    subtitle ? `${headline}. ${subtitle}` : headline,
  );
  return script ? truncateScript(script) : '';
}

function defaultTtsModel(): string {
  const env = process.env.STORY_TTS_MODEL?.trim();
  if (env) return env;
  return 'tts-1-hd';
}

export function isStoryVoiceoverEnabled(): boolean {
  if (process.env.STORY_VOICEOVER_ENABLE === 'false') return false;
  return serverConfig.openai.configured;
}

/**
 * OpenAI TTS → /tmp/remotion-serve MP3.
 * playbackUrl = HTTP (UI önizleme); render route ayrı port üzerinden servis eder.
 */
async function synthesizeSpeechMp3(input: {
  script: string;
  locale: string;
  voice: StoryTtsVoiceId;
  filename: string;
}): Promise<{ filePath: string; playbackUrl: string } | null> {
  const script = prepareScriptForNaturalSpeech(input.script);
  if (!script || !isStoryVoiceoverEnabled()) return null;

  const apiKey = serverConfig.openai.requireApiKey();
  const openai = new OpenAI({ apiKey });
  const speed = resolveTtsSpeed();

  const response = await openai.audio.speech.create({
    model: defaultTtsModel(),
    voice: input.voice,
    input: script,
    speed,
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(VOICEOVER_SERVE_DIR, { recursive: true });
  const filePath = path.join(VOICEOVER_SERVE_DIR, input.filename);
  fs.writeFileSync(filePath, buffer);

  return {
    filePath,
    playbackUrl: `${remotionServeBaseUrl()}/api/remotion/voiceover/${input.filename}`,
  };
}

export async function generateStoryVoiceoverFile(input: {
  script: string;
  locale?: string;
  voiceId?: string | null;
}): Promise<{ filePath: string; playbackUrl: string; script: string; voiceId: StoryTtsVoiceId } | null> {
  const locale = String(input.locale ?? 'tr').toLowerCase();
  const voice = resolveStoryTtsVoiceId(input.voiceId, locale);
  const script = truncateScript(captionTextForSpeech(input.script));
  if (!script) return null;

  const filename = `story-vo-${randomUUID()}.mp3`;
  const audio = await synthesizeSpeechMp3({ script, locale, voice, filename });
  if (!audio) return null;

  return {
    ...audio,
    script,
    voiceId: voice,
  };
}

/** Marka ayarları — sabit örnek metin, dosya cache */
export async function generateStoryVoicePreviewFile(input: {
  voiceId: string;
  locale?: string;
}): Promise<{ filePath: string; playbackUrl: string; script: string; voiceId: StoryTtsVoiceId } | null> {
  const locale = String(input.locale ?? 'tr').toLowerCase();
  const voice = resolveStoryTtsVoiceId(input.voiceId, locale);
  const script = storyVoicePreviewScript(locale);
  const filename = `story-vo-preview-${voice}-natural.mp3`;
  const filePath = path.join(VOICEOVER_SERVE_DIR, filename);

  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 1000) {
    return {
      filePath,
      playbackUrl: `${remotionServeBaseUrl()}/api/remotion/voiceover/${filename}`,
      script,
      voiceId: voice,
    };
  }

  const audio = await synthesizeSpeechMp3({ script, locale, voice, filename });
  if (!audio) return null;
  return { ...audio, script, voiceId: voice };
}

export function safeUnlinkStoryVoiceover(filePath: string | undefined): void {
  if (!filePath) return;
  try {
    const resolved = path.resolve(filePath);
    const serveRoot = path.resolve(VOICEOVER_SERVE_DIR);
    if (!resolved.startsWith(serveRoot)) return;
    fs.unlinkSync(resolved);
  } catch {
    /* temp cleanup best-effort */
  }
}
