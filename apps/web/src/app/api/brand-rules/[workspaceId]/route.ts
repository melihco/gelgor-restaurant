import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const status    = req.nextUrl.searchParams.get('status');
  const rule_type = req.nextUrl.searchParams.get('rule_type');
  const qs = new URLSearchParams();
  if (status)    qs.set('status', status);
  if (rule_type) qs.set('rule_type', rule_type);
  const query = qs.toString() ? `?${qs}` : '';
  return proxyToCrewBackend(`/api/v1/brand-rules/${workspaceId}${query}`);
}
