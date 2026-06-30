/**
 * POST /api/brief-suggest-direction
 * Suggests brand-specific Vibe & Direction copy for the New Brief form.
 */
import { NextRequest, NextResponse } from 'next/server';
import { suggestBriefDirection } from '@/lib/brand-creative-director';
import { serverConfig } from '@/lib/server-config';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: {
    workspaceId?: string;
    title?: string;
    outputType?: 'story' | 'reel' | 'post';
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { workspaceId, title = '', outputType = 'story' } = body;
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }
  if (!title.trim()) {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }
  if (!['story', 'reel', 'post'].includes(outputType)) {
    return NextResponse.json({ error: 'Invalid outputType' }, { status: 400 });
  }

  try {
    const CREW_BACKEND = serverConfig.crewBackend.baseUrl;
    const INTERNAL_KEY = serverConfig.internal.apiKey;
    const brandRes = await fetch(`${CREW_BACKEND}/api/v1/brand-context/${workspaceId}`, {
      headers: {
        'X-Internal-Api-Key': INTERNAL_KEY,
        'X-Tenant-Id': workspaceId,
      },
      signal: AbortSignal.timeout(15_000),
    });
    const brandCtx = brandRes.ok
      ? (await brandRes.json()) as Record<string, unknown>
      : {};

    const locale = String(brandCtx.inferred_language ?? brandCtx.locale ?? 'tr');
    const direction = await suggestBriefDirection({
      title: title.trim(),
      outputType,
      brandName: String(brandCtx.business_name ?? brandCtx.brand_name ?? 'Brand'),
      brandBusinessType: String(brandCtx.business_type ?? ''),
      brandLocation: String(brandCtx.location ?? ''),
      brandTone: String(brandCtx.brand_tone ?? ''),
      brandDescription: String(brandCtx.description ?? ''),
      visualDna: String(brandCtx.visual_dna ?? ''),
      locale,
    });

    if (!direction) {
      return NextResponse.json({ error: 'Öneri oluşturulamadı' }, { status: 502 });
    }

    return NextResponse.json({ ok: true, direction });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Öneri oluşturulamadı';
    console.error('[brief-suggest-direction]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
