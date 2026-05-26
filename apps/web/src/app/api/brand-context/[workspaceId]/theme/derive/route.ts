/**
 * BFF route — force re-derive BrandTheme from latest brand signals.
 * POST /api/brand-context/{workspaceId}/theme/derive
 */
import { NextRequest, NextResponse } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';
export const maxDuration = 30;

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

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
): Promise<NextResponse> {
  const { workspaceId } = await context.params;
  const upstream = await proxyToCrewBackend(
    `/api/v1/brand-context/${workspaceId}/theme/derive`,
    { method: 'POST', workspaceId },
  );
  try {
    const data = await upstream.json() as Record<string, unknown>;
    const theme = data.theme as Record<string, unknown> | null | undefined;
    return NextResponse.json({
      theme: theme ? snakeToCamel(theme) : null,
      updatedAt: data.updated_at,
    }, { status: upstream.status });
  } catch {
    return upstream;
  }
}
