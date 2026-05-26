/**
 * POST /api/visual-review
 *
 * GPT-4o Vision ile bir tasarım/görsel üzerinde "insan gözü" kalite incelemesi.
 * Kreatif direktör perspektifinden: okunabilirlik, hiyerarşi, kompozisyon, marka uyumu, CTA.
 *
 * Body:
 *   imageUrl     - Analiz edilecek görsel (https:// veya data:image/...)
 *   context      - Opsiyonel: { brandName, contentType, platform, templateTitle, caption }
 *
 * Response:
 *   score        - 1–10 genel kalite skoru
 *   verdict      - 'excellent' | 'good' | 'needs_work' | 'poor'
 *   categories   - { textLegibility, visualHierarchy, composition, brandFit, ctaClarity }
 *   issues       - Bulunan sorunlar
 *   suggestions  - Aksiyon önerileri
 *   summary      - Tek cümlelik kreatif direktör yorumu
 */
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const maxDuration = 45;

export interface VisualReviewResult {
  score: number;
  verdict: 'excellent' | 'good' | 'needs_work' | 'poor';
  categories: {
    textLegibility: number;
    visualHierarchy: number;
    composition: number;
    brandFit: number;
    ctaClarity: number;
  };
  issues: string[];
  suggestions: string[];
  summary: string;
  analyzedAt: string;
}

interface ReviewContext {
  brandName?: string;
  contentType?: string;
  platform?: string;
  templateTitle?: string;
  caption?: string;
}

function verdictFromScore(score: number): VisualReviewResult['verdict'] {
  if (score >= 8) return 'excellent';
  if (score >= 6) return 'good';
  if (score >= 4) return 'needs_work';
  return 'poor';
}

