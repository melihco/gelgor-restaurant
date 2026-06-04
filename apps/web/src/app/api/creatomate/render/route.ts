/**
 * POST /api/creatomate/render
 *
 * Render a Creatomate template with brand-aware modifications.
 * Accepts the same CanvaAutofillField data shape used by autofill-design
 * so callers can swap provider without changing their payload.
 *
 * Body:
 *   templateId     — Creatomate template ID (from /api/creatomate/templates)
 *   title          — Design title (for logging)
 *   data           — { [fieldName]: { type:'text', text:string } | { type:'image', asset_id: url } }
 *   workspaceId    — optional, for brand kit resolution
 *
 * Response: { renderId, status, outputUrl, thumbnailUrl? }
 */
import { NextRequest, NextResponse } from 'next/server';
import type { CanvaAutofillField } from '@/lib/canva-template-selection';
import { getRendererAdapter } from '@/lib/renderer-adapters';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: {
    templateId?: string;
    title?: string;
    data?: Record<string, CanvaAutofillField>;
    workspaceId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.templateId) {
    return NextResponse.json({ error: 'templateId required' }, { status: 400 });
  }

  let adapter;
  try {
    adapter = await getRendererAdapter('creatomate');
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Creatomate not configured' },
      { status: 503 },
    );
  }

  try {
    const result = await adapter.render({
      templateId: body.templateId,
      title: body.title ?? 'SmartAgency render',
      data: body.data ?? {},
    });

    const outputUrl = result.job?.urls?.[0]
      ?? result.design?.url
      ?? result.design?.urls?.edit_url
      ?? null;

    return NextResponse.json({
      success: Boolean(outputUrl),
      renderId: result.job?.id,
      status: result.job?.status,
      outputUrl,
      thumbnailUrl: result.design?.thumbnail?.url ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
