/**
 * POST /api/brand-context/{workspaceId}/provision-gallery
 *
 * Analyzes gallery vision coverage. Does NOT inject stock/Unsplash photos unless
 * allowSynthetic=true is explicitly passed (legacy opt-in only).
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchCrewBackendJson, proxyToCrewBackend } from '@/lib/crew-proxy';
import {
  mergeSectorGallerySeed,
  resolveSyntheticGalleryTarget,
} from '@/lib/sector-gallery-seed';
import { parseStringOrArray } from '@/lib/brand-readiness';
import {
  filterReachableGalleryUrls,
  filterUsableGalleryPhotoUrls,
  stripStockGalleryUrls,
} from '@/lib/media-url';
import { isSafeHttpHost } from '@/lib/trusted-media-hosts';

const EPHEMERAL_CDN_SNIPPETS = ['cdninstagram.com', 'fbcdn.net', 'scontent'];

async function mirrorEphemeralGalleryUrls(urls: string[], workspaceId: string): Promise<string[]> {
  const needsMirror = urls.some((u) => EPHEMERAL_CDN_SNIPPETS.some((h) => u.includes(h)));
  if (!needsMirror) return urls;

  const { isR2Configured, generateStorageKey, uploadToR2 } = await import('@/lib/r2-storage');
  if (!isR2Configured()) return urls;

  const mirrored = await Promise.all(
    urls.map(async (url) => {
      if (!EPHEMERAL_CDN_SNIPPETS.some((h) => url.includes(h))) return url;
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0',
            Referer: 'https://www.instagram.com/',
          },
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) return url;
        const ct = res.headers.get('content-type') ?? 'image/jpeg';
        const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
        const buf = await res.arrayBuffer();
        const key = generateStorageKey(`${workspaceId}/gallery`, 'image', ext);
        const result = await uploadToR2(
          `data:${ct};base64,${Buffer.from(buf).toString('base64')}`,
          key,
          ct,
        );
        return result.url || url;
      } catch {
        return url;
      }
    }),
  );

  return mirrored.filter(Boolean);
}

/** Website hotlink URLs often 403 HEAD without referer — mirror or keep if host is safe. */
async function prepareGalleryUrlsForPersistence(
  urls: string[],
  workspaceId: string,
): Promise<string[]> {
  const mirrored = await mirrorEphemeralGalleryUrls(urls, workspaceId);
  const beforeHealth = mirrored.length;
  const health = await filterReachableGalleryUrls(mirrored, {
    maxProbe: 120,
    concurrency: 10,
    strict: true,
  });
  if (health.rejected.length > 0) {
    console.warn(
      `[provision-gallery] Dropped ${health.rejected.length} unreachable gallery URLs for ${workspaceId}`,
    );
  }
  // Keep safe CDN URLs that failed probe (often 403 hotlink) — production uses media-proxy.
  const rejectedSafe = health.rejected
    .filter((r) => isSafeHttpHost(r.url))
    .map((r) => r.url);
  const merged = [...health.urls];
  for (const u of rejectedSafe) {
    if (!merged.includes(u)) merged.push(u);
  }
  if (merged.length < beforeHealth && rejectedSafe.length > 0) {
    console.warn(
      `[provision-gallery] Retained ${rejectedSafe.length} hotlink-protected CDN URLs for ${workspaceId}`,
    );
  }
  return merged;
}

export const runtime = 'nodejs';
export const maxDuration = 300;

