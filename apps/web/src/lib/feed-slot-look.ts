/**
 * Faz 2 — bir kart, bir bakış.
 *
 * Eşleştirici yalnız aday getirir. Bu modül fotoğrafa bir kez bakar,
 * FeedSlotPack doldurur. Uymayınca ikinci bakış / yeniden seçim yok.
 * Marka adı ve çeşit sözlüğü yok.
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
  groundFeedSlotCopy,
  headlineTakenFromCaption,
  parseFeedSlotPack,
  type FeedPhotoRole,
  type FeedShellDirection,
  type FeedSlotPack,
  type FeedSlotPackIssue,
} from '@/lib/feed-slot-pack';
import {
  isIncompleteOverlayPhrase,
  keepCompleteOverlaySentence,
} from '@/lib/fal-caption-headline';
import {
  isAttachableVisionUrl,
  inlineLookVisionDataUris,
  resolveLookVisionUrls,
} from '@/studio/look-urls';
import { keepWeeklySceneCopy } from '@/lib/caption-scene-fit';

export type FeedSlotLookCandidate = {
  url: string;
  visionUrl?: string;
  visibleLabelText?: string;
  description?: string;
  primarySubject?: string;
};

export type LookJobKind = 'sell' | 'place' | 'process' | 'other';

export type FeedSlotLookInput = {
  slotJob: string;
  language?: string;
  brandTone?: string;
  /** Haftalık fikir — ipucu. Kanıt uymuyorsa yok sayılır, kopyalanmaz. */
  ideationHint?: string;
  /** Brand flag: keep weekly scene sentence; restage photo later. */
  adaptiveScene?: boolean;
  /** Katalog anahtarı — iş ailesi (sat / yer / süreç). Marka adı yok. */
  catalogSlotKey?: string;
  candidates: FeedSlotLookCandidate[];
  missionId?: string | null;
  workspaceId?: string | null;
  slotKey?: string | null;
};

export type FeedSlotLookIssue =
  | FeedSlotPackIssue
  | 'look_unavailable'
  | 'look_no_key'
  | 'look_vision_blocked'
  | 'look_call_failed'
  | 'no_pick'
  | 'incomplete_headline';

export type FeedSlotLookResult =
  | { ok: true; pack: FeedSlotPack }
  | { ok: false; issues: FeedSlotLookIssue[] };

const LOOK_MAX_CANDIDATES = 4;

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

const LOOK_SYSTEM = `You pack one social-media feed card. You look at the candidate photos ONCE.

Return STRICT JSON only:
{
  "pickIndex": <int or null>,
  "photoRole": "product_for_sale" | "table_prop" | "venue" | "people" | "scene_fill",
  "evidenceNote": "<what is actually visible>",
  "caption": "<post sentence>",
  "headline": "<must come from the caption>",
  "shellDirection": "product_hero" | "venue_ambiance" | "social_proof" | "event"
}

The picked product, caption, and headline are one pack. They must name the same thing.

job_kind is in the user JSON:
- sell: feature a good or service from the frame. Abstract catalog words (favorite, limited, hero, new, range) do not need to be printed on the photo. Pick a candidate with identity (readable label OR unmistakable product). Write from what you see. Null only if NO candidate has identity.
- place: a place / venue / market / interior / landscape. Pick a place photo and venue_ambiance. A product basket or labeled goods is pickIndex null.
- process: making / at-work / farm / kitchen floor. A shelf product is pickIndex null unless adaptive scene is on.
- other: follow the photo. Null only if you would have to invent identity.

Rules:
- Trust the image over metadata tags when they disagree.
- evidenceNote names what is in the frame. Quote readable label text exactly. If no readable text, say so AND name what you can still identify (loaf, plate, dress, sunset, crowd) or say identity is unclear.
- caption may only claim what evidenceNote supports. Do not invent grades, harvests, origins, product names, or event titles that are not visible.
- ideation_hint is optional weekly intent. If the photo cannot prove it, ignore the hint and write from the photo + slot_job. Do not return null only because the hint does not match.
- Never copy ideation_hint wording unless every claim is visible in the photo. If the hint says a harvest or event the label does not show, drop those words and write from the readable label / what you see.
- Name water only from the frame. Open horizon water, waves, or a coast next to lawn and umbrellas is sea (deniz), not a lake (göl). Say göl/lake only when the water is clearly an enclosed inland lake.
- evidenceNote names what is in the frame (lawn, umbrellas, loungers, sea). Caption is a magazine motto about that place — not a furniture inventory and not brochure filler ("mükemmel bir yer", "dinlendirici", "perfect place").
- Caption and headline are a magazine motto — the opening line of a social caption. Not a shop command ("gelin", "alın"), not a photo description (bottle, basket, label, lawn, umbrella), not a weekly table note ("sofrada", "bu hafta"). Do not use brochure ("sizi bekliyoruz", "keşfedin", "experience", "deneyimlemek").
- Headline is one complete sentence taken from the caption. Do not cut a word or letter to hit a box. Type can shrink later. Caption opens with that same sentence, then one evidence-backed line.
- headline must be taken from the caption (same words). A complete motto, not a two-word product name and not a separate slogan. No hashtags as headline.
- Write caption and headline in the requested language.
- A bottle or glass on a set table at a venue is table_prop unless the photo is clearly a product-for-sale hero (packaging fills the frame).
- table_prop must not use product_hero.
- product_for_sale needs identity in the photo (readable label OR unmistakable product). If identity is unclear, pickIndex null.
- Never use scene_fill when you pick a gallery photo. scene_fill is only for a generated stand-in with no gallery pick.
- Candidates are ordered best-caption-first. Prefer pickIndex 0 unless that photo cannot do the job_kind (no identity on sell, or a bottle on place).
- One look. Do not ask for another photo.`;

