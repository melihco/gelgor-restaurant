/**
 * POST — analyze brand signals and build chatbot profile
 */
import { NextRequest, NextResponse } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';
export const maxDuration = 60;

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

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
): Promise<NextResponse> {
  const { workspaceId } = await context.params;
  const upstream = await proxyToCrewBackend(
    `/api/v1/brand-context/${workspaceId}/chatbot-profile/analyze`,
    { method: 'POST', workspaceId, body: {} },
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
