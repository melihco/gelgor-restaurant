/**
 * OpenAI TTS voice catalog — story caption seslendirme.
 * @see https://platform.openai.com/docs/guides/text-to-speech
 */
export type StoryTtsVoiceId =
  | 'nova'
  | 'shimmer'
  | 'onyx'
  | 'echo'
  | 'alloy'
  | 'fable';

export interface StoryVoiceOption {
  id: StoryTtsVoiceId;
  label: string;
  /** Kısa ton açıklaması */
  tone: string;
  gender: 'kadın' | 'erkek' | 'nötr';
  /** Türkçe story için öneri sırası (düşük = daha uygun) */
  trRank: number;
}

export const STORY_VOICE_OPTIONS: StoryVoiceOption[] = [
  {
    id: 'nova',
    label: 'Nova',
    tone: 'Sıcak, doğal ve akıcı — sosyal içerik için en doğal ton',
    gender: 'kadın',
    trRank: 1,
  },
  {
    id: 'shimmer',
    label: 'Shimmer',
    tone: 'Yumuşak, net ve samimi — premium marka hikayeleri',
    gender: 'kadın',
    trRank: 2,
  },
  {
    id: 'onyx',
    label: 'Onyx',
    tone: 'Derin ve güven veren — kurumsal / B2B',
    gender: 'erkek',
    trRank: 3,
  },
  {
    id: 'echo',
    label: 'Echo',
    tone: 'Sakin ve profesyonel — bilgilendirici içerik',
    gender: 'erkek',
    trRank: 4,
  },
  {
    id: 'alloy',
    label: 'Alloy',
    tone: 'Dengeli ve nötr — genel amaçlı',
    gender: 'nötr',
    trRank: 5,
  },
  {
    id: 'fable',
    label: 'Fable',
    tone: 'Hikaye anlatımı — duygusal ve ifadeli',
    gender: 'nötr',
    trRank: 6,
  },
];

const VOICE_SET = new Set<string>(STORY_VOICE_OPTIONS.map((v) => v.id));

export function isStoryTtsVoiceId(id: string): id is StoryTtsVoiceId {
  return VOICE_SET.has(id);
}

export function resolveStoryTtsVoiceId(
  raw: string | undefined | null,
  locale?: string,
): StoryTtsVoiceId {
  const id = String(raw ?? '').trim().toLowerCase();
  if (isStoryTtsVoiceId(id)) return id;
  const loc = String(locale ?? 'tr').toLowerCase();
  if (loc.startsWith('tr')) return 'nova';
  return 'nova';
}

export function storyVoiceLabel(voiceId: string | undefined | null): string {
  const id = resolveStoryTtsVoiceId(voiceId);
  return STORY_VOICE_OPTIONS.find((v) => v.id === id)?.label ?? id;
}

/** Önizleme / demo metni */
export function storyVoicePreviewScript(locale?: string): string {
  const loc = String(locale ?? 'tr').toLowerCase();
  if (loc.startsWith('tr')) {
    return 'Merhaba. Story seslendirmesi doğal tempoda, sakin ve akıcı okunur — tıpkı bir sunucu gibi.';
  }
  return 'Hello. Your story narration uses a calm, natural pace — like a real host, not a rushed read.';
}
