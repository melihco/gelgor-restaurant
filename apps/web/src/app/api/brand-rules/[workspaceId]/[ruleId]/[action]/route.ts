/**
 * Catch-all for brand rule actions:
 *   PUT /api/brand-rules/{ws}/{ruleId}/approve
 *   PUT /api/brand-rules/{ws}/{ruleId}/reject
 *   DELETE /api/brand-rules/{ws}/{ruleId}  (handled by [ruleId]/route.ts)
 */
import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; ruleId: string; action: string }> },
) {
  const { workspaceId, ruleId, action } = await params;
  let body: unknown = {};
  try { body = await req.json(); } catch { /* no body */ }
  return proxyToCrewBackend(
    `/api/v1/brand-rules/${workspaceId}/${ruleId}/${action}`,
    { method: 'PUT', body, timeoutMs: 10_000 },
  );
}
