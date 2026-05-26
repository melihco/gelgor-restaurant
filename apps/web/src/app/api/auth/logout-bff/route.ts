import { NextRequest, NextResponse } from 'next/server';

/** Tarayıcı → Next (aynı origin); Nexus'taki `sa_session` çerezini tarayıcıya doğru iletir. */
const BACKEND =
  process.env.BACKEND_ORIGIN || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const base = BACKEND.replace(/\/$/, '');
  const cookieHeader = request.headers.get('cookie') ?? '';

  const upstream = await fetch(`${base}/api/security/logout`, {
    method: 'POST',
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
  });

  const bodyText = await upstream.text();
  let json: unknown = { status: 'signed_out' };
  try {
    if (bodyText) json = JSON.parse(bodyText) as unknown;
  } catch {
    json = { raw: bodyText.slice(0, 200) };
  }

  const res = NextResponse.json(json, { status: upstream.ok ? 200 : upstream.status });

  let setCookies: string[] =
    typeof upstream.headers.getSetCookie === 'function' ? upstream.headers.getSetCookie() : [];
  if (setCookies.length === 0) {
    const single = upstream.headers.get('set-cookie');
    if (single) setCookies = [single];
  }
  for (const line of setCookies) {
    res.headers.append('Set-Cookie', line);
  }

  return res;
}
