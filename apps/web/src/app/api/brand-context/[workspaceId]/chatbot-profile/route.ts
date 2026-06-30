/**
 * GET / PATCH — brand chatbot profile (Instagram DM + agent identity)
 */
import { NextRequest, NextResponse } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';
export const maxDuration = 30;

function snakeToCamel(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const camelKey = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (Array.isArray(v)) {
      out[camelKey] = v.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? snakeToCamel(item as Record<string, unknown>)
          : item,
      );
    } else {
      out[camelKey] = v && typeof v === 'object'
        ? snakeToCamel(v as Record<string, unknown>)
        : v;
    }
  }
  return out;
}

function camelToSnake(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const snakeKey = k.replace(/([A-Z])/g, (c) => `_${c.toLowerCase()}`);
    if (Array.isArray(v)) {
      out[snakeKey] = v.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? camelToSnake(item as Record<string, unknown>)
          : item,
      );
    } else {
      out[snakeKey] = v && typeof v === 'object'
        ? camelToSnake(v as Record<string, unknown>)
        : v;
    }
  }
  return out;
}

function mapProfileResponse(data: Record<string, unknown>) {
  const profileRaw = data.profile as Record<string, unknown> | null | undefined;
  return {
    profile: profileRaw ? snakeToCamel(profileRaw) : null,
    updatedAt: (data.updated_at as string | null) ?? null,
  };
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
): Promise<NextResponse> {
  const { workspaceId } = await context.params;
  const upstream = await proxyToCrewBackend(
    `/api/v1/brand-context/${workspaceId}/chatbot-profile`,
    { method: 'GET', workspaceId },
  );
  try {
    const data = await upstream.json() as Record<string, unknown>;
    return NextResponse.json(mapProfileResponse(data), { status: upstream.status });
  } catch {
    return upstream;
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
): Promise<NextResponse> {
  const { workspaceId } = await context.params;
  const rawBody = await req.json() as Record<string, unknown>;
  const body = camelToSnake(rawBody);

  const upstream = await proxyToCrewBackend(
    `/api/v1/brand-context/${workspaceId}/chatbot-profile`,
    { method: 'PATCH', workspaceId, body },
  );
  try {
    const data = await upstream.json() as Record<string, unknown>;
    const profileRaw = data.profile as Record<string, unknown> | null | undefined;
    return NextResponse.json({
      ok: data.ok ?? upstream.ok,
      profile: profileRaw ? snakeToCamel(profileRaw) : null,
      updatedAt: (data.updated_at as string | null) ?? null,
    }, { status: upstream.status });
  } catch {
    return upstream;
  }
}
