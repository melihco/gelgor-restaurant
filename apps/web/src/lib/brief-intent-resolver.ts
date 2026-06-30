/**
 * Resolve ad-hoc "New Brief" user input into production-ready copy + scene hints.
 *
 * Example: title "Full Moon" + Story → headline "Full Moon", sceneHint for fal
 * art-director prompts, caption for feed metadata.
 */

export type BriefOutputType = 'story' | 'reel' | 'post';

export interface ResolvedBriefIntent {
  headline: string;
  caption: string;
  sceneHint: string;
  mood?: string;
  strategicPurpose: string;
  visualDirection: string;
}

const METADATA_LINE = /^(çıktı tipi|adet|kampanya|öncelik|output type|count|campaign|priority)\s*:/i;
const PHOTO_BLOCK = /^📷\s*foto/i;

/** Strip form metadata the UI may have appended to description. */
export function stripBriefFormMetadata(raw: string): string {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !METADATA_LINE.test(line) && !PHOTO_BLOCK.test(line) && !line.startsWith('http'))
    .join('\n')
    .trim();
}

const MOOD_RULES: Array<{ mood: string; rx: RegExp }> = [
  { mood: 'warm celebratory', rx: /\b(kutla|celebrat|party|festival|özel|special|launch|açılış)\b/i },
  { mood: 'romantic intimate', rx: /\b(romant|sevgil|love|couple|date|dinner|candle)\b/i },
  { mood: 'calm serene', rx: /\b(sakin|huzur|spa|wellness|calm|peace|soft|yumuşak)\b/i },
  { mood: 'energetic bold', rx: /\b(enerji|bold|güçlü|dynamic|canlı|live|dj|night|gece)\b/i },
  { mood: 'mystical atmospheric', rx: /\b(moon|ay|dolunay|full moon|gece|night|yıldız|star|cosmic)\b/i },
  { mood: 'fresh seasonal', rx: /\b(yaz|summer|kış|winter|bahar|spring|season|sezon)\b/i },
];

function inferMood(text: string): string | undefined {
  for (const rule of MOOD_RULES) {
    if (rule.rx.test(text)) return rule.mood;
  }
  return undefined;
}

function buildSceneHint(title: string, direction: string): string {
  const parts = [title.trim(), direction.trim()].filter(Boolean);
  const core = parts.join(', ');
  if (!core) return title.trim() || 'brand moment';
  return core.slice(0, 160);
}

function defaultCaption(title: string, outputType: BriefOutputType, direction: string): string {
  if (direction.trim()) return direction.trim().slice(0, 500);
  const labels: Record<BriefOutputType, string> = {
    story: 'Instagram story',
    reel: 'Instagram reel',
    post: 'Instagram gönderisi',
  };
  return `${title.trim()} — ${labels[outputType]}`.slice(0, 500);
}

/**
 * Turn raw New Brief form fields into structured production intent.
 */
export function resolveBriefIntent(input: {
  title: string;
  extraDirection?: string;
  outputType: BriefOutputType;
}): ResolvedBriefIntent {
  const headline = input.title.trim();
  const direction = stripBriefFormMetadata(input.extraDirection ?? '');
  const sceneHint = buildSceneHint(headline, direction);
  const mood = inferMood(`${headline} ${direction}`);
  const caption = defaultCaption(headline, input.outputType, direction);

  return {
    headline,
    caption,
    sceneHint,
    mood,
    strategicPurpose: headline,
    visualDirection: sceneHint,
  };
}
