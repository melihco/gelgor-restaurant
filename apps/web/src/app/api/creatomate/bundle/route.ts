/**
 * POST /api/creatomate/bundle
 *
 * Generates a Creatomate brand bundle (2 story + 1 post) for one content idea
 * and saves all artifacts to Nexus Feed.
 *
 * Called fire-and-forget from /api/auto-produce when CREATOMATE_API_KEY is set.
 * Reads brand vibe profile from Python to get real brand tokens.
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import { serverConfig } from '@/lib/server-config';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: {
    workspaceId?: string;
    missionId?: string;
    nodeKey?: string;
    bundleId?: string;
    photoUrl?: string;
    title?: string;
    subtitle?: string;
    brandName?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { workspaceId, photoUrl, title, subtitle, brandName, missionId, nodeKey, bundleId } = body;
  if (!workspaceId || !photoUrl) {
    return NextResponse.json({ error: 'workspaceId and photoUrl required' }, { status: 400 });
  }

  const creatKey = serverConfig.creatomate.apiKey ?? '';
  if (!creatKey) {
    return NextResponse.json({ error: 'CREATOMATE_API_KEY not set' }, { status: 503 });
  }

  // Delegate to Python which has DB access for brand tokens
  const res = await fetchCrewBackendJson(`/api/v1/brand-context/${workspaceId}/creatomate-bundle`, {
    workspaceId,
    method: 'POST',
    body: {
      api_key: creatKey,
      photo_url: photoUrl,
      title: title ?? '',
      subtitle: subtitle ?? '',
      brand_name: brandName ?? '',
      mission_id: missionId,
      node_key: nodeKey,
      bundle_id: bundleId,
    },
    timeoutMs: 280_000,
  });

  if (!res.ok) {
    return NextResponse.json({ error: res.error ?? 'bundle failed', status: res.status }, { status: 502 });
  }

  return NextResponse.json(res.data, { status: 200 });
}
