/**
 * Bakış paketinden sonra, boyadan önce: slot + foto kanıt + caption + headline
 * aynı işi mi söylüyor? Kelime listesi yok — ucuz sohbet. Tutarsızsa boya yok
 * (grafiker 8 zaten gelmez). Model yoksa açık bırak.
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
import { isIncompleteOverlayPhrase } from '@/lib/fal-caption-headline';
import { overlayHeadlineGroundedInCaption } from '@/lib/overlay-caption-grounding';
import {
  headlineTakenFromCaption,
  parseFeedSlotPack,
  sellingCopyMissesEvidence,
  type FeedSlotPack,
} from '@/lib/feed-slot-pack';

const CONSISTENCY_SYSTEM = [
  'You check one social card pack for internal consistency.',
  'Fields: slot job, photo evidence, caption, headline.',
  'No brand rules. No keyword dictionaries. The four fields are the only input.',
  'Return JSON only:',
  '{"ok": true} or {"ok": false} or {"ok": true, "headline": "<complete line from caption>"}.',
  'ok=false when evidence, caption, or headline name a different product,',
  'or when a place/process card sells a product.',
  'Do not fail because a generic selling line omitted a visible jar label.',
  'A range / new-packs / natural-flavors caption on a multi-SKU still is the same story.',
  'If caption or headline names a label that is in evidence, that is a match — use it.',
  'A slot that names the audience (favorite, range, review, social proof)',
  'and a product_hero shell are the same job when they sell the same product or range.',
  'ok=true when they tell the same story, including grade/process wording.',
  'Add headline only when ok=true AND the given headline is cut, generic, or not the caption claim.',
  'The replacement headline must be a complete sentence taken from the caption — no new product.',
  'If unsure, {"ok": true}.',
].join(' ');

/** Satılık kart: genel yelpaze yazısı veya etiketle aynı ürün — slot adı ikinci iş değil. */
export function packTellsSameProductStory(pack: FeedSlotPack): boolean {
  if (pack.photoRole !== 'product_for_sale' && pack.shellDirection !== 'product_hero') {
    return false;
  }
  const base = {
    evidenceNote: pack.evidenceNote,
    photoRole: pack.photoRole,
    shellDirection: pack.shellDirection,
  };
  return !sellingCopyMissesEvidence({ ...base, caption: pack.caption })
    && !sellingCopyMissesEvidence({ ...base, caption: pack.headline });
}

function sellEvidenceBase(pack: FeedSlotPack) {
  return {
    evidenceNote: pack.evidenceNote,
    photoRole: pack.photoRole,
    shellDirection: pack.shellDirection,
  };
}

function copySharesEvidence(pack: FeedSlotPack): boolean {
  return overlayHeadlineGroundedInCaption(pack.headline, pack.evidenceNote)
    || overlayHeadlineGroundedInCaption(pack.caption, pack.evidenceNote)
    || headlineTakenFromCaption(pack.headline, pack.evidenceNote);
}

/**
 * Üst yazıyı biz caption’dan kestik. Kelime kapısı + kanıt yetiyorsa
 * ikinci sohbet yok — mini hakem başlığı yeniden yazmasın.
 */
function headlineLooksCutFromCaption(headline: string, caption: string): boolean {
  const h = headline.trim();
  if (!h) return true;
  const last = h.split(/\s+/).pop() ?? '';
  if (last.length <= 1) return true;
  const first = caption.split(/[.!?…\n—–]/)[0]?.replace(/[.!?…]+$/g, '').trim() ?? '';
  return Boolean(first && first.startsWith(h) && h.length < first.length);
}

function packHeadlineNeedsRepair(pack: FeedSlotPack): boolean {
  const headline = pack.headline.trim();
  return headline.length < 6
    || isIncompleteOverlayPhrase(headline)
    || headlineLooksCutFromCaption(headline, pack.caption);
}

export function packCopyLockedToCaption(pack: FeedSlotPack): boolean {
  const headline = pack.headline.trim();
  if (packHeadlineNeedsRepair(pack)) return false;
  if (
    !headlineTakenFromCaption(headline, pack.caption)
    && !overlayHeadlineGroundedInCaption(headline, pack.caption)
  ) {
    return false;
  }
  const sell = pack.photoRole === 'product_for_sale' || pack.shellDirection === 'product_hero';
  if (sell) {
    const base = sellEvidenceBase(pack);
    return !sellingCopyMissesEvidence({ ...base, caption: pack.caption })
      && !sellingCopyMissesEvidence({ ...base, caption: pack.headline });
  }
  return copySharesEvidence(pack);
}

