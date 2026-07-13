import { NextRequest, NextResponse } from 'next/server';
import { isHostedBackendMisconfigured, resolveServerApiBaseUrl } from '@/lib/backend-origin';
import { isJwtExpired } from '@/lib/jwt-tenant';

export const runtime = 'nodejs';
export const maxDuration = 360;

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

/** Nexus reads Bearer or sa_session cookie — forward cookie as Bearer when needed. */
function ensureUpstreamAuth(req: NextRequest, headers: Headers): void {
  const auth = headers.get('authorization')?.trim() ?? '';
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    if (token && isJwtExpired(token)) {
      headers.delete('authorization');
    }
  }
  if (headers.get('authorization')?.trim()) return;
  const cookie = req.headers.get('cookie') ?? '';
  const match = cookie.match(/(?:^|;\s*)sa_session=([^;]+)/i);
  const token = match?.[1] ? decodeURIComponent(match[1].trim()) : '';
  if (token && !isJwtExpired(token)) {
    headers.set('Authorization', `Bearer ${token}`);
  }
}

async function proxyToNexus(req: NextRequest, pathSegments: string[]): Promise<NextResponse> {
  if (isHostedBackendMisconfigured()) {
    return NextResponse.json(
      {
        error: 'backend_not_configured',
        message:
          'NEXUS_API_URL veya BACKEND_ORIGIN ortam değişkeni Railway/Render API adresinize ayarlanmalı.',
      },
      { status: 503 },
    );
  }

  const backend = resolveServerApiBaseUrl();
  const path = pathSegments.join('/');
  const target = `${backend}/api/${path}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  ensureUpstreamAuth(req, headers);

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, { ...init, signal: AbortSignal.timeout(120_000) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: 'nexus_api_unreachable',
        message: `Could not reach Nexus API: ${message}`,
        hint: 'API may be restarting — retry in a few seconds.',
      },
      { status: 503 },
    );
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  // Buffer the upstream body instead of streaming. Streaming pipes throw
  // "failed to pipe response" / UND_ERR_SOCKET when Nexus closes mid-transfer
  // (restart, timeout, or large artifact payloads) and can tear down the
  // Next.js request worker. Buffering turns that into a clean 502.
  let body: ArrayBuffer;
  try {
    body = await upstream.arrayBuffer();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: 'nexus_upstream_terminated',
        message: `Nexus API closed the connection while streaming: ${message}`,
        hint: 'API may have restarted or timed out — retry the request.',
      },
      { status: 502 },
    );
  }

  return new NextResponse(body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxyToNexus(req, path);
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxyToNexus(req, path);
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxyToNexus(req, path);
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxyToNexus(req, path);
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxyToNexus(req, path);
}

export async function OPTIONS(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxyToNexus(req, path);
}
