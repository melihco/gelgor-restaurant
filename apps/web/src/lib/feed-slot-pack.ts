import {
  isIncompleteOverlayPhrase,
  isMeaningfulFalOverlayText,
  keepCompleteOverlaySentence,
} from '@/lib/fal-caption-headline';
import { overlayHeadlineGroundedInCaption } from '@/lib/overlay-caption-grounding';

/**
 * Faz 1 — bir vitrin kartının tek kağıdı.
 *
 * Boyama ve şablon yalnız okur. Boş alan = paket yok = kart yok.
 * Marka / sektör kelime listesi yok. Plajdaki yazısız şişe ile
 * dükkandaki etiketli şişe aynı form: foto rolü + kanıt notu.
 *
 * Faz 2 bakış doldurur. Faz 3 kabuk yalnız okur. Yazı kanıttan gelir.
 */

export type FeedPhotoRole =
  | 'product_for_sale'
  | 'table_prop'
  | 'venue'
  | 'people'
  | 'scene_fill';

export type FeedShellDirection =
  | 'product_hero'
  | 'venue_ambiance'
  | 'social_proof'
  | 'event';

export type FeedSlotPack = {
  /** Bu kartın işi — kısa, insani (ör. “hafta sonu yer ayırt”). */
  slotJob: string;
  photoUrl: string;
  photoRole: FeedPhotoRole;
  caption: string;
  headline: string;
  shellDirection: FeedShellDirection;
  /**
   * Bu fotoğrafın kanıtladığı şey. Etiket metni, “yazı yok, masa dekoru”,
   * “gün batımı iskele”. Boş olamaz.
   */
  evidenceNote: string;
};

export type FeedSlotPackIssue =
  | 'missing_slot_job'
  | 'missing_photo'
  | 'missing_caption'
  | 'missing_headline'
  | 'missing_evidence'
  | 'headline_not_from_caption'
  | 'prop_cannot_sell'
  | 'product_needs_identity'
  | 'place_cannot_sell'
  | 'copy_misses_evidence'
  | 'invented_product_claim'
  | 'incoherent_pack'
  | 'empty_place_command';

const PHOTO_ROLES = new Set<FeedPhotoRole>([
  'product_for_sale',
  'table_prop',
  'venue',
  'people',
  'scene_fill',
]);

const SHELLS = new Set<FeedShellDirection>([
  'product_hero',
  'venue_ambiance',
  'social_proof',
  'event',
]);

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

function filled(text: string | undefined): string {
  return String(text ?? '').trim();
}

/**
 * Satılık ürün: kanıtta kimlik durmalı. Etiket şart değil —
 * “tezgahda somun, yazı yok” geçer; yalnız “yazı yok” geçmez.
 */
