/**
 * Faz 0.1 — Birleşik AI maliyet telemetrisi.
 *
 * Mission üretiminden feed üretimine kadar her AI çağrısını tek bir yapılandırılmış
 * log satırı olarak yayınlar (`[ai-cost] {json}`). Greplenebilir ve mission/slot
 * bazında toplanabilir. Yalnızca gözlem amaçlıdır — hiçbir üretim davranışını
 * değiştirmez.
 *
 * Backend graph LLM maliyetleri zaten `ai_cost_service.record_mission_task_ai_cost`
 * ile gerçek token üzerinden kaydedilir. Bu modül, TS tarafındaki (auto-produce +
 * remotion render) ölçülmeyen kalemleri — özellikle Creative Director ve Grafiker
 * vision çağrılarını ve retry sayılarını — kapatır.
 *
 * Kapatma: `AI_COST_TELEMETRY=false` (varsayılan: açık).
 */

export type AiCallType =
  | 'gpt_image_enhance'
  | 'fal_still'
  | 'fal_designed_post'
  | 'fal_only'
  | 'fal_typography'
  | 'video_runway'
  | 'video_fal'
  | 'card_overlay'
  | 'sharp_composite'
  | 'creative_director'
  | 'grafiker_vision'
  | 'other';

export interface OpenAiUsageLike {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  prompt_tokens_details?: { cached_tokens?: number | null } | null;
}

export interface AiCostLine {
  callType: AiCallType;
  usd: number;
  provider?: string;
  model?: string;
  /** 0-tabanlı deneme sayısı (retry hotspot ölçümü için). */
  attempt?: number;
  missionId?: string | null;
  workspaceId?: string | null;
  artifactId?: string | null;
  /** `${ideaIndex}:${slot_role}` */
  slotKey?: string | null;
  slotRole?: string | null;
  ideaIndex?: number | null;
  pipeline?: string | null;
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number;
  detail?: string;
  /** fal.ai queue request_id when known (grep + reconcile). */
  falRequestId?: string | null;
  falRequestIds?: string[] | null;
  /** When true, also persist to cost_ledger tables (default: true when workspaceId set). */
  persist?: boolean;
}

/**
 * USD / 1M token (OpenAI public pricing, blended girdi+çıktı ayrı).
 * cached input ~%50 indirimlidir.
 */
const OPENAI_PRICING_PER_1M: Record<string, { input: number; cachedInput: number; output: number }> = {
  'gpt-4o': { input: 2.5, cachedInput: 1.25, output: 10 },
  'gpt-4o-mini': { input: 0.15, cachedInput: 0.075, output: 0.6 },
  'gpt-4.1': { input: 2.0, cachedInput: 0.5, output: 8 },
  'gpt-4.1-mini': { input: 0.4, cachedInput: 0.1, output: 1.6 },
  default: { input: 2.5, cachedInput: 1.25, output: 10 },
};

function pricingForModel(model: string): { input: number; cachedInput: number; output: number } {
  const key = (model || '').toLowerCase();
  const fallback = OPENAI_PRICING_PER_1M.default!;
  // En spesifik (en uzun) prefix önce — 'gpt-4o-mini' 'gpt-4o'dan önce eşleşmeli.
  const prefixes = Object.keys(OPENAI_PRICING_PER_1M)
    .filter((p) => p !== 'default')
    .sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (key.startsWith(prefix)) return OPENAI_PRICING_PER_1M[prefix]!;
  }
  for (const prefix of prefixes) {
    if (key.includes(prefix)) return OPENAI_PRICING_PER_1M[prefix]!;
  }
  return fallback;
}

/** Gerçek token kullanımından USD maliyeti hesaplar (cached input indirimi dahil). */
export function estimateOpenAiUsd(model: string, usage: OpenAiUsageLike | null | undefined): number {
  if (!usage) return 0;
  const promptTokens = Math.max(0, Number(usage.prompt_tokens ?? 0));
  const completionTokens = Math.max(0, Number(usage.completion_tokens ?? 0));
  const cachedTokens = Math.max(0, Number(usage.prompt_tokens_details?.cached_tokens ?? 0));
  const freshInput = Math.max(0, promptTokens - cachedTokens);
  const p = pricingForModel(model);
  const usd =
    (freshInput / 1_000_000) * p.input +
    (cachedTokens / 1_000_000) * p.cachedInput +
    (completionTokens / 1_000_000) * p.output;
  return Math.round(usd * 100000) / 100000;
}

function telemetryEnabled(): boolean {
  return process.env.AI_COST_TELEMETRY !== 'false';
}

/**
 * Tek bir AI çağrısını yapılandırılmış log olarak yayınlar.
 * workspaceId + artifactId/missionId varsa cost_ledger tablosuna da yazar.
 */
