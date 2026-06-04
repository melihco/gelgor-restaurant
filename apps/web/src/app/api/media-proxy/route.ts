/**
 * External media proxy for Canvas CORS issues.
 * Used when brand venue photos from external domains (e.g. yulabodrum.com)
 * can't be loaded directly due to CORS restrictions in canvas.drawImage().
 *
 * Only proxies image content types — rejects non-image responses.
 */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 15;

const ALLOWED_HOSTS = [
  'yulabodrum.com', 'sarnıc.com', 'localhost', '127.0.0.1',
  // Add brand domains as needed
];

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'url param required' }, { status: 400 });

  let parsed: URL;
  try { parsed = new URL(url); }
  catch { return NextResponse.json({ error: 'invalid url' }, { status: 400 }); }

  if (!parsed.protocol.startsWith('http')) {
    return NextResponse.json({ error: 'only http(s) urls allowed' }, { status: 400 });
  }

  const isInstagram = parsed.hostname.includes('cdninstagram.com') ||
                      parsed.hostname.includes('fbcdn.net');
  const isWix       = parsed.hostname.includes('wixstatic.com');

  // Strategy: try with site Referer first, then without Referer on 403
  const fetchWithReferer = (targetUrl: string, referer: string | null) => {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    };
    if (referer !== null) headers['Referer'] = referer;
    if (isInstagram) {
      headers['Sec-Fetch-Dest'] = 'image';
      headers['Sec-Fetch-Mode'] = 'no-cors';
      headers['Sec-Fetch-Site'] = 'cross-site';
    }
    return fetch(targetUrl, { headers, signal: AbortSignal.timeout(10_000), redirect: 'follow' });
  };

  try {
    // First attempt: use origin as Referer (works for most CDNs)
    const firstReferer = isInstagram ? 'https://www.instagram.com/' : isWix ? `https://${parsed.hostname}/` : parsed.origin;
    let upstream = await fetchWithReferer(url, firstReferer);

    // 403: retry without Referer — Wix and some CDNs block cross-origin Referer
    if (upstream.status === 403) {
      upstream = await fetchWithReferer(url, null);
    }

    if (!upstream.ok) {
      // Still 403 after retry (Instagram expired URL, truly blocked) →
      // Return transparent 1×1 GIF so <img> tags and Canvas don't break
      if (upstream.status === 403 || upstream.status === 410) {
        // 404 so <img>/Remotion fail visibly — 1×1 GIF caused "kırık" blank story frames.
        return NextResponse.json(
          { error: 'upstream expired or forbidden', status: upstream.status },
          { status: 404, headers: { 'X-Proxy-Status': 'expired' } },
        );
      }
      return NextResponse.json({ error: `upstream ${upstream.status}` }, { status: 502 });
    }

    const ct = upstream.headers.get('content-type') ?? '';
    // Trust the URL extension if content-type is ambiguous
    const urlLower = url.toLowerCase();
    const looksLikeImage = ct.startsWith('image/')
      || urlLower.endsWith('.jpg') || urlLower.endsWith('.jpeg')
      || urlLower.endsWith('.png') || urlLower.endsWith('.webp')
      || urlLower.endsWith('.avif');

    if (!looksLikeImage) {
      return NextResponse.json({ error: 'not an image' }, { status: 400 });
    }

    const buf = await upstream.arrayBuffer();
    const imageContentType = ct.startsWith('image/') ? ct : 'image/jpeg';

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': imageContentType,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
