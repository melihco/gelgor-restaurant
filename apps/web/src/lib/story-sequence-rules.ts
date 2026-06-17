export type StorySequenceRole = 'hook' | 'proof' | 'cta';

/** Brand language fallback to avoid ambiguity. */
type BrandLang = 'en' | 'tr';

// Generic CTA phrases to strip from subtitle/voiceover in non-CTA roles.
const CTA_STRIP_RE =
  /\b(book now|reserve now|reserve your spot|order now|get in touch|follow us|join us|view menu|hemen incele|detayları incele|rezervasyon yap|yerini ayırt|sipariş ver|iletişime geç|takip et|bize katıl|menüyü gör|keşfet)\b/gi;

function normalizeLine(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/\s+([.!?,:;])/g, '$1')
    .trim();
}

function firstSentence(raw: string): string {
  const normalized = normalizeLine(raw);
  if (!normalized) return '';
  const match = normalized.match(/^[^.!?]+[.!?]?/);
  return normalizeLine(match?.[0] ?? normalized);
}

function trimWords(raw: string, maxChars: number): string {
  const text = normalizeLine(raw);
  if (text.length <= maxChars) return text;
  const sliced = text.slice(0, maxChars + 1).replace(/\s+\S*$/, '').trim();
  return sliced || text.slice(0, maxChars).trim();
}

function stripCtaCopy(raw: string, ctaText?: string): string {
  let text = normalizeLine(raw);
  if (!text) return '';
  if (ctaText?.trim()) {
    const escaped = ctaText.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(escaped, 'gi'), ' ');
  }
  text = text.replace(CTA_STRIP_RE, ' ');
  return normalizeLine(text);
}

function appendCta(base: string, ctaText?: string): string {
  const cta = normalizeLine(ctaText ?? '');
  const body = normalizeLine(base);
  if (!cta) return body;
  if (!body) return cta;
  if (body.toLowerCase().includes(cta.toLowerCase())) return body;
  return normalizeLine(`${body}. ${cta}`);
}

/** Normalise a brand language string to 'en' | 'tr'. Default: 'tr'. */
function resolveLang(raw: string | undefined): BrandLang {
  if (!raw) return 'tr';
  const s = raw.trim().toLowerCase();
  return s === 'en' || s.startsWith('en-') ? 'en' : 'tr';
}

/** Coerce sector string to lower-case for matching. */
function normSector(sector: string | undefined): string {
  return (sector ?? '').toLowerCase();
}

// ─── Sector-aware category labels ─────────────────────────────────────────────

/**
 * Returns a SHORT (1–2 word) display label for a story card position.
 * Always derived from sector + language — never hardcoded.
 */