function buildSystemPrompt(ctx: ReviewContext): string {
  const platform = ctx.platform ?? 'Instagram';
  const contentType = ctx.contentType ?? 'post';
  const brandName = ctx.brandName ? `Marka: ${ctx.brandName}. ` : '';
  const templateHint = ctx.templateTitle ? `Şablon: "${ctx.templateTitle}". ` : '';
  const captionHint = ctx.caption ? `İçerik özeti: "${ctx.caption.slice(0, 150)}". ` : '';

  return `Sen deneyimli bir kreatif direktörsün. ${platform} için üretilmiş bir ${contentType} tasarımını inceleyeceksin.
${brandName}${templateHint}${captionHint}

Tasarımı bir insan gözü gibi değerlendir:

1. **Metin Okunabilirliği (textLegibility)** — Tüm metinler yeterince büyük ve kontrastlı mı? Font seçimi okunabilir mi? Taşma veya çakışma var mı?
2. **Görsel Hiyerarşi (visualHierarchy)** — Göz nereye ilk gidiyor? Ana mesaj öne çıkıyor mu? Dikkat dağılıyor mu?
3. **Kompozisyon (composition)** — Denge, beyaz alan kullanımı, görsellerin yerleşimi, genel düzen profesyonel mi?
4. **Marka Uyumu (brandFit)** — Tasarım premium bir marka için uygun görünüyor mu? Renkler, ton, üslup tutarlı mı?
5. **CTA Netliği (ctaClarity)** — Çağrı metni (rezervasyon yap, keşfet vb.) varsa net mi ve görünür mü?

JSON formatında şu yapıyla yanıt ver:
{
  "score": <1-10 genel skor>,
  "categories": {
    "textLegibility": <1-10>,
    "visualHierarchy": <1-10>,
    "composition": <1-10>,
    "brandFit": <1-10>,
    "ctaClarity": <1-10>
  },
  "issues": ["<sorun 1>", "<sorun 2>"],
  "suggestions": ["<öneri 1>", "<öneri 2>"],
  "summary": "<Tek cümlelik kreatif direktör yorumu>"
}

Yalnızca JSON döndür. Açıklama ekleme.`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 503 });
  }

  let body: { imageUrl?: string; context?: ReviewContext };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { imageUrl, context = {} } = body;
  if (!imageUrl) {
    return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 });
  }

  // Normalize image for vision API
  let imageContent: OpenAI.Chat.Completions.ChatCompletionContentPartImage;
  if (imageUrl.startsWith('data:image/')) {
    imageContent = { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } };
  } else if (imageUrl.startsWith('http')) {
    // Domains that are stable permanent CDN links — safe to pass directly to OpenAI
    const DIRECT_SAFE = ['oaidalleapiprodscus', 'fal-cdn'];
    // Canva export-download URLs are pre-signed S3 links that expire quickly — always fetch
    // server-side and convert to base64 before sending to GPT-4o Vision.
    const needsProxy = !DIRECT_SAFE.some(d => imageUrl.includes(d));

    let resolvedUrl = imageUrl;
    if (needsProxy) {
      try {
        // Try direct fetch first (works for most CDN/static URLs)
        const directResp = await fetch(imageUrl, {
          signal: AbortSignal.timeout(10_000),
          headers: { 'User-Agent': 'SmartAgencyBot/1.0' },
        });
        if (directResp.ok) {
          const buf = Buffer.from(await directResp.arrayBuffer());
          const ct = directResp.headers.get('content-type') ?? 'image/jpeg';
          resolvedUrl = `data:${ct};base64,${buf.toString('base64')}`;
        } else {
          // Expired / forbidden — return a friendly error immediately
          const isExpired = imageUrl.includes('X-Amz-Expires') || imageUrl.includes('export-download.canva');
          const friendlyMsg = isExpired
            ? 'Canva önizleme bağlantısının süresi dolmuş. Lütfen sayfayı yenileyip yeniden deneyin.'
            : `Görsel indirilemedi (${directResp.status}). Bağlantının hâlâ geçerli olduğunu kontrol edin.`;
          return NextResponse.json({ error: friendlyMsg }, { status: 422 });
        }
      } catch {
        // Network error — fall back to proxying through our media-proxy
        try {
          const proxyResp = await fetch(
            `${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/api/media-proxy?url=${encodeURIComponent(imageUrl)}`,
            { signal: AbortSignal.timeout(8000) },
          );
          if (proxyResp.ok) {
            const buf = Buffer.from(await proxyResp.arrayBuffer());
            const ct = proxyResp.headers.get('content-type') ?? 'image/jpeg';
            resolvedUrl = `data:${ct};base64,${buf.toString('base64')}`;
          }
        } catch {
          // Both paths failed — proceed with direct URL and let GPT-4o try
        }
      }
    }
    imageContent = { type: 'image_url', image_url: { url: resolvedUrl, detail: 'high' } };
  } else {
    return NextResponse.json({ error: 'imageUrl must be https:// or data:image/...' }, { status: 400 });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: buildSystemPrompt(context) },
        {
          role: 'user',
          content: [
            imageContent,
            { type: 'text', text: 'Bu tasarımı kreatif direktör gözüyle değerlendir ve JSON döndür.' },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 600,
      temperature: 0.2,
    });

    const raw = resp.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as Partial<VisualReviewResult> & {
      categories?: Partial<VisualReviewResult['categories']> & Record<string, unknown>;
    };

    // Normalize and guard
    const cats: Partial<VisualReviewResult['categories']> & Record<string, unknown> = parsed.categories ?? {};
    const score = Math.min(10, Math.max(1, Math.round(Number(parsed.score) || 5)));
    const result: VisualReviewResult = {
      score,
      verdict: verdictFromScore(score),
      categories: {
        textLegibility:   Math.min(10, Math.max(1, Math.round(Number(cats.textLegibility)   || score))),
        visualHierarchy:  Math.min(10, Math.max(1, Math.round(Number(cats.visualHierarchy)  || score))),
        composition:      Math.min(10, Math.max(1, Math.round(Number(cats.composition)      || score))),
        brandFit:         Math.min(10, Math.max(1, Math.round(Number(cats.brandFit)         || score))),
        ctaClarity:       Math.min(10, Math.max(1, Math.round(Number(cats.ctaClarity)       || score))),
      },
      issues:      Array.isArray(parsed.issues)      ? (parsed.issues as string[]).slice(0, 6)      : [],
      suggestions: Array.isArray(parsed.suggestions) ? (parsed.suggestions as string[]).slice(0, 5) : [],
      summary:     typeof parsed.summary === 'string' ? parsed.summary : '',
      analyzedAt:  new Date().toISOString(),
    };

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Vision analysis failed: ${msg}` }, { status: 500 });
  }
}
