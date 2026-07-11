/**
 * Readiness probe — verifies critical upstream config is present.
 * Returns 503 while dependencies are not wired (deploy should not receive traffic).
 */
import { NextResponse } from 'next/server';
import { serverConfig } from '@/lib/server-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, { status: string; detail?: string }> = {};
  let ok = true;

  const backend = serverConfig.nexus.baseUrl;
  checks.backend = backend
    ? { status: 'ok' }
    : { status: 'missing', detail: 'NEXUS_API_URL/BACKEND_ORIGIN' };

  const crew = serverConfig.crewBackend.baseUrl;
  checks.crew = crew
    ? { status: 'ok' }
    : { status: 'missing', detail: 'CREW_BACKEND_URL' };

  if (checks.backend.status !== 'ok' || checks.crew.status !== 'ok') {
    ok = false;
  }

  return NextResponse.json(
    {
      status: ok ? 'ok' : 'degraded',
      service: 'smartagency-web',
      check: 'ready',
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: ok ? 200 : 503 },
  );
}
