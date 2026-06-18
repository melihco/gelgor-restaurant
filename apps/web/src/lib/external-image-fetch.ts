/**
 * Fetch external image bytes — same Referer / retry strategy as /api/media-proxy.
 * Used by enhance + compositors to avoid unreliable self-loopback on Render.
 */
export async function fetchExternalImageBuffer(
  url: string,
  timeoutMs = 20_000,
): Promise<Buffer | null> {
  if (!url.startsWith('http')) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (!parsed.protocol.startsWith('http')) return null;

  const isInstagram = parsed.hostname.includes('cdninstagram.com')
    || parsed.hostname.includes('fbcdn.net');
  const isWix = parsed.hostname.includes('wixstatic.com');

  const buildFetch = (referer: string | null) => {
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    };
    if (referer !== null) headers.Referer = referer;
    if (isInstagram) {
      headers['Sec-Fetch-Dest'] = 'image';
      headers['Sec-Fetch-Mode'] = 'no-cors';
      headers['Sec-Fetch-Site'] = 'cross-site';
    }
    return fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
  };

  try {
    const firstReferer = isInstagram
      ? 'https://www.instagram.com/'
      : isWix
        ? `https://${parsed.hostname}/`
        : parsed.origin;
    let res = await buildFetch(firstReferer);
    if (res.status === 403) res = await buildFetch(null);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}
