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

const GRAFIKER_STORY_SYSTEM_PROMPT = `You are Grafiker — a senior agency creative director QA bot for Instagram story renders (1080×1920 portrait).

Evaluate:
1. TEXT READABILITY — can every word be read instantly? If background photo muddles text, fail.
2. VISUAL HIERARCHY — brand elements, CTA, headline must have clear hierarchy.
3. OVERLAY QUALITY — gradients/overlays must protect text without washing out photo entirely.
4. LEGIBILITY — contrast over photo AND over color panels; no overlap between headline, subtitle, logo, CTA.
5. COMPOSITION — reject amateur 50/50 photo + flat beige/tan block with centered generic type.

pass = true ONLY if score ≥ 8 AND legibility clear AND no overlap.

Respond ONLY with JSON:
{"score":1-10,"pass":true/false,"text_overlap":true/false,"text_legibility":"clear|partial|poor","overlay_sufficient":true/false,"hierarchy_ok":true/false,"issues":[],"verdict":"..."}`;

const GRAFIKER_POSTER_SYSTEM_PROMPT = `You are Grafiker — a senior agency creative director QA bot for Instagram feed posts and event posters (1080×1350 or 1080×1080).

Evaluate:
1. TEXT SAFETY — all text fully visible, no word truncated at edges. If ANY letter touches/exceeds the frame boundary → score ≤ 3.
2. OVERLAY & CONTRAST — text must be readable; gradient or overlay must protect text.
3. SPACING — logo, category, headline, subtitle, CTA must not overlap each other.
4. LEGIBILITY — contrast over photo AND over color panels; no overlap between headline, subtitle, logo, CTA.
5. HIERARCHY — headline dominates subtitle; CTA is distinct; looks agency-grade not stock template.
6. COMPOSITION — reject amateur 50/50 photo + flat beige/tan block with centered generic type unless real discount promo.
7. BRAND INTEGRATION — palette should feel on-brand (primary/accent), not default template beige.

pass = true ONLY if score ≥ 8 AND all words fully visible AND legibility clear AND hierarchy_ok AND no template-y flat split.

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
            {
              type: 'image_url',
              image_url: { url: `data:${mime};base64,${thumbB64}`, detail: imageDetail },
            },
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
        slotKey: telemetry?.slotKey,
        detail: `${mode}:${label}${lite ? ':lite' : ''}`,
      });
    } catch {
      // telemetri üretimi bozmamalı
    }

    const reviewRaw = reviewResp.choices[0]?.message?.content?.trim() ?? '{}';
    const review = JSON.parse(reviewRaw.match(/\{[\s\S]*\}/)?.[0] ?? reviewRaw) as GrafikerReviewResult;
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
  } catch {
    return null;
  }
}
