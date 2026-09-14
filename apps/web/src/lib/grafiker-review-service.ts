/**
 * Unified Grafiker Vision QA service.
 *
 * Consolidates the duplicated review logic from render/route.ts and remotion-quality.ts
 * into a single module with mode-specific prompts.
 */

import { serverConfig } from '@/lib/server-config';
import { getAiModelProfile, resolveAiModelTier } from '@/lib/ai-model-tier';
import type { ProductionProfileTier } from '@/lib/production-profile';

export type GrafikerMode = 'story' | 'poster' | 'still';

export interface GrafikerReviewResult {
  score: number | null;
  pass: boolean;
  text_overlap?: boolean;
  text_legibility?: 'clear' | 'partial' | 'poor';
  overlay_sufficient?: boolean;
  hierarchy_ok?: boolean;
  issues?: string[];
  verdict?: string;
}

const GRAFIKER_STORY_SYSTEM_PROMPT = `You are Grafiker — boutique social-agency creative director QA for Instagram story renders (1080×1920).

Ask first: "Would a client ask which agency made this?" If no → score ≤ 6.

Evaluate:
1. TEXT READABILITY — every word instant; muddled photo text → fail.
2. VISUAL HIERARCHY — one clear idea; headline dominates; no dual focal points.
3. TYPE CRAFT — letterforms feel intentional/custom; reject default UI/system sans stacks and clumsy centered Arial.
4. SPACE CRAFT — breathing room; cramped edge-hugging type → fail.
5. PHOTO×TYPE — type married to photo or locked inside a craft plate/rail/scrim. Thin accent rules OK. Reject horizontal paint sandwich (opaque header + photo + opaque footer).
6. TYPE CONTAINMENT — if a brand-color plate/rail/mat/scrim holds the headline, EVERY letter must stay inside it with padding. Letters half-on the plate and half-on the photo → score ≤ 5.
7. TASTE FAIL → score ≤ 6: text escaping its color field; Canva sandwich; system-sans on flat color; sticker/emoji CTA; carnival gradients; template-pack; meta labels (STORY/REEL/POST).

pass = true ONLY if score ≥ 8 AND legibility clear AND no overlap AND taste pass (agency-portfolio bar).

Respond ONLY with JSON:
{"score":1-10,"pass":true/false,"text_overlap":true/false,"text_legibility":"clear|partial|poor","overlay_sufficient":true/false,"hierarchy_ok":true/false,"issues":[],"verdict":"..."}`;

const GRAFIKER_POSTER_SYSTEM_PROMPT = `You are Grafiker — boutique social-agency creative director QA for Instagram feed posts (1080×1350 / 1080×1080).

Ask first: "Would a client ask which agency made this?" If no → score ≤ 6.

Evaluate:
1. TEXT SAFETY — all text fully visible; any clipped letter → score ≤ 3.
2. OVERLAY & CONTRAST — readable without washing the photo.
3. SPACING — no overlap between headline, subtitle, logo, CTA; generous margins.
4. TYPE CRAFT — intentional display hierarchy; reject system-sans template look.
5. HIERARCHY — one dominant idea; agency-grade, not stock template.
6. COMPOSITION — photo-integrated editorial / magazine lockup / soft scrim. Thin accent plates OK (<20%). Reject opaque header/footer sandwich.
7. TYPE CONTAINMENT — headline letters must not straddle a hard plate edge onto the photo; shrink type or enlarge plate instead.
8. BRAND INTEGRATION — on-brand palette; not default template beige.
9. TASTE FAIL → score ≤ 6: text escaping its color field; Canva sandwich; paint-rectangle + white sans; sticker CTA; dual focus; template-pack.

pass = true ONLY if score ≥ 8 AND all words visible AND hierarchy_ok AND taste pass (agency-portfolio bar).

Respond ONLY with JSON:
{"score":1-10,"pass":true/false,"text_overlap":true/false,"text_legibility":"clear|partial|poor","overlay_sufficient":true/false,"hierarchy_ok":true/false,"issues":[],"verdict":"..."}`;

function getSystemPrompt(mode: GrafikerMode): string {
  return mode === 'story' ? GRAFIKER_STORY_SYSTEM_PROMPT : GRAFIKER_POSTER_SYSTEM_PROMPT;
}

function getUserPrompt(mode: GrafikerMode, label: string): string {
  if (mode === 'story') {
    return `Review frame for ${label}. Reject amateur overlap, weak contrast, cramped type.`;
  }
  return `Review this ${label} frame. Reject if ANY letter is clipped at the frame edge or words are truncated.`;
}

/** Faz 0.1 — isteğe bağlı maliyet telemetrisi bağlamı (retry hotspot ölçümü). */
export interface GrafikerTelemetryContext {
  attempt?: number;
  missionId?: string | null;
  workspaceId?: string | null;
  slotKey?: string | null;
}

/**
 * Run Grafiker vision QA on an image buffer.
 * Unified entry point for all render paths (story, poster, still).
 */
