/**
 * Gallery Match Quality Gate — AI match judge.
 *
 * The deterministic ranker (`gallery-photo-matcher.ts`) already vetoes hard
 * theme conflicts and accepts strong matches for free. This module adds an
 * AI confirmation layer for the *gray zone*: no confident deterministic pick,
 * a near-threshold score, a subject conflict, or multilingual ambiguity.
 *
 * Policy (see plan `gallery-match-quality`):
 * - Meaning for *any* caption is owned by canonical subject + AI judge —
 *   not venue/campaign keyword scenarios.
 * - Fast path: strong score AND vision subject matches caption subject AND
 *   no cross-category theme risk → skip AI.
 * - Otherwise (no subject lock, gray score, diversity, theme risk) → AI judge
 *   confirms or swaps. Wrong photo ≫ judge cost.
 * - Judge unavailable + theme risk → fail closed. Else keep deterministic
 *   (hard category vetoes still apply).
 *
 * Sector-agnostic — no brand/tenant/scenario branches. Judge sees caption,
 * headline, canonical intent and candidate metadata — never raw pixels.
 */

import OpenAI from 'openai';
import { serverConfig } from '@/lib/server-config';
import { normalizeGalleryUrl } from '@/lib/gallery-usage-tracker';
import {
  buildGalleryLookup,
  rankPhotosForContent,
  GIS_PILOT_MIN_SCORE,
  MIN_ACCEPT_SCORE,
  canonicalSubjectFromText,
  canonicalSubjectRelationForMeta,
  isHardGalleryThemeMismatch,
  type GalleryPhotoMeta,
  type MatchPhotoInput,
  type PhotoMatchResult,
} from '@/lib/gallery-photo-matcher';
import {
  emitAiCostLine,
  estimateOpenAiUsd,
  type OpenAiUsageLike,
} from '@/lib/ai-cost-telemetry';
import {
  buildGalleryPhotoSearchable,
  themeConflictNeedsAiJudge,
} from '@/lib/caption-photo-alignment';

/** Candidate photo metadata the judge is allowed to see (no raw image). */
export interface GalleryJudgeCandidate {
  url: string;
  primarySubject?: string;
  subjectFamily?: string;
  subjectAliases?: string[];
  visibleLabelText?: string;
  description?: string;
  contentTags?: string[];
  deterministicScore?: number;
}

export interface GalleryJudgeInput {
  caption: string;
  headline: string;
  /** Canonical, language-neutral subject hint (may be undefined). */
  canonicalSubject?: string;
  businessType?: string;
  contentType?: string;
  candidates: GalleryJudgeCandidate[];
}

/** Raw structured verdict returned by the model. */
export interface GalleryJudgeVerdict {
  /** 0-based index into `candidates`, or null when NONE is acceptable. */
  pickIndex: number | null;
  /** 0..1 self-reported confidence in the decision. */
  confidence: number;
  canonicalSubject?: string;
  reason: string;
  rejectReason?: string;
  usage?: OpenAiUsageLike | null;
  model: string;
}

export type GalleryJudgeAction = 'accept' | 'swap' | 'reject';

export interface GalleryMatchDecision {
  action: GalleryJudgeAction;
  /** Chosen photo URL (present for accept/swap). */
  url?: string;
  confidence: number;
  reason: string;
  rejectReason?: string;
  /** True when the AI judge actually ran (false = deterministic fast-path). */
  judged: boolean;
  deterministicScore: number | null;
  candidateCount: number;
  canonicalSubject?: string;
}

/** Minimum judge confidence to accept a gray-zone pick. Env-tunable. */
export function galleryJudgeMinConfidence(): number {
  const raw = Number(process.env.GALLERY_JUDGE_MIN_CONFIDENCE);
  if (Number.isFinite(raw) && raw > 0 && raw <= 1) return raw;
  return 0.6;
}

/** Top-N candidates sent to the judge (cost control). */
const JUDGE_MAX_CANDIDATES = 5;

/** True when the AI judge is enabled for this deployment. */
export function galleryJudgeEnabled(): boolean {
  if (process.env.GALLERY_AI_JUDGE === 'false') return false;
  return serverConfig.openai.configured;
}

