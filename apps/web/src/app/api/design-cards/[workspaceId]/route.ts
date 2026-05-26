/**
 * BFF route — triggers visual_design_cards agent for a workspace.
 * Returns 3 design card specs, each with a complete image_generation_prompt
 * that can be fed into /api/generate-instagram-image with designCardPrompt.
 *
 * Used by MissionContentFactory "Ajans Tasarımı" button.
 */
import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';
export const maxDuration = 120;  // design agent takes up to 90s

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  let body: unknown = {};
  try { body = await req.json(); } catch { /* no body */ }
  return proxyToCrewBackend(
    `/api/v1/brand-context/${workspaceId}/design-cards`,
    { method: 'POST', body, timeoutMs: 110_000 },
  );
}
