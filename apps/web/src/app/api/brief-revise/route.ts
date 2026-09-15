/**
 * POST /api/brief-revise
 *
 * "Düzelt" on a "+" (New Brief) card: one owner sentence → one repaint of the
 * same idea in the same look (same photo unless the note asks otherwise).
 * Reads the request snapshot from the source artifact's metadata, caps rounds,
 * then hands off to /api/brief-produce (background). The caller dismisses the
 * source card once the new one is queued.
 */
import { NextRequest, NextResponse } from 'next/server';
import { parseArtifactMetadata } from '@/lib/artifact-utils';
import {
  BRIEF_MAX_REVISION_ROUNDS,
  buildBriefRevisionProduceBody,
  readBriefRequestSnapshot,
  readBriefRevisionRound,
  sanitizeRevisionNote,
} from '@/lib/brief-revision';
import { serverConfig } from '@/lib/server-config';
import { getNextjsInternalOrigin } from '@/lib/runtime-config';
import { assertWorkspaceMatchesRequestTenant } from '@/lib/tenant-production-guard';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { workspaceId?: string; artifactId?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const workspaceId = String(body.workspaceId ?? '').trim();
  const artifactId = String(body.artifactId ?? '').trim();
  const note = sanitizeRevisionNote(body.note);
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  if (!artifactId) return NextResponse.json({ error: 'artifactId required' }, { status: 400 });
  if (!note) return NextResponse.json({ error: 'Düzeltme notu boş olamaz', code: 'note_required' }, { status: 400 });

  const tenantGuard = assertWorkspaceMatchesRequestTenant(req, workspaceId);
  if (tenantGuard) return tenantGuard;

  const NEXUS_API = serverConfig.nexus.baseUrl;
  const INTERNAL_KEY = serverConfig.internal.apiKey;
  const artRes = await fetch(`${NEXUS_API}/api/artifacts/${artifactId}`, {
    headers: { 'X-Tenant-Id': workspaceId, 'X-Internal-Api-Key': INTERNAL_KEY },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!artRes || !artRes.ok) {
    return NextResponse.json({ error: 'artifact_not_found' }, { status: 404 });
  }
  const artifact = await artRes.json() as Record<string, unknown>;
  const meta = parseArtifactMetadata(artifact.metadata);

  if (meta.source !== 'new_brief' || !readBriefRequestSnapshot(meta)) {
    return NextResponse.json(
      { error: 'Bu kart "+" ile üretilmedi ya da düzeltme bilgisi yok.', code: 'not_revisable' },
      { status: 422 },
    );
  }
  if (readBriefRevisionRound(meta) >= BRIEF_MAX_REVISION_ROUNDS) {
    return NextResponse.json(
      {
        error: `Bu kart için düzeltme hakkı doldu (${BRIEF_MAX_REVISION_ROUNDS} tur). Yeni bir istek açın.`,
        code: 'revision_rounds_exhausted',
        maxRounds: BRIEF_MAX_REVISION_ROUNDS,
      },
      { status: 409 },
    );
  }

  const produceBody = buildBriefRevisionProduceBody({ workspaceId, artifactId, metadata: meta, note });
  if (!produceBody) {
    return NextResponse.json({ error: 'Düzeltme isteği kurulamadı', code: 'not_revisable' }, { status: 422 });
  }

  const officeId = req.headers.get('X-Office-Id') || '';
  const res = await fetch(`${getNextjsInternalOrigin()}/api/brief-produce`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Api-Key': INTERNAL_KEY,
      'X-Tenant-Id': workspaceId,
      ...(officeId ? { 'X-Office-Id': officeId } : {}),
    },
    body: JSON.stringify(produceBody),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok || !data.jobId) {
    return NextResponse.json(
      { error: String(data.error ?? 'Düzeltme kuyruğa alınamadı') },
      { status: res.ok ? 502 : res.status },
    );
  }

  return NextResponse.json({
    ok: true,
    queued: true,
    jobId: data.jobId,
    round: produceBody.revision.round,
    maxRounds: BRIEF_MAX_REVISION_ROUNDS,
    outputType: produceBody.outputType,
    expectedArtifacts: Number(data.expectedArtifacts ?? 1) || 1,
    title: produceBody.title,
  }, { status: 202 });
}