export function storySequenceCategoryLabel(
  role: StorySequenceRole,
  sector?: string,
  lang?: string,
): string {
  const s = normSector(sector);
  const isTr = resolveLang(lang) === 'tr';

  if (role === 'hook') {
    if (/restaurant|cafe|bistro|food|dining|kitchen|cuisine/.test(s))
      return isTr ? 'KEŞFEDİN' : 'TASTE';
    if (/beauty|spa|salon|wellness|skin|glow|nails|lash/.test(s))
      return isTr ? 'PARLATIN' : 'GLOW';
    if (/hotel|resort|villa|boutique|stay|accommodation/.test(s))
      return isTr ? 'KAÇIN' : 'ESCAPE';
    if (/bar|night|club|dj|event|concert|venue/.test(s))
      return isTr ? 'BU GECE' : 'TONIGHT';
    if (/fitness|gym|yoga|pilates|sport|crossfit/.test(s))
      return isTr ? 'DÖNÜŞÜN' : 'TRANSFORM';
    if (/retail|shop|store|fashion|apparel|boutique/.test(s))
      return isTr ? 'KEŞFEDİN' : 'DISCOVER';
    if (/real.?estate|property|home|realty/.test(s))
      return isTr ? 'YAŞAM' : 'LIVING';
    if (/agency|saas|b2b|tech|software|digital|startup/.test(s))
      return isTr ? 'BÜYÜYÜN' : 'GROW';
    if (/logistics|cargo|delivery|shipping/.test(s))
      return isTr ? 'HEDEFİNİZE' : 'ON TIME';
    return isTr ? 'KEŞFEDİN' : 'DISCOVER';
  }

  if (role === 'proof') {
    if (/restaurant|cafe|bistro|food|dining|kitchen|cuisine/.test(s))
      return isTr ? 'MENÜ' : 'THE MENU';
    if (/beauty|spa|salon|wellness|skin|glow|nails|lash/.test(s))
      return isTr ? 'SONUÇLAR' : 'RESULTS';
    if (/hotel|resort|villa|boutique|stay|accommodation/.test(s))
      return isTr ? 'DENEYİM' : 'EXPERIENCE';
    if (/bar|night|club|dj|event|concert|venue/.test(s))
      return isTr ? 'ATMOSFER' : 'THE VIBE';
    if (/fitness|gym|yoga|pilates|sport|crossfit/.test(s))
      return isTr ? 'DÖNÜŞÜM' : 'YOUR JOURNEY';
    if (/retail|shop|store|fashion|apparel/.test(s))
      return isTr ? 'KOLEKSİYON' : 'COLLECTION';
    if (/real.?estate|property|home|realty/.test(s))
      return isTr ? 'DETAYLAR' : 'THE DETAILS';
    if (/agency|saas|b2b|tech|software|digital|startup/.test(s))
      return isTr ? 'NASIL ÇALIŞIR' : 'HOW IT WORKS';
    if (/logistics|cargo|delivery|shipping/.test(s))
      return isTr ? 'SÜREÇ' : 'THE PROCESS';
    return isTr ? 'KANIT' : 'PROOF';
  }

  // CTA role
  if (/restaurant|cafe|bistro|food|dining|kitchen|cuisine/.test(s))
    return isTr ? 'REZERVASYON' : 'RESERVE';
  if (/beauty|spa|salon|wellness|skin|glow|nails|lash/.test(s))
    return isTr ? 'RANDEVU AL' : 'BOOK NOW';
  if (/hotel|resort|villa|boutique|stay|accommodation/.test(s))
    return isTr ? 'REZERVASYON' : 'BOOK NOW';
  if (/bar|night|club|dj|event|concert|venue/.test(s))
    return isTr ? 'BİLET AL' : 'GET TICKETS';
  if (/fitness|gym|yoga|pilates|sport|crossfit/.test(s))
    return isTr ? 'KAYDOL' : 'JOIN NOW';
  if (/retail|shop|store|fashion|apparel/.test(s))
    return isTr ? 'ALIŞVERİŞ YAP' : 'SHOP NOW';
  if (/real.?estate|property|home|realty/.test(s))
    return isTr ? 'İLETİŞİME GEÇ' : 'GET IN TOUCH';
  if (/agency|saas|b2b|tech|software|digital|startup/.test(s))
    return isTr ? 'DEMO TALEP ET' : 'GET A DEMO';
  if (/logistics|cargo|delivery|shipping/.test(s))
    return isTr ? 'TEKLİF AL' : 'GET A QUOTE';
  return isTr ? 'HAREKETE GEÇ' : 'ACT NOW';
}

// ─── Sector-aware CTA hint ─────────────────────────────────────────────────────

/**
 * Resolves a brand + sector appropriate CTA hint for the Creative Director.
 * Priority: brand's own ctaText → sector default → language-appropriate generic.
 * NEVER returns a generic instruction like "use a soft action line".
 */
export function resolveSectorCtaHint(
  sector: string | undefined,
  lang: string | undefined,
  ctaText?: string,
): string {
  if (ctaText?.trim()) return ctaText.trim();

  const s = normSector(sector);
  const isTr = resolveLang(lang) === 'tr';

  if (/restaurant|cafe|bistro|food|dining|kitchen|cuisine/.test(s))
    return isTr ? 'Rezervasyon için bizi arayın' : 'Reserve a table';
  if (/beauty|spa|salon|wellness|skin|glow|nails|lash/.test(s))
    return isTr ? 'Randevunuzu alın' : 'Book your session';
  if (/hotel|resort|villa|boutique|stay|accommodation/.test(s))
    return isTr ? 'Uygunluğu kontrol edin' : 'Check availability';
  if (/bar|night|club|dj|event|concert|venue/.test(s))
    return isTr ? 'Yerinizi ayırtın' : 'Reserve your spot';
  if (/fitness|gym|yoga|pilates|sport|crossfit/.test(s))
    return isTr ? 'Ücretsiz deneme dersi alın' : 'Book a free trial';
  if (/retail|shop|store|fashion|apparel/.test(s))
    return isTr ? 'Koleksiyonu keşfedin' : 'Shop the collection';
  if (/real.?estate|property|home|realty/.test(s))
    return isTr ? 'Fiyat listesi için iletişime geçin' : 'Contact us for pricing';
  if (/agency|saas|b2b|tech|software|digital|startup/.test(s))
    return isTr ? 'Demo talep edin' : 'Request a free demo';
  if (/logistics|cargo|delivery|shipping/.test(s))
    return isTr ? 'Hızlı teklif alın' : 'Get a quick quote';

  return isTr ? 'Bize ulaşın' : 'Get in touch';
}

