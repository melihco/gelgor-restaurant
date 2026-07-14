/**
 * POST /api/enhance-product-photo
 *
 * 3-stage Product Visual Studio pipeline:
 *
 * Stage 1 — Scene Director (GPT-4o mini, fast, ~5s)
 *   Reads brand DNA + caption → generates a precise visual scene brief
 *   (background, props, lighting, logo placement).
 *   Falls back to Python CrewAI ProductSceneDirectorAgent for richer brand context
 *   when workspaceId is provided.
 *
 * Stage 2 — GPT image-2 Enhancement (~30-40s)
 *   Uses the scene brief as a production-ready prompt for images.edit.
 *   Product, label, logo on packaging are NEVER modified.
 *
 * Stage 3 — Logo Compositor (sharp, ~1s)
 *   Embeds brand logo watermark at the position specified by Scene Director.
 *   Non-fatal: if logo fetch fails, returns Stage 2 output as-is.
 *
 * Body:
 *   photoUrl:          string       — single source photo (legacy)
 *   photoUrls:         string[]     — 2–4 photos (carousel / story / reel); processed in parallel
 *   caption:           string  — Instagram caption or pre-built context block
 *   headline:          string? — post headline for scene director context
 *   missionBrief:      string? — tenant learning / mission brief
 *   brandName:         string  — brand display name
 *   productType:       string? — e.g. "almond butter", "skincare serum"
 *   level:             'subtle' | 'moderate' | 'full'
 *   businessType:      string? — sector hint
 *   workspaceId:       string? — enables full CrewAI scene director
 *   logoUrl:           string? — explicit logo URL (else auto-detected)
 *   embedLogo:         boolean? — whether to composite logo (default: true)
 *   referenceImageUrls: string[]? — brand gallery for logo auto-detection
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import sharp from '@/lib/sharp-runtime';
import {
  compositeLogoOnPhoto,
  detectLogoUrl,
  imageUrlToBuffer,
  type LogoPlacement,
} from '@/lib/logo-compositor';
import { buildAiEnhanceContextCaption } from '@/lib/ai-gallery-enhance';
import { resolveVisualSubject, type AiVisualSubject, type ResolvedVisualSubject } from '@/lib/ai-visual-production-standard';
import {
  GPT_IMAGE_ENHANCE_COST_USD,
  isPersistableEnhanceUrl,
  normalizeGalleryPhotoUrls,
  type GalleryEnhanceRequest,
  type GalleryEnhanceResultItem,
} from '@/lib/gallery-photo-enhance-api';
import {
  classifyOpenAiError,
  isOpenAiQuotaOrBillingError,
  markOpenAiQuotaBlocked,
} from '@/lib/openai-error-utils';
import { recordWorkspaceUsageCost } from '@/lib/usage-cost-client';
import { getNextjsInternalOrigin } from '@/lib/runtime-config';
import { fetchExternalImageBuffer } from '@/lib/external-image-fetch';
import { serverConfig } from '@/lib/server-config';

export const runtime = 'nodejs';
export const maxDuration = 180;

type EnhanceLevel = 'subtle' | 'moderate' | 'full';

// ─── Sector-aware scene archetypes (fast-path fallback when no CrewAI) ────────

const SECTOR_BACKGROUNDS: Record<string, string> = {
  food_artisan:    'worn rustic wooden table with scattered fresh ingredients, warm golden hour light',
  local_artisan:   'natural wood surface with linen cloth, soft morning light, artisan warmth',
  beauty:          'clean white marble surface, single botanical element, soft diffused studio light',
  beauty_skincare: 'light stone surface with dewy botanical, high-key minimalist background',
  technology:      'dark slate surface, subtle blue-purple ambient glow, precise and modern',
  sports_fitness:  'outdoor concrete surface, high contrast morning light, energetic mood',
  cafe_coffee:     'aged wood table, scattered coffee beans, warm amber bokeh background',
  wine_spirits:    'deep wood surface with candlelight reflection, dramatic dark background',
  home_interior:   'lifestyle kitchen counter, natural light from window, editorial flat-lay',
  health_wellness: 'natural linen surface, botanical leaf, soft daylight, clean organic',
  fashion:         'urban lifestyle context, shallow depth of field, aspirational atmosphere',
  professional:    'pure white gradient background, professional directional lighting, clean shadows',
  retail:          'neutral light grey hero background, soft directional shadow, product-forward',
  agency:          'editorial creative agency office, glass walls, soft gradient backdrop, modern workspace light',
  marketing_agency:'bright marketing studio, editorial desk setup, warm-neutral gradient, aspirational B2B mood',
  saas:            'minimal SaaS brand environment, soft blue-purple gradient, clean modern workspace aesthetic',
  b2b:             'corporate modern office backdrop, neutral slate tones, confident professional lighting',
  consulting:      'upscale consulting firm setting, warm neutral gradient, editorial professionalism',
  logistics:       'active logistics yard or highway corridor, fleet vehicles, industrial daylight, operational authenticity',
  local_service:   'real on-site service environment, practical lighting, trustworthy local business context',
};

function getSectorBackground(businessType: string, caption: string): string {
  const bt = businessType.toLowerCase();
  const cap = caption.toLowerCase();

  // Explicit sector matches
  for (const [key, bg] of Object.entries(SECTOR_BACKGROUNDS)) {
    if (bt.includes(key.replace('_', '')) || bt.includes(key)) return bg;
  }

  // Keyword inference from caption
  if (/reçel|jam|bal|honey|zeytinyağı|olive|badem|almond|fındık|hazelnut|tahini/i.test(cap)) {
    return SECTOR_BACKGROUNDS.food_artisan!;
  }
  if (/cilt|serum|krem|parfüm|skincare|cream|perfume/i.test(cap)) {
    return SECTOR_BACKGROUNDS.beauty_skincare!;
  }
  if (/kahve|coffee|latte|espresso/i.test(cap)) {
    return SECTOR_BACKGROUNDS.cafe_coffee!;
  }
  if (/spor|fitness|antrenman|sport|workout/i.test(cap)) {
    return SECTOR_BACKGROUNDS.sports_fitness!;
  }
  if (/nakliyat|lojistik|logistics|transport|freight|taşımacılık|kargo/i.test(bt + cap)) {
    return SECTOR_BACKGROUNDS.logistics!;
  }
  if (/zeytin|olive|ağaç|grove|çiftlik|farm/i.test(cap)) {
    return 'sunlit olive grove with natural trees and golden Mediterranean light, authentic agricultural setting';
  }

  if (/agency|ajans|marketing|saas|b2b|consulting|danışmanlık|yazılım|software/i.test(bt + cap)) {
    if (/saas|yazılım|software|platform|b2b/i.test(bt + cap)) return SECTOR_BACKGROUNDS.saas!;
    if (/consulting|danışmanlık|advisory/i.test(bt + cap)) return SECTOR_BACKGROUNDS.consulting!;
    if (/marketing|ajans|agency/i.test(bt + cap)) return SECTOR_BACKGROUNDS.marketing_agency!;
    return SECTOR_BACKGROUNDS.agency!;
  }

  return SECTOR_BACKGROUNDS.retail!;
}

function resolveDirectorCaption(caption: string, headline: string, missionBrief: string): string {
  const prebuilt = caption.includes('Mission brief:') || caption.includes('Headline:');
  if (prebuilt) return caption;
  return buildAiEnhanceContextCaption({ caption, headline, missionBrief });
}

function preservationBlock(
  visualSubject: ResolvedVisualSubject,
): string {
  if (visualSubject === 'digital_ui') {
    return `⚠️ DIGITAL PRODUCT PRESERVATION — NEVER VIOLATE:
• Show SaaS dashboard, appointment UI, mobile app screen, or abstract tech workspace
• Do NOT replace with a physical shop storefront, street scene, or barber salon exterior
• Do NOT invent gibberish signage or fake venue branding in the image
• Preserve any real UI/screenshot pixels; only adjust lighting and device framing`;
  }
  if (visualSubject === 'venue_ambiance') {
    return `⚠️ VENUE PRESERVATION — NEVER VIOLATE:
• Keep the real venue interior, architecture, furniture, mirrors, and staff EXACTLY as photographed
• Do NOT replace the location with a stock scene or a different business
• Only adjust lighting, color grade, and atmosphere to match brand identity + post brief
• Do NOT invent signage, menus, or text overlays in the image`;
  }
  return `⚠️ CRITICAL PRESERVATION RULES — NEVER VIOLATE:
• ALL text on the product (label copy, brand name, ingredients, weight) stays EXACTLY as written
• The product's logo, colors, shape, and position are preserved pixel-perfect
• Packaging design and graphics are UNTOUCHED
• Do NOT stylize, recolor, or redesign the product in any way`;
}

function buildQuickSceneBrief(
  caption: string,
  brandName: string,
  productType: string,
  level: EnhanceLevel,
  businessType: string,
  visualSubject: ResolvedVisualSubject,
): Record<string, unknown> {
  const bg = getSectorBackground(businessType, caption + ' ' + productType);
  const isVenue = visualSubject === 'venue_ambiance';
  const isDigital = visualSubject === 'digital_ui';

  const levelInstructions: Record<EnhanceLevel, string> = isDigital
    ? {
        subtle: 'ONLY refine lighting on device/UI mockup. Do NOT add storefront or street background.',
        moderate: 'Place UI in clean desk/laptop or mobile mockup with soft professional light. No physical shop scene.',
        full: 'Editorial SaaS hero: device mockup + abstract tech gradient or modern office blur. Never a barber shop exterior.',
      }
    : isVenue
    ? {
        subtle: 'ONLY enhance lighting and color grade on the existing venue photo. Do NOT change layout or replace the space.',
        moderate: 'Refine lighting, color grade, and subtle atmosphere to match the post brief. Keep the same room and fixtures visible.',
        full: 'Cinematic lighting and editorial color grade on the SAME venue photo. Props only at edges if they exist in frame — never fake a new location.',
      }
    : {
        subtle: `ONLY enhance: (1) lighting — add warm professional light, soft shadows; (2) color balance — more vivid but natural. DO NOT change background or surroundings.`,
        moderate: `Change: (1) background to "${bg}"; (2) add warm professional lighting with gentle bokeh; (3) add max 1 contextually relevant prop that does NOT overlap the product.`,
        full: `Full scene transformation: (1) new background: "${bg}"; (2) cinematic golden-hour or editorial lighting; (3) 1-2 contextual props at scene edges; (4) lens compression, shallow depth of field; (5) magazine-quality composition.`,
      };

  const prompt = `${isDigital ? 'Digital product' : isVenue ? 'Venue' : 'Product'} photography enhancement for ${brandName}.

${preservationBlock(visualSubject)}

${levelInstructions[level]}

Post brief (scene mood & atmosphere only): "${caption.slice(0, 400)}"
${isVenue ? 'Subject' : 'Product type'}: ${productType}

TARGET: An Instagram post that looks authentic, premium, and stops the scroll.`;

  return {
    gpt_image2_prompt: prompt,
    logo_placement: 'bottom_right',
    logo_size_pct: 12,
    logo_opacity: 0.75,
    background_concept: bg,
    sector_archetype: businessType,
    _source: 'quick_brief',
  };
}

// ─── Stage 1: Scene Director (try CrewAI, fall back to quick brief) ───────────

async function getSceneBrief(opts: {
  workspaceId: string;
  caption: string;
  productType: string;
  level: EnhanceLevel;
  businessType: string;
  brandName: string;
  visualSubject: ResolvedVisualSubject;
}): Promise<Record<string, unknown>> {
  const { workspaceId, caption, productType, level, businessType, brandName, visualSubject } = opts;

  // Try Python CrewAI Scene Director (only if workspaceId provided and backend reachable)
  if (workspaceId) {
    try {
      const CREW = serverConfig.crewBackend.baseUrl;
      const INTERNAL_KEY = serverConfig.internal.apiKey;
      const res = await fetch(`${CREW}/api/v1/product-visual/scene-brief`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Api-Key': INTERNAL_KEY,
          'X-Tenant-Id': workspaceId,
        },
        body: JSON.stringify({
          workspace_id: workspaceId,
          caption,
          product_type: productType,
          enhance_level: level,
          sector: businessType,
          visual_subject: visualSubject,
        }),
        signal: AbortSignal.timeout(25_000), // CrewAI can take 15-20s
      });

      if (res.ok) {
        const data = await res.json() as { ok: boolean; scene_brief: Record<string, unknown> };
        if (data.ok && data.scene_brief?.gpt_image2_prompt) {
          console.log(`[enhance-product] CrewAI scene director success: ${data.scene_brief.sector_archetype}`);
          return data.scene_brief;
        }
      }
    } catch (err: any) {
      console.warn('[enhance-product] CrewAI scene director unavailable, using quick brief:', err?.message);
    }
  }

  // Fallback: inline GPT-4o mini for rapid scene brief
  try {
    const apiKey = serverConfig.openai.apiKey;
    if (apiKey) {
      const openai = new OpenAI({ apiKey });
      const completion = await openai.chat.completions.create({
        model: serverConfig.ai.chatModel('standard'),
        temperature: 0.7,
        max_tokens: 600,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'system',
          content: visualSubject === 'digital_ui'
            ? `You are a B2B SaaS product photography art director. Brand identity is in the caption block. Show dashboard/UI/device mockups — NEVER a physical shop storefront. Output JSON: gpt_image2_prompt, logo_placement, logo_size_pct, logo_opacity, background_concept, sector_archetype, mood_words.`
            : visualSubject === 'venue_ambiance'
            ? `You are a venue/social photography art director. Brand identity is in the caption block; post brief controls mood/lighting only. NEVER replace the real venue. Output JSON: gpt_image2_prompt, logo_placement, logo_size_pct, logo_opacity, background_concept, sector_archetype, mood_words.`
            : `You are a product photography art director. Brand identity is in the caption block; post brief controls scene mood. Output JSON: gpt_image2_prompt, logo_placement, logo_size_pct, logo_opacity, background_concept, sector_archetype, mood_words.`,
        }, {
          role: 'user',
          content: `Brand: ${brandName}\nSector: ${businessType}\nSubject: ${productType}\nVisual mode: ${visualSubject}\nDirector context:\n${caption.slice(0, 1200)}\nLevel: ${level}\n\nCreate the scene brief. gpt_image2_prompt MUST start with preservation rules.`,
        }],
      });
      const raw = completion.choices[0]?.message?.content ?? '';
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed.gpt_image2_prompt) {
        console.log('[enhance-product] GPT-4o mini scene brief generated');
        return { ...parsed, _source: 'gpt4o_mini' };
      }
    }
  } catch (err: any) {
    console.warn('[enhance-product] GPT-4o mini brief failed:', err?.message);
  }

  // Final fallback: static quick brief
  return buildQuickSceneBrief(caption, brandName, productType, level, businessType, visualSubject);
}

async function uploadEnhancedBufferToR2(
  buffer: Buffer,
  workspaceId: string,
): Promise<string | null> {
  try {
    const { isR2Configured, generateStorageKey, uploadToR2 } = await import('@/lib/r2-storage');
    if (!isR2Configured()) return null;
    const wsId = workspaceId || 'shared';
    const key = generateStorageKey(wsId, 'image', 'jpg');
    const dataUri = `data:image/jpeg;base64,${buffer.toString('base64')}`;
    const result = await uploadToR2(dataUri, key, 'image/jpeg');
    return result.url;
  } catch (err) {
    console.warn('[enhance-product] R2 upload failed, using data URL:', err);
    return null;
  }
}

// ─── Fetch image as buffer via media proxy ────────────────────────────────────

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  if (url.startsWith('http')) {
    const direct = await fetchExternalImageBuffer(url);
    if (direct) return direct;
  }

  const proxyBases = [
    getNextjsInternalOrigin(),
    process.env.RENDER_EXTERNAL_URL?.trim().replace(/\/$/, ''),
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, ''),
  ].filter(Boolean) as string[];

  for (const proxyBase of proxyBases) {
    try {
      const proxyUrl = url.startsWith('http')
        ? `${proxyBase}/api/media-proxy?url=${encodeURIComponent(url)}`
        : `${proxyBase}${url}`;
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(20_000) });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {
      /* try next base */
    }
  }

  return null;
}

