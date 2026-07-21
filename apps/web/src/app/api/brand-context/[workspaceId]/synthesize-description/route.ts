/**
 * POST /api/brand-context/{workspaceId}/synthesize-description
 *
 * Builds the "Açıklama & Ürünler" company-profile field from discovery signals.
 * Uses OpenAI when available; otherwise deterministic structured fallback.
 */
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import {
  buildAiBrandDescriptionFallback,
  buildSynthesizeDescriptionSystemPrompt,
  buildSynthesizeDescriptionUserPrompt,
  normalizeSynthesizedBrandDescription,
  type AiBrandDescriptionLanguage,
  type AiBrandDescriptionSignals,
} from '@/lib/ai-brand-description';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import { serverConfig } from '@/lib/server-config';
import {
  assertPathTenantMatchesRequest,
  buildTenantForwardHeaders,
} from '@/lib/tenant-production-guard';

export const runtime = 'nodejs';
export const maxDuration = 60;

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function asStringList(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map((x) => String(x ?? '').trim()).filter(Boolean);
  }
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((x) => String(x ?? '').trim()).filter(Boolean);
      }
    } catch {
      return v.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

function readOfferings(ctx: Record<string, unknown>): string[] {
  const sp = ctx.brand_service_profile;
  if (sp && typeof sp === 'object' && !Array.isArray(sp)) {
    const offerings = asStringList((sp as Record<string, unknown>).signature_offerings);
    if (offerings.length) return offerings;
  }
  return asStringList(ctx.signature_offerings);
}

function resolveLanguage(
  bodyLang: unknown,
  ctx: Record<string, unknown>,
): AiBrandDescriptionLanguage {
  const raw = asString(bodyLang) || asString(ctx.content_language) || asString(ctx.language) || 'tr';
  return raw.toLowerCase().startsWith('en') ? 'en' : 'tr';
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
): Promise<NextResponse> {
  const { workspaceId } = await context.params;
  const denied = assertPathTenantMatchesRequest(req, workspaceId);
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const brandRes = await fetchCrewBackendJson<Record<string, unknown>>(
    `/api/v1/brand-context/${workspaceId}`,
    {
      workspaceId,
      headers: buildTenantForwardHeaders(req),
      timeoutMs: 15_000,
    },
  );
  const ctx = brandRes.data ?? {};

  const language = resolveLanguage(body.language, ctx);
  const signals: AiBrandDescriptionSignals = {
    brandName:
      asString(body.brandName)
      || asString(ctx.business_name)
      || asString(ctx.brand_name)
      || 'Marka',
    industry:
      asString(body.industry)
      || asString(ctx.business_type)
      || asString(ctx.industry),
    location: asString(body.location) || asString(ctx.location),
    websiteSummary:
      asString(body.websiteSummary)
      || asString(ctx.website_summary)
      || asString(ctx.description),
    instagramBio: asString(body.instagramBio) || asString(ctx.instagram_bio),
    googleDescription: asString(body.googleDescription) || asString(ctx.google_description),
    targetAudience: asString(body.targetAudience) || asString(ctx.target_audience),
    brandTone: asString(body.brandTone) || asString(ctx.brand_tone),
    contentPillars: asStringList(body.contentPillars).length
      ? asStringList(body.contentPillars)
      : asStringList(ctx.content_pillars),
    defaultCtas: asStringList(body.defaultCtas).length
      ? asStringList(body.defaultCtas)
      : asStringList(ctx.default_ctas),
    signatureOfferings: asStringList(body.signatureOfferings).length
      ? asStringList(body.signatureOfferings)
      : readOfferings(ctx),
    language,
  };

  if (
    !signals.websiteSummary
    && !signals.instagramBio
    && !signals.googleDescription
    && !signals.signatureOfferings?.length
  ) {
    return NextResponse.json(
      {
        error: 'insufficient_signals',
        message: 'Açıklama üretmek için web, Instagram, Google veya ürün sinyali gerekli.',
      },
      { status: 422 },
    );
  }

  const fallback = buildAiBrandDescriptionFallback(signals);
  const apiKey = serverConfig.openai.apiKey ?? process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      description: fallback,
      source: 'fallback',
      model: null,
    });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_BRAND_DESCRIPTION_MODEL ?? process.env.OPENAI_CONTENT_MODEL ?? 'gpt-4o-mini',
      temperature: 0.35,
      max_tokens: 900,
      messages: [
        { role: 'system', content: buildSynthesizeDescriptionSystemPrompt(language) },
        { role: 'user', content: buildSynthesizeDescriptionUserPrompt(signals) },
      ],
    });

    const synthesized = normalizeSynthesizedBrandDescription(
      completion.choices[0]?.message?.content ?? '',
      language,
    );

    if (!synthesized || synthesized.length < 40) {
      return NextResponse.json({
        description: fallback,
        source: 'fallback',
        model: completion.model,
        tokensUsed: completion.usage?.total_tokens ?? 0,
      });
    }

    return NextResponse.json({
      description: synthesized,
      source: 'llm',
      model: completion.model,
      tokensUsed: completion.usage?.total_tokens ?? 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      description: fallback,
      source: 'fallback',
      model: null,
      warning: message.slice(0, 200),
    });
  }
}
