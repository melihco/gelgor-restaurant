/**
 * BFF route — proxies BrandTheme requests to the Python Crew backend.
 *
 * GET  /api/brand-context/{workspaceId}/theme           → get (or derive on-demand)
 * POST /api/brand-context/{workspaceId}/theme/derive    → force re-derive (handled in derive/route.ts)
 * PUT  /api/brand-context/{workspaceId}/theme           → manual override
 *
 * NOTE: Python returns snake_case; we normalise to camelCase here so the
 * frontend BrandTheme interface (camelCase) is satisfied transparently.
 */
import { NextRequest, NextResponse } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';
export const maxDuration = 30;

/** Shallow snake_case → camelCase converter for a plain object */
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

/** Shallow camelCase → snake_case converter for a plain object */
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

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
): Promise<NextResponse> {
  const { workspaceId } = await context.params;
  const upstream = await proxyToCrewBackend(
    `/api/v1/brand-context/${workspaceId}/theme`,
    { method: 'GET', workspaceId },
  );
  // Normalise snake_case → camelCase for the frontend
  try {
    const data = await upstream.json() as { theme: Record<string, unknown> | null; updated_at: string | null };
    const normalised = {
      theme: data.theme ? snakeToCamel(data.theme) : null,
      updatedAt: data.updated_at,
    };
    return NextResponse.json(normalised, { status: upstream.status });
  } catch {
    return upstream;
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
): Promise<NextResponse> {
  const { workspaceId } = await context.params;
  const rawBody = await req.json() as { theme?: Record<string, unknown> };

  // Convert camelCase theme keys → snake_case before sending to Python Pydantic schema
  const body = rawBody.theme
    ? { theme: camelToSnake(rawBody.theme) }
    : rawBody;

  const upstream = await proxyToCrewBackend(
    `/api/v1/brand-context/${workspaceId}/theme`,
    { method: 'PUT', workspaceId, body },
  );
  try {
    const data = await upstream.json() as { theme: Record<string, unknown> | null; updated_at?: string | null; ok?: boolean };
    const normalised = {
      ok: data.ok ?? true,
      theme: data.theme ? snakeToCamel(data.theme) : null,
      updatedAt: data.updated_at ?? null,
    };
    return NextResponse.json(normalised, { status: upstream.status });
  } catch {
    return upstream;
  }
}