async function runGalleryAnalyzeCoverage(origin: string, workspaceId: string): Promise<{
  newlyAnalyzed: number;
  remaining: number;
  complete: boolean;
}> {
  let totalNew = 0;
  let remaining = 1;
  let complete = false;

  for (let batch = 0; batch < 6 && remaining > 0; batch++) {
    const res = await fetch(`${origin}/api/gallery-intelligence/${workspaceId}/analyze-coverage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: 'standard', maxImages: 25 }),
      signal: AbortSignal.timeout(280_000),
    }).catch(() => null);

    if (!res?.ok) break;
    const data = (await res.json()) as {
      newlyAnalyzed?: number;
      remaining?: number;
      complete?: boolean;
    };
    totalNew += data.newlyAnalyzed ?? 0;
    remaining = data.remaining ?? 0;
    complete = Boolean(data.complete);
    if ((data.newlyAnalyzed ?? 0) === 0 && remaining > 0) break;
  }

  return { newlyAnalyzed: totalNew, remaining, complete };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    analyze?: boolean;
    allowSynthetic?: boolean;
  };
  const shouldAnalyze = body.analyze !== false;
  const allowSynthetic = body.allowSynthetic === true;

  const ctxRes = await fetchCrewBackendJson<{
    reference_image_urls?: unknown;
    business_type?: string;
    logo_url?: string | null;
  }>(`/api/v1/brand-context/${workspaceId}`, { workspaceId });

  if (!ctxRes.ok || !ctxRes.data) {
    return NextResponse.json({ error: 'brand context not found' }, { status: 404 });
  }

  const ctx = ctxRes.data;
  const existing = parseStringOrArray(ctx.reference_image_urls);
  const logo = (ctx.logo_url ?? '').trim();
  let usable = filterUsableGalleryPhotoUrls(
    existing.filter((u) => !logo || u !== logo),
  );

  const stockRemoved = usable.length - stripStockGalleryUrls(usable).length;
  if (stockRemoved > 0 || !allowSynthetic) {
    usable = stripStockGalleryUrls(usable);
  }

  const target = allowSynthetic
    ? resolveSyntheticGalleryTarget(ctx.business_type, usable.length)
    : usable.length;

  const { urls: mergedUrls, added, provisioned } = allowSynthetic
    ? mergeSectorGallerySeed(usable, ctx.business_type, target)
    : { urls: usable, added: 0, provisioned: false };

  let urls = mergedUrls;
  let unreachableRemoved = 0;
  if (urls.length > 0) {
    const beforeHealth = urls.length;
    urls = await prepareGalleryUrlsForPersistence(urls, workspaceId);
    unreachableRemoved = beforeHealth - urls.length;
  }

  if (!allowSynthetic) {
    urls = stripStockGalleryUrls(urls);
  }

  const normalizedExisting = existing.filter((u) => !logo || u !== logo);
  const galleryChanged = provisioned
    || stockRemoved > 0
    || unreachableRemoved > 0
    || urls.length !== normalizedExisting.length
    || urls.some((u, i) => u !== normalizedExisting[i]);

  if (!galleryChanged) {
    let analyzeSummary = null;
    if (shouldAnalyze && urls.length > 0) {
      analyzeSummary = await runGalleryAnalyzeCoverage(req.nextUrl.origin, workspaceId);
    }
    return NextResponse.json({
      provisioned: false,
      stockRemoved,
      unreachableRemoved,
      usableCount: urls.length,
      target,
      analyze: analyzeSummary,
      message: urls.length > 0
        ? unreachableRemoved > 0
          ? `${unreachableRemoved} kırık görsel çıkarıldı — ${urls.length} fotoğraf kullanılabilir.`
          : 'Galeri yeterli — yalnızca marka fotoğrafları kullanılıyor.'
        : unreachableRemoved > 0
          ? `${unreachableRemoved} kırık görsel çıkarıldı — geçerli fotoğraf kalmadı.`
          : 'Galeri boş — web sitesinden analiz veya manuel yükleme gerekli.',
    });
  }

  const patchRes = await proxyToCrewBackend(
    `/api/v1/brand-context/${workspaceId}`,
    {
      method: 'PATCH',
      body: { reference_image_urls: JSON.stringify(urls) },
      workspaceId,
      timeoutMs: 15_000,
    },
  );

  if (!patchRes.ok) {
    const err = await patchRes.text().catch(() => '');
    return NextResponse.json({ error: err || 'PATCH failed' }, { status: patchRes.status });
  }

  let analyzeSummary = null;
  if (shouldAnalyze && urls.length > 0) {
    analyzeSummary = await runGalleryAnalyzeCoverage(req.nextUrl.origin, workspaceId);
  }

  return NextResponse.json({
    provisioned: provisioned || stockRemoved > 0 || unreachableRemoved > 0,
    added,
    stockRemoved,
    unreachableRemoved,
    usableCount: urls.length,
    target,
    sector: ctx.business_type ?? 'general_business',
    analyze: analyzeSummary,
    message: unreachableRemoved > 0
      ? `${unreachableRemoved} kırık görsel çıkarıldı — ${urls.length} fotoğraf kaydedildi.`
      : stockRemoved > 0 && !provisioned
        ? `${stockRemoved} stok görseli galeriden kaldırıldı.`
        : provisioned
          ? `${added} sektör görseli galeriye eklendi (legacy allowSynthetic).`
          : 'Galeri güncellendi.',
  });
}