export function emitAiCostLine(line: AiCostLine): void {
  if (!telemetryEnabled()) return;
  try {
    const payload = {
      ts: new Date().toISOString(),
      callType: line.callType,
      usd: Math.round((line.usd || 0) * 100000) / 100000,
      provider: line.provider,
      model: line.model,
      attempt: line.attempt,
      missionId: line.missionId ?? undefined,
      workspaceId: line.workspaceId ?? undefined,
      artifactId: line.artifactId ?? undefined,
      slotKey: line.slotKey ?? undefined,
      promptTokens: line.promptTokens,
      completionTokens: line.completionTokens,
      cachedTokens: line.cachedTokens,
      detail: line.detail ? String(line.detail).slice(0, 160) : undefined,
      falRequestId: line.falRequestId ?? undefined,
      falRequestIds: line.falRequestIds?.length ? line.falRequestIds : undefined,
    };
    console.log('[ai-cost] ' + JSON.stringify(payload));
    void persistAiCostLine(line);
  } catch {
    // telemetri asla üretimi bozmamalı
  }
}

async function persistAiCostLine(line: AiCostLine): Promise<void> {
  const shouldPersist = line.persist !== false && Boolean(line.workspaceId) && (line.usd || 0) > 0;
  if (!shouldPersist) return;

  const { recordCostLedgerBatch } = await import('@/lib/cost-ledger-client');
  const workspaceId = line.workspaceId!;
  const category = line.callType;
  const idempotencyKey = [
    line.artifactId ? 'artifact' : 'mission',
    line.artifactId ?? line.missionId ?? workspaceId,
    line.callType,
    line.slotKey ?? '',
    line.attempt ?? 0,
    line.detail?.slice(0, 40) ?? '',
  ].join(':');

  if (line.artifactId) {
    await recordCostLedgerBatch(workspaceId, {
      artifactLines: [{
        artifactId: line.artifactId,
        missionId: line.missionId ?? undefined,
        category,
        amountUsd: line.usd,
        callType: line.callType,
        sourceSystem: 'next_telemetry',
        provider: line.provider,
        model: line.model,
        slotRole: line.slotRole ?? undefined,
        ideaIndex: line.ideaIndex ?? undefined,
        pipeline: line.pipeline ?? undefined,
        attempt: line.attempt,
        idempotencyKey,
        metadata: line.detail ? { detail: line.detail } : {},
      }],
    });
    return;
  }

  if (line.missionId) {
    await recordCostLedgerBatch(workspaceId, {
      missionLines: [{
        missionId: line.missionId,
        category,
        amountUsd: line.usd,
        sourceSystem: 'next_telemetry',
        provider: line.provider,
        model: line.model,
        tokensIn: line.promptTokens,
        tokensOut: line.completionTokens,
        cachedTokens: line.cachedTokens,
        idempotencyKey,
        metadata: line.detail ? { detail: line.detail } : {},
      }],
    });
  }
}

/**
 * Faz 0.2 — kalite baz çizgisi olayları.
 * Grafiker pass-rate, retry sayısı ve fallback tetiklenme oranı loglardan
 * hesaplanabilsin diye yapılandırılmış `[ai-quality] {json}` satırı yayınlar.
 */
export type QualityEventType = 'grafiker' | 'fallback' | 'retry_exhausted';

export interface QualityEvent {
  event: QualityEventType;
  /** grafiker: pass/fail; fallback: from→to provider; */
  pass?: boolean;
  score?: number | null;
  attempt?: number;
  /** fallback: nereden→nereye (örn. 'flux->openai') */
  transition?: string;
  reason?: string;
  missionId?: string | null;
  slotKey?: string | null;
  label?: string;
}

export function emitQualityEvent(evt: QualityEvent): void {
  if (!telemetryEnabled()) return;
  try {
    const payload = {
      ts: new Date().toISOString(),
      event: evt.event,
      pass: evt.pass,
      score: evt.score ?? undefined,
      attempt: evt.attempt,
      transition: evt.transition,
      reason: evt.reason ? String(evt.reason).slice(0, 160) : undefined,
      missionId: evt.missionId ?? undefined,
      slotKey: evt.slotKey ?? undefined,
      label: evt.label ? String(evt.label).slice(0, 80) : undefined,
    };
    console.log('[ai-quality] ' + JSON.stringify(payload));
  } catch {
    // telemetri asla üretimi bozmamalı
  }
}

/**
 * OpenAI chat completion sonucundan doğrudan telemetri yayınlar.
 * usage yoksa sessizce 0 maliyetle geçer.
 */
export function emitOpenAiCostLine(input: {
  callType: AiCallType;
  model: string;
  usage: OpenAiUsageLike | null | undefined;
  attempt?: number;
  missionId?: string | null;
  workspaceId?: string | null;
  artifactId?: string | null;
  slotKey?: string | null;
  slotRole?: string | null;
  ideaIndex?: number | null;
  pipeline?: string | null;
  detail?: string;
  persist?: boolean;
}): number {
  const usd = estimateOpenAiUsd(input.model, input.usage);
  emitAiCostLine({
    callType: input.callType,
    usd,
    provider: 'openai',
    model: input.model,
    attempt: input.attempt,
    missionId: input.missionId,
    workspaceId: input.workspaceId,
    artifactId: input.artifactId,
    slotKey: input.slotKey,
    slotRole: input.slotRole,
    ideaIndex: input.ideaIndex,
    pipeline: input.pipeline,
    promptTokens: input.usage?.prompt_tokens ?? undefined,
    completionTokens: input.usage?.completion_tokens ?? undefined,
    cachedTokens: input.usage?.prompt_tokens_details?.cached_tokens ?? undefined,
    detail: input.detail,
    persist: input.persist,
  });
  return usd;
}