const LOOK_SYSTEM_ADAPTIVE = `${LOOK_SYSTEM}

Adaptive scene is ON. A later enhance step may restage the still (setting, light, table). That does not license invented names or grades.
- Product, caption, and headline stay one pack. They must name the same thing.
- On a sell job, pick a candidate with identity even if the weekly scene is not in the frame. Do not return null because the hint describes a setting that enhance can add.
- If a matching place or process photo exists, prefer it over a bottle.
- A labeled product is the right pick when the job is selling that package.
- If ideation_hint is a process / at-work / behind-the-scenes sentence, KEEP that scene sentence as caption and headline.
- evidenceNote still names what is currently in the frame (bottle, label, lawn, grove).
- Place jobs still need a place photo. A bottle cannot prove a shop-interior or lawn job.`;

const SELL_MUST_PICK = `This is a sell job. At least one candidate has readable identity. You must set pickIndex to a candidate with identity. Do not return null because ideation_hint or an abstract catalog word is not printed on the photo. Caption, headline, and the picked product must say the same thing. Write from the visible label / what you see.`;

const PLACE_RE = /ambiance|atmosphere|venue|sunset|market_day|shop_tour|shop_interior|lawn|pier|terrace|garden|atmosfer|pazar|dükkan|dukkan|gün batım|gun batim|çim|cim |şemsiye|semsiye|şezlong/;
const PROCESS_RE = /process|bts|farm_visit|craft|atölye|atolye|üretim|uretim|süreç|surec|kulis|çiftlik|ciftlik|behind/;
const SELL_RE = /hero|favorite|limited|new_arrival|product|range|gift|detail|menu|dish|favori|sınırlı|sinirli|ürün|urun|parti|yelpaze/;

/** Katalog / iş cümlesinden aile — sektör ve marka adı yok. */
export function lookJobKind(input: {
  slotJob?: string;
  catalogSlotKey?: string;
}): LookJobKind {
  const bag = `${input.catalogSlotKey ?? ''} ${input.slotJob ?? ''}`.toLowerCase();
  if (!bag.trim()) return 'other';
  if (PLACE_RE.test(bag)) return 'place';
  if (PROCESS_RE.test(bag)) return 'process';
  if (SELL_RE.test(bag)) return 'sell';
  return 'other';
}

function candidateHasReadableIdentity(candidate: FeedSlotLookCandidate): boolean {
  return String(candidate.visibleLabelText ?? '').trim().length >= 3;
}

export function feedSlotLookEnabled(): boolean {
  return process.env.FEED_SLOT_LOOK !== 'false';
}

/** Kampanya cümle kilit — haftalık pakete karışmaz. */
export function isCampaignSentenceLock(assignment: {
  slot_role?: string;
  pipeline?: string;
  publish_channel?: string;
  catalog_slot_key?: string;
  library_slot_key?: string;
  rationale?: string;
}): boolean {
  if (assignment.publish_channel === 'instagram_campaign') return true;
  if (String(assignment.rationale ?? '').startsWith('ad_hoc_brief')) return true;
  const bag = [
    assignment.slot_role,
    assignment.pipeline,
    assignment.rationale,
  ].join(' ').toLowerCase();
  return /offer_campaign|campaign_offer|campaign_announcement/.test(bag);
}