type EnhanceRunOpts = {
  apiKey: string;
  photoUrl: string;
  directorCaption: string;
  brandName: string;
  productType: string;
  level: EnhanceLevel;
  businessType: string;
  workspaceId: string;
  explicitLogoUrl?: string;
  embedLogo: boolean;
  referenceImageUrls: string[];
  sceneBrief: Record<string, unknown>;
};

async function runSingleGalleryEnhance(opts: EnhanceRunOpts): Promise<{
  imageUrl: string;
  logoApplied: boolean;
  stages: string[];
}> {
  const stages: string[] = [`scene_director:${opts.sceneBrief._source ?? 'crewai'}`];
  const enhancePrompt = String(opts.sceneBrief.gpt_image2_prompt || '');
  const openai = new OpenAI({ apiKey: opts.apiKey });

  const imageBuffer = await fetchImageBuffer(opts.photoUrl);
  if (!imageBuffer) {
    throw new Error(`Could not fetch source image: ${opts.photoUrl.slice(0, 80)}`);
  }

  const imageFile = new File([new Uint8Array(imageBuffer)], 'product.jpg', { type: 'image/jpeg' });
  let response;
  try {
    response = await openai.images.edit({
      model: 'gpt-image-2',
      image: imageFile,
      prompt: enhancePrompt,
      n: 1,
      size: '1024x1024',
      quality: 'high',
    });
  } catch (err: unknown) {
    if (isOpenAiQuotaOrBillingError(err)) {
      const wrapped = new Error('OpenAI quota or billing limit reached') as Error & { code: string };
      wrapped.code = classifyOpenAiError(err);
      throw wrapped;
    }
    throw err;
  }

  const b64 = response.data?.[0]?.b64_json;
  const rawUrl = response.data?.[0]?.url;
  if (!b64 && !rawUrl) {
    throw new Error('No image returned from GPT image-2');
  }
  stages.push('gpt_image2');

  let enhancedBuffer: Buffer;
  if (b64) {
    enhancedBuffer = Buffer.from(b64, 'base64');
  } else {
    const fetched = await imageUrlToBuffer(rawUrl!);
    if (!fetched) throw new Error('Could not read enhanced image');
    enhancedBuffer = fetched;
  }

  let finalBuffer = enhancedBuffer;
  let logoApplied = false;

  if (opts.embedLogo) {
    const resolvedLogoUrl = opts.explicitLogoUrl || detectLogoUrl(opts.referenceImageUrls);
    if (resolvedLogoUrl) {
      const logoResult = await compositeLogoOnPhoto({
        baseImageBuffer: enhancedBuffer,
        logoUrl: resolvedLogoUrl,
        placement: (opts.sceneBrief.logo_placement as LogoPlacement | undefined) ?? 'bottom_right',
        sizePct: typeof opts.sceneBrief.logo_size_pct === 'number' ? opts.sceneBrief.logo_size_pct : 12,
        opacity: typeof opts.sceneBrief.logo_opacity === 'number' ? opts.sceneBrief.logo_opacity : 0.75,
        padding: 20,
      });
      if (logoResult.logoApplied) {
        finalBuffer = logoResult.buffer;
        logoApplied = true;
        stages.push(`logo_compositor:${opts.sceneBrief.logo_placement ?? 'bottom_right'}`);
      }
    }
  }

  const r2Url = await uploadEnhancedBufferToR2(finalBuffer, opts.workspaceId);
  const finalImageUrl = r2Url ?? `data:image/jpeg;base64,${finalBuffer.toString('base64')}`;
  if (r2Url) stages.push('r2_upload');

  return { imageUrl: finalImageUrl, logoApplied, stages };
}

