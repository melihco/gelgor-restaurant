/**
 * GET /api/creatomate/templates
 *
 * Lists SmartAgency Creatomate templates (seeded via Python).
 * Proxies to Python /api/v1/brand-context/templates/list.
 */
import { NextResponse } from 'next/server';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';

export const runtime = 'nodejs';

export async function GET() {
  const res = await fetchCrewBackendJson<{ templates: unknown[]; seeded: boolean }>(
    '/api/v1/brand-context/templates/list',
  );
  if (!res.ok) {
    return NextResponse.json({ templates: [], seeded: false, error: res.error }, { status: res.status });
  }
  return NextResponse.json(res.data, { status: 200 });
}
