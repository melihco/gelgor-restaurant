import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 20;

function toPublicUrl(input: string | undefined, origin: string): string | undefined {
  if (!input) return undefined;
  const url = input.trim();
  if (!url) return undefined;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `${origin}${url}`;
  return `${origin}/${url}`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as { url?: string; kind?: 'image' | 'video' } | null;
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, '');
  const resolvedUrl = toPublicUrl(body?.url, origin);
  const kind = body?.kind ?? 'image';

  if (!resolvedUrl) return NextResponse.json({ reachable: false, error: 'url is required' }, { status: 400 });

  try {
    const res = await fetch(resolvedUrl, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      return NextResponse.json({
        reachable: false,
        status: res.status,
        error: `URL is not reachable (${res.status})`,
        url: resolvedUrl,
      });
    }
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (kind === 'image' && ct && !ct.startsWith('image/')) {
      return NextResponse.json({ reachable: false, error: `Invalid image content-type (${ct})`, url: resolvedUrl });
    }
    if (kind === 'video' && ct && !ct.startsWith('video/')) {
      return NextResponse.json({ reachable: false, error: `Invalid video content-type (${ct})`, url: resolvedUrl });
    }
    return NextResponse.json({ reachable: true, url: resolvedUrl, contentType: ct || undefined });
  } catch (err) {
    return NextResponse.json({
      reachable: false,
      error: err instanceof Error ? err.message : 'Media check failed',
      url: resolvedUrl,
    });
  }
}