const JUDGE_SYSTEM_PROMPT = `You are a strict visual quality gate for a social-media agency.
Decide whether ONE of the candidate brand gallery photos truly matches the post copy.

Rules:
- The caption/headline may be Turkish, English, or mixed. Reason about MEANING, not language.
- All subjects use canonical English snake_case tokens (e.g. "olive_oil", "honey", "fig_jam", "haircut").
- Pick a candidate ONLY if it clearly depicts the same product/subject/service/scene the copy is about.
- If the copy names a specific product and NO candidate shows it, you MUST return pickIndex null.
- A generic family caption (e.g. "our jams" / "reçel çeşitlerimiz") may match any specific variant of that family.
- Never pick a photo of a different product just because it looks nice or is on-brand.
- Theme alignment (meaning over keywords):
  * Nightlife / DJ / party / dance copy → need nightlife proof (DJ booth, stage, dancing crowd, neon party). A plated meal is NOT OK.
  * Any other caption → the photo must depict the same subject/scene/mood the copy is about. Generic "on-brand" venue shots are NOT enough when the copy names a different subject.
  * Food / menu / plated dish copy → need food proof. A DJ stage is NOT OK.
  * Cocktail / drink-hero copy → need a drink/bar hero. A steak/pasta plate is NOT OK.
  * Cocktail mention inside a nightlife/DJ caption MAY match a nightlife crowd/DJ photo (cocktails are atmosphere, not the hero subject).
  * Beauty: nail copy must not pick lash/hair heroes and vice versa.
- confidence is your honest probability (0..1) that the pick is correct. Be conservative.

Return STRICT JSON only, no prose:
{"pickIndex": <int|null>, "confidence": <0..1>, "canonicalSubject": "<token>", "reason": "<short>", "rejectReason": "<short|empty>"}`;

function buildJudgeUserPayload(input: GalleryJudgeInput): string {
  const candidates = input.candidates.slice(0, JUDGE_MAX_CANDIDATES).map((c, i) => ({
    index: i,
    primary_subject: c.primarySubject ?? null,
    subject_family: c.subjectFamily ?? null,
    subject_aliases: c.subjectAliases?.length ? c.subjectAliases : null,
    visible_label_text: c.visibleLabelText ?? null,
    description: (c.description ?? '').slice(0, 240),
    content_tags: (c.contentTags ?? []).slice(0, 10),
    deterministic_score: c.deterministicScore ?? null,
  }));
  return JSON.stringify({
    caption: input.caption.slice(0, 600),
    headline: input.headline.slice(0, 200),
    canonical_subject_hint: input.canonicalSubject ?? null,
    business_type: input.businessType ?? null,
    content_type: input.contentType ?? null,
    candidates,
  });
}

function parseVerdict(raw: string, model: string, usage: OpenAiUsageLike | null): GalleryJudgeVerdict {
  let parsed: Record<string, unknown> = {};
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] ?? raw);
  } catch {
    parsed = {};
  }
  const rawIndex = parsed.pickIndex ?? parsed.pick_index ?? parsed.pick;
  let pickIndex: number | null = null;
  if (typeof rawIndex === 'number' && Number.isFinite(rawIndex)) {
    pickIndex = Math.trunc(rawIndex);
  } else if (typeof rawIndex === 'string' && /^\d+$/.test(rawIndex.trim())) {
    pickIndex = Number(rawIndex.trim());
  }
  let confidence = Number(parsed.confidence);
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence = Math.max(0, Math.min(1, confidence));
  return {
    pickIndex,
    confidence,
    canonicalSubject: typeof parsed.canonicalSubject === 'string'
      ? parsed.canonicalSubject
      : (typeof parsed.canonical_subject === 'string' ? parsed.canonical_subject : undefined),
    reason: String(parsed.reason ?? '').slice(0, 240),
    rejectReason: parsed.rejectReason || parsed.reject_reason
      ? String(parsed.rejectReason ?? parsed.reject_reason).slice(0, 240)
      : undefined,
    usage,
    model,
  };
}

