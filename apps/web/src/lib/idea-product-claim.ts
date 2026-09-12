/**
 * Fikir, raftaki etiketlerin bilmediği bir ürün söylüyorsa kart yok.
 * Çeşit / hasat sözlüğü yok — tek katalog tenant etiket metni; karar ucuz sohbet.
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

const CLAIM_SYSTEM = [
  'You decide if a social post idea names a specific sellable product',
  'that the shelf labels do not support.',
  'Shelf text is the only catalog. No brand rules. No variety dictionaries.',
  'Return JSON: {"invented": true} or {"invented": false}.',
  'invented=true only when the idea asserts a named product / variety / drink',
  'that is not on the shelf.',
  'invented=false when the named product is on the shelf (inflection OK),',
  'the wording is a grade or process (not a new SKU), the idea is generic,',
  'or it is place / hours / scene — or you are unsure.',
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
