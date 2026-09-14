/**
 * OpenAI gpt-image paint booking — every `images.edit` / `images.generate`
 * response is booked the moment it returns, kept or discarded.
 *
 * The slot rollup used to book a flat $0.04 per *kept* frame (a Flux price),
 * so a slot that painted 6 gpt-image frames and shipped one showed $0.04.
 * Here the amount comes from the response `usage` block when present
 * (metered tokens) and from the public per-image catalog otherwise.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { emitAiCostLine } from '@/lib/ai-cost-telemetry';

type PaintScope = { context: OpenAiImageCostContext; spentUsd: number; paints: number };
const paintScope = new AsyncLocalStorage<PaintScope>();

/**
 * Run a request handler with a cost context: every `bookOpenAiImagePaint`
 * inside (any depth, no signature threading) inherits mission/slot ids and
 * accumulates into the scope so the handler can return the spend to its caller.
 */
export async function runWithOpenAiImageCostScope<T>(
  context: OpenAiImageCostContext,
  fn: (scope: { readonly spentUsd: number; readonly paints: number }) => Promise<T>,
): Promise<T> {
  const store: PaintScope = { context, spentUsd: 0, paints: 0 };
  return paintScope.run(store, () => fn({
    get spentUsd() { return store.spentUsd; },
    get paints() { return store.paints; },
  }));
}

/**
 * Production-loop side: the paint happens in the web process (HTTP), the loop
 * in the worker. The route returns `costUsd`; the loop's slot register keeps a
 * running total so the artifact residual line does not re-book the same paints.
 */
let activeSlotSpend: { usd: number; paints: number } | null = null;
export function beginOpenAiPaintSlot(): void { activeSlotSpend = { usd: 0, paints: 0 }; }
export function clearOpenAiPaintSlot(): void { activeSlotSpend = null; }
export function recordOpenAiPaintSpend(usd: number, paints = 1): void {
  if (!activeSlotSpend || !(usd > 0)) return;
  activeSlotSpend.usd += usd;
  activeSlotSpend.paints += paints;
}
export function getOpenAiPaintSlotSpend(): { usd: number; paints: number } {
  return activeSlotSpend ? { ...activeSlotSpend } : { usd: 0, paints: 0 };
}

export interface OpenAiImageUsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  input_tokens_details?: { image_tokens?: number | null; text_tokens?: number | null } | null;
}

export interface OpenAiImageCostContext {
  workspaceId?: string | null;
  missionId?: string | null;
  artifactId?: string | null;
  ideaIndex?: number | null;
  slotRole?: string | null;
  slotKey?: string | null;
  pipeline?: string | null;
  /** 0-based paint attempt within the slot (retry hotspot measurement). */
  attempt?: number | null;
}

/** USD / 1M tokens — OpenAI public gpt-image pricing (text in, image in, image out). */
const GPT_IMAGE_TOKEN_PRICING: Record<string, { text: number; image: number; output: number }> = {
  'gpt-image-1-mini': { text: 2, image: 2.5, output: 8 },
  'gpt-image-1': { text: 5, image: 10, output: 40 },
  'gpt-image-2': { text: 5, image: 10, output: 40 },
  default: { text: 5, image: 10, output: 40 },
};

/** Per-image catalog by quality × canvas (OpenAI public price table). */
const GPT_IMAGE_CATALOG_USD: Record<'low' | 'medium' | 'high', { square: number; portrait: number }> = {
  low: { square: 0.011, portrait: 0.016 },
  medium: { square: 0.042, portrait: 0.063 },
  high: { square: 0.167, portrait: 0.25 },
};
const DALLE_CATALOG_USD: Record<string, number> = { standard: 0.04, hd: 0.08 };

function tokenPricing(model: string) {
  const key = model.toLowerCase();
  const keys = Object.keys(GPT_IMAGE_TOKEN_PRICING)
    .filter((k) => k !== 'default')
    .sort((a, b) => b.length - a.length);
  for (const k of keys) if (key.startsWith(k)) return GPT_IMAGE_TOKEN_PRICING[k]!;
  return GPT_IMAGE_TOKEN_PRICING.default!;
}

function normalizeQuality(quality: string | null | undefined): 'low' | 'medium' | 'high' {
  const q = String(quality ?? '').toLowerCase();
  if (q === 'low') return 'low';
  if (q === 'medium' || q === 'standard') return 'medium';
  return 'high';
}

