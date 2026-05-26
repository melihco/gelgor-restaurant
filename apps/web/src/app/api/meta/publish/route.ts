import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 120; // video container processing can take ~60s

const CREW_API = process.env.CREW_BACKEND_URL ?? 'http://localhost:8000';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null);
  if (!body?.workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }

  const { workspaceId, ...payload } = body;

  try {
    const res = await fetch(`${CREW_API}/api/v1/social/meta/publish/${workspaceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Api-Key': INTERNAL_KEY,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(110_000),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data.detail ?? 'Publish failed' }, { status: res.status });
    }

    // Persist ig_media_id to artifact metadata so Boost Post can use it later
    if (data.post_id && payload.artifactId) {
      const nexusBase = process.env.NEXUS_API_URL ?? 'http://localhost:5050';
      await fetch(`${nexusBase}/api/artifacts/${payload.artifactId}/attach-image`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': workspaceId,
        },
        body: JSON.stringify({ imageUrl: payload.image_url ?? '', contentType: payload.publish_type }),
      }).catch(() => {/* non-fatal */});

      // Also patch ig_media_id directly via a lightweight metadata update
      // We store it in the existing content JSON by appending to the artifact
      try {
        await fetch(`${nexusBase}/api/artifacts/${payload.artifactId}/ig-media`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': workspaceId },
          body: JSON.stringify({ ig_media_id: data.post_id, permalink: data.permalink }),
        });
      } catch { /* non-fatal — ig_media_id stored in response, client can cache */ }
    }

    return NextResponse.json({ ...data, ig_media_id: data.post_id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Publish failed' },
      { status: 500 },
    );
  }
}
