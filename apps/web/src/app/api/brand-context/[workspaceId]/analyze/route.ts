import { NextRequest, NextResponse } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';
export const maxDuration = 300;  // deep crawl + Apify + bounded CDN mirror

const CDN_HOSTS = ['cdninstagram.com', 'fbcdn.net', 'scontent'];
const MAX_CDN_MIRROR = 24;

function asAnalyzePayload(data: Record<string, unknown>): Record<string, unknown> {
  return {
    success: data.success !== false,
    ...data,
  };
}

/** Download a CDN URL and re-upload to R2 for permanent storage. */
async function mirrorToR2(cdnUrl: string, workspaceId: string): Promise<string> {
  const { isR2Configured, generateStorageKey, uploadToR2 } = await import('@/lib/r2-storage');
  if (!isR2Configured()) return cdnUrl;

  const res = await fetch(cdnUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Referer': 'https://www.instagram.com/',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return cdnUrl;

  const ct = res.headers.get('content-type') ?? 'image/jpeg';
  const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
  const buf = await res.arrayBuffer();
  const b64 = `data:${ct};base64,${Buffer.from(buf).toString('base64')}`;
  const key = generateStorageKey(`brand-ref/${workspaceId}`, 'image', ext);
  const result = await uploadToR2(b64, key, ct);
  return result.url;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;

  const normalized = {
    website_url: String(body.website_url ?? body.websiteUrl ?? '').trim(),
    instagram_handle: String(body.instagram_handle ?? body.instagramHandle ?? '').trim(),
    google_business_url: String(body.google_business_url ?? body.googleBusinessUrl ?? '').trim(),
    menu_url: String(body.menu_url ?? body.menuUrl ?? '').trim(),
    brand_name: String(body.brand_name ?? body.brandName ?? body.companyName ?? '').trim(),
  };

  const pyRes = await proxyToCrewBackend(`/api/v1/brand-context/${workspaceId}/analyze`, {
    body: normalized,
    timeoutMs: 280_000,
  });

  const onboardingAnalyze = request.headers.get('x-onboarding-analyze') === '1';
  const skipCdnMirror = onboardingAnalyze || request.headers.get('x-skip-cdn-mirror') === '1';

  // After analysis: mirror Instagram CDN image URLs to R2 so they don't expire
  try {
    const data = await pyRes.clone().json() as Record<string, unknown>;
    const refUrls = data.reference_image_urls as string[] | undefined;
    if (
      !skipCdnMirror
      && Array.isArray(refUrls)
      && refUrls.length <= 60
      && refUrls.some(u => CDN_HOSTS.some(h => u.includes(h)))
    ) {
      const mirrored = await Promise.allSettled(
        refUrls.map(async (url) => {
          if (CDN_HOSTS.some(h => url.includes(h))) {
            try { return await mirrorToR2(url, workspaceId); } catch { return url; }
          }
          return url;
        })
      );
      const permanentUrls = mirrored.map((r, i) =>
        r.status === 'fulfilled' ? r.value : (refUrls[i] ?? '')
      );

      // Patch the Python brand context with permanent URLs
      if (permanentUrls.some((u, i) => u !== refUrls[i])) {
        await fetch(`${process.env.CREW_BACKEND_URL || 'http://localhost:8000'}/api/v1/brand-context/${workspaceId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference_image_urls: JSON.stringify(permanentUrls) }),
        }).catch(() => {/* non-fatal */});

        // Return response with updated URLs
        const updated = { ...data, reference_image_urls: permanentUrls };
        return NextResponse.json(updated, { status: 200 });
      }
    }
  } catch { /* non-fatal — return original response */ }

  // SaaS / dijital markalar: crawl'dan foto gelmezse sektör galerisi oluştur
  if (onboardingAnalyze) {
    return pyRes;
  }
  try {
    const provisionRes = await fetch(`${request.nextUrl.origin}/api/brand-context/${workspaceId}/provision-gallery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analyze: true, allowSynthetic: false }),
    });
    if (provisionRes.ok) {
      const prov = await provisionRes.json() as { provisioned?: boolean; usableCount?: number };
      if (prov.provisioned) {
        const refreshed = await fetch(
          `${process.env.CREW_BACKEND_URL || 'http://localhost:8000'}/api/v1/brand-context/${workspaceId}`,
          { headers: { 'X-Internal-Api-Key': process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key' } },
        );
        if (refreshed.ok) {
          const ctx = await refreshed.json() as Record<string, unknown>;
          const analyzeData = await pyRes.clone().json() as Record<string, unknown>;
          return NextResponse.json(
            asAnalyzePayload({
              ...analyzeData,
              brand_context: ctx,
              reference_image_urls: analyzeData.reference_image_urls,
            }),
            { status: 200 },
          );
        }
      }
    }
  } catch { /* non-fatal */ }

  return pyRes;
}