/** Feed stilleri. Reel ikinci bir hareket hattı — bakış yok. Kampanya ayrı kapı. */
export function shouldLookFeedSlotPack(assignment: {
  slot_role?: string;
  pipeline?: string;
  publish_channel?: string;
  catalog_slot_key?: string;
  library_slot_key?: string;
  rationale?: string;
}): boolean {
  if (!feedSlotLookEnabled()) return false;
  const role = String(assignment.slot_role ?? '');
  const pipeline = String(assignment.pipeline ?? '');
  if (/reel/i.test(role) || /reel/i.test(pipeline)) return false;
  if (role.startsWith('paid_ad') || pipeline === 'meta_ad' || pipeline === 'google_ad') return false;
  if (pipeline.startsWith('fal_only_') || role.startsWith('fal_only_')) return false;
  if (isCampaignSentenceLock(assignment)) return false;
  return true;
}

/** Katalog anahtarını insan işine çevir — marka adı yok. */
export function slotJobFromCatalogKey(key: string | undefined): string {
  const raw = String(key ?? '').trim().toLowerCase();
  if (!raw) return '';
  const drop = new Set([
    'shop',
    'club',
    'local',
    'products',
    'instagram',
    'campaign',
    'organic',
    'beach',
    'cafe',
    'restaurant',
    'beauty',
    'wellness',
    'hotel',
  ]);
  return raw
    .split(/[-_]+/)
    .filter((part) => part.length > 1 && !drop.has(part))
    .join(' ')
    .trim();
}

export function shouldSkipFeedMeaningRematch(pack: FeedSlotPack | null | undefined): boolean {
  return Boolean(pack && parseFeedSlotPack(pack).ok);
}

/** Haftalık still: paket yoksa kart yazılmaz. Reel / reklam / kilitli cümle serbest. */
export function isLookedFeedSlotPersistable(
  assignment: Parameters<typeof shouldLookFeedSlotPack>[0],
  pack: Partial<FeedSlotPack> | null | undefined,
): boolean {
  if (!shouldLookFeedSlotPack(assignment)) return true;
  return parseFeedSlotPack(pack).ok;
}

const LOOK_ISSUE_TR: Record<FeedSlotLookIssue, string> = {
  missing_slot_job: 'Kartın işi boş',
  missing_photo: 'Fotoğraf yok',
  missing_caption: 'Alt yazı yok veya çok kısa',
  missing_headline: 'Üst yazı yok',
  missing_evidence: 'Fotoğrafın kanıt notu boş',
  headline_not_from_caption: 'Üst yazı alt yazıdan gelmiyor',
  prop_cannot_sell: 'Masadaki dekor, ürün kabuğuna giydirilemez',
  product_needs_identity: 'Satılık ürün dedik ama kanıtta kimlik yok',
  place_cannot_sell: 'Yer/alan işine ürün kabuğu veya satılık sepet giydirilemez',
  copy_misses_evidence: 'Yazı, fotoğrafın kanıtını söylemiyor',
  empty_place_command: 'Yer kartında emir slogan yok',
  look_unavailable: 'Bakış yapılamadı',
  look_no_key: 'Bakış yapılamadı (anahtar yok)',
  look_vision_blocked: 'Bakış yapılamadı (fotoğraf açılamadı)',
  look_call_failed: 'Bakış yapılamadı (bakış çağrısı)',
  no_pick: 'Aday fotoğraflar bu işi kanıtlamıyor',
  incomplete_headline: 'Üst yazı yarım kaldı',
};

export function describeFeedSlotLookIssues(issues: FeedSlotLookIssue[]): string {
  return issues.map((id) => LOOK_ISSUE_TR[id] ?? id).join('; ');
}

function visionImageUrl(candidate: FeedSlotLookCandidate): string | null {
  const target = (candidate.visionUrl ?? candidate.url).trim();
  return isAttachableVisionUrl(target) ? target : null;
}

async function withResolvedVisionUrls(
  candidates: FeedSlotLookCandidate[],
): Promise<FeedSlotLookCandidate[]> {
  return resolveLookVisionUrls(candidates.slice(0, LOOK_MAX_CANDIDATES));
}