function foldJob(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** İş yer/alan (çim, şemsiye, şezlong) — satılık ürün kabuğuna kapanır. */
export function slotJobIsPlaceNotSell(slotJob: string): boolean {
  const j = foldJob(slotJob);
  if (!j) return false;
  const place = /\b(cim|semsiye|sezlong|ambiyans|ambiance|venue|daybed|sunset|gun batimi|plaj|bahce|lawn|lounger|umbrella|sunbed|teras)\b/.test(j);
  const sell = /\b(urun|product|sepet|gift|hero|batch|sku)\b/.test(j);
  return place && !sell;
}

export function productIdentityInEvidence(evidence: string): boolean {
  const identity = fold(evidence)
    .replace(/\b(yaz yok|yazi yok|no label|unlabeled|etiket yok|masa dekoru|table decor|belirsiz|unclear)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return identity.length >= 4;
}

/** Dergi mottosu — feed kutusu. Yazı buraya sığacak şekilde doğar. */
export const FEED_MOTTO_BOX = { maxWords: 4, maxLen: 36 } as const;

export const FEED_PUNCHLINE_LOCK = 'feed_slot_pack';

function wordList(text: string): string[] {
  return filled(text)
    .replace(/[.!?…]+$/g, '')
    .split(/\s+/)
    .map((word) => word.replace(/[,:;]+$/g, ''))
    .filter(Boolean);
}

function completeMottoOrShorter(text: string): string {
  let words = wordList(text);
  while (words.length >= 2 && isIncompleteOverlayPhrase(words.join(' '))) {
    words = words.slice(0, -1);
  }
  const next = words.join(' ');
  if (next && isMeaningfulFalOverlayText(next) && !isIncompleteOverlayPhrase(next)) {
    return next;
  }
  return text;
}

export function fitHeadlineToMottoBox(headline: string): string {
  const first = filled(headline).split(/[.!?…\n—–]/)[0]?.replace(/[.!?…]+$/g, '').trim() ?? '';
  if (!first) return '';
  const words = wordList(first);
  if (first.length <= FEED_MOTTO_BOX.maxLen && words.length <= FEED_MOTTO_BOX.maxWords + 1) {
    return completeMottoOrShorter(first);
  }
  const clipped: string[] = [];
  for (const word of words) {
    if (clipped.length >= FEED_MOTTO_BOX.maxWords) break;
    const next = [...clipped, word].join(' ');
    if (next.length > FEED_MOTTO_BOX.maxLen) break;
    clipped.push(word);
  }
  return completeMottoOrShorter(clipped.join(' ') || first.slice(0, FEED_MOTTO_BOX.maxLen).trim());
}

export function captionOpensWithHeadline(caption: string, headline: string): boolean {
  const h = fold(headline);
  const first = fold(filled(caption).split(/[.!?…\n]/)[0] ?? '');
  if (h.length < 4 || first.length < 4) return false;
  return first.includes(h) || h.includes(first);
}

/** Headline tam cümle kalır. Caption Instagram gövdesidir — headline yapıştırılmaz. */
export function lockFeedCardCopy(input: {
  caption: string;
  headline: string;
}): { caption: string; headline: string } {
  const first = filled(input.headline).split(/[.!?…\n—–]/)[0]?.replace(/[.!?…]+$/g, '').trim() ?? '';
  const headline = keepCompleteOverlaySentence(first) || first;
  return { caption: filled(input.caption), headline };
}

/** Üst yazı yoksa veya sapmışsa alt yazının ilk cümlesi. Kesilmez. */
export function deriveHeadlineFromCaption(caption: string): string {
  const cut = filled(caption).split(/[.!?…\n]/)[0]?.trim() || filled(caption);
  return keepCompleteOverlaySentence(cut) || cut;
}

/** Üst yazı, alt yazının içinden gelmeli — ayrı slogan yok. */
export function headlineTakenFromCaption(headline: string, caption: string): boolean {
  const h = fold(headline);
  const c = fold(caption);
  if (h.length < 4 || c.length < 8) return false;
  if (c.includes(h)) return true;
  const words = h.split(' ').filter((w) => w.length >= 3);
  if (words.length < 2) return false;
  const hits = words.filter((w) => c.includes(w)).length;
  return hits >= Math.ceil(words.length * 0.7);
}

export function validateFeedSlotPack(
  input: Partial<FeedSlotPack> | null | undefined,
  opts?: { adaptiveScene?: boolean },
): FeedSlotPackIssue[] {
  const p = input ?? {};
  const issues: FeedSlotPackIssue[] = [];
  const slotJob = filled(p.slotJob);
  const photoUrl = filled(p.photoUrl);
  const caption = filled(p.caption);
  const headline = filled(p.headline);
  const evidence = filled(p.evidenceNote);
  const role = p.photoRole;
  const shell = p.shellDirection;

  if (slotJob.length < 4) issues.push('missing_slot_job');
  if (photoUrl.length < 8) issues.push('missing_photo');
  if (caption.length < 16) issues.push('missing_caption');
  if (headline.length < 4) issues.push('missing_headline');
  if (evidence.length < 4) issues.push('missing_evidence');
  if (!role || !PHOTO_ROLES.has(role)) issues.push('missing_photo');
  if (!shell || !SHELLS.has(shell)) issues.push('missing_slot_job');

  if (
    caption.length >= 16
    && headline.length >= 4
    && !overlayHeadlineGroundedInCaption(headline, caption)
    && !overlayHeadlineGroundedInCaption(headline, filled(p.evidenceNote))
  ) {
    issues.push('headline_not_from_caption');
  }

  if (role === 'table_prop' && shell === 'product_hero') {
    issues.push('prop_cannot_sell');
  }
  if (role === 'product_for_sale' && !productIdentityInEvidence(evidence)) {
    issues.push('product_needs_identity');
  }
  if (
    !opts?.adaptiveScene
    && slotJobIsPlaceNotSell(slotJob)
    && (role === 'product_for_sale' || shell === 'product_hero')
  ) {
    issues.push('place_cannot_sell');
  }
  if (
    sellingCopyMissesEvidence({
      caption,
      evidenceNote: evidence,
      photoRole: role,
      shellDirection: shell,
    })
    && !opts?.adaptiveScene
  ) {
    issues.push('copy_misses_evidence');
  }
  if (isEmptyPlaceCommand(headline, role, shell)) {
    issues.push('empty_place_command');
  }

  return [...new Set(issues)];
}

/** Yer kartında iki kelimelik emir slogan (“Gölgede kalın”) paket olmaz. */
export function isEmptyPlaceCommand(
  headline: string,
  role?: FeedPhotoRole | null,
  shell?: FeedShellDirection | null,
): boolean {
  if (role !== 'venue' && shell !== 'venue_ambiance') return false;
  const words = filled(headline).split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 2) return false;
  const last = words[words.length - 1]!.toLocaleLowerCase('tr-TR').replace(/[^a-zçğıöşü]/g, '');
  return /(?:ayın|eyin|uyun|üyün|ın|in|un|ün)$/.test(last);
}

export function parseFeedSlotPack(
  input: Partial<FeedSlotPack> | null | undefined,
  opts?: { adaptiveScene?: boolean },
): { ok: true; pack: FeedSlotPack } | { ok: false; issues: FeedSlotPackIssue[] } {
  const issues = validateFeedSlotPack(input, opts);
  if (issues.length || !input) return { ok: false, issues };
  return {
    ok: true,
    pack: {
      slotJob: filled(input.slotJob),
      photoUrl: filled(input.photoUrl),
      photoRole: input.photoRole as FeedPhotoRole,
      caption: filled(input.caption),
      headline: filled(input.headline),
      shellDirection: input.shellDirection as FeedShellDirection,
      evidenceNote: filled(input.evidenceNote),
    },
    };
}

/** Üretim damgası — bakışlı stillde paket yoksa vitrin gizler. */
export function stampFeedSlotPackMetadata(
  pack: Partial<FeedSlotPack> | null | undefined,
  opts?: { adaptiveScene?: boolean },
): { feed_slot_pack?: FeedSlotPack; feed_slot_pack_ok: boolean } {
  const parsed = parseFeedSlotPack(pack, opts);
  if (parsed.ok) {
    return { feed_slot_pack: parsed.pack, feed_slot_pack_ok: true };
  }
  return { feed_slot_pack_ok: false };
}

/**
 * Vitrin tek kapısı. Damgasız eski kart görünür kalır.
 * `feed_slot_pack_ok === false` veya yarım paket = gizle.
 */
export function isStampedFeedSlotPackVisible(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  if (!meta) return true;
  if (meta.feed_slot_pack_ok === false) return false;
  // Produce already judged the pack (including adaptive restage).
  if (meta.feed_slot_pack_ok === true) return true;
  if (meta.feed_slot_pack == null) return true;
  return parseFeedSlotPack(meta.feed_slot_pack as Partial<FeedSlotPack>).ok;
}

const ISSUE_TR: Record<FeedSlotPackIssue, string> = {
  missing_slot_job: 'Kartın işi boş',
  missing_photo: 'Fotoğraf yok',
  missing_caption: 'Alt yazı yok veya çok kısa',
  missing_headline: 'Üst yazı yok',
  missing_evidence: 'Fotoğrafın kanıt notu boş',
  headline_not_from_caption: 'Üst yazı sahne ve alt yazı iddiasına uymuyor',
  prop_cannot_sell: 'Masadaki dekor, ürün kabuğuna giydirilemez',
  product_needs_identity: 'Satılık ürün dedik ama kanıtta kimlik yok',
  place_cannot_sell: 'Yer/alan işine ürün kabuğu veya satılık sepet giydirilemez',
  copy_misses_evidence: 'Yazı, fotoğrafın kanıtını söylemiyor',
  invented_product_claim: 'Yazı, rafta / etikette olmayan bir ürün söylüyor',
  incoherent_pack: 'Yazı, fotoğraf ve slot aynı işi söylemiyor',
  empty_place_command: 'Yer kartında emir slogan yok',
};

const ROLE_TR: Record<FeedPhotoRole, string> = {
  product_for_sale: 'satılık ürün',
  table_prop: 'masada dekor',
  venue: 'mekan / manzara',
  people: 'insan / yorum',
  scene_fill: 'üretilen sahne (bir kez)',
};

const SHELL_TR: Record<FeedShellDirection, string> = {
  product_hero: 'ürün kabuğu',
  venue_ambiance: 'mekan kabuğu',
  social_proof: 'yorum kabuğu',
  event: 'etkinlik kabuğu',
};

/** İnsan okuması — Faz 1 incelemesi için. */
export function describeFeedSlotPack(pack: FeedSlotPack): string {
  return [
    `İş: ${pack.slotJob}`,
    `Foto: ${ROLE_TR[pack.photoRole]}`,
    `Kanıt: ${pack.evidenceNote}`,
    `Üst yazı: ${pack.headline}`,
    `Alt yazı: ${pack.caption}`,
    `Kabuk: ${SHELL_TR[pack.shellDirection]}`,
  ].join('\n');
}

export function describeFeedSlotPackIssues(issues: FeedSlotPackIssue[]): string {
  return issues.map((id) => ISSUE_TR[id]).join('; ');
}

const STOP = new Set([
  'bir', 'bu', 'su', 've', 'veya', 'ile', 'icin', 'gibi', 'daha', 'cok', 'her',
  'olan', 'olarak', 'var', 'yok', 'yaz', 'yazi', 'etiket', 'etiketlerde', 'yaziyor',
  'icinde', 'arka', 'planda', 'gorunmekte', 'gorunuyor', 'the', 'and', 'for',
  'from', 'with', 'our', 'your', 'this', 'that', 'are', 'was',
]);

const PLACE_BROCHURE = [
  'mukemmel bir yer',
  'dinlendirici',
  'sizi bekliyor',
  'perfect place',
  'relaxing',
  'upcoming events',
  'atmosphere',
  'experience',
  'kesfedin',
];

type PlaceFamily = 'sea' | 'lake';

const PLACE_FAMILY: Record<PlaceFamily, { tokens: string[]; surfaceTr: string; surfaceEn: string }> = {
  sea: {
    tokens: ['deniz', 'sea', 'ocean', 'sahil', 'coast', 'plaj', 'beach', 'dalga', 'wave'],
    surfaceTr: 'deniz',
    surfaceEn: 'sea',
  },
  lake: {
    tokens: ['gol', 'lake', 'golu', 'golet'],
    surfaceTr: 'göl',
    surfaceEn: 'lake',
  },
};

function tokensOf(text: string): string[] {
  return fold(text).split(' ').filter((w) => w.length >= 3 && !STOP.has(w));
}

/** Etiket + özne — uzun açıklama yok (rastgele kelime envanter sayılmaz). */
export function galleryInventoryText(
  galleryMeta?: Record<string, {
    visibleLabelText?: string;
    primarySubject?: string;
    subjectAliases?: string[];
    contentTags?: string[];
  } | undefined> | null,
): string {
  if (!galleryMeta) return '';
  const parts: string[] = [];
  for (const meta of Object.values(galleryMeta)) {
    if (!meta) continue;
    parts.push(
      String(meta.visibleLabelText ?? ''),
      String(meta.primarySubject ?? ''),
      ...(meta.subjectAliases ?? []),
      ...(meta.contentTags ?? []),
    );
  }
  return parts.filter((p) => p.trim()).join(' ');
}

function tokenSet(text: string): Set<string> {
  return new Set(tokensOf(text));
}

function covers(token: string, allowed: Set<string>): boolean {
  if (allowed.has(token)) return true;
  for (const a of allowed) {
    if (a.length < 4 || token.length < 4) continue;
    if (a.startsWith(token) || token.startsWith(a)) return true;
  }
  return false;
}

function quotedEvidenceLabels(evidence: string): string[] {
  const out: string[] = [];
  const rx = /['‘’“”"]([^'‘’“”"]{3,80})['‘’“”"]/g;
  let match: RegExpExecArray | null = rx.exec(evidence);
  while (match) {
    const captured = match[1];
    if (!captured) {
      match = rx.exec(evidence);
      continue;
    }
    const phrase = captured.replace(/\s+/g, ' ').trim();
    if (phrase.length >= 3) out.push(phrase);
    match = rx.exec(evidence);
  }
  return out;
}

function prettyPhrase(text: string): string {
  const body = text.replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr-TR');
  if (!body) return '';
  return body.charAt(0).toLocaleUpperCase('tr-TR') + body.slice(1);
}

function joinTr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} ve ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} ve ${items[items.length - 1]}`;
}

function looksEnglishCopy(text: string): boolean {
  return /\b(the|with|our|your|this|weekend|events?|sea|lake)\b/i.test(text)
    && !/(ve|icin|ile|bir|deniz|gol|cim|semsiye)/i.test(fold(text));
}

function placeFamilyIn(text: string): PlaceFamily | null {
  const bag = tokenSet(text);
  if (PLACE_FAMILY.sea.tokens.some((t) => bag.has(t))) return 'sea';
  if (PLACE_FAMILY.lake.tokens.some((t) => bag.has(t))) return 'lake';
  return null;
}

function swapLakeToSea(text: string, english: boolean): string {
  const sea = english ? 'sea' : 'deniz';
  const cap = sea.charAt(0).toLocaleUpperCase(english ? 'en' : 'tr-TR') + sea.slice(1);
  return text
    .replace(/\bgölün\b/giu, english ? "sea's" : 'denizin')
    .replace(/\bgölde\b/giu, english ? 'at sea' : 'denizde')
    .replace(/\bgöle\b/giu, english ? 'sea' : 'denize')
    .replace(/\bgölü\b/giu, english ? 'sea' : 'denizi')
    .replace(/\bgöl\b/giu, (m) => (m.charAt(0) === m.charAt(0).toLocaleUpperCase('tr-TR') ? cap : sea))
    .replace(/\blakes?\b/gi, 'sea');
}

function isPlacePack(input: {
  slotJob: string;
  photoRole?: FeedPhotoRole;
  shellDirection?: FeedShellDirection;
}): boolean {
  return slotJobIsPlaceNotSell(input.slotJob)
    || input.photoRole === 'venue'
    || input.shellDirection === 'venue_ambiance';
}

function isBrochurePlaceCopy(text: string): boolean {
  const f = fold(text);
  return PLACE_BROCHURE.some((stem) => f.includes(fold(stem)));
}

function evidenceClaimTokens(evidence: string): string[] {
  const quoted = quotedEvidenceLabels(evidence);
  const source = quoted.length ? quoted.join(' ') : evidence;
  return tokensOf(source).filter((w) => w.length >= 4);
}

function tokenHitsCaption(captionFold: string, token: string): boolean {
  if (captionFold.includes(token)) return true;
  return captionFold.split(' ').some((w) => covers(w, new Set([token])));
}

function labelsSupportedByCaption(caption: string, labels: string[]): number {
  const cap = fold(caption);
  const freq = new Map<string, number>();
  for (const label of labels) {
    for (const part of fold(label).split(' ').filter((w) => w.length >= 4 && !STOP.has(w))) {
      freq.set(part, (freq.get(part) ?? 0) + 1);
    }
  }
  let supported = 0;
  for (const label of labels) {
    const parts = fold(label).split(' ').filter((w) => w.length >= 4 && !STOP.has(w));
    const unique = parts.filter((p) => (freq.get(p) ?? 0) === 1);
    const check = unique.length ? unique : parts;
    if (!check.length) continue;
    const hits = check.filter((p) => tokenHitsCaption(cap, p)).length;
    const need = check.length >= 3 ? 2 : 1;
    if (hits >= need) supported += 1;
  }
  return supported;
}

/**
 * Satılık kart: yazı kanıttaki kimliği taşımalı.
 * Tek ortak aile kelimesi (ör. zeytinyağı) yetmez — kanıtın çoğunluğu
 * yazıda durmalı. Yağ / hasat sözlüğü yok.
 */
export function sellingCopyMissesEvidence(input: {
  caption: string;
  evidenceNote: string;
  photoRole?: FeedPhotoRole;
  shellDirection?: FeedShellDirection;
}): boolean {
  const selling = input.photoRole === 'product_for_sale' || input.shellDirection === 'product_hero';
  if (!selling) return false;
  const scene = fold(input.caption);
  if (
    scene.includes('uretim')
    || scene.includes('is basi')
    || scene.includes('isbasi')
    || scene.includes('behind the scenes')
    || scene.includes('workshop')
    || scene.includes('atolye')
  ) {
    return false;
  }
  const labels = quotedEvidenceLabels(input.evidenceNote);
  if (labels.length) {
    return labelsSupportedByCaption(input.caption, labels) === 0;
  }
  const claims = evidenceClaimTokens(input.evidenceNote);
  if (claims.length === 0) return false;
  const cap = fold(input.caption);
  const hits = claims.filter((t) => tokenHitsCaption(cap, t)).length;
  const need = claims.length >= 3 ? 2 : 1;
  return hits < need;
}

function compactQuotedLabels(labels: string[]): string[] {
  const pretty = labels.map(prettyPhrase).filter(Boolean);
  if (pretty.length < 2) return pretty;
  const first = pretty[0] ?? '';
  const lead = first.split(' ')[0] ?? '';
  if (!lead || !pretty.every((p) => fold(p).startsWith(fold(lead)))) return pretty;
  return pretty.map((p, i) => (i === 0 ? p : prettyPhrase(p.slice(lead.length))));
}

function productSubjectAndRest(labels: string[]): { subject: string; rest: string } {
  const compact = compactQuotedLabels(labels);
  if (!compact.length) return { subject: '', rest: '' };
  const head = compact[0] ?? '';
  const lead = head.split(/\s+/).filter(Boolean);
  const subject = prettyPhrase(
    lead.length >= 3 ? lead.slice(1, 3).join(' ') : head,
  );
  const rest = compact.slice(1).map((phrase) => {
    const words = phrase.split(/\s+/).filter(Boolean);
    return prettyPhrase(words.slice(-2).join(' '));
  }).filter(Boolean);
  return { subject, rest: joinTr(rest) };
}

function rebuildProductCaption(evidence: string, _slotJob: string): string {
  const labels = quotedEvidenceLabels(evidence);
  const { subject, rest } = productSubjectAndRest(labels);
  if (subject) {
    return rest ? `${prettyPhrase(subject)}. ${prettyPhrase(rest)}.` : `${prettyPhrase(subject)}.`;
  }
  const phrases = evidence
    .split(/[,.]/)
    .map((part) => prettyPhrase(part.replace(/\b(etiketlerde|etiket|yazıyor|yaziyor|bir|içinde|icinde|var)\b/gi, ' ')))
    .filter((part) => fold(part).length >= 6)
    .slice(0, 2);
  if (phrases.length) return `${phrases.join('. ')}.`;
  return `${prettyPhrase(evidence.slice(0, 48))}.`;
}

function isPlaceInventoryCopy(text: string): boolean {
  const f = fold(text);
  const furn = ['cim', 'semsiye', 'sezlong', 'lounger', 'umbrella', 'lawn', 'daybed', 'sunbed']
    .filter((token) => f.includes(token));
  return furn.length >= 2;
}

function rebuildPlaceCaption(input: {
  evidenceNote: string;
  slotJob: string;
  photoSideText?: string;
}): string {
  const blob = `${input.photoSideText ?? ''} ${input.slotJob} ${input.evidenceNote}`;
  const english = looksEnglishCopy(blob);
  const family = placeFamilyIn(blob);
  if (family === 'sea') {
    return english ? 'The sea is still. The pier holds.' : 'Deniz duruyor. İskele yerinde.';
  }
  if (family === 'lake') {
    return english ? 'The water is still. The edge is open.' : 'Su duruyor. Kenar açık.';
  }
  return english ? 'The place is open. The ground holds.' : 'Alan açık. Yer duruyor.';
}

export type FeedSlotCopyGroundInput = {
  slotJob: string;
  photoRole?: FeedPhotoRole;
  shellDirection?: FeedShellDirection;
  evidenceNote: string;
  caption: string;
  headline: string;
  /** Haftalık fikir — kopyalanmaz; kanıtta yoksa düşer. */
  ideationHint?: string;
  /** Foto tarafı: aday açıklama / etiket / özne. Model kanıtı değil. */
  photoSideText?: string;
};

/**
 * Üst/alt yazı kanıttan. Fikir cümlesi ve uydurma yer adı (göl vs deniz)
 * düşer. Yağ / hasat sözlüğü yok — etiket ve foto tarafı yeter.
 */
export function groundFeedSlotCopy(input: FeedSlotCopyGroundInput): {
  evidenceNote: string;
  caption: string;
  headline: string;
  changed: boolean;
} {
  let evidenceNote = filled(input.evidenceNote);
  let caption = filled(input.caption);
  let headline = filled(input.headline);
  const start = `${evidenceNote}\n${caption}\n${headline}`;

  const authority = placeFamilyIn(`${input.photoSideText ?? ''} ${input.slotJob}`);
  if (authority === 'sea') {
    const english = looksEnglishCopy(`${caption} ${headline} ${input.photoSideText ?? ''}`);
    evidenceNote = swapLakeToSea(evidenceNote, english);
    caption = swapLakeToSea(caption, english);
    headline = swapLakeToSea(headline, english);
  }

  if (sellingCopyMissesEvidence({ ...input, caption, evidenceNote })) {
    caption = rebuildProductCaption(evidenceNote, input.slotJob);
    headline = deriveHeadlineFromCaption(caption);
  } else if (
    isPlacePack(input)
    && (
      isBrochurePlaceCopy(caption)
      || isPlaceInventoryCopy(caption)
      || (authority === 'sea' && /\bgöl\b/i.test(input.caption))
    )
  ) {
    caption = rebuildPlaceCaption({
      evidenceNote,
      slotJob: input.slotJob,
      photoSideText: input.photoSideText,
    });
    headline = deriveHeadlineFromCaption(caption);
  } else if (
    caption.length >= 16
    && (
      !headline
      || isIncompleteOverlayPhrase(headline)
      || (
        !overlayHeadlineGroundedInCaption(headline, caption)
        && !overlayHeadlineGroundedInCaption(headline, evidenceNote)
      )
    )
  ) {
    headline = deriveHeadlineFromCaption(caption);
  }

  const locked = lockFeedCardCopy({ caption, headline });
  caption = locked.caption;
  headline = locked.headline;

  const changed = start !== `${evidenceNote}\n${caption}\n${headline}`;
  return { evidenceNote, caption, headline, changed };
}