export type JudgeFeedPackConsistencyInput = {
  pack: FeedSlotPack;
  openai?: OpenAI;
  model?: string;
  missionId?: string | null;
  workspaceId?: string | null;
  slotKey?: string | null;
};

export type FeedPackConsistencyVerdict = {
  ok: boolean;
  headline?: string;
};

function parseVerdict(raw: string): FeedPackConsistencyVerdict {
  try {
    const parsed = JSON.parse(raw) as { ok?: unknown; headline?: unknown };
    const headline = typeof parsed.headline === 'string' ? parsed.headline.trim() : '';
    return {
      ok: parsed.ok !== false,
      ...(headline.length >= 8 ? { headline } : {}),
    };
  } catch {
    return { ok: true };
  }
}

export async function judgeFeedPackConsistency(
  input: JudgeFeedPackConsistencyInput,
): Promise<FeedPackConsistencyVerdict> {
  const pack = input.pack;
  const idea = [
    pack.slotJob,
    pack.evidenceNote,
    pack.caption,
    pack.headline,
  ].join(' ').trim();
  if (idea.length < 16) return { ok: true };

  const apiKey = serverConfig.openai.apiKey;
  if (!apiKey && !input.openai) return { ok: true };
  if (!input.openai && isOpenAiQuotaBlocked()) return { ok: true };

  const model = input.model ?? getAiModelProfile().chatStandard;
  const openai = input.openai ?? new OpenAI({
    apiKey,
    timeout: 20_000,
    maxRetries: 0,
  });

  try {
    const response = await openai.chat.completions.create({
      model,
      max_tokens: 80,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: CONSISTENCY_SYSTEM },
        {
          role: 'user',
          content: [
            `SLOT JOB:\n${pack.slotJob}`,
            `PHOTO ROLE:\n${pack.photoRole}`,
            `EVIDENCE:\n${pack.evidenceNote}`,
            `CAPTION:\n${pack.caption}`,
            `HEADLINE:\n${pack.headline}`,
            `SHELL:\n${pack.shellDirection}`,
          ].join('\n\n'),
        },
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
      detail: 'feed_pack_consistency',
    });
    return parseVerdict(response.choices[0]?.message?.content?.trim() ?? '{}');
  } catch (err) {
    if (isOpenAiQuotaOrBillingError(err)) {
      markOpenAiQuotaBlocked();
    }
    return { ok: true };
  }
}

export async function applyFeedPackConsistency(
  pack: FeedSlotPack,
  opts?: {
    adaptiveScene?: boolean;
    judge?: (pack: FeedSlotPack) => Promise<FeedPackConsistencyVerdict>;
    openai?: OpenAI;
    missionId?: string | null;
    workspaceId?: string | null;
    slotKey?: string | null;
  },
): Promise<{ ok: true; pack: FeedSlotPack } | { ok: false; issues: ['incoherent_pack'] }> {
  const sameProduct = packTellsSameProductStory(pack);
  if (packCopyLockedToCaption(pack) || (sameProduct && !packHeadlineNeedsRepair(pack))) {
    return { ok: true, pack };
  }
  const verdict = opts?.judge
    ? await opts.judge(pack)
    : await judgeFeedPackConsistency({
      pack,
      openai: opts?.openai,
      missionId: opts?.missionId,
      workspaceId: opts?.workspaceId,
      slotKey: opts?.slotKey,
    });
  if (!verdict.ok && !sameProduct) return { ok: false, issues: ['incoherent_pack'] };
  const nextHeadline = verdict.headline;
  if (!nextHeadline || nextHeadline === pack.headline) {
    return { ok: true, pack };
  }
  const parsed = parseFeedSlotPack({
    ...pack,
    headline: nextHeadline,
  }, { adaptiveScene: opts?.adaptiveScene });
  if (!parsed.ok) return { ok: true, pack };
  return { ok: true, pack: parsed.pack };
}