/**
 * Raw AI judge call. Returns null when disabled or on any error (caller decides
 * how to degrade). Never throws — telemetry/production must not break on this.
 */
export async function judgeGalleryMatch(
  input: GalleryJudgeInput,
  deps?: { openai?: OpenAI; model?: string },
): Promise<GalleryJudgeVerdict | null> {
  if (!input.candidates.length) return null;
  const apiKey = serverConfig.openai.apiKey;
  if (!apiKey && !deps?.openai) return null;
  const model = deps?.model ?? serverConfig.ai.chatModel('standard');
  try {
    const openai = deps?.openai ?? new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model,
      max_tokens: 300,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: JUDGE_SYSTEM_PROMPT },
        { role: 'user', content: buildJudgeUserPayload(input) },
      ],
    });
    const raw = response.choices[0]?.message?.content?.trim() ?? '{}';
    return parseVerdict(raw, model, response.usage ?? null);
  } catch (err) {
    console.warn('[gallery-judge] call failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

export interface ConfirmGalleryPickParams {
  caption: string;
  headline: string;
  subjectKey?: string;
  businessType?: string;
  contentType?: string;
  mood?: string;
  /** The photo the deterministic ranker selected. */
  selectedUrl: string;
  /** Deterministic caption↔photo score for the selected photo (null = unknown). */
  deterministicScore: number | null;
  galleryAnalysis: Record<string, GalleryPhotoMeta>;
  candidateUrls: string[];
  excludeUrls?: string[];
  /** Telemetry context. */
  missionId?: string | null;
  workspaceId?: string | null;
  slotKey?: string | null;
  slotRole?: string | null;
  ideaIndex?: number | null;
  /** Test seam — inject a judge so unit tests never hit the network. */
  judgeFn?: (input: GalleryJudgeInput) => Promise<GalleryJudgeVerdict | null>;
  /** Force enable/disable (defaults to `galleryJudgeEnabled()`). */
  enabled?: boolean;
}

function resolveMetaForUrl(
  url: string,
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
): GalleryPhotoMeta | undefined {
  const base = normalizeGalleryUrl(url);
  return galleryAnalysis[base]
    ?? Object.entries(galleryAnalysis).find(([k]) => normalizeGalleryUrl(k) === base)?.[1];
}

function toCandidate(
  url: string,
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
  deterministicScore?: number,
): GalleryJudgeCandidate {
  const meta = resolveMetaForUrl(url, galleryAnalysis);
  return {
    url,
    primarySubject: meta?.primarySubject,
    subjectFamily: meta?.subjectFamily,
    subjectAliases: meta?.subjectAliases,
    visibleLabelText: meta?.visibleLabelText,
    description: meta?.description,
    contentTags: meta?.contentTags,
    deterministicScore,
  };
}

/**
 * Gray-zone quality gate. Decides accept / swap / reject for the deterministic
 * pick, calling the AI judge only when needed. Fail-closed: an uncertain judge
 * verdict rejects the slot rather than shipping a doubtful photo.
 */
export async function confirmGalleryPickWithAiJudge(
  params: ConfirmGalleryPickParams,
): Promise<GalleryMatchDecision> {
  const canonicalSubject = params.subjectKey?.trim()
    || canonicalSubjectFromText(`${params.headline} ${params.caption}`);
  const enabled = params.enabled ?? galleryJudgeEnabled();
  const score = params.deterministicScore;

  const base: Omit<GalleryMatchDecision, 'action' | 'confidence' | 'reason'> = {
    url: params.selectedUrl,
    judged: false,
    deterministicScore: score ?? null,
    candidateCount: 0,
    canonicalSubject,
  };

  const selectedMeta = resolveMetaForUrl(params.selectedUrl, params.galleryAnalysis);
  const captionBlob = `${params.headline} ${params.caption}`;
  const themeRisk = themeConflictNeedsAiJudge(
    captionBlob,
    buildGalleryPhotoSearchable(selectedMeta, params.selectedUrl),
  );
  const subjectAligned = Boolean(
    canonicalSubject
    && selectedMeta
    && canonicalSubjectRelationForMeta(canonicalSubject, selectedMeta) === 'match',
  );

  // Fast path only when vision subject locks to caption subject at a strong
  // score with no cross-category risk. Every other caption (any language /
  // sector / campaign) goes through the AI meaning gate.
  if (
    typeof score === 'number'
    && score >= GIS_PILOT_MIN_SCORE
    && subjectAligned
    && !themeRisk
  ) {
    return {
      ...base,
      action: 'accept',
      confidence: 1,
      reason: `strong subject-aligned score (${score})`,
    };
  }

  // Judge unavailable → keep deterministic unless cross-category theme risk.
  if (!enabled) {
    if (themeRisk) {
      return {
        ...base,
        url: undefined,
        action: 'reject',
        confidence: 0,
        reason: 'theme risk without ai judge — fail closed',
        rejectReason: 'ai_judge_required_for_theme',
      };
    }
    return {
      ...base,
      action: 'accept',
      confidence: subjectAligned ? 0.55 : 0.4,
      reason: subjectAligned
        ? 'ai judge disabled — subject-aligned deterministic pick kept'
        : 'ai judge disabled — deterministic pick kept (no subject lock)',
    };
  }

  // Build the top-N candidate pool (selected photo first).
  const matchInput: MatchPhotoInput = {
    caption: params.caption,
    headline: params.headline,
    mood: params.mood,
    contentType: params.contentType,
    businessType: params.businessType,
    subjectKey: params.subjectKey,
  };
  const excludeBases = new Set((params.excludeUrls ?? []).map(normalizeGalleryUrl));
  const lookup = buildGalleryLookup(params.galleryAnalysis, params.candidateUrls);
  const ranked = rankPhotosForContent(
    matchInput,
    params.candidateUrls,
    lookup,
    excludeBases,
    params.galleryAnalysis,
  );

  const orderedUrls: string[] = [];
  const scoreByBase = new Map<string, number>();
  const selectedBase = normalizeGalleryUrl(params.selectedUrl);
  orderedUrls.push(params.selectedUrl);
  for (const r of ranked) {
    scoreByBase.set(normalizeGalleryUrl(r.url), r.score);
    if (normalizeGalleryUrl(r.url) === selectedBase) continue;
    if (orderedUrls.length >= JUDGE_MAX_CANDIDATES) break;
    orderedUrls.push(r.url);
  }

  const candidates = orderedUrls.map((u) =>
    toCandidate(u, params.galleryAnalysis, scoreByBase.get(normalizeGalleryUrl(u))),
  );

  const judgeFn = params.judgeFn ?? ((i: GalleryJudgeInput) => judgeGalleryMatch(i));
  const verdict = await judgeFn({
    caption: params.caption,
    headline: params.headline,
    canonicalSubject,
    businessType: params.businessType,
    contentType: params.contentType,
    candidates,
  });

  // Emit telemetry regardless of outcome (observability of the gate).
  const minConfidence = galleryJudgeMinConfidence();
  const decidedUrl = verdict && verdict.pickIndex != null
    ? candidates[verdict.pickIndex]?.url
    : undefined;
  let action: GalleryJudgeAction;
  if (!verdict) {
    // Judge transport/parse failure: theme-risk pairs fail closed (do not ship
    // a nightlife↔food guess). Otherwise keep the deterministic pick.
    action = themeRisk ? 'reject' : 'accept';
  } else if (verdict.pickIndex == null || !decidedUrl || verdict.confidence < minConfidence) {
    action = 'reject';
  } else if (normalizeGalleryUrl(decidedUrl) === selectedBase) {
    action = 'accept';
  } else {
    action = 'swap';
  }

  if (verdict) {
    try {
      const usd = estimateOpenAiUsd(verdict.model, verdict.usage);
      emitAiCostLine({
        callType: 'gallery_match',
        usd,
        provider: 'openai',
        model: verdict.model,
        missionId: params.missionId,
        workspaceId: params.workspaceId,
        slotKey: params.slotKey,
        slotRole: params.slotRole,
        ideaIndex: params.ideaIndex,
        pipeline: 'gallery_ai_judge',
        promptTokens: verdict.usage?.prompt_tokens ?? undefined,
        completionTokens: verdict.usage?.completion_tokens ?? undefined,
        detail: `decision=${action} conf=${verdict.confidence.toFixed(2)} det=${score ?? 'na'} subj=${canonicalSubject ?? 'na'}`,
      });
    } catch {
      // telemetry must never break production
    }
  }

  if (action === 'reject') {
    return {
      ...base,
      url: undefined,
      action,
      judged: Boolean(verdict),
      candidateCount: candidates.length,
      confidence: verdict?.confidence ?? 0,
      reason: verdict?.reason
        || (themeRisk && !verdict
          ? 'theme risk and ai judge unavailable — fail closed'
          : 'ai judge rejected the pick'),
      rejectReason: verdict?.rejectReason
        || (themeRisk && !verdict
          ? 'ai_judge_required_for_theme'
          : `judge confidence ${(verdict?.confidence ?? 0).toFixed(2)} < ${minConfidence}`),
      canonicalSubject: verdict?.canonicalSubject ?? canonicalSubject,
    };
  }

  return {
    ...base,
    url: action === 'swap' ? decidedUrl : params.selectedUrl,
    action,
    judged: Boolean(verdict),
    candidateCount: candidates.length,
    confidence: verdict?.confidence ?? 0.5,
    reason: verdict?.reason || (verdict ? 'ai judge confirmed pick' : 'judge unavailable — deterministic pick kept'),
    canonicalSubject: verdict?.canonicalSubject ?? canonicalSubject,
  };
}

/**
 * Judge when the pick is not a locked subject match — works for any caption.
 * Diversity / gray scores / cross-category risk always judge.
 */
function batchAssignmentNeedsJudge(
  match: PhotoMatchResult,
  input: MatchPhotoInput,
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
): boolean {
  if (match.reason === 'mission_diversity_fallback') return true;
  if (match.score < GIS_PILOT_MIN_SCORE) return true;
  const meta = resolveMetaForUrl(match.url, galleryAnalysis);
  const captionBlob = `${input.headline ?? ''} ${input.caption}`;
  if (themeConflictNeedsAiJudge(captionBlob, buildGalleryPhotoSearchable(meta, match.url))) {
    return true;
  }
  const subjectKey = input.subjectKey?.trim()
    || canonicalSubjectFromText(captionBlob);
  if (!subjectKey || !meta) return true;
  return canonicalSubjectRelationForMeta(subjectKey, meta) !== 'match';
}

/**
 * Post-process a batch/deterministic gallery assignment through the AI judge
 * when the pick is in the gray zone or shows cross-theme risk. Returns null
 * when the judge rejects (fail-closed) so greedy batch dedup does not reserve
 * a wrong photo.
 */
export async function gatePhotoMatchResult(
  match: PhotoMatchResult | null,
  input: MatchPhotoInput,
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
  candidateUrls: string[],
  options?: {
    excludeUrls?: string[];
    workspaceId?: string | null;
    missionId?: string | null;
    slotKey?: string | null;
    enabled?: boolean;
    judgeFn?: (input: GalleryJudgeInput) => Promise<GalleryJudgeVerdict | null>;
  },
): Promise<PhotoMatchResult | null> {
  if (!match?.url) return match;
  if (!batchAssignmentNeedsJudge(match, input, galleryAnalysis)) return match;

  const decision = await confirmGalleryPickWithAiJudge({
    caption: input.caption,
    headline: input.headline ?? '',
    subjectKey: input.subjectKey,
    businessType: input.businessType,
    contentType: input.contentType,
    mood: input.mood,
    selectedUrl: match.url,
    deterministicScore: match.score,
    galleryAnalysis,
    candidateUrls,
    excludeUrls: options?.excludeUrls,
    workspaceId: options?.workspaceId,
    missionId: options?.missionId,
    slotKey: options?.slotKey,
    enabled: options?.enabled,
    judgeFn: options?.judgeFn,
  });

  if (decision.action === 'reject') {
    console.warn(
      `[gallery-judge] batch gate rejected (conf ${decision.confidence.toFixed(2)}): ` +
      `${decision.rejectReason ?? decision.reason}`,
    );
    return null;
  }

  if (decision.action === 'swap' && decision.url) {
    return {
      ...match,
      url: decision.url,
      reason: `${match.reason},ai_judge_swap`,
      confidence: decision.confidence,
    };
  }

  return match;
}

/**
 * Judge escalation for sub-threshold picks (Gallery Match Quality Gate, faz 1.2).
 *
 * When the deterministic ranker finds NO acceptable photo (best score below
 * MIN_ACCEPT) but the gallery contains a candidate whose vision subject
 * canonically MATCHES the caption subject (e.g. caption "bal çeşitlerimiz"
 * subject_key=honey vs photo primary_subject=thyme_honey), the refusal is a
 * scoring artifact, not a real theme conflict. Instead of silently failing the
 * slot, ask the AI judge to confirm the best subject-aligned candidate.
 *
 * Strictly fail-closed: returns a pick ONLY when a real judge verdict accepted
 * it (judge disabled / unavailable / reject → null). Sector-agnostic — driven
 * entirely by canonical subject tokens from ideation + vision.
 */
export async function escalateSubjectAlignedPick(
  input: MatchPhotoInput,
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
  candidateUrls: string[],
  options?: {
    excludeUrls?: string[];
    workspaceId?: string | null;
    missionId?: string | null;
    slotKey?: string | null;
    enabled?: boolean;
    judgeFn?: (input: GalleryJudgeInput) => Promise<GalleryJudgeVerdict | null>;
  },
): Promise<PhotoMatchResult | null> {
  const subjectKey = String(input.subjectKey ?? '').trim()
    || canonicalSubjectFromText(`${input.headline ?? ''} ${input.caption}`);
  if (!subjectKey) return null;

  const enabled = options?.enabled ?? galleryJudgeEnabled();
  if (!enabled && !options?.judgeFn) return null;

  const excludeBases = new Set((options?.excludeUrls ?? []).map(normalizeGalleryUrl));
  const lookup = buildGalleryLookup(galleryAnalysis, candidateUrls);
  const ranked = rankPhotosForContent(
    { ...input, subjectKey },
    candidateUrls,
    lookup,
    excludeBases,
    galleryAnalysis,
  );

  const aligned = ranked.find((r) => {
    const meta = resolveMetaForUrl(r.url, galleryAnalysis);
    if (canonicalSubjectRelationForMeta(subjectKey, meta) !== 'match') return false;
    return !isHardGalleryThemeMismatch({ ...input, subjectKey }, meta, r.url);
  });
  if (!aligned) return null;

  const decision = await confirmGalleryPickWithAiJudge({
    caption: input.caption,
    headline: input.headline ?? '',
    subjectKey,
    businessType: input.businessType,
    contentType: input.contentType,
    mood: input.mood,
    selectedUrl: aligned.url,
    deterministicScore: aligned.score,
    galleryAnalysis,
    candidateUrls,
    excludeUrls: options?.excludeUrls,
    workspaceId: options?.workspaceId,
    missionId: options?.missionId,
    slotKey: options?.slotKey ? `${options.slotKey}::escalation` : 'judge_escalation',
    enabled,
    judgeFn: options?.judgeFn,
  });

  // Escalation may only ship a photo the judge actually confirmed. The one
  // exception is confirm's strong-score fast path (judged=false but the
  // deterministic score cleared GIS_PILOT) — as trustworthy as a normal pick.
  // A judged=false accept from "judge disabled/unavailable" is NOT a verdict.
  if (decision.action === 'reject' || !decision.url) return null;
  if (!decision.judged && aligned.score < GIS_PILOT_MIN_SCORE) return null;

  return {
    url: decision.url,
    // Judge confirmation lifts the pick to the acceptance floor so downstream
    // sub-threshold re-pick loops don't override the verdict. The raw
    // deterministic score was below MIN_ACCEPT by definition of this path.
    score: Math.max(aligned.score, MIN_ACCEPT_SCORE),
    reason: decision.action === 'swap' ? 'judge_escalation,ai_judge_swap' : 'judge_escalation',
    confidence: decision.confidence,
  };
}