function resolveSceneBriefForRequest(input: {
  prebuilt?: Record<string, unknown>;
  postSceneBlock?: string;
  workspaceId: string;
  caption: string;
  productType: string;
  level: EnhanceLevel;
  businessType: string;
  brandName: string;
  visualSubject: ResolvedVisualSubject;
}): Promise<Record<string, unknown>> {
  const prebuilt = input.prebuilt;
  if (prebuilt?.gpt_image2_prompt) {
    console.log(
      `[enhance-product] reusing mission scene brief (${String(prebuilt._source ?? 'prebuilt')})`,
    );
    return Promise.resolve(prebuilt);
  }

  const hasDirectorContext = Boolean(
    input.postSceneBlock?.includes('POST SCENE BRIEF')
    || input.postSceneBlock?.includes('ADAPTIVE SCENE')
    || input.postSceneBlock?.includes('BRAND IDENTITY'),
  );
  if (hasDirectorContext) {
    console.log('[enhance-product] quick scene brief (director blocks in caption — no Crew call)');
    return Promise.resolve(
      buildQuickSceneBrief(
        input.caption,
        input.brandName,
        input.productType,
        input.level,
        input.businessType,
        input.visualSubject,
      ),
    );
  }

  return getSceneBrief({
    workspaceId: input.workspaceId,
    caption: input.caption,
    productType: input.productType,
    level: input.level,
    businessType: input.businessType,
    brandName: input.brandName,
    visualSubject: input.visualSubject,
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = serverConfig.openai.apiKey;
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 503 });
  }

  let body: GalleryEnhanceRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const photoUrls = normalizeGalleryPhotoUrls(body);
  if (!photoUrls.length) {
    return NextResponse.json({ error: 'photoUrl or photoUrls[] required' }, { status: 400 });
  }

  const caption = body.caption ?? '';
  const headline = body.headline ?? '';
  const missionBrief = body.missionBrief ?? '';
  const brandName = body.brandName ?? 'Marka';
  const productType = body.productType ?? 'ürün';
  const level = (body.level ?? 'moderate') as EnhanceLevel;
  const businessType = body.businessType ?? 'local_artisan';
  const workspaceId = body.workspaceId ?? '';
  const explicitLogoUrl = body.logoUrl;
  const embedLogo = body.embedLogo !== false;
  const referenceImageUrls = body.referenceImageUrls ?? [];
  const rawSubject = (body.visualSubject ?? 'auto') as AiVisualSubject;
  const visualSubject = resolveVisualSubject(rawSubject, businessType);

  const directorCaption = resolveDirectorCaption(caption, headline, missionBrief);
  const missionId = body.missionId;
  const t0 = Date.now();

  try {
    const sceneBrief = await (async () => {
      let brief = await resolveSceneBriefForRequest({
        prebuilt: body.prebuiltSceneBrief,
        postSceneBlock: body.postSceneBlock,
        workspaceId,
        caption: directorCaption,
        productType,
        level,
        businessType,
        brandName,
        visualSubject,
      });
      const fingerprint = body.venueFingerprintBlock?.trim();
      if (fingerprint) {
        const basePrompt = String(brief.gpt_image2_prompt || '');
        brief = {
          ...brief,
          gpt_image2_prompt: basePrompt
            ? `${basePrompt}\n\n${fingerprint}`
            : fingerprint,
        };
      }
      return brief;
    })();

    let quotaErrorCode: string | null = null;
    const results: GalleryEnhanceResultItem[] = await Promise.all(
      photoUrls.map(async (photoUrl): Promise<GalleryEnhanceResultItem> => {
        try {
          const { imageUrl } = await runSingleGalleryEnhance({
            apiKey,
            photoUrl,
            directorCaption,
            brandName,
            productType,
            level,
            businessType,
            workspaceId,
            explicitLogoUrl,
            embedLogo,
            referenceImageUrls,
            sceneBrief,
          });
          return { original: photoUrl, imageUrl };
        } catch (err: unknown) {
          const code = (err as { code?: string })?.code ?? classifyOpenAiError(err);
          if (code === 'openai_quota_exceeded' || code === 'billing_hard_limit') {
            quotaErrorCode = code;
          }
          const msg = err instanceof Error ? err.message : 'Enhance failed';
          return { original: photoUrl, imageUrl: null, error: msg };
        }
      }),
    );

    const imageUrls = results
      .map((r) => r.imageUrl)
      .filter((u): u is string => Boolean(u && isPersistableEnhanceUrl(u)));

    const primary = imageUrls[0] ?? null;
    const totalMs = Date.now() - t0;

    console.log(
      `[enhance-product] ${brandName} ${level} ×${photoUrls.length} — ` +
      `ok:${imageUrls.length} total:${totalMs}ms`,
    );

    if (!primary) {
      if (quotaErrorCode) markOpenAiQuotaBlocked();
      const status = quotaErrorCode ? 429 : 500;
      return NextResponse.json(
        {
          error: quotaErrorCode
            ? 'OpenAI kota veya billing limiti doldu — enhance atlandı'
            : 'No photo could be enhanced',
          code: quotaErrorCode ?? 'enhance_failed',
          results,
          photoCount: photoUrls.length,
        },
        { status },
      );
    }

    if (workspaceId) {
      const enhanceCost = GPT_IMAGE_ENHANCE_COST_USD * imageUrls.length;
      void recordWorkspaceUsageCost(workspaceId, 'gpt_image_enhance', enhanceCost, {
        artifactCount: imageUrls.length,
      });
    }

    return NextResponse.json({
      imageUrl: primary,
      imageUrls,
      photoCount: photoUrls.length,
      results,
      level,
      model: 'gpt-image-2',
      sceneBrief: {
        sector_archetype: sceneBrief.sector_archetype,
        background_concept: sceneBrief.background_concept,
        logo_placement: sceneBrief.logo_placement,
        _source: sceneBrief._source,
      },
      durationMs: totalMs,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Enhancement pipeline failed';
    console.error('[enhance-product] pipeline error:', msg);
    return NextResponse.json(
      { error: msg, original: photoUrls[0] },
      { status: 500 },
    );
  }
}
