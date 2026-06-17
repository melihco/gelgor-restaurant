/**
 * POST /api/brief-produce
 *
 * Bridges "New Brief" form → auto-produce pipeline.
 * Converts brief fields into ParsedIdea[], then calls /api/auto-produce internally
 * (bypassing quality gates via X-Internal-Api-Key so photo-less brands can still produce).
 *
 * Returns: { produced, artifacts } on success or { error } on failure.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { ParsedIdea } from '../auto-produce/caption-publish-resolver';

export const runtime = 'nodejs';
export const maxDuration = 300;

type OutputType = 'story' | 'reel' | 'post' | 'caption' | 'ad' | 'report';

function mapContentType(outputType: OutputType): string {
  switch (outputType) {
    case 'story': return 'story';
    case 'reel':  return 'reel';
    case 'post':  return 'feed_post';
    default:      return 'feed_post';
  }
}

function buildIdeas(
  title: string,
  description: string,
  outputType: OutputType,
  count: number,
  photoUrls: string[],
): ParsedIdea[] {
  const contentType = mapContentType(outputType);
  return Array.from({ length: count }, (_, i) => {
    const idea: ParsedIdea = {
      headline: title,
      caption_draft: description || title,
      content_type: contentType,
      visual_direction: description || title,
      strategic_purpose: description || title,
    };
    if (photoUrls.length > 0) {
      idea.selected_gallery_url = photoUrls[i % photoUrls.length];
    }
    return idea;
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: {
    workspaceId?: string;
    title?: string;
    description?: string;
    outputType?: OutputType;
    count?: string | number;
    photoUrls?: string[];
    priority?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    workspaceId,
    title = '',
    description = '',
    outputType = 'post',
    count,
    photoUrls = [],
  } = body;

  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }
  if (!title.trim()) {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }

  const ideaCount = Math.min(Math.max(parseInt(String(count ?? 1)), 1), 10);
  const ideas = buildIdeas(title, description, outputType, ideaCount, photoUrls);

  const BASE = (process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000').replace(/\/$/, '');
  const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';

  // Tenant header so auto-produce can validate the workspace
  const tenantId = req.headers.get('X-Tenant-Id') || workspaceId;
  const officeId = req.headers.get('X-Office-Id') || '';

  try {
    const res = await fetch(`${BASE}/api/auto-produce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Api-Key': INTERNAL_KEY,
        'X-Tenant-Id': tenantId,
        ...(officeId ? { 'X-Office-Id': officeId } : {}),
      },
      body: JSON.stringify({
        workspaceId,
        ideas,
        creativeBrief: [title, description].filter(Boolean).join('\n'),
        bundleCards: outputType === 'story',
        skipArtifactDedupe: false,
      }),
      signal: AbortSignal.timeout(270_000),
    });

    const data = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      console.error('[brief-produce] auto-produce error:', data.error);
      return NextResponse.json(
        { error: (data.error as string) ?? 'İçerik üretimi başarısız', code: data.code },
        { status: res.status },
      );
    }

    return NextResponse.json({
      ok: true,
      produced: data.produced ?? 0,
      artifacts: data.artifacts ?? [],
    });
  } catch (err: any) {
    console.error('[brief-produce] fetch error:', err?.message);
    return NextResponse.json(
      { error: err?.message ?? 'İçerik üretimi sırasında hata oluştu' },
      { status: 500 },
    );
  }
}