/** Catalog price of one gpt-image / dall-e output at the given size + quality. */
export function catalogOpenAiImageUsd(input: {
  model: string;
  quality?: string | null;
  size?: string | null;
  n?: number;
}): number {
  const n = Math.max(1, Number(input.n ?? 1));
  const model = input.model.toLowerCase();
  if (model.startsWith('dall-e')) {
    const q = String(input.quality ?? 'standard').toLowerCase();
    return (DALLE_CATALOG_USD[q] ?? DALLE_CATALOG_USD.standard!) * n;
  }
  const size = String(input.size ?? '').toLowerCase();
  const square = size === '1024x1024';
  const tier = GPT_IMAGE_CATALOG_USD[normalizeQuality(input.quality)];
  let unit = square ? tier.square : tier.portrait;
  if (model.includes('mini')) unit = unit * 0.25;
  return Math.round(unit * n * 100000) / 100000;
}

/**
 * Metered price from the response `usage` block. Returns null when the
 * provider did not send usage — the caller falls back to catalog.
 */
export function meteredOpenAiImageUsd(model: string, usage: OpenAiImageUsageLike | null | undefined): number | null {
  if (!usage) return null;
  const inTok = Math.max(0, Number(usage.input_tokens ?? 0));
  const outTok = Math.max(0, Number(usage.output_tokens ?? 0));
  if (inTok + outTok <= 0) return null;
  const imageIn = Math.max(0, Number(usage.input_tokens_details?.image_tokens ?? 0));
  const textIn = Math.max(0, Number(usage.input_tokens_details?.text_tokens ?? (inTok - imageIn)));
  const p = tokenPricing(model);
  const usd = (textIn / 1_000_000) * p.text + (imageIn / 1_000_000) * p.image + (outTok / 1_000_000) * p.output;
  return Math.round(usd * 100000) / 100000;
}

export interface BookOpenAiImagePaintInput {
  model: string;
  quality?: string | null;
  size?: string | null;
  n?: number;
  /** `images.edit` (photo-grounded) or `images.generate`. */
  op: 'edit' | 'generate';
  /** Raw SDK response — only `usage` is read. */
  response?: { usage?: OpenAiImageUsageLike | null } | null;
  context?: OpenAiImageCostContext | null;
  detail?: string;
}

/** Book one paint. Never throws — telemetry must not break production. */
export function bookOpenAiImagePaint(input: BookOpenAiImagePaintInput): number {
  try {
    const metered = meteredOpenAiImageUsd(input.model, input.response?.usage ?? null);
    const usd = metered ?? catalogOpenAiImageUsd(input);
    const scope = paintScope.getStore();
    const ctx: OpenAiImageCostContext = { ...(scope?.context ?? {}), ...(input.context ?? {}) };
    if (scope) {
      scope.spentUsd += usd;
      scope.paints += 1;
    }
    const slotKey = ctx.slotKey
      ?? (ctx.ideaIndex != null && ctx.slotRole ? `${ctx.ideaIndex}::${ctx.slotRole}` : null);
    const usage = input.response?.usage ?? null;
    emitAiCostLine({
      callType: 'gpt_image_paint',
      usd,
      provider: 'openai',
      model: input.model,
      attempt: ctx.attempt ?? undefined,
      workspaceId: ctx.workspaceId ?? null,
      missionId: ctx.missionId ?? null,
      artifactId: ctx.artifactId ?? null,
      ideaIndex: ctx.ideaIndex ?? null,
      slotRole: ctx.slotRole ?? null,
      slotKey,
      pipeline: ctx.pipeline ?? null,
      promptTokens: usage?.input_tokens ?? undefined,
      completionTokens: usage?.output_tokens ?? undefined,
      detail: [
        `images.${input.op}`,
        input.size ?? '',
        input.quality ?? '',
        metered == null ? 'catalog' : 'metered',
        input.detail ?? '',
      ].filter(Boolean).join(' '),
      persist: Boolean(ctx.workspaceId),
      // Each response is a separate charge: never let two paints of the same
      // slot/attempt collapse into one ledger row.
      idempotencyKey: `openai_image:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`,
    });
    return usd;
  } catch {
    return 0;
  }
}