// ─── Sequence role helpers ─────────────────────────────────────────────────────

export function resolveStorySequenceRole(index: number, total: number): StorySequenceRole {
  if (total <= 1) return 'hook';
  if (index <= 0) return 'hook';
  if (index >= total - 1) return 'cta';
  return 'proof';
}

// ─── Story Set Pre-Planner (Sprint 4) ─────────────────────────────────────────

/**
 * A pre-planned assignment for one card in a story set.
 * Resolved BEFORE rendering begins so all cards share a coherent visual arc.
 */
export interface StoryCardPlan {
  index: number;
  role: StorySequenceRole;
  /** Preferred photo tag keywords for gallery matcher (e.g. 'atmosphere' for hook). */
  preferredPhotoTags: string[];
  /** Suggested overlay mood word to keep visual language consistent across the set. */
  sharedMoodWord: string;
  /** Preferred layout intent that differs from siblings to avoid repetition. */
  layoutIntentHint: 'cinematic' | 'editorial' | 'bold' | 'minimal' | 'split';
}

/**
 * Full plan for a story set produced in one mission run.
 * Generated once, before any renders fire, so every card knows its place in the arc.
 */
export interface StorySetPlan {
  cards: StoryCardPlan[];
  /** Single color-grade direction shared across all cards in the set. */
  sharedColorGrade: 'warm' | 'cool' | 'neutral' | 'vibrant';
  /** Narrative arc that the set follows. */
  narrativeArc: 'tease_reveal_convert' | 'problem_solution_cta' | 'scene_proof_action' | 'single_moment';
  /** True when the mood word was extracted from actual content (not default). */
  moodDerived: boolean;
}

/** Extract dominant mood from captions/headlines. */
function deriveMoodWord(headlines: string[], captions: string[], sector: string): string {
  const all = [...headlines, ...captions].join(' ').toLowerCase();

  if (/romantic|cozy|intimate|intimate|samimi|romantik|huzur|dingin/.test(all)) return 'warm';
  if (/energetic|bold|power|strength|güç|enerjik|dinamik/.test(all)) return 'vibrant';
  if (/serene|calm|minimal|clean|sade|minimal|temiz|sessiz/.test(all)) return 'cool';
  if (/luxury|exclusive|premium|elite|lüks|ayrıcalıklı|zarif/.test(all)) return 'neutral';

  const s = sector.toLowerCase();
  if (/fitness|gym|sport/.test(s)) return 'vibrant';
  if (/spa|wellness|hotel/.test(s)) return 'cool';
  if (/restaurant|cafe/.test(s)) return 'warm';
  if (/nightclub|bar|event/.test(s)) return 'vibrant';
  return 'neutral';
}

/** Layout intent rotation to prevent visual monotony across cards. */
const LAYOUT_INTENT_SEQUENCE: StoryCardPlan['layoutIntentHint'][] = [
  'cinematic', 'editorial', 'bold', 'minimal', 'split',
];

/** Photo tag preferences per role (for gallery-photo-matcher boost). */
const PHOTO_TAGS_BY_ROLE: Record<StorySequenceRole, string[]> = {
  hook: ['atmosphere', 'ambiance', 'hero', 'establishing', 'wide', 'dramatic'],
  proof: ['product', 'detail', 'texture', 'close-up', 'process', 'team'],
  cta: ['space', 'invitation', 'entrance', 'friendly', 'welcoming', 'light'],
};

/**
 * Plans the full story set before any renders start.
 * Returns a `StorySetPlan` with per-card role, photo preferences, layout hints,
 * and a shared color grade so all cards feel like one cohesive campaign.
 */
