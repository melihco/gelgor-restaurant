/**
 * PATCH — merge AI visual production settings into brand_theme (no full BrandTheme body).
 */
import { NextRequest, NextResponse } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';
export const maxDuration = 15;

function snakeToCamel(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const camelKey = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camelKey] = v && typeof v === 'object' && !Array.isArray(v)
      ? snakeToCamel(v as Record<string, unknown>)
      : v;
  }
  return out;
}

function camelToSnake(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const snakeKey = k.replace(/([A-Z])/g, (c) => `_${c.toLowerCase()}`);
    out[snakeKey] = v && typeof v === 'object' && !Array.isArray(v)
      ? camelToSnake(v as Record<string, unknown>)
      : v;
  }
  return out;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
): Promise<NextResponse> {
  const { workspaceId } = await context.params;
  const rawBody = await req.json() as Record<string, unknown>;
  const body = camelToSnake(rawBody);

  const upstream = await proxyToCrewBackend(
    `/api/v1/brand-context/${workspaceId}/theme/ai-settings`,
    { method: 'PATCH', workspaceId, body },
  );

  try {
    const data = await upstream.json() as {
      ok?: boolean;
      theme?: Record<string, unknown> | null;
      updated_at?: string | null;
    };
    return NextResponse.json({
      ok: data.ok ?? upstream.ok,
      theme: data.theme ? snakeToCamel(data.theme) : null,
      updatedAt: data.updated_at ?? null,
    }, { status: upstream.status });
  } catch {
    return upstream;
  }
}
