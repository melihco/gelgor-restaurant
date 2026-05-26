import { NextRequest, NextResponse } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';
export const maxDuration = 180;  // deep crawl + Apify can take up to 2 min

const CDN_HOSTS = ['cdninstagram.com', 'fbcdn.net', 'scontent'];

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
  const body = await request.json().catch(() => null);

  const pyRes = await proxyToCrewBackend(`/api/v1/brand-context/${workspaceId}/analyze`, {
    body,
    timeoutMs: 170_000,
  });

  // After analysis: mirror Instagram CDN image URLs to R2 so they don't expire
  try {
    const data = await pyRes.clone().json() as Record<string, unknown>;
    const refUrls = data.reference_image_urls as string[] | undefined;
    if (Array.isArray(refUrls) && refUrls.some(u => CDN_HOSTS.some(h => u.includes(h)))) {
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

  return pyRes;
}