export function planStorySet(candidates: {
  headline: string;
  caption: string;
}[], opts?: {
  sector?: string;
  brandLanguage?: string;
}): StorySetPlan {
  const sector = opts?.sector ?? '';
  const total = candidates.length;

  const headlines = candidates.map((c) => c.headline);
  const captions = candidates.map((c) => c.caption);

  const moodWord = deriveMoodWord(headlines, captions, sector);
  const moodDerived = moodWord !== 'neutral';

  const colorGradeMap: Record<string, StorySetPlan['sharedColorGrade']> = {
    warm: 'warm',
    vibrant: 'vibrant',
    cool: 'cool',
    neutral: 'neutral',
  };
  const sharedColorGrade = colorGradeMap[moodWord] ?? 'neutral';

  const narrativeArc: StorySetPlan['narrativeArc'] =
    total === 1 ? 'single_moment'
    : total === 2 ? 'scene_proof_action'
    : total >= 4 ? 'problem_solution_cta'
    : 'tease_reveal_convert';

  const cards: StoryCardPlan[] = candidates.map((_, i) => {
    const role = resolveStorySequenceRole(i, total);
    return {
      index: i,
      role,
      preferredPhotoTags: PHOTO_TAGS_BY_ROLE[role],
      sharedMoodWord: moodWord,
      layoutIntentHint: LAYOUT_INTENT_SEQUENCE[i % LAYOUT_INTENT_SEQUENCE.length]!,
    };
  });

  return { cards, sharedColorGrade, narrativeArc, moodDerived };
}

// ─── Microcopy builder ─────────────────────────────────────────────────────────

/**
 * Builds role-specific subtitle, voiceover script, and category label.
 * All copy is driven by actual brand content + sector + language context.
 * Zero hardcoded fallback strings — every field derives from brand data.
 */
export function buildStorySequenceMicrocopy(input: {
  headline: string;
  caption: string;
  ctaText?: string;
  eventSubtitle?: string;
  artistName?: string;
  role: StorySequenceRole;
  isEventStory?: boolean;
  sector?: string;
  brandLanguage?: string;
}): {
  subtitle: string;
  voiceoverScript: string;
  categoryLabel: string;
  ctaHint: string;
} {
  const lang = resolveLang(input.brandLanguage);
  const cleanedHeadline = trimWords(input.headline, 42);
  const rawCaption = normalizeLine(input.caption);
  const cleanCaption = stripCtaCopy(rawCaption, input.ctaText);
  const baseStoryLine = firstSentence(cleanCaption || rawCaption || cleanedHeadline);

  // For CTA role: surface the actual CTA text (or a sector-appropriate hint).
  const ctaHint = resolveSectorCtaHint(input.sector, lang, input.ctaText);

  const voiceoverScript =
    input.role === 'cta'
      ? trimWords(appendCta(cleanCaption || baseStoryLine || cleanedHeadline, ctaHint), 140)
      : trimWords(cleanCaption || baseStoryLine || cleanedHeadline, 140);

  let subtitle = '';
  if (input.isEventStory) {
    subtitle = trimWords(
      normalizeLine(input.eventSubtitle || input.artistName || baseStoryLine || cleanedHeadline),
      40,
    );
  } else if (input.role === 'hook') {
    subtitle = trimWords(baseStoryLine || cleanedHeadline, 48);
  } else if (input.role === 'proof') {
    subtitle = trimWords(baseStoryLine || cleanedHeadline, 56);
  } else {
    // CTA: prefer ctaHint over generic caption so the action is clear
    subtitle = trimWords(ctaHint || baseStoryLine || cleanedHeadline, 44);
  }

  // RETENTION #15 — Sprint 6: Subtitle must not duplicate the headline.
  // If subtitle is ≥70% similar to cleanedHeadline, try to derive a different
  // line from a later sentence in the caption so the two text layers add value.
  if (subtitle && cleanedHeadline) {
    const subWords = new Set(subtitle.toLowerCase().split(/\s+/).filter(Boolean));
    const hdWords = cleanedHeadline.toLowerCase().split(/\s+/).filter(Boolean);
    const overlapRatio = hdWords.length
      ? hdWords.filter((w) => subWords.has(w)).length / hdWords.length
      : 0;
    if (overlapRatio >= 0.7) {
      // Try to use the second sentence from the caption.
      const sentences = rawCaption
        .split(/[.!?]+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 10);
      const altSentence = sentences.find((s) => {
        const sWords = new Set(s.toLowerCase().split(/\s+/));
        const alt = hdWords.filter((w) => sWords.has(w)).length / Math.max(hdWords.length, 1);
        return alt < 0.6;
      });
      if (altSentence) {
        const maxLen = input.role === 'hook' ? 48 : input.role === 'proof' ? 56 : 44;
        subtitle = trimWords(altSentence, maxLen);
      }
      // If no alternative found, keep the original subtitle — some overlap is unavoidable.
    }
  }

  return {
    subtitle,
    voiceoverScript,
    categoryLabel: storySequenceCategoryLabel(input.role, input.sector, lang),
    ctaHint,
  };
}
