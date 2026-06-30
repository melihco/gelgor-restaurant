import { NextRequest, NextResponse } from 'next/server';
import { serverConfig } from '@/lib/server-config';
const CREW = serverConfig.crewBackend.baseUrl;
const KEY = serverConfig.internal.apiKey;
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  const ws = req.nextUrl.searchParams.get('workspaceId');
  const res = await fetch(`${CREW}/api/v1/social/schedule/${ws}`, { headers: { 'X-Internal-Api-Key': KEY } });
  return NextResponse.json(await res.json(), { status: res.status });
}
export async function DELETE(req: NextRequest) {
  const { workspaceId, postId } = await req.json().catch(() => ({}));
  const res = await fetch(`${CREW}/api/v1/social/schedule/${workspaceId}/${postId}`, { method: 'DELETE', headers: { 'X-Internal-Api-Key': KEY } });
  return NextResponse.json(await res.json(), { status: res.status });
}
