/**
 * Vision QA — did the produced frame keep the library template's geometry?
 *
 * Used after GPT/fal replica compose for hard/soft matches. Grafiker taste QA
 * alone can PASS an elegant bottom-scrim that abandoned a split_feature_panel.
 */

import { serverConfig } from '@/lib/server-config';
import { fetchExternalImageBuffer } from '@/lib/external-image-fetch';
import { getAiModelProfile, resolveAiModelTier } from '@/lib/ai-model-tier';

export interface TemplateLayoutFidelityResult {
  pass: boolean;
  score: number | null;
  reason?: string;
  /** true when vision could not run — caller may soft-accept */
  skipped?: boolean;
}

const SYSTEM = `You are a layout-lock QA for Instagram brand templates.

You receive TWO images:
- IMAGE A = produced mission frame
- IMAGE B = approved brand template preview (layout law)

Decide whether IMAGE A copies IMAGE B's COMPOSITION geometry:
- same panel/split/stack shapes and approximate ratios
- same typography zones (where type lives — side panel vs top banner vs bottom slab)
- same brand-color block placement

IGNORE: different photo content, different headline words, logo swap, color grading of the photo zone.

FAIL (pass=false) when IMAGE A invents a foreign system, especially:
- thin bottom caption bar / typewriter strip / soft lower-third scrim when IMAGE B is a side split, promo stack, social-proof banner, or large color panel
- full-bleed photo-only lockup when IMAGE B has a dominant brand panel
- top masthead when IMAGE B has a bottom/side system (or the reverse)

pass=true ONLY if a designer would recognize IMAGE A as a re-issue of IMAGE B's shell.

Respond ONLY JSON:
{"pass":true|false,"score":1-10,"reason":"..."}`;

export async function reviewTemplateLayoutFidelity(input: {
  producedImageUrl: string;
  templateLayoutImageUrl: string;
  archetypeHint?: string | null;
  layoutPatternHint?: string | null;
  templateName?: string | null;
  /** Phase A: hard/soft locks must not soft-accept vision errors as pass. */
  failClosed?: boolean;
}): Promise<TemplateLayoutFidelityResult> {
  const failClosed = input.failClosed === true;
  const openaiKey = serverConfig.openai.apiKey;
  if (!openaiKey) {
    return failClosed
      ? { pass: false, score: null, skipped: true, reason: 'openai_unavailable' }
      : { pass: true, score: null, skipped: true, reason: 'openai_unavailable' };
  }

  const [produced, template] = await Promise.all([
    fetchExternalImageBuffer(input.producedImageUrl),
    fetchExternalImageBuffer(input.templateLayoutImageUrl),
  ]);
  if (!produced || produced.length < 100 || !template || template.length < 100) {
    return {
      pass: false,
      score: null,
      reason: 'layout_fidelity_images_unreadable',
    };
  }

  const aiProfile = getAiModelProfile(resolveAiModelTier({}));
  const model = aiProfile.visionGrafiker;
  const detail: 'low' | 'high' = aiProfile.visionDetail === 'high' ? 'high' : 'low';
  const mimeProduced = produced[0] === 0x89 ? 'image/png' : 'image/jpeg';
  const mimeTemplate = template[0] === 0x89 ? 'image/png' : 'image/jpeg';
  const hint = [
    input.templateName ? `Template: ${input.templateName}` : '',
    input.archetypeHint ? `Archetype: ${input.archetypeHint}` : '',
    input.layoutPatternHint ? `Layout pattern: ${input.layoutPatternHint}` : '',
  ].filter(Boolean).join(' · ');

  try {
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: openaiKey });
    const resp = await openai.chat.completions.create({
      model,
      max_tokens: 280,
      temperature: 0.05,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `IMAGE A = produced. IMAGE B = template law.${hint ? ` ${hint}.` : ''} Does A keep B's layout shell?`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeProduced};base64,${produced.toString('base64')}`,
                detail,
              },
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeTemplate};base64,${template.toString('base64')}`,
                detail,
              },
            },
          ],
        },
      ],
    });

    const raw = resp.choices[0]?.message?.content?.trim() ?? '{}';
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw) as {
      pass?: boolean;
      score?: number;
      reason?: string;
    };
    return {
      pass: parsed.pass === true,
      score: typeof parsed.score === 'number' ? parsed.score : null,
      reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
    };
  } catch (err) {
    return {
      pass: failClosed ? false : true,
      score: null,
      skipped: true,
      reason: err instanceof Error ? err.message.slice(0, 160) : 'layout_fidelity_error',
    };
  }
}
