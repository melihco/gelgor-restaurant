import { NextRequest, NextResponse } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

/** BFF — global slot catalog (sectors + definitions). */
export async function GET(req: NextRequest) {
  const sectorId = req.nextUrl.searchParams.get('sector_id');
  if (sectorId) {
    return proxyToCrewBackend(
      `/api/v1/slot-catalog/sectors/${encodeURIComponent(sectorId)}/slots`,
      { method: 'GET' },
    );
  }
  const view = req.nextUrl.searchParams.get('view');
  if (view === 'sectors') {
    return proxyToCrewBackend('/api/v1/slot-catalog/sectors', { method: 'GET' });
  }
  const allQs = sectorId ? `?sector_id=${encodeURIComponent(sectorId)}` : '';
  return proxyToCrewBackend(`/api/v1/slot-catalog/slots${allQs}`, { method: 'GET' });
}
