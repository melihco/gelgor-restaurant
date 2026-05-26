import { NextRequest, NextResponse } from 'next/server';
const CREW = process.env.CREW_BACKEND_URL ?? 'http://localhost:8000';
const KEY = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';
async function proxy(method: string, path: string, body?: unknown) {
  const res = await fetch(`${CREW}${path}`, {
    method, headers: { 'Content-Type': 'application/json', 'X-Internal-Api-Key': KEY },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => null);
  return NextResponse.json(data, { status: res.status });
}
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { workspaceId, ...payload } = body ?? {};
  return proxy('POST', `/api/v1/social/schedule/${workspaceId}`, payload);
}
export async function GET(req: NextRequest) {
  const ws = req.nextUrl.searchParams.get('workspaceId');
  return proxy('GET', `/api/v1/social/schedule/${ws}`);
}