function completeHeadlineFromCaption(caption: string): string {
  const first = caption.trim().split(/[.!?…\n]/)[0]?.trim() || caption.trim();
  return keepCompleteOverlaySentence(first) || first;
}

function completeLookPack(pack: FeedSlotPack): FeedSlotPack | null {
  if (!isIncompleteOverlayPhrase(pack.headline)) return pack;
  const rescued = completeHeadlineFromCaption(pack.caption);
  if (!rescued || isIncompleteOverlayPhrase(rescued)) return null;
  const parsed = parseFeedSlotPack({ ...pack, headline: rescued });
  return parsed.ok ? parsed.pack : null;
}

function asRole(raw: unknown): FeedPhotoRole | undefined {
  const v = String(raw ?? '').trim();
  return PHOTO_ROLES.has(v as FeedPhotoRole) ? (v as FeedPhotoRole) : undefined;
}

function asShell(raw: unknown): FeedShellDirection | undefined {
  const v = String(raw ?? '').trim();
  return SHELLS.has(v as FeedShellDirection) ? (v as FeedShellDirection) : undefined;
}

function parseLookJson(raw: string): Record<string, unknown> {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch?.[0] ?? raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function draftFromLookJson(
  parsed: Record<string, unknown>,
  candidates: FeedSlotLookCandidate[],
  slotJob: string,
): { pickIndex: number | null; draft: Partial<FeedSlotPack> } {
  const rawIndex = parsed.pickIndex ?? parsed.pick_index ?? parsed.pick;
  let pickIndex: number | null = null;
  if (typeof rawIndex === 'number' && Number.isFinite(rawIndex)) {
    pickIndex = Math.trunc(rawIndex);
  } else if (typeof rawIndex === 'string' && /^\d+$/.test(rawIndex.trim())) {
    pickIndex = Number(rawIndex.trim());
  }
  if (pickIndex != null && (pickIndex < 0 || pickIndex >= candidates.length)) {
    pickIndex = null;
  }

  const caption = String(parsed.caption ?? '').trim();
  let headline = String(parsed.headline ?? '').trim();
  if (caption.length >= 16 && (!headline || !headlineTakenFromCaption(headline, caption))) {
    headline = completeHeadlineFromCaption(caption);
  }

  let photoRole = asRole(parsed.photoRole ?? parsed.photo_role);
  if (photoRole === 'scene_fill' && pickIndex != null) {
    pickIndex = null;
    photoRole = undefined;
  }

  return {
    pickIndex,
    draft: {
      slotJob,
      photoUrl: pickIndex != null ? candidates[pickIndex]?.url : undefined,
      photoRole,
      caption,
      headline,
      shellDirection: asShell(parsed.shellDirection ?? parsed.shell_direction),
      evidenceNote: String(parsed.evidenceNote ?? parsed.evidence_note ?? '').trim(),
    },
  };
}

export function lookSystemPrompt(adaptiveScene?: boolean): string {
  return adaptiveScene ? LOOK_SYSTEM_ADAPTIVE : LOOK_SYSTEM;
}

function buildLookUserText(input: FeedSlotLookInput, candidates: FeedSlotLookCandidate[]): string {
  return JSON.stringify({
    slot_job: input.slotJob.slice(0, 120),
    job_kind: lookJobKind({
      slotJob: input.slotJob,
      catalogSlotKey: input.catalogSlotKey ?? input.slotKey ?? undefined,
    }),
    language: (input.language ?? 'Turkish').slice(0, 40),
    brand_tone: String(input.brandTone ?? '').slice(0, 80) || null,
    ideation_hint: String(input.ideationHint ?? '').slice(0, 400) || null,
    adaptive_scene: Boolean(input.adaptiveScene),
    candidates_ordered_by_caption: true,
    candidates: candidates.map((c, i) => ({
      index: i,
      visible_label_text: c.visibleLabelText ?? null,
      description: (c.description ?? '').slice(0, 240) || null,
      primary_subject: c.primarySubject ?? null,
    })),
  });
}

export async function lookFeedSlotPack(
  input: FeedSlotLookInput,
  deps?: { openai?: OpenAI; model?: string },
): Promise<FeedSlotLookResult> {
  const slotJob = String(input.slotJob ?? '').trim();
  const incoming = input.candidates.slice(0, LOOK_MAX_CANDIDATES);
  if (incoming.length === 0 || slotJob.length < 4) {
    return { ok: false, issues: incoming.length === 0 ? ['no_pick'] : ['missing_slot_job'] };
  }

  const apiKey = serverConfig.openai.apiKey;
  if (!apiKey && !deps?.openai) {
    return { ok: false, issues: ['look_no_key'] };
  }

  const resolved = await withResolvedVisionUrls(incoming);
  const candidates = await inlineLookVisionDataUris(resolved);
  if (!candidates.some((c) => visionImageUrl(c))) {
    return { ok: false, issues: ['look_vision_blocked'] };
  }

  const profile = getAiModelProfile();
  const model = deps?.model ?? profile.visionGrafiker;
  const detail = profile.visionDetail === 'high' ? 'high' : 'low';
  const jobKind = lookJobKind({
    slotJob,
    catalogSlotKey: input.catalogSlotKey ?? input.slotKey ?? undefined,
  });
  const userText = buildLookUserText(input, candidates);
  const parts: OpenAI.Chat.ChatCompletionContentPart[] = [
    { type: 'text', text: userText },
  ];
  candidates.forEach((c, i) => {
    const imageUrl = visionImageUrl(c);
    if (!imageUrl) return;
    parts.push({ type: 'text', text: `Candidate index ${i} image:` });
    parts.push({
      type: 'image_url',
      image_url: { url: imageUrl, detail },
    });
  });

  const askLook = async (system: string, detailTag: string) => {
    const openai = deps?.openai ?? new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model,
      max_tokens: 420,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: parts },
      ],
    });
    const usage: OpenAiUsageLike | null = response.usage ?? null;
    emitAiCostLine({
      callType: 'gallery_match',
      usd: estimateOpenAiUsd(model, usage),
      provider: 'openai',
      model,
      missionId: input.missionId,
      workspaceId: input.workspaceId,
      slotKey: input.slotKey,
      promptTokens: usage?.prompt_tokens ?? undefined,
      completionTokens: usage?.completion_tokens ?? undefined,
      detail: detailTag,
    });
    return response.choices[0]?.message?.content?.trim() ?? '{}';
  };

  try {
    let raw = await askLook(lookSystemPrompt(input.adaptiveScene), 'feed_slot_look');
    let { pickIndex, draft } = draftFromLookJson(parseLookJson(raw), candidates, slotJob);
    if (
      pickIndex == null
      && jobKind === 'sell'
      && candidates.some(candidateHasReadableIdentity)
    ) {
      raw = await askLook(
        `${lookSystemPrompt(input.adaptiveScene)}\n\n${SELL_MUST_PICK}`,
        'feed_slot_look_sell',
      );
      ({ pickIndex, draft } = draftFromLookJson(parseLookJson(raw), candidates, slotJob));
    }
    if (pickIndex == null) {
      return { ok: false, issues: ['no_pick'] };
    }
    const picked = candidates[pickIndex];
    const photoSideText = [picked?.visibleLabelText, picked?.description, picked?.primarySubject]
      .filter(Boolean)
      .join(' ');
    const grounded = groundFeedSlotCopy({
      slotJob,
      photoRole: draft.photoRole,
      shellDirection: draft.shellDirection,
      evidenceNote: String(draft.evidenceNote ?? ''),
      caption: String(draft.caption ?? ''),
      headline: String(draft.headline ?? ''),
      ideationHint: input.ideationHint,
      photoSideText,
    });
    const sceneCopy = keepWeeklySceneCopy({
      adaptiveScene: Boolean(input.adaptiveScene),
      ideationHint: input.ideationHint,
      caption: grounded.caption,
      headline: grounded.headline,
      evidenceNote: grounded.evidenceNote,
      photoSideText,
      photoUrl: picked?.url,
    });
    const parsed = parseFeedSlotPack({
      ...draft,
      evidenceNote: grounded.evidenceNote,
      caption: sceneCopy.caption,
      headline: sceneCopy.headline,
    });
    if (!parsed.ok) return { ok: false, issues: parsed.issues };
    const complete = completeLookPack(parsed.pack);
    if (!complete) return { ok: false, issues: ['incomplete_headline'] };
    return { ok: true, pack: complete };
  } catch (err) {
    console.warn('[feed-slot-look] call failed:', err instanceof Error ? err.message : String(err));
    return { ok: false, issues: ['look_call_failed'] };
  }
}