export async function runGrafikerVisionReview(
  imageBuffer: Buffer,
  label: string,
  mode: GrafikerMode = 'story',
  telemetry?: GrafikerTelemetryContext,
  tier?: string,
): Promise<GrafikerReviewResult | null> {
  const openaiKey = serverConfig.openai.apiKey;
  if (!openaiKey || imageBuffer.length < 100) return null;

  // Tier-aware vision: starter/economy → mini + low detail; premium → gpt-4o + high.
  const productionTier: ProductionProfileTier | undefined =
    tier === 'economy' ? 'economy'
      : tier === 'premium' ? 'premium'
        : tier === 'agency' ? 'agency'
          : undefined;
  const aiProfile = getAiModelProfile(resolveAiModelTier({ productionTier }));
  const model = aiProfile.visionGrafiker;
  const imageDetail: 'low' | 'high' = aiProfile.visionDetail === 'high' ? 'high' : 'low';

  try {
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: openaiKey });
    const thumbB64 = imageBuffer.toString('base64');
    const mime = imageBuffer[0] === 0x89 ? 'image/png' : 'image/jpeg';
    const dataUrl = `data:${mime};base64,${thumbB64}`;

    const first = await callGrafiker(openai, {
      model, imageDetail, mode, label, dataUrl, telemetry,
    });
    if (!first) return null;
    if (first.pass || !grafikerFailNeedsConfirmation(model, imageDetail)) return first;

    // Cheap pass (mini + 512px) hallucinates "clipped letters at the frame edge"
    // on clean, centered type — measured 2–3/10 on frames gpt-4o/high scores 9.
    // A fail from the cheap reviewer is a claim, not a verdict: confirm it once
    // at full detail. The confirmed review wins either way.
    const confirm = await callGrafiker(openai, {
      model: GRAFIKER_CONFIRM_MODEL,
      imageDetail: 'high',
      mode,
      label,
      dataUrl,
      telemetry,
      detailSuffix: ':confirm',
    });
    if (!confirm) return first;
    console.warn(
      `[grafiker] cheap fail ${first.score ?? '—'}/10 → confirm ${confirm.score ?? '—'}/10 `
      + `(${confirm.pass ? 'pass' : 'fail'}) "${label.slice(0, 40)}" `
      + `issues=${JSON.stringify(confirm.issues ?? [])}`,
    );
    return confirm;
  } catch {
    return null;
  }
}

/** Full-detail reviewer used to confirm a cheap-tier fail. */
export const GRAFIKER_CONFIRM_MODEL = 'gpt-4o';

/** Only a mini/low first pass needs a second opinion; gpt-4o/high is already final. */
export function grafikerFailNeedsConfirmation(model: string, detail: 'low' | 'high'): boolean {
  return detail === 'low' || /mini/i.test(model);
}

async function callGrafiker(
  openai: { chat: { completions: { create: (args: any) => Promise<any> } } },
  args: {
    model: string;
    imageDetail: 'low' | 'high';
    mode: GrafikerMode;
    label: string;
    dataUrl: string;
    telemetry?: GrafikerTelemetryContext;
    detailSuffix?: string;
  },
): Promise<GrafikerReviewResult | null> {
  const { model, imageDetail, mode, label, dataUrl, telemetry } = args;
  const reviewResp = await openai.chat.completions.create({
    model,
    max_tokens: 400,
    temperature: 0.05,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: getSystemPrompt(mode) },
      {
        role: 'user',
        content: [
          { type: 'text', text: getUserPrompt(mode, label) },
          { type: 'image_url', image_url: { url: dataUrl, detail: imageDetail } },
        ],
      },
    ],
  });

  try {
    const { emitOpenAiCostLine } = await import('@/lib/ai-cost-telemetry');
    emitOpenAiCostLine({
      callType: 'grafiker_vision',
      model,
      usage: reviewResp.usage,
      attempt: telemetry?.attempt,
      missionId: telemetry?.missionId,
      workspaceId: telemetry?.workspaceId,
      slotKey: telemetry?.slotKey,
      detail: `${mode}:${label}${imageDetail === 'low' ? ':lite' : ''}${args.detailSuffix ?? ''}`,
    });
  } catch {
    // telemetri üretimi bozmamalı
  }

  const reviewRaw = reviewResp.choices?.[0]?.message?.content?.trim() ?? '{}';
  let review: GrafikerReviewResult;
  try {
    review = JSON.parse(reviewRaw.match(/\{[\s\S]*\}/)?.[0] ?? reviewRaw) as GrafikerReviewResult;
  } catch {
    return null;
  }
  return {
    score: review.score ?? null,
    pass: review.pass === true,
    text_overlap: review.text_overlap,
    text_legibility: review.text_legibility,
    overlay_sufficient: review.overlay_sufficient,
    hierarchy_ok: review.hierarchy_ok,
    issues: review.issues,
    verdict: review.verdict,
  };
}
