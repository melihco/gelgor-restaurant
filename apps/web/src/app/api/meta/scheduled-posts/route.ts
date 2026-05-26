import { NextRequest, NextResponse } from 'next/server';
const CREW = process.env.CREW_BACKEND_URL ?? 'http://localhost:8000';
const KEY = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';
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
