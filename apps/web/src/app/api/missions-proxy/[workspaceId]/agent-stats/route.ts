import { NextRequest, NextResponse } from 'next/server';
import { serverConfig } from '@/lib/server-config';

const PYTHON_BASE = process.env.PYTHON_CREW_BASE_URL || 'http://localhost:8000';
const INTERNAL_KEY = serverConfig.internal.apiKey;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  try {
    const res = await fetch(
      `${PYTHON_BASE}/api/v1/missions/${workspaceId}/agent-stats`,
      {
        headers: { 'X-Internal-Api-Key': INTERNAL_KEY },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) {
      return NextResponse.json({ workspace_id: workspaceId, agent_stats: [] }, { status: 200 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ workspace_id: workspaceId, agent_stats: [] }, { status: 200 });
  }
}
