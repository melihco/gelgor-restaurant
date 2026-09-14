/**
 * Fikir, raftaki etiketlerin bilmediği bir ürün söylüyorsa kart yok.
 * Çeşit / hasat sözlüğü yok — tek katalog tenant etiket metni; karar ucuz sohbet.
 *
 * Etiket yoksa (restoran / yazısız plaj) açık bırak. Fikir etiketle
 * örtüşüyorsa (çam balı ↔ ÇAM BALI) modele sormadan açık bırak.
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
import { sharesAgglutinativeRoot } from '@/lib/turkish-root';

const CLAIM_SYSTEM = [
  'You decide if a social post idea names a specific sellable product',
  'that the shelf labels do not support.',
  'Shelf text is the only catalog. No brand rules. No variety dictionaries.',
  'Return JSON: {"invented": true} or {"invented": false}.',
  'invented=true only when the idea asserts a named sellable SKU / variety / drink',
  'that is not on the shelf labels.',
  'invented=false when the named product is on the shelf (inflection / language OK),',
  'the wording is a grade or process (not a new SKU), the idea is generic,',
  'or it is place / hours / scene / menu / breakfast / tasting / reservation',
  '— or the shelf has no product labels — or you are unsure.',
].join(' ');

export type JudgeInventedProductClaimInput = {
  ideaText: string;
  inventoryText: string;
  openai?: OpenAI;
  model?: string;
  missionId?: string | null;
  workspaceId?: string | null;
  slotKey?: string | null;
};

function foldClaim(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function claimTokens(text: string): string[] {
  return foldClaim(text).split(' ').filter((w) => w.length >= 3);
}

/** How many shelf-label tokens the idea actually hits. Şam ≠ çam. */
export function ideaShelfLabelOverlap(
  ideaText: string,
  labelText: string,
  options?: { roots?: boolean },
): number {
  const idea = claimTokens(ideaText);
  const shelf = claimTokens(labelText);
  if (idea.length === 0 || shelf.length === 0) return 0;
  const matched = new Set<string>();
  for (const token of idea) {
    for (const label of shelf) {
      const exact = token === label;
      const prefixed = token.length >= 4
        && label.length >= 4
        && (token.startsWith(label) || label.startsWith(token));
      // zeytinyağlarımızı ↔ ZEYTİNYAĞI: same Turkish root. Opt-in — the
      // invented-claim gate keeps the stricter prefix rule.
      const rooted = options?.roots === true && sharesAgglutinativeRoot(token, label);
      if (exact || prefixed || rooted) matched.add(label);
    }
  }
  return matched.size;
}

/** Shortlist rescue: suffix-tolerant label overlap for ranking photos. */
export function ideaShelfLabelOverlapRooted(ideaText: string, labelText: string): number {
  return ideaShelfLabelOverlap(ideaText, labelText, { roots: true });
}

/**
 * Tokens printed on most labels are the brand / house words ("Karaman",
 * "Datça", "Süzme"), not SKU identity. Strip them before asking whether an
 * idea names one jar over another.
 */
export function shelfHouseTokens(labels: string[]): Set<string> {
  const clean = labels.map((l) => new Set(claimTokens(l))).filter((s) => s.size > 0);
  const house = new Set<string>();
  if (clean.length < 3) return house;
  const counts = new Map<string, number>();
  for (const set of clean) for (const t of set) counts.set(t, (counts.get(t) ?? 0) + 1);
  for (const [t, n] of counts) if (n * 2 >= clean.length) house.add(t);
  return house;
}

function stripTokens(text: string, drop: Set<string>): string {
  if (drop.size === 0) return text;
  return claimTokens(text).filter((t) => !drop.has(t)).join(' ');
}

/**
 * Did the idea name a specific SKU that is on one of the candidate labels, and
 * is the picked label a *different* SKU?
 *
 * Judged per label (never against the whole gallery inventory blob — that is
 * covered by any honey word) and with house tokens removed. A generic idea
 * ("bu eşsiz lezzeti deneyin") names nothing → the model's pick stands.
 * "Süzme Çam Balı" idea → çam jar scores 2, çiçek jar 1 → çiçek pick misses.
 */
export function pickMissesNamedCandidateSku(
  ideaText: string,
  candidateLabels: string[],
  pickLabel: string,
): boolean {
  const labels = candidateLabels.map((l) => String(l ?? '').trim()).filter((l) => l.length >= 3);
  const pick = String(pickLabel ?? '').trim();
  if (pick.length < 3 || labels.length === 0) return false;
  const house = shelfHouseTokens(labels);
  const idea = stripTokens(ideaText, house);
  if (idea.trim().length < 3) return false;
  let best = 0;
  for (const label of labels) {
    best = Math.max(best, ideaShelfLabelOverlap(idea, stripTokens(label, house), { roots: true }));
  }
  // House words are already gone, so one specific token (aperol, çam,
  // kekik) is identity. Zero → generic idea, nothing named.
  if (best < 1) return false;
  const pickScore = ideaShelfLabelOverlap(idea, stripTokens(pick, house), { roots: true });
  return pickScore < best;
}

export function ideaCoveredByShelfLabels(ideaText: string, labelText: string): boolean {
  // Tek ortak cins (bal / spritz) yetmez. Çam+balı geçer; şam+balı ve
  // lagoon+spritz modele kalır.
  return ideaShelfLabelOverlap(ideaText, labelText) >= 2;
}

function shelfReady(ideaText: string, inventoryText: string): boolean {
  return ideaText.trim().length >= 8 && inventoryText.trim().length >= 6;
}

function parseInventedFlag(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as { invented?: unknown };
    return parsed.invented === true;
  } catch {
    return false;
  }
}

/** Rafta etiket yoksa veya model yoksa açık bırak — iyi kartı kesme. */
export async function judgeInventedProductClaim(
  input: JudgeInventedProductClaimInput,
): Promise<boolean> {
  const idea = String(input.ideaText ?? '').trim().slice(0, 400);
  const inventory = String(input.inventoryText ?? '').trim().slice(0, 800);
  if (!shelfReady(idea, inventory)) return false;
  if (ideaCoveredByShelfLabels(idea, inventory)) return false;

  const apiKey = serverConfig.openai.apiKey;
  if (!apiKey && !input.openai) return false;
  if (!input.openai && isOpenAiQuotaBlocked()) return false;

  const model = input.model ?? getAiModelProfile().chatStandard;
  const openai = input.openai ?? new OpenAI({
    apiKey,
    timeout: 20_000,
    maxRetries: 0,
  });

  try {
    const response = await openai.chat.completions.create({
      model,
      max_tokens: 40,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: CLAIM_SYSTEM },
        {
          role: 'user',
          content: `SHELF / LABELS:\n${inventory}\n\nIDEA:\n${idea}`,
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
      detail: 'idea_product_claim',
    });
    return parseInventedFlag(response.choices[0]?.message?.content?.trim() ?? '{}');
  } catch (err) {
    if (isOpenAiQuotaOrBillingError(err)) {
      markOpenAiQuotaBlocked();
    }
    return false;
  }
}
