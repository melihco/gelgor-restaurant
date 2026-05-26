/**
 * BFF route — Design Director.
 * Calls GPT-4o directly (3-8s) to produce 3 premium design variants:
 *   IMPACT / EDITORIAL / MINIMAL
 * Each variant has an image_edit_prompt ready for GPT-image-1 images.edit
 * and a canvas_spec fallback for offline Canvas rendering.
 *
 * Much faster than visual_design_cards CrewAI (3s vs 90s).
 */
import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  let body: unknown = {};
  try { body = await req.json(); } catch { /* no body */ }
  return proxyToCrewBackend(
    `/api/v1/brand-context/${workspaceId}/design-director`,
    { method: 'POST', body, timeoutMs: 25_000 },
  );
}
